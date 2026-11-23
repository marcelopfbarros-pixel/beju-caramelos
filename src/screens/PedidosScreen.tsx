import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { CurrencyInput, formatCurrencyBR } from '../components/CurrencyInput';
import { TimeSelect15 } from '../components/TimeSelect15';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import { ORDER_CARD_STATUS_STYLES, isReplenishmentOrder, REPLENISHMENT_CARD_STYLE } from '../utils/orderStatusStyles';
import { computeReservedStockMap, getUnitProductAvailability } from '../utils/stockAvailability';
import {
  PAYMENT_STATUS_BADGE_CLASSES,
  PAYMENT_STATUS_LABELS,
  getEffectivePaymentStatus,
  getOrderPaidAmount,
  getOrderRemainingAmount,
} from '../utils/paymentStatus';
import {
  addHoursToDateTime,
  applyDeliveryShiftToDate,
  combineDateWithTime,
  extractTimeHHmm,
  formatDeliveryTimeRange,
  inferDeliveryShiftFromDateTime
} from '../utils/deliveryTimeRange';
import { 
  Order, 
  Product, 
  StoreUnit, 
  Category, 
  OrderStatus, 
  DeliveryType, 
  DeliveryShift,
  PaymentMethod,
  PaymentStatus,
  OrderItem,
  Customer,
  StockItem
} from '../types';
import { 
  Plus, 
  FileSpreadsheet, 
  Download, 
  Search, 
  Phone, 
  Truck, 
  Store, 
  Clock, 
  Copy, 
  Check, 
  X, 
  Trash2, 
  ChevronRight,
  ChevronDown,
  Filter,
  Sparkles,
  AlertCircle,
  Printer,
  LayoutGrid,
  Table as TableIcon,
  MessageSquare,
  MapPin
} from 'lucide-react';
import { ExcelService } from '../services/excelService';
import { WhatsAppImportModal } from '../components/WhatsAppImportModal';
import { ParsedWhatsAppOrder } from '../services/whatsappParserService';
import { PrintReportHeader } from '../components/PrintReportHeader';
import {
  formatStatusNotificationMessage,
  dispatchWhatsAppMessage,
  getWhatsAppAutomationSettings,
  calculateNearestUnitAndDeliveryFee,
  normalizePhoneForWhatsApp,
  resolveOrderUnit,
  formatUnitAddress
} from '../services/whatsappAutomationService';

interface PedidosScreenProps {
  orders: Order[];
  products: Product[];
  units: StoreUnit[];
  categories: Category[];
  customers: Customer[];
  stock?: StockItem[];
  activeUnitId: string;
  onVerifyPin?: (pin: string) => Promise<boolean> | boolean;
  requestedStatusFilter?: { status: string; expandGroups?: boolean; nonce: number } | null;
  onSaveOrder: (order: Order) => void;
  onDeleteOrder?: (orderId: string) => void;
  selectedOrderId?: string;
  onSelectOrder: (order: Order) => void;
  onSaveCustomer: (customer: Customer) => void;
}

function getCurrentLocalDateTime(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
}

