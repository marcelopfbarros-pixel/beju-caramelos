import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { formatCurrencyBR } from './CurrencyInput';
import {
  ReportFiltersCard,
  ReportFormat,
  ReportKpiItem,
  ReportModalShell,
  ReportOrganizationCard,
  ReportOrientation,
  ReportOutputStrip,
  ReportPdfPreviewFrame,
  ReportSelectOption,
  ReportSortDirection,
} from './ReportModalShell';
import { TabularReportPreviewTable } from './TabularReportPreviewTable';
import {
  FinancialPaymentChannel,
  InvoiceStatus,
  Order,
  OrderFinancialRecord,
  OrderStatus,
  ReconciliationStatus,
  StoreUnit,
} from '../types';
import { formatDeliveryTimeRange } from '../utils/deliveryTimeRange';
import {
  FINANCIAL_PENDING_GROUP_ORDER,
  INVOICE_STATUS_LABELS,
  RECONCILIATION_STATUS_LABELS,
  formatDateBR,
  getEffectiveInvoiceStatus,
  getEffectiveReconciliationStatus,
  getFinancialPendingGroupLabel,
  isOrderReadyForInvoice,
  toLocalDateInput,
} from '../utils/financialReconciliation';
import {
  TabularReportColumnDef,
  TabularReportData,
  TabularReportGroup,
  TabularReportRow,
} from '../utils/tabularReportTypes';

export type FinanceiroReportColumnKey =
  | 'numeroPedido'
  | 'clienteNome'
  | 'unidadeNome'
  | 'dataPedido'
  | 'valorTotal'
  | 'valorConciliado'
  | 'saldoPendente'
  | 'conciliacao'
  | 'nfStatus'
  | 'dataEntrega'
  | 'statusPedido'
  | 'meioPagamento'
  | 'dataPagamento'
  | 'dataExtrato'
  | 'nfDataEmissao'
  | 'observacoes';

export type FinanceiroReportGroupBy =
  | 'pendencia'
  | 'lojaOrigem'
  | 'meioPagamento'
  | 'situacaoNf'
  | 'dataExtrato'
  | 'dataPedido'
  | 'nenhum';

export type FinanceiroReportSortBy =
  | 'dataPedido'
  | 'dataExtrato'
  | 'cliente'
  | 'valorPedido'
  | 'saldoPendente'
  | 'numeroPedido';

interface FinanceiroReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allRows: Array<{ order: Order; record?: OrderFinancialRecord }>;
  filteredRows: Array<{ order: Order; record?: OrderFinancialRecord }>;
  units: StoreUnit[];
  channels: FinancialPaymentChannel[];
  activeUnitId: string;
  initialGroupBy:
    | 'PENDENCIA'
    | 'LOJA_ORIGEM'
    | 'MEIO_PAGAMENTO'
    | 'SITUACAO_NF'
    | 'DATA_EXTRATO'
    | 'DATA_PEDIDO'
    | 'NENHUM';
  searchTerm: string;
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  EM_PRODUCAO: 'Em Produção',
  PRONTO: 'Pronto',
  EM_ROTA: 'Em Rota',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

