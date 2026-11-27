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
import { Customer, Order, OrderStatus, Product, StoreUnit } from '../types';
import { formatDeliveryTimeRange } from '../utils/deliveryTimeRange';
import { resolveOrderRegion } from '../utils/orderRegion';
import {
  PAYMENT_STATUS_LABELS,
  getEffectivePaymentStatus,
  getOrderRemainingAmount,
} from '../utils/paymentStatus';
import {
  TabularCellTone,
  TabularReportColumnDef,
  TabularReportData,
  TabularReportGroup,
  TabularReportRow,
} from '../utils/tabularReportTypes';

export type EntregasReportColumnKey =
  | 'numeroPedido'
  | 'dataHoraEntrega'
  | 'clienteNome'
  | 'enderecoEntrega'
  | 'regiao'
  | 'itensResumo'
  | 'valorTotal'
  | 'status'
  | 'unidade'
  | 'clienteTelefone'
  | 'detalheEntrega'
  | 'qtdItens'
  | 'taxaEntrega'
  | 'statusPagamento'
  | 'saldoAReceber'
  | 'observacoes';

export type EntregasReportGroupBy =
  | 'lojaDataTurno'
  | 'loja'
  | 'dataTurno'
  | 'regiao'
  | 'status'
  | 'nenhum';

export type EntregasReportSortBy =
  | 'dataEntrega'
  | 'cliente'
  | 'valorTotal'
  | 'numeroPedido'
  | 'regiao';

interface EntregasReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allDeliveries: Order[];
  filteredDeliveries: Order[];
  products: Product[];
  units: StoreUnit[];
  customers: Customer[];
  initialDateFilter:
    | 'TODAS'
    | 'ATRASADOS'
    | 'HOJE'
    | 'AMANHA'
    | 'PROXIMOS_7_DIAS'
    | 'DATA';
  initialCustomDate: string;
  initialStatusFilter: 'SEM_ENTREGUES' | 'SO_ENTREGUES' | 'SEM_FILTRO';
  initialGroupBy: 'LOJA_DATA_TURNO' | 'LOJA' | 'REGIAO' | 'STATUS' | 'NENHUM';
  searchTerm: string;
}

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PRONTO: 'Pronto',
  EM_ROTA: 'Em Rota',
  ENTREGUE: 'Entregue',
};