function toLocalDateTimeInput(isoStr?: string): string {
  if (!isoStr) return getCurrentLocalDateTime();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(isoStr)) return isoStr;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return getCurrentLocalDateTime();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export const PedidosScreen: React.FC<PedidosScreenProps> = ({
  orders,
  products,
  units,
  categories,
  customers,
  stock = [],
  activeUnitId,
  onVerifyPin,
  requestedStatusFilter,
  onSaveOrder,
  onDeleteOrder,
  onSelectOrder,
  onSaveCustomer
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(() => requestedStatusFilter?.status || 'TODOS');
  const [sortBy, setSortBy] = useState<'ENTREGA_ASC' | 'ENTREGA_DESC' | 'VALOR_DESC' | 'CLIENTE_ASC'>('ENTREGA_ASC');
  const [groupBy, setGroupBy] = useState<'NENHUM' | 'MODALIDADE' | 'LOJA_ORIGEM'>('LOJA_ORIGEM');
  const { isGroupExpanded, toggleGroup, expandAll } = useExpandedGroups(groupBy);
  const [verifyingStatusPin, setVerifyingStatusPin] = useState(false);

  useEffect(() => {
    if (requestedStatusFilter?.status) {
      setStatusFilter(requestedStatusFilter.status);
    }
    if (requestedStatusFilter?.expandGroups) {
      expandAll();
    }
  }, [
    requestedStatusFilter?.nonce,
    requestedStatusFilter?.status,
    requestedStatusFilter?.expandGroups,
    expandAll
  ]);
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'CARDS' : 'TABLE'
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<OrderStatus | null>(null);
  const [pendingQuickStatusConfirm, setPendingQuickStatusConfirm] = useState<{
    order: Order;
    nextStatus: OrderStatus;
  } | null>(null);
  const [pendingModalStatusConfirm, setPendingModalStatusConfirm] = useState<OrderStatus | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [statusAuthPin, setStatusAuthPin] = useState('');
  const [statusAuthError, setStatusAuthError] = useState('');
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [importBanner, setImportBanner] = useState<{
    source: 'gemini' | 'local_fallback';
    unmatchedItems: string[];
    fallbackReason?: string;
  } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Item selector & Discount state
  const [selectedProdToAdd, setSelectedProdToAdd] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [showProductSuggestions, setShowProductSuggestions] = useState<boolean>(false);
  const [selectedQtyToAdd, setSelectedQtyToAdd] = useState<number>(1);
  const [discountType, setDiscountType] = useState<'R$' | '%'>('R$');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const discountConfigRef = useRef<{ type: 'R$' | '%'; value: number }>({ type: 'R$', value: 0 });
  const routeCalcRequestIdRef = useRef(0);

  const updateDiscountConfig = (type: 'R$' | '%', value: number) => {
    discountConfigRef.current = { type, value };
    setDiscountType(type);
    setDiscountValue(value);
  };
  const [saveCustomerToBase, setSaveCustomerToBase] = useState<boolean>(true);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState<boolean>(false);

  // New Order Form State in Logical Order
  const [editingOrder, setEditingOrder] = useState<Partial<Order>>({
    numeroPedido: `#PED-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    status: 'CONFIRMADO',
    dataPedido: new Date().toISOString(),
    dataHoraEntrega: getCurrentLocalDateTime(),
    dataHoraEntregaFim: addHoursToDateTime(getCurrentLocalDateTime(), 1),
    turnoEntrega: inferDeliveryShiftFromDateTime(getCurrentLocalDateTime()),
    tipoEntrega: 'DELIVERY',
    unidadeOrigemId: activeUnitId !== 'all' ? activeUnitId : units[0]?.id || 'u-central',
    clienteNome: '',
    clienteTelefone: '',
    clienteEndereco: '',
    enderecoEntrega: '',
    taxaEntrega: 15.00,
    desconto: 0.00,
    formaPagamento: 'pix',
    trocoPara: undefined,
    instrucoesPagamento: '',
    observacoes: '',
    itens: []
  });

  const modalReservedMap = useMemo(
    () => computeReservedStockMap(orders, editingOrder.id),
    [orders, editingOrder.id]
  );

  // Filtered & sorted orders
  const filteredOrders = orders
    .filter(o => {
      const matchesUnit = activeUnitId === 'all' || o.unidadeOrigemId === activeUnitId || o.unidadeRetiradaId === activeUnitId;
      const matchesStatus = statusFilter === 'TODOS' || o.status === statusFilter;
      const matchesSearch = 
        o.numeroPedido.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.clienteTelefone.includes(searchTerm);
      return matchesUnit && matchesStatus && matchesSearch;
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

  const computeDiscountAmount = (subtotal: number, dType: 'R$' | '%', dVal: number): number => {
    if (dVal <= 0) return 0;
    if (dType === '%') {
      const pct = Math.min(100, Math.max(0, dVal));
      return Number(((subtotal * pct) / 100).toFixed(2));
    }
    return Math.max(0, dVal);
  };

  // Calculate Order Totals dynamically
  const calculateTotals = (itens: OrderItem[], taxa: number, desc: number) => {
    const subtotal = Number(itens.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0).toFixed(2));
    const total = Number(Math.max(0, subtotal + taxa - desc).toFixed(2));
    return { subtotal, total };
  };

  const handleAddItem = (productId: string, qty = 1) => {
    const prod = products.find(p => p.id === productId);
    if (!prod || qty <= 0) return;

    const currentItens = editingOrder.itens || [];
    const existingIndex = currentItens.findIndex(i => i.produtoId === productId);

    let updatedItens: OrderItem[];
    if (existingIndex >= 0) {
      updatedItens = currentItens.map((item, idx) => {
        if (idx === existingIndex) {
          const qtd = item.quantidade + qty;
          return { ...item, quantidade: qtd, subtotal: qtd * item.precoUnitario };
        }
        return item;
      });
    } else {
      updatedItens = [
        ...currentItens,
        {
          id: `item-${Date.now()}-${Math.random()}`,
          produtoId: prod.id,
          quantidade: qty,
          precoUnitario: prod.precoUnitario,
          subtotal: qty * prod.precoUnitario
        }
      ];
    }

    const subtotalCalc = updatedItens.reduce((acc, i) => acc + (i.quantidade * i.precoUnitario), 0);
    const computedDesc = computeDiscountAmount(subtotalCalc, discountType, discountValue);
    const { subtotal, total } = calculateTotals(
      updatedItens,
      editingOrder.taxaEntrega || 0,
      computedDesc
    );

    setEditingOrder(prev => ({
      ...prev,
      itens: updatedItens,
      desconto: computedDesc,
      valorSubtotal: subtotal,
      valorTotal: total
    }));
  };

  const handleUpdateItemQuantity = (itemId: string, delta: number) => {
    const currentItens = editingOrder.itens || [];
    const updatedItens = currentItens
      .map(item => {
        if (item.id === itemId) {
          const novaQtd = Math.max(0, item.quantidade + delta);
          return { ...item, quantidade: novaQtd, subtotal: novaQtd * item.precoUnitario };
        }
        return item;
      })
      .filter(item => item.quantidade > 0);

    const subtotalCalc = updatedItens.reduce((acc, i) => acc + (i.quantidade * i.precoUnitario), 0);
    const computedDesc = computeDiscountAmount(subtotalCalc, discountType, discountValue);
    const { subtotal, total } = calculateTotals(
      updatedItens,
      editingOrder.taxaEntrega || 0,
      computedDesc
    );

    setEditingOrder(prev => ({
      ...prev,
      itens: updatedItens,
      desconto: computedDesc,
      valorSubtotal: subtotal,
      valorTotal: total
    }));
  };

  const handleSave = () => {
    if (!editingOrder.dataHoraEntrega) {
      alert('O campo "Data/Hora Combinada" é obrigatório.');
      return;
    }
    if (!editingOrder.id && new Date(editingOrder.dataHoraEntrega).getTime() < Date.now() - 60000) {
      alert('A "Data/Hora Combinada" não pode estar no passado.');
      return;
    }
    if (!editingOrder.clienteNome || !editingOrder.clienteTelefone) {
      alert('Por favor, informe ao menos o Nome e o WhatsApp do cliente.');
      return;
    }
    if (!editingOrder.itens || editingOrder.itens.length === 0) {
      alert('Adicione ao menos um produto ao pedido.');
      return;
    }

    // Save/link new customer to base if requested and not already registered
    if (saveCustomerToBase) {
      const normalizedPhone = editingOrder.clienteTelefone.replace(/\D/g, '');
      const alreadyExists = customers.some(
        c => c.telefone.replace(/\D/g, '') === normalizedPhone || c.nome.toLowerCase() === editingOrder.clienteNome!.trim().toLowerCase()
      );
      if (!alreadyExists) {
        onSaveCustomer({
          id: `cli-${Date.now()}`,
          nome: editingOrder.clienteNome.trim(),
          telefone: editingOrder.clienteTelefone.trim(),
          endereco: editingOrder.enderecoEntrega?.trim() || editingOrder.clienteEndereco?.trim() || '',
          detalheEntrega: editingOrder.detalheEntrega?.trim() || undefined
        });
      }
    }

    const subtotalCalc = editingOrder.itens.reduce((acc, i) => acc + (i.quantidade * i.precoUnitario), 0);
    const finalDesc = computeDiscountAmount(subtotalCalc, discountType, discountValue);
    const { subtotal, total } = calculateTotals(
      editingOrder.itens,
      editingOrder.taxaEntrega || 0,
      finalDesc
    );

    const fullOrder: Order = {
      id: editingOrder.id || `ord-${Date.now()}`,
      numeroPedido: editingOrder.numeroPedido || `#PED-${Date.now()}`,
      status: (editingOrder.status as OrderStatus) || 'CONFIRMADO',
      dataPedido: editingOrder.dataPedido || new Date().toISOString(),
      dataHoraEntrega: editingOrder.dataHoraEntrega || new Date().toISOString(),
      dataHoraEntregaFim:
        editingOrder.dataHoraEntregaFim ||
        addHoursToDateTime(editingOrder.dataHoraEntrega || new Date().toISOString(), 1),
      turnoEntrega:
        editingOrder.tipoEntrega === 'DELIVERY'
          ? editingOrder.turnoEntrega || inferDeliveryShiftFromDateTime(editingOrder.dataHoraEntrega)
          : undefined,
      tipoEntrega: (editingOrder.tipoEntrega as DeliveryType) || 'DELIVERY',
      unidadeOrigemId: editingOrder.unidadeOrigemId || units[0].id,
      unidadeRetiradaId:
        editingOrder.tipoEntrega === 'RETIRADA'
          ? editingOrder.unidadeRetiradaId || editingOrder.unidadeOrigemId
          : undefined,
      clienteNome: editingOrder.clienteNome || '',
      clienteTelefone: editingOrder.clienteTelefone || '',
      clienteEndereco: editingOrder.clienteEndereco,
      enderecoEntrega: editingOrder.tipoEntrega === 'DELIVERY' ? editingOrder.enderecoEntrega : undefined,
      valorSubtotal: subtotal,
      taxaEntrega: editingOrder.tipoEntrega === 'DELIVERY' ? (editingOrder.taxaEntrega || 0) : 0,
      desconto: finalDesc,
      valorTotal: total,
      formaPagamento: (editingOrder.formaPagamento as PaymentMethod) || 'pix',
      statusPagamento: getEffectivePaymentStatus(editingOrder),
      valorPago:
        getEffectivePaymentStatus(editingOrder) === 'PAGO'
          ? total
          : getEffectivePaymentStatus(editingOrder) === 'SINAL'
          ? getOrderPaidAmount({ ...editingOrder, valorTotal: total })
          : 0,
      trocoPara: editingOrder.trocoPara,
      instrucoesPagamento: editingOrder.instrucoesPagamento,
      observacoes: editingOrder.observacoes,
      detalheEntrega: editingOrder.detalheEntrega,
      itens: editingOrder.itens
    };

    onSaveOrder(fullOrder);
    setIsModalOpen(false);
    setImportBanner(null);
  };

  const [routeCalcBadge, setRouteCalcBadge] = useState<string | null>(null);

  const handleOpenEditOrder = (order: Order) => {
    routeCalcRequestIdRef.current += 1;
    setImportBanner(null);
    setRouteCalcBadge(null);
    updateDiscountConfig('R$', order.desconto || 0);
    setSelectedProdToAdd(products.find(p => p.ativo)?.id || '');
    setSelectedQtyToAdd(1);
    setEditingOrder({
      ...order,
      dataHoraEntrega: toLocalDateTimeInput(order.dataHoraEntrega),
      dataHoraEntregaFim: order.dataHoraEntregaFim
        ? toLocalDateTimeInput(order.dataHoraEntregaFim)
        : addHoursToDateTime(toLocalDateTimeInput(order.dataHoraEntrega), 1),
      turnoEntrega:
        order.turnoEntrega ||
        (order.tipoEntrega === 'DELIVERY'
          ? inferDeliveryShiftFromDateTime(order.dataHoraEntrega)
          : undefined),
      itens: (order.itens || []).map(i => ({ ...i }))
    });
    setIsModalOpen(true);
  };

  const recalculateNearestStoreAndFee = async (
    addr: string,
    cep: string | undefined,
    itensToCalc?: OrderItem[],
    preferExplicitUnitId?: string,
    preserveExplicitFee?: number
  ) => {
    if (!addr.trim() && !(cep || '').replace(/\D/g, '')) return;
    const requestId = ++routeCalcRequestIdRef.current;
    setRouteCalcBadge('Calculando loja mais próxima e taxa...');
    try {
      const res = await calculateNearestUnitAndDeliveryFee(addr, cep, units);
      if (requestId !== routeCalcRequestIdRef.current) return;
      const { type: activeDiscountType, value: activeDiscountValue } = discountConfigRef.current;
      const resolvedFee = preserveExplicitFee !== undefined ? preserveExplicitFee : res.deliveryFee;

      setEditingOrder(prev => {
        const items = itensToCalc || prev.itens || [];
        const fee = prev.tipoEntrega === 'RETIRADA' ? 0 : resolvedFee;
        const rawSubtotal = Number(items.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0).toFixed(2));
        const computedDesc = computeDiscountAmount(rawSubtotal, activeDiscountType, activeDiscountValue);
        const { subtotal, total } = calculateTotals(items, fee, computedDesc);
        return {
          ...prev,
          unidadeOrigemId: preferExplicitUnitId || res.nearestUnit?.id || prev.unidadeOrigemId,
          taxaEntrega: fee,
          desconto: computedDesc,
          valorSubtotal: subtotal,
          valorTotal: total
        };
      });
      setRouteCalcBadge(
        `Loja mais próxima: ${res.nearestUnit?.nome} (~${res.distanceKm} km) • Taxa: R$ ${formatCurrencyBR(resolvedFee)}`
      );
    } catch {
      if (requestId === routeCalcRequestIdRef.current) {
        setRouteCalcBadge(null);
      }
    }
  };

  const handleWhatsAppOrderParsed = (parsed: ParsedWhatsAppOrder) => {
    routeCalcRequestIdRef.current += 1;
    const defaultFee = getWhatsAppAutomationSettings().defaultDeliveryFee ?? 18.0;
    const hasExplicitTaxa = parsed.taxaEntrega !== undefined;
    const taxa =
      parsed.tipoEntrega === 'DELIVERY'
        ? hasExplicitTaxa
          ? parsed.taxaEntrega!
          : defaultFee
        : 0.0;
    const desconto = Number((parsed.desconto || 0).toFixed(2));
    const { subtotal, total } = calculateTotals(parsed.itens, taxa, desconto);
    setRouteCalcBadge(null);
    updateDiscountConfig('R$', desconto);

    setEditingOrder({
      numeroPedido: `#PED-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'CONFIRMADO',
      dataPedido: new Date().toISOString(),
      dataHoraEntrega: parsed.dataHoraEntrega,
      dataHoraEntregaFim: parsed.dataHoraEntregaFim || addHoursToDateTime(parsed.dataHoraEntrega, 1),
      turnoEntrega: parsed.turnoEntrega,
      tipoEntrega: parsed.tipoEntrega,
      unidadeOrigemId: parsed.unidadeSugeridaId || (activeUnitId !== 'all' ? activeUnitId : units[0]?.id || 'u-central'),
      unidadeRetiradaId: parsed.tipoEntrega === 'RETIRADA'
        ? (parsed.unidadeSugeridaId || (activeUnitId !== 'all' ? activeUnitId : units[0]?.id))
        : undefined,
      clienteNome: parsed.clienteNome,
      clienteTelefone: parsed.clienteTelefone,
      clienteEndereco: parsed.enderecoEntrega || '',
      enderecoEntrega: parsed.enderecoEntrega || '',
      taxaEntrega: taxa,
      desconto,
      valorSubtotal: subtotal,
      valorTotal: total,
      formaPagamento: parsed.formaPagamento,
      trocoPara: parsed.trocoPara,
      instrucoesPagamento: '',
      observacoes: parsed.observacoes || '',
      itens: parsed.itens
    });

    if (parsed.tipoEntrega === 'DELIVERY' && parsed.enderecoEntrega) {
      if (!hasExplicitTaxa) {
        recalculateNearestStoreAndFee(
          parsed.enderecoEntrega,
          undefined,
          parsed.itens,
          parsed.unidadeSugeridaId
        );
      } else if (!parsed.unidadeSugeridaId) {
        recalculateNearestStoreAndFee(
          parsed.enderecoEntrega,
          undefined,
          parsed.itens,
          undefined,
          taxa
        );
      }
    }

    setImportBanner({
      source: parsed.source,
      unmatchedItems: parsed.unmatchedItems,
      fallbackReason: parsed.fallbackReason
    });
    setIsModalOpen(true);
  };

  const handleCopySummary = (order: Partial<Order>) => {
    const prodMap = new Map(products.map(p => [p.id, p]));
    const originUnit = units.find(u => u.id === order.unidadeOrigemId) || units[0];
    const pickupUnit = resolveOrderUnit(order, units) || originUnit;
    const pickupAddress = formatUnitAddress(pickupUnit);

    const itensText = (order.itens || [])
      .map(i => `• ${i.quantidade}x ${prodMap.get(i.produtoId)?.descricao || 'Item'} (R$ ${formatCurrencyBR(i.subtotal)})`)
      .join('\n');

    const effectiveSubtotal =
      (order.itens || []).reduce((acc, i) => acc + i.subtotal, 0) || order.valorSubtotal || 0;
    const effectiveTaxa = order.tipoEntrega === 'RETIRADA' ? 0 : order.taxaEntrega || 0;
    const effectiveDesconto = order.desconto || 0;
    const effectiveTotal = Math.max(0, effectiveSubtotal + effectiveTaxa - effectiveDesconto);
    const normalizedOrder = { ...order, valorSubtotal: effectiveSubtotal, taxaEntrega: effectiveTaxa, desconto: effectiveDesconto, valorTotal: effectiveTotal };

    const paymentLabel = {
      pix: 'PIX',
      debito: 'Cartão de Débito',
      credito: 'Cartão de Crédito',
      dinheiro: 'Dinheiro'
    }[order.formaPagamento || 'pix'];

    const payStatus = getEffectivePaymentStatus(normalizedOrder);
    const remainingAmt = getOrderRemainingAmount(normalizedOrder);
    const paymentStatusNote =
      payStatus === 'PAGO'
        ? ' • [PAGO]'
        : payStatus === 'SINAL'
        ? ` • [Sinal pago: R$ ${formatCurrencyBR(getOrderPaidAmount(normalizedOrder))} | Restante: R$ ${formatCurrencyBR(remainingAmt)}]`
        : '';

    const modalidadeLine =
      order.tipoEntrega === 'DELIVERY'
        ? `*Modalidade:* Entrega (${order.enderecoEntrega || 'Endereço informado'}${order.detalheEntrega ? ` • ${order.detalheEntrega}` : ''})`
        : `*Modalidade:* Retirada no Balcão (${pickupUnit?.nome || 'Loja'})${pickupAddress ? `\n*Endereço de Coleta:* ${pickupAddress}` : ''}`;

    const summary = `🍰 *Beju Caramelos*
Olá, *${order.clienteNome || 'Cliente'}*! Segue o resumo do seu pedido:

*Pedido:* ${order.numeroPedido}
*Data/Horário:* ${order.dataHoraEntrega ? formatDeliveryTimeRange(order.dataHoraEntrega, order.dataHoraEntregaFim, { tipoEntrega: order.tipoEntrega, turnoEntrega: order.tipoEntrega === 'DELIVERY' ? order.turnoEntrega : undefined }) : 'A combinar'}
${modalidadeLine}

*Itens Solicitados:*
${itensText}

*Subtotal:* R$ ${formatCurrencyBR(effectiveSubtotal)}
${order.tipoEntrega === 'DELIVERY' || effectiveTaxa > 0 ? `*Taxa de Entrega:* R$ ${formatCurrencyBR(effectiveTaxa)}\n` : ''}${effectiveDesconto > 0 ? `*Desconto:* -R$ ${formatCurrencyBR(effectiveDesconto)}\n` : ''}*TOTAL:* R$ ${formatCurrencyBR(effectiveTotal)}

*Pagamento:* ${paymentLabel}${paymentStatusNote}${order.trocoPara ? ` (Troco para R$ ${formatCurrencyBR(order.trocoPara)})` : ''}
${order.formaPagamento === 'pix' && payStatus !== 'PAGO' ? `*Chave PIX:* ${originUnit?.chavePix || pickupUnit?.chavePix || 'financeiro@bejucaramelos.com.br'}\n_Envie o comprovante por aqui para confirmação!_` : ''}${order.observacoes ? `\n*Obs:* ${order.observacoes}` : ''}`
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    navigator.clipboard.writeText(summary);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const ORDER_STATUS_FLOW: OrderStatus[] = ['PENDENTE', 'CONFIRMADO', 'EM_PRODUCAO', 'PRONTO', 'EM_ROTA', 'ENTREGUE'];
  const ALL_ORDER_STATUSES: OrderStatus[] = [...ORDER_STATUS_FLOW, 'CANCELADO'];
  const STATUS_BADGES: Record<OrderStatus, string> = {
    PENDENTE: 'bg-amber-100 text-amber-800 border-amber-300',
    CONFIRMADO: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    EM_PRODUCAO: 'bg-blue-100 text-blue-800 border-blue-300',
    PRONTO: 'bg-purple-100 text-purple-800 border-purple-300',
    EM_ROTA: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    ENTREGUE: 'bg-slate-100 text-slate-700 border-slate-300',
    CANCELADO: 'bg-red-100 text-red-800 border-red-300'
  };

  const handleQuickStatusChange = (order: Order, nextStatus: OrderStatus) => {
    if (order.status === nextStatus) return;
    setPendingQuickStatusConfirm({ order, nextStatus });
  };

  const renderStatusControl = (order: Order) => {
    return (
      <div
        className="inline-flex items-center print:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <select
          value={order.status}
          onChange={(e) => handleQuickStatusChange(order, e.target.value as OrderStatus)}
          aria-label={`Alterar status do pedido ${order.numeroPedido}`}
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer focus:outline-none max-w-[108px] ${STATUS_BADGES[order.status]}`}
        >
          {ALL_ORDER_STATUSES.map(st => (
            <option key={st} value={st} className="bg-white text-slate-900">
              {st}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const hideModalidade = groupBy === 'MODALIDADE';
  const hideLojaOrigem = groupBy === 'LOJA_ORIGEM';
  const visibleColumnCount = 9 - (hideModalidade ? 1 : 0) - (hideLojaOrigem ? 1 : 0);

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Top Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between md:bg-white md:border-b md:border-[#e2e8f0] md:px-6 md:py-4 md:gap-4 print:hidden">
        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2.5 md:p-0 md:bg-transparent md:border-b-0">
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex flex-wrap items-center gap-2">
            <span>Pedidos</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {filteredOrders.length} pedidos
            </span>
          </h1>
        </div>

        {/* Buttons */}
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
            onClick={() => ExcelService.exportOrders(orders, products, units)}
            title="Exportar"
            aria-label="Exportar"
            className="flex items-center justify-center h-8 w-8 p-0 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Download className="w-4 h-4 text-slate-500" />
          </button>

          <button
            onClick={() => setIsWhatsAppModalOpen(true)}
            title="Importar"
            aria-label="Importar"
            className="flex items-center justify-center gap-1.5 h-8 w-8 md:w-auto px-0 md:px-3 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-all shadow-xs active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              fillRule="evenodd"
              aria-hidden="true"
              className="w-4 h-4 text-emerald-600 shrink-0"
            >
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.79 14.12c-.24.68-1.38 1.3-1.91 1.38-.5.07-1.13.1-1.82-.12-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.18-4.94-4.38-.14-.2-1.18-1.57-1.18-3s.75-2.12 1.01-2.41c.27-.29.58-.36.77-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.24.59.82 2.01.89 2.15.07.15.12.32.02.52-.1.2-.15.32-.29.49-.15.17-.3.38-.44.51-.14.14-.3.3-.13.59.17.29.76 1.26 1.64 2.04 1.13 1 2.08 1.31 2.38 1.46.29.15.46.12.63-.07.17-.2.73-.85.92-1.14.2-.29.39-.24.66-.14.27.1 1.71.81 2 .95.29.15.49.22.56.34.08.13.08.73-.16 1.41z" />
            </svg>
            <span className="hidden md:inline">Importar</span>
          </button>

          <button
            onClick={() => {
              routeCalcRequestIdRef.current += 1;
              setImportBanner(null);
              setRouteCalcBadge(null);
              updateDiscountConfig('R$', 0);
              setSelectedProdToAdd(products.find(p => p.ativo)?.id || '');
              setSelectedQtyToAdd(1);
              const nowLocal = getCurrentLocalDateTime();
              setEditingOrder({
                numeroPedido: `#PED-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
                status: 'CONFIRMADO',
                dataPedido: new Date().toISOString(),
                dataHoraEntrega: nowLocal,
                dataHoraEntregaFim: addHoursToDateTime(nowLocal, 1),
                turnoEntrega: inferDeliveryShiftFromDateTime(nowLocal),
                tipoEntrega: 'DELIVERY',
                unidadeOrigemId: activeUnitId !== 'all' ? activeUnitId : units[0]?.id || 'u-central',
                clienteNome: '',
                clienteTelefone: '',
                clienteEndereco: '',
                enderecoEntrega: '',
                taxaEntrega: getWhatsAppAutomationSettings().defaultDeliveryFee ?? 18.00,
                desconto: 0.00,
                formaPagamento: 'pix',
                statusPagamento: 'PENDENTE',
                trocoPara: undefined,
                instrucoesPagamento: '',
                observacoes: '',
                itens: []
              });
              setIsModalOpen(true);
            }}
            title="Novo Pedido"
            aria-label="Novo Pedido"
            className="flex items-center justify-center gap-1.5 h-8 w-8 md:w-auto px-0 md:px-3.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Pedido</span>
          </button>

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

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between md:bg-white/70 md:border-b md:border-[#e2e8f0] md:px-6 md:py-2.5 md:gap-3 print:hidden">
        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 flex items-center w-full md:w-auto min-w-0 overflow-hidden">
          {/* Hybrid Status Filter & Sort */}
          <HybridFilterSort
            filterLabel="Status:"
            filterValue={statusFilter}
            onFilterChange={setStatusFilter}
            filterOptions={[
              { value: 'TODOS', label: 'Todos os Status' },
              { value: 'PENDENTE', label: 'Pendente' },
              { value: 'CONFIRMADO', label: 'Confirmado' },
              { value: 'EM_PRODUCAO', label: 'Em Produção' },
              { value: 'PRONTO', label: 'Pronto' },
              { value: 'EM_ROTA', label: 'Em Rota' },
              { value: 'ENTREGUE', label: 'Entregue' }
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
            onGroupChange={(v) => setGroupBy(v as 'NENHUM' | 'MODALIDADE' | 'LOJA_ORIGEM')}
            groupOptions={[
              { value: 'LOJA_ORIGEM', label: 'Loja Origem' },
              { value: 'MODALIDADE', label: 'Entrega / Retirada' },
              { value: 'NENHUM', label: 'Sem Agrupamento' }
            ]}
          />
        </div>

        {/* Search */}
        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 w-full md:flex-1 md:min-w-[140px] md:max-w-xs">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por Nº, cliente ou WhatsApp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-3 py-0 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Orders Table / Cards */}
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
            title="Pedidos"
            badge="Pedidos"
            subtitle={
              groupBy === 'MODALIDADE'
                ? `Agrupado por Entrega / Retirada • ${filteredOrders.length} pedido(s)`
                : groupBy === 'LOJA_ORIGEM'
                ? `Agrupado por Loja Origem • ${filteredOrders.length} pedido(s)`
                : `${filteredOrders.length} pedido(s)`
            }
          />
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-[#f8f9ff] border-b border-[#e2e8f0] text-[10px] font-mono font-semibold uppercase text-slate-500 tracking-tight">
              <tr>
                <th className="py-2 px-1.5">Nº Pedido</th>
                <th className="py-2 px-1.5">Data Combinada</th>
                <th className="py-2 px-1.5">Cliente & WhatsApp</th>
                {!hideModalidade && <th className="py-2 px-1.5">Modalidade</th>}
                {!hideLojaOrigem && <th className="py-2 px-1.5">Loja Origem</th>}
                <th className="py-2 px-1.5">Pagamento</th>
                <th className="py-2 px-1.5 text-right">Total (R$)</th>
                <th className="py-2 px-1.5 text-center">Status</th>
                <th className="py-2 px-1.5 text-center print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="py-12 text-center text-slate-400 text-xs">
                    Nenhum pedido encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                (() => {
                  const groups = (() => {
                    if (groupBy === 'NENHUM') {
                      return [{ key: 'ALL', label: '', orders: filteredOrders }];
                    }
                    const map = new Map<string, { key: string; label: string; orders: Order[] }>();
                    filteredOrders.forEach(o => {
                      const key = groupBy === 'MODALIDADE' ? o.tipoEntrega : o.unidadeOrigemId;
                      const label =
                        groupBy === 'MODALIDADE'
                          ? o.tipoEntrega === 'DELIVERY'
                            ? 'Entrega (Delivery)'
                            : 'Retirada em Loja'
                          : units.find(u => u.id === o.unidadeOrigemId)?.nome || 'Unidade';
                      const cur = map.get(key) || { key, label, orders: [] };
                      cur.orders.push(o);
                      map.set(key, cur);
                    });
                    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
                  })();

                  return groups.map(group => {
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
                                {group.orders.length} pedido(s) • Total: R$ {formatCurrencyBR(group.orders.reduce((s, o) => s + o.valorTotal, 0))}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {expanded && group.orders.map(order => {
                  const unitIndex = units.findIndex(u => u.id === order.unidadeOrigemId);
                  const unit = unitIndex >= 0 ? units[unitIndex] : undefined;
                  const unitTextColors = [
                    'text-amber-700',
                    'text-rose-700',
                    'text-indigo-700',
                    'text-emerald-700',
                    'text-purple-700',
                    'text-cyan-700',
                    'text-orange-700',
                    'text-teal-700'
                  ];
                  const unitColorClass = unitIndex >= 0 ? unitTextColors[unitIndex % unitTextColors.length] : 'text-slate-600';

                  const statusBadges: Record<OrderStatus, string> = {
                    PENDENTE: 'bg-amber-100 text-amber-800 border-amber-300',
                    CONFIRMADO: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                    EM_PRODUCAO: 'bg-blue-100 text-blue-800 border-blue-300',
                    PRONTO: 'bg-purple-100 text-purple-800 border-purple-300',
                    EM_ROTA: 'bg-indigo-100 text-indigo-800 border-indigo-300',
                    ENTREGUE: 'bg-slate-100 text-slate-700 border-slate-300',
                    CANCELADO: 'bg-red-100 text-red-800 border-red-300'
                  };

                  const isRep = isReplenishmentOrder(order);
                  const isSelected = isModalOpen && editingOrder.id === order.id;
                  return (
                    <tr
                      key={order.id}
                      onClick={() => {
                        onSelectOrder(order);
                        handleOpenEditOrder(order);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? `bg-brand-50/70 ring-1 ring-inset ring-brand-400 border-l-4 ${
                              isRep ? 'border-l-sky-500' : 'border-l-brand-600'
                            }`
                          : isRep
                          ? 'bg-sky-50/90 hover:bg-sky-100/80 border-l-4 border-l-sky-500'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2 px-1.5 font-mono text-[11px] font-bold text-slate-900 whitespace-nowrap">
                        <div>{order.numeroPedido}</div>
                        {isRep && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-sans font-bold uppercase tracking-wider">
                            Reposição
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-1.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                        <div>
                          {formatDeliveryTimeRange(order.dataHoraEntrega, order.dataHoraEntregaFim, {
                            tipoEntrega: order.tipoEntrega,
                            turnoEntrega: order.tipoEntrega === 'DELIVERY' ? order.turnoEntrega : undefined
                          })}
                        </div>
                        {order.detalheEntrega && (
                          <div
                            className="text-[10px] font-sans font-medium text-blue-600 mt-0.5 max-w-[140px] truncate"
                            title={order.detalheEntrega}
                          >
                            {order.detalheEntrega}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-1.5 max-w-[140px]">
                        <div className="font-semibold text-slate-900 text-xs max-w-[135px] truncate" title={order.clienteNome}>{order.clienteNome}</div>
                        <div className="text-[10px] font-mono text-emerald-700 flex items-center gap-1 mt-0.5 whitespace-nowrap">
                          {normalizePhoneForWhatsApp(order.clienteTelefone) ? (
                            <a
                              href={`https://wa.me/${normalizePhoneForWhatsApp(order.clienteTelefone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Abrir conversa no WhatsApp"
                              className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 hover:underline"
                            >
                              <Phone className="w-3 h-3 shrink-0" />
                              <span>{order.clienteTelefone}</span>
                            </a>
                          ) : (
                            <>
                              <Phone className="w-3 h-3 shrink-0" />
                              <span>{order.clienteTelefone}</span>
                            </>
                          )}
                        </div>
                      </td>
                      {!hideModalidade && (
                      <td className="py-2 px-1.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                          order.tipoEntrega === 'DELIVERY'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {order.tipoEntrega === 'DELIVERY' ? <Truck className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                          {order.tipoEntrega === 'DELIVERY' ? 'Entrega' : 'Retirada'}
                        </span>
                      </td>
                      )}
                      {!hideLojaOrigem && (
                      <td className={`py-2 px-1.5 font-semibold text-[11px] max-w-[100px] truncate ${unitColorClass}`} title={unit?.nome || '-'}>
                        {unit?.nome || '-'}
                      </td>
                      )}
                      <td className="py-2 px-1.5 whitespace-nowrap">
                        {isRep ? (
                          <span className="text-[11px] font-semibold text-sky-700">—</span>
                        ) : (() => {
                          const payStatus = getEffectivePaymentStatus(order);
                          const remaining = getOrderRemainingAmount(order);
                          return (
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="font-mono uppercase font-semibold text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 border border-slate-200">
                                {order.formaPagamento}
                              </span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${PAYMENT_STATUS_BADGE_CLASSES[payStatus]}`}>
                                {payStatus === 'SINAL'
                                  ? `Sinal • Cobrar R$ ${formatCurrencyBR(remaining)}`
                                  : PAYMENT_STATUS_LABELS[payStatus]}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-1.5 font-mono text-[11px] font-bold text-right text-slate-900 whitespace-nowrap">
                        R$ {formatCurrencyBR(order.valorTotal)}
                      </td>
                      <td className="py-2 px-1.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {renderStatusControl(order)}
                        <span className={`hidden print:inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_BADGES[order.status]}`}>
                          {order.status}
                        </span>
                      </td>
                      <td
                        className="py-2 px-1.5 text-center print:hidden whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => {
                              const msg = formatStatusNotificationMessage(order, order.status, products, units);
                              dispatchWhatsAppMessage(order.clienteTelefone, msg);
                            }}
                            title={`Notificar status (${order.status}) no WhatsApp`}
                            className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCopySummary(order)}
                            title="Copiar Resumo para WhatsApp"
                            className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {order.status === 'PENDENTE' && onDeleteOrder && (
                            <button
                              type="button"
                              onClick={() => setOrderToDelete(order)}
                              title="Excluir Pedido Pendente"
                              aria-label="Excluir Pedido Pendente"
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                    </React.Fragment>
                    );
                  });
                })()
              )}
            </tbody>
          </table>
        </div>

        {viewMode === 'CARDS' && (
          <div className="space-y-6 print:hidden">
            {filteredOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs bg-white border border-slate-200 rounded-xl">
                Nenhum pedido encontrado com os filtros atuais.
              </div>
            ) : (
              (() => {
                const map = new Map<string, { key: string; label: string; orders: Order[] }>();
                filteredOrders.forEach(o => {
                  const key =
                    groupBy === 'NENHUM'
                      ? 'ALL'
                      : groupBy === 'MODALIDADE'
                      ? o.tipoEntrega
                      : o.unidadeOrigemId;
                  const label =
                    groupBy === 'NENHUM'
                      ? ''
                      : groupBy === 'MODALIDADE'
                      ? o.tipoEntrega === 'DELIVERY'
                        ? 'Entrega (Delivery)'
                        : 'Retirada em Loja'
                      : units.find(u => u.id === o.unidadeOrigemId)?.nome || 'Unidade';
                  const cur = map.get(key) || { key, label, orders: [] };
                  cur.orders.push(o);
                  map.set(key, cur);
                });
                return Array.from(map.values())
                  .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
                  .map(group => {
                  const expanded = isGroupExpanded(group.key, groupBy !== 'NENHUM');
                  return (
                  <div key={group.key} className="space-y-3">
                    {group.label && (
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
                          {group.orders.length} pedido(s) • R$ {formatCurrencyBR(group.orders.reduce((s, o) => s + o.valorTotal, 0))}
                        </span>
                      </button>
                    )}
                    {expanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.orders.map(order => {
                        const unit = units.find(u => u.id === order.unidadeOrigemId);
                        const isRep = isReplenishmentOrder(order);
                        const isSelected = isModalOpen && editingOrder.id === order.id;
                        return (
                          <div
                            key={order.id}
                            onClick={() => {
                              onSelectOrder(order);
                              handleOpenEditOrder(order);
                            }}
                            className={`border rounded-xl p-4 shadow-xs transition-colors cursor-pointer flex flex-col justify-between gap-3 min-w-0 overflow-hidden ${
                              isRep ? REPLENISHMENT_CARD_STYLE : ORDER_CARD_STATUS_STYLES[order.status]
                            }${isSelected ? ' ring-2 ring-brand-500 shadow-md' : ''}`}
                          >
                            <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-xs text-slate-900">{order.numeroPedido}</span>
                                  {isRep && (
                                    <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-bold uppercase">
                                      Reposição
                                    </span>
                                  )}
                                </div>
                                {!hideLojaOrigem && (
                                  <span className="block text-[10px] text-slate-500">{unit?.nome || '-'}</span>
                                )}
                              </div>
                              {renderStatusControl(order)}
                              <span className="hidden print:inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                {order.status}
                              </span>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="font-bold text-slate-900">{order.clienteNome}</div>
                              {normalizePhoneForWhatsApp(order.clienteTelefone) ? (
                                <a
                                  href={`https://wa.me/${normalizePhoneForWhatsApp(order.clienteTelefone)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Abrir conversa no WhatsApp"
                                  className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-700 hover:text-emerald-800 hover:underline"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>{order.clienteTelefone}</span>
                                </a>
                              ) : (
                                <div className="font-mono text-[11px] text-emerald-700">{order.clienteTelefone}</div>
                              )}
                              <div className="text-[11px] text-slate-500">
                                {formatDeliveryTimeRange(order.dataHoraEntrega, order.dataHoraEntregaFim, {
                                  tipoEntrega: order.tipoEntrega,
                                  turnoEntrega: order.tipoEntrega === 'DELIVERY' ? order.turnoEntrega : undefined
                                })}
                                {!hideModalidade && (
                                  <>
                                    {' '}• {order.tipoEntrega === 'DELIVERY' ? 'Entrega' : 'Retirada'}
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                <span className="font-mono font-bold text-sm text-slate-900">R$ {formatCurrencyBR(order.valorTotal)}</span>
                                {!isRep && (() => {
                                  const payStatus = getEffectivePaymentStatus(order);
                                  const remaining = getOrderRemainingAmount(order);
                                  return (
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PAYMENT_STATUS_BADGE_CLASSES[payStatus]}`}>
                                      {payStatus === 'SINAL'
                                        ? `Sinal • Cobrar R$ ${formatCurrencyBR(remaining)}`
                                        : PAYMENT_STATUS_LABELS[payStatus]}
                                    </span>
                                  );
                                })()}
                              </div>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    const msg = formatStatusNotificationMessage(order, order.status, products, units);
                                    dispatchWhatsAppMessage(order.clienteTelefone, msg);
                                  }}
                                  className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg"
                                  title={`Notificar status (${order.status}) no WhatsApp`}
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleCopySummary(order)}
                                  className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
                                  title="Copiar Resumo WhatsApp"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                {order.status === 'PENDENTE' && onDeleteOrder && (
                                  <button
                                    type="button"
                                    onClick={() => setOrderToDelete(order)}
                                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                                    title="Excluir Pedido Pendente"
                                    aria-label="Excluir Pedido Pendente"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                  );
                });
              })()
            )}
          </div>
        )}
      </div>

      {/* NEW / EDIT ORDER MODAL (Logical Order) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 font-sans">
                  {editingOrder.id ? 'Editar Pedido' : 'Novo Pedido'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-2.5 sm:p-5 space-y-2 sm:space-y-4">
              {importBanner && (
                <div className={`p-2.5 sm:p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                  importBanner.source === 'gemini'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  {importBanner.source === 'gemini' ? (
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold">
                      {importBanner.source === 'gemini'
                        ? 'Pedido preenchido automaticamente via Gemini AI (Supabase Edge Function)'
                        : 'Pedido preenchido via Parser Inteligente Local'}
                    </p>
                    {importBanner.fallbackReason && (
                      <p className="text-[11px] opacity-85">{importBanner.fallbackReason}</p>
                    )}
                    {importBanner.unmatchedItems.length > 0 && (
                      <p className="text-[11px] font-semibold text-red-700">
                        ⚠️ Itens não encontrados no catálogo (selecione manualmente abaixo): {importBanner.unmatchedItems.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* PASSO 1: DADOS DO PEDIDO & LOJA */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 sm:p-3.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    1. Dados do Pedido
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-200/80 border border-slate-300 text-slate-800 font-mono text-xs font-bold">
                    {editingOrder.numeroPedido || ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Status</label>
                    <select
                      value={editingOrder.status}
                      onChange={(e) => {
                        const nextStatus = e.target.value as OrderStatus;
                        if (nextStatus === editingOrder.status) return;
                        const savedOrder = editingOrder.id ? orders.find(o => o.id === editingOrder.id) : undefined;
                        if (savedOrder?.status === 'ENTREGUE' && nextStatus !== 'ENTREGUE') {
                          setPendingStatusChange(nextStatus);
                          setStatusAuthPin('');
                          setStatusAuthError('');
                          return;
                        }
                        setPendingModalStatusConfirm(nextStatus);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-medium"
                    >
                      <option value="PENDENTE">Pendente</option>
                      <option value="CONFIRMADO">Confirmado</option>
                      <option value="EM_PRODUCAO">Em Produção</option>
                      <option value="PRONTO">Pronto</option>
                      <option value="EM_ROTA">Em Rota</option>
                      <option value="ENTREGUE">Entregue</option>
                      <option value="CANCELADO">Cancelado</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Loja de Origem</label>
                    <select
                      value={editingOrder.unidadeOrigemId}
                      onChange={(e) => {
                        const newUnitId = e.target.value;
                        const isRepEditing = isReplenishmentOrder({
                          numeroPedido: editingOrder.numeroPedido || '',
                          observacoes: editingOrder.observacoes
                        });
                        if (isRepEditing) {
                          const targetUnit = units.find(u => u.id === newUnitId);
                          if (targetUnit) {
                            setEditingOrder({
                              ...editingOrder,
                              unidadeOrigemId: newUnitId,
                              clienteNome: `Reposição — ${targetUnit.nome}`,
                              clienteTelefone: targetUnit.telefone || editingOrder.clienteTelefone,
                              clienteEndereco: targetUnit.endereco,
                              enderecoEntrega: `${targetUnit.endereco}, ${targetUnit.cidade}`
                            });
                            return;
                          }
                        }
                        setEditingOrder({ ...editingOrder, unidadeOrigemId: newUnitId });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-medium"
                    >
                      {units.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* PASSO 2: DADOS DO CLIENTE */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 sm:p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    2. Dados do Cliente
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 text-xs">
                  <div className="relative">
                    <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Nome Completo *</label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Digite o nome ou pesquise por nome/tel..."
                        value={editingOrder.clienteNome || ''}
                        onFocus={() => setShowCustomerSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 180)}
                        onChange={(e) => {
                          setEditingOrder({ ...editingOrder, clienteNome: e.target.value });
                          setShowCustomerSuggestions(true);
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 sm:py-2 focus:outline-none focus:border-brand-500"
                      />
                    </div>
                    {showCustomerSuggestions && (() => {
                      const query = (editingOrder.clienteNome || '').trim().toLowerCase();
                      const rawQuery = (editingOrder.clienteNome || '').trim();
                      const matched = customers.filter(c =>
                        !query ||
                        c.nome.toLowerCase().includes(query) ||
                        c.telefone.includes(rawQuery)
                      );
                      if (matched.length === 0) return null;
                      return (
                        <div className="absolute right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-30 divide-y divide-slate-100">
                          {matched.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setEditingOrder(prev => ({
                                  ...prev,
                                  clienteNome: c.nome,
                                  clienteTelefone: c.telefone,
                                  clienteEndereco: c.endereco,
                                  enderecoEntrega: c.endereco,
                                  detalheEntrega: c.detalheEntrega || ''
                                }));
                                setShowCustomerSuggestions(false);
                                if (c.endereco || c.cep) {
                                  recalculateNearestStoreAndFee(c.endereco, c.cep);
                                }
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors text-xs cursor-pointer"
                            >
                              <div className="font-bold text-slate-900">{c.nome}</div>
                              <div className="text-[10px] font-mono text-slate-500">{c.telefone}</div>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Telefone WhatsApp *</label>
                    <input
                      type="text"
                      placeholder="Ex: +55 (11) 98765-4321"
                      value={editingOrder.clienteTelefone || ''}
                      onChange={(e) => setEditingOrder({ ...editingOrder, clienteTelefone: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono"
                    />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveCustomerToBase}
                    onChange={(e) => setSaveCustomerToBase(e.target.checked)}
                    className="rounded text-brand-600 focus:ring-brand-500"
                  />
                  <span>Salvar automaticamente no Cadastro de Clientes caso seja um novo cliente</span>
                </label>
              </div>

              {/* PASSO 3: MODALIDADE & ENDEREÇO */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 sm:p-3.5">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  3. Dados da Entrega
                </span>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                      <input
                        type="radio"
                        name="modalidade"
                        checked={editingOrder.tipoEntrega === 'DELIVERY'}
                        onChange={() => {
                          const currentDate = (editingOrder.dataHoraEntrega || getCurrentLocalDateTime()).slice(0, 10);
                          const shift = editingOrder.turnoEntrega || inferDeliveryShiftFromDateTime(editingOrder.dataHoraEntrega);
                          const { start, end } = applyDeliveryShiftToDate(currentDate, shift);
                          const items = editingOrder.itens || [];
                          const sub = Number(items.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0).toFixed(2));
                          const descAmt = computeDiscountAmount(sub, discountConfigRef.current.type, discountConfigRef.current.value);
                          const { subtotal, total } = calculateTotals(items, editingOrder.taxaEntrega || 0, descAmt);
                          setEditingOrder({
                            ...editingOrder,
                            tipoEntrega: 'DELIVERY',
                            unidadeRetiradaId: undefined,
                            turnoEntrega: shift,
                            dataHoraEntrega: start,
                            dataHoraEntregaFim: end,
                            desconto: descAmt,
                            valorSubtotal: subtotal,
                            valorTotal: total
                          });
                        }}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      <span>🚚 Entrega</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                      <input
                        type="radio"
                        name="modalidade"
                        checked={editingOrder.tipoEntrega === 'RETIRADA'}
                        onChange={() => {
                          const items = editingOrder.itens || [];
                          const sub = Number(items.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0).toFixed(2));
                          const descAmt = computeDiscountAmount(sub, discountConfigRef.current.type, discountConfigRef.current.value);
                          const { subtotal, total } = calculateTotals(items, 0, descAmt);
                          setEditingOrder({
                            ...editingOrder,
                            tipoEntrega: 'RETIRADA',
                            unidadeRetiradaId: editingOrder.unidadeRetiradaId || editingOrder.unidadeOrigemId,
                            turnoEntrega: undefined,
                            taxaEntrega: 0,
                            desconto: descAmt,
                            valorSubtotal: subtotal,
                            valorTotal: total
                          });
                        }}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      <span>🏪 Retirada</span>
                    </label>
                  </div>

                  {editingOrder.tipoEntrega === 'DELIVERY' ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 sm:gap-3">
                        <div className="min-w-0 sm:w-[155px] sm:shrink-0">
                          <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Data da Entrega *</label>
                          <input
                            type="date"
                            required
                            aria-label="Data da entrega"
                            min={!editingOrder.id ? getCurrentLocalDateTime().slice(0, 10) : undefined}
                            value={(editingOrder.dataHoraEntrega || getCurrentLocalDateTime()).slice(0, 10)}
                            onChange={(e) => {
                              const newDate = e.target.value;
                              if (!newDate) return;
                              const shift =
                                editingOrder.turnoEntrega ||
                                inferDeliveryShiftFromDateTime(editingOrder.dataHoraEntrega);
                              const { start, end } = applyDeliveryShiftToDate(newDate, shift);
                              setEditingOrder({
                                ...editingOrder,
                                turnoEntrega: shift,
                                dataHoraEntrega: start,
                                dataHoraEntregaFim: end
                              });
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono text-xs"
                          />
                        </div>
                        <div className="min-w-0 sm:w-[130px] sm:shrink-0">
                          <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Turno *</label>
                          <select
                            value={
                              editingOrder.turnoEntrega ||
                              inferDeliveryShiftFromDateTime(editingOrder.dataHoraEntrega)
                            }
                            onChange={(e) => {
                              const newShift = e.target.value as DeliveryShift;
                              const currentDate = (editingOrder.dataHoraEntrega || getCurrentLocalDateTime()).slice(0, 10);
                              const { start, end } = applyDeliveryShiftToDate(currentDate, newShift);
                              setEditingOrder({
                                ...editingOrder,
                                turnoEntrega: newShift,
                                dataHoraEntrega: start,
                                dataHoraEntregaFim: end
                              });
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-medium"
                          >
                            <option value="MANHA">Manhã</option>
                            <option value="TARDE">Tarde</option>
                            <option value="NOITE">Noite</option>
                          </select>
                        </div>
                        <div className="col-span-2 sm:flex-1 sm:min-w-[200px]">
                          <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Observação da Entrega</label>
                          <input
                            type="text"
                            placeholder="Ex: Portaria, interfone 51, horário preferido..."
                            value={editingOrder.detalheEntrega || ''}
                            onChange={(e) => setEditingOrder({ ...editingOrder, detalheEntrega: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                          />
                        </div>
                      </div>
                      {editingOrder.clienteEndereco && (
                        <div className="p-2 sm:p-2.5 rounded-lg bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
                          <div className="text-[11px] text-slate-600 truncate max-w-full">
                            <span className="font-semibold text-slate-700">Endereço cadastrado:</span> {editingOrder.clienteEndereco}
                          </div>
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={editingOrder.enderecoEntrega !== editingOrder.clienteEndereco}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditingOrder({ ...editingOrder, enderecoEntrega: '' });
                                } else {
                                  setEditingOrder({ ...editingOrder, enderecoEntrega: editingOrder.clienteEndereco || '' });
                                }
                              }}
                              className="rounded text-brand-600 focus:ring-brand-500"
                            />
                            <span>Usar endereço alternativo</span>
                          </label>
                        </div>
                      )}
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-0.5 sm:mb-1">
                          <label className="font-semibold text-slate-700">
                            {editingOrder.clienteEndereco && editingOrder.enderecoEntrega !== editingOrder.clienteEndereco
                              ? 'Endereço Alternativo de Entrega *'
                              : 'Endereço Completo de Entrega'}
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              recalculateNearestStoreAndFee(editingOrder.enderecoEntrega || '', undefined)
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:underline cursor-pointer"
                          >
                            <MapPin className="w-3 h-3" />
                            <span>Calcular Loja Mais Próxima & Taxa</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Rua, Número, Bairro, Complemento, CEP..."
                          value={editingOrder.enderecoEntrega || ''}
                          onChange={(e) => setEditingOrder({ ...editingOrder, enderecoEntrega: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                        />
                        {routeCalcBadge && (
                          <p className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 mt-1.5">
                            {routeCalcBadge}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 sm:gap-3">
                        <div className="col-span-2 sm:w-[155px] sm:shrink-0">
                          <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Data da Retirada *</label>
                          <input
                            type="date"
                            required
                            aria-label="Data da retirada"
                            min={!editingOrder.id ? getCurrentLocalDateTime().slice(0, 10) : undefined}
                            value={(editingOrder.dataHoraEntrega || getCurrentLocalDateTime()).slice(0, 10)}
                            onChange={(e) => {
                              const newDate = e.target.value;
                              if (!newDate) return;
                              const startTime = extractTimeHHmm(editingOrder.dataHoraEntrega) || '12:00';
                              const endTime = extractTimeHHmm(
                                editingOrder.dataHoraEntregaFim ||
                                  addHoursToDateTime(editingOrder.dataHoraEntrega || getCurrentLocalDateTime(), 1)
                              ) || '13:00';
                              setEditingOrder({
                                ...editingOrder,
                                dataHoraEntrega: `${newDate}T${startTime}`,
                                dataHoraEntregaFim: `${newDate}T${endTime}`
                              });
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono text-xs"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Das *</label>
                          <TimeSelect15
                            ariaLabel="Hora inicial da retirada"
                            className="w-full py-1.5 sm:w-auto sm:py-2"
                            value={extractTimeHHmm(editingOrder.dataHoraEntrega || getCurrentLocalDateTime())}
                            onChange={(hhmm) => {
                              const newStart = combineDateWithTime(
                                editingOrder.dataHoraEntrega || getCurrentLocalDateTime(),
                                hhmm
                              );
                              if (newStart) {
                                setEditingOrder({
                                  ...editingOrder,
                                  dataHoraEntrega: newStart,
                                  dataHoraEntregaFim: addHoursToDateTime(newStart, 1)
                                });
                              }
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Às</label>
                          <TimeSelect15
                            ariaLabel="Hora final da retirada"
                            className="w-full py-1.5 sm:w-auto sm:py-2"
                            value={extractTimeHHmm(
                              editingOrder.dataHoraEntregaFim ||
                                addHoursToDateTime(editingOrder.dataHoraEntrega || getCurrentLocalDateTime(), 1)
                            )}
                            onChange={(hhmm) => {
                              const newEnd = combineDateWithTime(
                                editingOrder.dataHoraEntrega || getCurrentLocalDateTime(),
                                hhmm
                              );
                              if (newEnd) {
                                setEditingOrder({ ...editingOrder, dataHoraEntregaFim: newEnd });
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Local de Retirada (Loja ou Ateliê de Produção)</label>
                        <select
                          value={editingOrder.unidadeRetiradaId || editingOrder.unidadeOrigemId}
                          onChange={(e) => setEditingOrder({ ...editingOrder, unidadeRetiradaId: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-medium"
                        >
                          {units.filter(u => u.ativo).map(u => (
                            <option key={u.id} value={u.id}>
                              {u.tipo === 'CENTRAL' ? '🏭 [Ateliê] ' : '🏪 '}{u.nome} - {u.endereco}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* PASSO 4: ITENS DO PEDIDO */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 sm:p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    4. Produtos Solicitados
                  </span>
                  <span className="hidden sm:inline text-xs text-slate-500">
                    Selecione o produto e a quantidade na caixa abaixo
                  </span>
                </div>

                {/* Searchable Product Selection Combobox */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={productSearch}
                      onFocus={() => setShowProductSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowProductSuggestions(false), 160)}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setSelectedProdToAdd('');
                        setShowProductSuggestions(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const q = productSearch.trim().toLowerCase();
                          const matches = products
                            .filter(p => p.ativo)
                            .filter(p => !q || p.descricao.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
                          const chosen = products.find(p => p.id === selectedProdToAdd) || matches[0];
                          if (chosen) {
                            handleAddItem(chosen.id, selectedQtyToAdd);
                            setSelectedQtyToAdd(1);
                            setSelectedProdToAdd('');
                            setProductSearch('');
                            setShowProductSuggestions(false);
                          }
                        }
                      }}
                      placeholder="Digite o nome ou SKU do produto..."
                      className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-8 py-1.5 sm:py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-brand-500"
                    />
                    {productSearch && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setProductSearch('');
                          setSelectedProdToAdd('');
                          setShowProductSuggestions(true);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        title="Limpar busca"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {showProductSuggestions && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto z-30 divide-y divide-slate-100">
                        {(() => {
                          const q = productSearch.trim().toLowerCase();
                          const matches = products
                            .filter(p => p.ativo)
                            .filter(
                              p =>
                                !q ||
                                p.descricao.toLowerCase().includes(q) ||
                                p.sku.toLowerCase().includes(q)
                            );
                          if (matches.length === 0) {
                            return (
                              <div className="px-3 py-2.5 text-xs text-slate-400 italic">
                                Nenhum produto encontrado para &ldquo;{productSearch}&rdquo;.
                              </div>
                            );
                          }
                          return matches.map(prod => {
                            const unitIdForStock = editingOrder.unidadeOrigemId || '';
                            const avail =
                              stock.length > 0 && unitIdForStock
                                ? getUnitProductAvailability(stock, modalReservedMap, unitIdForStock, prod.id)
                                : null;
                            return (
                            <button
                              key={prod.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSelectedProdToAdd(prod.id);
                                setProductSearch(`${prod.sku} — ${prod.descricao}`);
                                setShowProductSuggestions(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-brand-50 transition-colors cursor-pointer ${
                                selectedProdToAdd === prod.id ? 'bg-brand-50/70 font-semibold' : ''
                              }`}
                            >
                              <span className="truncate text-slate-800">
                                <span className="font-mono text-slate-500 mr-1.5">{prod.sku}</span>
                                {prod.descricao}
                              </span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                {avail && (
                                  <span
                                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${
                                      avail.disponivel <= 0
                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}
                                  >
                                    Disp: {avail.disponivel}
                                  </span>
                                )}
                                <span className="font-mono font-bold text-brand-700">
                                  R$ {formatCurrencyBR(prod.precoUnitario)} / {prod.unidade}
                                </span>
                              </span>
                            </button>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <input
                      type="number"
                      min="1"
                      value={selectedQtyToAdd}
                      onChange={(e) => setSelectedQtyToAdd(Math.max(1, Number(e.target.value)))}
                      className="w-16 sm:w-20 bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-mono text-center font-bold"
                      title="Quantidade"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const q = productSearch.trim().toLowerCase();
                        const matches = products
                          .filter(p => p.ativo)
                          .filter(p => !q || p.descricao.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
                        const prodId = selectedProdToAdd || (matches.length === 1 ? matches[0].id : '');
                        if (!prodId) return;
                        handleAddItem(prodId, selectedQtyToAdd);
                        setSelectedQtyToAdd(1);
                        setSelectedProdToAdd('');
                        setProductSearch('');
                        setShowProductSuggestions(false);
                      }}
                      className="flex-1 sm:flex-initial justify-center flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Item</span>
                    </button>
                  </div>
                </div>

                {/* Items Table in Order */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-semibold text-[11px]">
                      <tr>
                        <th className="py-1.5 px-2 sm:py-2 sm:px-3 text-left">Produto</th>
                        <th className="py-1.5 px-2 sm:py-2 sm:px-3 text-center">Qtd</th>
                        <th className="py-1.5 px-2 sm:py-2 sm:px-3 text-right">Preço Unit.</th>
                        <th className="py-1.5 px-2 sm:py-2 sm:px-3 text-right">Subtotal</th>
                        <th className="py-1.5 px-2 sm:py-2 sm:px-3 text-center">Remover</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(editingOrder.itens || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-3 sm:py-6 text-center text-slate-400">
                            Nenhum item adicionado ainda.
                          </td>
                        </tr>
                      ) : (
                        (editingOrder.itens || []).map(item => {
                          const prod = products.find(p => p.id === item.produtoId);
                          const unitIdForStock = editingOrder.unidadeOrigemId || '';
                          const avail =
                            stock.length > 0 && unitIdForStock
                              ? getUnitProductAvailability(stock, modalReservedMap, unitIdForStock, item.produtoId)
                              : null;
                          const exceedsAvailable = avail !== null && item.quantidade > avail.disponivel;
                          return (
                            <tr key={item.id}>
                              <td className="py-1.5 px-2 sm:py-2 sm:px-3 font-medium text-slate-900">
                                <div>{prod?.descricao || 'Produto'}</div>
                                {exceedsAvailable && avail && (
                                  <span className="inline-block mt-0.5 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                    Sob encomenda / produção (Disp: {avail.disponivel})
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 sm:py-2 sm:px-3 text-center">
                                <div className="inline-flex items-center gap-1 bg-slate-100 rounded px-1.5 py-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQuantity(item.id, -1)}
                                    className="text-slate-600 hover:text-black font-bold px-1"
                                  >-</button>
                                  <span className="font-mono font-bold w-6 text-center">{item.quantidade}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQuantity(item.id, 1)}
                                    className="text-slate-600 hover:text-black font-bold px-1"
                                  >+</button>
                                </div>
                              </td>
                              <td className="py-1.5 px-2 sm:py-2 sm:px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                                R$ {formatCurrencyBR(item.precoUnitario)}
                              </td>
                              <td className="py-1.5 px-2 sm:py-2 sm:px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                R$ {formatCurrencyBR(item.subtotal)}
                              </td>
                              <td className="py-1.5 px-2 sm:py-2 sm:px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemQuantity(item.id, -item.quantidade)}
                                  className="text-rose-500 hover:text-rose-700 p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PASSO 5: FECHAMENTO FINANCEIRO & FORMAS DE PAGAMENTO */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-2.5 sm:p-3.5">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  5. Valores & Forma de Pagamento
                </span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 text-xs mb-2.5 sm:mb-3.5">
                  <div className="min-w-0">
                    <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Subtotal dos Itens</label>
                    <input
                      type="text"
                      disabled
                      value={`R$ ${formatCurrencyBR(editingOrder.valorSubtotal || 0)}`}
                      className="w-full bg-slate-100 border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono font-bold"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Taxa de Entrega (R$)</label>
                    <CurrencyInput
                      value={editingOrder.taxaEntrega || 0}
                      onChangeValue={(taxa) => {
                        const items = editingOrder.itens || [];
                        const sub = Number(items.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0).toFixed(2));
                        const descAmt = computeDiscountAmount(sub, discountConfigRef.current.type, discountConfigRef.current.value);
                        const { subtotal, total } = calculateTotals(items, taxa, descAmt);
                        setEditingOrder({ ...editingOrder, taxaEntrega: taxa, desconto: descAmt, valorSubtotal: subtotal, valorTotal: total });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Desconto</label>
                    <div className="flex items-center gap-1">
                      <select
                        value={discountType}
                        onChange={(e) => {
                          const newType = e.target.value as 'R$' | '%';
                          updateDiscountConfig(newType, discountValue);
                          const items = editingOrder.itens || [];
                          const sub = Number(items.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0).toFixed(2));
                          const descAmt = computeDiscountAmount(sub, newType, discountValue);
                          const { subtotal, total } = calculateTotals(items, editingOrder.taxaEntrega || 0, descAmt);
                          setEditingOrder({ ...editingOrder, desconto: descAmt, valorSubtotal: subtotal, valorTotal: total });
                        }}
                        className="bg-white border border-slate-300 rounded-lg px-1.5 sm:px-2 py-1.5 sm:py-2 font-mono font-bold text-slate-700"
                      >
                        <option value="R$">R$</option>
                        <option value="%">%</option>
                      </select>
                      {discountType === 'R$' ? (
                        <CurrencyInput
                          value={discountValue}
                          onChangeValue={(val) => {
                            updateDiscountConfig(discountType, val);
                            const items = editingOrder.itens || [];
                            const sub = Number(items.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0).toFixed(2));
                            const descAmt = computeDiscountAmount(sub, discountType, val);
                            const { subtotal, total } = calculateTotals(items, editingOrder.taxaEntrega || 0, descAmt);
                            setEditingOrder({ ...editingOrder, desconto: descAmt, valorSubtotal: subtotal, valorTotal: total });
                          }}
                          className="w-full min-w-0 bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono text-rose-600"
                        />
                      ) : (
                        <input
                          type="number"
                          min="0"
                          max={100}
                          step={1}
                          value={discountValue}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            updateDiscountConfig(discountType, val);
                            const items = editingOrder.itens || [];
                            const sub = Number(items.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0).toFixed(2));
                            const descAmt = computeDiscountAmount(sub, discountType, val);
                            const { subtotal, total } = calculateTotals(items, editingOrder.taxaEntrega || 0, descAmt);
                            setEditingOrder({ ...editingOrder, desconto: descAmt, valorSubtotal: subtotal, valorTotal: total });
                          }}
                          className="w-full min-w-0 bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono text-rose-600"
                        />
                      )}
                    </div>
                    {discountType === '%' && discountValue > 0 && (
                      <span className="text-[10px] font-mono text-rose-600 mt-0.5 block">
                        -R$ {formatCurrencyBR(editingOrder.desconto || 0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">TOTAL A PAGAR (R$)</label>
                    <input
                      type="text"
                      disabled
                      value={`R$ ${formatCurrencyBR(editingOrder.valorTotal || 0)}`}
                      className="w-full bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-lg p-1.5 sm:p-2 font-mono font-bold text-xs sm:text-sm"
                    />
                  </div>
                </div>

                {/* FORMAS DE PAGAMENTO: PIX, DÉBITO, CRÉDITO, DINHEIRO (oculto em Pedido Especial de Reposição) */}
                {isReplenishmentOrder({
                  numeroPedido: editingOrder.numeroPedido || '',
                  observacoes: editingOrder.observacoes
                }) ? (
                  <div className="p-2.5 sm:p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900 font-medium">
                    Pedido Especial de Reposição — transferência interna sem forma de pagamento.
                  </div>
                ) : (
                <div className="space-y-1.5 sm:space-y-2.5">
                  <label className="font-semibold text-slate-800 text-xs block">
                    Forma de Pagamento (Obrigatório):
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2">
                    {[
                      { id: 'pix', label: 'PIX Instantâneo' },
                      { id: 'debito', label: 'Cartão de Débito' },
                      { id: 'credito', label: 'Cartão de Crédito' },
                      { id: 'dinheiro', label: 'Dinheiro (Espécie)' }
                    ].map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setEditingOrder({ ...editingOrder, formaPagamento: p.id as PaymentMethod })}
                        className={`py-1.5 px-2 sm:p-2.5 rounded-lg sm:rounded-xl border text-xs font-semibold text-center transition-all ${
                          editingOrder.formaPagamento === p.id
                            ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {editingOrder.formaPagamento === 'dinheiro' && (
                    <div className="pt-1 sm:pt-2">
                      <label className="text-xs font-semibold text-slate-700 block mb-0.5 sm:mb-1">
                        Precisa de Troco para quanto? (R$)
                      </label>
                      <CurrencyInput
                        allowEmpty
                        placeholder="Ex: 100,00"
                        value={editingOrder.trocoPara}
                        onChangeValue={(val) => setEditingOrder({ ...editingOrder, trocoPara: val > 0 ? val : undefined })}
                        className="w-full sm:w-48 bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono text-xs"
                      />
                    </div>
                  )}

                  {/* Status do Pagamento: Pendente / Sinal 50% / Pago */}
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    <label className="font-semibold text-slate-800 text-xs block">
                      Situação do Pagamento:
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                      {(['PENDENTE', 'SINAL', 'PAGO'] as PaymentStatus[]).map(st => {
                        const active = getEffectivePaymentStatus(editingOrder) === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              const total = editingOrder.valorTotal || 0;
                              setEditingOrder({
                                ...editingOrder,
                                statusPagamento: st,
                                valorPago:
                                  st === 'PAGO'
                                    ? total
                                    : st === 'SINAL'
                                    ? Number((total / 2).toFixed(2))
                                    : 0,
                              });
                            }}
                            className={`py-1.5 px-2 rounded-lg border text-xs font-semibold text-center transition-all cursor-pointer ${
                              active
                                ? st === 'PAGO'
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                  : st === 'SINAL'
                                  ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                                  : 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {PAYMENT_STATUS_LABELS[st]}
                          </button>
                        );
                      })}
                    </div>

                    {getEffectivePaymentStatus(editingOrder) === 'SINAL' && (
                      <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-1">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                            Valor do Sinal Pago (R$)
                          </label>
                          <CurrencyInput
                            allowEmpty
                            value={getOrderPaidAmount(editingOrder)}
                            onChangeValue={(val) => {
                              const total = editingOrder.valorTotal || 0;
                              const clamped = Math.min(total, Math.max(0, val));
                              setEditingOrder({
                                ...editingOrder,
                                statusPagamento: 'SINAL',
                                valorPago: clamped,
                              });
                            }}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono text-xs font-bold text-sky-800"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 block mb-0.5">
                            Restante a Cobrar (R$)
                          </label>
                          <input
                            type="text"
                            disabled
                            value={`R$ ${formatCurrencyBR(getOrderRemainingAmount(editingOrder))}`}
                            className="w-full bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-1.5 sm:p-2 font-mono text-xs font-bold"
                          />
                        </div>
                      </div>
                    )}

                    {getEffectivePaymentStatus(editingOrder) === 'PAGO' && (
                      <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                        Pagamento integral confirmado — nada a cobrar na entrega.
                      </p>
                    )}
                  </div>
                </div>
                )}
              </div>

              {/* PASSO 6: OBSERVAÇÕES */}
              <div>
                <label className="font-semibold text-slate-700 text-xs block mb-0.5 sm:mb-1">
                  Observações Adicionais (Restrições, bilhete presente, ponto de referência...)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Embalagem para presente, sem nozes, tocar interfone..."
                  value={editingOrder.observacoes || ''}
                  onChange={(e) => setEditingOrder({ ...editingOrder, observacoes: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs"
                />
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="px-3 sm:px-6 py-2 sm:py-3.5 bg-[#f8f9ff] border-t border-slate-200 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => handleCopySummary(editingOrder)}
                className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-colors border border-emerald-300 whitespace-nowrap w-full sm:w-auto"
              >
                {copyFeedback ? <Check className="w-4 h-4 text-emerald-700 shrink-0" /> : <Copy className="w-4 h-4 text-emerald-700 shrink-0" />}
                <span>{copyFeedback ? 'Resumo Copiado!' : 'Copiar Resumo WhatsApp'}</span>
              </button>

              <div className="flex items-center justify-end gap-1.5 sm:gap-2 w-full sm:w-auto">
                {editingOrder.id &&
                  onDeleteOrder &&
                  orders.find(o => o.id === editingOrder.id)?.status === 'PENDENTE' && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = orders.find(o => o.id === editingOrder.id);
                        if (target && target.status === 'PENDENTE') {
                          setOrderToDelete(target);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Pedido</span>
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 sm:px-6 py-1.5 sm:py-2.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-all shadow-sm whitespace-nowrap"
                >
                  Salvar Pedido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP AI IMPORT MODAL */}
      <WhatsAppImportModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        products={products}
        units={units}
        onOrderParsed={handleWhatsAppOrderParsed}
      />

      {/* PASSWORD CONFIRMATION MODAL FOR ENTREGUE STATUS CHANGE */}
      {pendingStatusChange && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (verifyingStatusPin) return;
              setVerifyingStatusPin(true);
              try {
                const isValid = onVerifyPin ? await onVerifyPin(statusAuthPin.trim()) : false;
                if (!isValid) {
                  setStatusAuthError('Senha incorreta. Informe a senha do usuário para alterar um pedido já Entregue.');
                  return;
                }
                setEditingOrder({ ...editingOrder, status: pendingStatusChange });
                setPendingStatusChange(null);
                setStatusAuthPin('');
                setStatusAuthError('');
              } catch {
                setStatusAuthError('Não foi possível validar a senha agora. Tente novamente.');
              } finally {
                setVerifyingStatusPin(false);
              }
            }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-200 space-y-4"
          >
            <div>
              <h3 className="text-sm font-bold text-slate-900">Confirmação de Senha Necessária</h3>
              <p className="text-xs text-slate-500 mt-1">
                Este pedido já está com status <strong>ENTREGUE</strong>. Digite sua senha de usuário para alterar o status para <strong>{pendingStatusChange.replace('_', ' ')}</strong>.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Senha do Usuário</label>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                required
                value={statusAuthPin}
                onChange={(e) => {
                  setStatusAuthPin(e.target.value);
                  setStatusAuthError('');
                }}
                placeholder="Digite sua senha de 8 dígitos"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-brand-500"
              />
              {statusAuthError && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1">{statusAuthError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPendingStatusChange(null);
                  setStatusAuthPin('');
                  setStatusAuthError('');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={verifyingStatusPin}
                className="px-4 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 rounded-lg"
              >
                {verifyingStatusPin ? 'Validando...' : 'Confirmar Alteração'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STATUS CHANGE CONFIRMATION MODAL (QUICK TABLE/CARD OR MODAL) */}
      {(pendingQuickStatusConfirm || pendingModalStatusConfirm) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-200 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Confirmar Alteração de Status</h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                {pendingQuickStatusConfirm ? (
                  <>
                    Deseja alterar o status do pedido{' '}
                    <strong className="font-mono text-slate-900">{pendingQuickStatusConfirm.order.numeroPedido}</strong> de{' '}
                    <strong>{pendingQuickStatusConfirm.order.status.replace('_', ' ')}</strong> para{' '}
                    <strong>{pendingQuickStatusConfirm.nextStatus.replace('_', ' ')}</strong>?
                  </>
                ) : (
                  <>
                    Deseja alterar o status do pedido de{' '}
                    <strong>{(editingOrder.status || 'PENDENTE').replace('_', ' ')}</strong> para{' '}
                    <strong>{(pendingModalStatusConfirm || 'PENDENTE').replace('_', ' ')}</strong>?
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPendingQuickStatusConfirm(null);
                  setPendingModalStatusConfirm(null);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingQuickStatusConfirm) {
                    onSaveOrder({
                      ...pendingQuickStatusConfirm.order,
                      status: pendingQuickStatusConfirm.nextStatus
                    });
                    setPendingQuickStatusConfirm(null);
                  } else if (pendingModalStatusConfirm) {
                    setEditingOrder({ ...editingOrder, status: pendingModalStatusConfirm });
                    setPendingModalStatusConfirm(null);
                  }
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Pending Order Confirmation Modal */}
      {orderToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Excluir Pedido Pendente {orderToDelete.numeroPedido}?
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Apenas pedidos com status <strong>PENDENTE</strong> podem ser excluídos. Essa ação removerá permanentemente o pedido de{' '}
                  <strong>{orderToDelete.clienteNome}</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (orderToDelete.status === 'PENDENTE') {
                    onDeleteOrder?.(orderToDelete.id);
                    if (editingOrder.id === orderToDelete.id) {
                      setIsModalOpen(false);
                    }
                  }
                  setOrderToDelete(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl cursor-pointer shadow-xs"
              >
                Excluir Pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