const FINANCEIRO_REPORT_COLUMNS: Array<TabularReportColumnDef<FinanceiroReportColumnKey>> = [
  {
    key: 'numeroPedido',
    label: 'Nº Pedido',
    shortLabel: 'Pedido',
    isDefault: true,
    kind: 'text',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 26,
    excelWch: 15,
    excelMinWch: 12,
    excelMaxWch: 20,
  },
  {
    key: 'clienteNome',
    label: 'Cliente',
    shortLabel: 'Cliente',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 22,
    pdfMinWidthMm: 26,
    pdfMaxWidthMm: 56,
    excelWch: 26,
    excelMinWch: 16,
    excelMaxWch: 38,
    isFlexible: true,
  },
  {
    key: 'unidadeNome',
    label: 'Loja / Unidade',
    shortLabel: 'Unidade',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 15,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 34,
    excelWch: 20,
    excelMinWch: 14,
    excelMaxWch: 28,
  },
  {
    key: 'dataPedido',
    label: 'Data do Pedido',
    shortLabel: 'Data Ped.',
    isDefault: true,
    kind: 'text',
    align: 'center',
    pdfWeight: 11,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 22,
    excelWch: 13,
    excelMinWch: 11,
    excelMaxWch: 16,
  },
  {
    key: 'valorTotal',
    label: 'Valor Pedido (R$)',
    shortLabel: 'Vlr. Pedido',
    isDefault: true,
    kind: 'currency',
    align: 'right',
    pdfWeight: 13,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 26,
    excelWch: 15,
    excelMinWch: 13,
    excelMaxWch: 20,
    summable: true,
  },
  {
    key: 'valorConciliado',
    label: 'Valor Extrato (R$)',
    shortLabel: 'Vlr. Extrato',
    isDefault: true,
    kind: 'currency',
    align: 'right',
    pdfWeight: 13,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 26,
    excelWch: 15,
    excelMinWch: 13,
    excelMaxWch: 20,
    summable: true,
  },
  {
    key: 'saldoPendente',
    label: 'Saldo Pendente (R$)',
    shortLabel: 'Saldo Pend.',
    isDefault: true,
    kind: 'currency',
    align: 'right',
    pdfWeight: 13,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 26,
    excelWch: 15,
    excelMinWch: 13,
    excelMaxWch: 20,
    summable: true,
  },
  {
    key: 'conciliacao',
    label: 'Conciliação',
    shortLabel: 'Conciliação',
    isDefault: true,
    kind: 'badge',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 26,
    excelWch: 14,
    excelMinWch: 12,
    excelMaxWch: 18,
  },
  {
    key: 'nfStatus',
    label: 'Nota Fiscal',
    shortLabel: 'Nota Fiscal',
    isDefault: true,
    kind: 'badge',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 26,
    excelWch: 15,
    excelMinWch: 12,
    excelMaxWch: 20,
  },
  {
    key: 'dataEntrega',
    label: 'Data Combinada',
    shortLabel: 'Data Comb.',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 16,
    pdfMinWidthMm: 20,
    pdfMaxWidthMm: 34,
    excelWch: 22,
    excelMinWch: 16,
    excelMaxWch: 28,
  },
  {
    key: 'statusPedido',
    label: 'Status do Pedido',
    shortLabel: 'Status Ped.',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 26,
    excelWch: 15,
    excelMinWch: 12,
    excelMaxWch: 20,
  },
  {
    key: 'meioPagamento',
    label: 'Meio de Pagamento',
    shortLabel: 'Meio Pagto',
    isDefault: false,
    kind: 'text',
    align: 'left',
    pdfWeight: 15,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 32,
    excelWch: 18,
    excelMinWch: 14,
    excelMaxWch: 26,
  },
  {
    key: 'dataPagamento',
    label: 'Data do Pagamento',
    shortLabel: 'Dt. Pagto',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 11,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 22,
    excelWch: 14,
    excelMinWch: 11,
    excelMaxWch: 16,
  },
  {
    key: 'dataExtrato',
    label: 'Data do Extrato',
    shortLabel: 'Dt. Extrato',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 11,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 22,
    excelWch: 14,
    excelMinWch: 11,
    excelMaxWch: 16,
  },
  {
    key: 'nfDataEmissao',
    label: 'Data Emissão NF',
    shortLabel: 'Emissão NF',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 11,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 22,
    excelWch: 14,
    excelMinWch: 11,
    excelMaxWch: 16,
  },
  {
    key: 'observacoes',
    label: 'Observações',
    shortLabel: 'Observações',
    isDefault: false,
    kind: 'text',
    align: 'left',
    pdfWeight: 20,
    pdfMinWidthMm: 22,
    pdfMaxWidthMm: 50,
    excelWch: 24,
    excelMinWch: 16,
    excelMaxWch: 40,
    isFlexible: true,
  },
];

const DEFAULT_COLUMNS: FinanceiroReportColumnKey[] = FINANCEIRO_REPORT_COLUMNS.filter(
  c => c.isDefault
).map(c => c.key);

const GROUP_OPTIONS: Array<ReportSelectOption<FinanceiroReportGroupBy>> = [
  { value: 'pendencia', label: 'Pendência Financeira' },
  { value: 'lojaOrigem', label: 'Loja / Unidade' },
  { value: 'meioPagamento', label: 'Meio de Pagamento' },
  { value: 'situacaoNf', label: 'Situação da NF' },
  { value: 'dataExtrato', label: 'Data do Extrato' },
  { value: 'dataPedido', label: 'Data do Pedido' },
  { value: 'nenhum', label: 'Sem Agrupamento' },
];

const SORT_OPTIONS: Array<ReportSelectOption<FinanceiroReportSortBy>> = [
  { value: 'dataPedido', label: 'Data do Pedido' },
  { value: 'dataExtrato', label: 'Data do Extrato' },
  { value: 'cliente', label: 'Cliente (A-Z)' },
  { value: 'valorPedido', label: 'Valor do Pedido' },
  { value: 'saldoPendente', label: 'Saldo Pendente' },
  { value: 'numeroPedido', label: 'Nº Pedido' },
];

function getDatePresets(): Array<{ label: string; start: string; end: string }> {
  const now = new Date();
  const today = toLocalDateInput(now);
  const last7Start = toLocalDateInput(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  );
  const monthStart = toLocalDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = toLocalDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const prevMonthStart = toLocalDateInput(
    new Date(now.getFullYear(), now.getMonth() - 1, 1)
  );
  const prevMonthEnd = toLocalDateInput(new Date(now.getFullYear(), now.getMonth(), 0));

  return [
    { label: 'Todo o período', start: '', end: '' },
    { label: 'Hoje', start: today, end: today },
    { label: 'Últimos 7 dias', start: last7Start, end: today },
    { label: 'Este mês', start: monthStart, end: monthEnd },
    { label: 'Mês anterior', start: prevMonthStart, end: prevMonthEnd },
  ];
}

