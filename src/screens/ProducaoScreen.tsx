import React, { useState, useMemo } from 'react';
import { 
  Order, 
  Product, 
  StoreUnit, 
  Category, 
  OrderStatus, 
  ProductionOrder, 
  ProductionShift, 
  ProductionStatus 
} from '../types';
import { ChefHat, Calendar, Clock, Download, ArrowRight, ChevronLeft, ChevronRight, ChevronDown, Plus, X, Save, Trash2, Edit3, Printer, LayoutGrid, Table as TableIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PrintReportHeader } from '../components/PrintReportHeader';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import { isReplenishmentOrder } from '../utils/orderStatusStyles';

interface ProducaoScreenProps {
  orders: Order[];
  products: Product[];
  units: StoreUnit[];
  categories: Category[];
  productionOrders: ProductionOrder[];
  onSaveProductionOrder: (po: ProductionOrder) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
}

interface ConsolidatedProductionItem {
  key: string; // YYYY-MM-DD|TURNO|produtoId
  dataProducao: string;
  turno: ProductionShift;
  produtoId: string;
  sku: string;
  descricao: string;
  categoriaNome: string;
  unidadeMedida: string;
  quantidadeTotal: number;
  pedidosVinculados: Order[];
  lojasDestino: string[];
  status: ProductionStatus;
}

function getShiftFromDate(isoDate: string): ProductionShift {
  const d = new Date(isoDate);
  const hour = d.getHours();
  if (hour < 12) return 'MANHA';
  if (hour < 18) return 'TARDE';
  return 'NOITE';
}