const ENTREGAS_REPORT_COLUMNS: Array<TabularReportColumnDef<EntregasReportColumnKey>> = [
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
    key: 'dataHoraEntrega',
    label: 'Data/Hora Entrega',
    shortLabel: 'Entrega',
    isDefault: true,
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
    key: 'clienteNome',
    label: 'Cliente',
    shortLabel: 'Cliente',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 18,
    pdfMinWidthMm: 22,
    pdfMaxWidthMm: 44,
    excelWch: 24,
    excelMinWch: 15,
    excelMaxWch: 36,
    isFlexible: true,
  },
  {
    key: 'enderecoEntrega',
    label: 'Endereço de Entrega',
    shortLabel: 'Endereço',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 26,
    pdfMinWidthMm: 30,
    pdfMaxWidthMm: 64,
    excelWch: 32,
    excelMinWch: 20,
    excelMaxWch: 48,
    isFlexible: true,
  },
  {
    key: 'regiao',
    label: 'Bairro / Região',
    shortLabel: 'Região',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 14,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 34,
    excelWch: 20,
    excelMinWch: 14,
    excelMaxWch: 28,
  },
  {
    key: 'itensResumo',
    label: 'Itens do Pedido',
    shortLabel: 'Itens',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 22,
    pdfMinWidthMm: 24,
    pdfMaxWidthMm: 54,
    excelWch: 28,
    excelMinWch: 18,
    excelMaxWch: 44,
    isFlexible: true,
  },
  {
    key: 'valorTotal',
    label: 'Valor Total (R$)',
    shortLabel: 'Valor',
    isDefault: true,
    kind: 'currency',
    align: 'right',
    pdfWeight: 12,
    pdfMinWidthMm: 17,
    pdfMaxWidthMm: 25,
    excelWch: 14,
    excelMinWch: 12,
    excelMaxWch: 20,
    summable: true,
  },
  {
    key: 'status',
    label: 'Status',
    shortLabel: 'Status',
    isDefault: true,
    kind: 'badge',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 24,
    excelWch: 14,
    excelMinWch: 11,
    excelMaxWch: 18,
  },
  {
    key: 'unidade',
    label: 'Unidade de Origem',
    shortLabel: 'Unidade',
    isDefault: false,
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
    key: 'clienteTelefone',
    label: 'Telefone / WhatsApp',
    shortLabel: 'Telefone',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 13,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 26,
    excelWch: 17,
    excelMinWch: 14,
    excelMaxWch: 22,
  },
  {
    key: 'detalheEntrega',
    label: 'Detalhe / Ponto de Referência',
    shortLabel: 'Detalhe Ent.',
    isDefault: false,
    kind: 'text',
    align: 'left',
    pdfWeight: 18,
    pdfMinWidthMm: 20,
    pdfMaxWidthMm: 42,
    excelWch: 24,
    excelMinWch: 15,
    excelMaxWch: 36,
    isFlexible: true,
  },
  {
    key: 'qtdItens',
    label: 'Qtd. Itens',
    shortLabel: 'Qtd.',
    isDefault: false,
    kind: 'number',
    align: 'center',
    pdfWeight: 9,
    pdfMinWidthMm: 12,
    pdfMaxWidthMm: 18,
    excelWch: 11,
    excelMinWch: 9,
    excelMaxWch: 14,
    summable: true,
  },
  {
    key: 'taxaEntrega',
    label: 'Taxa Entrega (R$)',
    shortLabel: 'Taxa Ent.',
    isDefault: false,
    kind: 'currency',
    align: 'right',
    pdfWeight: 11,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 24,
    excelWch: 14,
    excelMinWch: 12,
    excelMaxWch: 18,
    summable: true,
  },
  {
    key: 'statusPagamento',
    label: 'Status Pagamento',
    shortLabel: 'Pagto.',
    isDefault: false,
    kind: 'badge',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 24,
    excelWch: 15,
    excelMinWch: 12,
    excelMaxWch: 20,
  },
  {
    key: 'saldoAReceber',
    label: 'Saldo a Receber (R$)',
    shortLabel: 'A Receber',
    isDefault: false,
    kind: 'currency',
    align: 'right',
    pdfWeight: 12,
    pdfMinWidthMm: 17,
    pdfMaxWidthMm: 25,
    excelWch: 15,
    excelMinWch: 13,
    excelMaxWch: 20,
    summable: true,
  },
  {
    key: 'observacoes',
    label: 'Observações',
    shortLabel: 'Obs.',
    isDefault: false,
    kind: 'text',
    align: 'left',
    pdfWeight: 18,
    pdfMinWidthMm: 20,
    pdfMaxWidthMm: 44,
    excelWch: 24,
    excelMinWch: 16,
    excelMaxWch: 38,
    isFlexible: true,
  },
];

const DEFAULT_COLUMNS: EntregasReportColumnKey[] = ENTREGAS_REPORT_COLUMNS.filter(
  c => c.isDefault
).map(c => c.key);

const GROUP_OPTIONS: Array<ReportSelectOption<EntregasReportGroupBy>> = [
  { value: 'lojaDataTurno', label: 'Loja → Data/Turno' },
  { value: 'loja', label: 'Loja / Unidade' },
  { value: 'dataTurno', label: 'Data / Turno' },
  { value: 'regiao', label: 'Bairro / Região' },
  { value: 'status', label: 'Status' },
  { value: 'nenhum', label: 'Sem Agrupamento' },
];

const SORT_OPTIONS: Array<ReportSelectOption<EntregasReportSortBy>> = [
  { value: 'dataEntrega', label: 'Data/Hora Entrega' },
  { value: 'cliente', label: 'Cliente (A-Z)' },
  { value: 'valorTotal', label: 'Valor Total' },
  { value: 'numeroPedido', label: 'Nº Pedido' },
  { value: 'regiao', label: 'Bairro / Região' },
];

