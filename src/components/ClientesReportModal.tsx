import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
import { Customer, Order } from '../types';
import { normalizePhoneForWhatsApp } from '../services/whatsappAutomationService';
import { extractNeighborhoodFromAddress } from '../utils/orderRegion';
import { getOrderRemainingAmount } from '../utils/paymentStatus';
import {
  TabularCellTone,
  TabularReportColumnDef,
  TabularReportData,
  TabularReportGroup,
  TabularReportRow,
} from '../utils/tabularReportTypes';

export type ClientesReportColumnKey =
  | 'nome'
  | 'telefone'
  | 'regiao'
  | 'pedidosAbertos'
  | 'totalPedidos'
  | 'faturamentoTotal'
  | 'saldoAPagar'
  | 'situacao'
  | 'cep'
  | 'endereco'
  | 'detalheEntrega'
  | 'ticketMedio'
  | 'ultimoPedido'
  | 'proximaEntrega'
  | 'observacoes';

export type ClientesReportGroupBy = 'pendencia' | 'regiao' | 'inicial' | 'nenhum';
export type ClientesReportSortBy =
  | 'nome'
  | 'faturamento'
  | 'saldoAPagar'
  | 'abertos'
  | 'totalPedidos'
  | 'ultimoPedido';

interface ClientesReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allCustomers: Customer[];
  filteredCustomers: Customer[];
  orders: Order[];
  initialOpenOrdersFilter: 'TODOS' | 'COM_ABERTOS' | 'COM_SALDO' | 'SEM_ABERTOS' | 'RECORRENTES';
  initialGroupBy: 'PENDENCIA' | 'REGIAO' | 'INICIAL' | 'NENHUM';
  searchTerm: string;
}

