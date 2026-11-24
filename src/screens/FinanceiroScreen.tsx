import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FinancialPaymentCategory,
  FinancialPaymentChannel,
  InvoiceStatus,
  Order,
  OrderFinancialPaymentEntry,
  OrderFinancialRecord,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  StoreUnit,
  UserProfile,
} from '../types';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { CurrencyInput, formatCurrencyBR } from '../components/CurrencyInput';
import { PrintReportHeader } from '../components/PrintReportHeader';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import { formatDeliveryTimeRange } from '../utils/deliveryTimeRange';
import {
  getEffectivePaymentStatus,
  getOrderPaidAmount,
} from '../utils/paymentStatus';
import {
  FINANCIAL_CATEGORY_LABELS,
  FINANCIAL_PENDING_GROUP_ORDER,
  INVOICE_STATUS_BADGES,
  INVOICE_STATUS_LABELS,
  RECONCILIATION_STATUS_BADGES,
  RECONCILIATION_STATUS_LABELS,
  computeConciliatedTotals,
  computeFinancialSummary,
  deriveReconciliationState,
  formatDateBR,
  getEffectiveInvoiceStatus,
  getEffectiveReconciliationStatus,
  getEntryMissingDateWarning,
  getFinancialPendingGroupLabel,
  isEntryBonificado,
  isEntryCash,
  isFutureDateInput,
  isOrderEligibleForFinancial,
  isOrderOperationallyReadyForInvoice,
  isOrderPaidAndAwaitingStatement,
  isOrderReadyForInvoice,
  toLocalDateInput,
} from '../utils/financialReconciliation';
import {
  FaturamentoReportData,
  FaturamentoReportRow,
  groupAndSortFaturamentoRows,
  resolveOrderBillingUnitId,
} from '../utils/faturamentoReportData';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Landmark,
  LayoutGrid,
  List,
  Plus,
  Printer,
  Receipt,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';

interface FinanceiroScreenProps {
  orders: Order[];
  units: StoreUnit[];
  activeUnitId: string;
  financialChannels: FinancialPaymentChannel[];
  financialRecords: OrderFinancialRecord[];
  userProfile: UserProfile;
  onSaveFinancialRecord: (
    record: OrderFinancialRecord,
    orderPaymentSync?: { statusPagamento: PaymentStatus; valorPago: number }
  ) => Promise<void> | void;
  onSaveFinancialChannel: (
    channel: FinancialPaymentChannel
  ) => Promise<FinancialPaymentChannel | void> | void;
  onDeleteFinancialChannel?: (channelId: string) => Promise<void> | void;
  onOpenOrderInPedidos?: (order: Order, openEditModal?: boolean) => void;
}

type FinancialStatusFilter =
  | 'PENDENTES_GERAL'
  | 'PRONTOS_PARA_NF'
  | 'PENDENTE_CONCILIACAO'
  | 'PENDENTE_NF'
  | 'CONCLUIDOS'
  | 'TODOS';

type FinancialDateFilter = 'TODOS' | 'MES_ATUAL' | 'ULTIMOS_30_DIAS' | 'ULTIMOS_7_DIAS';

type FinancialSortBy =
  | 'DATA_PEDIDO_ASC'
  | 'DATA_PEDIDO_DESC'
  | 'PRIORIDADE_NF'
  | 'DATA_EXTRATO_DESC'
  | 'VALOR_DESC'
  | 'CLIENTE_ASC';

type FinancialGroupBy =
  | 'PENDENCIA'
  | 'MEIO_PAGAMENTO'
  | 'LOJA_ORIGEM'
  | 'DATA_EXTRATO'
  | 'NENHUM';

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  EM_PRODUCAO: 'Em Produção',
  PRONTO: 'Pronto',
  EM_ROTA: 'Em Rota',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

const ORDER_STATUS_BADGES: Record<OrderStatus, string> = {
  PENDENTE: 'bg-amber-100 text-amber-800 border-amber-300',
  CONFIRMADO: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  EM_PRODUCAO: 'bg-blue-100 text-blue-800 border-blue-300',
  PRONTO: 'bg-purple-100 text-purple-800 border-purple-300',
  EM_ROTA: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  ENTREGUE: 'bg-slate-100 text-slate-700 border-slate-300',
  CANCELADO: 'bg-red-100 text-red-800 border-red-300',
};

const ORDER_PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  credito: 'Crédito',
  debito: 'Débito',
  dinheiro: 'Dinheiro',
};

const ORDER_PAYMENT_METHOD_BADGES: Record<PaymentMethod, string> = {
  pix: 'bg-teal-50 text-teal-800 border-teal-300',
  credito: 'bg-indigo-50 text-indigo-800 border-indigo-300',
  debito: 'bg-sky-50 text-sky-800 border-sky-300',
  dinheiro: 'bg-emerald-50 text-emerald-800 border-emerald-300',
};

const FINANCIAL_CATEGORY_TEXT_COLORS: Record<FinancialPaymentCategory, string> = {
  PIX: 'text-teal-700',
  CARTAO: 'text-indigo-700',
  DINHEIRO: 'text-emerald-700',
  BOLETO: 'text-amber-700',
  BONIFICADO: 'text-purple-700',
  OUTROS: 'text-rose-700',
};