function getLocalDateKey(isoDate: string): string {
  const d = new Date(isoDate);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const ProducaoScreen: React.FC<ProducaoScreenProps> = ({
  orders,
  products,
  units,
  categories,
  productionOrders,
  onSaveProductionOrder,
  onUpdateOrderStatus
}) => {
  const [selectedDateFilter, setSelectedDateFilter] = useState<'TODAS' | 'HOJE' | 'AMANHA'>('TODAS');
  const [selectedShift, setSelectedShift] = useState<'TODOS' | ProductionShift>('TODOS');
  const [sortBy, setSortBy] = useState<'DATA_TURNO_ASC' | 'DATA_TURNO_DESC' | 'QTD_DESC' | 'PRODUTO_ASC'>('DATA_TURNO_ASC');
  const [groupBy, setGroupBy] = useState<'NENHUM' | 'TURNO_DATA' | 'PRODUTO'>('TURNO_DATA');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'CARDS' : 'TABLE'
  );

  // Manual / Advance Production Order Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDate, setManualDate] = useState<string>(() => getLocalDateKey(new Date().toISOString()));
  const [manualShift, setManualShift] = useState<ProductionShift>('TARDE');
  const [manualUnitId, setManualUnitId] = useState<string>(units[0]?.id || 'u-central');
  const [manualObs, setManualObs] = useState<string>('');
  const [manualProdId, setManualProdId] = useState<string>(products[0]?.id || '');
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualItems, setManualItems] = useState<{ produtoId: string; quantidade: number }[]>([]);

  const todayKey = useMemo(() => getLocalDateKey(new Date().toISOString()), []);
  const tomorrowKey = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return getLocalDateKey(t.toISOString());
  }, []);

  const prodMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c.nome])), [categories]);
  const unitMap = useMemo(() => new Map(units.map(u => [u.id, u.nome])), [units]);
  const centralUnitId = useMemo(
    () => units.find(u => u.tipo === 'CENTRAL')?.id || units[0]?.id || 'u-central',
    [units]
  );

  // Build lookup of persisted status per (dataProducao + turno + produtoId)
  const persistedStatusMap = useMemo(() => {
    const map = new Map<string, ProductionStatus>();
    productionOrders.forEach(po => {
      if (po.itemStatuses) {
        Object.entries(po.itemStatuses).forEach(([prodId, st]) => {
          map.set(`${po.dataProducao}|${po.turno}|${prodId}`, st);
        });
      }
    });
    return map;
  }, [productionOrders]);

  // Confirmed/active production orders (exclude PENDENTE, CANCELADO, ENTREGUE)
  const activeOrders = useMemo(
    () =>
      orders.filter(
        o => o.status !== 'PENDENTE' && o.status !== 'CANCELADO' && o.status !== 'ENTREGUE'
      ),
    [orders]
  );

  // Consolidate demand grouped by (Date + Shift + Product)
  const allConsolidatedItems = useMemo(() => {
    const consolidatedMap = new Map<string, ConsolidatedProductionItem>();

    activeOrders.forEach(order => {
      const dateKey = getLocalDateKey(order.dataHoraEntrega);
      const shift = getShiftFromDate(order.dataHoraEntrega);
      const storeName = unitMap.get(order.unidadeOrigemId) || 'Loja';

      order.itens.forEach(item => {
        const prod = prodMap.get(item.produtoId);
        if (!prod) return;

        const key = `${dateKey}|${shift}|${item.produtoId}`;
        const existing = consolidatedMap.get(key);
        const persistedStatus = persistedStatusMap.get(key) || (order.status === 'PRONTO' ? 'CONCLUIDA' : 'PLANEJADA');

        if (existing) {
          existing.quantidadeTotal += item.quantidade;
          if (!existing.pedidosVinculados.some(o => o.id === order.id)) {
            existing.pedidosVinculados.push(order);
          }
          if (!existing.lojasDestino.includes(storeName)) {
            existing.lojasDestino.push(storeName);
          }
        } else {
          consolidatedMap.set(key, {
            key,
            dataProducao: dateKey,
            turno: shift,
            produtoId: item.produtoId,
            sku: prod.sku,
            descricao: prod.descricao,
            categoriaNome: catMap.get(prod.categoriaId) || 'Sobremesas',
            unidadeMedida: prod.unidade,
            quantidadeTotal: item.quantidade,
            pedidosVinculados: [order],
            lojasDestino: [storeName],
            status: persistedStatus
          });
        }
      });
    });

    // Include manual/advance production orders
    productionOrders
      .filter(po => po.codigoOrdem.startsWith('OP-MANUAL-'))
      .forEach(po => {
        const destName = (unitMap.get(po.unidadeId) || 'Central') + ' (Manual/Antec.)';
        po.itens.forEach(item => {
          const prod = prodMap.get(item.produtoId);
          if (!prod) return;

          const key = `${po.dataProducao}|${po.turno}|${item.produtoId}`;
          const existing = consolidatedMap.get(key);
          const persistedStatus =
            persistedStatusMap.get(key) ||
            po.itemStatuses?.[item.produtoId] ||
            po.status ||
            'PLANEJADA';

          if (existing) {
            existing.quantidadeTotal += item.quantidadePlanejada;
            if (!existing.lojasDestino.includes(destName)) {
              existing.lojasDestino.push(destName);
            }
          } else {
            consolidatedMap.set(key, {
              key,
              dataProducao: po.dataProducao,
              turno: po.turno,
              produtoId: item.produtoId,
              sku: prod.sku,
              descricao: prod.descricao,
              categoriaNome: catMap.get(prod.categoriaId) || 'Sobremesas',
              unidadeMedida: prod.unidade,
              quantidadeTotal: item.quantidadePlanejada,
              pedidosVinculados: [],
              lojasDestino: [destName],
              status: persistedStatus
            });
          }
        });
      });

    return Array.from(consolidatedMap.values());
  }, [activeOrders, productionOrders, prodMap, catMap, unitMap, persistedStatusMap]);

  // Apply Date, Shift Filters and Sort
  const productionList = useMemo(() => {
    const shiftOrder: Record<ProductionShift, number> = { MANHA: 0, TARDE: 1, NOITE: 2 };
    return allConsolidatedItems
      .filter(item => {
        const matchesShift = selectedShift === 'TODOS' || item.turno === selectedShift;
        const matchesDate =
          selectedDateFilter === 'TODAS' ||
          (selectedDateFilter === 'HOJE' && item.dataProducao === todayKey) ||
          (selectedDateFilter === 'AMANHA' && item.dataProducao === tomorrowKey);
        return matchesShift && matchesDate;
      })
      .sort((a, b) => {
        if (sortBy === 'DATA_TURNO_ASC') {
          const cmpDate = a.dataProducao.localeCompare(b.dataProducao);
          if (cmpDate !== 0) return cmpDate;
          return shiftOrder[a.turno] - shiftOrder[b.turno];
        }
        if (sortBy === 'DATA_TURNO_DESC') {
          const cmpDate = b.dataProducao.localeCompare(a.dataProducao);
          if (cmpDate !== 0) return cmpDate;
          return shiftOrder[b.turno] - shiftOrder[a.turno];
        }
        if (sortBy === 'QTD_DESC') {
          return b.quantidadeTotal - a.quantidadeTotal;
        }
        return a.descricao.localeCompare(b.descricao, 'pt-BR');
      });
  }, [allConsolidatedItems, selectedShift, selectedDateFilter, sortBy, todayKey, tomorrowKey]);

  const [editingItem, setEditingItem] = useState<ConsolidatedProductionItem | null>(null);
  const [editForm, setEditForm] = useState<{
    dataProducao: string;
    turno: ProductionShift;
    status: ProductionStatus;
    quantidadeTotal: number;
    observacoes: string;
  }>({
    dataProducao: '',
    turno: 'MANHA',
    status: 'PLANEJADA',
    quantidadeTotal: 1,
    observacoes: ''
  });

  const openEditModal = (item: ConsolidatedProductionItem) => {
    const matchingPO = productionOrders.find(
      po =>
        po.dataProducao === item.dataProducao &&
        po.turno === item.turno &&
        (po.itens.some(i => i.produtoId === item.produtoId) || po.codigoOrdem === `OP-${item.dataProducao.replace(/-/g, '')}-${item.turno}`)
    );
    setEditingItem(item);
    setEditForm({
      dataProducao: item.dataProducao,
      turno: item.turno,
      status: item.status,
      quantidadeTotal: item.quantidadeTotal,
      observacoes: matchingPO?.observacoes || ''
    });
  };

  const handleSaveEditModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const matchingManualOrders = productionOrders.filter(
      po =>
        po.codigoOrdem.startsWith('OP-MANUAL-') &&
        po.dataProducao === editingItem.dataProducao &&
        po.turno === editingItem.turno &&
        po.itens.some(i => i.produtoId === editingItem.produtoId)
    );

    if (matchingManualOrders.length > 0) {
      matchingManualOrders.forEach((po, idx) => {
        const nextItemStatuses = { ...(po.itemStatuses || {}), [editingItem.produtoId]: editForm.status };
        const updatedItens = po.itens.map(it =>
          it.produtoId === editingItem.produtoId
            ? {
                ...it,
                quantidadePlanejada: idx === 0 ? editForm.quantidadeTotal : it.quantidadePlanejada,
                quantidadeProduzida: editForm.status === 'CONCLUIDA' ? (idx === 0 ? editForm.quantidadeTotal : it.quantidadePlanejada) : 0
              }
            : it
        );
        const allDone = updatedItens.every(it => nextItemStatuses[it.produtoId] === 'CONCLUIDA');
        const anyProg = updatedItens.some(it => ['EM_PREPARO', 'CONCLUIDA'].includes(nextItemStatuses[it.produtoId] || ''));
        onSaveProductionOrder({
          ...po,
          dataProducao: editForm.dataProducao,
          turno: editForm.turno,
          observacoes: editForm.observacoes,
          status: allDone ? 'CONCLUIDA' : anyProg ? 'EM_PREPARO' : 'PLANEJADA',
          itemStatuses: nextItemStatuses,
          itens: updatedItens
        });
      });
    } else {
      const codigoOrdem = `OP-${editForm.dataProducao.replace(/-/g, '')}-${editForm.turno}`;
      const existingPO = productionOrders.find(
        po => po.codigoOrdem === codigoOrdem || (!po.codigoOrdem.startsWith('OP-MANUAL-') && po.dataProducao === editForm.dataProducao && po.turno === editForm.turno)
      );
      const nextItemStatuses: Record<string, ProductionStatus> = {
        ...(existingPO?.itemStatuses || {}),
        [editingItem.produtoId]: editForm.status
      };
      const itemsInBatch = allConsolidatedItems.filter(
        i => i.dataProducao === editingItem.dataProducao && i.turno === editingItem.turno
      );
      const updatedItens = itemsInBatch.map(i => {
        const isTarget = i.produtoId === editingItem.produtoId;
        const qty = isTarget ? editForm.quantidadeTotal : i.quantidadeTotal;
        const st = isTarget ? editForm.status : nextItemStatuses[i.produtoId] || i.status;
        return {
          produtoId: i.produtoId,
          quantidadePlanejada: qty,
          quantidadeProduzida: st === 'CONCLUIDA' ? qty : 0
        };
      });
      if (!updatedItens.some(i => i.produtoId === editingItem.produtoId)) {
        updatedItens.push({
          produtoId: editingItem.produtoId,
          quantidadePlanejada: editForm.quantidadeTotal,
          quantidadeProduzida: editForm.status === 'CONCLUIDA' ? editForm.quantidadeTotal : 0
        });
      }
      onSaveProductionOrder({
        id: existingPO?.id || `op-${Date.now()}`,
        codigoOrdem: existingPO?.codigoOrdem || codigoOrdem,
        dataProducao: editForm.dataProducao,
        turno: editForm.turno,
        status: editForm.status,
        unidadeId: centralUnitId,
        observacoes: editForm.observacoes || existingPO?.observacoes || `Lote consolidado ${editForm.turno} (${editForm.dataProducao})`,
        itemStatuses: nextItemStatuses,
        itens: updatedItens
      });
    }

    setEditingItem(null);
  };

  const STAGE_FLOW: ProductionStatus[] = ['PLANEJADA', 'EM_PREPARO', 'CONCLUIDA'];

  const handleChangeStage = (targetItem: ConsolidatedProductionItem, nextStatus: ProductionStatus) => {
    if (targetItem.status === nextStatus) return;

    // 1. Update any matching OP-MANUAL orders for (dataProducao + turno + produtoId)
    const matchingManualOrders = productionOrders.filter(
      po =>
        po.codigoOrdem.startsWith('OP-MANUAL-') &&
        po.dataProducao === targetItem.dataProducao &&
        po.turno === targetItem.turno &&
        po.itens.some(i => i.produtoId === targetItem.produtoId)
    );

    matchingManualOrders.forEach(po => {
      const manualStatuses: Record<string, ProductionStatus> = {
        ...(po.itemStatuses || {}),
        [targetItem.produtoId]: nextStatus
      };
      const updatedItens = po.itens.map(it =>
        it.produtoId === targetItem.produtoId
          ? { ...it, quantidadeProduzida: nextStatus === 'CONCLUIDA' ? it.quantidadePlanejada : 0 }
          : it
      );
      const allDone = updatedItens.every(it => manualStatuses[it.produtoId] === 'CONCLUIDA');
      const anyProg = updatedItens.some(it => ['EM_PREPARO', 'CONCLUIDA'].includes(manualStatuses[it.produtoId] || ''));
      onSaveProductionOrder({
        ...po,
        status: allDone ? 'CONCLUIDA' : anyProg ? 'EM_PREPARO' : 'PLANEJADA',
        itemStatuses: manualStatuses,
        itens: updatedItens
      });
    });

    // 2. Update/Create consolidated ProductionOrder for (dataProducao + turno)
    const codigoOrdem = `OP-${targetItem.dataProducao.replace(/-/g, '')}-${targetItem.turno}`;
    const existingPO = productionOrders.find(
      po =>
        po.codigoOrdem === codigoOrdem ||
        (!po.codigoOrdem.startsWith('OP-MANUAL-') && po.dataProducao === targetItem.dataProducao && po.turno === targetItem.turno)
    );

    const itemsInBatch = allConsolidatedItems.filter(
      i => i.dataProducao === targetItem.dataProducao && i.turno === targetItem.turno
    );

    const nextItemStatuses: Record<string, ProductionStatus> = {
      ...(existingPO?.itemStatuses || {})
    };
    nextItemStatuses[targetItem.produtoId] = nextStatus;

    const allBatchDone = itemsInBatch.every(
      i => (i.produtoId === targetItem.produtoId ? nextStatus : nextItemStatuses[i.produtoId] || i.status) === 'CONCLUIDA'
    );
    const anyInProgress = itemsInBatch.some(i => {
      const st = i.produtoId === targetItem.produtoId ? nextStatus : nextItemStatuses[i.produtoId] || i.status;
      return st === 'EM_PREPARO' || st === 'CONCLUIDA';
    });

    const batchStatus: ProductionStatus = allBatchDone
      ? 'CONCLUIDA'
      : anyInProgress
      ? 'EM_PREPARO'
      : 'PLANEJADA';

    if (existingPO || targetItem.pedidosVinculados.length > 0 || matchingManualOrders.length === 0) {
      const updatedPO: ProductionOrder = {
        id: existingPO?.id || `op-${Date.now()}`,
        codigoOrdem: existingPO?.codigoOrdem || codigoOrdem,
        dataProducao: targetItem.dataProducao,
        turno: targetItem.turno,
        status: batchStatus,
        unidadeId: centralUnitId,
        observacoes: existingPO?.observacoes || `Lote consolidado ${targetItem.turno} (${targetItem.dataProducao})`,
        itemStatuses: nextItemStatuses,
        itens: itemsInBatch.map(i => {
          const st = i.produtoId === targetItem.produtoId ? nextStatus : nextItemStatuses[i.produtoId] || i.status;
          return {
            produtoId: i.produtoId,
            quantidadePlanejada: i.quantidadeTotal,
            quantidadeProduzida: st === 'CONCLUIDA' ? i.quantidadeTotal : 0
          };
        })
      };

      onSaveProductionOrder(updatedPO);
    }

    // 2. Smart Order Status Sync
    if (targetItem.status === 'CONCLUIDA' && nextStatus !== 'CONCLUIDA') {
      targetItem.pedidosVinculados.forEach(ord => {
        if (ord.status === 'PRONTO') {
          onUpdateOrderStatus(ord.id, 'EM_PRODUCAO');
        }
      });
    } else if (nextStatus === 'EM_PREPARO') {
      targetItem.pedidosVinculados.forEach(ord => {
        if (ord.status === 'PENDENTE' || ord.status === 'CONFIRMADO') {
          onUpdateOrderStatus(ord.id, 'EM_PRODUCAO');
        }
      });
    } else if (nextStatus === 'CONCLUIDA') {
      targetItem.pedidosVinculados.forEach(ord => {
        const ordDate = getLocalDateKey(ord.dataHoraEntrega);
        const ordShift = getShiftFromDate(ord.dataHoraEntrega);

        // Check if ALL items of this order are CONCLUIDA
        const allOrderItemsDone = ord.itens.every(orderItem => {
          if (orderItem.produtoId === targetItem.produtoId) return true;
          const st = nextItemStatuses[orderItem.produtoId] || persistedStatusMap.get(`${ordDate}|${ordShift}|${orderItem.produtoId}`);
          return st === 'CONCLUIDA';
        });

        if (allOrderItemsDone && ord.status !== 'PRONTO' && ord.status !== 'EM_ROTA') {
          onUpdateOrderStatus(ord.id, 'PRONTO');
        } else if (ord.status === 'PENDENTE' || ord.status === 'CONFIRMADO') {
          onUpdateOrderStatus(ord.id, 'EM_PRODUCAO');
        }
      });
    }
  };

  const handleAdvanceStatus = (targetItem: ConsolidatedProductionItem) => {
    const idx = STAGE_FLOW.indexOf(targetItem.status);
    const nextStatus = STAGE_FLOW[(idx + 1) % STAGE_FLOW.length];
    handleChangeStage(targetItem, nextStatus);
  };

  const handleAddManualItem = () => {
    if (!manualProdId || manualQty <= 0) return;
    setManualItems(prev => {
      const exists = prev.find(i => i.produtoId === manualProdId);
      if (exists) {
        return prev.map(i => (i.produtoId === manualProdId ? { ...i, quantidade: i.quantidade + manualQty } : i));
      }
      return [...prev, { produtoId: manualProdId, quantidade: manualQty }];
    });
  };

  const handleSaveManualOrder = (e: React.FormEvent) => {
    e.preventDefault();
    let finalItems = [...manualItems];
    if (finalItems.length === 0 && manualProdId && manualQty > 0) {
      finalItems = [{ produtoId: manualProdId, quantidade: manualQty }];
    }
    if (finalItems.length === 0) {
      alert('Adicione pelo menos um produto à ordem de produção.');
      return;
    }

    const itemStatuses: Record<string, ProductionStatus> = {};
    finalItems.forEach(i => {
      itemStatuses[i.produtoId] = 'PLANEJADA';
    });

    const newPO: ProductionOrder = {
      id: `op-${Date.now()}`,
      codigoOrdem: `OP-MANUAL-${manualDate.replace(/-/g, '')}-${manualShift}-${Math.floor(100 + Math.random() * 900)}`,
      dataProducao: manualDate,
      turno: manualShift,
      status: 'PLANEJADA',
      unidadeId: manualUnitId || centralUnitId,
      observacoes: manualObs || 'Produção manual / antecipada',
      itemStatuses,
      itens: finalItems.map(i => ({
        produtoId: i.produtoId,
        quantidadePlanejada: i.quantidade,
        quantidadeProduzida: 0
      }))
    };

    onSaveProductionOrder(newPO);
    setManualItems([]);
    setManualObs('');
    setIsManualModalOpen(false);
  };

  const handleExportProductionPlan = () => {
    const rows = productionList.map(item => ({
      'Data Produção': item.dataProducao,
      'Turno': item.turno,
      'SKU': item.sku,
      'Produto / Receita': item.descricao,
      'Categoria': item.categoriaNome,
      'Qtd Consolidada': item.quantidadeTotal,
      'Unidade': item.unidadeMedida,
      'Lojas Destino': item.lojasDestino.join(', '),
      'Pedidos Vinculados': item.pedidosVinculados.map(o => o.numeroPedido).join(', '),
      'Status Cozinha': item.status
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 40 }, { wch: 20 },
      { wch: 15 }, { wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Ordem de Producao');
    XLSX.writeFile(wb, `Ordem_Producao_Beju_Caramelos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const statusConfig: Record<ProductionStatus, { label: string; color: string }> = {
    PLANEJADA: { label: 'Planejada', color: 'bg-slate-100 text-slate-700 border-slate-300' },
    EM_PREPARO: { label: 'Em Preparo', color: 'bg-amber-100 text-amber-800 border-amber-300' },
    CONCLUIDA: { label: 'Concluída', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
  };

  const renderStageControl = (item: ConsolidatedProductionItem) => {
    const idx = STAGE_FLOW.indexOf(item.status);
    const prevStage = idx > 0 ? STAGE_FLOW[idx - 1] : null;
    const nextStage = idx >= 0 && idx < STAGE_FLOW.length - 1 ? STAGE_FLOW[idx + 1] : null;
    const stInfo = statusConfig[item.status];

    return (
      <div className="inline-flex items-center gap-0.5 print:hidden">
        <button
          type="button"
          disabled={!prevStage}
          onClick={() => prevStage && handleChangeStage(item, prevStage)}
          title={prevStage ? `Voltar para ${statusConfig[prevStage].label}` : 'Primeiro estágio'}
          className="p-0.5 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <select
          value={item.status}
          onChange={(e) => handleChangeStage(item, e.target.value as ProductionStatus)}
          aria-label={`Estágio da cozinha para ${item.descricao}`}
          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer focus:outline-none ${stInfo.color}`}
        >
          {STAGE_FLOW.map(st => (
            <option key={st} value={st} className="bg-white text-slate-900">
              {statusConfig[st].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!nextStage}
          onClick={() => nextStage && handleChangeStage(item, nextStage)}
          title={nextStage ? `Avançar para ${statusConfig[nextStage].label}` : 'Último estágio'}
          className="p-0.5 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const shiftLabels: Record<ProductionShift, string> = {
    MANHA: 'Manhã (até 11h59)',
    TARDE: 'Tarde (12h–17h59)',
    NOITE: 'Noite (18h+)'
  };

  const totalUnitsToProduce = productionList.reduce((acc, i) => acc + i.quantidadeTotal, 0);
  const doneCount = productionList.filter(i => i.status === 'CONCLUIDA').length;

  const groupedProduction = useMemo(() => {
    if (groupBy === 'NENHUM') {
      return [{ key: 'ALL', label: '', totalQty: totalUnitsToProduce, items: productionList }];
    }
    const map = new Map<string, { key: string; label: string; totalQty: number; items: ConsolidatedProductionItem[] }>();
    productionList.forEach(item => {
      const key =
        groupBy === 'TURNO_DATA'
          ? `${item.dataProducao}|${item.turno}`
          : item.produtoId;
      const label =
        groupBy === 'TURNO_DATA'
          ? `${item.dataProducao.split('-').reverse().join('/')} — Turno ${item.turno}`
          : `${item.descricao} (${item.sku})`;
      const cur = map.get(key) || { key, label, totalQty: 0, items: [] };
      cur.totalQty += item.quantidadeTotal;
      cur.items.push(item);
      map.set(key, cur);
    });
    const shiftOrder: Record<string, number> = { MANHA: 1, TARDE: 2, NOITE: 3 };
    return Array.from(map.values()).sort((a, b) => {
      if (groupBy === 'TURNO_DATA') {
        const dateCmp = (a.items[0]?.dataProducao || '').localeCompare(b.items[0]?.dataProducao || '');
        if (dateCmp !== 0) return dateCmp;
        const shiftCmp = (shiftOrder[a.items[0]?.turno || ''] ?? 99) - (shiftOrder[b.items[0]?.turno || ''] ?? 99);
        if (shiftCmp !== 0) return shiftCmp;
      }
      return a.label.localeCompare(b.label, 'pt-BR');
    });
  }, [productionList, groupBy, totalUnitsToProduce]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex items-center gap-2">
            <span>Produção</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
              {totalUnitsToProduce} itens na fila
            </span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {doneCount}/{productionList.length} lotes prontos
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportProductionPlan}
            className="hidden md:flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors shadow-xs"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Exportar (.xlsx)</span>
          </button>

          <button
            onClick={() => {
              setManualDate(todayKey);
              setManualUnitId(units.find(u => u.ativo)?.id || centralUnitId);
              setManualProdId(products.find(p => p.ativo)?.id || products[0]?.id || '');
              setManualQty(1);
              setManualItems([]);
              setManualObs('');
              setIsManualModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Produção</span>
          </button>

          <button
            onClick={() => window.print()}
            title="Imprimir"
            aria-label="Imprimir"
            className="hidden md:flex items-center justify-center p-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Date & Shift Hybrid Filter + Sort Bar */}
      <div className="px-6 py-3 bg-white/70 border-b border-[#e2e8f0] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'CARDS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'TABLE' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabela</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs text-slate-500 font-semibold">Data:</span>
            <select
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value as 'TODAS' | 'HOJE' | 'AMANHA')}
              className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="TODAS">Todas as Datas</option>
              <option value="HOJE">Hoje</option>
              <option value="AMANHA">Amanhã</option>
            </select>
          </div>

          <HybridFilterSort
            filterLabel="Turno:"
            filterValue={selectedShift}
            onFilterChange={(v) => setSelectedShift(v as 'TODOS' | ProductionShift)}
            filterOptions={[
              { value: 'TODOS', label: 'Todos os Turnos' },
              { value: 'MANHA', label: 'Manhã' },
              { value: 'TARDE', label: 'Tarde' },
              { value: 'NOITE', label: 'Noite' }
            ]}
            sortValue={sortBy}
            onSortChange={(v) => setSortBy(v as 'DATA_TURNO_ASC' | 'DATA_TURNO_DESC' | 'QTD_DESC' | 'PRODUTO_ASC')}
            sortOptions={[
              { value: 'DATA_TURNO_ASC', label: 'Data/Turno ↑' },
              { value: 'DATA_TURNO_DESC', label: 'Data/Turno ↓' },
              { value: 'QTD_DESC', label: 'Maior Quantidade' },
              { value: 'PRODUTO_ASC', label: 'Produto (A-Z)' }
            ]}
            groupValue={groupBy}
            onGroupChange={(v) => setGroupBy(v as 'NENHUM' | 'TURNO_DATA' | 'PRODUTO')}
            groupOptions={[
              { value: 'TURNO_DATA', label: 'Turno / Data' },
              { value: 'PRODUTO', label: 'Produto' },
              { value: 'NENHUM', label: 'Sem Agrupamento' }
            ]}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div
          id="print-report-area"
          className={
            viewMode === 'TABLE'
              ? 'bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-hidden'
              : 'hidden print:block bg-white'
          }
        >
          <PrintReportHeader
            title="Produção"
            badge="Produção"
            subtitle={
              groupBy === 'TURNO_DATA'
                ? `Agrupado por Turno / Data • ${productionList.length} lote(s)`
                : groupBy === 'PRODUTO'
                ? `Agrupado por Produto • ${productionList.length} lote(s)`
                : `${productionList.length} lote(s)`
            }
          />
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-mono uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 font-semibold">Turno / Data</th>
                <th className="py-3 px-4 font-semibold">Produto & SKU</th>
                <th className="py-3 px-4 font-semibold">Categoria</th>
                <th className="py-3 px-4 font-semibold text-center">Quantidade Total</th>
                <th className="py-3 px-4 font-semibold">Distribuição (Lojas)</th>
                <th className="py-3 px-4 font-semibold">Pedidos Origem</th>
                <th className="py-3 px-4 font-semibold text-center">Estágio Cozinha</th>
                <th className="py-3 px-4 font-semibold text-right print:hidden">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {productionList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <ChefHat className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p>Nenhuma demanda de produção para o filtro selecionado.</p>
                  </td>
                </tr>
              ) : (
                groupedProduction.map(group => {
                  const expanded = isGroupExpanded(group.key, groupBy !== 'NENHUM');
                  return (
                  <React.Fragment key={group.key}>
                    {groupBy !== 'NENHUM' && (
                      <tr
                        onClick={() => toggleGroup(group.key)}
                        className="bg-emerald-50 hover:bg-emerald-100/80 border-y border-emerald-200 cursor-pointer transition-colors"
                      >
                        <td colSpan={8} className="py-2 px-4 font-bold text-slate-800 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5">
                              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              <span>{group.label}</span>
                            </span>
                            <span className="font-mono text-[11px] text-slate-600">
                              {group.items.length} lote(s) • Total: {group.totalQty} un.
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {expanded && group.items.map(item => {
                  const stInfo = statusConfig[item.status];
                  const hasReplenishment = item.pedidosVinculados.some(isReplenishmentOrder);
                  return (
                    <tr
                      key={item.key}
                      className={`transition-colors ${
                        hasReplenishment
                          ? 'bg-sky-50/90 hover:bg-sky-100/70 border-l-4 border-l-sky-500'
                          : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-800 block">
                          {item.turno}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {item.dataProducao.split('-').reverse().join('/')}
                        </span>
                        {hasReplenishment && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-bold uppercase tracking-wider">
                            Reposição
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{item.descricao}</div>
                        <span className="font-mono text-[10px] text-slate-500">{item.sku}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
                          {item.categoriaNome}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="text-sm font-bold font-mono text-brand-700 bg-brand-50 px-3 py-1 rounded-lg border border-brand-200">
                          {item.quantidadeTotal} {item.unidadeMedida}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {item.lojasDestino.map((loja, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium"
                            >
                              {loja}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                        {item.pedidosVinculados.map(o => o.numeroPedido).join(', ')}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {renderStageControl(item)}
                        <span className={`hidden print:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${stInfo.color}`}>
                          {stInfo.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right print:hidden">
                        <button
                          onClick={() => openEditModal(item)}
                          title="Editar"
                          aria-label="Editar"
                          className="inline-flex items-center justify-center p-1.5 text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors shadow-2xs cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {viewMode === 'CARDS' && (
          <div className="space-y-6 print:hidden">
            {productionList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs bg-white border border-slate-200 rounded-xl">
                Nenhuma demanda de produção para o filtro selecionado.
              </div>
            ) : (
              groupedProduction.map(group => {
                const expanded = isGroupExpanded(group.key, groupBy !== 'NENHUM');
                return (
                <div key={group.key} className="space-y-3">
                  {groupBy !== 'NENHUM' && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 hover:bg-slate-200/70 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 cursor-pointer transition-colors"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        <span>{group.label}</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-600">
                        {group.items.length} lote(s) • Total: {group.totalQty} un.
                      </span>
                    </button>
                  )}
                  {expanded && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.items.map(item => {
                      const stInfo = statusConfig[item.status];
                      const hasReplenishment = item.pedidosVinculados.some(isReplenishmentOrder);
                      return (
                        <div
                          key={item.key}
                          className={`border rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3 ${
                            hasReplenishment
                              ? 'bg-sky-50/90 border-sky-400 ring-1 ring-sky-200'
                              : 'bg-white border-[#e2e8f0]'
                          }`}
                        >
                          <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-xs text-slate-900">{item.turno}</span>
                                {hasReplenishment && (
                                  <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-bold uppercase">
                                    Reposição
                                  </span>
                                )}
                              </div>
                              <span className="block text-[10px] font-mono text-slate-500">{item.dataProducao.split('-').reverse().join('/')}</span>
                            </div>
                            {renderStageControl(item)}
                            <span className={`hidden print:inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stInfo.color}`}>
                              {stInfo.label}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="font-bold text-slate-900">{item.descricao}</div>
                            <div className="font-mono text-[10px] text-slate-500">{item.sku} • {item.categoriaNome}</div>
                            <div className="text-sm font-bold font-mono text-brand-700 pt-1">
                              {item.quantidadeTotal} {item.unidadeMedida}
                            </div>
                          </div>
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                            <button
                              onClick={() => openEditModal(item)}
                              title="Editar"
                              aria-label="Editar"
                              className="inline-flex items-center justify-center p-1.5 text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 hover:text-slate-900 rounded-lg cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* MANUAL / ADVANCE PRODUCTION ORDER MODAL */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveManualOrder} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-sans">Registrar Produção Manual / Antecipada</h2>
                <p className="text-[11px] text-slate-500">Agende lotes extras ou antecipados por data e turno</p>
              </div>
              <button type="button" onClick={() => setIsManualModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Data de Produção *</label>
                  <input
                    type="date"
                    required
                    min={todayKey}
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Turno *</label>
                  <select
                    value={manualShift}
                    onChange={(e) => setManualShift(e.target.value as ProductionShift)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-semibold"
                  >
                    <option value="MANHA">Manhã (até 11h59)</option>
                    <option value="TARDE">Tarde (12h–17h59)</option>
                    <option value="NOITE">Noite (18h+)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Unidade / Destino</label>
                <select
                  value={manualUnitId}
                  onChange={(e) => setManualUnitId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-medium"
                >
                  {units.filter(u => u.ativo).map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                <label className="font-semibold text-slate-700 block">Adicionar Produto ao Lote</label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-semibold text-slate-500 block mb-1">Produto</span>
                    <select
                      value={manualProdId}
                      onChange={(e) => setManualProdId(e.target.value)}
                      className="w-full min-w-0 bg-white border border-slate-300 rounded-lg p-2 text-xs truncate"
                    >
                      {products.filter(p => p.ativo).map(p => (
                        <option key={p.id} value={p.id}>{p.sku} — {p.descricao}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-2 shrink-0">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block mb-1">Quantidade</span>
                      <input
                        type="number"
                        min="1"
                        value={manualQty}
                        onChange={(e) => setManualQty(Math.max(1, Number(e.target.value)))}
                        className="w-20 bg-white border border-slate-300 rounded-lg p-2 font-mono text-center font-bold"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddManualItem}
                      className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg whitespace-nowrap"
                    >
                      + Adicionar
                    </button>
                  </div>
                </div>

                {manualItems.length > 0 && (
                  <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
                    {manualItems.map(mi => {
                      const prod = prodMap.get(mi.produtoId);
                      return (
                        <li key={mi.produtoId} className="px-3 py-2 flex items-center justify-between">
                          <span className="font-medium text-slate-800">
                            <strong className="font-mono text-brand-700">{mi.quantidade}x</strong> {prod?.descricao}
                          </span>
                          <button
                            type="button"
                            onClick={() => setManualItems(prev => prev.filter(i => i.produtoId !== mi.produtoId))}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Observações</label>
                <input
                  type="text"
                  value={manualObs}
                  onChange={(e) => setManualObs(e.target.value)}
                  placeholder="Ex: Reposição de vitrine fim de semana..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Registrar Produção</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT PRODUCTION RECORD MODAL */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveEditModal} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-sans">Editar Registro de Produção</h2>
                <p className="text-[11px] text-slate-500">{editingItem.descricao} ({editingItem.sku})</p>
              </div>
              <button type="button" onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Data de Produção</label>
                  <input
                    type="date"
                    required
                    value={editForm.dataProducao}
                    onChange={e => setEditForm({ ...editForm, dataProducao: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Turno</label>
                  <select
                    value={editForm.turno}
                    onChange={e => setEditForm({ ...editForm, turno: e.target.value as ProductionShift })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                  >
                    <option value="MANHA">Manhã</option>
                    <option value="TARDE">Tarde</option>
                    <option value="NOITE">Noite</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Quantidade ({editingItem.unidadeMedida})</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editForm.quantidadeTotal}
                    onChange={e => setEditForm({ ...editForm, quantidadeTotal: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Etapa / Status</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm({ ...editForm, status: e.target.value as ProductionStatus })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-semibold"
                  >
                    <option value="PLANEJADA">Planejada</option>
                    <option value="EM_PREPARO">Em Preparo</option>
                    <option value="CONCLUIDA">Concluída</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Observações</label>
                <input
                  type="text"
                  value={editForm.observacoes}
                  onChange={e => setEditForm({ ...editForm, observacoes: e.target.value })}
                  placeholder="Anotações do lote ou confeiteiro..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