const CLIENTES_REPORT_COLUMNS: Array<TabularReportColumnDef<ClientesReportColumnKey>> = [
  {
    key: 'nome',
    label: 'Nome do Cliente',
    shortLabel: 'Cliente',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 24,
    pdfMinWidthMm: 28,
    pdfMaxWidthMm: 62,
    excelWch: 28,
    excelMinWch: 18,
    excelMaxWch: 42,
    isFlexible: true,
  },
  {
    key: 'telefone',
    label: 'Telefone / WhatsApp',
    shortLabel: 'Telefone',
    isDefault: true,
    kind: 'text',
    align: 'center',
    pdfWeight: 14,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 28,
    excelWch: 18,
    excelMinWch: 14,
    excelMaxWch: 22,
  },
  {
    key: 'regiao',
    label: 'Bairro / Região',
    shortLabel: 'Região',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 16,
    pdfMinWidthMm: 20,
    pdfMaxWidthMm: 38,
    excelWch: 22,
    excelMinWch: 14,
    excelMaxWch: 30,
  },
  {
    key: 'pedidosAbertos',
    label: 'Pedidos em Aberto',
    shortLabel: 'Abertos',
    isDefault: true,
    kind: 'number',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 20,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 16,
    summable: true,
  },
  {
    key: 'totalPedidos',
    label: 'Total de Pedidos',
    shortLabel: 'Pedidos',
    isDefault: true,
    kind: 'number',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 20,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 16,
    summable: true,
  },
  {
    key: 'faturamentoTotal',
    label: 'Faturamento Total (R$)',
    shortLabel: 'Faturamento',
    isDefault: true,
    kind: 'currency',
    align: 'right',
    pdfWeight: 14,
    pdfMinWidthMm: 20,
    pdfMaxWidthMm: 30,
    excelWch: 16,
    excelMinWch: 14,
    excelMaxWch: 22,
    summable: true,
  },
  {
    key: 'saldoAPagar',
    label: 'Saldo a Pagar (R$)',
    shortLabel: 'Saldo a Pagar',
    isDefault: true,
    kind: 'currency',
    align: 'right',
    pdfWeight: 13,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 28,
    excelWch: 16,
    excelMinWch: 14,
    excelMaxWch: 22,
    summable: true,
  },
  {
    key: 'situacao',
    label: 'Perfil / Situação',
    shortLabel: 'Situação',
    isDefault: true,
    kind: 'badge',
    align: 'center',
    pdfWeight: 13,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 26,
    excelWch: 15,
    excelMinWch: 12,
    excelMaxWch: 20,
  },
  {
    key: 'cep',
    label: 'CEP',
    shortLabel: 'CEP',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 20,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 14,
  },
  {
    key: 'endereco',
    label: 'Endereço Completo',
    shortLabel: 'Endereço',
    isDefault: false,
    kind: 'text',
    align: 'left',
    pdfWeight: 26,
    pdfMinWidthMm: 30,
    pdfMaxWidthMm: 66,
    excelWch: 34,
    excelMinWch: 20,
    excelMaxWch: 52,
    isFlexible: true,
  },
  {
    key: 'detalheEntrega',
    label: 'Detalhe de Entrega',
    shortLabel: 'Detalhe Ent.',
    isDefault: false,
    kind: 'text',
    align: 'left',
    pdfWeight: 16,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 38,
    excelWch: 22,
    excelMinWch: 15,
    excelMaxWch: 34,
    isFlexible: true,
  },
  {
    key: 'ticketMedio',
    label: 'Ticket Médio (R$)',
    shortLabel: 'Ticket Médio',
    isDefault: false,
    kind: 'currency',
    align: 'right',
    pdfWeight: 12,
    pdfMinWidthMm: 17,
    pdfMaxWidthMm: 26,
    excelWch: 15,
    excelMinWch: 13,
    excelMaxWch: 20,
  },
  {
    key: 'ultimoPedido',
    label: 'Último Pedido',
    shortLabel: 'Últ. Pedido',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 24,
    excelWch: 14,
    excelMinWch: 12,
    excelMaxWch: 18,
  },
  {
    key: 'proximaEntrega',
    label: 'Próxima Entrega',
    shortLabel: 'Próx. Entrega',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 14,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 28,
    excelWch: 18,
    excelMinWch: 14,
    excelMaxWch: 24,
  },
  {
    key: 'observacoes',
    label: 'Observações',
    shortLabel: 'Observações',
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

const DEFAULT_COLUMNS: ClientesReportColumnKey[] = CLIENTES_REPORT_COLUMNS.filter(
  c => c.isDefault
).map(c => c.key);

const GROUP_OPTIONS: Array<ReportSelectOption<ClientesReportGroupBy>> = [
  { value: 'pendencia', label: 'Pendência (Com / Sem Abertos)' },
  { value: 'regiao', label: 'Bairro / Região' },
  { value: 'inicial', label: 'Letra Inicial (A-Z)' },
  { value: 'nenhum', label: 'Sem Agrupamento' },
];

const SORT_OPTIONS: Array<ReportSelectOption<ClientesReportSortBy>> = [
  { value: 'nome', label: 'Nome (A-Z)' },
  { value: 'faturamento', label: 'Faturamento Total' },
  { value: 'saldoAPagar', label: 'Saldo a Pagar' },
  { value: 'abertos', label: 'Pedidos em Aberto' },
  { value: 'totalPedidos', label: 'Total de Pedidos' },
  { value: 'ultimoPedido', label: 'Último Pedido' },
];

function mapScreenGroup(
  g: ClientesReportModalProps['initialGroupBy']
): ClientesReportGroupBy {
  switch (g) {
    case 'PENDENCIA':
      return 'pendencia';
    case 'REGIAO':
      return 'regiao';
    case 'INICIAL':
      return 'inicial';
    default:
      return 'nenhum';
  }
}

export const ClientesReportModal: React.FC<ClientesReportModalProps> = ({
  isOpen,
  onClose,
  allCustomers,
  filteredCustomers,
  orders,
  initialOpenOrdersFilter,
  initialGroupBy,
  searchTerm,
}) => {
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');
  const [format, setFormat] = useState<ReportFormat>('PDF');
  const [orientation, setOrientation] = useState<ReportOrientation>('landscape');
  const [profileFilter, setProfileFilter] = useState<
    'TODOS' | 'COM_ABERTOS' | 'COM_SALDO' | 'SEM_ABERTOS' | 'RECORRENTES'
  >('TODOS');
  const [regionFilter, setRegionFilter] = useState<string>('TODAS');
  const [addressFilter, setAddressFilter] = useState<'TODOS' | 'COM_ENDERECO' | 'SEM_ENDERECO'>(
    'TODOS'
  );
  const [groupBy, setGroupBy] = useState<ClientesReportGroupBy>('pendencia');
  const [sortBy, setSortBy] = useState<ClientesReportSortBy>('nome');
  const [sortDirection, setSortDirection] = useState<ReportSortDirection>('asc');
  const [selectedColumns, setSelectedColumns] =
    useState<ClientesReportColumnKey[]>(DEFAULT_COLUMNS);
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

  const hasActiveFilterDiff = filteredCustomers.length !== allCustomers.length;

  useEffect(() => {
    if (!isOpen) {
      clearPreviewArtifacts();
      setStep('config');
      return;
    }
    setScope(hasActiveFilterDiff ? 'filtered' : 'all');
    setProfileFilter(initialOpenOrdersFilter);
    setRegionFilter('TODAS');
    setAddressFilter('TODOS');
    setGroupBy(mapScreenGroup(initialGroupBy));
    setStep('config');
  }, [
    isOpen,
    hasActiveFilterDiff,
    initialOpenOrdersFilter,
    initialGroupBy,
    clearPreviewArtifacts,
  ]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  // Compute order linkage stats across all customers (matching ClientesScreen logic)
  const customerStatsMap = useMemo(() => {
    const openByNormTel = new Map<string, Order[]>();
    const openByRawTel = new Map<string, Order[]>();
    const openByName = new Map<string, Order[]>();
    const allByNormTel = new Map<string, Order[]>();
    const allByRawTel = new Map<string, Order[]>();
    const allByName = new Map<string, Order[]>();

    orders.forEach(o => {
      if (o.status === 'CANCELADO') return;
      const normTel = normalizePhoneForWhatsApp(o.clienteTelefone || '');
      const rawTel = (o.clienteTelefone || '').trim();
      const nameKey = (o.clienteNome || '').trim().toLowerCase();

      if (normTel) {
        const list = allByNormTel.get(normTel) || [];
        list.push(o);
        allByNormTel.set(normTel, list);
      }
      if (rawTel) {
        const list = allByRawTel.get(rawTel) || [];
        list.push(o);
        allByRawTel.set(rawTel, list);
      }
      if (nameKey) {
        const list = allByName.get(nameKey) || [];
        list.push(o);
        allByName.set(nameKey, list);
      }

      if (o.status !== 'ENTREGUE') {
        if (normTel) {
          const list = openByNormTel.get(normTel) || [];
          list.push(o);
          openByNormTel.set(normTel, list);
        }
        if (rawTel) {
          const list = openByRawTel.get(rawTel) || [];
          list.push(o);
          openByRawTel.set(rawTel, list);
        }
        if (nameKey) {
          const list = openByName.get(nameKey) || [];
          list.push(o);
          openByName.set(nameKey, list);
        }
      }
    });

    const map = new Map<
      string,
      {
        openOrdersCount: number;
        totalOrdersCount: number;
        totalRevenue: number;
        pendingBalance: number;
        avgTicket: number;
        lastOrderTs: number;
        nextDeliveryTs: number;
      }
    >();

    allCustomers.forEach(c => {
      const normTel = normalizePhoneForWhatsApp(c.telefone || '');
      const rawTel = (c.telefone || '').trim();
      const nameKey = (c.nome || '').trim().toLowerCase();

      const matchedOpen =
        (normTel && openByNormTel.get(normTel)) ||
        (rawTel && openByRawTel.get(rawTel)) ||
        (nameKey && openByName.get(nameKey)) ||
        [];
      const matchedAll =
        (normTel && allByNormTel.get(normTel)) ||
        (rawTel && allByRawTel.get(rawTel)) ||
        (nameKey && allByName.get(nameKey)) ||
        [];

      let totalRevenue = 0;
      let pendingBalance = 0;
      let lastOrderTs = 0;
      matchedAll.forEach(o => {
        totalRevenue += Number(o.valorTotal) || 0;
        pendingBalance += getOrderRemainingAmount(o);
        const ts = new Date(o.dataPedido || o.dataHoraEntrega).getTime();
        if (Number.isFinite(ts) && ts > lastOrderTs) lastOrderTs = ts;
      });

      let nextDeliveryTs = Number.MAX_SAFE_INTEGER;
      matchedOpen.forEach(o => {
        const ts = new Date(o.dataHoraEntrega || o.dataPedido).getTime();
        if (Number.isFinite(ts) && ts < nextDeliveryTs) nextDeliveryTs = ts;
      });

      map.set(c.id, {
        openOrdersCount: matchedOpen.length,
        totalOrdersCount: matchedAll.length,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        pendingBalance: Number(pendingBalance.toFixed(2)),
        avgTicket:
          matchedAll.length > 0
            ? Number((totalRevenue / matchedAll.length).toFixed(2))
            : 0,
        lastOrderTs,
        nextDeliveryTs:
          nextDeliveryTs === Number.MAX_SAFE_INTEGER ? 0 : nextDeliveryTs,
      });
    });

    return map;
  }, [allCustomers, orders]);

  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    allCustomers.forEach(c => {
      set.add(extractNeighborhoodFromAddress(c.endereco) || 'Região Não Informada');
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allCustomers]);

  const enrichedCustomers = useMemo(() => {
    const base =
      scope === 'filtered' && hasActiveFilterDiff ? filteredCustomers : allCustomers;

    return base
      .filter(c => {
        const stats = customerStatsMap.get(c.id) || {
          openOrdersCount: 0,
          totalOrdersCount: 0,
          totalRevenue: 0,
          pendingBalance: 0,
          avgTicket: 0,
          lastOrderTs: 0,
          nextDeliveryTs: 0,
        };
        if (profileFilter === 'COM_ABERTOS' && stats.openOrdersCount === 0) return false;
        if (profileFilter === 'COM_SALDO' && stats.pendingBalance <= 0) return false;
        if (profileFilter === 'SEM_ABERTOS' && stats.openOrdersCount > 0) return false;
        if (profileFilter === 'RECORRENTES' && stats.totalOrdersCount < 2) return false;

        const reg =
          extractNeighborhoodFromAddress(c.endereco) || 'Região Não Informada';
        if (regionFilter !== 'TODAS' && reg !== regionFilter) return false;

        const hasAddr = Boolean(c.endereco && c.endereco.trim());
        if (addressFilter === 'COM_ENDERECO' && !hasAddr) return false;
        if (addressFilter === 'SEM_ENDERECO' && hasAddr) return false;

        return true;
      })
      .map(customer => {
        const stats = customerStatsMap.get(customer.id) || {
          openOrdersCount: 0,
          totalOrdersCount: 0,
          totalRevenue: 0,
          pendingBalance: 0,
          avgTicket: 0,
          lastOrderTs: 0,
          nextDeliveryTs: 0,
        };
        const regiao =
          extractNeighborhoodFromAddress(customer.endereco) || 'Região Não Informada';
        const situacaoLabel =
          stats.openOrdersCount > 0
            ? 'Em Aberto'
            : stats.totalOrdersCount >= 2
            ? 'Recorrente'
            : 'Regular';
        return {
          customer,
          regiao,
          situacaoLabel,
          ...stats,
        };
      });
  }, [
    scope,
    hasActiveFilterDiff,
    filteredCustomers,
    allCustomers,
    customerStatsMap,
    profileFilter,
    regionFilter,
    addressFilter,
  ]);

  const sortedCustomers = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...enrichedCustomers].sort((a, b) => {
      if (sortBy === 'faturamento') {
        if (a.totalRevenue !== b.totalRevenue) {
          return (a.totalRevenue - b.totalRevenue) * dir;
        }
      } else if (sortBy === 'saldoAPagar') {
        if (a.pendingBalance !== b.pendingBalance) {
          return (a.pendingBalance - b.pendingBalance) * dir;
        }
      } else if (sortBy === 'abertos') {
        if (a.openOrdersCount !== b.openOrdersCount) {
          return (a.openOrdersCount - b.openOrdersCount) * dir;
        }
      } else if (sortBy === 'totalPedidos') {
        if (a.totalOrdersCount !== b.totalOrdersCount) {
          return (a.totalOrdersCount - b.totalOrdersCount) * dir;
        }
      } else if (sortBy === 'ultimoPedido') {
        if (a.lastOrderTs !== b.lastOrderTs) {
          return (a.lastOrderTs - b.lastOrderTs) * dir;
        }
      }
      return a.customer.nome.localeCompare(b.customer.nome, 'pt-BR') * dir;
    });
  }, [enrichedCustomers, sortBy, sortDirection]);

  const reportData: TabularReportData<ClientesReportColumnKey> | null = useMemo(() => {
    if (!isOpen) return null;

    const selectedColDefs = selectedColumns
      .map(key => CLIENTES_REPORT_COLUMNS.find(c => c.key === key))
      .filter((c): c is TabularReportColumnDef<ClientesReportColumnKey> => Boolean(c));

    const toRow = (
      entry: (typeof sortedCustomers)[number]
    ): TabularReportRow<ClientesReportColumnKey> => {
      const sitTone: TabularCellTone =
        entry.openOrdersCount > 0
          ? 'amber'
          : entry.totalOrdersCount >= 2
          ? 'emerald'
          : 'slate';

      return {
        key: entry.customer.id,
        rowTone:
          entry.pendingBalance > 0
            ? 'rose'
            : entry.openOrdersCount > 0
            ? 'amber'
            : 'default',
        cells: {
          nome: { text: entry.customer.nome, tone: 'bold' },
          telefone: { text: entry.customer.telefone || '—', tone: 'slate' },
          regiao: { text: entry.regiao, tone: 'default' },
          pedidosAbertos: {
            text: String(entry.openOrdersCount),
            numValue: entry.openOrdersCount,
            tone: entry.openOrdersCount > 0 ? 'amber' : 'slate',
          },
          totalPedidos: {
            text: String(entry.totalOrdersCount),
            numValue: entry.totalOrdersCount,
            tone: entry.totalOrdersCount > 0 ? 'bold' : 'slate',
          },
          faturamentoTotal: {
            text: `R$ ${formatCurrencyBR(entry.totalRevenue)}`,
            numValue: entry.totalRevenue,
            tone: entry.totalRevenue > 0 ? 'emerald' : 'slate',
          },
          saldoAPagar: {
            text: `R$ ${formatCurrencyBR(entry.pendingBalance)}`,
            numValue: entry.pendingBalance,
            tone: entry.pendingBalance > 0 ? 'rose' : 'slate',
          },
          situacao: {
            text: entry.situacaoLabel,
            tone: sitTone,
            badge: true,
          },
          cep: { text: entry.customer.cep || '—', tone: 'slate' },
          endereco: { text: entry.customer.endereco || '—', tone: 'default' },
          detalheEntrega: { text: entry.customer.detalheEntrega || '—', tone: 'slate' },
          ticketMedio: {
            text: `R$ ${formatCurrencyBR(entry.avgTicket)}`,
            numValue: entry.avgTicket,
            tone: 'slate',
          },
          ultimoPedido: {
            text:
              entry.lastOrderTs > 0
                ? new Date(entry.lastOrderTs).toLocaleDateString('pt-BR')
                : '—',
            tone: 'slate',
          },
          proximaEntrega: {
            text:
              entry.nextDeliveryTs > 0
                ? new Date(entry.nextDeliveryTs).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—',
            tone: entry.nextDeliveryTs > 0 ? 'blue' : 'slate',
          },
          observacoes: { text: entry.customer.observacoes || '—', tone: 'slate' },
        },
      };
    };

    const summarize = (entries: typeof sortedCustomers) => ({
      pedidosAbertos: entries.reduce((s, r) => s + r.openOrdersCount, 0),
      totalPedidos: entries.reduce((s, r) => s + r.totalOrdersCount, 0),
      faturamentoTotal: Number(
        entries.reduce((s, r) => s + r.totalRevenue, 0).toFixed(2)
      ),
      saldoAPagar: Number(
        entries.reduce((s, r) => s + r.pendingBalance, 0).toFixed(2)
      ),
    });

    const allRows = sortedCustomers.map(toRow);
    const grandTotals = summarize(sortedCustomers);

    const groups: Array<TabularReportGroup<ClientesReportColumnKey>> = [];
    if (groupBy === 'nenhum') {
      groups.push({
        key: 'all',
        label: 'Todos os Clientes',
        rows: allRows,
        subtotals: grandTotals,
      });
    } else {
      const bucket = new Map<string, typeof sortedCustomers>();
      sortedCustomers.forEach(entry => {
        const key =
          groupBy === 'pendencia'
            ? entry.openOrdersCount > 0
              ? 'Com Pedidos em Aberto'
              : 'Sem Pedidos em Aberto'
            : groupBy === 'regiao'
            ? entry.regiao
            : (entry.customer.nome.trim().charAt(0) || '#').toUpperCase();
        const arr = bucket.get(key) || [];
        arr.push(entry);
        bucket.set(key, arr);
      });
      Array.from(bucket.entries())
        .sort(([ka], [kb]) => ka.localeCompare(kb, 'pt-BR'))
        .forEach(([label, entries]) => {
          const subs = summarize(entries);
          groups.push({
            key: label,
            label,
            headerSummary: `${entries.length} cliente(s) • Faturamento: R$ ${formatCurrencyBR(
              subs.faturamentoTotal
            )}${
              subs.saldoAPagar > 0
                ? ` • Saldo a Pagar: R$ ${formatCurrencyBR(subs.saldoAPagar)}`
                : ''
            }`,
            subtotalLabel: `Subtotal — ${label} (${entries.length} cliente(s))`,
            rows: entries.map(toRow),
            subtotals: subs,
          });
        });
    }

    // Region summary sheet (Aba 2)
    const regBucket = new Map<
      string,
      {
        regiao: string;
        clientes: number;
        comAbertos: number;
        recorrentes: number;
        totalPedidos: number;
        faturamento: number;
        saldoAPagar: number;
      }
    >();
    sortedCustomers.forEach(r => {
      const cur = regBucket.get(r.regiao) || {
        regiao: r.regiao,
        clientes: 0,
        comAbertos: 0,
        recorrentes: 0,
        totalPedidos: 0,
        faturamento: 0,
        saldoAPagar: 0,
      };
      cur.clientes += 1;
      if (r.openOrdersCount > 0) cur.comAbertos += 1;
      if (r.totalOrdersCount >= 2) cur.recorrentes += 1;
      cur.totalPedidos += r.totalOrdersCount;
      cur.faturamento = Number((cur.faturamento + r.totalRevenue).toFixed(2));
      cur.saldoAPagar = Number((cur.saldoAPagar + r.pendingBalance).toFixed(2));
      regBucket.set(r.regiao, cur);
    });

    const regEntries = Array.from(regBucket.values()).sort(
      (a, b) => b.faturamento - a.faturamento || a.regiao.localeCompare(b.regiao, 'pt-BR')
    );

    const summaryRows: TabularReportRow[] = regEntries.map(r => ({
      key: r.regiao,
      cells: {
        regiao: { text: r.regiao, tone: 'bold' },
        clientes: { text: String(r.clientes), numValue: r.clientes, tone: 'bold' },
        comAbertos: { text: String(r.comAbertos), numValue: r.comAbertos, tone: 'amber' },
        recorrentes: {
          text: String(r.recorrentes),
          numValue: r.recorrentes,
          tone: 'emerald',
        },
        totalPedidos: {
          text: String(r.totalPedidos),
          numValue: r.totalPedidos,
          tone: 'slate',
        },
        faturamento: {
          text: `R$ ${formatCurrencyBR(r.faturamento)}`,
          numValue: r.faturamento,
          tone: 'emerald',
        },
        saldoAPagar: {
          text: `R$ ${formatCurrencyBR(r.saldoAPagar)}`,
          numValue: r.saldoAPagar,
          tone: r.saldoAPagar > 0 ? 'rose' : 'slate',
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
    const profileLabelMap = {
      TODOS: 'Todos',
      COM_ABERTOS: 'Com Pedidos Abertos',
      COM_SALDO: 'Com Saldo a Pagar',
      SEM_ABERTOS: 'Sem Pedidos Abertos',
      RECORRENTES: 'Recorrentes (2+ pedidos)',
    };
    const addressLabelMap = {
      TODOS: 'Todos',
      COM_ENDERECO: 'Com Endereço',
      SEM_ENDERECO: 'Sem Endereço',
    };

    const groupPrefixMap: Record<ClientesReportGroupBy, string> = {
      pendencia: 'SITUAÇÃO',
      regiao: 'REGIÃO',
      inicial: 'LETRA',
      nenhum: '',
    };

    return {
      title: 'Relatório de Clientes',
      filePrefix: 'Beju_Caramelos_Relatorio_Clientes',
      sheetName: 'Relatorio_Clientes',
      mainTabLabel: 'Aba 1: Relatorio_Clientes',
      orientation,
      isGrouped: groupBy !== 'nenhum',
      groupLabel: groupOpt?.label || 'Pendência',
      groupHeaderPrefix: groupPrefixMap[groupBy],
      itemNounSingular: 'cliente',
      itemNounPlural: 'clientes',
      generatedAtLabel,
      rightMeta: `${sortedCustomers.length} cliente(s) • Faturamento: R$ ${formatCurrencyBR(
        grandTotals.faturamentoTotal
      )} • Saldo a Pagar: R$ ${formatCurrencyBR(
        grandTotals.saldoAPagar
      )} • Agrupado por: ${groupOpt?.label || 'Pendência'} • ${
        orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem'
      }`,
      filterParts: [
        { label: 'Perfil', value: profileLabelMap[profileFilter] },
        { label: 'Região', value: regionFilter === 'TODAS' ? 'Todas' : regionFilter },
        { label: 'Endereço', value: addressLabelMap[addressFilter] },
        {
          label: 'Ordem',
          value: `${sortOpt?.label || 'Nome'} (${
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
      emptyMessage: 'Nenhum cliente encontrado com os critérios selecionados.',
      includeSummaryInPdf,
      summarySheet: {
        sheetName: 'Resumo_Regioes',
        tabLabel: 'Aba 2: Resumo_Regioes',
        title: 'Resumo Consolidado por Bairro / Região',
        columns: [
          { key: 'regiao', label: 'Bairro / Região', align: 'left', kind: 'text', wch: 24 },
          {
            key: 'clientes',
            label: 'Clientes',
            align: 'center',
            kind: 'number',
            wch: 11,
            summable: true,
          },
          {
            key: 'comAbertos',
            label: 'Com Abertos',
            align: 'center',
            kind: 'number',
            wch: 13,
            summable: true,
          },
          {
            key: 'recorrentes',
            label: 'Recorrentes',
            align: 'center',
            kind: 'number',
            wch: 13,
            summable: true,
          },
          {
            key: 'totalPedidos',
            label: 'Total Pedidos',
            align: 'center',
            kind: 'number',
            wch: 14,
            summable: true,
          },
          {
            key: 'faturamento',
            label: 'Faturamento Total (R$)',
            align: 'right',
            kind: 'currency',
            wch: 20,
            summable: true,
          },
          {
            key: 'saldoAPagar',
            label: 'Saldo a Pagar (R$)',
            align: 'right',
            kind: 'currency',
            wch: 18,
            summable: true,
          },
        ],
        rows: summaryRows,
        totalLabel: `TOTAL CONSOLIDADO (${summaryRows.length} região(ões))`,
        totals: {
          clientes: sortedCustomers.length,
          comAbertos: regEntries.reduce((s, r) => s + r.comAbertos, 0),
          recorrentes: regEntries.reduce((s, r) => s + r.recorrentes, 0),
          totalPedidos: grandTotals.totalPedidos,
          faturamento: grandTotals.faturamentoTotal,
          saldoAPagar: grandTotals.saldoAPagar,
        },
        emptyMessage: 'Nenhuma região encontrada nos critérios selecionados.',
      },
    };
  }, [
    isOpen,
    selectedColumns,
    sortedCustomers,
    groupBy,
    sortBy,
    sortDirection,
    orientation,
    profileFilter,
    regionFilter,
    addressFilter,
    scope,
    searchTerm,
    includeSummaryInPdf,
  ]);

  const hasClearableFilters = Boolean(
    profileFilter !== 'TODOS' || regionFilter !== 'TODAS' || addressFilter !== 'TODOS'
  );

  const handleClearFilters = () => {
    setProfileFilter('TODOS');
    setRegionFilter('TODAS');
    setAddressFilter('TODOS');
  };

  const handleOpenPreview = async () => {
    if (!reportData || selectedColumns.length === 0 || exporting) return;
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
    const withOpen = sortedCustomers.filter(c => c.openOrdersCount > 0).length;
    const withBalance = sortedCustomers.filter(c => c.pendingBalance > 0).length;
    const totalPendingBalance = sortedCustomers.reduce(
      (s, c) => s + c.pendingBalance,
      0
    );
    const totalRevenue = sortedCustomers.reduce((s, c) => s + c.totalRevenue, 0);
    return [
      {
        label: 'Clientes',
        value: sortedCustomers.length,
        subtext:
          groupBy !== 'nenhum' && reportData
            ? `${reportData.groups.length} grupo(s)`
            : undefined,
        tone: 'neutral',
      },
      {
        label: 'Com Abertos',
        value: withOpen,
        subtext: `${sortedCustomers.reduce((s, c) => s + c.openOrdersCount, 0)} pedido(s)`,
        tone: 'emerald',
      },
      {
        label: 'Saldo a Pagar',
        value: `R$ ${formatCurrencyBR(totalPendingBalance)}`,
        subtext: `${withBalance} cliente(s)`,
        tone: 'neutral',
        subtextTone: withBalance > 0 ? 'rose' : 'default',
      },
      {
        label: 'Faturamento Total',
        value: `R$ ${formatCurrencyBR(totalRevenue)}`,
        tone: 'emerald',
      },
    ];
  }, [sortedCustomers, groupBy, reportData]);

  return (
    <ReportModalShell
      isOpen={isOpen}
      onClose={onClose}
      step={step}
      title="Relatório de Clientes"
      configSubtitle="Escolha formato, perfil, região, agrupamento, ordenação e colunas"
      format={format}
      orientation={orientation}
      busy={exporting}
      canPreview={selectedColumns.length > 0}
      kpis={kpis}
      onOpenPreview={() => void handleOpenPreview()}
      onBackToConfig={handleBackToConfig}
      onConfirmDownload={() => void handleConfirmDownload()}
    >
      {step === 'preview' && reportData ? (
        format === 'PDF' && pdfPreviewUrl ? (
          <ReportPdfPreviewFrame
            pdfUrl={pdfPreviewUrl}
            iframeTitle="Prévia do Relatório de Clientes PDF"
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
            scopeLabel="Base de clientes"
            scopeSummary={
              searchTerm.trim() ? `Busca ativa: "${searchTerm.trim()}"` : undefined
            }
            scope={scope}
            filteredCount={filteredCustomers.length}
            totalCount={allCustomers.length}
            onScopeChange={setScope}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Perfil / Situação
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por perfil de cliente"
                    value={profileFilter}
                    onChange={e =>
                      setProfileFilter(
                        e.target.value as
                          | 'TODOS'
                          | 'COM_ABERTOS'
                          | 'COM_SALDO'
                          | 'SEM_ABERTOS'
                          | 'RECORRENTES'
                      )
                    }
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODOS">Todos os Clientes</option>
                    <option value="COM_ABERTOS">Com Pedidos Abertos</option>
                    <option value="COM_SALDO">Com Saldo a Pagar</option>
                    <option value="SEM_ABERTOS">Sem Pedidos Abertos</option>
                    <option value="RECORRENTES">Recorrentes (2+ pedidos)</option>
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

              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Endereço
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por endereço cadastrado"
                    value={addressFilter}
                    onChange={e =>
                      setAddressFilter(
                        e.target.value as 'TODOS' | 'COM_ENDERECO' | 'SEM_ENDERECO'
                      )
                    }
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODOS">Todos</option>
                    <option value="COM_ENDERECO">Com Endereço</option>
                    <option value="SEM_ENDERECO">Sem Endereço</option>
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
            columns={CLIENTES_REPORT_COLUMNS}
            defaultColumns={DEFAULT_COLUMNS}
            selectedColumns={selectedColumns}
            onSelectedColumnsChange={setSelectedColumns}
            optionalColumnsTitle="Colunas Adicionais (Endereço, Ticket e Histórico)"
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