function toLocalYyyyMmDd(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDatePresets(): Array<{ label: string; start: string; end: string }> {
  const now = new Date();
  const today = toLocalYyyyMmDd(now);
  const tomorrow = toLocalYyyyMmDd(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  );
  const next7End = toLocalYyyyMmDd(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6)
  );
  const monthStart = toLocalYyyyMmDd(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = toLocalYyyyMmDd(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  return [
    { label: 'Todo o período', start: '', end: '' },
    { label: 'Hoje', start: today, end: today },
    { label: 'Amanhã', start: tomorrow, end: tomorrow },
    { label: 'Próx. 7 dias', start: today, end: next7End },
    { label: 'Este mês', start: monthStart, end: monthEnd },
  ];
}

function formatDateBrShort(ymd: string): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

function mapScreenGroup(
  g: EntregasReportModalProps['initialGroupBy']
): EntregasReportGroupBy {
  switch (g) {
    case 'LOJA_DATA_TURNO':
      return 'lojaDataTurno';
    case 'LOJA':
      return 'loja';
    case 'REGIAO':
      return 'regiao';
    case 'STATUS':
      return 'status';
    default:
      return 'nenhum';
  }
}

export const EntregasReportModal: React.FC<EntregasReportModalProps> = ({
  isOpen,
  onClose,
  allDeliveries,
  filteredDeliveries,
  products,
  units,
  customers,
  initialDateFilter,
  initialCustomDate,
  initialStatusFilter,
  initialGroupBy,
  searchTerm,
}) => {
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');
  const [format, setFormat] = useState<ReportFormat>('PDF');
  const [orientation, setOrientation] = useState<ReportOrientation>('landscape');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<
    'TODOS' | 'SEM_ENTREGUES' | 'PRONTO' | 'EM_ROTA' | 'ENTREGUE'
  >('SEM_ENTREGUES');
  const [unitFilter, setUnitFilter] = useState<string>('TODAS');
  const [regionFilter, setRegionFilter] = useState<string>('TODAS');
  const [groupBy, setGroupBy] = useState<EntregasReportGroupBy>('lojaDataTurno');
  const [sortBy, setSortBy] = useState<EntregasReportSortBy>('dataEntrega');
  const [sortDirection, setSortDirection] = useState<ReportSortDirection>('asc');
  const [selectedColumns, setSelectedColumns] =
    useState<EntregasReportColumnKey[]>(DEFAULT_COLUMNS);
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
  const hasActiveFilterDiff = filteredDeliveries.length !== allDeliveries.length;

  useEffect(() => {
    if (!isOpen) {
      clearPreviewArtifacts();
      setStep('config');
      return;
    }
    setScope(hasActiveFilterDiff ? 'filtered' : 'all');
    setStatusFilter(
      initialStatusFilter === 'SEM_ENTREGUES'
        ? 'SEM_ENTREGUES'
        : initialStatusFilter === 'SO_ENTREGUES'
        ? 'ENTREGUE'
        : 'TODOS'
    );
    setUnitFilter('TODAS');
    setRegionFilter('TODAS');
    setGroupBy(mapScreenGroup(initialGroupBy));

    const now = new Date();
    const today = toLocalYyyyMmDd(now);
    const tomorrow = toLocalYyyyMmDd(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    );
    const next7 = toLocalYyyyMmDd(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6)
    );
    if (initialDateFilter === 'HOJE') {
      setStartDate(today);
      setEndDate(today);
    } else if (initialDateFilter === 'AMANHA') {
      setStartDate(tomorrow);
      setEndDate(tomorrow);
    } else if (initialDateFilter === 'PROXIMOS_7_DIAS') {
      setStartDate(today);
      setEndDate(next7);
    } else if (initialDateFilter === 'DATA' && initialCustomDate) {
      setStartDate(initialCustomDate);
      setEndDate(initialCustomDate);
    } else {
      setStartDate('');
      setEndDate('');
    }
    setStep('config');
  }, [
    isOpen,
    hasActiveFilterDiff,
    initialDateFilter,
    initialCustomDate,
    initialStatusFilter,
    initialGroupBy,
    clearPreviewArtifacts,
  ]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const prodMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const unitMap = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);

  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    allDeliveries.forEach(o => {
      set.add(resolveOrderRegion(o, customers, units).label);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allDeliveries, customers, units]);

  const enrichedDeliveries = useMemo(() => {
    const base =
      scope === 'filtered' && hasActiveFilterDiff ? filteredDeliveries : allDeliveries;

    return base
      .filter(order => {
        if (statusFilter === 'SEM_ENTREGUES' && order.status === 'ENTREGUE') return false;
        if (
          (statusFilter === 'PRONTO' ||
            statusFilter === 'EM_ROTA' ||
            statusFilter === 'ENTREGUE') &&
          order.status !== statusFilter
        ) {
          return false;
        }
        if (unitFilter !== 'TODAS' && order.unidadeOrigemId !== unitFilter) return false;
        const reg = resolveOrderRegion(order, customers, units).label;
        if (regionFilter !== 'TODAS' && reg !== regionFilter) return false;

        if (startDate || endDate) {
          const d = order.dataHoraEntrega ? toLocalYyyyMmDd(new Date(order.dataHoraEntrega)) : '';
          if (!d) return false;
          if (startDate && d < startDate) return false;
          if (endDate && d > endDate) return false;
        }
        return true;
      })
      .map(order => {
        const unit = unitMap.get(order.unidadeOrigemId);
        const unitName = unit?.nome || 'Unidade não informada';
        const reg = resolveOrderRegion(order, customers, units).label;
        const deliveryDate = new Date(order.dataHoraEntrega);
        const dateKey = Number.isNaN(deliveryDate.getTime())
          ? ''
          : toLocalYyyyMmDd(deliveryDate);
        const h = deliveryDate.getHours();
        const turnoOrder = h < 12 ? 1 : h < 18 ? 2 : 3;
        const turnoLabel = h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
        const dateTurnoLabel = dateKey
          ? `${formatDateBrShort(dateKey)} • Turno ${turnoLabel}`
          : 'Sem Data';

        const cust = customers.find(
          c =>
            c.telefone === order.clienteTelefone ||
            c.nome.toLowerCase() === order.clienteNome.toLowerCase()
        );
        const detalheEntrega = order.detalheEntrega || cust?.detalheEntrega || '';
        const itensResumo =
          order.itens.length > 0
            ? order.itens
                .map(
                  it =>
                    `${it.quantidade}x ${prodMap.get(it.produtoId)?.descricao || 'Produto'}`
                )
                .join('\n')
            : '—';
        const qtdItens = order.itens.reduce((s, it) => s + (Number(it.quantidade) || 0), 0);
        const remaining = getOrderRemainingAmount(order);
        const payStatus = getEffectivePaymentStatus(order);

        return {
          order,
          unitName,
          regiao: reg,
          dateKey,
          turnoOrder,
          dateTurnoLabel,
          detalheEntrega,
          itensResumo,
          qtdItens,
          remaining,
          payStatus,
        };
      });
  }, [
    scope,
    hasActiveFilterDiff,
    filteredDeliveries,
    allDeliveries,
    statusFilter,
    unitFilter,
    regionFilter,
    startDate,
    endDate,
    customers,
    units,
    unitMap,
    prodMap,
  ]);

  const sortedDeliveries = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...enrichedDeliveries].sort((a, b) => {
      if (sortBy === 'dataEntrega') {
        const ta = new Date(a.order.dataHoraEntrega).getTime();
        const tb = new Date(b.order.dataHoraEntrega).getTime();
        if (ta !== tb) return (ta - tb) * dir;
      } else if (sortBy === 'valorTotal') {
        if (a.order.valorTotal !== b.order.valorTotal) {
          return (a.order.valorTotal - b.order.valorTotal) * dir;
        }
      } else if (sortBy === 'numeroPedido') {
        return a.order.numeroPedido.localeCompare(b.order.numeroPedido, 'pt-BR') * dir;
      } else if (sortBy === 'regiao') {
        const rCmp = a.regiao.localeCompare(b.regiao, 'pt-BR') * dir;
        if (rCmp !== 0) return rCmp;
      }
      const cCmp = a.order.clienteNome.localeCompare(b.order.clienteNome, 'pt-BR') * dir;
      if (cCmp !== 0) return cCmp;
      return a.order.numeroPedido.localeCompare(b.order.numeroPedido, 'pt-BR');
    });
  }, [enrichedDeliveries, sortBy, sortDirection]);

  const reportData: TabularReportData<EntregasReportColumnKey> | null = useMemo(() => {
    if (!isOpen) return null;

    const selectedColDefs = selectedColumns
      .map(key => ENTREGAS_REPORT_COLUMNS.find(c => c.key === key))
      .filter((c): c is TabularReportColumnDef<EntregasReportColumnKey> => Boolean(c));

    const getStatusTone = (status: OrderStatus): TabularCellTone => {
      if (status === 'ENTREGUE') return 'emerald';
      if (status === 'EM_ROTA') return 'blue';
      if (status === 'PRONTO') return 'sky';
      return 'slate';
    };

    const toRow = (
      entry: (typeof sortedDeliveries)[number]
    ): TabularReportRow<EntregasReportColumnKey> => {
      const payTone: TabularCellTone =
        entry.payStatus === 'PAGO'
          ? 'emerald'
          : entry.payStatus === 'SINAL'
          ? 'sky'
          : 'amber';

      return {
        key: entry.order.id,
        rowTone: entry.order.status === 'ENTREGUE' ? 'default' : 'amber',
        cells: {
          numeroPedido: { text: entry.order.numeroPedido, tone: 'bold' },
          dataHoraEntrega: {
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
          clienteNome: { text: entry.order.clienteNome, tone: 'bold' },
          enderecoEntrega: {
            text: entry.order.enderecoEntrega || entry.order.clienteEndereco || '—',
            tone: 'default',
          },
          regiao: { text: entry.regiao, tone: 'bold' },
          itensResumo: { text: entry.itensResumo, tone: 'default' },
          valorTotal: {
            text: `R$ ${formatCurrencyBR(entry.order.valorTotal)}`,
            numValue: entry.order.valorTotal,
            tone: 'bold',
          },
          status: {
            text: DELIVERY_STATUS_LABELS[entry.order.status] || entry.order.status,
            tone: getStatusTone(entry.order.status),
            badge: true,
          },
          unidade: { text: entry.unitName, tone: 'default' },
          clienteTelefone: { text: entry.order.clienteTelefone || '—', tone: 'slate' },
          detalheEntrega: { text: entry.detalheEntrega || '—', tone: 'slate' },
          qtdItens: {
            text: String(entry.qtdItens),
            numValue: entry.qtdItens,
            tone: 'emerald',
          },
          taxaEntrega: {
            text: `R$ ${formatCurrencyBR(entry.order.taxaEntrega || 0)}`,
            numValue: entry.order.taxaEntrega || 0,
            tone: 'slate',
          },
          statusPagamento: {
            text: PAYMENT_STATUS_LABELS[entry.payStatus],
            tone: payTone,
            badge: true,
          },
          saldoAReceber: {
            text: `R$ ${formatCurrencyBR(entry.remaining)}`,
            numValue: entry.remaining,
            tone: entry.remaining > 0 ? 'rose' : 'emerald',
          },
          observacoes: { text: entry.order.observacoes || '—', tone: 'slate' },
        },
      };
    };

    const summarize = (entries: typeof sortedDeliveries) => ({
      valorTotal: Number(entries.reduce((s, r) => s + r.order.valorTotal, 0).toFixed(2)),
      qtdItens: entries.reduce((s, r) => s + r.qtdItens, 0),
      taxaEntrega: Number(
        entries.reduce((s, r) => s + (r.order.taxaEntrega || 0), 0).toFixed(2)
      ),
      saldoAReceber: Number(entries.reduce((s, r) => s + r.remaining, 0).toFixed(2)),
    });

    const allRows = sortedDeliveries.map(toRow);
    const grandTotals = summarize(sortedDeliveries);

    const groups: Array<TabularReportGroup<EntregasReportColumnKey>> = [];
    if (groupBy === 'nenhum') {
      groups.push({
        key: 'all',
        label: 'Todas as Entregas',
        rows: allRows,
        subtotals: grandTotals,
      });
    } else {
      const bucket = new Map<
        string,
        { label: string; sortKey: string; rows: typeof sortedDeliveries }
      >();
      sortedDeliveries.forEach(entry => {
        let key = '';
        let label = '';
        let sortKey = '';
        if (groupBy === 'lojaDataTurno') {
          key = `${entry.unitName}|${entry.dateKey}|${entry.turnoOrder}`;
          label = `${entry.unitName} — ${entry.dateTurnoLabel}`;
          sortKey = `${entry.unitName}|${entry.dateKey || '9999-99-99'}|${entry.turnoOrder}`;
        } else if (groupBy === 'loja') {
          key = entry.unitName;
          label = entry.unitName;
          sortKey = entry.unitName;
        } else if (groupBy === 'dataTurno') {
          key = `${entry.dateKey}|${entry.turnoOrder}`;
          label = entry.dateTurnoLabel;
          sortKey = `${entry.dateKey || '9999-99-99'}|${entry.turnoOrder}`;
        } else if (groupBy === 'regiao') {
          key = entry.regiao;
          label = entry.regiao;
          sortKey = entry.regiao;
        } else {
          key = entry.order.status;
          label = DELIVERY_STATUS_LABELS[entry.order.status] || entry.order.status;
          sortKey = label;
        }
        const cur = bucket.get(key) || { label, sortKey, rows: [] };
        cur.rows.push(entry);
        bucket.set(key, cur);
      });

      Array.from(bucket.entries())
        .sort(([, a], [, b]) => a.sortKey.localeCompare(b.sortKey, 'pt-BR'))
        .forEach(([key, entry]) => {
          const subs = summarize(entry.rows);
          groups.push({
            key,
            label: entry.label,
            headerSummary: `${entry.rows.length} entrega(s) • Valor: R$ ${formatCurrencyBR(
              subs.valorTotal
            )}`,
            subtotalLabel: `Subtotal — ${entry.label} (${entry.rows.length})`,
            rows: entry.rows.map(toRow),
            subtotals: subs,
          });
        });
    }

    // Region summary sheet (Aba 2)
    const regBucket = new Map<
      string,
      {
        regiao: string;
        total: number;
        prontas: number;
        emRota: number;
        entregues: number;
        valor: number;
        aReceber: number;
      }
    >();
    sortedDeliveries.forEach(r => {
      const cur = regBucket.get(r.regiao) || {
        regiao: r.regiao,
        total: 0,
        prontas: 0,
        emRota: 0,
        entregues: 0,
        valor: 0,
        aReceber: 0,
      };
      cur.total += 1;
      if (r.order.status === 'PRONTO') cur.prontas += 1;
      else if (r.order.status === 'EM_ROTA') cur.emRota += 1;
      else if (r.order.status === 'ENTREGUE') cur.entregues += 1;
      cur.valor = Number((cur.valor + r.order.valorTotal).toFixed(2));
      cur.aReceber = Number((cur.aReceber + r.remaining).toFixed(2));
      regBucket.set(r.regiao, cur);
    });

    const regEntries = Array.from(regBucket.values()).sort((a, b) =>
      a.regiao.localeCompare(b.regiao, 'pt-BR')
    );

    const summaryRows: TabularReportRow[] = regEntries.map(r => ({
      key: r.regiao,
      cells: {
        regiao: { text: r.regiao, tone: 'bold' },
        entregas: { text: String(r.total), numValue: r.total, tone: 'bold' },
        prontas: { text: String(r.prontas), numValue: r.prontas, tone: 'sky' },
        emRota: { text: String(r.emRota), numValue: r.emRota, tone: 'blue' },
        entregues: { text: String(r.entregues), numValue: r.entregues, tone: 'emerald' },
        valor: {
          text: `R$ ${formatCurrencyBR(r.valor)}`,
          numValue: r.valor,
          tone: 'bold',
        },
        aReceber: {
          text: `R$ ${formatCurrencyBR(r.aReceber)}`,
          numValue: r.aReceber,
          tone: r.aReceber > 0 ? 'rose' : 'emerald',
        },
      },
    }));

    const now = new Date();
    const generatedAtLabel = `${String(now.getDate()).padStart(2, '0')}/${String(
      now.getMonth() + 1
    ).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(
      2,
      '0'
    )}:${String(now.getMinutes()).padStart(2, '0')}`;

    const groupOpt = GROUP_OPTIONS.find(o => o.value === groupBy);
    const sortOpt = SORT_OPTIONS.find(o => o.value === sortBy);
    const periodText =
      !startDate && !endDate
        ? 'Todo o período'
        : startDate && endDate
        ? startDate === endDate
          ? formatDateBrShort(startDate)
          : `${formatDateBrShort(startDate)} até ${formatDateBrShort(endDate)}`
        : startDate
        ? `A partir de ${formatDateBrShort(startDate)}`
        : `Até ${formatDateBrShort(endDate)}`;

    const statusLabelMap = {
      TODOS: 'Todos os Status',
      SEM_ENTREGUES: 'Sem Entregues (Pronto / Em Rota)',
      PRONTO: 'Pronto',
      EM_ROTA: 'Em Rota',
      ENTREGUE: 'Entregue',
    };

    const groupPrefixMap: Record<EntregasReportGroupBy, string> = {
      lojaDataTurno: 'PROGRAMAÇÃO',
      loja: 'UNIDADE',
      dataTurno: 'TURNO',
      regiao: 'REGIÃO',
      status: 'STATUS',
      nenhum: '',
    };

    return {
      title: 'Relatório de Entregas',
      filePrefix: 'Beju_Caramelos_Relatorio_Entregas',
      sheetName: 'Relatorio_Entregas',
      mainTabLabel: 'Aba 1: Relatorio_Entregas',
      orientation,
      isGrouped: groupBy !== 'nenhum',
      groupLabel: groupOpt?.label || 'Loja → Data/Turno',
      groupHeaderPrefix: groupPrefixMap[groupBy],
      itemNounSingular: 'entrega',
      itemNounPlural: 'entregas',
      generatedAtLabel,
      rightMeta: `${sortedDeliveries.length} entrega(s) • Total: R$ ${formatCurrencyBR(
        grandTotals.valorTotal
      )} • Agrupado por: ${groupOpt?.label || 'Loja → Data/Turno'} • ${
        orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem'
      }`,
      filterParts: [
        { label: 'Período (Entrega)', value: periodText },
        { label: 'Status', value: statusLabelMap[statusFilter] },
        {
          label: 'Unidade',
          value: unitFilter === 'TODAS' ? 'Todas' : unitMap.get(unitFilter)?.nome || 'Unidade',
        },
        { label: 'Região', value: regionFilter === 'TODAS' ? 'Todas' : regionFilter },
        {
          label: 'Ordem',
          value: `${sortOpt?.label || 'Data Entrega'} (${
            sortDirection === 'asc' ? 'Crescente ↑' : 'Decrescente ↓'
          })`,
        },
        ...(scope === 'filtered' && searchTerm.trim()
          ? [{ label: 'Busca', value: `"${searchTerm.trim()}"` }]
          : []),
      ],
      selectedColumns: selectedColDefs,
      rows: allRows,
      groups,
      grandTotals,
      emptyMessage: 'Nenhuma entrega encontrada com os critérios selecionados.',
      includeSummaryInPdf,
      summarySheet: {
        sheetName: 'Resumo_Regioes',
        tabLabel: 'Aba 2: Resumo_Regioes',
        title: 'Resumo Consolidado por Bairro / Região',
        columns: [
          { key: 'regiao', label: 'Bairro / Região', align: 'left', kind: 'text', wch: 24 },
          {
            key: 'entregas',
            label: 'Entregas',
            align: 'center',
            kind: 'number',
            wch: 11,
            summable: true,
          },
          {
            key: 'prontas',
            label: 'Prontas',
            align: 'center',
            kind: 'number',
            wch: 11,
            summable: true,
          },
          {
            key: 'emRota',
            label: 'Em Rota',
            align: 'center',
            kind: 'number',
            wch: 11,
            summable: true,
          },
          {
            key: 'entregues',
            label: 'Entregues',
            align: 'center',
            kind: 'number',
            wch: 12,
            summable: true,
          },
          {
            key: 'valor',
            label: 'Valor Total (R$)',
            align: 'right',
            kind: 'currency',
            wch: 16,
            summable: true,
          },
          {
            key: 'aReceber',
            label: 'A Receber (R$)',
            align: 'right',
            kind: 'currency',
            wch: 16,
            summable: true,
          },
        ],
        rows: summaryRows,
        totalLabel: `TOTAL CONSOLIDADO (${summaryRows.length} região(ões))`,
        totals: {
          entregas: regEntries.reduce((s, r) => s + r.total, 0),
          prontas: regEntries.reduce((s, r) => s + r.prontas, 0),
          emRota: regEntries.reduce((s, r) => s + r.emRota, 0),
          entregues: regEntries.reduce((s, r) => s + r.entregues, 0),
          valor: grandTotals.valorTotal,
          aReceber: grandTotals.saldoAReceber,
        },
        emptyMessage: 'Nenhuma região encontrada nos critérios selecionados.',
      },
    };
  }, [
    isOpen,
    selectedColumns,
    sortedDeliveries,
    groupBy,
    sortBy,
    sortDirection,
    orientation,
    startDate,
    endDate,
    statusFilter,
    unitFilter,
    regionFilter,
    unitMap,
    scope,
    searchTerm,
    includeSummaryInPdf,
  ]);

  const hasClearableFilters = Boolean(
    startDate ||
      endDate ||
      statusFilter !== 'TODOS' ||
      unitFilter !== 'TODAS' ||
      regionFilter !== 'TODAS'
  );

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setStatusFilter('TODOS');
    setUnitFilter('TODAS');
    setRegionFilter('TODAS');
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
    const totalValor = sortedDeliveries.reduce((s, r) => s + r.order.valorTotal, 0);
    const totalAReceber = sortedDeliveries.reduce((s, r) => s + r.remaining, 0);
    const totalItens = sortedDeliveries.reduce((s, r) => s + r.qtdItens, 0);
    const distinctRegions = new Set(sortedDeliveries.map(r => r.regiao)).size;
    return [
      {
        label: 'Entregas',
        value: sortedDeliveries.length,
        subtext:
          groupBy !== 'nenhum' && reportData
            ? `${reportData.groups.length} grupo(s)`
            : undefined,
        tone: 'neutral',
      },
      {
        label: 'Valor Total',
        value: `R$ ${formatCurrencyBR(totalValor)}`,
        tone: 'emerald',
      },
      {
        label: 'A Receber',
        value: `R$ ${formatCurrencyBR(totalAReceber)}`,
        subtext: totalAReceber > 0 ? 'Cobrança pendente' : '100% quitado',
        tone: 'neutral',
        subtextTone: totalAReceber > 0 ? 'rose' : 'default',
      },
      {
        label: 'Regiões',
        value: distinctRegions,
        subtext: `${totalItens} item(ns)`,
        tone: 'emerald',
      },
    ];
  }, [sortedDeliveries, groupBy, reportData]);

  return (
    <ReportModalShell
      isOpen={isOpen}
      onClose={onClose}
      step={step}
      title="Relatório de Entregas"
      configSubtitle="Escolha formato, período de entrega, status, região, agrupamento, ordenação e colunas"
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
            iframeTitle="Prévia do Relatório de Entregas PDF"
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
            scopeLabel="Base de entregas"
            scopeSummary={
              searchTerm.trim() ? `Busca ativa: "${searchTerm.trim()}"` : undefined
            }
            scope={scope}
            filteredCount={filteredDeliveries.length}
            totalCount={allDeliveries.length}
            onScopeChange={setScope}
          >
            {/* Período de Entrega */}
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Período (Data da Entrega)</span>
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
                    De (Entrega)
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    aria-label="Data inicial de entrega"
                    className="w-full min-w-0 max-w-full h-9 bg-white border border-slate-300 rounded-lg px-2 sm:px-2.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    Até (Entrega)
                  </span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    aria-label="Data final de entrega"
                    className="w-full min-w-0 max-w-full h-9 bg-white border border-slate-300 rounded-lg px-2 sm:px-2.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {isInvalidDateRange && (
                <p className="text-[11px] font-semibold text-rose-600">
                  A data inicial de entrega não pode ser maior que a data final.
                </p>
              )}
            </div>

            {/* Status + Unidade + Região */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2.5 border-t border-slate-100">
              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Status
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por status de entrega"
                    value={statusFilter}
                    onChange={e =>
                      setStatusFilter(
                        e.target.value as
                          | 'TODOS'
                          | 'SEM_ENTREGUES'
                          | 'PRONTO'
                          | 'EM_ROTA'
                          | 'ENTREGUE'
                      )
                    }
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODOS">Todos os Status</option>
                    <option value="SEM_ENTREGUES">Sem Entregues (Pronto / Em Rota)</option>
                    <option value="PRONTO">Pronto</option>
                    <option value="EM_ROTA">Em Rota</option>
                    <option value="ENTREGUE">Entregue</option>
                  </select>
                  <ChevronDown
                    className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Unidade de Origem
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por unidade de origem"
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
                  Bairro / Região
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por bairro ou região"
                    value={regionFilter}
                    onChange={e => setRegionFilter(e.target.value)}
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas as Regiões</option>
                    {availableRegions.map(reg => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
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
            columns={ENTREGAS_REPORT_COLUMNS}
            defaultColumns={DEFAULT_COLUMNS}
            selectedColumns={selectedColumns}
            onSelectedColumnsChange={setSelectedColumns}
            optionalColumnsTitle="Colunas Adicionais (Contato, Pagamento e Detalhes)"
            extraOption={
              format === 'PDF' ? (
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSummaryInPdf}
                    onChange={e => setIncludeSummaryInPdf(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  <span>Incluir tabela de Resumo por Região ao final do PDF</span>
                </label>
              ) : undefined
            }
          />
        </div>
      )}
    </ReportModalShell>
  );
};