function mapScreenGroup(
  g: FinanceiroReportModalProps['initialGroupBy']
): FinanceiroReportGroupBy {
  switch (g) {
    case 'PENDENCIA':
      return 'pendencia';
    case 'LOJA_ORIGEM':
      return 'lojaOrigem';
    case 'MEIO_PAGAMENTO':
      return 'meioPagamento';
    case 'SITUACAO_NF':
      return 'situacaoNf';
    case 'DATA_EXTRATO':
      return 'dataExtrato';
    case 'DATA_PEDIDO':
      return 'dataPedido';
    default:
      return 'nenhum';
  }
}

export const FinanceiroReportModal: React.FC<FinanceiroReportModalProps> = ({
  isOpen,
  onClose,
  allRows,
  filteredRows,
  units,
  channels,
  activeUnitId,
  initialGroupBy,
  searchTerm,
}) => {
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');
  const [format, setFormat] = useState<ReportFormat>('PDF');
  const [orientation, setOrientation] = useState<ReportOrientation>('landscape');
  const [dateField, setDateField] = useState<'pedido' | 'extrato'>('pedido');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [unitFilter, setUnitFilter] = useState<string>('TODAS');
  const [reconciliationFilter, setReconciliationFilter] = useState<
    'TODAS' | ReconciliationStatus
  >('TODAS');
  const [nfFilter, setNfFilter] = useState<'TODAS' | InvoiceStatus>('TODAS');
  const [channelFilter, setChannelFilter] = useState<string>('TODOS');
  const [groupBy, setGroupBy] = useState<FinanceiroReportGroupBy>('pendencia');
  const [sortBy, setSortBy] = useState<FinanceiroReportSortBy>('dataPedido');
  const [sortDirection, setSortDirection] = useState<ReportSortDirection>('desc');
  const [selectedColumns, setSelectedColumns] =
    useState<FinanceiroReportColumnKey[]>(DEFAULT_COLUMNS);
  const [includeSummaryInPdf, setIncludeSummaryInPdf] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [previewTab, setPreviewTab] = useState<'main' | 'summary'>('main');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const pdfBlobRef = useRef<Blob | null>(null);
  const xlsxBufferRef = useRef<Uint8Array | null>(null);

  const clearPreviewArtifacts = useCallback(() => {
    setPdfPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    pdfBlobRef.current = null;
    xlsxBufferRef.current = null;
  }, []);

  const datePresets = useMemo(() => getDatePresets(), [isOpen]);
  const isInvalidDateRange = Boolean(startDate && endDate && startDate > endDate);
  const hasActiveFilterDiff = filteredRows.length !== allRows.length;

  useEffect(() => {
    if (!isOpen) {
      clearPreviewArtifacts();
      setStep('config');
      return;
    }
    setScope(hasActiveFilterDiff ? 'filtered' : 'all');
    setDateField('pedido');
    setStartDate('');
    setEndDate('');
    setUnitFilter(activeUnitId !== 'all' ? activeUnitId : 'TODAS');
    setReconciliationFilter('TODAS');
    setNfFilter('TODAS');
    setChannelFilter('TODOS');
    setGroupBy(mapScreenGroup(initialGroupBy));
    setStep('config');
  }, [isOpen, hasActiveFilterDiff, activeUnitId, initialGroupBy, clearPreviewArtifacts]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const unitMap = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);

  const availableChannelNames = useMemo(() => {
    const names = new Set<string>();
    channels.forEach(c => {
      if (c.nome) names.add(c.nome);
    });
    allRows.forEach(({ record }) => {
      if (record?.meioPagamentoNome) names.add(record.meioPagamentoNome);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [channels, allRows]);

  const enrichedRows = useMemo(() => {
    const base = scope === 'filtered' && hasActiveFilterDiff ? filteredRows : allRows;

    return base
      .filter(({ order, record }) => {
        if (
          unitFilter !== 'TODAS' &&
          order.unidadeOrigemId !== unitFilter &&
          order.unidadeRetiradaId !== unitFilter
        ) {
          return false;
        }
        const recStatus = getEffectiveReconciliationStatus(order, record);
        const nfStatus = getEffectiveInvoiceStatus(record);
        if (reconciliationFilter !== 'TODAS' && recStatus !== reconciliationFilter) return false;
        if (nfFilter !== 'TODAS' && nfStatus !== nfFilter) return false;

        const chName = record?.meioPagamentoNome?.trim() || 'Sem Meio Definido';
        if (channelFilter !== 'TODOS' && chName !== channelFilter) return false;

        if (startDate || endDate) {
          const refDate =
            dateField === 'pedido'
              ? toLocalDateInput(order.dataPedido || '')
              : toLocalDateInput(record?.dataExtrato || '');
          if (!refDate) return false;
          if (startDate && refDate < startDate) return false;
          if (endDate && refDate > endDate) return false;
        }

        return true;
      })
      .map(({ order, record }) => {
        const recStatus = getEffectiveReconciliationStatus(order, record);
        const nfStatus = getEffectiveInvoiceStatus(record);
        const valorTotal = Number(order.valorTotal || 0);
        const valorConciliado = Number(record?.valorConciliado || 0);
        const saldoPendente = Math.max(0, Number((valorTotal - valorConciliado).toFixed(2)));
        const dataPedidoYmd = toLocalDateInput(order.dataPedido || '');
        const dataExtratoYmd = toLocalDateInput(record?.dataExtrato || '');

        return {
          order,
          record,
          recStatus,
          nfStatus,
          unidadeNome: unitMap.get(order.unidadeOrigemId)?.nome || 'Unidade',
          valorTotal,
          valorConciliado,
          saldoPendente,
          dataPedidoYmd,
          dataExtratoYmd,
          meioPagamento: record?.meioPagamentoNome?.trim() || 'Sem Meio Definido',
        };
      });
  }, [
    scope,
    hasActiveFilterDiff,
    filteredRows,
    allRows,
    unitFilter,
    reconciliationFilter,
    nfFilter,
    channelFilter,
    dateField,
    startDate,
    endDate,
    unitMap,
  ]);

  const sortedRows = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...enrichedRows].sort((a, b) => {
      if (sortBy === 'dataPedido') {
        if (a.dataPedidoYmd !== b.dataPedidoYmd) {
          return a.dataPedidoYmd.localeCompare(b.dataPedidoYmd) * dir;
        }
      } else if (sortBy === 'dataExtrato') {
        const da = a.dataExtratoYmd || (dir > 0 ? '9999-99-99' : '');
        const db = b.dataExtratoYmd || (dir > 0 ? '9999-99-99' : '');
        if (da !== db) return da.localeCompare(db) * dir;
      } else if (sortBy === 'valorPedido') {
        if (a.valorTotal !== b.valorTotal) return (a.valorTotal - b.valorTotal) * dir;
      } else if (sortBy === 'saldoPendente') {
        if (a.saldoPendente !== b.saldoPendente) {
          return (a.saldoPendente - b.saldoPendente) * dir;
        }
      } else if (sortBy === 'numeroPedido') {
        return a.order.numeroPedido.localeCompare(b.order.numeroPedido, 'pt-BR') * dir;
      }
      const cCmp = a.order.clienteNome.localeCompare(b.order.clienteNome, 'pt-BR') * dir;
      if (cCmp !== 0) return cCmp;
      return a.order.numeroPedido.localeCompare(b.order.numeroPedido, 'pt-BR');
    });
  }, [enrichedRows, sortBy, sortDirection]);

  const reportData: TabularReportData<FinanceiroReportColumnKey> | null = useMemo(() => {
    if (!isOpen) return null;

    const selectedColDefs = selectedColumns
      .map(key => FINANCEIRO_REPORT_COLUMNS.find(c => c.key === key))
      .filter((c): c is TabularReportColumnDef<FinanceiroReportColumnKey> => Boolean(c));

    const toRow = (
      entry: (typeof sortedRows)[number]
    ): TabularReportRow<FinanceiroReportColumnKey> => ({
      key: entry.order.id,
      rowTone:
        entry.recStatus === 'CONCILIADO' && entry.nfStatus !== 'PENDENTE'
          ? 'default'
          : entry.recStatus === 'PENDENTE'
          ? 'amber'
          : 'default',
      cells: {
        numeroPedido: { text: entry.order.numeroPedido, tone: 'bold' },
        clienteNome: { text: entry.order.clienteNome, tone: 'bold' },
        unidadeNome: { text: entry.unidadeNome, tone: 'default' },
        dataPedido: { text: formatDateBR(entry.order.dataPedido), tone: 'slate' },
        valorTotal: {
          text: `R$ ${formatCurrencyBR(entry.valorTotal)}`,
          numValue: entry.valorTotal,
          tone: 'bold',
        },
        valorConciliado: {
          text: `R$ ${formatCurrencyBR(entry.valorConciliado)}`,
          numValue: entry.valorConciliado,
          tone: entry.valorConciliado > 0 ? 'emerald' : 'slate',
        },
        saldoPendente: {
          text: `R$ ${formatCurrencyBR(entry.saldoPendente)}`,
          numValue: entry.saldoPendente,
          tone: entry.saldoPendente > 0 ? 'rose' : 'emerald',
        },
        conciliacao: {
          text: RECONCILIATION_STATUS_LABELS[entry.recStatus],
          tone:
            entry.recStatus === 'CONCILIADO'
              ? 'emerald'
              : entry.recStatus === 'PARCIAL'
              ? 'sky'
              : 'amber',
          badge: true,
        },
        nfStatus: {
          text: INVOICE_STATUS_LABELS[entry.nfStatus],
          tone:
            entry.nfStatus === 'EMITIDA'
              ? 'emerald'
              : entry.nfStatus === 'DISPENSADA'
              ? 'slate'
              : 'rose',
          badge: true,
        },
        dataEntrega: {
          text: formatDeliveryTimeRange(
            entry.order.dataHoraEntrega,
            entry.order.dataHoraEntregaFim,
            {
              tipoEntrega: entry.order.tipoEntrega,
              turnoEntrega:
                entry.order.tipoEntrega === 'DELIVERY' ? entry.order.turnoEntrega : undefined,
            }
          ),
          tone: 'slate',
        },
        statusPedido: {
          text: ORDER_STATUS_LABELS[entry.order.status],
          tone: 'slate',
        },
        meioPagamento: { text: entry.meioPagamento, tone: 'bold' },
        dataPagamento: { text: formatDateBR(entry.record?.dataPagamento), tone: 'slate' },
        dataExtrato: { text: formatDateBR(entry.record?.dataExtrato), tone: 'slate' },
        nfDataEmissao: { text: formatDateBR(entry.record?.nfDataEmissao), tone: 'slate' },
        observacoes: {
          text: entry.record?.nfObservacoes || entry.record?.observacoes || '—',
          tone: 'slate',
        },
      },
    });

    const summarize = (entries: typeof sortedRows) => ({
      valorTotal: Number(entries.reduce((s, r) => s + r.valorTotal, 0).toFixed(2)),
      valorConciliado: Number(entries.reduce((s, r) => s + r.valorConciliado, 0).toFixed(2)),
      saldoPendente: Number(entries.reduce((s, r) => s + r.saldoPendente, 0).toFixed(2)),
    });

    const allTabularRows = sortedRows.map(toRow);
    const grandTotals = summarize(sortedRows);

    const groups: Array<TabularReportGroup<FinanceiroReportColumnKey>> = [];
    if (groupBy === 'nenhum') {
      groups.push({
        key: 'all',
        label: 'Todos os Lançamentos',
        rows: allTabularRows,
        subtotals: grandTotals,
      });
    } else {
      const bucket = new Map<string, { label: string; rows: typeof sortedRows }>();
      sortedRows.forEach(entry => {
        let rawKey = '';
        let label = '';
        if (groupBy === 'pendencia') {
          rawKey = getFinancialPendingGroupLabel(entry.order, entry.record);
          label = rawKey;
        } else if (groupBy === 'lojaOrigem') {
          rawKey = entry.unidadeNome;
          label = rawKey;
        } else if (groupBy === 'meioPagamento') {
          rawKey = entry.meioPagamento;
          label = rawKey;
        } else if (groupBy === 'situacaoNf') {
          if (entry.nfStatus === 'EMITIDA') label = 'NF Emitida';
          else if (entry.nfStatus === 'DISPENSADA') label = 'NF Dispensada';
          else if (isOrderReadyForInvoice(entry.order, entry.record)) {
            label = 'Pronto para Emitir NF';
          } else {
            label = 'Aguardando Conciliação para NF';
          }
          rawKey = label;
        } else if (groupBy === 'dataExtrato') {
          rawKey = entry.dataExtratoYmd || '9999-99-99';
          label = entry.dataExtratoYmd
            ? formatDateBR(entry.dataExtratoYmd)
            : 'Sem Data no Extrato';
        } else {
          rawKey = entry.dataPedidoYmd || '9999-99-99';
          label = entry.dataPedidoYmd
            ? formatDateBR(entry.dataPedidoYmd)
            : 'Sem Data do Pedido';
        }
        const cur = bucket.get(rawKey) || { label, rows: [] };
        cur.rows.push(entry);
        bucket.set(rawKey, cur);
      });

      Array.from(bucket.entries())
        .sort(([ka], [kb]) => {
          if (groupBy === 'pendencia') {
            const list: readonly string[] = FINANCIAL_PENDING_GROUP_ORDER;
            return list.indexOf(ka) - list.indexOf(kb);
          }
          return ka.localeCompare(kb, 'pt-BR');
        })
        .forEach(([key, entry]) => {
          const subs = summarize(entry.rows);
          groups.push({
            key,
            label: entry.label,
            headerSummary: `${entry.rows.length} lançamento(s) • Pedido: R$ ${formatCurrencyBR(
              subs.valorTotal
            )} • Extrato: R$ ${formatCurrencyBR(subs.valorConciliado)}`,
            subtotalLabel: `Subtotal — ${entry.label} (${entry.rows.length})`,
            rows: entry.rows.map(toRow),
            subtotals: subs,
          });
        });
    }

    // Channel summary sheet (Aba 2)
    const chBucket = new Map<
      string,
      { nome: string; count: number; valorConciliado: number }
    >();
    sortedRows.forEach(r => {
      const name = r.meioPagamento;
      const cur = chBucket.get(name) || { nome: name, count: 0, valorConciliado: 0 };
      cur.count += 1;
      cur.valorConciliado = Number((cur.valorConciliado + r.valorConciliado).toFixed(2));
      chBucket.set(name, cur);
    });

    const totalConciliadoGeral = grandTotals.valorConciliado;
    const chEntries = Array.from(chBucket.values()).sort(
      (a, b) => b.valorConciliado - a.valorConciliado || a.nome.localeCompare(b.nome, 'pt-BR')
    );

    const summaryRows: TabularReportRow[] = chEntries.map(ch => {
      const pct =
        totalConciliadoGeral > 0
          ? `${((ch.valorConciliado / totalConciliadoGeral) * 100)
              .toFixed(1)
              .replace('.', ',')}%`
          : '0,0%';
      return {
        key: ch.nome,
        cells: {
          meio: { text: ch.nome, tone: 'bold' },
          lancamentos: { text: String(ch.count), numValue: ch.count, tone: 'slate' },
          valorConciliado: {
            text: `R$ ${formatCurrencyBR(ch.valorConciliado)}`,
            numValue: ch.valorConciliado,
            tone: 'emerald',
          },
          participacao: { text: pct, tone: 'slate' },
        },
      };
    });

    const now = new Date();
    const generatedAtLabel = `${String(now.getDate()).padStart(2, '0')}/${String(
      now.getMonth() + 1
    ).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(
      2,
      '0'
    )}:${String(now.getMinutes()).padStart(2, '0')}`;

    const groupOpt = GROUP_OPTIONS.find(o => o.value === groupBy);
    const sortOpt = SORT_OPTIONS.find(o => o.value === sortBy);
    const unitLabel =
      unitFilter === 'TODAS' ? 'Todas as Unidades' : unitMap.get(unitFilter)?.nome || 'Unidade';
    const periodText =
      !startDate && !endDate
        ? 'Todo o período'
        : startDate && endDate
        ? startDate === endDate
          ? formatDateBR(startDate)
          : `${formatDateBR(startDate)} até ${formatDateBR(endDate)}`
        : startDate
        ? `A partir de ${formatDateBR(startDate)}`
        : `Até ${formatDateBR(endDate)}`;

    const groupPrefixMap: Record<FinanceiroReportGroupBy, string> = {
      pendencia: 'PENDÊNCIA',
      lojaOrigem: 'UNIDADE',
      meioPagamento: 'MEIO',
      situacaoNf: 'NF',
      dataExtrato: 'EXTRATO',
      dataPedido: 'PEDIDO',
      nenhum: '',
    };

    return {
      title: 'Relatório Financeiro',
      filePrefix: 'Beju_Caramelos_Relatorio_Financeiro',
      sheetName: 'Relatorio_Financeiro',
      mainTabLabel: 'Aba 1: Relatorio_Financeiro',
      orientation,
      isGrouped: groupBy !== 'nenhum',
      groupLabel: groupOpt?.label || 'Pendência Financeira',
      groupHeaderPrefix: groupPrefixMap[groupBy],
      itemNounSingular: 'lançamento',
      itemNounPlural: 'lançamentos',
      generatedAtLabel,
      rightMeta: `${sortedRows.length} lançamento(s) • Conciliado: R$ ${formatCurrencyBR(
        grandTotals.valorConciliado
      )} • Agrupado por: ${groupOpt?.label || 'Pendência Financeira'} • ${
        orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem'
      }`,
      filterParts: [
        { label: dateField === 'pedido' ? 'Período (Pedido)' : 'Período (Extrato)', value: periodText },
        { label: 'Unidade', value: unitLabel },
        {
          label: 'Conciliação',
          value:
            reconciliationFilter === 'TODAS'
              ? 'Todas'
              : RECONCILIATION_STATUS_LABELS[reconciliationFilter],
        },
        {
          label: 'NF',
          value: nfFilter === 'TODAS' ? 'Todas' : INVOICE_STATUS_LABELS[nfFilter],
        },
        {
          label: 'Meio',
          value: channelFilter === 'TODOS' ? 'Todos' : channelFilter,
        },
        {
          label: 'Ordem',
          value: `${sortOpt?.label || 'Data Pedido'} (${
            sortDirection === 'asc' ? 'Crescente ↑' : 'Decrescente ↓'
          })`,
        },
        ...(scope === 'filtered' && searchTerm.trim()
          ? [{ label: 'Busca', value: `"${searchTerm.trim()}"` }]
          : []),
      ],
      selectedColumns: selectedColDefs,
      rows: allTabularRows,
      groups,
      grandTotals,
      emptyMessage: 'Nenhum lançamento financeiro encontrado com os critérios selecionados.',
      includeSummaryInPdf,
      summarySheet: {
        sheetName: 'Resumo_Meios_Pagamento',
        tabLabel: 'Aba 2: Resumo_Meios_Pagamento',
        title: 'Resumo por Meio de Pagamento',
        columns: [
          {
            key: 'meio',
            label: 'Meio de Pagamento',
            align: 'left',
            kind: 'text',
            wch: 26,
          },
          {
            key: 'lancamentos',
            label: 'Lançamentos',
            align: 'center',
            kind: 'number',
            wch: 15,
            summable: true,
          },
          {
            key: 'valorConciliado',
            label: 'Valor Conciliado (R$)',
            align: 'right',
            kind: 'currency',
            wch: 22,
            summable: true,
          },
          {
            key: 'participacao',
            label: '% do Total',
            align: 'center',
            kind: 'text',
            wch: 14,
          },
        ],
        rows: summaryRows,
        totalLabel: `TOTAL CONSOLIDADO (${summaryRows.length} meio(s))`,
        totals: {
          lancamentos: sortedRows.length,
          valorConciliado: totalConciliadoGeral,
        },
        emptyMessage: 'Nenhum meio de pagamento encontrado nos critérios selecionados.',
      },
    };
  }, [
    isOpen,
    selectedColumns,
    sortedRows,
    groupBy,
    sortBy,
    sortDirection,
    orientation,
    dateField,
    startDate,
    endDate,
    unitFilter,
    reconciliationFilter,
    nfFilter,
    channelFilter,
    unitMap,
    scope,
    searchTerm,
    includeSummaryInPdf,
  ]);

  const hasClearableFilters = Boolean(
    startDate ||
      endDate ||
      unitFilter !== 'TODAS' ||
      reconciliationFilter !== 'TODAS' ||
      nfFilter !== 'TODAS' ||
      channelFilter !== 'TODOS'
  );

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setUnitFilter('TODAS');
    setReconciliationFilter('TODAS');
    setNfFilter('TODAS');
    setChannelFilter('TODOS');
  };

  const handleOpenPreview = async () => {
    if (!reportData || selectedColumns.length === 0 || isInvalidDateRange || exporting) return;
    setExporting(true);
    clearPreviewArtifacts();
    try {
      if (format === 'PDF') {
        const { buildTabularReportPdfBlob } = await import('../utils/tabularReportPdf');
        const blob = await buildTabularReportPdfBlob(reportData);
        pdfBlobRef.current = blob;
        setPdfPreviewUrl(URL.createObjectURL(blob));
      } else {
        const { buildTabularReportXlsxBuffer } = await import('../utils/tabularReportExcel');
        const buffer = buildTabularReportXlsxBuffer(reportData);
        xlsxBufferRef.current = buffer;
        setPreviewTab('main');
      }
      setStep('preview');
    } finally {
      setExporting(false);
    }
  };

  const handleBackToConfig = () => {
    clearPreviewArtifacts();
    setStep('config');
  };

  const handleConfirmDownload = async () => {
    if (!reportData || exporting) return;
    setExporting(true);
    try {
      if (format === 'PDF' && pdfBlobRef.current) {
        const { downloadTabularReportPdfBlob } = await import('../utils/tabularReportPdf');
        downloadTabularReportPdfBlob(pdfBlobRef.current, reportData.filePrefix);
      } else if (format === 'XLSX' && xlsxBufferRef.current) {
        const { downloadTabularReportExcelBuffer } = await import('../utils/tabularReportExcel');
        downloadTabularReportExcelBuffer(xlsxBufferRef.current, reportData.filePrefix);
      }
      onClose();
    } finally {
      setExporting(false);
    }
  };

  const kpis: ReportKpiItem[] = useMemo(() => {
    const totalPedidos = sortedRows.reduce((s, r) => s + r.valorTotal, 0);
    const totalConciliado = sortedRows.reduce((s, r) => s + r.valorConciliado, 0);
    const totalSaldo = sortedRows.reduce((s, r) => s + r.saldoPendente, 0);
    return [
      {
        label: 'Lançamentos',
        value: sortedRows.length,
        subtext:
          groupBy !== 'nenhum' && reportData
            ? `${reportData.groups.length} grupo(s)`
            : undefined,
        tone: 'neutral',
      },
      {
        label: 'Valor Pedidos',
        value: `R$ ${formatCurrencyBR(totalPedidos)}`,
        tone: 'emerald',
      },
      {
        label: 'Valor Conciliado',
        value: `R$ ${formatCurrencyBR(totalConciliado)}`,
        tone: 'neutral',
      },
      {
        label: 'Saldo Pendente',
        value: `R$ ${formatCurrencyBR(totalSaldo)}`,
        subtext: totalSaldo > 0 ? 'A conciliar / receber' : '100% conciliado',
        tone: 'emerald',
        subtextTone: totalSaldo > 0 ? 'rose' : 'default',
      },
    ];
  }, [sortedRows, groupBy, reportData]);

  return (
    <ReportModalShell
      isOpen={isOpen}
      onClose={onClose}
      step={step}
      title="Relatório Financeiro"
      configSubtitle="Escolha formato, período, conciliação, NF, agrupamento, ordenação e colunas"
      format={format}
      orientation={orientation}
      busy={exporting}
      canPreview={selectedColumns.length > 0 && !isInvalidDateRange}
      kpis={kpis}
      onOpenPreview={() => void handleOpenPreview()}
      onBackToConfig={handleBackToConfig}
      onConfirmDownload={() => void handleConfirmDownload()}
    >
      {step === 'preview' && reportData ? (
        format === 'PDF' && pdfPreviewUrl ? (
          <ReportPdfPreviewFrame
            pdfUrl={pdfPreviewUrl}
            iframeTitle="Prévia do Relatório Financeiro PDF"
            fallbackContent={
              <TabularReportPreviewTable
                data={reportData}
                format={format}
                activeTab={previewTab}
                onTabChange={setPreviewTab}
              />
            }
          />
        ) : (
          <TabularReportPreviewTable
            data={reportData}
            format={format}
            activeTab={previewTab}
            onTabChange={setPreviewTab}
          />
        )
      ) : (
        <div className="space-y-3">
          {/* 1. Formato + Orientação A4 */}
          <ReportOutputStrip
            format={format}
            onFormatChange={setFormat}
            orientation={orientation}
            onOrientationChange={setOrientation}
            selectedColumnsCount={selectedColumns.length}
          />

          {/* 2. Filtros */}
          <ReportFiltersCard
            hasClearableFilters={hasClearableFilters}
            onClearFilters={handleClearFilters}
            showScopeToggle={hasActiveFilterDiff}
            scopeLabel="Base de lançamentos"
            scopeSummary={
              searchTerm.trim() ? `Busca ativa: "${searchTerm.trim()}"` : undefined
            }
            scope={scope}
            filteredCount={filteredRows.length}
            totalCount={allRows.length}
            onScopeChange={setScope}
          >
            {/* Período */}
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Período</span>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setDateField('pedido')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer ${
                      dateField === 'pedido'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Data do Pedido
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateField('extrato')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer ${
                      dateField === 'extrato'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Data do Extrato
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {datePresets.map(preset => {
                  const isActive = startDate === preset.start && endDate === preset.end;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setStartDate(preset.start);
                        setEndDate(preset.end);
                      }}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2 min-w-0">
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    {dateField === 'pedido' ? 'De (Pedido)' : 'De (Extrato)'}
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    aria-label="Data inicial do relatório financeiro"
                    className="w-full min-w-0 max-w-full h-9 bg-white border border-slate-300 rounded-lg px-2 sm:px-2.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    {dateField === 'pedido' ? 'Até (Pedido)' : 'Até (Extrato)'}
                  </span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    aria-label="Data final do relatório financeiro"
                    className="w-full min-w-0 max-w-full h-9 bg-white border border-slate-300 rounded-lg px-2 sm:px-2.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {isInvalidDateRange && (
                <p className="text-[11px] font-semibold text-rose-600">
                  A data inicial não pode ser maior que a data final.
                </p>
              )}
            </div>

            {/* Unidade + Conciliação + NF + Meio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 border-t border-slate-100">
              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Unidade
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por unidade"
                    value={unitFilter}
                    onChange={e => setUnitFilter(e.target.value)}
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas as Unidades</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Meio de Pagamento
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por meio de pagamento"
                    value={channelFilter}
                    onChange={e => setChannelFilter(e.target.value)}
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODOS">Todos os Meios</option>
                    {availableChannelNames.map(ch => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                    <option value="Sem Meio Definido">Sem Meio Definido</option>
                  </select>
                  <ChevronDown
                    className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Conciliação
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por conciliação"
                    value={reconciliationFilter}
                    onChange={e =>
                      setReconciliationFilter(
                        e.target.value as 'TODAS' | ReconciliationStatus
                      )
                    }
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas</option>
                    <option value="CONCILIADO">Conciliado</option>
                    <option value="PARCIAL">Parcial</option>
                    <option value="PENDENTE">Pendente</option>
                  </select>
                  <ChevronDown
                    className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Nota Fiscal
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por nota fiscal"
                    value={nfFilter}
                    onChange={e =>
                      setNfFilter(e.target.value as 'TODAS' | InvoiceStatus)
                    }
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas</option>
                    <option value="EMITIDA">NF Emitida</option>
                    <option value="PENDENTE">A emitir</option>
                    <option value="DISPENSADA">NF Dispensada</option>
                  </select>
                  <ChevronDown
                    className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          </ReportFiltersCard>

          {/* 3. Organização e Colunas */}
          <ReportOrganizationCard
            groupBy={groupBy}
            onGroupByChange={val => setGroupBy(val)}
            groupOptions={GROUP_OPTIONS}
            sortBy={sortBy}
            onSortByChange={val => setSortBy(val)}
            sortOptions={SORT_OPTIONS}
            sortDirection={sortDirection}
            onToggleSortDirection={() =>
              setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
            }
            columns={FINANCEIRO_REPORT_COLUMNS}
            defaultColumns={DEFAULT_COLUMNS}
            selectedColumns={selectedColumns}
            onSelectedColumnsChange={setSelectedColumns}
            optionalColumnsTitle="Colunas Adicionais (Datas, Pagamento e NF)"
            extraOption={
              format === 'PDF' ? (
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSummaryInPdf}
                    onChange={e => setIncludeSummaryInPdf(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  <span>
                    Incluir tabela de Resumo por Meio de Pagamento ao final do PDF
                  </span>
                </label>
              ) : undefined
            }
          />
        </div>
      )}
    </ReportModalShell>
  );
};
