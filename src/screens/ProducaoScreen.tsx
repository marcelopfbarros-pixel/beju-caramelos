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
import { ChefHat, Clock, Download, ArrowRight, ChevronRight, ChevronDown, Plus, X, Save, Trash2, Printer, LayoutGrid, Table as TableIcon, Search } from 'lucide-react';
import { PrintReportHeader } from '../components/PrintReportHeader';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { ProducaoReportModal } from '../components/ProducaoReportModal';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import { isReplenishmentOrder } from '../utils/orderStatusStyles';
import { canEditProduction, UserRole } from '../utils/permissions';
import type { ConsolidatedProductionItem } from '../utils/producaoReportData';

interface ProducaoScreenProps {
  orders: Order[];
  products: Product[];
  units: StoreUnit[];
  categories: Category[];
  productionOrders: ProductionOrder[];
  userRole?: UserRole;
  onSaveProductionOrder: (po: ProductionOrder) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
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
  userRole = 'ADMIN',
  onSaveProductionOrder,
  onUpdateOrderStatus
}) => {
  const canEdit = canEditProduction(userRole);
  const [selectedDateFilter, setSelectedDateFilter] = useState<'PROXIMOS_7_DIAS' | 'TODAS' | 'HOJE' | 'AMANHA'>('PROXIMOS_7_DIAS');
  const [selectedShift, setSelectedShift] = useState<'TODOS' | ProductionShift>('TODOS');
  const [stageFilter, setStageFilter] = useState<'TODOS' | ProductionStatus>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'DATA_TURNO_ASC' | 'DATA_TURNO_DESC' | 'QTD_DESC' | 'PRODUTO_ASC'>('DATA_TURNO_ASC');
  const [groupBy, setGroupBy] = useState<'NENHUM' | 'TURNO_DATA' | 'PRODUTO' | 'CATEGORIA' | 'LOJA_DESTINO'>('TURNO_DATA');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'CARDS' : 'TABLE'
  );
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

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
  const next7DaysEndKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return getLocalDateKey(d.toISOString());
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

  // Apply Date, Shift, Stage & Search Filters and Sort
  const productionList = useMemo(() => {
    const shiftOrder: Record<ProductionShift, number> = { MANHA: 0, TARDE: 1, NOITE: 2 };
    const term = searchTerm.trim().toLowerCase();
    return allConsolidatedItems
      .filter(item => {
        const matchesShift = selectedShift === 'TODOS' || item.turno === selectedShift;
        const matchesStage = stageFilter === 'TODOS' || item.status === stageFilter;
        const matchesDate =
          selectedDateFilter === 'TODAS' ||
          (selectedDateFilter === 'PROXIMOS_7_DIAS' &&
            item.dataProducao >= todayKey &&
            item.dataProducao <= next7DaysEndKey) ||
          (selectedDateFilter === 'HOJE' && item.dataProducao === todayKey) ||
          (selectedDateFilter === 'AMANHA' && item.dataProducao === tomorrowKey);
        const matchesSearch =
          !term ||
          item.descricao.toLowerCase().includes(term) ||
          item.sku.toLowerCase().includes(term) ||
          item.categoriaNome.toLowerCase().includes(term) ||
          item.lojasDestino.some(l => l.toLowerCase().includes(term)) ||
          item.pedidosVinculados.some(o => o.numeroPedido.toLowerCase().includes(term));
        return matchesShift && matchesStage && matchesDate && matchesSearch;
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
  }, [allConsolidatedItems, selectedShift, stageFilter, selectedDateFilter, searchTerm, sortBy, todayKey, tomorrowKey, next7DaysEndKey]);

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

  const deriveBatchStatus = (statuses: ProductionStatus[]): ProductionStatus => {
    if (statuses.length > 0 && statuses.every(st => st === 'CANCELADA')) {
      return 'CANCELADA';
    }
    if (statuses.length > 0 && statuses.every(st => st === 'CONCLUIDA' || st === 'CANCELADA')) {
      return 'CONCLUIDA';
    }
    if (statuses.some(st => st === 'EM_PREPARO' || st === 'CONCLUIDA')) {
      return 'EM_PREPARO';
    }
    return 'PLANEJADA';
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
        const batchManualStatus = deriveBatchStatus(
          updatedItens.map(it => nextItemStatuses[it.produtoId] || 'PLANEJADA')
        );
        onSaveProductionOrder({
          ...po,
          dataProducao: editForm.dataProducao,
          turno: editForm.turno,
          observacoes: editForm.observacoes,
          status: batchManualStatus,
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
      const batchConsolidatedStatus = deriveBatchStatus(
        updatedItens.map(
          it =>
            it.produtoId === editingItem.produtoId
              ? editForm.status
              : nextItemStatuses[it.produtoId] ||
                itemsInBatch.find(b => b.produtoId === it.produtoId)?.status ||
                'PLANEJADA'
        )
      );
      onSaveProductionOrder({
        id: existingPO?.id || `op-${Date.now()}`,
        codigoOrdem: existingPO?.codigoOrdem || codigoOrdem,
        dataProducao: editForm.dataProducao,
        turno: editForm.turno,
        status: batchConsolidatedStatus,
        unidadeId: centralUnitId,
        observacoes: editForm.observacoes || existingPO?.observacoes || `Lote consolidado ${editForm.turno} (${editForm.dataProducao})`,
        itemStatuses: nextItemStatuses,
        itens: updatedItens
      });
    }

    setEditingItem(null);
  };

  const STAGE_FLOW: ProductionStatus[] = ['PLANEJADA', 'EM_PREPARO', 'CONCLUIDA', 'CANCELADA'];

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
      const manualBatchStatus = deriveBatchStatus(
        updatedItens.map(it => manualStatuses[it.produtoId] || 'PLANEJADA')
      );
      onSaveProductionOrder({
        ...po,
        status: manualBatchStatus,
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

    const batchStatus = deriveBatchStatus(
      itemsInBatch.map(i =>
        i.produtoId === targetItem.produtoId ? nextStatus : nextItemStatuses[i.produtoId] || i.status
      )
    );

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

  const statusConfig: Record<ProductionStatus, { label: string; color: string }> = {
    PLANEJADA: { label: 'Planejada', color: 'bg-slate-100 text-slate-700 border-slate-300' },
    EM_PREPARO: { label: 'Em Preparo', color: 'bg-amber-100 text-amber-800 border-amber-300' },
    CONCLUIDA: { label: 'Concluída', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    CANCELADA: { label: 'Cancelada', color: 'bg-red-100 text-red-800 border-red-300' }
  };

  const STORE_BADGE_PALETTE = [
    'bg-amber-100 text-amber-900 border-amber-300',
    'bg-rose-100 text-rose-900 border-rose-300',
    'bg-indigo-100 text-indigo-900 border-indigo-300',
    'bg-emerald-100 text-emerald-900 border-emerald-300',
    'bg-purple-100 text-purple-900 border-purple-300',
    'bg-cyan-100 text-cyan-900 border-cyan-300',
    'bg-orange-100 text-orange-900 border-orange-300',
    'bg-teal-100 text-teal-900 border-teal-300'
  ];

  const getStoreBadgeClasses = (lojaName: string): string => {
    const baseName = lojaName.replace(/\s*\(Manual\/Antec\.\)$/, '').trim();
    let idx = units.findIndex(u => u.nome === baseName);
    if (idx < 0) {
      idx = Array.from(baseName).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    }
    return STORE_BADGE_PALETTE[idx % STORE_BADGE_PALETTE.length];
  };

  const renderStageControl = (item: ConsolidatedProductionItem) => {
    const stInfo = statusConfig[item.status];

    if (!canEdit) {
      return (
        <span
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border print:hidden ${stInfo.color}`}
        >
          {stInfo.label}
        </span>
      );
    }

    return (
      <div className="inline-flex items-center print:hidden" onClick={(e) => e.stopPropagation()}>
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
      </div>
    );
  };

  const shiftLabels: Record<ProductionShift, string> = {
    MANHA: 'Manhã (até 11h59)',
    TARDE: 'Tarde (12h–17h59)',
    NOITE: 'Noite (18h+)'
  };

  const totalUnitsToProduce = productionList
    .filter(i => i.status !== 'CANCELADA')
    .reduce((acc, i) => acc + i.quantidadeTotal, 0);

  const groupedProduction = useMemo(() => {
    if (groupBy === 'NENHUM') {
      return [{ key: 'ALL', label: '', totalQty: totalUnitsToProduce, items: productionList }];
    }
    const map = new Map<string, { key: string; label: string; totalQty: number; items: ConsolidatedProductionItem[] }>();
    productionList.forEach(item => {
      let key = '';
      let label = '';
      if (groupBy === 'TURNO_DATA') {
        key = `${item.dataProducao}|${item.turno}`;
        label = `${item.dataProducao.split('-').reverse().join('/')} — Turno ${item.turno}`;
      } else if (groupBy === 'PRODUTO') {
        key = item.produtoId;
        label = `${item.descricao} (${item.sku})`;
      } else if (groupBy === 'CATEGORIA') {
        key = item.categoriaNome || 'Sem Categoria';
        label = key;
      } else {
        const destLabel = [...item.lojasDestino].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(' + ') || 'Sem Destino';
        key = destLabel;
        label = destLabel;
      }
      const cur = map.get(key) || { key, label, totalQty: 0, items: [] };
      cur.totalQty += item.status === 'CANCELADA' ? 0 : item.quantidadeTotal;
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

  const hideTurnoData = groupBy === 'TURNO_DATA';
  const hideProduto = groupBy === 'PRODUTO';
  const hideCategoria = groupBy === 'CATEGORIA';
  const hideDestino = groupBy === 'LOJA_DESTINO';
  const visibleColumnCount =
    7 -
    (hideTurnoData ? 1 : 0) -
    (hideProduto ? 1 : 0) -
    (hideCategoria ? 1 : 0) -
    (hideDestino ? 1 : 0);

  const hasActiveFilters =
    selectedDateFilter !== 'PROXIMOS_7_DIAS' ||
    selectedShift !== 'TODOS' ||
    stageFilter !== 'TODOS' ||
    searchTerm.trim() !== '';

  const handleResetFilters = () => {
    setSelectedDateFilter('PROXIMOS_7_DIAS');
    setSelectedShift('TODOS');
    setStageFilter('TODOS');
    setSearchTerm('');
  };

  const activeFilterBadgeText = (() => {
    const dateLabels: Record<string, string> = {
      PROXIMOS_7_DIAS: 'Próximos 7 dias',
      HOJE: 'Hoje',
      AMANHA: 'Amanhã',
      TODAS: 'Todas as Datas',
    };
    const shiftLabels: Record<string, string> = {
      MANHA: 'Manhã',
      TARDE: 'Tarde',
      NOITE: 'Noite',
    };
    const parts = [dateLabels[selectedDateFilter] || selectedDateFilter];
    if (selectedShift !== 'TODOS') {
      parts.push(shiftLabels[selectedShift] || selectedShift);
    }
    if (stageFilter !== 'TODOS') {
      parts.push(statusConfig[stageFilter]?.label || stageFilter);
    }
    if (searchTerm.trim()) {
      parts.push(`Busca: "${searchTerm.trim()}"`);
    }
    return `${totalUnitsToProduce} itens na fila • ${parts.join(' • ')}`;
  })();

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between md:bg-white md:border-b md:border-[#e2e8f0] md:px-6 md:py-4 md:gap-4 print:hidden">
        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2.5 md:p-0 md:bg-transparent md:border-b-0 min-w-0">
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex flex-wrap items-center gap-2 min-w-0">
            <span>Produção</span>
            <span
              className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 max-w-full truncate"
              title={activeFilterBadgeText}
            >
              {activeFilterBadgeText}
            </span>
          </h1>
        </div>

        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 flex flex-wrap items-center gap-2">
          <div className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs shrink-0" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              title="Cards"
              aria-label="Cards"
              className={`h-full flex items-center justify-center px-2 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'CARDS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              title="Tabela"
              aria-label="Tabela"
              className={`h-full flex items-center justify-center px-2 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'TABLE' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            title="Exportar Relatório de Produção (PDF / XLSX)"
            aria-label="Exportar Relatório de Produção (PDF / XLSX)"
            className="flex items-center justify-center h-8 w-8 p-0 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
          </button>

          {canEdit && (
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
              title="Nova Produção"
              aria-label="Nova Produção"
              className="flex items-center justify-center gap-1.5 h-8 w-8 md:w-auto px-0 md:px-3.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Produção</span>
            </button>
          )}

          <button
            onClick={() => window.print()}
            title="Imprimir"
            aria-label="Imprimir"
            className="flex items-center justify-center h-8 w-8 p-0 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Date, Shift, Stage Hybrid Filter + Sort + Search Bar */}
      <div className="shrink-0 min-w-0 flex flex-col md:flex-row md:flex-wrap md:items-center justify-between md:bg-white/70 md:border-b md:border-[#e2e8f0] md:px-4 lg:px-5 md:py-2 md:gap-2 print:hidden">
        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 flex items-center w-full md:w-auto md:max-w-full min-w-0 overflow-hidden">
          <HybridFilterSort
            dateLabel="Data:"
            dateValue={selectedDateFilter}
            onDateChange={(v) => setSelectedDateFilter(v as 'PROXIMOS_7_DIAS' | 'TODAS' | 'HOJE' | 'AMANHA')}
            dateActive={selectedDateFilter !== 'PROXIMOS_7_DIAS'}
            dateOptions={[
              { value: 'PROXIMOS_7_DIAS', label: 'Próximos 7 dias' },
              { value: 'HOJE', label: 'Hoje' },
              { value: 'AMANHA', label: 'Amanhã' },
              { value: 'TODAS', label: 'Todas as Datas' }
            ]}
            filterLabel="Turno:"
            filterValue={selectedShift}
            onFilterChange={(v) => setSelectedShift(v as 'TODOS' | ProductionShift)}
            filterActive={selectedShift !== 'TODOS'}
            filterOptions={[
              { value: 'TODOS', label: 'Todos os Turnos' },
              { value: 'MANHA', label: 'Manhã' },
              { value: 'TARDE', label: 'Tarde' },
              { value: 'NOITE', label: 'Noite' }
            ]}
            secondFilterLabel="Estágio Cozinha:"
            secondFilterValue={stageFilter}
            onSecondFilterChange={(v) => setStageFilter(v as 'TODOS' | ProductionStatus)}
            secondFilterActive={stageFilter !== 'TODOS'}
            secondFilterOptions={[
              { value: 'TODOS', label: 'Todos Estágios' },
              { value: 'PLANEJADA', label: 'Planejada' },
              { value: 'EM_PREPARO', label: 'Em Preparo' },
              { value: 'CONCLUIDA', label: 'Concluída' },
              { value: 'CANCELADA', label: 'Cancelada' }
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
            onGroupChange={(v) => setGroupBy(v as 'NENHUM' | 'TURNO_DATA' | 'PRODUTO' | 'CATEGORIA' | 'LOJA_DESTINO')}
            groupOptions={[
              { value: 'TURNO_DATA', label: 'Turno / Data' },
              { value: 'PRODUTO', label: 'Produto' },
              { value: 'CATEGORIA', label: 'Categoria' },
              { value: 'LOJA_DESTINO', label: 'Loja Destino' },
              { value: 'NENHUM', label: 'Sem Agrupamento' }
            ]}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={handleResetFilters}
          />
        </div>

        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 w-full md:flex-1 md:min-w-[140px] md:max-w-xs">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar produto, SKU, loja ou Nº pedido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-3 py-0 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        className={
          viewMode === 'TABLE'
            ? 'flex-1 min-h-0 min-w-0 flex flex-col p-2.5 sm:p-3 overflow-hidden'
            : 'flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-2.5 sm:p-3'
        }
      >
        <div
          id="print-report-area"
          className={
            viewMode === 'TABLE'
              ? 'bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-auto max-w-full max-h-full min-h-0 print:overflow-visible print:max-h-none'
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
                : groupBy === 'CATEGORIA'
                ? `Agrupado por Categoria • ${productionList.length} lote(s)`
                : groupBy === 'LOJA_DESTINO'
                ? `Agrupado por Loja Destino • ${productionList.length} lote(s)`
                : `${productionList.length} lote(s)`
            }
          />
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50/95 border-b border-slate-200 text-[10px] font-mono uppercase tracking-tight text-slate-500">
              <tr>
                {!hideTurnoData && <th className="py-2 px-2 font-semibold">Turno / Data</th>}
                {!hideProduto && <th className="py-2 px-2 font-semibold">Produto & SKU</th>}
                {!hideCategoria && <th className="py-2 px-2 font-semibold">Categoria</th>}
                <th className="py-2 px-2 font-semibold text-center">Quantidade Total</th>
                {!hideDestino && <th className="py-2 px-2 font-semibold">Destino</th>}
                <th className="py-2 px-2 font-semibold">Pedidos Origem</th>
                <th className="py-2 px-2 font-semibold text-center">Estágio Cozinha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {productionList.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="py-12 text-center text-slate-400">
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
                        <td colSpan={visibleColumnCount} className="py-2 px-3 font-bold text-slate-800 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5">
                              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              <span>{group.label}</span>
                            </span>
                            <span className="font-mono text-[11px] text-slate-600 whitespace-nowrap">
                              {group.items.length} lote(s) • Total: {group.totalQty} un.
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {expanded && group.items.map(item => {
                  const stInfo = statusConfig[item.status];
                  const hasReplenishment = item.pedidosVinculados.some(isReplenishmentOrder);
                  const isEditingRow = editingItem?.key === item.key;
                  return (
                    <tr
                      key={item.key}
                      onClick={() => {
                        if (canEdit) openEditModal(item);
                      }}
                      className={`transition-colors ${canEdit ? 'cursor-pointer ' : ''}${
                        isEditingRow
                          ? `bg-brand-50/70 ring-1 ring-inset ring-brand-400 border-l-4 ${
                              hasReplenishment ? 'border-l-sky-500' : 'border-l-brand-600'
                            }`
                          : hasReplenishment
                          ? 'bg-sky-50/90 hover:bg-sky-100/70 border-l-4 border-l-sky-500'
                          : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {!hideTurnoData && (
                      <td className="py-2 px-2 whitespace-nowrap">
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
                      )}
                      {!hideProduto && (
                      <td className="py-2 px-2">
                        <div className="font-semibold text-slate-900">{item.descricao}</div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="font-mono text-[10px] text-slate-500">{item.sku}</span>
                          {hideTurnoData && hasReplenishment && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-bold uppercase tracking-wider">
                              Reposição
                            </span>
                          )}
                        </div>
                      </td>
                      )}
                      {!hideCategoria && (
                      <td className="py-2 px-2">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium whitespace-nowrap">
                          {item.categoriaNome}
                        </span>
                      </td>
                      )}
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <span className="text-xs font-bold font-mono text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-200">
                          {item.quantidadeTotal} {item.unidadeMedida}
                        </span>
                      </td>
                      {!hideDestino && (
                      <td className="py-2 px-2 max-w-[170px]">
                        <div className="flex flex-wrap gap-1">
                          {item.lojasDestino.map((loja, i) => (
                            <span
                              key={i}
                              className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold truncate max-w-[160px] ${getStoreBadgeClasses(loja)}`}
                              title={loja}
                            >
                              {loja}
                            </span>
                          ))}
                        </div>
                      </td>
                      )}
                      <td
                        className="py-2 px-2 font-mono text-[10px] text-slate-600 max-w-[170px] truncate"
                        title={item.pedidosVinculados.map(o => o.numeroPedido).join(', ')}
                      >
                        {item.pedidosVinculados.map(o => o.numeroPedido).join(', ')}
                      </td>
                      <td className="py-2 px-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {renderStageControl(item)}
                        <span className={`hidden print:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${stInfo.color}`}>
                          {stInfo.label}
                        </span>
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
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100/80 rounded-lg border border-emerald-200/80 text-xs font-bold text-slate-800 cursor-pointer transition-colors"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        <span>{group.label}</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {group.items.length} lote(s) • Total: {group.totalQty} un.
                      </span>
                    </button>
                  )}
                  {expanded && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.items.map(item => {
                      const stInfo = statusConfig[item.status];
                      const hasReplenishment = item.pedidosVinculados.some(isReplenishmentOrder);
                      const isEditingRow = editingItem?.key === item.key;
                      return (
                        <div
                          key={item.key}
                          onClick={() => {
                            if (canEdit) openEditModal(item);
                          }}
                          className={`border rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3 min-w-0 overflow-hidden ${
                            canEdit ? 'cursor-pointer hover:border-brand-400 transition-colors ' : ''
                          }${
                            isEditingRow
                              ? 'bg-brand-50/70 border-brand-400 ring-2 ring-brand-500 shadow-md'
                              : hasReplenishment
                              ? 'bg-sky-50/90 border-sky-400 ring-1 ring-sky-200'
                              : 'bg-white border-[#e2e8f0]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                            {hideTurnoData ? (
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-xs text-slate-900">{item.descricao}</span>
                                  {hasReplenishment && (
                                    <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-bold uppercase">
                                      Reposição
                                    </span>
                                  )}
                                </div>
                                <span className="block text-[10px] font-mono text-slate-500">
                                  {item.sku} • {item.categoriaNome}
                                </span>
                              </div>
                            ) : (
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-xs text-slate-900">{item.turno}</span>
                                  {hasReplenishment && (
                                    <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-bold uppercase">
                                      Reposição
                                    </span>
                                  )}
                                </div>
                                <span className="block text-[10px] font-mono text-slate-500">{item.dataProducao.split('-').reverse().join('/')}</span>
                              </div>
                            )}
                            {renderStageControl(item)}
                            <span className={`hidden print:inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stInfo.color}`}>
                              {stInfo.label}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs">
                            {hideTurnoData ? null : hideProduto ? (
                              <div className="font-mono text-[10px] text-slate-500">{item.categoriaNome}</div>
                            ) : (
                              <>
                                <div className="font-bold text-slate-900">{item.descricao}</div>
                                <div className="font-mono text-[10px] text-slate-500">{item.sku} • {item.categoriaNome}</div>
                              </>
                            )}
                            <div className="text-sm font-bold font-mono text-brand-700 pt-1">
                              {item.quantidadeTotal} {item.unidadeMedida}
                            </div>
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[60] p-2 sm:p-4">
          <form onSubmit={handleSaveManualOrder} className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[94dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 font-sans truncate">Registrar Produção Manual / Antecipada</h2>
                <p className="text-[11px] text-slate-500 hidden sm:block">Agende lotes extras ou antecipados por data e turno</p>
              </div>
              <button type="button" onClick={() => setIsManualModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3.5 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Data de Produção *</label>
                  <input
                    type="date"
                    required
                    min={todayKey}
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono"
                  />
                </div>
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Turno *</label>
                  <select
                    value={manualShift}
                    onChange={(e) => setManualShift(e.target.value as ProductionShift)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-semibold"
                  >
                    <option value="MANHA">Manhã (até 11h59)</option>
                    <option value="TARDE">Tarde (12h–17h59)</option>
                    <option value="NOITE">Noite (18h+)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Unidade / Destino</label>
                <select
                  value={manualUnitId}
                  onChange={(e) => setManualUnitId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-medium"
                >
                  {units.filter(u => u.ativo).map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 sm:p-3 space-y-2">
                <label className="font-semibold text-slate-700 block">Adicionar Produto ao Lote</label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-1.5 sm:gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-semibold text-slate-500 block mb-0.5 sm:mb-1">Produto</span>
                    <select
                      value={manualProdId}
                      onChange={(e) => setManualProdId(e.target.value)}
                      className="w-full min-w-0 bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs truncate"
                    >
                      {products.filter(p => p.ativo).map(p => (
                        <option key={p.id} value={p.id}>{p.sku} — {p.descricao}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-1.5 sm:gap-2 shrink-0">
                    <div>
                      <span className="text-[10px] font-semibold text-slate-500 block mb-0.5 sm:mb-1">Qtd</span>
                      <input
                        type="number"
                        min="1"
                        value={manualQty}
                        onChange={(e) => setManualQty(Math.max(1, Number(e.target.value)))}
                        className="w-16 sm:w-20 bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono text-center font-bold"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddManualItem}
                      className="flex-1 sm:flex-initial px-3 py-1.5 sm:py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg whitespace-nowrap"
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
                        <li key={mi.produtoId} className="px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-800 truncate">
                            <strong className="font-mono text-brand-700">{mi.quantidade}x</strong> {prod?.descricao}
                          </span>
                          <button
                            type="button"
                            onClick={() => setManualItems(prev => prev.filter(i => i.produtoId !== mi.produtoId))}
                            className="text-rose-500 hover:text-rose-700 shrink-0"
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
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Observações</label>
                <input
                  type="text"
                  value={manualObs}
                  onChange={(e) => setManualObs(e.target.value)}
                  placeholder="Ex: Reposição de vitrine fim de semana..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                />
              </div>
            </div>

            <div className="px-3.5 py-2.5 sm:px-6 sm:py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 sm:px-5 py-1.5 sm:py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[60] p-2 sm:p-4">
          <form onSubmit={handleSaveEditModal} className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[94dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 font-sans truncate">Editar Registro de Produção</h2>
                <p className="text-[11px] text-slate-500 truncate">{editingItem.descricao} ({editingItem.sku})</p>
              </div>
              <button type="button" onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-700 p-1 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3.5 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Data de Produção</label>
                  <input
                    type="date"
                    required
                    value={editForm.dataProducao}
                    onChange={e => setEditForm({ ...editForm, dataProducao: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                  />
                </div>
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Turno</label>
                  <select
                    value={editForm.turno}
                    onChange={e => setEditForm({ ...editForm, turno: e.target.value as ProductionShift })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                  >
                    <option value="MANHA">Manhã</option>
                    <option value="TARDE">Tarde</option>
                    <option value="NOITE">Noite</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Quantidade ({editingItem.unidadeMedida})</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editForm.quantidadeTotal}
                    onChange={e => setEditForm({ ...editForm, quantidadeTotal: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono font-bold"
                  />
                </div>
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Etapa / Status</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm({ ...editForm, status: e.target.value as ProductionStatus })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-semibold"
                  >
                    <option value="PLANEJADA">Planejada</option>
                    <option value="EM_PREPARO">Em Preparo</option>
                    <option value="CONCLUIDA">Concluída</option>
                    <option value="CANCELADA">Cancelada</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Observações</label>
                <input
                  type="text"
                  value={editForm.observacoes}
                  onChange={e => setEditForm({ ...editForm, observacoes: e.target.value })}
                  placeholder="Anotações do lote ou confeiteiro..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                />
              </div>
            </div>

            <div className="px-3.5 py-2.5 sm:px-6 sm:py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 sm:px-5 py-1.5 sm:py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </form>
        </div>
      )}

      <ProducaoReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        allItems={allConsolidatedItems}
        filteredItems={productionList}
        products={products}
        categories={categories}
        units={units}
        initialDateFilter={selectedDateFilter}
        initialShift={selectedShift}
        initialStageFilter={stageFilter}
        initialGroupBy={groupBy}
        searchTerm={searchTerm}
      />
    </div>
  );
};