const getStatementChannelTextColorClass = (
  channel?: FinancialPaymentChannel,
  channelName?: string
): string => {
  const normalizedName = (channel?.nome || channelName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (channel?.categoria) {
    if (channel.categoria === 'CARTAO' && normalizedName.includes('debito')) {
      return 'text-sky-700';
    }
    return FINANCIAL_CATEGORY_TEXT_COLORS[channel.categoria] || 'text-slate-700';
  }

  if (!normalizedName) return 'text-slate-400';
  if (normalizedName.includes('pix')) return FINANCIAL_CATEGORY_TEXT_COLORS.PIX;
  if (normalizedName.includes('debito')) return 'text-sky-700';
  if (
    normalizedName.includes('cartao') ||
    normalizedName.includes('credito') ||
    normalizedName.includes('c6pay') ||
    normalizedName.includes('sumup') ||
    normalizedName.includes('maquin')
  ) {
    return FINANCIAL_CATEGORY_TEXT_COLORS.CARTAO;
  }
  if (normalizedName.includes('dinheiro') || normalizedName.includes('especie')) {
    return FINANCIAL_CATEGORY_TEXT_COLORS.DINHEIRO;
  }
  if (normalizedName.includes('boleto')) return FINANCIAL_CATEGORY_TEXT_COLORS.BOLETO;
  if (normalizedName.includes('bonif') || normalizedName.includes('cortesia')) {
    return FINANCIAL_CATEGORY_TEXT_COLORS.BONIFICADO;
  }
  return FINANCIAL_CATEGORY_TEXT_COLORS.OUTROS;
};

const FILTER_LABELS: Record<FinancialStatusFilter, string> = {
  PENDENTES_GERAL: 'Pendentes (Conciliação ou NF)',
  PRONTOS_PARA_NF: 'Prontos p/ Emitir NF',
  PENDENTE_CONCILIACAO: 'Pendente Conciliação',
  PENDENTE_NF: 'Pendente de NF',
  CONCLUIDOS: 'Conciliado + NF OK',
  TODOS: 'Todos os Pedidos',
};

const DATE_FILTER_LABELS: Record<FinancialDateFilter, string> = {
  TODOS: 'Todo Período',
  MES_ATUAL: 'Mês Atual',
  ULTIMOS_30_DIAS: 'Últimos 30 dias',
  ULTIMOS_7_DIAS: 'Últimos 7 dias',
};

type BillingReportStatusFilter =
  | 'TODOS'
  | 'CONCILIADO'
  | 'NAO_CONCILIADO'
  | 'NF_EMITIDA'
  | 'NF_PENDENTE';

const BILLING_REPORT_STATUS_LABELS: Record<BillingReportStatusFilter, string> = {
  TODOS: 'Todos os Pedidos',
  CONCILIADO: 'Somente Conciliados',
  NAO_CONCILIADO: 'Não Conciliados',
  NF_EMITIDA: 'NF Emitida',
  NF_PENDENTE: 'NF a Emitir',
};

const STORE_BADGE_PALETTE = [
  'bg-amber-100 text-amber-900 border-amber-300',
  'bg-rose-100 text-rose-900 border-rose-300',
  'bg-indigo-100 text-indigo-900 border-indigo-300',
  'bg-emerald-100 text-emerald-900 border-emerald-300',
  'bg-purple-100 text-purple-900 border-purple-300',
  'bg-cyan-100 text-cyan-900 border-cyan-300',
  'bg-orange-100 text-orange-900 border-orange-300',
  'bg-teal-100 text-teal-900 border-teal-300',
];

function suggestChannelForOrder(
  order: Order,
  channels: FinancialPaymentChannel[]
): FinancialPaymentChannel | undefined {
  const active = channels.filter(c => c.ativo);
  const pool = active.length > 0 ? active : channels;
  if (pool.length === 0) return undefined;

  if (order.formaPagamento === 'pix') {
    return (
      pool.find(c => c.nome.toLowerCase().includes('pix') || c.categoria === 'PIX') ||
      pool[0]
    );
  }
  if (order.formaPagamento === 'dinheiro') {
    return (
      pool.find(c => c.categoria === 'DINHEIRO' || c.nome.toLowerCase().includes('dinheiro')) ||
      pool[0]
    );
  }
  if (order.formaPagamento === 'credito' || order.formaPagamento === 'debito') {
    return (
      pool.find(c => c.categoria === 'CARTAO') ||
      pool[0]
    );
  }
  return pool[0];
}

export const FinanceiroScreen: React.FC<FinanceiroScreenProps> = ({
  orders,
  units,
  activeUnitId,
  financialChannels,
  financialRecords,
  userProfile,
  onSaveFinancialRecord,
  onSaveFinancialChannel,
  onDeleteFinancialChannel,
  onOpenOrderInPedidos,
}) => {
  const todayLocalDate = toLocalDateInput();
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'CARDS' : 'TABLE'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FinancialStatusFilter>('TODOS');
  const [orderDateFilter, setOrderDateFilter] = useState<FinancialDateFilter>('TODOS');
  const [statementDateFilter, setStatementDateFilter] = useState<FinancialDateFilter>('TODOS');
  const [sortBy, setSortBy] = useState<FinancialSortBy>('DATA_PEDIDO_ASC');
  const [groupBy, setGroupBy] = useState<FinancialGroupBy>('PENDENCIA');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);

  // Modal de Conciliação & NF
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [draftEntries, setDraftEntries] = useState<OrderFinancialPaymentEntry[]>([]);
  const [draftConciliated, setDraftConciliated] = useState<boolean>(false);
  const [draftNfStatus, setDraftNfStatus] = useState<InvoiceStatus>('PENDENTE');
  const [draftNfDataEmissao, setDraftNfDataEmissao] = useState<string>('');
  const [draftNfObs, setDraftNfObs] = useState<string>('');
  const [draftObs, setDraftObs] = useState<string>('');
  const [savingRecord, setSavingRecord] = useState(false);

  // Rascunhos inline na tabela de conciliação
  const [inlineDraftsByOrderId, setInlineDraftsByOrderId] = useState<
    Record<string, OrderFinancialPaymentEntry[]>
  >({});
  const [savingInlineOrderId, setSavingInlineOrderId] = useState<string | null>(null);
  const inlineStatementDateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const modalStatementDateRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Quick inline new channel inside conciliation modal
  const [showInlineNewChannel, setShowInlineNewChannel] = useState(false);
  const [inlineChannelTargetIdx, setInlineChannelTargetIdx] = useState<number>(0);
  const [inlineChannelName, setInlineChannelName] = useState('');
  const [inlineChannelCat, setInlineChannelCat] = useState<FinancialPaymentCategory>('OUTROS');

  // Modal de Meios de Pagamento
  const [isChannelsModalOpen, setIsChannelsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Partial<FinancialPaymentChannel>>({
    nome: '',
    categoria: 'OUTROS',
    exigeNfPadrao: true,
    ativo: true,
    ordem: financialChannels.length + 1,
  });
  const [savingChannel, setSavingChannel] = useState(false);

  // Modal de Relatório de Faturamento (PDF / XLSX)
  const [isBillingReportModalOpen, setIsBillingReportModalOpen] = useState(false);
  const [billingReportUnitId, setBillingReportUnitId] = useState<string>(activeUnitId);
  const [billingReportStatus, setBillingReportStatus] =
    useState<BillingReportStatusFilter>('TODOS');
  const [billingReportStartDate, setBillingReportStartDate] = useState('');
  const [billingReportEndDate, setBillingReportEndDate] = useState('');
  const [exportingBillingFormat, setExportingBillingFormat] = useState<'PDF' | 'XLSX' | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isBillingReportModalOpen) {
          setIsBillingReportModalOpen(false);
        } else if (isChannelsModalOpen) {
          setIsChannelsModalOpen(false);
        } else if (isModalOpen) {
          setIsModalOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, isChannelsModalOpen, isBillingReportModalOpen]);

  const unitMap = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);
  const channelById = useMemo(
    () => new Map(financialChannels.map(c => [c.id, c])),
    [financialChannels]
  );
  const channelByName = useMemo(
    () => new Map(financialChannels.map(c => [c.nome.toLowerCase(), c])),
    [financialChannels]
  );

  const recordsByOrderId = useMemo(
    () => new Map(financialRecords.map(r => [r.pedidoId, r])),
    [financialRecords]
  );

  const scopedEligibleOrders = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const days7Ago = new Date(curYear, curMonth, now.getDate() - 7).getTime();
    const days30Ago = new Date(curYear, curMonth, now.getDate() - 30).getTime();

    const matchesDatePeriod = (
      refStr: string | undefined,
      filter: FinancialDateFilter
    ): boolean => {
      if (filter === 'TODOS') return true;
      const trimmed = (refStr || '').trim();
      if (!trimmed) return false;
      const d = new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00` : trimmed
      );
      if (Number.isNaN(d.getTime())) return false;
      if (filter === 'MES_ATUAL') {
        return d.getFullYear() === curYear && d.getMonth() === curMonth;
      }
      if (filter === 'ULTIMOS_7_DIAS') {
        return d.getTime() >= days7Ago;
      }
      if (filter === 'ULTIMOS_30_DIAS') {
        return d.getTime() >= days30Ago;
      }
      return true;
    };

    return orders.filter(order => {
      if (!isOrderEligibleForFinancial(order)) return false;
      const matchesUnit =
        activeUnitId === 'all' ||
        order.unidadeOrigemId === activeUnitId ||
        order.unidadeRetiradaId === activeUnitId;
      if (!matchesUnit) return false;

      if (orderDateFilter !== 'TODOS' && !matchesDatePeriod(order.dataPedido, orderDateFilter)) {
        return false;
      }

      if (statementDateFilter !== 'TODOS') {
        const record = recordsByOrderId.get(order.id);
        const entries =
          inlineDraftsByOrderId[order.id] ||
          (record?.lancamentos && record.lancamentos.length > 0 ? record.lancamentos : []);
        const latestEntryDate = entries
          .map(ent => {
            const isCash = isEntryCash(ent, financialChannels);
            return ent.dataExtrato || (isCash ? ent.dataPagamento : '') || '';
          })
          .filter(Boolean)
          .sort()
          .pop();
        const stmtRef = latestEntryDate || record?.dataExtrato || '';
        if (!matchesDatePeriod(stmtRef, statementDateFilter)) return false;
      }

      return true;
    });
  }, [
    orders,
    activeUnitId,
    orderDateFilter,
    statementDateFilter,
    recordsByOrderId,
    inlineDraftsByOrderId,
    financialChannels,
  ]);

  const summary = useMemo(
    () => computeFinancialSummary(scopedEligibleOrders, recordsByOrderId, financialChannels),
    [scopedEligibleOrders, recordsByOrderId, financialChannels]
  );

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return scopedEligibleOrders
      .map(order => ({
        order,
        record: recordsByOrderId.get(order.id),
      }))
      .filter(({ order, record }) => {
        const recStatus = getEffectiveReconciliationStatus(order, record);
        const nfStatus = getEffectiveInvoiceStatus(record);

        if (statusFilter === 'PENDENTES_GERAL') {
          if (recStatus === 'CONCILIADO' && nfStatus !== 'PENDENTE') return false;
        } else if (statusFilter === 'PRONTOS_PARA_NF') {
          if (!isOrderReadyForInvoice(order, record)) return false;
        } else if (statusFilter === 'PENDENTE_CONCILIACAO') {
          if (recStatus === 'CONCILIADO') return false;
        } else if (statusFilter === 'PENDENTE_NF') {
          if (nfStatus !== 'PENDENTE') return false;
        } else if (statusFilter === 'CONCLUIDOS') {
          if (recStatus !== 'CONCILIADO' || nfStatus === 'PENDENTE') return false;
        }

        if (term) {
          const normalizedValueTerm = term.replace(/^r\$\s*/i, '').replace(/\s+/g, '');
          const totalNum = Number(order.valorTotal) || 0;
          const totalBR = formatCurrencyBR(totalNum).toLowerCase();
          const totalBRPlain = totalBR.replace(/\./g, '');
          const totalDot = totalNum.toFixed(2);
          const totalRaw = String(totalNum);
          const matchesOrderValue =
            normalizedValueTerm.length > 0 &&
            /\d/.test(normalizedValueTerm) &&
            (totalBR.includes(normalizedValueTerm) ||
              totalBRPlain.includes(normalizedValueTerm) ||
              totalDot.includes(normalizedValueTerm) ||
              totalRaw.includes(normalizedValueTerm));

          const matchesSearch =
            order.numeroPedido.toLowerCase().includes(term) ||
            order.clienteNome.toLowerCase().includes(term) ||
            (order.clienteTelefone || '').toLowerCase().includes(term) ||
            (record?.meioPagamentoNome || '').toLowerCase().includes(term) ||
            (record?.referenciaExtrato || '').toLowerCase().includes(term) ||
            (record?.nfObservacoes || '').toLowerCase().includes(term) ||
            matchesOrderValue;
          if (!matchesSearch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'DATA_PEDIDO_ASC' || sortBy === 'DATA_PEDIDO_DESC') {
          const dayA = toLocalDateInput(a.order.dataPedido || '');
          const dayB = toLocalDateInput(b.order.dataPedido || '');
          if (dayA !== dayB) {
            return sortBy === 'DATA_PEDIDO_ASC'
              ? dayA.localeCompare(dayB)
              : dayB.localeCompare(dayA);
          }
          const nameCmp = a.order.clienteNome.localeCompare(
            b.order.clienteNome,
            'pt-BR',
            { sensitivity: 'base' }
          );
          if (nameCmp !== 0) return nameCmp;
          return a.order.numeroPedido.localeCompare(b.order.numeroPedido, 'pt-BR');
        }
        if (sortBy === 'PRIORIDADE_NF') {
          const rank = (item: { order: Order; record?: OrderFinancialRecord }) => {
            if (isOrderReadyForInvoice(item.order, item.record)) return 0;
            if (getEffectiveReconciliationStatus(item.order, item.record) !== 'CONCILIADO') return 1;
            if (getEffectiveInvoiceStatus(item.record) === 'PENDENTE') return 2;
            return 3;
          };
          const ra = rank(a);
          const rb = rank(b);
          if (ra !== rb) return ra - rb;
          return (
            new Date(a.order.dataHoraEntrega || a.order.dataPedido).getTime() -
            new Date(b.order.dataHoraEntrega || a.order.dataPedido).getTime()
          );
        }
        if (sortBy === 'DATA_EXTRATO_DESC') {
          const da = a.record?.dataExtrato || a.record?.dataPagamento || '';
          const db = b.record?.dataExtrato || b.record?.dataPagamento || '';
          if (da !== db) return db.localeCompare(da);
          return b.order.numeroPedido.localeCompare(a.order.numeroPedido);
        }
        if (sortBy === 'VALOR_DESC') {
          return (b.order.valorTotal || 0) - (a.order.valorTotal || 0);
        }
        return a.order.clienteNome.localeCompare(b.order.clienteNome, 'pt-BR');
      });
  }, [scopedEligibleOrders, recordsByOrderId, statusFilter, searchTerm, sortBy]);

  const groupedRows = useMemo(() => {
    if (groupBy === 'NENHUM') {
      return [{ label: 'Todos os Pedidos', items: filteredRows }];
    }

    const map = new Map<string, typeof filteredRows>();
    for (const item of filteredRows) {
      let key = '';
      if (groupBy === 'PENDENCIA') {
        key = getFinancialPendingGroupLabel(item.order, item.record);
      } else if (groupBy === 'MEIO_PAGAMENTO') {
        key = item.record?.meioPagamentoNome?.trim() || 'Sem Meio Definido';
      } else if (groupBy === 'LOJA_ORIGEM') {
        key = unitMap.get(item.order.unidadeOrigemId)?.nome || 'Loja Não Identificada';
      } else if (groupBy === 'DATA_EXTRATO') {
        key = item.record?.dataExtrato
          ? `${item.record.dataExtrato}::${formatDateBR(item.record.dataExtrato)}`
          : '9999-99-99::Sem Data no Extrato';
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    return Array.from(map.entries())
      .sort(([ka], [kb]) => {
        if (groupBy === 'PENDENCIA') {
          const orderList: readonly string[] = FINANCIAL_PENDING_GROUP_ORDER;
          return orderList.indexOf(ka) - orderList.indexOf(kb);
        }
        return ka.localeCompare(kb, 'pt-BR');
      })
      .map(([rawKey, items]) => ({
        label: groupBy === 'DATA_EXTRATO' ? rawKey.split('::')[1] : rawKey,
        items,
      }));
  }, [filteredRows, groupBy, unitMap]);

  const hideUnidadeCol = groupBy === 'LOJA_ORIGEM';
  const visibleColumnCount = 7;

  const activeChannels = useMemo(
    () =>
      [...financialChannels]
        .filter(c => c.ativo)
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR')),
    [financialChannels]
  );

  const getOrderTableEntries = (
    order: Order,
    record?: OrderFinancialRecord
  ): OrderFinancialPaymentEntry[] => {
    const inlineDraft = inlineDraftsByOrderId[order.id];
    if (inlineDraft && inlineDraft.length > 0) {
      return inlineDraft;
    }
    if (record && record.lancamentos && record.lancamentos.length > 0) {
      return record.lancamentos.map(e => ({ ...e }));
    }
    const suggested = suggestChannelForOrder(order, financialChannels);
    if (
      record &&
      (record.meioPagamentoNome ||
        record.dataPagamento ||
        record.dataExtrato ||
        record.valorConciliado > 0)
    ) {
      return [
        {
          id: `ent-${order.id}-legacy`,
          dataPagamento: record.dataPagamento || '',
          dataExtrato: record.dataExtrato || '',
          meioPagamentoId: record.meioPagamentoId,
          meioPagamentoNome: record.meioPagamentoNome || suggested?.nome || '',
          valor: record.valorConciliado || 0,
          referenciaExtrato: record.referenciaExtrato || '',
        },
      ];
    }
    return [
      {
        id: `ent-${order.id}-0`,
        dataPagamento: '',
        dataExtrato: '',
        meioPagamentoId: suggested?.id,
        meioPagamentoNome: suggested?.nome || '',
        valor: 0,
        referenciaExtrato: '',
      },
    ];
  };

  const buildOrderFinancialPayload = ({
    order,
    entries,
    manualConciliated,
    nfStatus,
    nfDataEmissao,
    nfObservacoes,
    observacoes,
    existing,
  }: {
    order: Order;
    entries: OrderFinancialPaymentEntry[];
    manualConciliated: boolean;
    nfStatus: InvoiceStatus;
    nfDataEmissao?: string;
    nfObservacoes?: string;
    observacoes?: string;
    existing?: OrderFinancialRecord;
  }): {
    nextRecord: OrderFinancialRecord;
    orderPaymentSync?: { statusPagamento: PaymentStatus; valorPago: number };
    canMarkConciliated: boolean;
  } => {
    const normalizedEntries = entries.map(ent => ({
      ...ent,
      meioPagamentoNome: (ent.meioPagamentoNome || '').trim(),
      valor: Math.max(0, Number(ent.valor) || 0),
      referenciaExtrato: ent.referenciaExtrato?.trim() || undefined,
    }));

    const cleanEntries = normalizedEntries.filter(ent => {
      const hasAmount = ent.valor > 0;
      const hasDate = Boolean(
        (ent.dataPagamento || '').trim() || (ent.dataExtrato || '').trim()
      );
      const hasRef = Boolean((ent.referenciaExtrato || '').trim());
      const isBonif = isEntryBonificado(ent, financialChannels);
      return hasAmount || hasDate || hasRef || isBonif;
    });

    const { valorConciliado, conciliacaoStatus, canMarkConciliated } =
      deriveReconciliationState(order, cleanEntries, financialChannels, manualConciliated);

    const uniqueChannels = Array.from(
      new Set(cleanEntries.map(e => e.meioPagamentoNome).filter(Boolean))
    );
    const primaryEntry = cleanEntries[cleanEntries.length - 1] || cleanEntries[0];
    const primaryMeioName =
      uniqueChannels.length > 1
        ? uniqueChannels.join(' + ')
        : primaryEntry?.meioPagamentoNome || undefined;
    const primaryMeioId =
      uniqueChannels.length === 1 ? primaryEntry?.meioPagamentoId : undefined;

    const latestPayDate = cleanEntries
      .map(e => e.dataPagamento)
      .filter(Boolean)
      .sort()
      .pop();
    const latestStmtDate = cleanEntries
      .map(e => e.dataExtrato)
      .filter(Boolean)
      .sort()
      .pop();
    const combinedRef = cleanEntries
      .map(e => e.referenciaExtrato)
      .filter(Boolean)
      .join(' | ');

    const nextRecord: OrderFinancialRecord = {
      id: existing?.id || `fin-${Date.now()}`,
      pedidoId: order.id,
      conciliacaoStatus,
      meioPagamentoId: primaryMeioId,
      meioPagamentoNome: primaryMeioName,
      dataPagamento: latestPayDate || undefined,
      dataExtrato: latestStmtDate || undefined,
      valorConciliado,
      lancamentos: cleanEntries,
      referenciaExtrato: combinedRef || undefined,
      nfStatus,
      nfDataEmissao: nfStatus === 'EMITIDA' ? nfDataEmissao || undefined : undefined,
      nfObservacoes: nfObservacoes?.trim() || undefined,
      observacoes: observacoes?.trim() || undefined,
      atualizadoPor: userProfile.email || userProfile.nome,
      updatedAt: new Date().toISOString(),
    };

    let orderPaymentSync: { statusPagamento: PaymentStatus; valorPago: number } | undefined;
    if (conciliacaoStatus === 'CONCILIADO') {
      if (
        order.statusPagamento !== 'PAGO' ||
        Number(order.valorPago || 0) !== order.valorTotal
      ) {
        orderPaymentSync = {
          statusPagamento: 'PAGO',
          valorPago: order.valorTotal,
        };
      }
    } else if (conciliacaoStatus === 'PARCIAL' && valorConciliado > 0) {
      const cappedPaid = Math.min(order.valorTotal, valorConciliado);
      if (
        order.statusPagamento !== 'SINAL' ||
        Number(order.valorPago || 0) !== cappedPaid
      ) {
        orderPaymentSync = {
          statusPagamento: 'SINAL',
          valorPago: cappedPaid,
        };
      }
    }

    return { nextRecord, orderPaymentSync, canMarkConciliated };
  };

  const persistInlineOrderState = async (
    order: Order,
    entries: OrderFinancialPaymentEntry[],
    existing: OrderFinancialRecord | undefined,
    options: {
      manualConciliated: boolean;
      nfStatus?: InvoiceStatus;
      nfDataEmissao?: string;
    }
  ) => {
    const nfStatus = options.nfStatus ?? existing?.nfStatus ?? 'PENDENTE';
    const nfDataEmissao =
      options.nfDataEmissao !== undefined ? options.nfDataEmissao : existing?.nfDataEmissao;

    const { nextRecord, orderPaymentSync } = buildOrderFinancialPayload({
      order,
      entries,
      manualConciliated: options.manualConciliated,
      nfStatus,
      nfDataEmissao,
      nfObservacoes: existing?.nfObservacoes,
      observacoes: existing?.observacoes,
      existing,
    });

    setSavingInlineOrderId(order.id);
    try {
      await onSaveFinancialRecord(nextRecord, orderPaymentSync);
    } finally {
      setSavingInlineOrderId(prev => (prev === order.id ? null : prev));
    }
  };

  const setInlineEntryPatch = (
    order: Order,
    record: OrderFinancialRecord | undefined,
    entryIdx: number,
    patch: Partial<OrderFinancialPaymentEntry>
  ): OrderFinancialPaymentEntry[] => {
    const base = getOrderTableEntries(order, record).map(e => ({ ...e }));
    const next = base.map((item, idx) => (idx === entryIdx ? { ...item, ...patch } : item));
    setInlineDraftsByOrderId(prev => ({ ...prev, [order.id]: next }));
    return next;
  };

  const handleInlineAmountChange = (
    order: Order,
    record: OrderFinancialRecord | undefined,
    entryIdx: number,
    valor: number
  ) => {
    if (getEffectiveReconciliationStatus(order, record) === 'CONCILIADO') return;
    if (valor <= 0) {
      const currentEntries = getOrderTableEntries(order, record);
      const targetEntry = currentEntries[entryIdx];
      const isCash = targetEntry ? isEntryCash(targetEntry, financialChannels) : false;
      setInlineEntryPatch(
        order,
        record,
        entryIdx,
        isCash ? { valor, dataExtrato: '', dataPagamento: '' } : { valor, dataExtrato: '' }
      );
      return;
    }
    setInlineEntryPatch(order, record, entryIdx, { valor });
  };

  const handleInlineAmountBlur = (order: Order, record: OrderFinancialRecord | undefined) => {
    if (getEffectiveReconciliationStatus(order, record) === 'CONCILIADO') return;
    const currentEntries = getOrderTableEntries(order, record);
    const hasDraftInMemory = Boolean(inlineDraftsByOrderId[order.id]);
    if (!hasDraftInMemory) return;

    const hasAnyValueOrDate = currentEntries.some(
      e =>
        (Number(e.valor) || 0) > 0 ||
        Boolean((e.dataExtrato || '').trim() || (e.dataPagamento || '').trim()) ||
        isEntryBonificado(e, financialChannels)
    );
    if (!hasAnyValueOrDate && !record) return;

    void persistInlineOrderState(order, currentEntries, record, {
      manualConciliated: record?.conciliacaoStatus === 'CONCILIADO',
    });
  };

  const handleReplicateOrderValueToStatement = (
    order: Order,
    record: OrderFinancialRecord | undefined
  ) => {
    if (getEffectiveReconciliationStatus(order, record) === 'CONCILIADO') return;
    const currentEntries = getOrderTableEntries(order, record);
    const totalOrderVal = Number((Number(order.valorTotal) || 0).toFixed(2));

    let targetIdx = 0;
    let replicatedVal = totalOrderVal;

    if (currentEntries.length > 1) {
      const emptyIdx = currentEntries.findIndex(e => (Number(e.valor) || 0) <= 0);
      if (emptyIdx >= 0) {
        targetIdx = emptyIdx;
        const otherSum = currentEntries.reduce(
          (sum, e, idx) => (idx === emptyIdx ? sum : sum + Math.max(0, Number(e.valor) || 0)),
          0
        );
        replicatedVal =
          otherSum > 0
            ? Math.max(0, Number((totalOrderVal - otherSum).toFixed(2)))
            : totalOrderVal;
      }
    }

    const nextEntries = setInlineEntryPatch(order, record, targetIdx, {
      valor: replicatedVal,
    });
    void persistInlineOrderState(order, nextEntries, record, {
      manualConciliated: record?.conciliacaoStatus === 'CONCILIADO',
    });

    if (replicatedVal > 0) {
      const focusKey = `${order.id}::${targetIdx}`;
      const tryFocusDate = (retriesLeft: number) => {
        window.requestAnimationFrame(() => {
          const dateInput = inlineStatementDateRefs.current[focusKey];
          if (!dateInput || dateInput.offsetParent === null) return;
          if (dateInput.disabled && retriesLeft > 0) {
            tryFocusDate(retriesLeft - 1);
            return;
          }
          if (!dateInput.disabled) {
            dateInput.focus();
          }
        });
      };
      tryFocusDate(2);
    }
  };

  const resolveInvoiceStatusForEntries = (
    prevEntries: OrderFinancialPaymentEntry[],
    nextEntries: OrderFinancialPaymentEntry[],
    currentNf: InvoiceStatus
  ): InvoiceStatus => {
    const hadBonificado = prevEntries.some(e => isEntryBonificado(e, financialChannels));
    const hasBonificadoNow = nextEntries.some(e => isEntryBonificado(e, financialChannels));
    if (hasBonificadoNow && currentNf === 'PENDENTE') return 'DISPENSADA';
    if (hadBonificado && !hasBonificadoNow && currentNf === 'DISPENSADA') return 'PENDENTE';
    return currentNf;
  };

  const handleInlineChannelChange = (
    order: Order,
    record: OrderFinancialRecord | undefined,
    entryIdx: number,
    channelIdOrName: string
  ) => {
    if (getEffectiveReconciliationStatus(order, record) === 'CONCILIADO') return;
    const ch =
      channelById.get(channelIdOrName) ||
      channelByName.get(channelIdOrName.toLowerCase());
    const patch: Partial<OrderFinancialPaymentEntry> = ch
      ? { meioPagamentoId: ch.id, meioPagamentoNome: ch.nome }
      : { meioPagamentoId: undefined, meioPagamentoNome: channelIdOrName };

    const prevEntries = getOrderTableEntries(order, record);
    const nextEntries = setInlineEntryPatch(order, record, entryIdx, patch);
    const currentEntry = nextEntries[entryIdx];
    const currentNf = record?.nfStatus || 'PENDENTE';
    const nextNfStatus = resolveInvoiceStatusForEntries(
      prevEntries,
      nextEntries,
      currentNf
    );

    const hasDataToPersist =
      Boolean(record) ||
      nextNfStatus !== currentNf ||
      (Number(currentEntry?.valor) || 0) > 0 ||
      Boolean((currentEntry?.dataExtrato || '').trim() || (currentEntry?.dataPagamento || '').trim()) ||
      Boolean(ch && (ch.categoria === 'BONIFICADO' || !ch.exigeNfPadrao));

    if (!hasDataToPersist) return;

    void persistInlineOrderState(order, nextEntries, record, {
      manualConciliated: record?.conciliacaoStatus === 'CONCILIADO',
      nfStatus: nextNfStatus,
      nfDataEmissao: nextNfStatus === 'EMITIDA' ? record?.nfDataEmissao : '',
    });
  };

  const handleInlineDateChange = (
    order: Order,
    record: OrderFinancialRecord | undefined,
    entryIdx: number,
    dateValue: string
  ) => {
    if (getEffectiveReconciliationStatus(order, record) === 'CONCILIADO') return;
    const currentEntries = getOrderTableEntries(order, record);
    const targetEntry = currentEntries[entryIdx];
    if (dateValue && (Number(targetEntry?.valor) || 0) <= 0) {
      alert('Informe um Valor do Extrato maior que zero antes de preencher a Data do Extrato.');
      return;
    }
    if (dateValue && isFutureDateInput(dateValue)) {
      alert('A data informada no extrato não pode ser futura.');
      return;
    }

    const isCash = targetEntry ? isEntryCash(targetEntry, financialChannels) : false;
    const patch: Partial<OrderFinancialPaymentEntry> = isCash
      ? { dataExtrato: dateValue, dataPagamento: dateValue }
      : { dataExtrato: dateValue };

    const nextEntries = setInlineEntryPatch(order, record, entryIdx, patch);
    void persistInlineOrderState(order, nextEntries, record, {
      manualConciliated: record?.conciliacaoStatus === 'CONCILIADO',
    });
  };

  const handleInlineAddEntry = (order: Order, record: OrderFinancialRecord | undefined) => {
    if (getEffectiveReconciliationStatus(order, record) === 'CONCILIADO') return;
    const currentEntries = getOrderTableEntries(order, record).map(e => ({ ...e }));
    const suggested = suggestChannelForOrder(order, financialChannels);
    const nextEntries: OrderFinancialPaymentEntry[] = [
      ...currentEntries,
      {
        id: `ent-${order.id}-${Date.now()}-${currentEntries.length}`,
        dataPagamento: '',
        dataExtrato: '',
        meioPagamentoId: suggested?.id,
        meioPagamentoNome: suggested?.nome || '',
        valor: 0,
        referenciaExtrato: '',
      },
    ];
    setInlineDraftsByOrderId(prev => ({ ...prev, [order.id]: nextEntries }));
  };

  const handleInlineRemoveEntry = (
    order: Order,
    record: OrderFinancialRecord | undefined,
    entryIdx: number
  ) => {
    if (getEffectiveReconciliationStatus(order, record) === 'CONCILIADO') return;
    const currentEntries = getOrderTableEntries(order, record);
    if (currentEntries.length <= 1) return;
    const nextEntries = currentEntries.filter((_, idx) => idx !== entryIdx).map(e => ({ ...e }));
    setInlineDraftsByOrderId(prev => ({ ...prev, [order.id]: nextEntries }));

    if (record) {
      const nextNfStatus = resolveInvoiceStatusForEntries(
        currentEntries,
        nextEntries,
        record.nfStatus || 'PENDENTE'
      );
      void persistInlineOrderState(order, nextEntries, record, {
        manualConciliated: record.conciliacaoStatus === 'CONCILIADO',
        nfStatus: nextNfStatus,
        nfDataEmissao: nextNfStatus === 'EMITIDA' ? record.nfDataEmissao : '',
      });
    }
  };

  const getConciliationBlockReason = (
    order: Order,
    entries: OrderFinancialPaymentEntry[]
  ): string | null => {
    const missingChannel = entries.some(
      ent => (Number(ent.valor) || 0) > 0 && !(ent.meioPagamentoNome || '').trim()
    );
    if (missingChannel) {
      return 'Selecione o meio de pagamento para o valor informado no extrato.';
    }

    const hasFutureDate = entries.some(
      ent =>
        isFutureDateInput(ent.dataExtrato) ||
        (isEntryCash(ent, financialChannels) &&
          !(ent.dataExtrato || '').trim() &&
          isFutureDateInput(ent.dataPagamento))
    );
    if (hasFutureDate) {
      return 'A data informada no extrato não pode ser futura.';
    }

    const { hasBonificado, canMarkConciliated } = computeConciliatedTotals(
      order,
      entries,
      financialChannels
    );
    const entriesTotal = Number(
      entries.reduce((sum, e) => sum + Math.max(0, Number(e.valor) || 0), 0).toFixed(2)
    );
    const saldoDevedor = hasBonificado
      ? 0
      : Math.max(0, Number((order.valorTotal - entriesTotal).toFixed(2)));

    if (saldoDevedor > 0.009) {
      return 'Só é possível marcar como Conciliado quando o saldo devedor for igual a zero (R$ 0,00).';
    }

    if (!canMarkConciliated) {
      const entryWithMissingDate = entries.find(
        e => getEntryMissingDateWarning(e, financialChannels) !== null
      );
      const warning = entryWithMissingDate
        ? getEntryMissingDateWarning(entryWithMissingDate, financialChannels)
        : null;
      return (
        warning ||
        'Só é possível marcar como Conciliado com saldo devedor zerado (R$ 0,00) e Data do Extrato preenchida (ou Bonificado).'
      );
    }

    return null;
  };

  const handleToggleConciliation = async (
    order: Order,
    record: OrderFinancialRecord | undefined,
    nextConciliated: boolean
  ) => {
    if (getEffectiveInvoiceStatus(record) === 'EMITIDA') {
      alert(
        'Não é possível alterar Conciliado enquanto a Nota Fiscal estiver Emitida. Volte a NF para "A emitir" primeiro.'
      );
      return;
    }

    const entries = getOrderTableEntries(order, record).map(e => ({
      ...e,
      meioPagamentoNome: (e.meioPagamentoNome || '').trim(),
      valor: Math.max(0, Number(e.valor) || 0),
    }));

    if (nextConciliated) {
      const blockReason = getConciliationBlockReason(order, entries);
      if (blockReason) {
        alert(blockReason);
        return;
      }
    } else if (getEffectiveReconciliationStatus(order, record) === 'CONCILIADO') {
      const confirmed = window.confirm(
        `Deseja realmente desmarcar a conciliação do pedido #${order.numeroPedido}?\n\nOs campos de Valor / Data do Extrato serão reabilitados e a Nota Fiscal ficará bloqueada até conciliar novamente.`
      );
      if (!confirmed) return;
    }

    await persistInlineOrderState(order, entries, record, {
      manualConciliated: nextConciliated,
    });
  };

  const handleToggleInvoice = async (
    order: Order,
    record: OrderFinancialRecord | undefined,
    nextIssued: boolean
  ) => {
    const { entries, saldoDevedor } = getOrderRowMetrics(order, record);
    const currentNfStatus = getEffectiveInvoiceStatus(record);
    const nextNfStatus: InvoiceStatus = nextIssued ? 'EMITIDA' : 'PENDENTE';

    if (currentNfStatus === nextNfStatus) return;

    if (nextIssued || currentNfStatus === 'DISPENSADA') {
      const isConciliated = getEffectiveReconciliationStatus(order, record) === 'CONCILIADO';
      if (!isConciliated) {
        alert(
          'Só é possível alterar a situação da Nota Fiscal quando o pedido estiver Conciliado.'
        );
        return;
      }

      if (saldoDevedor > 0.009) {
        alert(
          'Só é possível alterar a situação da Nota Fiscal quando o saldo devedor for igual a zero (R$ 0,00).'
        );
        return;
      }
    }

    if (!nextIssued) {
      const confirmed = window.confirm(
        `Deseja realmente alterar a Nota Fiscal do pedido #${order.numeroPedido} de volta para "A emitir"?`
      );
      if (!confirmed) return;
    }

    const nextNfDate = nextIssued
      ? record?.nfDataEmissao || toLocalDateInput()
      : '';

    await persistInlineOrderState(order, entries, record, {
      manualConciliated: record?.conciliacaoStatus === 'CONCILIADO',
      nfStatus: nextNfStatus,
      nfDataEmissao: nextNfDate,
    });
  };

  const openConciliationModal = (order: Order) => {
    const existing = recordsByOrderId.get(order.id);
    const inlineDraft = inlineDraftsByOrderId[order.id];
    const suggested = suggestChannelForOrder(order, financialChannels);
    const payStatus = getEffectivePaymentStatus(order);

    let initialEntries: OrderFinancialPaymentEntry[] = [];
    if (inlineDraft && inlineDraft.length > 0) {
      initialEntries = inlineDraft.map(e => ({ ...e }));
    } else if (existing && existing.lancamentos && existing.lancamentos.length > 0) {
      initialEntries = existing.lancamentos.map(e => ({ ...e }));
    } else if (
      existing &&
      (existing.meioPagamentoNome || existing.dataPagamento || existing.dataExtrato || existing.valorConciliado > 0)
    ) {
      initialEntries = [
        {
          id: `ent-${Date.now()}`,
          dataPagamento: existing.dataPagamento || '',
          dataExtrato: existing.dataExtrato || '',
          meioPagamentoId: existing.meioPagamentoId,
          meioPagamentoNome: existing.meioPagamentoNome || suggested?.nome || '',
          valor: existing.valorConciliado || 0,
          referenciaExtrato: existing.referenciaExtrato || '',
        },
      ];
    } else {
      const defaultAmt =
        payStatus === 'PAGO'
          ? order.valorTotal
          : payStatus === 'SINAL'
          ? getOrderPaidAmount(order)
          : order.valorTotal;
      initialEntries = [
        {
          id: `ent-${Date.now()}`,
          dataPagamento: '',
          dataExtrato: '',
          meioPagamentoId: suggested?.id,
          meioPagamentoNome: suggested?.nome || '',
          valor: Number((defaultAmt || 0).toFixed(2)),
          referenciaExtrato: '',
        },
      ];
    }

    setEditingOrder(order);
    setDraftEntries(initialEntries);
    setDraftConciliated(existing?.conciliacaoStatus === 'CONCILIADO');
    setDraftNfStatus(existing?.nfStatus || 'PENDENTE');
    setDraftNfDataEmissao(existing?.nfDataEmissao || '');
    setDraftNfObs(existing?.nfObservacoes || '');
    setDraftObs(existing?.observacoes || '');
    setShowInlineNewChannel(false);
    setInlineChannelName('');
    setIsModalOpen(true);
  };

  const hasBonificadoInDraft = useMemo(() => {
    return draftEntries.some(entry => isEntryBonificado(entry, financialChannels));
  }, [draftEntries, financialChannels]);

  const draftReconciliation = useMemo(() => {
    if (!editingOrder) {
      return {
        valorConciliado: 0,
        conciliacaoStatus: 'PENDENTE' as const,
        canMarkConciliated: false,
      };
    }
    return deriveReconciliationState(
      editingOrder,
      draftEntries,
      financialChannels,
      draftConciliated
    );
  }, [editingOrder, draftEntries, financialChannels, draftConciliated]);

  const handleUpdateEntry = (
    idx: number,
    patch: Partial<OrderFinancialPaymentEntry>
  ) => {
    const currentEntry = draftEntries[idx];
    const effectiveValor =
      patch.valor !== undefined
        ? Number(patch.valor) || 0
        : Number(currentEntry?.valor) || 0;
    if (patch.dataExtrato && effectiveValor <= 0) {
      alert('Informe um Valor do Extrato maior que zero antes de preencher a Data do Extrato.');
      return;
    }

    if (patch.dataExtrato !== undefined && isFutureDateInput(patch.dataExtrato)) {
      alert('A data informada no extrato não pode ser futura.');
      return;
    }

    setDraftEntries(prev =>
      prev.map((entry, i) => {
        if (i !== idx) return entry;
        const next = { ...entry, ...patch };
        if (patch.valor !== undefined && (Number(patch.valor) || 0) <= 0) {
          next.dataExtrato = '';
        }
        if (
          patch.dataPagamento !== undefined &&
          !entry.dataExtrato &&
          patch.dataPagamento &&
          !isFutureDateInput(patch.dataPagamento) &&
          (Number(next.valor) || 0) > 0
        ) {
          next.dataExtrato = patch.dataPagamento;
        }
        return next;
      })
    );
  };

  const applyDraftEntriesWithNfSync = (nextEntries: OrderFinancialPaymentEntry[]) => {
    const nextNf = resolveInvoiceStatusForEntries(
      draftEntries,
      nextEntries,
      draftNfStatus
    );
    setDraftEntries(nextEntries);
    if (nextNf !== draftNfStatus) {
      setDraftNfStatus(nextNf);
      if (nextNf !== 'EMITIDA') {
        setDraftNfDataEmissao('');
      }
    }
  };

  const handleSelectChannelForEntry = (idx: number, channelIdOrName: string) => {
    const ch =
      channelById.get(channelIdOrName) ||
      channelByName.get(channelIdOrName.toLowerCase());

    const patch: Partial<OrderFinancialPaymentEntry> = ch
      ? { meioPagamentoId: ch.id, meioPagamentoNome: ch.nome }
      : { meioPagamentoId: undefined, meioPagamentoNome: channelIdOrName };

    const nextEntries = draftEntries.map((entry, i) =>
      i === idx ? { ...entry, ...patch } : entry
    );
    applyDraftEntriesWithNfSync(nextEntries);
  };

  const handleAddEntry = () => {
    if (!editingOrder) return;
    const remaining = Math.max(
      0,
      Number((editingOrder.valorTotal - draftReconciliation.valorConciliado).toFixed(2))
    );
    const suggested = suggestChannelForOrder(editingOrder, financialChannels);
    setDraftEntries(prev => [
      ...prev,
      {
        id: `ent-${Date.now()}-${prev.length}`,
        dataPagamento: '',
        dataExtrato: '',
        meioPagamentoId: suggested?.id,
        meioPagamentoNome: suggested?.nome || '',
        valor: remaining,
        referenciaExtrato: '',
      },
    ]);
  };

  const handleCreateInlineChannel = async () => {
    const trimmed = inlineChannelName.trim();
    if (!trimmed) return;
    const isBonificado = inlineChannelCat === 'BONIFICADO';
    const newChannel: FinancialPaymentChannel = {
      id: `fin-ch-${Date.now()}`,
      nome: trimmed,
      categoria: inlineChannelCat,
      exigeNfPadrao: !isBonificado,
      ativo: true,
      ordem: financialChannels.length + 1,
    };
    setSavingChannel(true);
    try {
      const saved = (await onSaveFinancialChannel(newChannel)) || newChannel;
      handleSelectChannelForEntry(inlineChannelTargetIdx, saved.id || saved.nome);
      setShowInlineNewChannel(false);
      setInlineChannelName('');
    } finally {
      setSavingChannel(false);
    }
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    const normalizedEntries = draftEntries.map(ent => ({
      ...ent,
      meioPagamentoNome: (ent.meioPagamentoNome || '').trim(),
      valor: Math.max(0, Number(ent.valor) || 0),
      referenciaExtrato: ent.referenciaExtrato?.trim() || undefined,
    }));

    const hasMissingChannel = normalizedEntries.some(
      ent => ent.valor > 0 && !ent.meioPagamentoNome
    );
    if (hasMissingChannel) {
      alert('Selecione o meio de pagamento para o valor conciliado.');
      return;
    }

    const hasFutureStatementDate = normalizedEntries.some(
      ent =>
        isFutureDateInput(ent.dataExtrato) ||
        (isEntryCash(ent, financialChannels) &&
          !(ent.dataExtrato || '').trim() &&
          isFutureDateInput(ent.dataPagamento))
    );
    if (hasFutureStatementDate) {
      alert('A data informada no extrato não pode ser futura.');
      return;
    }

    if (draftConciliated) {
      const blockReason = getConciliationBlockReason(editingOrder, normalizedEntries);
      if (blockReason) {
        alert(blockReason);
        return;
      }
    }

    const modalEntriesTotal = Number(
      normalizedEntries.reduce((sum, ent) => sum + ent.valor, 0).toFixed(2)
    );
    const modalHasBonif = normalizedEntries.some(ent =>
      isEntryBonificado(ent, financialChannels)
    );
    const modalSaldoDevedor = modalHasBonif
      ? 0
      : Math.max(0, Number((editingOrder.valorTotal - modalEntriesTotal).toFixed(2)));
    if (draftNfStatus === 'EMITIDA' && !draftConciliated) {
      alert(
        'Só é possível manter ou marcar a Nota Fiscal como Emitida quando o pedido estiver Conciliado.'
      );
      return;
    }
    if (draftNfStatus === 'EMITIDA' && modalSaldoDevedor > 0.009) {
      alert(
        'Só é possível alterar a situação da Nota Fiscal quando o saldo devedor for igual a zero (R$ 0,00).'
      );
      return;
    }

    if (draftNfStatus === 'EMITIDA' && !draftNfDataEmissao) {
      alert('Informe a data de emissão da Nota Fiscal.');
      return;
    }

    const existing = recordsByOrderId.get(editingOrder.id);
    const { nextRecord, orderPaymentSync } = buildOrderFinancialPayload({
      order: editingOrder,
      entries: normalizedEntries,
      manualConciliated: draftConciliated,
      nfStatus: draftNfStatus,
      nfDataEmissao: draftNfDataEmissao,
      nfObservacoes: draftNfObs,
      observacoes: draftObs,
      existing,
    });

    setSavingRecord(true);
    try {
      await onSaveFinancialRecord(nextRecord, orderPaymentSync);
      setInlineDraftsByOrderId(prev => {
        if (!(editingOrder.id in prev)) return prev;
        const copy = { ...prev };
        delete copy[editingOrder.id];
        return copy;
      });
      setIsModalOpen(false);
    } finally {
      setSavingRecord(false);
    }
  };

  const handleSaveChannelForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = (editingChannel.nome || '').trim();
    if (!nome) {
      alert('Informe o nome da forma de pagamento.');
      return;
    }
    setSavingChannel(true);
    try {
      await onSaveFinancialChannel({
        id: editingChannel.id || `fin-ch-${Date.now()}`,
        nome,
        categoria: (editingChannel.categoria || 'OUTROS') as FinancialPaymentCategory,
        exigeNfPadrao: editingChannel.exigeNfPadrao !== false,
        ativo: editingChannel.ativo !== false,
        ordem: Number(editingChannel.ordem ?? financialChannels.length + 1),
      });
      setEditingChannel({
        nome: '',
        categoria: 'OUTROS',
        exigeNfPadrao: true,
        ativo: true,
        ordem: financialChannels.length + 2,
      });
    } finally {
      setSavingChannel(false);
    }
  };

  const handleExportExcel = async () => {
    const { exportFinanceiroStyledExcel } = await import('../utils/financeiroExcel');
    const unitLabel =
      activeUnitId === 'all'
        ? 'Todas as Unidades'
        : unitMap.get(activeUnitId)?.nome || 'Unidade';

    const rows = filteredRows.map(({ order, record }) => {
      const recStatus = getEffectiveReconciliationStatus(order, record);
      const nfStatus = getEffectiveInvoiceStatus(record);
      const conciliado = Number(record?.valorConciliado || 0);
      const saldo = Math.max(0, Number((order.valorTotal - conciliado).toFixed(2)));
      return {
        numeroPedido: order.numeroPedido,
        dataEntrega: formatDeliveryTimeRange(order.dataHoraEntrega, order.dataHoraEntregaFim, {
          tipoEntrega: order.tipoEntrega,
          turnoEntrega: order.tipoEntrega === 'DELIVERY' ? order.turnoEntrega : undefined,
        }),
        unidadeNome: unitMap.get(order.unidadeOrigemId)?.nome || '-',
        clienteNome: order.clienteNome,
        statusPedido: ORDER_STATUS_LABELS[order.status],
        valorTotal: Number(order.valorTotal || 0),
        conciliacaoStatus: RECONCILIATION_STATUS_LABELS[recStatus],
        meioPagamento: record?.meioPagamentoNome || '—',
        dataPagamento: formatDateBR(record?.dataPagamento),
        dataExtrato: formatDateBR(record?.dataExtrato),
        valorConciliado: conciliado,
        saldoPendente: saldo,
        nfStatus: INVOICE_STATUS_LABELS[nfStatus],
        nfDataEmissao: formatDateBR(record?.nfDataEmissao),
        nfObservacoes: record?.nfObservacoes || record?.observacoes || '',
      };
    });

    exportFinanceiroStyledExcel({
      unitLabel,
      filterLabel: FILTER_LABELS[statusFilter],
      dateFilterLabel: `Pedido: ${DATE_FILTER_LABELS[orderDateFilter]} • Extrato: ${DATE_FILTER_LABELS[statementDateFilter]}`,
      generatedAtLabel: new Date().toLocaleString('pt-BR'),
      rows,
      channelsSummary: summary.byChannel,
    });
  };

  const canDeleteChannels = userProfile.role === 'ADMIN';

  const renderConciliationToggle = (
    order: Order,
    record: OrderFinancialRecord | undefined,
    isConciliated: boolean,
    isSaving: boolean,
    canCheck = true,
    isLockedByNf = false
  ) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={isConciliated}
      aria-label={`Conciliado do pedido ${order.numeroPedido}`}
      title={
        isLockedByNf
          ? 'Nota Fiscal já emitida — volte a NF para "A emitir" para alterar Conciliado'
          : isConciliated
          ? 'Conciliado — clique para desmarcar'
          : canCheck
          ? 'Marcar pedido como Conciliado'
          : 'Só é possível conciliar com saldo devedor zerado (R$ 0,00) e data no extrato'
      }
      disabled={isSaving || isLockedByNf}
      onClick={e => {
        e.stopPropagation();
        void handleToggleConciliation(order, record, !isConciliated);
      }}
      className={`inline-flex items-center justify-center w-6 h-6 rounded-md border-2 transition-all disabled:cursor-not-allowed print:hidden ${
        isLockedByNf
          ? isConciliated
            ? 'bg-emerald-600/50 border-emerald-600/50 text-white opacity-60'
            : 'bg-slate-100 border-slate-200 text-transparent opacity-50'
          : isConciliated
          ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs hover:bg-emerald-700 hover:border-emerald-700 cursor-pointer disabled:opacity-60'
          : canCheck
          ? 'bg-white border-slate-300 text-transparent hover:border-emerald-500 cursor-pointer disabled:opacity-60'
          : 'bg-slate-100 border-slate-200 text-transparent opacity-60 cursor-not-allowed'
      }`}
    >
      <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />
    </button>
  );

  const renderInvoiceToggle = (
    order: Order,
    record: OrderFinancialRecord | undefined,
    nfStatus: InvoiceStatus,
    isSaving: boolean,
    canToggleInvoice = true
  ) => {
    const blockedMsg =
      'Marque Conciliado (com saldo devedor zerado) para habilitar a Nota Fiscal';

    if (nfStatus === 'DISPENSADA') {
      return (
        <div
          className="inline-flex flex-col items-center gap-0.5 print:hidden"
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={isSaving || !canToggleInvoice}
            onClick={() => void handleToggleInvoice(order, record, false)}
            title={
              canToggleInvoice
                ? 'NF Dispensada — clique para voltar para A emitir'
                : blockedMsg
            }
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
              canToggleInvoice
                ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 cursor-pointer disabled:opacity-60'
                : 'bg-slate-100 text-slate-400 border-slate-200 opacity-50 cursor-not-allowed'
            }`}
          >
            Dispensada
          </button>
        </div>
      );
    }

    const isIssued = nfStatus === 'EMITIDA';
    const canClickEmitida = canToggleInvoice;
    const canClickPendente = isIssued || canToggleInvoice;
    const isBlockedEmitida = !isIssued && !canClickEmitida;
    const isBlockedPendente = !canClickPendente;

    return (
      <div
        className="inline-flex flex-col items-center gap-0.5 print:hidden"
        onClick={e => e.stopPropagation()}
      >
        <div
          className={`inline-flex flex-col items-stretch rounded-lg border border-slate-200 bg-slate-100 p-0.5 gap-0.5 min-w-[64px] transition-opacity ${
            !canToggleInvoice && !isIssued ? 'opacity-60' : ''
          }`}
          role="group"
          aria-label={`Nota Fiscal do pedido ${order.numeroPedido}`}
        >
          <button
            type="button"
            disabled={isSaving || isBlockedEmitida}
            title={
              isBlockedEmitida
                ? blockedMsg
                : isIssued
                ? 'NF Emitida'
                : 'Marcar NF como Emitida'
            }
            onClick={() => void handleToggleInvoice(order, record, true)}
            className={`w-full px-2 py-0.5 text-center rounded-md text-[10px] font-bold transition-all whitespace-nowrap ${
              isIssued
                ? 'bg-emerald-600 text-white shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
                : isBlockedEmitida
                ? 'opacity-50 cursor-not-allowed text-slate-400'
                : 'text-slate-600 hover:text-emerald-700 cursor-pointer disabled:opacity-60'
            }`}
          >
            Emitida
          </button>
          <button
            type="button"
            disabled={isSaving || isBlockedPendente}
            title={
              isBlockedPendente
                ? blockedMsg
                : !isIssued
                ? 'NF A emitir'
                : 'Voltar NF para A emitir'
            }
            onClick={() => void handleToggleInvoice(order, record, false)}
            className={`w-full px-2 py-0.5 text-center rounded-md text-[10px] font-bold transition-all whitespace-nowrap ${
              !isIssued
                ? 'bg-rose-600 text-white shadow-2xs cursor-pointer disabled:cursor-not-allowed'
                : isBlockedPendente
                ? 'opacity-50 cursor-not-allowed text-slate-400'
                : 'text-slate-600 hover:text-rose-700 cursor-pointer disabled:opacity-60'
            }`}
          >
            A emitir
          </button>
        </div>
        {isIssued && record?.nfDataEmissao && (
          <span className="text-[9px] font-mono text-emerald-700">
            {formatDateBR(record.nfDataEmissao)}
          </span>
        )}
      </div>
    );
  };

  const getOrderRowMetrics = (order: Order, record?: OrderFinancialRecord) => {
    const entries = getOrderTableEntries(order, record);
    const draftTotals = computeConciliatedTotals(order, entries, financialChannels);
    const entriesTotal = Number(
      entries.reduce((sum, e) => sum + Math.max(0, Number(e.valor) || 0), 0).toFixed(2)
    );
    const saldoDevedor = draftTotals.hasBonificado
      ? 0
      : Math.max(0, Number((order.valorTotal - entriesTotal).toFixed(2)));
    const displayConciliated =
      record?.valorConciliado && record.valorConciliado > 0
        ? record.valorConciliado
        : draftTotals.valorValidadoExtrato;
    return { entries, draftTotals, entriesTotal, saldoDevedor, displayConciliated };
  };

  const getGroupTotals = (
    items: Array<{ order: Order; record?: OrderFinancialRecord }>
  ): { totalPedido: number; totalExtrato: number } => {
    let totalPedido = 0;
    let totalExtrato = 0;
    for (const { order, record } of items) {
      totalPedido += Number(order.valorTotal) || 0;
      totalExtrato += getOrderRowMetrics(order, record).entriesTotal;
    }
    return {
      totalPedido: Number(totalPedido.toFixed(2)),
      totalExtrato: Number(totalExtrato.toFixed(2)),
    };
  };

  const getOrderBillingUnit = (order: Order) => {
    const preferredId = resolveOrderBillingUnitId(order);
    const resolvedUnit = unitMap.get(preferredId) || unitMap.get(order.unidadeOrigemId);
    return {
      unidadeId: resolvedUnit?.id || preferredId,
      unidadeNome: resolvedUnit?.nome || 'Unidade Não Identificada',
    };
  };

  const sortedBillingUnits = useMemo(
    () => [...units].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [units]
  );

  const billingReportData: FaturamentoReportData = useMemo(() => {
    const unitLabel =
      billingReportUnitId === 'all'
        ? 'Todas as Unidades'
        : unitMap.get(billingReportUnitId)?.nome || 'Unidade';
    const statementPeriodLabel =
      billingReportStartDate || billingReportEndDate
        ? `${billingReportStartDate ? formatDateBR(billingReportStartDate) : 'Início'} até ${
            billingReportEndDate ? formatDateBR(billingReportEndDate) : 'Hoje'
          }`
        : 'Todas as datas';
    const filterLabel = BILLING_REPORT_STATUS_LABELS[billingReportStatus];
    const dateFilterLabel =
      billingReportStartDate || billingReportEndDate
        ? 'Por Data do Extrato'
        : 'Todos os Períodos';

    if (
      !isBillingReportModalOpen ||
      (billingReportStartDate &&
        billingReportEndDate &&
        billingReportStartDate > billingReportEndDate)
    ) {
      return {
        unitLabel,
        filterLabel,
        dateFilterLabel,
        statementPeriodLabel,
        generatedAtLabel: new Date().toLocaleString('pt-BR'),
        groups: [],
        totalOrders: 0,
        grandTotalValor: 0,
        grandTotalRecebido: 0,
        grandTotalSaldo: 0,
      };
    }

    const sourceList = orders
      .filter(isOrderEligibleForFinancial)
      .map(order => ({
        order,
        record: recordsByOrderId.get(order.id),
      }));

    const rows: FaturamentoReportRow[] = [];

    for (const { order, record } of sourceList) {
      const billingUnit = getOrderBillingUnit(order);
      if (billingReportUnitId !== 'all' && billingUnit.unidadeId !== billingReportUnitId) {
        continue;
      }

      if (billingReportStatus === 'CONCILIADO') {
        if (getEffectiveReconciliationStatus(order, record) !== 'CONCILIADO') continue;
      } else if (billingReportStatus === 'NAO_CONCILIADO') {
        if (getEffectiveReconciliationStatus(order, record) === 'CONCILIADO') continue;
      } else if (billingReportStatus === 'NF_EMITIDA') {
        if (getEffectiveInvoiceStatus(record) !== 'EMITIDA') continue;
      } else if (billingReportStatus === 'NF_PENDENTE') {
        if (getEffectiveInvoiceStatus(record) !== 'PENDENTE') continue;
      }

      const { entries, entriesTotal, saldoDevedor } = getOrderRowMetrics(order, record);

      const rawStatementDates = entries
        .map(ent => {
          const isCash = isEntryCash(ent, financialChannels);
          return toLocalDateInput(ent.dataExtrato || (isCash ? ent.dataPagamento : '') || '');
        })
        .filter(Boolean);

      if (rawStatementDates.length === 0 && record?.dataExtrato) {
        const fallbackIso = toLocalDateInput(record.dataExtrato);
        if (fallbackIso) rawStatementDates.push(fallbackIso);
      }

      const uniqueSortedDates = Array.from(new Set(rawStatementDates)).sort((a, b) =>
        a.localeCompare(b)
      );
      const dataExtratoIso =
        uniqueSortedDates.length > 0 ? uniqueSortedDates[uniqueSortedDates.length - 1] : '';

      if (billingReportStartDate || billingReportEndDate) {
        if (!dataExtratoIso) continue;
        if (billingReportStartDate && dataExtratoIso < billingReportStartDate) continue;
        if (billingReportEndDate && dataExtratoIso > billingReportEndDate) continue;
      }

      const activeChannelNames = Array.from(
        new Set(
          entries
            .filter(
              ent =>
                (Number(ent.valor) || 0) > 0 ||
                Boolean((ent.dataExtrato || '').trim()) ||
                Boolean((ent.dataPagamento || '').trim()) ||
                isEntryBonificado(ent, financialChannels)
            )
            .map(ent => (ent.meioPagamentoNome || '').trim())
            .filter(Boolean)
        )
      );

      const formaPagamentoFinanceiro =
        activeChannelNames.length > 0
          ? activeChannelNames.join(' + ')
          : (record?.meioPagamentoNome || '').trim() || '—';

      const recStatus = getEffectiveReconciliationStatus(order, record);
      const nfStatus = getEffectiveInvoiceStatus(record);
      const formaPagamentoPedido =
        ORDER_PAYMENT_METHOD_LABELS[order.formaPagamento] || order.formaPagamento || '';
      const nfStatusLabel =
        nfStatus === 'EMITIDA'
          ? 'Emitida'
          : nfStatus === 'DISPENSADA'
          ? 'Dispensada'
          : 'A emitir';

      rows.push({
        unidadeId: billingUnit.unidadeId,
        unidadeNome: billingUnit.unidadeNome,
        dataExtratoIso,
        dataExtratoLabel:
          uniqueSortedDates.length > 0
            ? uniqueSortedDates.map(formatDateBR).join(', ')
            : '—',
        numeroPedido: order.numeroPedido,
        formaPagamentoPedido,
        dataPedidoIso: toLocalDateInput(order.dataPedido || ''),
        clienteNome: order.clienteNome,
        valor: Number(order.valorTotal || 0),
        valorRecebido: entriesTotal,
        saldoAReceber: saldoDevedor,
        formaPagamentoFinanceiro,
        conciliado: recStatus === 'CONCILIADO',
        nfStatus,
        nfStatusLabel,
      });
    }

    const grouped = groupAndSortFaturamentoRows(rows);
    return {
      unitLabel,
      filterLabel,
      dateFilterLabel,
      statementPeriodLabel,
      generatedAtLabel: new Date().toLocaleString('pt-BR'),
      ...grouped,
    };
  }, [
    isBillingReportModalOpen,
    billingReportUnitId,
    billingReportStatus,
    billingReportStartDate,
    billingReportEndDate,
    orders,
    recordsByOrderId,
    unitMap,
    financialChannels,
    inlineDraftsByOrderId,
  ]);

  const validateBillingDateRange = (): boolean => {
    if (
      billingReportStartDate &&
      billingReportEndDate &&
      billingReportStartDate > billingReportEndDate
    ) {
      alert('A data inicial do extrato não pode ser maior que a data final.');
      return false;
    }
    return true;
  };

  const handleExportBillingPdf = async () => {
    if (!validateBillingDateRange()) return;
    setExportingBillingFormat('PDF');
    try {
      const { exportFaturamentoPdf } = await import('../utils/faturamentoReportPdf');
      exportFaturamentoPdf(billingReportData);
    } finally {
      setExportingBillingFormat(null);
    }
  };

  const handleExportBillingExcel = async () => {
    if (!validateBillingDateRange()) return;
    setExportingBillingFormat('XLSX');
    try {
      const { exportFaturamentoStyledExcel } = await import('../utils/faturamentoReportExcel');
      exportFaturamentoStyledExcel(billingReportData);
    } finally {
      setExportingBillingFormat(null);
    }
  };

  const renderOrderNumberControl = (order: Order) =>
    onOpenOrderInPedidos ? (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onOpenOrderInPedidos(order, true);
        }}
        title="Abrir edição do pedido"
        className="text-brand-700 hover:text-brand-900 hover:underline cursor-pointer text-left font-mono font-bold print:text-slate-900 print:no-underline"
      >
        {order.numeroPedido}
      </button>
    ) : (
      <span>{order.numeroPedido}</span>
    );

  const getUnitBadgeClasses = (unidadeId: string, unitName: string): string => {
    let idx = units.findIndex(u => u.id === unidadeId);
    if (idx < 0) {
      idx = Array.from(unitName).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    }
    return STORE_BADGE_PALETTE[idx % STORE_BADGE_PALETTE.length];
  };

  const renderUnitBadge = (
    unidadeId: string,
    unitName: string,
    maxWidthClass = 'max-w-[95px]'
  ) => (
    <span
      className={`inline-block ${maxWidthClass} truncate px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getUnitBadgeClasses(
        unidadeId,
        unitName
      )}`}
      title={unitName}
    >
      {unitName}
    </span>
  );

  const renderOrderPaymentMethodBadge = (order: Order) => {
    const label = ORDER_PAYMENT_METHOD_LABELS[order.formaPagamento] || order.formaPagamento;
    const badgeClass =
      ORDER_PAYMENT_METHOD_BADGES[order.formaPagamento] ||
      'bg-slate-100 text-slate-700 border-slate-300';
    return (
      <span
        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${badgeClass}`}
      >
        {label}
      </span>
    );
  };

  const renderOrderPaymentStatusBadge = (order: Order, payStatus: PaymentStatus) => {
    const isPaid = payStatus === 'PAGO';
    const isPartial = payStatus === 'SINAL';
    const label = isPaid ? 'Pago' : isPartial ? 'Não pago (Sinal)' : 'Não pago';
    const badgeClass = isPaid
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : isPartial
      ? 'bg-sky-50 text-sky-700 border-sky-200'
      : 'bg-rose-50 text-rose-700 border-rose-200';
    const title = isPartial
      ? `Sinal pago: R$ ${formatCurrencyBR(getOrderPaidAmount(order))}`
      : label;

    return (
      <span
        className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-sans font-semibold border whitespace-nowrap ${badgeClass}`}
        title={title}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between md:bg-white md:border-b md:border-[#e2e8f0] md:px-4 lg:px-5 md:py-3 md:gap-4 print:hidden">
        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2.5 md:p-0 md:bg-transparent md:border-b-0">
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex flex-wrap items-center gap-2">
            <span>Financeiro</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {filteredRows.length} pedidos
            </span>
          </h1>
        </div>

        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 flex flex-wrap items-center gap-2">
          <div
            className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs shrink-0"
            role="group"
            aria-label="Modo de visualização"
          >
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              title="Cards"
              aria-label="Cards"
              className={`h-full flex items-center justify-center px-2 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'CARDS'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
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
                viewMode === 'TABLE'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsChannelsModalOpen(true)}
            title="Gerenciar Meios de Pagamento"
            aria-label="Gerenciar Meios de Pagamento"
            className="flex items-center justify-center gap-1.5 h-8 w-8 md:w-auto px-0 md:px-3 text-xs font-bold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors shadow-2xs cursor-pointer"
          >
            <CreditCard className="w-4 h-4 text-brand-600" />
            <span className="hidden md:inline">Meios de Pagamento</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setBillingReportUnitId(activeUnitId);
              setIsBillingReportModalOpen(true);
            }}
            title="Gerar Relatório de Faturamento (PDF / XLSX)"
            aria-label="Relatório de Faturamento"
            className="flex items-center justify-center gap-1.5 h-8 w-8 md:w-auto px-0 md:px-3 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden md:inline">Relatório Faturamento</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            title="Exportar Excel"
            aria-label="Exportar Excel"
            className="flex items-center justify-center h-8 w-8 p-0 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            title="Imprimir"
            aria-label="Imprimir"
            className="flex items-center justify-center h-8 w-8 p-0 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="shrink-0 flex flex-col md:flex-row md:flex-wrap md:items-center justify-between md:bg-white/70 md:border-b md:border-[#e2e8f0] md:px-4 lg:px-5 md:py-2 md:gap-2 print:hidden">
        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 flex items-center w-full md:w-auto min-w-0 overflow-hidden">
          <HybridFilterSort
            dateLabel="Data do Pedido:"
            dateValue={orderDateFilter}
            onDateChange={v => setOrderDateFilter(v as FinancialDateFilter)}
            dateOptions={[
              { value: 'TODOS', label: 'Pedido: Todo o Período' },
              { value: 'MES_ATUAL', label: 'Pedido: Mês Atual' },
              { value: 'ULTIMOS_30_DIAS', label: 'Pedido: Últimos 30d' },
              { value: 'ULTIMOS_7_DIAS', label: 'Pedido: Últimos 7d' },
            ]}
            secondDateLabel="Data do Extrato:"
            secondDateValue={statementDateFilter}
            onSecondDateChange={v => setStatementDateFilter(v as FinancialDateFilter)}
            secondDateOptions={[
              { value: 'TODOS', label: 'Extrato: Todo o Período' },
              { value: 'MES_ATUAL', label: 'Extrato: Mês Atual' },
              { value: 'ULTIMOS_30_DIAS', label: 'Extrato: Últimos 30d' },
              { value: 'ULTIMOS_7_DIAS', label: 'Extrato: Últimos 7d' },
            ]}
            filterLabel="Situação:"
            filterValue={statusFilter}
            onFilterChange={v => setStatusFilter(v as FinancialStatusFilter)}
            filterOptions={[
              { value: 'PENDENTES_GERAL', label: 'Pendentes (Conc./NF)' },
              { value: 'PRONTOS_PARA_NF', label: 'Prontos p/ Emitir NF' },
              { value: 'PENDENTE_CONCILIACAO', label: 'Pendente Conciliação' },
              { value: 'PENDENTE_NF', label: 'Pendente de NF' },
              { value: 'CONCLUIDOS', label: 'Conciliado + NF OK' },
              { value: 'TODOS', label: 'Todos' },
            ]}
            sortValue={sortBy}
            onSortChange={v => setSortBy(v as FinancialSortBy)}
            sortOptions={[
              { value: 'DATA_PEDIDO_ASC', label: 'Data Pedido ↑' },
              { value: 'DATA_PEDIDO_DESC', label: 'Data Pedido ↓' },
              { value: 'PRIORIDADE_NF', label: 'Prioridade NF / Entrega ↑' },
              { value: 'DATA_EXTRATO_DESC', label: 'Data Extrato ↓' },
              { value: 'VALOR_DESC', label: 'Maior Valor' },
              { value: 'CLIENTE_ASC', label: 'Cliente (A-Z)' },
            ]}
            groupValue={groupBy}
            onGroupChange={v => setGroupBy(v as FinancialGroupBy)}
            groupOptions={[
              { value: 'PENDENCIA', label: 'Pendência' },
              { value: 'MEIO_PAGAMENTO', label: 'Meio Pagamento' },
              { value: 'LOJA_ORIGEM', label: 'Loja Origem' },
              { value: 'DATA_EXTRATO', label: 'Data Extrato' },
              { value: 'NENHUM', label: 'Sem Agrupamento' },
            ]}
          />
        </div>

        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 w-full md:flex-1 md:min-w-[140px] md:max-w-xs">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar pedido, cliente, valor, meio ou NF..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-3 py-0 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        className={
          viewMode === 'TABLE'
            ? 'flex-1 min-h-0 min-w-0 flex flex-col p-2.5 sm:p-3 gap-2.5 overflow-hidden'
            : 'flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-2.5 sm:p-3 space-y-3'
        }
      >
        {/* Visualização Cards (Mobile padrão + alternável no Desktop) */}
        {viewMode === 'CARDS' && (
          <div className="space-y-5 print:hidden">
            {filteredRows.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                <Receipt className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs">Nenhum pedido encontrado neste filtro financeiro.</p>
              </div>
            ) : (
              groupedRows.map(group => {
                const expanded = isGroupExpanded(group.label, groupBy !== 'NENHUM');
                const { totalPedido, totalExtrato } = getGroupTotals(group.items);
                return (
                  <div key={group.label} className="space-y-2.5">
                    {groupBy !== 'NENHUM' && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.label)}
                        className="w-full max-w-full min-w-0 flex flex-col gap-1 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 rounded-lg px-3 py-2 cursor-pointer transition-colors text-left"
                      >
                        <div className="flex items-center justify-between gap-2 w-full min-w-0">
                          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 min-w-0">
                            {expanded ? (
                              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span className="truncate">{group.label}</span>
                          </span>
                          <span className="text-[11px] font-mono font-semibold text-slate-600 shrink-0">
                            {group.items.length} pedido(s)
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono pl-5">
                          <span className="text-slate-600">
                            Valor Pedido:{' '}
                            <strong className="text-slate-900 font-bold">
                              R$ {formatCurrencyBR(totalPedido)}
                            </strong>
                          </span>
                          <span className="text-slate-600">
                            Valor Extrato:{' '}
                            <strong
                              className={
                                totalExtrato > 0
                                  ? 'text-emerald-700 font-bold'
                                  : 'text-slate-600 font-semibold'
                              }
                            >
                              R$ {formatCurrencyBR(totalExtrato)}
                            </strong>
                          </span>
                        </div>
                      </button>
                    )}

                    {expanded && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {group.items.map(({ order, record }) => {
                          const recStatus = getEffectiveReconciliationStatus(order, record);
                          const isConciliated = recStatus === 'CONCILIADO';
                          const nfStatus = getEffectiveInvoiceStatus(record);
                          const readyForNf = isOrderReadyForInvoice(order, record);
                          const awaitingStmt = isOrderPaidAndAwaitingStatement(order, record);
                          const payStatus = getEffectivePaymentStatus(order);
                          const isSelected = isModalOpen && editingOrder?.id === order.id;
                          const isSaving = savingInlineOrderId === order.id;
                          const unitName = unitMap.get(order.unidadeOrigemId)?.nome || '—';
                          const {
                            entries,
                            draftTotals,
                            entriesTotal,
                            saldoDevedor,
                            displayConciliated,
                          } = getOrderRowMetrics(order, record);

                          return (
                            <div
                              key={order.id}
                              onClick={() => openConciliationModal(order)}
                              className={`border rounded-xl p-3.5 shadow-xs flex flex-col justify-between gap-2.5 w-full max-w-full min-w-0 overflow-hidden cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-brand-50/70 border-brand-400 ring-2 ring-brand-500 shadow-md'
                                  : readyForNf
                                  ? 'bg-rose-50/40 border-rose-300 hover:border-rose-400'
                                  : 'bg-white border-slate-200 hover:border-brand-400'
                              }`}
                            >
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-start gap-2">
                                      <div className="flex flex-col">
                                        <span className="text-xs">
                                          {renderOrderNumberControl(order)}
                                        </span>
                                        <span className="text-[10px] font-mono text-slate-500">
                                          {formatDateBR(order.dataPedido)}
                                        </span>
                                      </div>
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ORDER_STATUS_BADGES[order.status]}`}
                                      >
                                        {ORDER_STATUS_LABELS[order.status]}
                                      </span>
                                    </div>
                                    <h3 className="text-xs font-bold text-slate-800 truncate mt-1">
                                      {order.clienteNome}
                                    </h3>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <button
                                      type="button"
                                      disabled={isConciliated}
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleReplicateOrderValueToStatement(order, record);
                                      }}
                                      title={
                                        isConciliated
                                          ? 'Pedido conciliado — desmarque Conciliado para editar o extrato'
                                          : 'Clique para replicar o valor do pedido para o Valor do Extrato'
                                      }
                                      className="font-mono font-bold text-xs text-slate-900 hover:text-brand-700 hover:underline cursor-pointer disabled:hover:no-underline disabled:hover:text-slate-900 disabled:cursor-default print:no-underline print:text-slate-900"
                                    >
                                      R$ {formatCurrencyBR(order.valorTotal)}
                                    </button>
                                    <div className="mt-0.5">
                                      {renderOrderPaymentStatusBadge(order, payStatus)}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                  {renderUnitBadge(order.unidadeOrigemId, unitName, 'max-w-[110px]')}
                                  {renderOrderPaymentMethodBadge(order)}
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-semibold border ${RECONCILIATION_STATUS_BADGES[recStatus]}`}
                                  >
                                    {RECONCILIATION_STATUS_LABELS[recStatus]}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-semibold border ${INVOICE_STATUS_BADGES[nfStatus]}`}
                                  >
                                    {INVOICE_STATUS_LABELS[nfStatus]}
                                  </span>
                                  {readyForNf && (
                                    <span className="px-2 py-0.5 rounded-full font-bold bg-rose-600 text-white text-[9px]">
                                      Emitir NF Agora
                                    </span>
                                  )}
                                  {awaitingStmt && (
                                    <span className="px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-800 border border-amber-200 text-[9px]">
                                      Conferir extrato
                                    </span>
                                  )}
                                </div>

                                <div className="bg-slate-50 border border-slate-200/70 rounded-lg p-2 text-[11px] space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-500">Extrato / Meio:</span>
                                    {(() => {
                                      const entryChannelNames = Array.from(
                                        new Set(
                                          entries
                                            .map(e => (e.meioPagamentoNome || '').trim())
                                            .filter(Boolean)
                                        )
                                      );
                                      const summaryChannelName =
                                        record?.meioPagamentoNome ||
                                        (entries.some(e => e.valor > 0 || e.dataExtrato)
                                          ? entryChannelNames.join(' + ')
                                          : '');
                                      const isSingleChannel =
                                        Boolean(summaryChannelName) &&
                                        !summaryChannelName.includes(' + ');
                                      const summaryCh = isSingleChannel
                                        ? (record?.meioPagamentoId
                                            ? channelById.get(record.meioPagamentoId)
                                            : undefined) ||
                                          channelByName.get(summaryChannelName.toLowerCase()) ||
                                          (entries.length === 1 && entries[0].meioPagamentoId
                                            ? channelById.get(entries[0].meioPagamentoId)
                                            : undefined)
                                        : undefined;
                                      const summaryColorClass = isSingleChannel
                                        ? getStatementChannelTextColorClass(
                                            summaryCh,
                                            summaryChannelName
                                          )
                                        : summaryChannelName
                                        ? 'text-slate-800'
                                        : 'text-slate-400';

                                      return (
                                        <span className="font-semibold truncate">
                                          <span className={summaryColorClass}>
                                            {summaryChannelName || 'A preencher'}
                                          </span>
                                          {record?.dataExtrato ? (
                                            <span className="text-slate-600">{` • ${formatDateBR(record.dataExtrato)}`}</span>
                                          ) : null}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  {entries.some(e => e.valor > 0 || e.dataExtrato || e.dataPagamento) && (
                                    <div className="space-y-0.5 pt-0.5">
                                      {entries.map((ent, idx) => {
                                        const entChannel =
                                          (ent.meioPagamentoId
                                            ? channelById.get(ent.meioPagamentoId)
                                            : undefined) ||
                                          (ent.meioPagamentoNome
                                            ? channelByName.get(ent.meioPagamentoNome.toLowerCase())
                                            : undefined);
                                        const entColorClass = getStatementChannelTextColorClass(
                                          entChannel,
                                          ent.meioPagamentoNome
                                        );

                                        return (
                                          <div
                                            key={ent.id || idx}
                                            className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-600"
                                          >
                                            <span className="truncate">
                                              <span className={`font-semibold ${entColorClass}`}>
                                                {ent.meioPagamentoNome || 'Sem meio'}
                                              </span>{' '}
                                              • {formatDateBR(ent.dataExtrato || ent.dataPagamento)}
                                            </span>
                                            <span className="font-semibold text-slate-800 shrink-0">
                                              R$ {formatCurrencyBR(ent.valor || 0)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-200/60">
                                    <span className="text-slate-500">Soma Extrato:</span>
                                    <span
                                      className={`font-mono font-semibold ${
                                        entriesTotal > 0 &&
                                        Math.abs(entriesTotal - order.valorTotal) <= 0.01
                                          ? 'text-emerald-700'
                                          : 'text-slate-800'
                                      }`}
                                    >
                                      R$ {formatCurrencyBR(entriesTotal)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-500 inline-flex items-center gap-1">
                                      {saldoDevedor <= 0.009 && (
                                        <CheckCircle2
                                          className="w-3 h-3 text-emerald-600 shrink-0"
                                          aria-hidden="true"
                                        />
                                      )}
                                      <span>Saldo:</span>
                                    </span>
                                    <span
                                      className={`font-mono font-bold ${
                                        saldoDevedor > 0.009 ? 'text-rose-600' : 'text-emerald-700'
                                      }`}
                                    >
                                      R$ {formatCurrencyBR(saldoDevedor)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-500">Validado Extrato:</span>
                                    <span className="font-mono font-bold text-slate-900">
                                      R$ {formatCurrencyBR(displayConciliated)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div
                                className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2"
                                onClick={e => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                                    Conciliado
                                  </span>
                                  {renderConciliationToggle(
                                    order,
                                    record,
                                    recStatus === 'CONCILIADO',
                                    isSaving,
                                    saldoDevedor <= 0.009 && draftTotals.canMarkConciliated,
                                    nfStatus === 'EMITIDA'
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                                    NF
                                  </span>
                                  {renderInvoiceToggle(
                                    order,
                                    record,
                                    nfStatus,
                                    isSaving,
                                    recStatus === 'CONCILIADO' && saldoDevedor <= 0.009
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
              })
            )}
          </div>
        )}

        {/* Visualização Tabela (Desktop + Impressão) */}
        <div
          id="print-report-area"
          className={
            viewMode === 'TABLE'
              ? 'flex-1 min-h-0 bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-auto max-w-full max-h-full print:overflow-visible print:max-h-none'
              : 'hidden print:block bg-white'
          }
        >
          <PrintReportHeader
            title="Financeiro — Conciliação & Notas Fiscais"
            badge={FILTER_LABELS[statusFilter]}
            subtitle={`${filteredRows.length} pedido(s) • Conciliado: R$ ${formatCurrencyBR(summary.totalConciliatedAmount)}`}
          />
          <table className="w-full text-left border-collapse">
            <colgroup>
              <col className="w-[132px]" />
              <col className="min-w-[155px]" />
              <col className="w-[106px]" />
              <col className="w-[122px]" />
              <col className="w-[228px]" />
              <col className="w-[70px]" />
              <col className="w-[80px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-tight text-slate-500">
              <tr>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">Pedido / Data / Status</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">
                  {hideUnidadeCol ? 'Cliente / Entrega' : 'Cliente / Entrega / Unidade'}
                </th>
                <th className="py-2 px-2 font-semibold leading-tight w-[106px]">
                  Forma / Pagamento
                </th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap">
                  Valor Pedido
                </th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">
                  Valor / Data do Extrato
                </th>
                <th className="py-2 px-1.5 font-semibold text-center whitespace-nowrap">
                  Conciliado
                </th>
                <th className="py-2 px-1.5 font-semibold text-center whitespace-nowrap">
                  Nota Fiscal
                </th>
              </tr>
            </thead>
            <tbody className="text-[11px]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p>Nenhum pedido encontrado neste filtro financeiro.</p>
                  </td>
                </tr>
              ) : (
                groupedRows.map(group => {
                  const expanded = isGroupExpanded(group.label, groupBy !== 'NENHUM');
                  const { totalPedido, totalExtrato } = getGroupTotals(group.items);
                  return (
                    <React.Fragment key={group.label}>
                      {groupBy !== 'NENHUM' && (
                        <tr
                          onClick={() => toggleGroup(group.label)}
                          className="bg-emerald-50 hover:bg-emerald-100/80 border-t border-slate-200 cursor-pointer transition-colors"
                        >
                          <td
                            colSpan={3}
                            className="py-2 px-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {expanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {group.label} ({group.items.length})
                              </span>
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono whitespace-nowrap">
                            <span className="text-[9px] font-sans font-semibold uppercase tracking-normal text-slate-500 mr-1">
                              Pedido:
                            </span>
                            <span className="text-[11px] font-bold text-slate-900">
                              R$ {formatCurrencyBR(totalPedido)}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-left font-mono whitespace-nowrap">
                            <span className="text-[9px] font-sans font-semibold uppercase tracking-normal text-slate-500 mr-1">
                              Extrato:
                            </span>
                            <span
                              className={`text-[11px] font-bold ${
                                totalExtrato > 0 ? 'text-emerald-700' : 'text-slate-600'
                              }`}
                            >
                              R$ {formatCurrencyBR(totalExtrato)}
                            </span>
                          </td>
                          <td colSpan={2} className="py-2 px-1.5" />
                        </tr>
                      )}
                      {expanded &&
                        group.items.map(({ order, record }) => {
                          const recStatus = getEffectiveReconciliationStatus(order, record);
                          const isConciliated = recStatus === 'CONCILIADO';
                          const nfStatus = getEffectiveInvoiceStatus(record);
                          const readyForNf = isOrderReadyForInvoice(order, record);
                          const payStatus = getEffectivePaymentStatus(order);
                          const isSelected = isModalOpen && editingOrder?.id === order.id;
                          const isSaving = savingInlineOrderId === order.id;
                          const unitName = unitMap.get(order.unidadeOrigemId)?.nome || '—';
                          const {
                            entries,
                            draftTotals,
                            entriesTotal,
                            saldoDevedor,
                          } = getOrderRowMetrics(order, record);
                          const rowCount = entries.length;

                          const rowBgClass = isSelected
                            ? 'bg-brand-50/70'
                            : readyForNf
                            ? 'bg-rose-50/40'
                            : 'bg-white';
                          const accentBorderClass = isSelected
                            ? 'border-l-4 border-l-brand-600'
                            : readyForNf
                            ? 'border-l-4 border-l-rose-500'
                            : '';

                          return entries.map((entry, entryIdx) => {
                            const resolvedCh =
                              (entry.meioPagamentoId
                                ? channelById.get(entry.meioPagamentoId)
                                : undefined) ||
                              (entry.meioPagamentoNome
                                ? channelByName.get(entry.meioPagamentoNome.toLowerCase())
                                : undefined);
                            const channelSelectVal =
                              resolvedCh?.id ||
                              entry.meioPagamentoId ||
                              entry.meioPagamentoNome ||
                              '';
                            const isCash = isEntryCash(entry, financialChannels);
                            const entryDateVal =
                              entry.dataExtrato || (isCash ? entry.dataPagamento : '') || '';
                            const missingDateWarning = getEntryMissingDateWarning(
                              entry,
                              financialChannels
                            );

                            return (
                              <tr
                                key={`${order.id}-${entry.id || entryIdx}`}
                                onClick={() => openConciliationModal(order)}
                                className={`cursor-pointer transition-colors hover:bg-slate-50/80 ${rowBgClass} ${
                                  entryIdx === 0 ? 'border-t border-slate-200' : ''
                                }`}
                              >
                                {entryIdx === 0 && (
                                  <>
                                    <td
                                      rowSpan={rowCount}
                                      className={`py-2 px-2 align-top font-mono font-bold text-[11px] text-slate-900 whitespace-nowrap ${accentBorderClass}`}
                                    >
                                      <div>{renderOrderNumberControl(order)}</div>
                                      <div className="text-[10px] font-mono font-normal text-slate-500 mt-0.5">
                                        {formatDateBR(order.dataPedido)}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1 mt-1">
                                        <span
                                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-sans font-semibold border ${ORDER_STATUS_BADGES[order.status]}`}
                                        >
                                          {ORDER_STATUS_LABELS[order.status]}
                                        </span>
                                      </div>
                                    </td>
                                    <td rowSpan={rowCount} className="py-2 px-2 align-top text-[11px]">
                                      <div
                                        className="font-bold text-slate-900 max-w-[175px] xl:max-w-[240px] 2xl:max-w-[300px] truncate"
                                        title={order.clienteNome}
                                      >
                                        {order.clienteNome}
                                      </div>
                                      <div className="text-[10px] font-mono text-slate-500 mt-0.5 whitespace-nowrap">
                                        {formatDeliveryTimeRange(
                                          order.dataHoraEntrega,
                                          order.dataHoraEntregaFim,
                                          {
                                            tipoEntrega: order.tipoEntrega,
                                            turnoEntrega:
                                              order.tipoEntrega === 'DELIVERY'
                                                ? order.turnoEntrega
                                                : undefined,
                                          }
                                        )}
                                      </div>
                                      {!hideUnidadeCol && (
                                        <div className="mt-1">
                                          {renderUnitBadge(
                                            order.unidadeOrigemId,
                                            unitName,
                                            'max-w-[145px] xl:max-w-[180px]'
                                          )}
                                        </div>
                                      )}
                                    </td>
                                    <td rowSpan={rowCount} className="py-2 px-2 align-top text-[11px]">
                                      <div className="flex flex-col items-start gap-1">
                                        {renderOrderPaymentMethodBadge(order)}
                                        {renderOrderPaymentStatusBadge(order, payStatus)}
                                      </div>
                                      {payStatus === 'SINAL' && (
                                        <div className="text-[10px] font-mono text-sky-700 mt-0.5 whitespace-nowrap">
                                          Sinal: R$ {formatCurrencyBR(getOrderPaidAmount(order))}
                                        </div>
                                      )}
                                      {order.formaPagamento === 'dinheiro' && order.trocoPara && (
                                        <div className="text-[10px] font-mono text-slate-600 mt-0.5 whitespace-nowrap">
                                          Troco p/ R$ {formatCurrencyBR(order.trocoPara)}
                                        </div>
                                      )}
                                      {order.instrucoesPagamento && (
                                        <div
                                          className="text-[10px] text-slate-500 mt-0.5 max-w-[104px] truncate"
                                          title={order.instrucoesPagamento}
                                        >
                                          {order.instrucoesPagamento}
                                        </div>
                                      )}
                                    </td>
                                    <td
                                      rowSpan={rowCount}
                                      className="py-2 px-2 align-top text-right font-mono font-bold text-[11px] text-slate-900 whitespace-nowrap"
                                    >
                                      <div>
                                        <button
                                          type="button"
                                          disabled={isConciliated}
                                          onClick={e => {
                                            e.stopPropagation();
                                            handleReplicateOrderValueToStatement(order, record);
                                          }}
                                          title={
                                            isConciliated
                                              ? 'Pedido conciliado — desmarque Conciliado para editar o extrato'
                                              : 'Clique para replicar o valor do pedido para o Valor do Extrato'
                                          }
                                          className="hover:text-brand-700 hover:underline cursor-pointer disabled:hover:no-underline disabled:hover:text-slate-900 disabled:cursor-default print:no-underline print:text-slate-900"
                                        >
                                          R$ {formatCurrencyBR(order.valorTotal)}
                                        </button>
                                      </div>
                                      <div
                                        className={`text-[10px] font-semibold mt-0.5 ${
                                          entriesTotal > 0 &&
                                          Math.abs(entriesTotal - order.valorTotal) <= 0.01
                                            ? 'text-emerald-700'
                                            : 'text-slate-600'
                                        }`}
                                      >
                                        Pago: R$ {formatCurrencyBR(entriesTotal)}
                                      </div>
                                      <div
                                        className={`flex items-center justify-end gap-1 text-[10px] font-semibold mt-0.5 ${
                                          saldoDevedor > 0.009 ? 'text-rose-600' : 'text-emerald-700'
                                        }`}
                                      >
                                        {saldoDevedor <= 0.009 && (
                                          <CheckCircle2
                                            className="w-3 h-3 text-emerald-600 shrink-0"
                                            aria-hidden="true"
                                          />
                                        )}
                                        <span>Saldo: R$ {formatCurrencyBR(saldoDevedor)}</span>
                                      </div>
                                    </td>
                                  </>
                                )}

                                <td
                                  className={`py-2 px-2 align-middle text-[11px] ${
                                    entryIdx > 0 ? 'border-t border-dashed border-slate-200/80' : ''
                                  }`}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <div className="flex flex-col gap-1 print:hidden">
                                    <div className="flex items-center gap-1">
                                      <CurrencyInput
                                        fixedDecimals
                                        disabled={isConciliated}
                                        value={entry.valor}
                                        ariaLabel={`Valor do extrato ${entryIdx + 1} do pedido ${order.numeroPedido}`}
                                        placeholder="0,00"
                                        onChangeValue={val =>
                                          handleInlineAmountChange(order, record, entryIdx, val)
                                        }
                                        onBlur={() => handleInlineAmountBlur(order, record)}
                                        className="w-[86px] bg-white border border-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded-md px-1.5 py-0.5 text-right font-mono font-bold text-[11px] text-slate-900 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                                      />
                                      <input
                                        ref={el => {
                                          const refKey = `${order.id}::${entryIdx}`;
                                          if (el) {
                                            inlineStatementDateRefs.current[refKey] = el;
                                          } else {
                                            delete inlineStatementDateRefs.current[refKey];
                                          }
                                        }}
                                        type="date"
                                        disabled={isConciliated || (Number(entry.valor) || 0) <= 0}
                                        max={todayLocalDate}
                                        aria-label={`Data do extrato ${entryIdx + 1} do pedido ${order.numeroPedido}`}
                                        value={entryDateVal}
                                        onChange={e =>
                                          handleInlineDateChange(
                                            order,
                                            record,
                                            entryIdx,
                                            e.target.value
                                          )
                                        }
                                        title={
                                          isConciliated
                                            ? 'Pedido conciliado — desmarque Conciliado para editar a data'
                                            : (Number(entry.valor) || 0) <= 0
                                            ? 'Informe o Valor do Extrato (> 0) para habilitar a Data do Extrato'
                                            : missingDateWarning ||
                                              (isCash
                                                ? 'Data do recebimento / extrato'
                                                : 'Data confirmada no extrato bancário')
                                        }
                                        className={`w-[108px] rounded-md px-1 py-0.5 font-mono text-[10px] border outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed ${
                                          missingDateWarning
                                            ? 'bg-amber-50/70 border-amber-400 text-slate-900 focus:border-amber-600 focus:ring-1 focus:ring-amber-500'
                                            : 'bg-white border-slate-300 text-slate-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500'
                                        }`}
                                      />
                                      {entryIdx === entries.length - 1 && (
                                        <button
                                          type="button"
                                          disabled={isConciliated}
                                          onClick={() => handleInlineAddEntry(order, record)}
                                          title={
                                            isConciliated
                                              ? 'Pedido conciliado — desmarque Conciliado para adicionar lançamentos'
                                              : 'Adicionar outro pagamento do extrato neste pedido'
                                          }
                                          aria-label={`Adicionar pagamento no pedido ${order.numeroPedido}`}
                                          className="inline-flex items-center justify-center p-1 rounded-md border border-dashed border-slate-300 hover:border-brand-500 hover:bg-brand-50 text-slate-600 hover:text-brand-700 transition-colors shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-300 disabled:hover:bg-transparent disabled:hover:text-slate-600"
                                        >
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <select
                                        disabled={isConciliated}
                                        aria-label={`Meio de pagamento ${entryIdx + 1} do pedido ${order.numeroPedido}`}
                                        title={
                                          isConciliated
                                            ? 'Pedido conciliado — desmarque Conciliado para alterar o meio de pagamento'
                                            : undefined
                                        }
                                        value={channelSelectVal}
                                        onChange={e =>
                                          handleInlineChannelChange(
                                            order,
                                            record,
                                            entryIdx,
                                            e.target.value
                                          )
                                        }
                                        className={`w-[198px] bg-white border border-slate-300 focus:border-brand-500 rounded-md px-1 py-0.5 text-[10px] font-semibold outline-none cursor-pointer disabled:bg-slate-100 disabled:opacity-75 disabled:border-slate-200 disabled:cursor-not-allowed ${getStatementChannelTextColorClass(
                                          resolvedCh,
                                          entry.meioPagamentoNome
                                        )}`}
                                      >
                                        <option value="" className="text-slate-500">
                                          Meio...
                                        </option>
                                        {activeChannels.map(ch => (
                                          <option
                                            key={ch.id}
                                            value={ch.id}
                                            className={getStatementChannelTextColorClass(
                                              ch,
                                              ch.nome
                                            )}
                                          >
                                            {ch.nome}
                                          </option>
                                        ))}
                                        {entry.meioPagamentoNome &&
                                          !activeChannels.some(
                                            c =>
                                              c.id === entry.meioPagamentoId ||
                                              c.nome.toLowerCase() ===
                                                entry.meioPagamentoNome.toLowerCase()
                                          ) && (
                                            <option
                                              value={entry.meioPagamentoNome}
                                              className={getStatementChannelTextColorClass(
                                                undefined,
                                                entry.meioPagamentoNome
                                              )}
                                            >
                                              {entry.meioPagamentoNome}
                                            </option>
                                          )}
                                      </select>
                                      {entries.length > 1 && (
                                        <button
                                          type="button"
                                          disabled={isConciliated}
                                          onClick={() =>
                                            handleInlineRemoveEntry(order, record, entryIdx)
                                          }
                                          title={
                                            isConciliated
                                              ? 'Pedido conciliado — desmarque Conciliado para remover lançamentos'
                                              : 'Remover este lançamento'
                                          }
                                          aria-label={`Remover lançamento ${entryIdx + 1} do pedido ${order.numeroPedido}`}
                                          className="p-0.5 rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-rose-500"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <span className="hidden print:inline font-mono text-xs">
                                    R$ {formatCurrencyBR(entry.valor || 0)}{' '}
                                    {entry.meioPagamentoNome ? (
                                      <span
                                        className={`font-semibold ${getStatementChannelTextColorClass(
                                          resolvedCh,
                                          entry.meioPagamentoNome
                                        )}`}
                                      >
                                        ({entry.meioPagamentoNome})
                                      </span>
                                    ) : (
                                      ''
                                    )}
                                    {entryDateVal ? ` • ${formatDateBR(entryDateVal)}` : ''}
                                  </span>
                                </td>

                                {entryIdx === 0 && (
                                  <>
                                    <td
                                      rowSpan={rowCount}
                                      className="py-2 px-1.5 align-middle text-center text-[11px] whitespace-nowrap"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      {renderConciliationToggle(
                                        order,
                                        record,
                                        isConciliated,
                                        isSaving,
                                        saldoDevedor <= 0.009 && draftTotals.canMarkConciliated,
                                        nfStatus === 'EMITIDA'
                                      )}
                                      <span className="hidden print:inline font-semibold text-xs">
                                        {isConciliated ? 'Sim' : 'Não'}
                                      </span>
                                    </td>
                                    <td
                                      rowSpan={rowCount}
                                      className="py-2 px-1.5 align-middle text-center text-[11px] whitespace-nowrap"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      {renderInvoiceToggle(
                                        order,
                                        record,
                                        nfStatus,
                                        isSaving,
                                        isConciliated && saldoDevedor <= 0.009
                                      )}
                                      <span className="hidden print:inline font-semibold text-xs">
                                        {INVOICE_STATUS_LABELS[nfStatus]}
                                      </span>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          });
                        })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Conciliação Bancária & Emissão de NF */}
      {isModalOpen && editingOrder && (
        <div
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[60] p-2 sm:p-4"
        >
          <form
            onSubmit={handleSaveRecord}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94dvh] flex flex-col overflow-hidden border border-slate-200"
          >
            <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Landmark className="w-4 h-4 text-brand-600 shrink-0" />
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    Conciliação & Nota Fiscal — {editingOrder.numeroPedido}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ORDER_STATUS_BADGES[editingOrder.status]}`}
                  >
                    {ORDER_STATUS_LABELS[editingOrder.status]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-800">{editingOrder.clienteNome}</span>
                  <span>•</span>
                  <span className="font-mono font-bold text-slate-900">
                    Total: R$ {formatCurrencyBR(editingOrder.valorTotal)}
                  </span>
                  {onOpenOrderInPedidos && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = editingOrder;
                        setIsModalOpen(false);
                        onOpenOrderInPedidos(target);
                      }}
                      className="inline-flex items-center gap-1 text-brand-700 hover:underline font-semibold cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Ver em Pedidos</span>
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer shrink-0"
                aria-label="Fechar modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 sm:p-5 space-y-4 text-xs overflow-y-auto">
              {/* Bloco 1: Conciliação Bancária */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700 block">
                      1. Conciliação com Extrato Bancário
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Preencha o valor e a data do extrato bancário e confirme a conciliação manualmente.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${RECONCILIATION_STATUS_BADGES[draftReconciliation.conciliacaoStatus]}`}
                    >
                      {RECONCILIATION_STATUS_LABELS[draftReconciliation.conciliacaoStatus]}
                    </span>
                    <div
                      className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5"
                      role="group"
                      aria-label="Confirmar conciliação manual"
                    >
                      <button
                        type="button"
                        disabled={draftNfStatus === 'EMITIDA'}
                        title={
                          draftNfStatus === 'EMITIDA'
                            ? 'Volte a Nota Fiscal para "A emitir" para alterar Conciliado'
                            : undefined
                        }
                        onClick={() => {
                          if (!draftConciliated) return;
                          const confirmed = window.confirm(
                            `Deseja realmente desmarcar a conciliação do pedido #${editingOrder.numeroPedido}?\n\nOs campos de Valor / Data do Extrato serão reabilitados e a Nota Fiscal ficará bloqueada até conciliar novamente.`
                          );
                          if (!confirmed) return;
                          setDraftConciliated(false);
                        }}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          !draftConciliated
                            ? 'bg-amber-600 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Não
                      </button>
                      <button
                        type="button"
                        disabled={draftNfStatus === 'EMITIDA'}
                        title={
                          draftNfStatus === 'EMITIDA'
                            ? 'Volte a Nota Fiscal para "A emitir" para alterar Conciliado'
                            : undefined
                        }
                        onClick={() => {
                          if (draftConciliated) return;
                          const blockReason = getConciliationBlockReason(
                            editingOrder,
                            draftEntries
                          );
                          if (blockReason) {
                            alert(blockReason);
                            return;
                          }
                          setDraftConciliated(true);
                          setShowInlineNewChannel(false);
                        }}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          draftConciliated
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600 hover:text-emerald-700'
                        }`}
                      >
                        Sim
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {draftEntries.map((entry, idx) => {
                    const missingDateWarning = getEntryMissingDateWarning(
                      entry,
                      financialChannels
                    );
                    const modalResolvedCh =
                      (entry.meioPagamentoId
                        ? channelById.get(entry.meioPagamentoId)
                        : undefined) ||
                      (entry.meioPagamentoNome
                        ? channelByName.get(entry.meioPagamentoNome.toLowerCase())
                        : undefined);
                    return (
                    <div
                      key={entry.id}
                      className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
                          Lançamento #{idx + 1}
                        </span>
                        {draftEntries.length > 1 && (
                          <button
                            type="button"
                            disabled={draftConciliated}
                            onClick={() =>
                              applyDraftEntriesWithNfSync(
                                draftEntries.filter((_, i) => i !== idx)
                              )
                            }
                            className="text-rose-500 hover:text-rose-700 inline-flex items-center gap-1 text-[10px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-rose-500"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remover</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <div className="flex items-center justify-between mb-0.5">
                            <label className="font-semibold text-slate-700">
                              Meio de Pagamento
                            </label>
                            <button
                              type="button"
                              disabled={draftConciliated}
                              onClick={() => {
                                setInlineChannelTargetIdx(idx);
                                setShowInlineNewChannel(prev => !prev);
                              }}
                              className="text-[10px] font-bold text-brand-700 hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline"
                            >
                              + Novo meio
                            </button>
                          </div>
                          <select
                            disabled={draftConciliated}
                            value={entry.meioPagamentoId || entry.meioPagamentoNome || ''}
                            onChange={e => handleSelectChannelForEntry(idx, e.target.value)}
                            className={`w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs font-semibold disabled:bg-slate-100 disabled:opacity-75 disabled:border-slate-200 disabled:cursor-not-allowed ${getStatementChannelTextColorClass(
                              modalResolvedCh,
                              entry.meioPagamentoNome
                            )}`}
                          >
                            <option value="" className="text-slate-500">
                              Selecione...
                            </option>
                            {activeChannels.map(ch => (
                              <option
                                key={ch.id}
                                value={ch.id}
                                className={getStatementChannelTextColorClass(ch, ch.nome)}
                              >
                                {ch.nome}
                              </option>
                            ))}
                            {entry.meioPagamentoNome &&
                              !activeChannels.some(
                                c =>
                                  c.id === entry.meioPagamentoId ||
                                  c.nome.toLowerCase() === entry.meioPagamentoNome.toLowerCase()
                              ) && (
                                <option
                                  value={entry.meioPagamentoNome}
                                  className={getStatementChannelTextColorClass(
                                    undefined,
                                    entry.meioPagamentoNome
                                  )}
                                >
                                  {entry.meioPagamentoNome} (Inativo/Histórico)
                                </option>
                              )}
                          </select>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-0.5">
                            <label className="font-semibold text-slate-700">
                              Valor Recebido (R$)
                            </label>
                            <button
                              type="button"
                              disabled={draftConciliated}
                              onClick={() => {
                                const othersSum = draftEntries.reduce(
                                  (sum, other, oIdx) =>
                                    oIdx === idx ? sum : sum + (Number(other.valor) || 0),
                                  0
                                );
                                const target = Math.max(
                                  0,
                                  Number((editingOrder.valorTotal - othersSum).toFixed(2))
                                );
                                handleUpdateEntry(idx, { valor: target });
                                if (target > 0) {
                                  const tryFocusModalDate = (retriesLeft: number) => {
                                    window.requestAnimationFrame(() => {
                                      const el = modalStatementDateRefs.current[idx];
                                      if (!el) return;
                                      if (el.disabled && retriesLeft > 0) {
                                        tryFocusModalDate(retriesLeft - 1);
                                        return;
                                      }
                                      if (!el.disabled) {
                                        el.focus();
                                      }
                                    });
                                  };
                                  tryFocusModalDate(2);
                                }
                              }}
                              className="text-[10px] font-bold text-brand-700 hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:no-underline"
                            >
                              Preencher restante
                            </button>
                          </div>
                          <CurrencyInput
                            fixedDecimals
                            disabled={draftConciliated}
                            value={entry.valor}
                            onChangeValue={val => handleUpdateEntry(idx, { valor: val })}
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {showInlineNewChannel && inlineChannelTargetIdx === idx && (
                        <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-2 flex flex-wrap items-end gap-2">
                          <div className="flex-1 min-w-[130px]">
                            <label className="text-[10px] font-bold text-blue-900 block mb-0.5">
                              Nome do Novo Meio
                            </label>
                            <input
                              type="text"
                              value={inlineChannelName}
                              onChange={e => setInlineChannelName(e.target.value)}
                              placeholder="Ex: Link C6, MercadoPago..."
                              className="w-full bg-white border border-blue-300 rounded-md px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-blue-900 block mb-0.5">
                              Categoria
                            </label>
                            <select
                              value={inlineChannelCat}
                              onChange={e =>
                                setInlineChannelCat(e.target.value as FinancialPaymentCategory)
                              }
                              className="bg-white border border-blue-300 rounded-md px-2 py-1 text-xs"
                            >
                              {Object.entries(FINANCIAL_CATEGORY_LABELS).map(([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="button"
                            disabled={savingChannel || !inlineChannelName.trim()}
                            onClick={handleCreateInlineChannel}
                            className="px-2.5 py-1 rounded-md bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Criar e Usar
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-0.5">
                            Data do Pagamento
                          </label>
                          <input
                            type="date"
                            disabled={draftConciliated}
                            value={entry.dataPagamento || ''}
                            onChange={e =>
                              handleUpdateEntry(idx, { dataPagamento: e.target.value })
                            }
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-mono text-xs disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-0.5">
                            Data no Extrato
                          </label>
                          <input
                            ref={el => {
                              if (el) {
                                modalStatementDateRefs.current[idx] = el;
                              } else {
                                delete modalStatementDateRefs.current[idx];
                              }
                            }}
                            type="date"
                            disabled={draftConciliated || (Number(entry.valor) || 0) <= 0}
                            max={todayLocalDate}
                            value={entry.dataExtrato || ''}
                            onChange={e =>
                              handleUpdateEntry(idx, { dataExtrato: e.target.value })
                            }
                            title={
                              draftConciliated
                                ? 'Pedido conciliado — desmarque Conciliado para editar a data'
                                : (Number(entry.valor) || 0) <= 0
                                ? 'Informe o Valor Recebido (> 0) para habilitar a Data no Extrato'
                                : undefined
                            }
                            className="w-full bg-white border border-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none rounded-lg p-1.5 font-mono text-xs disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <label className="font-semibold text-slate-700 block mb-0.5">
                            Ref. Extrato (opcional)
                          </label>
                          <input
                            type="text"
                            disabled={draftConciliated}
                            value={entry.referenciaExtrato || ''}
                            onChange={e =>
                              handleUpdateEntry(idx, { referenciaExtrato: e.target.value })
                            }
                            placeholder="NSU, ID PIX, lote..."
                            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-xs disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {missingDateWarning && (
                        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5 text-[10px] font-medium">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{missingDateWarning}</span>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    disabled={draftConciliated}
                    onClick={handleAddEntry}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar parcela / lançamento</span>
                  </button>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
                    <span className="text-slate-600">
                      Conciliado:{' '}
                      <strong className="text-slate-900">
                        R$ {formatCurrencyBR(draftReconciliation.valorConciliado)}
                      </strong>
                    </span>
                    <span className="text-slate-600">
                      Diferença:{' '}
                      <strong
                        className={
                          editingOrder.valorTotal - draftReconciliation.valorConciliado > 0.01 &&
                          !hasBonificadoInDraft
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }
                      >
                        R${' '}
                        {formatCurrencyBR(
                          Math.max(0, editingOrder.valorTotal - draftReconciliation.valorConciliado)
                        )}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Bloco 2: Controle de Nota Fiscal (NF) */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                    2. Controle de Emissão de Nota Fiscal (NF)
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${INVOICE_STATUS_BADGES[draftNfStatus]}`}
                  >
                    {INVOICE_STATUS_LABELS[draftNfStatus]}
                  </span>
                </div>

                {isOrderOperationallyReadyForInvoice(editingOrder) ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-2.5 py-1.5 text-[11px] font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    <span>
                      Pedido em status <strong>{ORDER_STATUS_LABELS[editingOrder.status]}</strong> —
                      pronto para entrega e emissão da NF.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5 text-[11px] font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                    <span>
                      Pedido em status <strong>{ORDER_STATUS_LABELS[editingOrder.status]}</strong> —
                      normalmente a NF é emitida após ficar pronto para entrega.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-1.5">
                  {(() => {
                    const modalEntriesTotal = Number(
                      draftEntries
                        .reduce((sum, ent) => sum + Math.max(0, Number(ent.valor) || 0), 0)
                        .toFixed(2)
                    );
                    const modalSaldoDevedor = hasBonificadoInDraft
                      ? 0
                      : Math.max(
                          0,
                          Number((editingOrder.valorTotal - modalEntriesTotal).toFixed(2))
                        );
                    const canSwitchModalNf =
                      draftConciliated && modalSaldoDevedor <= 0.009;
                    const modalNfBlockedMsg = !draftConciliated
                      ? 'Só é possível alterar a situação da Nota Fiscal quando o pedido estiver Conciliado.'
                      : 'Só é possível alterar a situação da Nota Fiscal quando o saldo devedor for igual a zero (R$ 0,00).';

                    return (['PENDENTE', 'EMITIDA', 'DISPENSADA'] as InvoiceStatus[]).map(st => {
                      const active = draftNfStatus === st;
                      const isBlockedChange =
                        !active &&
                        !canSwitchModalNf &&
                        (st === 'EMITIDA' || (st === 'DISPENSADA' && !draftConciliated));

                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={isBlockedChange}
                          title={isBlockedChange ? modalNfBlockedMsg : undefined}
                          onClick={() => {
                            if (isBlockedChange) {
                              alert(modalNfBlockedMsg);
                              return;
                            }
                            if (st === 'PENDENTE' && draftNfStatus !== 'PENDENTE') {
                              const confirmed = window.confirm(
                                `Deseja realmente alterar a Nota Fiscal do pedido #${editingOrder.numeroPedido} de volta para "A emitir"?`
                              );
                              if (!confirmed) return;
                            }
                            setDraftNfStatus(st);
                            if (st === 'EMITIDA' && !draftNfDataEmissao) {
                              setDraftNfDataEmissao(toLocalDateInput());
                            }
                          }}
                          className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                            active
                              ? st === 'EMITIDA'
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs cursor-pointer'
                                : st === 'DISPENSADA'
                                ? 'bg-slate-700 text-white border-slate-700 shadow-xs cursor-pointer'
                                : 'bg-rose-600 text-white border-rose-600 shadow-xs cursor-pointer'
                              : isBlockedChange
                              ? 'bg-slate-100 border-slate-200 text-slate-400 opacity-55 cursor-not-allowed'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer'
                          }`}
                        >
                          {st === 'PENDENTE'
                            ? 'A emitir'
                            : st === 'EMITIDA'
                            ? 'Emitida'
                            : 'Dispensada'}
                        </button>
                      );
                    });
                  })()}
                </div>

                {draftNfStatus === 'EMITIDA' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-0.5">
                        Data de Emissão da NF *
                      </label>
                      <input
                        type="date"
                        required
                        value={draftNfDataEmissao}
                        onChange={e => setDraftNfDataEmissao(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-0.5">
                        Observações Fiscais (opcional)
                      </label>
                      <input
                        type="text"
                        value={draftNfObs}
                        onChange={e => setDraftNfObs(e.target.value)}
                        placeholder="Ex: NF nº 1234, CPF na nota..."
                        className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs"
                      />
                    </div>
                  </div>
                )}

                {draftNfStatus !== 'EMITIDA' && (
                  <div>
                    <label className="font-semibold text-slate-700 block mb-0.5">
                      Observações Fiscais / Financeiras (opcional)
                    </label>
                    <input
                      type="text"
                      value={draftNfObs}
                      onChange={e => setDraftNfObs(e.target.value)}
                      placeholder={
                        draftNfStatus === 'DISPENSADA'
                          ? 'Ex: Pedido bonificado / cortesia'
                          : 'Observação sobre a NF...'
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs"
                    />
                  </div>
                )}

                <div>
                  <label className="font-semibold text-slate-700 block mb-0.5">
                    Observações Internas da Conciliação
                  </label>
                  <textarea
                    rows={2}
                    value={draftObs}
                    onChange={e => setDraftObs(e.target.value)}
                    placeholder="Detalhes da conferência no extrato, taxa de maquininha, etc..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingRecord}
                className="flex items-center gap-1.5 px-4 sm:px-5 py-1.5 sm:py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingRecord ? 'Salvando...' : 'Salvar Conciliação & NF'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Gestão de Meios de Pagamento */}
      {isChannelsModalOpen && (
        <div
          onClick={() => setIsChannelsModalOpen(false)}
          className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[60] p-2 sm:p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200"
          >
            <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Meios de Pagamento (Financeiro)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsChannelsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label="Fechar meios de pagamento"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 sm:p-5 space-y-4 text-xs overflow-y-auto">
              <form
                onSubmit={handleSaveChannelForm}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5"
              >
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-600 block">
                  {editingChannel.id ? 'Editar Meio de Pagamento' : 'Nova Forma de Pagamento'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-0.5">Nome *</label>
                    <input
                      type="text"
                      required
                      value={editingChannel.nome || ''}
                      onChange={e =>
                        setEditingChannel({ ...editingChannel, nome: e.target.value })
                      }
                      placeholder="Ex: PixC6, Sumup, Link Pagamento..."
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-0.5">Categoria</label>
                    <select
                      value={editingChannel.categoria || 'OUTROS'}
                      onChange={e => {
                        const cat = e.target.value as FinancialPaymentCategory;
                        setEditingChannel({
                          ...editingChannel,
                          categoria: cat,
                          exigeNfPadrao: cat === 'BONIFICADO' ? false : editingChannel.exigeNfPadrao,
                        });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 text-xs"
                    >
                      {Object.entries(FINANCIAL_CATEGORY_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <label className="inline-flex items-center gap-2 text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingChannel.exigeNfPadrao !== false}
                      onChange={e =>
                        setEditingChannel({
                          ...editingChannel,
                          exigeNfPadrao: e.target.checked,
                        })
                      }
                      className="rounded border-slate-300 text-brand-600"
                    />
                    <span>Exige emissão de NF por padrão</span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    {editingChannel.id && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingChannel({
                            nome: '',
                            categoria: 'OUTROS',
                            exigeNfPadrao: true,
                            ativo: true,
                            ordem: financialChannels.length + 1,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold cursor-pointer"
                      >
                        Cancelar edição
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingChannel}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-bold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        {savingChannel
                          ? 'Salvando...'
                          : editingChannel.id
                          ? 'Atualizar'
                          : 'Adicionar'}
                      </span>
                    </button>
                  </div>
                </div>
              </form>

              <div className="space-y-1.5">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                  Meios Cadastrados ({financialChannels.length})
                </span>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {[...financialChannels]
                    .sort(
                      (a, b) =>
                        (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR')
                    )
                    .map(ch => (
                      <div
                        key={ch.id}
                        onClick={() => setEditingChannel({ ...ch })}
                        className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          editingChannel.id === ch.id
                            ? 'bg-brand-50/70'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-bold text-xs ${
                                ch.ativo ? 'text-slate-900' : 'text-slate-400 line-through'
                              }`}
                            >
                              {ch.nome}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-mono">
                              {FINANCIAL_CATEGORY_LABELS[ch.categoria]}
                            </span>
                            {!ch.exigeNfPadrao && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-semibold">
                                NF Dispensada
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-1.5 shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onSaveFinancialChannel({ ...ch, ativo: !ch.ativo })
                            }
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer ${
                              ch.ativo
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            {ch.ativo ? 'Ativo' : 'Inativo'}
                          </button>
                          {canDeleteChannels && onDeleteFinancialChannel && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Deseja excluir o meio de pagamento "${ch.nome}"? Registros existentes manterão o nome no histórico.`
                                  )
                                ) {
                                  onDeleteFinancialChannel(ch.id);
                                }
                              }}
                              title="Excluir meio de pagamento"
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="px-3.5 py-2.5 sm:px-6 sm:py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsChannelsModalOpen(false)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Relatório de Faturamento (PDF / XLSX) */}
      {isBillingReportModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[70] flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:hidden"
          onClick={() => setIsBillingReportModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3.5 py-3 sm:px-6 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50 shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>Relatório de Faturamento</span>
                </h2>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  Agrupado por Unidade e Conciliação • Classificado por Data do Extrato • PDF ou Excel (.xlsx)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBillingReportModalOpen(false)}
                aria-label="Fechar modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 sm:p-5 overflow-y-auto space-y-3 sm:space-y-4 text-xs flex-1">
              {/* Unidade/Situação + Período do Extrato */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      Unidade e Situação
                    </label>
                    {(billingReportUnitId !== 'all' || billingReportStatus !== 'TODOS') && (
                      <button
                        type="button"
                        onClick={() => {
                          setBillingReportUnitId('all');
                          setBillingReportStatus('TODOS');
                        }}
                        className="text-[10px] font-bold text-brand-700 hover:underline cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <span className="block text-[9px] font-semibold text-slate-500 mb-0.5">
                        Unidade
                      </span>
                      <div className="relative">
                        <select
                          aria-label="Filtrar relatório por unidade"
                          value={billingReportUnitId}
                          onChange={e => setBillingReportUnitId(e.target.value)}
                          className="w-full h-8 appearance-none bg-white border border-slate-300 rounded-lg pl-2 pr-6 text-[11px] font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                        >
                          <option value="all">Todas as Unidades</option>
                          {sortedBillingUnits.map(unit => (
                            <option key={unit.id} value={unit.id}>
                              {unit.nome}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="block text-[9px] font-semibold text-slate-500 mb-0.5">
                        Situação
                      </span>
                      <div className="relative">
                        <select
                          aria-label="Filtrar relatório por situação"
                          value={billingReportStatus}
                          onChange={e =>
                            setBillingReportStatus(e.target.value as BillingReportStatusFilter)
                          }
                          className="w-full h-8 appearance-none bg-white border border-slate-300 rounded-lg pl-2 pr-6 text-[11px] font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                        >
                          {Object.entries(BILLING_REPORT_STATUS_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      Data do Extrato (opcional)
                    </label>
                    {(billingReportStartDate || billingReportEndDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setBillingReportStartDate('');
                          setBillingReportEndDate('');
                        }}
                        className="text-[10px] font-bold text-brand-700 hover:underline cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <span className="block text-[9px] font-semibold text-slate-500 mb-0.5">
                        De
                      </span>
                      <input
                        type="date"
                        max={todayLocalDate}
                        value={billingReportStartDate}
                        onChange={e => setBillingReportStartDate(e.target.value)}
                        aria-label="Data inicial do extrato"
                        className="w-full h-8 bg-white border border-slate-300 rounded-lg px-2 font-mono text-[11px] text-slate-800"
                      />
                    </div>
                    <div>
                      <span className="block text-[9px] font-semibold text-slate-500 mb-0.5">
                        Até
                      </span>
                      <input
                        type="date"
                        max={todayLocalDate}
                        value={billingReportEndDate}
                        onChange={e => setBillingReportEndDate(e.target.value)}
                        aria-label="Data final do extrato"
                        className="w-full h-8 bg-white border border-slate-300 rounded-lg px-2 font-mono text-[11px] text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* KPIs de prévia */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">
                    Pedidos
                  </span>
                  <span className="text-sm font-mono font-bold text-slate-900">
                    {billingReportData.totalOrders}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {billingReportData.groups.length} unidade(s)
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">
                    Valor
                  </span>
                  <span className="text-sm font-mono font-bold text-slate-900">
                    R$ {formatCurrencyBR(billingReportData.grandTotalValor)}
                  </span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                  <span className="text-[10px] font-mono uppercase text-emerald-800 block">
                    Valor Recebido
                  </span>
                  <span className="text-sm font-mono font-bold text-emerald-700">
                    R$ {formatCurrencyBR(billingReportData.grandTotalRecebido)}
                  </span>
                </div>
                <div
                  className={`border rounded-xl p-2.5 ${
                    billingReportData.grandTotalSaldo > 0.009
                      ? 'bg-rose-50 border-rose-200'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}
                >
                  <span
                    className={`text-[10px] font-mono uppercase block ${
                      billingReportData.grandTotalSaldo > 0.009
                        ? 'text-rose-800'
                        : 'text-emerald-800'
                    }`}
                  >
                    Saldo a Receber
                  </span>
                  <span
                    className={`text-sm font-mono font-bold ${
                      billingReportData.grandTotalSaldo > 0.009
                        ? 'text-rose-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    R$ {formatCurrencyBR(billingReportData.grandTotalSaldo)}
                  </span>
                </div>
              </div>

              {/* Prévia agrupada por Unidade */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600">
                    Prévia por Unidade
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Ordem: Data do Extrato ↑
                  </span>
                </div>
                {billingReportData.groups.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    Nenhum pedido encontrado com os filtros selecionados.
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto overflow-x-auto max-w-full">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="sticky top-0 bg-emerald-50 border-b border-emerald-200 text-[10px] font-mono uppercase text-emerald-900">
                        <tr>
                          <th className="py-1.5 px-2.5 font-bold">Unidade</th>
                          <th className="py-1.5 px-2 text-center font-bold">Ped.</th>
                          <th className="py-1.5 px-2 text-right font-bold">Valor</th>
                          <th className="py-1.5 px-2 text-right font-bold">Recebido</th>
                          <th className="py-1.5 px-2.5 text-right font-bold">Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {billingReportData.groups.map(group => (
                          <React.Fragment key={`${group.unidadeId}-${group.unidadeNome}`}>
                            <tr className="bg-emerald-50/40">
                              <td className="py-1.5 px-2.5 font-bold text-slate-900">
                                {group.unidadeNome}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-700">
                                {group.rows.length}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                R$ {formatCurrencyBR(group.totalValor)}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                                R$ {formatCurrencyBR(group.totalRecebido)}
                              </td>
                              <td
                                className={`py-1.5 px-2.5 text-right font-mono font-bold whitespace-nowrap ${
                                  group.totalSaldo > 0.009
                                    ? 'text-rose-600'
                                    : 'text-emerald-700'
                                }`}
                              >
                                R$ {formatCurrencyBR(group.totalSaldo)}
                              </td>
                            </tr>
                            {group.subgroups.map(sg => (
                              <tr
                                key={`${group.unidadeId}-${group.unidadeNome}-${sg.key}`}
                                className="bg-white"
                              >
                                <td className="py-1 pl-5 pr-2 text-[10px] font-semibold">
                                  <span
                                    className={
                                      sg.key === 'CONCILIADO'
                                        ? 'text-emerald-700'
                                        : 'text-amber-700'
                                    }
                                  >
                                    ↳ {sg.label}
                                  </span>
                                </td>
                                <td className="py-1 px-2 text-center font-mono text-[10px] text-slate-600">
                                  {sg.rows.length}
                                </td>
                                <td className="py-1 px-2 text-right font-mono text-[10px] text-slate-700 whitespace-nowrap">
                                  R$ {formatCurrencyBR(sg.totalValor)}
                                </td>
                                <td className="py-1 px-2 text-right font-mono text-[10px] text-emerald-700 whitespace-nowrap">
                                  R$ {formatCurrencyBR(sg.totalRecebido)}
                                </td>
                                <td
                                  className={`py-1 px-2.5 text-right font-mono text-[10px] font-semibold whitespace-nowrap ${
                                    sg.totalSaldo > 0.009
                                      ? 'text-rose-600'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  R$ {formatCurrencyBR(sg.totalSaldo)}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsBillingReportModalOpen(false)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={exportingBillingFormat !== null}
                onClick={() => void handleExportBillingPdf()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{exportingBillingFormat === 'PDF' ? 'Gerando PDF...' : 'Baixar PDF'}</span>
              </button>
              <button
                type="button"
                disabled={exportingBillingFormat !== null}
                onClick={() => void handleExportBillingExcel()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>
                  {exportingBillingFormat === 'XLSX'
                    ? 'Gerando Excel...'
                    : 'Baixar Excel (.xlsx)'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
