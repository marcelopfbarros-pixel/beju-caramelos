import React, { useState } from 'react';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { CurrencyInput } from '../components/CurrencyInput';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import { ORDER_CARD_STATUS_STYLES, isReplenishmentOrder, REPLENISHMENT_CARD_STYLE } from '../utils/orderStatusStyles';
import { 
  Order, 
  Product, 
  StoreUnit, 
  Category, 
  OrderStatus, 
  DeliveryType, 
  PaymentMethod,
  OrderItem,
  Customer
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
  ChevronLeft,
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
  calculateNearestUnitAndDeliveryFee
} from '../services/whatsappAutomationService';

interface PedidosScreenProps {
  orders: Order[];
  products: Product[];
  units: StoreUnit[];
  categories: Category[];
  customers: Customer[];
  activeUnitId: string;
  userPassword?: string;
  onSaveOrder: (order: Order) => void;
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
  activeUnitId,
  userPassword = '12345678',
  onSaveOrder,
  onSelectOrder,
  onSaveCustomer
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [sortBy, setSortBy] = useState<'ENTREGA_ASC' | 'ENTREGA_DESC' | 'VALOR_DESC' | 'CLIENTE_ASC'>('ENTREGA_ASC');
  const [groupBy, setGroupBy] = useState<'NENHUM' | 'MODALIDADE' | 'LOJA_ORIGEM'>('LOJA_ORIGEM');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);
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
  const [saveCustomerToBase, setSaveCustomerToBase] = useState<boolean>(true);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState<boolean>(false);

  // New Order Form State in Logical Order
  const [editingOrder, setEditingOrder] = useState<Partial<Order>>({
    numeroPedido: `#PED-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    status: 'PENDENTE',
    dataPedido: new Date().toISOString(),
    dataHoraEntrega: getCurrentLocalDateTime(),
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
    const subtotal = itens.reduce((acc, i) => acc + (i.quantidade * i.precoUnitario), 0);
    const total = Math.max(0, subtotal + taxa - desc);
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
      status: (editingOrder.status as OrderStatus) || 'PENDENTE',
      dataPedido: editingOrder.dataPedido || new Date().toISOString(),
      dataHoraEntrega: editingOrder.dataHoraEntrega || new Date().toISOString(),
      tipoEntrega: (editingOrder.tipoEntrega as DeliveryType) || 'DELIVERY',
      unidadeOrigemId: editingOrder.unidadeOrigemId || units[0].id,
      unidadeRetiradaId: editingOrder.unidadeRetiradaId,
      clienteNome: editingOrder.clienteNome || '',
      clienteTelefone: editingOrder.clienteTelefone || '',
      clienteEndereco: editingOrder.clienteEndereco,
      enderecoEntrega: editingOrder.tipoEntrega === 'DELIVERY' ? editingOrder.enderecoEntrega : undefined,
      valorSubtotal: subtotal,
      taxaEntrega: editingOrder.tipoEntrega === 'DELIVERY' ? (editingOrder.taxaEntrega || 0) : 0,
      desconto: finalDesc,
      valorTotal: total,
      formaPagamento: (editingOrder.formaPagamento as PaymentMethod) || 'pix',
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
    setImportBanner(null);
    setRouteCalcBadge(null);
    setDiscountType('R$');
    setDiscountValue(order.desconto || 0);
    setSelectedProdToAdd(products.find(p => p.ativo)?.id || '');
    setSelectedQtyToAdd(1);
    setEditingOrder({
      ...order,
      dataHoraEntrega: toLocalDateTimeInput(order.dataHoraEntrega),
      itens: (order.itens || []).map(i => ({ ...i }))
    });
    setIsModalOpen(true);
  };

  const recalculateNearestStoreAndFee = async (
    addr: string,
    cep: string | undefined,
    itensToCalc?: OrderItem[],
    preferExplicitUnitId?: string
  ) => {
    if (!addr.trim() && !(cep || '').replace(/\D/g, '')) return;
    setRouteCalcBadge('Calculando loja mais próxima e taxa...');
    try {
      const res = await calculateNearestUnitAndDeliveryFee(addr, cep, units);
      setEditingOrder(prev => {
        const items = itensToCalc || prev.itens || [];
        const subtotal = items.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0);
        const computedDesc = computeDiscountAmount(subtotal, discountType, discountValue);
        const fee = prev.tipoEntrega === 'RETIRADA' ? 0 : res.deliveryFee;
        const total = Math.max(0, subtotal + fee - computedDesc);
        return {
          ...prev,
          unidadeOrigemId: preferExplicitUnitId || res.nearestUnit?.id || prev.unidadeOrigemId,
          taxaEntrega: fee,
          valorSubtotal: subtotal,
          valorTotal: total
        };
      });
      setRouteCalcBadge(
        `Loja mais próxima: ${res.nearestUnit?.nome} (~${res.distanceKm} km) • Taxa: R$ ${res.deliveryFee.toFixed(2)}`
      );
    } catch {
      setRouteCalcBadge(null);
    }
  };

  const handleWhatsAppOrderParsed = (parsed: ParsedWhatsAppOrder) => {
    const defaultFee = getWhatsAppAutomationSettings().defaultDeliveryFee ?? 18.0;
    const taxa = parsed.tipoEntrega === 'DELIVERY' ? defaultFee : 0.00;
    const { subtotal, total } = calculateTotals(parsed.itens, taxa, 0);
    setRouteCalcBadge(null);

    setEditingOrder({
      numeroPedido: `#PED-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'PENDENTE',
      dataPedido: new Date().toISOString(),
      dataHoraEntrega: parsed.dataHoraEntrega,
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
      desconto: 0.00,
      valorSubtotal: subtotal,
      valorTotal: total,
      formaPagamento: parsed.formaPagamento,
      trocoPara: parsed.trocoPara,
      instrucoesPagamento: '',
      observacoes: parsed.observacoes || '',
      itens: parsed.itens
    });

    if (parsed.tipoEntrega === 'DELIVERY' && parsed.enderecoEntrega) {
      recalculateNearestStoreAndFee(
        parsed.enderecoEntrega,
        undefined,
        parsed.itens,
        parsed.unidadeSugeridaId
      );
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
    const unit = units.find(u => u.id === order.unidadeOrigemId) || units[0];

    const itensText = (order.itens || [])
      .map(i => `• ${i.quantidade}x ${prodMap.get(i.produtoId)?.descricao || 'Item'} (R$ ${i.subtotal.toFixed(2)})`)
      .join('\n');

    const paymentLabel = {
      pix: 'PIX',
      debito: 'Cartão de Débito',
      credito: 'Cartão de Crédito',
      dinheiro: 'Dinheiro'
    }[order.formaPagamento || 'pix'];

    const summary = `🍰 *Beju Caramelos*
Olá, *${order.clienteNome || 'Cliente'}*! Segue o resumo do seu pedido:

*Pedido:* ${order.numeroPedido}
*Data/Horário:* ${order.dataHoraEntrega ? new Date(order.dataHoraEntrega).toLocaleString('pt-BR') : 'A combinar'}
*Modalidade:* ${order.tipoEntrega === 'DELIVERY' ? `Entrega (${order.enderecoEntrega || 'Endereço informado'})` : `Retirada no Balcão (${unit?.nome || 'Loja'})`}

*Itens Solicitados:*
${itensText}

*Subtotal:* R$ ${(order.valorSubtotal || 0).toFixed(2)}
*Taxa de Entrega:* R$ ${(order.taxaEntrega || 0).toFixed(2)}
${(order.desconto || 0) > 0 ? `*Desconto:* -R$ ${order.desconto?.toFixed(2)}\n` : ''}*TOTAL:* R$ ${(order.valorTotal || 0).toFixed(2)}

*Pagamento:* ${paymentLabel}${order.trocoPara ? ` (Troco para R$ ${order.trocoPara.toFixed(2)})` : ''}
${order.formaPagamento === 'pix' ? `*Chave PIX:* ${unit?.chavePix || 'financeiro@bejucaramelos.com.br'}\n_Envie o comprovante por aqui para confirmação!_` : ''}`;

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
    const flowIdx = ORDER_STATUS_FLOW.indexOf(order.status);
    const prevStatus = flowIdx > 0 ? ORDER_STATUS_FLOW[flowIdx - 1] : null;
    const nextStatus = flowIdx >= 0 && flowIdx < ORDER_STATUS_FLOW.length - 1 ? ORDER_STATUS_FLOW[flowIdx + 1] : null;

    return (
      <div
        className="inline-flex items-center gap-0.5 print:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={!prevStatus}
          onClick={() => prevStatus && handleQuickStatusChange(order, prevStatus)}
          title={prevStatus ? `Voltar para ${prevStatus}` : 'Sem status anterior'}
          className="p-0.5 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <select
          value={order.status}
          onChange={(e) => handleQuickStatusChange(order, e.target.value as OrderStatus)}
          aria-label={`Alterar status do pedido ${order.numeroPedido}`}
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer focus:outline-none ${STATUS_BADGES[order.status]}`}
        >
          {ALL_ORDER_STATUSES.map(st => (
            <option key={st} value={st} className="bg-white text-slate-900">
              {st}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!nextStatus}
          onClick={() => nextStatus && handleQuickStatusChange(order, nextStatus)}
          title={nextStatus ? `Avançar para ${nextStatus}` : 'Último status do fluxo'}
          className="p-0.5 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Top Action Bar */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex items-center gap-2">
            <span>Pedidos</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {filteredOrders.length} pedidos
            </span>
          </h1>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => ExcelService.exportOrders(orders, products, units)}
            className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Exportar .xlsx</span>
          </button>

          <button
            onClick={() => setIsWhatsAppModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-all shadow-xs active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Importar WhatsApp (IA)</span>
          </button>

          <button
            onClick={() => {
              setImportBanner(null);
              setRouteCalcBadge(null);
              setDiscountType('R$');
              setDiscountValue(0);
              setSelectedProdToAdd(products.find(p => p.ativo)?.id || '');
              setSelectedQtyToAdd(1);
              setEditingOrder({
                numeroPedido: `#PED-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
                status: 'PENDENTE',
                dataPedido: new Date().toISOString(),
                dataHoraEntrega: getCurrentLocalDateTime(),
                tipoEntrega: 'DELIVERY',
                unidadeOrigemId: activeUnitId !== 'all' ? activeUnitId : units[0]?.id || 'u-central',
                clienteNome: '',
                clienteTelefone: '',
                clienteEndereco: '',
                enderecoEntrega: '',
                taxaEntrega: getWhatsAppAutomationSettings().defaultDeliveryFee ?? 18.00,
                desconto: 0.00,
                formaPagamento: 'pix',
                trocoPara: undefined,
                instrucoesPagamento: '',
                observacoes: '',
                itens: []
              });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Pedido</span>
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

      {/* Filters & Search */}
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
        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por Nº, cliente ou WhatsApp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Orders Table / Cards */}
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
            <thead className="bg-[#f8f9ff] border-b border-[#e2e8f0] text-[11px] font-mono font-semibold uppercase text-slate-500 tracking-wider">
              <tr>
                <th className="py-3 px-4">Nº Pedido</th>
                <th className="py-3 px-4">Entrega / Retirada</th>
                <th className="py-3 px-4">Cliente & WhatsApp</th>
                <th className="py-3 px-4">Modalidade</th>
                <th className="py-3 px-4">Loja Origem</th>
                <th className="py-3 px-4">Pagamento</th>
                <th className="py-3 px-4 text-right">Total (R$)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 text-xs">
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
                          <td colSpan={9} className="py-2 px-4 font-bold text-slate-800 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1.5">
                                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                <span>{group.label}</span>
                              </span>
                              <span className="font-mono text-[11px] text-slate-600">
                                {group.orders.length} pedido(s) • Total: R$ {group.orders.reduce((s, o) => s + o.valorTotal, 0).toFixed(2)}
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
                  return (
                    <tr
                      key={order.id}
                      onClick={() => onSelectOrder(order)}
                      className={`cursor-pointer transition-colors ${
                        isRep
                          ? 'bg-sky-50/90 hover:bg-sky-100/80 border-l-4 border-l-sky-500'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <div>{order.numeroPedido}</div>
                        {isRep && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-sans font-bold uppercase tracking-wider">
                            Reposição
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {new Date(order.dataHoraEntrega).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{order.clienteNome}</div>
                        <div className="text-[11px] font-mono text-emerald-700 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          <span>{order.clienteTelefone}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          order.tipoEntrega === 'DELIVERY'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {order.tipoEntrega === 'DELIVERY' ? <Truck className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                          {order.tipoEntrega === 'DELIVERY' ? 'Entrega' : 'Retirada'}
                        </span>
                      </td>
                      <td className={`py-3 px-4 font-semibold ${unitColorClass}`}>
                        {unit?.nome || '-'}
                      </td>
                      <td className="py-3 px-4">
                        {isRep ? (
                          <span className="text-[11px] font-semibold text-sky-700">—</span>
                        ) : (
                          <span className="font-mono uppercase font-semibold text-[11px] px-2 py-0.5 bg-slate-100 rounded text-slate-800 border border-slate-200">
                            {order.formaPagamento}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-right text-slate-900">
                        R$ {order.valorTotal.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {renderStatusControl(order)}
                        <span className={`hidden print:inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_BADGES[order.status]}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center print:hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              const msg = formatStatusNotificationMessage(order, order.status, products, units);
                              dispatchWhatsAppMessage(order.clienteTelefone, msg);
                            }}
                            title={`Notificar status (${order.status}) no WhatsApp`}
                            className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCopySummary(order)}
                            title="Copiar Resumo para WhatsApp"
                            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditOrder(order)}
                            title="Editar Pedido"
                            className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
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
                          {group.orders.length} pedido(s) • R$ {group.orders.reduce((s, o) => s + o.valorTotal, 0).toFixed(2)}
                        </span>
                      </button>
                    )}
                    {expanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.orders.map(order => {
                        const unit = units.find(u => u.id === order.unidadeOrigemId);
                        const isRep = isReplenishmentOrder(order);
                        return (
                          <div
                            key={order.id}
                            onClick={() => onSelectOrder(order)}
                            className={`border rounded-xl p-4 shadow-xs transition-colors cursor-pointer flex flex-col justify-between gap-3 ${
                              isRep ? REPLENISHMENT_CARD_STYLE : ORDER_CARD_STATUS_STYLES[order.status]
                            }`}
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
                                <span className="block text-[10px] text-slate-500">{unit?.nome || '-'}</span>
                              </div>
                              {renderStatusControl(order)}
                              <span className="hidden print:inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                {order.status}
                              </span>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="font-bold text-slate-900">{order.clienteNome}</div>
                              <div className="font-mono text-[11px] text-emerald-700">{order.clienteTelefone}</div>
                              <div className="text-[11px] text-slate-500">
                                {new Date(order.dataHoraEntrega).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} •{' '}
                                {order.tipoEntrega === 'DELIVERY' ? 'Entrega' : 'Retirada'}
                              </div>
                            </div>
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                              <span className="font-mono font-bold text-sm text-slate-900">R$ {order.valorTotal.toFixed(2)}</span>
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
                                <button
                                  onClick={() => handleOpenEditOrder(order)}
                                  className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg"
                                  title="Editar Pedido"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 font-sans">
                  {editingOrder.id ? 'Editar Pedido' : 'Registro de Novo Pedido (WhatsApp / Balcão)'}
                </h2>
                <p className="text-xs text-slate-500">
                  Campos organizados em ordem lógica de atendimento ao cliente
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {importBanner && (
                <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
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
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 block mb-3">
                  1. Identificação do Pedido
                </span>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Nº do Pedido</label>
                    <input
                      type="text"
                      disabled
                      value={editingOrder.numeroPedido || ''}
                      className="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Status</label>
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
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
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
                    <label className="font-semibold text-slate-700 block mb-1">Loja de Origem</label>
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
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                    >
                      {units.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Data/Hora Combinada *</label>
                    <input
                      type="datetime-local"
                      required
                      min={!editingOrder.id ? getCurrentLocalDateTime() : undefined}
                      value={editingOrder.dataHoraEntrega || ''}
                      onChange={(e) => setEditingOrder({ ...editingOrder, dataHoraEntrega: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* PASSO 2: DADOS DO CLIENTE */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    2. Dados do Cliente (WhatsApp)
                  </span>

                  <div className="relative w-full sm:w-72">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={customerSearch}
                      onFocus={() => setShowCustomerSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 180)}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerSuggestions(true);
                      }}
                      placeholder="Pesquisar cliente por nome ou tel..."
                      className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-brand-500"
                    />
                    {showCustomerSuggestions && (
                      <div className="absolute right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-30 divide-y divide-slate-100">
                        {customers
                          .filter(c =>
                            c.nome.toLowerCase().includes(customerSearch.toLowerCase()) ||
                            c.telefone.includes(customerSearch)
                          )
                          .map(c => (
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
                                setCustomerSearch(c.nome);
                                setShowCustomerSuggestions(false);
                                if (c.endereco || c.cep) {
                                  recalculateNearestStoreAndFee(c.endereco, c.cep);
                                }
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors text-xs"
                            >
                              <div className="font-bold text-slate-900">{c.nome}</div>
                              <div className="text-[10px] font-mono text-slate-500">{c.telefone}</div>
                            </button>
                          ))}
                        {customers.filter(c =>
                          c.nome.toLowerCase().includes(customerSearch.toLowerCase()) ||
                          c.telefone.includes(customerSearch)
                        ).length === 0 && (
                          <div className="px-3 py-2 text-[11px] text-slate-400">
                            Nenhum cliente encontrado.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      placeholder="Ex: Ana Maria Santos"
                      value={editingOrder.clienteNome || ''}
                      onChange={(e) => setEditingOrder({ ...editingOrder, clienteNome: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Telefone WhatsApp *</label>
                    <input
                      type="text"
                      placeholder="Ex: +55 (11) 98765-4321"
                      value={editingOrder.clienteTelefone || ''}
                      onChange={(e) => setEditingOrder({ ...editingOrder, clienteTelefone: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono"
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
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 block mb-3">
                  3. Modalidade & Logística
                </span>
                <div className="space-y-3 text-xs">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                      <input
                        type="radio"
                        name="modalidade"
                        checked={editingOrder.tipoEntrega === 'DELIVERY'}
                        onChange={() => setEditingOrder({ ...editingOrder, tipoEntrega: 'DELIVERY' })}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      <span>🚚 Entrega (Delivery)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                      <input
                        type="radio"
                        name="modalidade"
                        checked={editingOrder.tipoEntrega === 'RETIRADA'}
                        onChange={() => setEditingOrder({ ...editingOrder, tipoEntrega: 'RETIRADA', taxaEntrega: 0 })}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      <span>🏪 Retirada (Loja / Ateliê)</span>
                    </label>
                  </div>

                  {editingOrder.tipoEntrega === 'DELIVERY' ? (
                    <div className="space-y-2.5">
                      {editingOrder.clienteEndereco && (
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2">
                          <div className="text-[11px] text-slate-600 truncate">
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
                        <div className="flex items-center justify-between mb-1">
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
                          className="w-full bg-white border border-slate-300 rounded-lg p-2"
                        />
                        {routeCalcBadge && (
                          <p className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 mt-1.5">
                            {routeCalcBadge}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Detalhe da Entrega (Etiqueta / Portaria / Recado)</label>
                        <input
                          type="text"
                          placeholder="Ex: Deixar na portaria, interfone 51, embalagem para presente..."
                          value={editingOrder.detalheEntrega || ''}
                          onChange={(e) => setEditingOrder({ ...editingOrder, detalheEntrega: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Local de Retirada (Loja ou Ateliê de Produção)</label>
                      <select
                        value={editingOrder.unidadeRetiradaId || editingOrder.unidadeOrigemId}
                        onChange={(e) => setEditingOrder({ ...editingOrder, unidadeRetiradaId: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                      >
                        {units.filter(u => u.ativo).map(u => (
                          <option key={u.id} value={u.id}>
                            {u.tipo === 'CENTRAL' ? '🏭 [Ateliê] ' : '🏪 '}{u.nome} - {u.endereco}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* PASSO 4: ITENS DO PEDIDO */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
                    4. Produtos Solicitados
                  </span>
                  <span className="text-xs text-slate-500">
                    Selecione o produto e a quantidade na caixa abaixo
                  </span>
                </div>

                {/* Searchable Product Selection Combobox */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
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
                      className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-8 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-brand-500"
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
                          return matches.map(prod => (
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
                              <span className="font-mono font-bold text-brand-700 shrink-0">
                                R$ {prod.precoUnitario.toFixed(2)} / {prod.unidade}
                              </span>
                            </button>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={selectedQtyToAdd}
                      onChange={(e) => setSelectedQtyToAdd(Math.max(1, Number(e.target.value)))}
                      className="w-20 bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono text-center font-bold"
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
                      className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Item</span>
                    </button>
                  </div>
                </div>

                {/* Items Table in Order */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2 px-3 text-left">Produto</th>
                        <th className="py-2 px-3 text-center">Qtd</th>
                        <th className="py-2 px-3 text-right">Preço Unit.</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                        <th className="py-2 px-3 text-center">Remover</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(editingOrder.itens || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400">
                            Nenhum item adicionado ainda.
                          </td>
                        </tr>
                      ) : (
                        (editingOrder.itens || []).map(item => {
                          const prod = products.find(p => p.id === item.produtoId);
                          return (
                            <tr key={item.id}>
                              <td className="py-2 px-3 font-medium text-slate-900">
                                {prod?.descricao || 'Produto'}
                              </td>
                              <td className="py-2 px-3 text-center">
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
                              <td className="py-2 px-3 text-right font-mono text-slate-700">
                                R$ {item.precoUnitario.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                R$ {item.subtotal.toFixed(2)}
                              </td>
                              <td className="py-2 px-3 text-center">
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
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 block mb-3">
                  5. Valores & Forma de Pagamento
                </span>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs mb-4">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Subtotal dos Itens</label>
                    <input
                      type="text"
                      disabled
                      value={`R$ ${(editingOrder.valorSubtotal || 0).toFixed(2)}`}
                      className="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Taxa de Entrega (R$)</label>
                    <CurrencyInput
                      value={editingOrder.taxaEntrega || 0}
                      onChangeValue={(taxa) => {
                        const { total } = calculateTotals(editingOrder.itens || [], taxa, editingOrder.desconto || 0);
                        setEditingOrder({ ...editingOrder, taxaEntrega: taxa, valorTotal: total });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Desconto</label>
                    <div className="flex items-center gap-1">
                      <select
                        value={discountType}
                        onChange={(e) => {
                          const newType = e.target.value as 'R$' | '%';
                          setDiscountType(newType);
                          const sub = (editingOrder.itens || []).reduce((acc, i) => acc + (i.quantidade * i.precoUnitario), 0);
                          const descAmt = computeDiscountAmount(sub, newType, discountValue);
                          const { total } = calculateTotals(editingOrder.itens || [], editingOrder.taxaEntrega || 0, descAmt);
                          setEditingOrder({ ...editingOrder, desconto: descAmt, valorTotal: total });
                        }}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-2 font-mono font-bold text-slate-700"
                      >
                        <option value="R$">R$</option>
                        <option value="%">%</option>
                      </select>
                      {discountType === 'R$' ? (
                        <CurrencyInput
                          value={discountValue}
                          onChangeValue={(val) => {
                            setDiscountValue(val);
                            const sub = (editingOrder.itens || []).reduce((acc, i) => acc + (i.quantidade * i.precoUnitario), 0);
                            const descAmt = computeDiscountAmount(sub, discountType, val);
                            const { total } = calculateTotals(editingOrder.itens || [], editingOrder.taxaEntrega || 0, descAmt);
                            setEditingOrder({ ...editingOrder, desconto: descAmt, valorTotal: total });
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono text-rose-600"
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
                            setDiscountValue(val);
                            const sub = (editingOrder.itens || []).reduce((acc, i) => acc + (i.quantidade * i.precoUnitario), 0);
                            const descAmt = computeDiscountAmount(sub, discountType, val);
                            const { total } = calculateTotals(editingOrder.itens || [], editingOrder.taxaEntrega || 0, descAmt);
                            setEditingOrder({ ...editingOrder, desconto: descAmt, valorTotal: total });
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono text-rose-600"
                        />
                      )}
                    </div>
                    {discountType === '%' && discountValue > 0 && (
                      <span className="text-[10px] font-mono text-rose-600 mt-0.5 block">
                        -R$ {(editingOrder.desconto || 0).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">TOTAL A PAGAR (R$)</label>
                    <input
                      type="text"
                      disabled
                      value={`R$ ${(editingOrder.valorTotal || 0).toFixed(2)}`}
                      className="w-full bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-lg p-2 font-mono font-bold text-sm"
                    />
                  </div>
                </div>

                {/* FORMAS DE PAGAMENTO: PIX, DÉBITO, CRÉDITO, DINHEIRO (oculto em Pedido Especial de Reposição) */}
                {isReplenishmentOrder({
                  numeroPedido: editingOrder.numeroPedido || '',
                  observacoes: editingOrder.observacoes
                }) ? (
                  <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900 font-medium">
                    Pedido Especial de Reposição — transferência interna sem forma de pagamento.
                  </div>
                ) : (
                <div className="space-y-3">
                  <label className="font-semibold text-slate-800 text-xs block">
                    Forma de Pagamento (Obrigatório):
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                        className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
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
                    <div className="pt-2">
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Precisa de Troco para quanto? (R$)
                      </label>
                      <CurrencyInput
                        allowEmpty
                        placeholder="Ex: 100,00"
                        value={editingOrder.trocoPara}
                        onChangeValue={(val) => setEditingOrder({ ...editingOrder, trocoPara: val > 0 ? val : undefined })}
                        className="w-48 bg-white border border-slate-300 rounded-lg p-2 font-mono text-xs"
                      />
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* PASSO 6: OBSERVAÇÕES */}
              <div>
                <label className="font-semibold text-slate-700 text-xs block mb-1">
                  Observações Adicionais (Restrições, bilhete presente, ponto de referência...)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Embalagem para presente, sem nozes, tocar interfone..."
                  value={editingOrder.observacoes || ''}
                  onChange={(e) => setEditingOrder({ ...editingOrder, observacoes: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-[#f8f9ff] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleCopySummary(editingOrder)}
                className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-colors border border-emerald-300 whitespace-nowrap w-full sm:w-auto"
              >
                {copyFeedback ? <Check className="w-4 h-4 text-emerald-700 shrink-0" /> : <Copy className="w-4 h-4 text-emerald-700 shrink-0" />}
                <span>{copyFeedback ? 'Resumo Copiado!' : 'Copiar Resumo WhatsApp'}</span>
              </button>

              <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 sm:px-6 py-2 sm:py-2.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-all shadow-sm whitespace-nowrap"
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
            onSubmit={(e) => {
              e.preventDefault();
              if (statusAuthPin.trim() !== userPassword) {
                setStatusAuthError('Senha incorreta. Informe a senha do usuário para alterar um pedido já Entregue.');
                return;
              }
              setEditingOrder({ ...editingOrder, status: pendingStatusChange });
              setPendingStatusChange(null);
              setStatusAuthPin('');
              setStatusAuthError('');
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
                className="px-4 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
              >
                Confirmar Alteração
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
    </div>
  );
};
