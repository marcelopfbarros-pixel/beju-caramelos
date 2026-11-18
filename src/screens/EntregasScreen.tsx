import React, { useState, useMemo } from 'react';
import { Order, OrderStatus, Product, StoreUnit, Customer, StockItem } from '../types';
import { ORDER_CARD_STATUS_STYLES } from '../utils/orderStatusStyles';
import { Printer, Clock, MapPin, Phone, CheckCircle, Calendar, Tag, LayoutGrid, List, Layers, MessageSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { PrintReportHeader } from '../components/PrintReportHeader';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import {
  formatStatusNotificationMessage,
  dispatchWhatsAppMessage
} from '../services/whatsappAutomationService';

interface EntregasScreenProps {
  orders: Order[];
  products: Product[];
  units: StoreUnit[];
  stock?: StockItem[];
  customers?: Customer[];
  selectedDeliveryIds?: string[];
  onChangeSelectedDeliveryIds?: (ids: string[]) => void;
  onOpenRouteTool?: () => void;
  onUpdateOrderStatus: (orderId: string, status: any) => void;
}

function getLocalDateKey(isoDate: string): string {
  const d = new Date(isoDate);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const EntregasScreen: React.FC<EntregasScreenProps> = ({
  orders,
  products,
  units,
  stock = [],
  customers = [],
  selectedDeliveryIds = [],
  onChangeSelectedDeliveryIds,
  onOpenRouteTool,
  onUpdateOrderStatus
}) => {
  const toggleRouteDelivery = (orderId: string) => {
    if (!onChangeSelectedDeliveryIds) return;
    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder?.status === 'ENTREGUE' && !selectedDeliveryIds.includes(orderId)) return;
    if (selectedDeliveryIds.includes(orderId)) {
      onChangeSelectedDeliveryIds(selectedDeliveryIds.filter(id => id !== orderId));
    } else {
      onChangeSelectedDeliveryIds([...selectedDeliveryIds, orderId]);
    }
  };
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const [pendingStatusConfirm, setPendingStatusConfirm] = useState<{
    order: Order;
    nextStatus: OrderStatus;
  } | null>(null);
  const [printMode, setPrintMode] = useState<'receipt' | 'label' | 'batch_labels' | 'report'>('receipt');
  const [labelFormat, setLabelFormat] = useState<'A4361' | '6181'>('A4361');
  const [labelColorMode, setLabelColorMode] = useState<'COLOR' | 'BW'>('COLOR');
  const [dateFilterMode, setDateFilterMode] = useState<'TODAS' | 'HOJE' | 'AMANHA' | 'DATA'>('TODAS');
  const [statusFilter, setStatusFilter] = useState<'SEM_ENTREGUES' | 'SO_ENTREGUES' | 'SEM_FILTRO'>('SEM_ENTREGUES');
  const [sortBy, setSortBy] = useState<'ENTREGA_ASC' | 'ENTREGA_DESC' | 'VALOR_DESC' | 'CLIENTE_ASC'>('ENTREGA_ASC');
  const [customDate, setCustomDate] = useState<string>(getLocalDateKey(new Date().toISOString()));
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [groupBy, setGroupBy] = useState<'LOJA_DATA_TURNO' | 'LOJA' | 'STATUS' | 'NENHUM'>('LOJA_DATA_TURNO');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);

  const getDeliveryDetail = (order: Order) => {
    if (order.detalheEntrega) return order.detalheEntrega;
    const customer = customers.find(
      c => c.telefone === order.clienteTelefone || c.nome.toLowerCase() === order.clienteNome.toLowerCase()
    );
    return customer?.detalheEntrega || '';
  };

  const todayKey = useMemo(() => getLocalDateKey(new Date().toISOString()), []);
  const tomorrowKey = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return getLocalDateKey(t.toISOString());
  }, []);

  const ALLOWED_DELIVERY_STATUSES: OrderStatus[] = ['PRONTO', 'EM_ROTA', 'ENTREGUE'];

  const deliveryOrders = orders.filter(
    o =>
      o.tipoEntrega === 'DELIVERY' &&
      ALLOWED_DELIVERY_STATUSES.includes(o.status)
  );
  const pendingDeliveries = deliveryOrders
    .filter(o => {
      if (statusFilter === 'SEM_ENTREGUES') {
        if (o.status === 'ENTREGUE') return false;
      } else if (statusFilter === 'SO_ENTREGUES') {
        if (o.status !== 'ENTREGUE') return false;
      }
      const orderDate = getLocalDateKey(o.dataHoraEntrega);
      if (dateFilterMode === 'HOJE') return orderDate === todayKey;
      if (dateFilterMode === 'AMANHA') return orderDate === tomorrowKey;
      if (dateFilterMode === 'DATA') return orderDate === customDate;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'ENTREGA_ASC') {
        return new Date(a.dataHoraEntrega).getTime() - new Date(b.dataHoraEntrega).getTime();
      }
      if (sortBy === 'ENTREGA_DESC') {
        return new Date(b.dataHoraEntrega).getTime() - new Date(a.dataHoraEntrega).getTime();
      }
      if (sortBy === 'VALOR_DESC') {
        return b.valorTotal - a.valorTotal;
      }
      return a.clienteNome.localeCompare(b.clienteNome, 'pt-BR');
    });

  const prodMap = new Map(products.map(p => [p.id, p]));
  const unitMap = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);

  const getShiftLabel = (isoDate: string) => {
    const d = new Date(isoDate);
    const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const h = d.getHours();
    const turno = h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
    return `${dateStr} • Turno ${turno}`;
  };

  interface DeliverySubGroup {
    subLabel: string | null;
    items: Order[];
  }
  interface DeliveryGroup {
    label: string;
    subGroups: DeliverySubGroup[];
    totalCount: number;
  }

  const groupedDeliveries = useMemo<DeliveryGroup[]>(() => {
    if (groupBy === 'NENHUM') {
      return [{ label: 'Todas as Entregas', subGroups: [{ subLabel: null, items: pendingDeliveries }], totalCount: pendingDeliveries.length }];
    }
    if (groupBy === 'LOJA_DATA_TURNO') {
      const storeMap = new Map<string, Map<string, Order[]>>();
      for (const order of pendingDeliveries) {
        const unit = unitMap.get(order.unidadeOrigemId);
        const storeKey = unit ? `${unit.tipo === 'CENTRAL' ? '🏭 ' : '🏪 '}${unit.nome}` : 'Unidade não informada';
        const shiftKey = getShiftLabel(order.dataHoraEntrega);
        if (!storeMap.has(storeKey)) storeMap.set(storeKey, new Map());
        const subMap = storeMap.get(storeKey)!;
        if (!subMap.has(shiftKey)) subMap.set(shiftKey, []);
        subMap.get(shiftKey)!.push(order);
      }
      return Array.from(storeMap.entries())
        .map(([label, subMap]) => {
          const subGroups = Array.from(subMap.entries())
            .map(([subLabel, items]) => ({ subLabel, items }))
            .sort((a, b) => {
              const tA = new Date(a.items[0]?.dataHoraEntrega || 0).getTime();
              const tB = new Date(b.items[0]?.dataHoraEntrega || 0).getTime();
              return tA - tB || (a.subLabel || '').localeCompare(b.subLabel || '', 'pt-BR');
            });
          const totalCount = subGroups.reduce((acc, sg) => acc + sg.items.length, 0);
          return { label, subGroups, totalCount };
        })
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    }
    const map = new Map<string, Order[]>();
    for (const order of pendingDeliveries) {
      let key = '';
      if (groupBy === 'LOJA') {
        const unit = unitMap.get(order.unidadeOrigemId);
        key = unit ? `${unit.tipo === 'CENTRAL' ? '🏭 ' : '🏪 '}${unit.nome}` : 'Unidade não informada';
      } else {
        key = order.status;
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    }
    return Array.from(map.entries())
      .map(([label, items]) => ({
        label,
        subGroups: [{ subLabel: null, items }],
        totalCount: items.length
      }))
      .sort((a, b) =>
        groupBy.includes('DATA')
          ? new Date(a.subGroups[0].items[0]?.dataHoraEntrega || 0).getTime() -
              new Date(b.subGroups[0].items[0]?.dataHoraEntrega || 0).getTime() ||
            a.label.localeCompare(b.label, 'pt-BR')
          : a.label.localeCompare(b.label, 'pt-BR')
      );
  }, [pendingDeliveries, groupBy, unitMap]);

  const handlePrint = (order: Order, mode: 'receipt' | 'label' = 'receipt') => {
    setPrintMode(mode);
    setSelectedOrderForPrint(order);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handlePrintBatchLabels = () => {
    if (pendingDeliveries.length === 0) return;
    setPrintMode('batch_labels');
    setSelectedOrderForPrint(null);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handlePrintReport = () => {
    setPrintMode('report');
    setSelectedOrderForPrint(null);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex items-center gap-2">
            <span>Entregas</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {pendingDeliveries.length} entrega(s)
            </span>
          </h1>
        </div>

        {/* Print + Batch Labels (Desktop only) */}
        <div className="hidden md:flex items-center gap-2 flex-wrap">
          <select
            value={labelFormat}
            onChange={(e) => setLabelFormat(e.target.value as 'A4361' | '6181')}
            className="bg-white border border-rose-200 text-rose-800 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            title="Padrão de Etiqueta Pimaco / Avery"
          >
            <option value="A4361">Etiqueta A4361 (63,5 × 46,5 mm)</option>
            <option value="6181">Etiqueta 6181 (101,6 × 25,4 mm)</option>
          </select>
          <select
            value={labelColorMode}
            onChange={(e) => setLabelColorMode(e.target.value as 'COLOR' | 'BW')}
            aria-label="Modo de cor da etiqueta"
            className="bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            title="Modo de Impressão da Etiqueta (Colorido ou Preto e Branco)"
          >
            <option value="COLOR">Colorido</option>
            <option value="BW">Preto e Branco</option>
          </select>
          <button
            onClick={handlePrintBatchLabels}
            disabled={pendingDeliveries.length === 0}
            title="Etiquetas em lote"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40 shadow-xs transition-all ${
              labelColorMode === 'BW'
                ? 'bg-slate-900 hover:bg-slate-800'
                : 'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Etiquetas ({pendingDeliveries.length})</span>
          </button>

          <button
            onClick={handlePrintReport}
            disabled={pendingDeliveries.length === 0}
            title="Imprimir"
            aria-label="Imprimir"
            className="flex items-center justify-center p-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter, Sort, Group & View Bar */}
      <div className="px-6 py-2.5 bg-white/70 border-b border-[#e2e8f0] flex flex-wrap items-center justify-between gap-2.5 print:hidden">
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
              <List className="w-3.5 h-3.5" />
              <span>Tabela</span>
            </button>
          </div>

          <HybridFilterSort
            filterLabel="Status:"
            filterValue={statusFilter}
            onFilterChange={(v) => setStatusFilter(v as 'SEM_ENTREGUES' | 'SO_ENTREGUES' | 'SEM_FILTRO')}
            filterOptions={[
              { value: 'SEM_ENTREGUES', label: 'Sem Entregues' },
              { value: 'SO_ENTREGUES', label: 'Só entregues' },
              { value: 'SEM_FILTRO', label: 'Sem filtro' }
            ]}
            sortValue={sortBy}
            onSortChange={(v) => setSortBy(v as 'ENTREGA_ASC' | 'ENTREGA_DESC' | 'VALOR_DESC' | 'CLIENTE_ASC')}
            sortOptions={[
              { value: 'ENTREGA_ASC', label: 'Data/Turno Entrega ↑' },
              { value: 'ENTREGA_DESC', label: 'Data/Turno Entrega ↓' },
              { value: 'VALOR_DESC', label: 'Maior Valor' },
              { value: 'CLIENTE_ASC', label: 'Cliente (A-Z)' }
            ]}
            groupValue={groupBy}
            onGroupChange={(v) => setGroupBy(v as 'LOJA_DATA_TURNO' | 'LOJA' | 'STATUS' | 'NENHUM')}
            groupOptions={[
              { value: 'LOJA_DATA_TURNO', label: 'Loja/Unidade → Data/Turno' },
              { value: 'LOJA', label: 'Loja / Unidade' },
              { value: 'STATUS', label: 'Status' },
              { value: 'NENHUM', label: 'Sem Agrupamento' }
            ]}
          />

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Data:</span>
            </div>
            {(['TODAS', 'HOJE', 'AMANHA'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setDateFilterMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  dateFilterMode === mode
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {mode === 'TODAS' ? 'Todas' : mode === 'HOJE' ? 'Hoje' : 'Amanhã'}
              </button>
            ))}
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value);
                setDateFilterMode('DATA');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all ${
                dateFilterMode === 'DATA'
                  ? 'border-brand-600 bg-brand-50 text-brand-900 font-bold'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => {
                if (selectedDeliveryIds.length > 0 && onOpenRouteTool) {
                  onOpenRouteTool();
                  return;
                }
                if (!onChangeSelectedDeliveryIds) return;
                const readyIds = pendingDeliveries
                  .filter(o => o.status === 'PRONTO')
                  .map(o => o.id);
                onChangeSelectedDeliveryIds(readyIds);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border ${
                selectedDeliveryIds.length > 0
                  ? 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-brand-500'
              }`}
              title={
                selectedDeliveryIds.length > 0
                  ? 'Abrir ferramenta Roteiro com as entregas selecionadas'
                  : 'Selecionar entregas com status Pronto para planejar rota'
              }
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>
                {selectedDeliveryIds.length > 0
                  ? `Rota: ${selectedDeliveryIds.length} selecionada(s)`
                  : 'Selecionar Prontas p/ Rota'}
              </span>
            </button>
            {selectedDeliveryIds.length > 0 && (
              <button
                type="button"
                onClick={() => onChangeSelectedDeliveryIds?.([])}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Limpar Rota
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 print:hidden">
        {pendingDeliveries.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Nenhuma entrega encontrada para esta data!</p>
            <p className="text-xs text-slate-500">Altere o filtro de data acima ou aguarde novos pedidos.</p>
          </div>
        ) : viewMode === 'CARDS' ? (
          <div className="space-y-6">
            {groupedDeliveries.map(group => {
              const groupExpanded = isGroupExpanded(`g:${group.label}`, groupBy !== 'NENHUM');
              return (
              <div key={group.label} className="space-y-4">
                {groupBy !== 'NENHUM' && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(`g:${group.label}`)}
                    className="w-full flex items-center justify-between border-b border-slate-200 pb-1.5 hover:text-slate-900 cursor-pointer"
                  >
                    <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      {groupExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>{group.label}</span>
                    </h2>
                    <span className="text-[11px] font-mono font-semibold text-slate-500">
                      {group.totalCount} entrega(s)
                    </span>
                  </button>
                )}

                {groupExpanded && group.subGroups.map(sub => {
                  const subKey = `s:${group.label}|${sub.subLabel || 'all'}`;
                  const subExpanded = !sub.subLabel || isGroupExpanded(subKey, groupBy !== 'NENHUM');
                  return (
                  <div key={sub.subLabel || 'all'} className="space-y-3">
                    {sub.subLabel && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(subKey)}
                        className="w-full flex items-center justify-between bg-slate-100/80 hover:bg-slate-200/70 px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer transition-colors"
                      >
                        <span className="text-[11px] font-mono font-bold text-slate-700 inline-flex items-center gap-1.5">
                          {subExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <span>{sub.subLabel}</span>
                        </span>
                        <span className="text-[11px] font-mono font-semibold text-slate-500">
                          {sub.items.length} entrega(s)
                        </span>
                      </button>
                    )}

                    {subExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sub.items.map(order => {
                        const unit = units.find(u => u.id === order.unidadeOrigemId);
                        const isDelivered = order.status === 'ENTREGUE';
                        const isSelectedForRoute = selectedDeliveryIds.includes(order.id);

                        return (
                          <div
                            key={order.id}
                            className={`rounded-xl p-4 shadow-xs flex flex-col justify-between transition-colors border ${
                              ORDER_CARD_STATUS_STYLES[order.status]
                            } ${
                              !isDelivered && isSelectedForRoute
                                ? 'ring-2 ring-brand-500/40 border-brand-500'
                                : ''
                            }`}
                          >
                            <div className="space-y-3">
                              {/* Header */}
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                <div className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    disabled={isDelivered}
                                    checked={!isDelivered && isSelectedForRoute}
                                    onChange={() => toggleRouteDelivery(order.id)}
                                    title={
                                      isDelivered
                                        ? 'Pedido já entregue não pode ser selecionado para a rota'
                                        : 'Incluir esta entrega no roteirizador Google Maps'
                                    }
                                    className={`mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 ${
                                      isDelivered ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                    }`}
                                  />
                                  <div>
                                    <span className="text-xs font-mono font-bold text-slate-900">{order.numeroPedido}</span>
                                    <span className="text-[10px] text-slate-500 block font-medium">Origem: {unit?.nome}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 text-xs font-mono font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  <span>
                                    {new Date(order.dataHoraEntrega).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{' '}
                                    {new Date(order.dataHoraEntrega).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>

                              {/* Recipient Details */}
                              <div>
                                <h4 className="text-sm font-bold text-slate-900">{order.clienteNome}</h4>
                                <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="font-mono">{order.clienteTelefone}</span>
                                </div>
                                <div className="flex items-start gap-1.5 text-xs text-slate-700 mt-1.5 bg-white/80 p-2 rounded-lg border border-slate-200">
                                  <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                  <span className="leading-tight">{order.enderecoEntrega || 'Endereço não informado'}</span>
                                </div>
                              </div>

                              {/* Items Checklist Preview */}
                              <div className="border-t border-slate-100 pt-2 text-xs">
                                <span className="text-[10px] font-mono uppercase font-semibold text-slate-400 block mb-1">
                                  Itens para Conferência:
                                </span>
                                <ul className="space-y-1">
                                  {order.itens.map(item => (
                                    <li key={item.id} className="flex items-center justify-between text-slate-700">
                                      <span>• {item.quantidade}x {prodMap.get(item.produtoId)?.descricao}</span>
                                      <span className="font-mono text-[11px] text-slate-500">R$ {item.subtotal.toFixed(2)}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {/* Financial Summary */}
                              <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100 flex items-center justify-between text-xs">
                                <span className="text-emerald-900 font-semibold uppercase text-[10px]">
                                  {order.formaPagamento} {order.trocoPara ? `(Troco p/ R$ ${order.trocoPara.toFixed(2)})` : ''}
                                </span>
                                <span className="font-mono font-bold text-emerald-900 text-sm">
                                  R$ {order.valorTotal.toFixed(2)}
                                </span>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const msg = formatStatusNotificationMessage(order, order.status, products, units);
                                  dispatchWhatsAppMessage(order.clienteTelefone, msg);
                                }}
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors"
                                title={`Notificar cliente no WhatsApp (${order.status})`}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>

                              {order.clienteTelefone && (
                                <a
                                  href={`tel:${order.clienteTelefone.replace(/[^\d+]/g, '')}`}
                                  className="md:hidden min-h-[38px] min-w-[38px] flex items-center justify-center p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition-colors"
                                  title="Ligar para cliente"
                                >
                                  <Phone className="w-4 h-4" />
                                </a>
                              )}

                              {order.enderecoEntrega && (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.enderecoEntrega)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="md:hidden min-h-[38px] min-w-[38px] flex items-center justify-center p-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg transition-colors"
                                  title="Abrir endereço no Google Maps"
                                >
                                  <MapPin className="w-4 h-4" />
                                </a>
                              )}

                              <button
                                onClick={() => handlePrint(order, 'receipt')}
                                className="hidden md:flex flex-1 items-center justify-center gap-1.5 py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Comprovante</span>
                              </button>

                              <button
                                onClick={() => handlePrint(order, 'label')}
                                className="hidden md:flex items-center justify-center gap-1 py-2 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg transition-colors"
                                title="Imprimir Etiqueta Adesiva Colorida"
                              >
                                <Tag className="w-3.5 h-3.5" />
                                <span>Etiqueta</span>
                              </button>

                              <button
                                disabled={isDelivered}
                                onClick={() => {
                                  if (isDelivered) return;
                                  const nextStatus: OrderStatus = order.status === 'EM_ROTA' ? 'ENTREGUE' : 'EM_ROTA';
                                  setPendingStatusConfirm({ order, nextStatus });
                                }}
                                className={`flex-1 md:flex-none min-h-[38px] py-2 px-3 text-xs font-bold rounded-lg transition-colors ${
                                  isDelivered
                                    ? 'bg-red-600 text-white opacity-90 cursor-not-allowed'
                                    : order.status === 'EM_ROTA'
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-brand-600 hover:bg-brand-700 text-white'
                                }`}
                              >
                                {isDelivered
                                  ? 'Entregue'
                                  : order.status === 'EM_ROTA'
                                  ? 'Concluir Entrega'
                                  : 'Despachar (Em Rota)'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8f9ff] border-b border-[#e2e8f0] text-[11px] font-mono font-semibold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="py-3 px-3 w-8 text-center">Rota</th>
                  <th className="py-3 px-4">Pedido</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Endereço</th>
                  <th className="py-3 px-4">Entrega</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {groupedDeliveries.map(group => {
                  const groupExpanded = isGroupExpanded(`tg:${group.label}`, groupBy !== 'NENHUM');
                  return (
                  <React.Fragment key={group.label}>
                    {groupBy !== 'NENHUM' && (
                      <tr
                        onClick={() => toggleGroup(`tg:${group.label}`)}
                        className="bg-emerald-50 hover:bg-emerald-100/80 cursor-pointer transition-colors"
                      >
                        <td colSpan={8} className="py-2 px-4 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                          <span className="inline-flex items-center gap-1.5">
                            {groupExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span>{group.label} ({group.totalCount})</span>
                          </span>
                        </td>
                      </tr>
                    )}
                    {groupExpanded && group.subGroups.map(sub => {
                      const subKey = `ts:${group.label}|${sub.subLabel || 'all'}`;
                      const subExpanded = !sub.subLabel || isGroupExpanded(subKey, groupBy !== 'NENHUM');
                      return (
                      <React.Fragment key={sub.subLabel || 'all'}>
                        {sub.subLabel && (
                          <tr
                            onClick={() => toggleGroup(subKey)}
                            className="bg-emerald-50/60 hover:bg-emerald-100/60 cursor-pointer transition-colors"
                          >
                            <td colSpan={8} className="py-1.5 px-6 text-[11px] font-mono font-semibold text-slate-600">
                              <span className="inline-flex items-center gap-1.5">
                                {subExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                <span>{sub.subLabel} ({sub.items.length})</span>
                              </span>
                            </td>
                          </tr>
                        )}
                        {subExpanded && sub.items.map(order => {
                          const isDelivered = order.status === 'ENTREGUE';
                          const isSelectedForRoute = selectedDeliveryIds.includes(order.id);
                          return (
                            <tr
                              key={order.id}
                              className={
                                isDelivered
                                  ? 'bg-emerald-50/70'
                                  : isSelectedForRoute
                                  ? 'bg-brand-50/40'
                                  : 'hover:bg-slate-50/80'
                              }
                            >
                              <td className="py-3 px-3 text-center">
                                <input
                                  type="checkbox"
                                  disabled={isDelivered}
                                  checked={!isDelivered && isSelectedForRoute}
                                  onChange={() => toggleRouteDelivery(order.id)}
                                  title={
                                    isDelivered
                                      ? 'Pedido já entregue não pode ser selecionado para a rota'
                                      : 'Incluir esta entrega no roteirizador Google Maps'
                                  }
                                  className={`w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 ${
                                    isDelivered ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                  }`}
                                />
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-slate-900">{order.numeroPedido}</td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900">{order.clienteNome}</div>
                                <div className="text-[11px] font-mono text-slate-500">{order.clienteTelefone}</div>
                              </td>
                              <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{order.enderecoEntrega || '-'}</td>
                              <td className="py-3 px-4 font-mono text-slate-700">
                                {new Date(order.dataHoraEntrega).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] font-bold">{order.status}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                                R$ {order.valorTotal.toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const msg = formatStatusNotificationMessage(order, order.status, products, units);
                                      dispatchWhatsAppMessage(order.clienteTelefone, msg);
                                    }}
                                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded"
                                    title={`Notificar cliente no WhatsApp (${order.status})`}
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handlePrint(order, 'receipt')}
                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold"
                                  >
                                    Comprovante
                                  </button>
                                  <button
                                    disabled={isDelivered}
                                    onClick={() => {
                                      if (isDelivered) return;
                                      const nextStatus: OrderStatus = order.status === 'EM_ROTA' ? 'ENTREGUE' : 'EM_ROTA';
                                      setPendingStatusConfirm({ order, nextStatus });
                                    }}
                                    className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                                      isDelivered
                                        ? 'bg-red-600 text-white cursor-not-allowed'
                                        : order.status === 'EM_ROTA'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-brand-600 text-white'
                                    }`}
                                  >
                                    {isDelivered ? 'Entregue' : order.status === 'EM_ROTA' ? 'Concluir' : 'Despachar'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PRINT DELIVERIES REPORT (When printMode === 'report') */}
      {printMode === 'report' && (
        <div id="print-report-area" className="hidden print:block p-6 bg-white text-slate-900">
          <PrintReportHeader
            title="Entregas"
            badge={
              groupBy === 'LOJA_DATA_TURNO'
                ? 'Loja/Unidade → Data/Turno'
                : groupBy === 'LOJA'
                ? 'Por Loja / Unidade'
                : groupBy === 'STATUS'
                ? 'Por Status'
                : 'Geral'
            }
            subtitle={`${pendingDeliveries.length} entrega(s)`}
          />
          <table className="w-full text-left text-xs border-collapse mt-4">
            <thead className="bg-slate-100 border-b border-slate-300 text-[10px] font-mono uppercase text-slate-700">
              <tr>
                <th className="py-2 px-3">Pedido</th>
                <th className="py-2 px-3">Cliente</th>
                <th className="py-2 px-3">Endereço</th>
                <th className="py-2 px-3">Entrega</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {groupedDeliveries.map(group => (
                <React.Fragment key={group.label}>
                  {groupBy !== 'NENHUM' && (
                    <tr className="bg-slate-100">
                      <td colSpan={6} className="py-1.5 px-3 font-mono font-bold text-[11px] uppercase text-slate-800">
                        {group.label} ({group.totalCount})
                      </td>
                    </tr>
                  )}
                  {group.subGroups.map(sub => (
                    <React.Fragment key={sub.subLabel || 'all'}>
                      {sub.subLabel && (
                        <tr className="bg-slate-50">
                          <td colSpan={6} className="py-1 px-5 font-mono font-semibold text-[10px] text-slate-700">
                            {sub.subLabel} ({sub.items.length})
                          </td>
                        </tr>
                      )}
                      {sub.items.map(order => (
                        <tr key={order.id}>
                          <td className="py-2 px-3 font-mono font-bold">{order.numeroPedido}</td>
                          <td className="py-2 px-3">{order.clienteNome} ({order.clienteTelefone})</td>
                          <td className="py-2 px-3">{order.enderecoEntrega || '-'}</td>
                          <td className="py-2 px-3 font-mono">
                            {new Date(order.dataHoraEntrega).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-2 px-3 font-mono">{order.status}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">R$ {order.valorTotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PRINT SLIP / RECEIPT TEMPLATE (Hidden on screen, visible only when printing) */}
      {printMode === 'receipt' && selectedOrderForPrint && (
        <div id="print-area" className="hidden print:block p-4 max-w-sm mx-auto font-mono text-xs text-black bg-white">
          <div className="text-center pb-3 border-b-2 border-dashed border-black">
            <img
              src="/logo.jpg"
              alt="Beju Caramelos"
              className="w-14 h-14 mx-auto mb-2 rounded-full object-cover"
            />
            <h2 className="text-base font-bold uppercase tracking-wider">Beju Caramelos</h2>
            <p className="text-[10px]">Romaneio de Entrega</p>
            <p className="text-[10px] mt-1 font-bold">PEDIDO: {selectedOrderForPrint.numeroPedido}</p>
            <p className="text-[10px]">{new Date().toLocaleString('pt-BR')}</p>
          </div>

          <div className="py-3 border-b-2 border-dashed border-black space-y-1">
            <p><strong>DESTINATÁRIO:</strong> {selectedOrderForPrint.clienteNome}</p>
            <p><strong>TEL:</strong> {selectedOrderForPrint.clienteTelefone}</p>
            <p><strong>ENDEREÇO:</strong> {selectedOrderForPrint.enderecoEntrega}</p>
            <p>
              <strong>ENTREGA:</strong>{' '}
              {new Date(selectedOrderForPrint.dataHoraEntrega).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </div>

          <div className="py-3 border-b-2 border-dashed border-black">
            <p className="font-bold mb-1">ITENS DO PEDIDO:</p>
            {selectedOrderForPrint.itens.map((item, idx) => (
              <div key={idx} className="flex justify-between py-0.5">
                <span>[ ] {item.quantidade}x {prodMap.get(item.produtoId)?.descricao}</span>
                <span>R$ {item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="py-3 border-b-2 border-dashed border-black space-y-1">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>R$ {selectedOrderForPrint.valorSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Taxa Entrega:</span>
              <span>R$ {selectedOrderForPrint.taxaEntrega.toFixed(2)}</span>
            </div>
            {selectedOrderForPrint.desconto > 0 && (
              <div className="flex justify-between">
                <span>Desconto:</span>
                <span>-R$ {selectedOrderForPrint.desconto.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold pt-1">
              <span>TOTAL:</span>
              <span>R$ {selectedOrderForPrint.valorTotal.toFixed(2)}</span>
            </div>
            <p className="pt-1"><strong>FORMA PAGTO:</strong> {selectedOrderForPrint.formaPagamento.toUpperCase()}</p>
            {selectedOrderForPrint.trocoPara && (
              <p><strong>LEVAR TROCO PARA:</strong> R$ {selectedOrderForPrint.trocoPara.toFixed(2)}</p>
            )}
          </div>

          {selectedOrderForPrint.observacoes && (
            <div className="py-2 border-b-2 border-dashed border-black">
              <p><strong>OBSERVAÇÕES:</strong></p>
              <p>{selectedOrderForPrint.observacoes}</p>
            </div>
          )}

          <div className="pt-6 text-center space-y-4">
            <div className="border-t border-black w-48 mx-auto pt-1">
              Assinatura do Recebedor
            </div>
            <p className="text-[9px]">Obrigado pela preferência!</p>
          </div>
        </div>
      )}

      {/* ADHESIVE LABELS PRINT TEMPLATE (Pimaco A4361 / 6181 - Colorido ou Preto e Branco) */}
      {(printMode === 'label' || printMode === 'batch_labels') && (
        <div
          id="print-labels-area"
          data-color-mode={labelColorMode}
          className="hidden print:grid bg-white mx-auto box-border"
          style={{
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
            width: '100%',
            maxWidth: '188mm',
            gridTemplateColumns: labelFormat === 'A4361' ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
            padding: '2mm 0',
            columnGap: labelFormat === 'A4361' ? '2.5mm' : '4mm',
            rowGap: '2.5mm',
            justifyContent: 'center',
            alignContent: 'start'
          }}
        >
          {(printMode === 'label' && selectedOrderForPrint ? [selectedOrderForPrint] : pendingDeliveries).map(order => {
            const detail = getDeliveryDetail(order);
            const is6181 = labelFormat === '6181';
            const isBW = labelColorMode === 'BW';
            return (
              <div
                key={order.id}
                className={`break-inside-avoid rounded-xl border overflow-hidden flex flex-col justify-between box-border w-full ${
                  isBW
                    ? 'border-slate-900 bg-white text-black'
                    : 'border-rose-300 bg-gradient-to-r from-rose-50 via-white to-amber-50'
                }`}
                style={{
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                  filter: isBW ? 'grayscale(100%)' : undefined,
                  width: '100%',
                  height: is6181 ? '26mm' : '44mm',
                  padding: is6181 ? '2.2mm 3mm' : '2.8mm 3.2mm'
                }}
              >
                {is6181 ? (
                  /* Layout compacto horizontal 101.6 x 25.4 mm (6181) */
                  <div className="flex items-center justify-between gap-2.5 h-full">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <img
                        src="/logo.jpg"
                        alt="Beju Caramelos"
                        className={`w-8 h-8 rounded-full object-cover border shrink-0 ${
                          isBW ? 'border-slate-900 grayscale contrast-125' : 'border-rose-300'
                        }`}
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-extrabold text-slate-900 truncate">{order.clienteNome}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[8px] font-bold shrink-0 ${
                              isBW ? 'bg-slate-900 text-white' : 'bg-rose-600 text-white'
                            }`}
                          >
                            {order.numeroPedido}
                          </span>
                        </div>
                        <p className={`text-[9px] font-semibold truncate ${isBW ? 'text-slate-900' : 'text-amber-900'}`}>
                          {detail || order.enderecoEntrega || 'Entrega Beju Caramelos'}
                        </p>
                      </div>
                    </div>
                    <div className={`text-right shrink-0 text-[8px] font-mono font-semibold leading-tight ${isBW ? 'text-slate-900' : 'text-rose-800'}`}>
                      <div>{new Date(order.dataHoraEntrega).toLocaleDateString('pt-BR')}</div>
                      <div>{new Date(order.dataHoraEntrega).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ) : (
                  /* Layout A4361 63.5 x 46.5 mm */
                  <>
                    <div className={`flex items-center justify-between border-b pb-1.5 ${isBW ? 'border-slate-800' : 'border-rose-200'}`}>
                      <div className="flex items-center gap-1.5">
                        <img
                          src="/logo.jpg"
                          alt="Beju Caramelos"
                          className={`w-5 h-5 rounded-full object-cover border ${
                            isBW ? 'border-slate-900 grayscale contrast-125' : 'border-rose-300'
                          }`}
                        />
                        <span className={`text-[8px] font-extrabold tracking-wide uppercase ${isBW ? 'text-black' : 'text-rose-900'}`}>
                          Beju Caramelos
                        </span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded-full font-mono text-[8px] font-bold ${
                          isBW ? 'bg-slate-900 text-white' : 'bg-rose-600 text-white'
                        }`}
                      >
                        {order.numeroPedido}
                      </span>
                    </div>

                    <div className="my-auto py-1 space-y-1.5">
                      <p className="text-[11px] font-extrabold text-slate-900 leading-tight truncate">{order.clienteNome}</p>
                      {detail && (
                        <div
                          className={`px-2 py-1 rounded border ${
                            isBW ? 'bg-slate-100 border-slate-800' : 'bg-amber-100/90 border-amber-300'
                          }`}
                        >
                          <p className={`text-[9px] font-semibold leading-tight line-clamp-2 ${isBW ? 'text-black' : 'text-amber-950'}`}>
                            {detail}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className={`pt-1 border-t flex items-center justify-between text-[7.5px] font-mono font-semibold ${isBW ? 'border-slate-800 text-slate-900' : 'border-rose-200 text-rose-800'}`}>
                      <span>{new Date(order.dataHoraEntrega).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      <span className="truncate ml-1.5">{order.clienteTelefone}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pendingStatusConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-200 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Confirmar Alteração de Status</h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Deseja alterar o status do pedido{' '}
                <strong className="font-mono text-slate-900">{pendingStatusConfirm.order.numeroPedido}</strong> de{' '}
                <strong>{pendingStatusConfirm.order.status.replace('_', ' ')}</strong> para{' '}
                <strong>{pendingStatusConfirm.nextStatus.replace('_', ' ')}</strong>?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingStatusConfirm(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateOrderStatus(pendingStatusConfirm.order.id, pendingStatusConfirm.nextStatus);
                  setPendingStatusConfirm(null);
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
