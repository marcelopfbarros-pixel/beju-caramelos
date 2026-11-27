import { Order, Product, ProductionShift, ProductionStatus } from '../types';
import { isReplenishmentOrder } from './orderStatusStyles';

export interface ConsolidatedProductionItem {
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

export type ProducaoReportFormat = 'PDF' | 'XLSX';

export type ProducaoReportOrientation = 'portrait' | 'landscape';

export type ProducaoReportGroupBy =
  | 'turnoData'
  | 'data'
  | 'produto'
  | 'categoria'
  | 'lojaDestino'
  | 'estagio'
  | 'nenhum';

export type ProducaoReportSortBy =
  | 'dataTurno'
  | 'produto'
  | 'categoria'
  | 'quantidade'
  | 'estagio';

export type ProducaoReportSortDirection = 'asc' | 'desc';

export type ProducaoReportColumnKey =
  | 'dataTurno'
  | 'produtoSku'
  | 'categoria'
  | 'quantidade'
  | 'unidadeMedida'
  | 'lojasDestino'
  | 'estagio'
  | 'sku'
  | 'pedidosOrigem'
  | 'qtdPedidos'
  | 'tempoPreparoMin'
  | 'origem';

export interface ProducaoReportConfig {
  format: ProducaoReportFormat;
  orientation: ProducaoReportOrientation;
  columns: ProducaoReportColumnKey[];
  groupBy: ProducaoReportGroupBy;
  sortBy: ProducaoReportSortBy;
  sortDirection: ProducaoReportSortDirection;
  startDate?: string;
  endDate?: string;
  shifts: ProductionShift[];
  stages: ProductionStatus[];
  categoryFilter: string;
  destinationFilter: string;
  includeSummaryInPdf: boolean;
}

export interface ProducaoReportColumnDef {
  key: ProducaoReportColumnKey;
  label: string;
  shortLabel: string;
  isDefault: boolean;
  kind: 'text' | 'number' | 'badge';
  align: 'left' | 'center' | 'right';
  pdfWeight: number;
  pdfMinWidthMm: number;
  pdfMaxWidthMm: number;
  excelWch: number;
  excelMinWch: number;
  excelMaxWch: number;
  isFlexible?: boolean;
  summable?: boolean;
}

export const PRODUCAO_SHIFT_LABELS: Record<ProductionShift, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  NOITE: 'Noite',
};

export const PRODUCAO_SHIFT_ORDER: Record<ProductionShift, number> = {
  MANHA: 1,
  TARDE: 2,
  NOITE: 3,
};

export const PRODUCAO_STAGE_LABELS: Record<ProductionStatus, string> = {
  PLANEJADA: 'Planejada',
  EM_PREPARO: 'Em Preparo',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

export const PRODUCAO_STAGE_ORDER: Record<ProductionStatus, number> = {
  PLANEJADA: 1,
  EM_PREPARO: 2,
  CONCLUIDA: 3,
  CANCELADA: 4,
};

export const DEFAULT_PRODUCAO_REPORT_COLUMNS: ProducaoReportColumnKey[] = [
  'dataTurno',
  'produtoSku',
  'categoria',
  'quantidade',
  'unidadeMedida',
  'lojasDestino',
  'estagio',
];

export const PRODUCAO_REPORT_COLUMNS: ProducaoReportColumnDef[] = [
  {
    key: 'dataTurno',
    label: 'Data / Turno',
    shortLabel: 'Data / Turno',
    isDefault: true,
    kind: 'text',
    align: 'center',
    pdfWeight: 14,
    pdfMinWidthMm: 20,
    pdfMaxWidthMm: 30,
    excelWch: 18,
    excelMinWch: 15,
    excelMaxWch: 22,
  },
  {
    key: 'produtoSku',
    label: 'Produto & SKU',
    shortLabel: 'Produto & SKU',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 28,
    pdfMinWidthMm: 26,
    pdfMaxWidthMm: 68,
    excelWch: 34,
    excelMinWch: 20,
    excelMaxWch: 46,
    isFlexible: true,
  },
  {
    key: 'categoria',
    label: 'Categoria',
    shortLabel: 'Categoria',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 14,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 34,
    excelWch: 18,
    excelMinWch: 13,
    excelMaxWch: 24,
  },
  {
    key: 'quantidade',
    label: 'Quantidade',
    shortLabel: 'Qtd.',
    isDefault: true,
    kind: 'number',
    align: 'center',
    pdfWeight: 8,
    pdfMinWidthMm: 11,
    pdfMaxWidthMm: 18,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 15,
    summable: true,
  },
  {
    key: 'unidadeMedida',
    label: 'Unidade Medida',
    shortLabel: 'Unid.',
    isDefault: true,
    kind: 'text',
    align: 'center',
    pdfWeight: 6,
    pdfMinWidthMm: 9,
    pdfMaxWidthMm: 14,
    excelWch: 9,
    excelMinWch: 7,
    excelMaxWch: 12,
  },
  {
    key: 'lojasDestino',
    label: 'Lojas Destino',
    shortLabel: 'Destino',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 22,
    pdfMinWidthMm: 20,
    pdfMaxWidthMm: 52,
    excelWch: 26,
    excelMinWch: 16,
    excelMaxWch: 38,
    isFlexible: true,
  },
  {
    key: 'estagio',
    label: 'Estágio Cozinha',
    shortLabel: 'Estágio',
    isDefault: true,
    kind: 'badge',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 26,
    excelWch: 15,
    excelMinWch: 13,
    excelMaxWch: 19,
  },
  {
    key: 'sku',
    label: 'SKU',
    shortLabel: 'SKU',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 9,
    pdfMinWidthMm: 12,
    pdfMaxWidthMm: 20,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 16,
  },
  {
    key: 'pedidosOrigem',
    label: 'Pedidos Origem',
    shortLabel: 'Pedidos',
    isDefault: false,
    kind: 'text',
    align: 'left',
    pdfWeight: 22,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 54,
    excelWch: 24,
    excelMinWch: 14,
    excelMaxWch: 36,
    isFlexible: true,
  },
  {
    key: 'qtdPedidos',
    label: 'Qtd. Pedidos',
    shortLabel: 'Ped.',
    isDefault: false,
    kind: 'number',
    align: 'center',
    pdfWeight: 7,
    pdfMinWidthMm: 9,
    pdfMaxWidthMm: 15,
    excelWch: 11,
    excelMinWch: 9,
    excelMaxWch: 14,
    summable: true,
  },
  {
    key: 'tempoPreparoMin',
    label: 'Tempo Prep. (min)',
    shortLabel: 'Prep. (min)',
    isDefault: false,
    kind: 'number',
    align: 'center',
    pdfWeight: 8,
    pdfMinWidthMm: 11,
    pdfMaxWidthMm: 18,
    excelWch: 13,
    excelMinWch: 11,
    excelMaxWch: 16,
  },
  {
    key: 'origem',
    label: 'Origem da Demanda',
    shortLabel: 'Origem',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 15,
    pdfMaxWidthMm: 26,
    excelWch: 16,
    excelMinWch: 13,
    excelMaxWch: 22,
  },
];

export const PRODUCAO_REPORT_GROUP_OPTIONS: Array<{
  value: ProducaoReportGroupBy;
  label: string;
}> = [
  { value: 'turnoData', label: 'Data e Turno' },
  { value: 'data', label: 'Data de Produção' },
  { value: 'produto', label: 'Produto' },
  { value: 'categoria', label: 'Categoria' },
  { value: 'lojaDestino', label: 'Loja Destino' },
  { value: 'estagio', label: 'Estágio Cozinha' },
  { value: 'nenhum', label: 'Sem Agrupamento' },
];

export const PRODUCAO_REPORT_SORT_OPTIONS: Array<{
  value: ProducaoReportSortBy;
  label: string;
}> = [
  { value: 'dataTurno', label: 'Data e Turno' },
  { value: 'produto', label: 'Produto (A–Z)' },
  { value: 'categoria', label: 'Categoria (A–Z)' },
  { value: 'quantidade', label: 'Quantidade Consolidada' },
  { value: 'estagio', label: 'Estágio Cozinha' },
];

const GROUP_HEADER_PREFIXES: Record<ProducaoReportGroupBy, string> = {
  turnoData: 'TURNO / DATA',
  data: 'DATA DE PRODUÇÃO',
  produto: 'PRODUTO',
  categoria: 'CATEGORIA',
  lojaDestino: 'DESTINO',
  estagio: 'ESTÁGIO COZINHA',
  nenhum: '',
};

export interface ProducaoReportRow {
  key: string;
  dataProducao: string;
  dataLabel: string;
  turno: ProductionShift;
  turnoLabel: string;
  produtoId: string;
  sku: string;
  descricao: string;
  produtoSkuText: string;
  categoriaNome: string;
  unidadeMedida: string;
  quantidadeTotal: number;
  lojasDestino: string[];
  lojasDestinoText: string;
  pedidosNumeros: string;
  pedidosCount: number;
  tempoPreparoMin: number | null;
  status: ProductionStatus;
  statusLabel: string;
  isReplenishment: boolean;
  isManual: boolean;
  origemLabel: string;
}

export interface ProducaoReportGroup {
  key: string;
  label: string;
  rows: ProducaoReportRow[];
  totalLots: number;
  totalQuantity: number;
  activeQuantity: number;
  totalOrdersCount: number;
}

export interface ProducaoReportProductSummaryRow {
  produtoId: string;
  sku: string;
  descricao: string;
  categoriaNome: string;
  unidadeMedida: string;
  lotsCount: number;
  totalQuantidade: number;
  destinosText: string;
}

export interface ProducaoReportData {
  config: ProducaoReportConfig;
  selectedColumns: ProducaoReportColumnDef[];
  rows: ProducaoReportRow[];
  groups: ProducaoReportGroup[];
  groupLabel: string;
  groupHeaderPrefix: string;
  periodLabel: string;
  shiftsLabel: string;
  stagesLabel: string;
  categoryLabel: string;
  destinationLabel: string;
  scopeLabel: string;
  searchTerm: string;
  sortLabel: string;
  generatedAtLabel: string;
  productSummary: ProducaoReportProductSummaryRow[];
  totalLots: number;
  activeLots: number;
  canceledLots: number;
  totalQuantity: number;
  activeQuantity: number;
  totalOrdersCount: number;
  distinctProductsCount: number;
  distinctDaysCount: number;
  distinctDestinationsCount: number;
}

function formatDateBrFromYmd(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd || '—';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatPeriodLabel(startDate?: string, endDate?: string): string {
  if (startDate && endDate) {
    if (startDate === endDate) return formatDateBrFromYmd(startDate);
    return `${formatDateBrFromYmd(startDate)} até ${formatDateBrFromYmd(endDate)}`;
  }
  if (startDate) return `A partir de ${formatDateBrFromYmd(startDate)}`;
  if (endDate) return `Até ${formatDateBrFromYmd(endDate)}`;
  return 'Todas as Datas';
}

export function getProducaoReportCellText(
  row: ProducaoReportRow,
  key: ProducaoReportColumnKey
): string {
  switch (key) {
    case 'dataTurno':
      return `${row.dataLabel}\nTurno ${row.turnoLabel}`;
    case 'produtoSku':
      return `${row.descricao}\nSKU: ${row.sku}`;
    case 'categoria':
      return row.categoriaNome || 'Sem Categoria';
    case 'quantidade':
      return String(row.quantidadeTotal);
    case 'unidadeMedida':
      return row.unidadeMedida || 'UN';
    case 'lojasDestino':
      return row.lojasDestinoText || '—';
    case 'estagio':
      return row.statusLabel;
    case 'sku':
      return row.sku || '—';
    case 'pedidosOrigem':
      return row.pedidosNumeros || '—';
    case 'qtdPedidos':
      return String(row.pedidosCount);
    case 'tempoPreparoMin':
      return row.tempoPreparoMin !== null ? `${row.tempoPreparoMin} min` : '—';
    case 'origem':
      return row.origemLabel;
    default:
      return '';
  }
}

export function getProducaoReportNumericValue(
  row: ProducaoReportRow,
  key: ProducaoReportColumnKey
): number | null {
  if (key === 'quantidade') return row.quantidadeTotal;
  if (key === 'qtdPedidos') return row.pedidosCount;
  if (key === 'tempoPreparoMin') return row.tempoPreparoMin;
  return null;
}

export function getProducaoReportGroupTotal(
  group: ProducaoReportGroup,
  key: ProducaoReportColumnKey
): number | null {
  if (key === 'quantidade') return group.totalQuantity;
  if (key === 'qtdPedidos') return group.totalOrdersCount;
  return null;
}

export function getProducaoReportColumnTotal(
  data: ProducaoReportData,
  key: ProducaoReportColumnKey
): number | null {
  if (key === 'quantidade') return data.totalQuantity;
  if (key === 'qtdPedidos') return data.totalOrdersCount;
  return null;
}

export function measureProducaoColumnCharLengths(
  data: Pick<ProducaoReportData, 'selectedColumns' | 'rows'>
): Map<ProducaoReportColumnKey, number> {
  const maxLengths = new Map<ProducaoReportColumnKey, number>();
  data.selectedColumns.forEach(col => {
    let maxLen = Math.max(col.shortLabel.length, col.label.length);
    data.rows.forEach(row => {
      const text = getProducaoReportCellText(row, col.key);
      text.split('\n').forEach(line => {
        if (line.length > maxLen) maxLen = line.length;
      });
    });
    maxLengths.set(col.key, maxLen);
  });
  return maxLengths;
}

export function computeProducaoColumnWidthsMm(
  data: Pick<ProducaoReportData, 'selectedColumns' | 'rows'>,
  usableWidthMm: number
): number[] {
  const cols = data.selectedColumns;
  if (cols.length === 0) return [];
  const charLengths = measureProducaoColumnCharLengths(data);

  const desired = cols.map(col => {
    const contentChars = charLengths.get(col.key) || col.shortLabel.length;
    const estMm = Math.max(col.pdfMinWidthMm, contentChars * 1.45 + 4.5);
    return Math.min(col.pdfMaxWidthMm, Math.max(col.pdfWeight * 1.15, estMm));
  });

  const totalDesired = desired.reduce((sum, w) => sum + w, 0) || 1;
  if (totalDesired <= usableWidthMm) {
    const remaining = usableWidthMm - totalDesired;
    const flexTotal = cols.reduce(
      (sum, c, idx) => sum + (c.isFlexible ? desired[idx] : 0),
      0
    );
    if (flexTotal > 0) {
      return desired.map((w, idx) =>
        cols[idx].isFlexible ? w + remaining * (w / flexTotal) : w
      );
    }
    return desired.map(w => w + remaining / cols.length);
  }

  // Scale down proportionally respecting minimums
  const scale = usableWidthMm / totalDesired;
  const scaled = desired.map((w, idx) => Math.max(cols[idx].pdfMinWidthMm * 0.8, w * scale));
  const finalSum = scaled.reduce((s, w) => s + w, 0) || 1;
  return scaled.map(w => (w / finalSum) * usableWidthMm);
}

export function buildProducaoReportData(params: {
  items: ConsolidatedProductionItem[];
  products: Product[];
  config: ProducaoReportConfig;
  filterContext?: {
    scopeLabel?: string;
    searchTerm?: string;
  };
}): ProducaoReportData {
  const { items, products, config, filterContext } = params;
  const prodMap = new Map(products.map(p => [p.id, p]));

  const colDefMap = new Map(PRODUCAO_REPORT_COLUMNS.map(c => [c.key, c]));
  const selectedColumns = config.columns
    .map(k => colDefMap.get(k))
    .filter((c): c is ProducaoReportColumnDef => Boolean(c));

  const startDate = config.startDate?.trim() || undefined;
  const endDate = config.endDate?.trim() || undefined;
  const shiftSet = new Set(config.shifts);
  const stageSet = new Set(config.stages);
  const categoryFilter = config.categoryFilter || 'TODAS';
  const destinationFilter = config.destinationFilter || 'TODAS';

  const filtered = items.filter(item => {
    if (startDate && item.dataProducao < startDate) return false;
    if (endDate && item.dataProducao > endDate) return false;
    if (config.shifts.length > 0 && !shiftSet.has(item.turno)) return false;
    if (config.stages.length > 0 && !stageSet.has(item.status)) return false;
    if (categoryFilter !== 'TODAS' && item.categoriaNome !== categoryFilter) return false;
    if (
      destinationFilter !== 'TODAS' &&
      !item.lojasDestino.some(d => d === destinationFilter)
    ) {
      return false;
    }
    return true;
  });

  const dir = config.sortDirection === 'desc' ? -1 : 1;

  const sorted = [...filtered].sort((a, b) => {
    if (config.sortBy === 'dataTurno') {
      const dateCmp = a.dataProducao.localeCompare(b.dataProducao) * dir;
      if (dateCmp !== 0) return dateCmp;
      const shiftCmp =
        (PRODUCAO_SHIFT_ORDER[a.turno] - PRODUCAO_SHIFT_ORDER[b.turno]) * dir;
      if (shiftCmp !== 0) return shiftCmp;
      return a.descricao.localeCompare(b.descricao, 'pt-BR');
    }
    if (config.sortBy === 'produto') {
      const cmp = a.descricao.localeCompare(b.descricao, 'pt-BR') * dir;
      if (cmp !== 0) return cmp;
      return a.dataProducao.localeCompare(b.dataProducao);
    }
    if (config.sortBy === 'categoria') {
      const cmp = a.categoriaNome.localeCompare(b.categoriaNome, 'pt-BR') * dir;
      if (cmp !== 0) return cmp;
      return a.descricao.localeCompare(b.descricao, 'pt-BR');
    }
    if (config.sortBy === 'quantidade') {
      const cmp = (a.quantidadeTotal - b.quantidadeTotal) * dir;
      if (cmp !== 0) return cmp;
      return a.descricao.localeCompare(b.descricao, 'pt-BR');
    }
    if (config.sortBy === 'estagio') {
      const cmp =
        (PRODUCAO_STAGE_ORDER[a.status] - PRODUCAO_STAGE_ORDER[b.status]) * dir;
      if (cmp !== 0) return cmp;
      return a.dataProducao.localeCompare(b.dataProducao);
    }
    return 0;
  });

  const rows: ProducaoReportRow[] = sorted.map(item => {
    const prod = prodMap.get(item.produtoId);
    const hasRep = item.pedidosVinculados.some(isReplenishmentOrder);
    const isManual = item.lojasDestino.some(l => l.includes('(Manual/Antec.)'));
    const hasOrders = item.pedidosVinculados.length > 0;
    const origemLabel =
      hasRep && isManual
        ? 'Reposição + Manual'
        : hasRep
        ? 'Reposição'
        : isManual && !hasOrders
        ? 'Manual / Antec.'
        : isManual && hasOrders
        ? 'Pedidos + Manual'
        : 'Pedidos Clientes';

    const dataLabel = formatDateBrFromYmd(item.dataProducao);
    const turnoLabel = PRODUCAO_SHIFT_LABELS[item.turno] || item.turno;
    const sortedDestinations = [...item.lojasDestino].sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );

    return {
      key: item.key,
      dataProducao: item.dataProducao,
      dataLabel,
      turno: item.turno,
      turnoLabel,
      produtoId: item.produtoId,
      sku: item.sku,
      descricao: item.descricao,
      produtoSkuText: `${item.descricao} (${item.sku})`,
      categoriaNome: item.categoriaNome || 'Sem Categoria',
      unidadeMedida: item.unidadeMedida || 'UN',
      quantidadeTotal: Number(item.quantidadeTotal) || 0,
      lojasDestino: sortedDestinations,
      lojasDestinoText: sortedDestinations.join(', '),
      pedidosNumeros: item.pedidosVinculados.map(o => o.numeroPedido).join(', '),
      pedidosCount: item.pedidosVinculados.length,
      tempoPreparoMin:
        prod?.tempoProducaoMinutos !== undefined ? Number(prod.tempoProducaoMinutos) : null,
      status: item.status,
      statusLabel: PRODUCAO_STAGE_LABELS[item.status] || item.status,
      isReplenishment: hasRep,
      isManual,
      origemLabel,
    };
  });

  const summarizeGroup = (
    key: string,
    label: string,
    groupRows: ProducaoReportRow[]
  ): ProducaoReportGroup => ({
    key,
    label,
    rows: groupRows,
    totalLots: groupRows.length,
    totalQuantity: Number(
      groupRows.reduce((s, r) => s + r.quantidadeTotal, 0).toFixed(3)
    ),
    activeQuantity: Number(
      groupRows
        .filter(r => r.status !== 'CANCELADA')
        .reduce((s, r) => s + r.quantidadeTotal, 0)
        .toFixed(3)
    ),
    totalOrdersCount: groupRows.reduce((s, r) => s + r.pedidosCount, 0),
  });

  const groupBy: ProducaoReportGroupBy = config.groupBy || 'turnoData';
  let groups: ProducaoReportGroup[] = [];

  if (rows.length > 0) {
    if (groupBy === 'nenhum') {
      groups = [summarizeGroup('ALL', '', rows)];
    } else {
      const map = new Map<
        string,
        { key: string; label: string; sortDate?: string; sortShift?: number; rows: ProducaoReportRow[] }
      >();

      rows.forEach(row => {
        let key = '';
        let label = '';
        let sortDate: string | undefined;
        let sortShift: number | undefined;

        switch (groupBy) {
          case 'turnoData':
            key = `${row.dataProducao}|${row.turno}`;
            label = `${row.dataLabel} — Turno ${row.turnoLabel}`;
            sortDate = row.dataProducao;
            sortShift = PRODUCAO_SHIFT_ORDER[row.turno] ?? 99;
            break;
          case 'data':
            key = row.dataProducao;
            label = row.dataLabel;
            sortDate = row.dataProducao;
            break;
          case 'produto':
            key = row.produtoId;
            label = `${row.descricao} (${row.sku})`;
            break;
          case 'categoria':
            key = row.categoriaNome;
            label = row.categoriaNome;
            break;
          case 'lojaDestino':
            key = row.lojasDestino.join(' + ') || 'Sem Destino';
            label = key;
            break;
          case 'estagio':
            key = row.status;
            label = row.statusLabel;
            break;
        }

        const cur = map.get(key) || { key, label, sortDate, sortShift, rows: [] };
        cur.rows.push(row);
        map.set(key, cur);
      });

      const entries = Array.from(map.values());
      const dateDir = config.sortBy === 'dataTurno' && config.sortDirection === 'desc' ? -1 : 1;

      entries.sort((a, b) => {
        if (groupBy === 'turnoData') {
          const dCmp = (a.sortDate || '').localeCompare(b.sortDate || '') * dateDir;
          if (dCmp !== 0) return dCmp;
          return ((a.sortShift ?? 99) - (b.sortShift ?? 99)) * dateDir;
        }
        if (groupBy === 'data') {
          return (a.sortDate || '').localeCompare(b.sortDate || '') * dateDir;
        }
        return a.label.localeCompare(b.label, 'pt-BR');
      });

      groups = entries.map(e => summarizeGroup(e.key, e.label, e.rows));
    }
  }

  // Consolidated summary by product (across filtered/selected lots)
  const summaryMap = new Map<
    string,
    {
      produtoId: string;
      sku: string;
      descricao: string;
      categoriaNome: string;
      unidadeMedida: string;
      lotsCount: number;
      totalQuantidade: number;
      destinos: Set<string>;
    }
  >();

  rows.forEach(row => {
    const existing = summaryMap.get(row.produtoId) || {
      produtoId: row.produtoId,
      sku: row.sku,
      descricao: row.descricao,
      categoriaNome: row.categoriaNome,
      unidadeMedida: row.unidadeMedida,
      lotsCount: 0,
      totalQuantidade: 0,
      destinos: new Set<string>(),
    };
    existing.lotsCount += 1;
    existing.totalQuantidade += row.quantidadeTotal;
    row.lojasDestino.forEach(d => existing.destinos.add(d));
    summaryMap.set(row.produtoId, existing);
  });

  const productSummary: ProducaoReportProductSummaryRow[] = Array.from(summaryMap.values())
    .map(entry => ({
      produtoId: entry.produtoId,
      sku: entry.sku,
      descricao: entry.descricao,
      categoriaNome: entry.categoriaNome,
      unidadeMedida: entry.unidadeMedida,
      lotsCount: entry.lotsCount,
      totalQuantidade: Number(entry.totalQuantidade.toFixed(3)),
      destinosText: Array.from(entry.destinos)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .join(', '),
    }))
    .sort(
      (a, b) =>
        a.categoriaNome.localeCompare(b.categoriaNome, 'pt-BR') ||
        a.descricao.localeCompare(b.descricao, 'pt-BR')
    );

  const activeLots = rows.filter(r => r.status !== 'CANCELADA').length;
  const canceledLots = rows.length - activeLots;
  const totalQuantity = Number(rows.reduce((s, r) => s + r.quantidadeTotal, 0).toFixed(3));
  const activeQuantity = Number(
    rows
      .filter(r => r.status !== 'CANCELADA')
      .reduce((s, r) => s + r.quantidadeTotal, 0)
      .toFixed(3)
  );
  const totalOrdersCount = rows.reduce((s, r) => s + r.pedidosCount, 0);
  const distinctProductsCount = productSummary.length;
  const distinctDaysCount = new Set(rows.map(r => r.dataProducao)).size;
  const distinctDestinationsCount = new Set(
    rows.flatMap(r => r.lojasDestino)
  ).size;

  const shiftsLabel =
    config.shifts.length === 0 || config.shifts.length === 3
      ? 'Todos os Turnos'
      : config.shifts.map(s => PRODUCAO_SHIFT_LABELS[s] || s).join(', ');

  const stagesLabel =
    config.stages.length === 0 || config.stages.length === 4
      ? 'Todos Estágios'
      : config.stages.map(s => PRODUCAO_STAGE_LABELS[s] || s).join(', ');

  const groupOpt = PRODUCAO_REPORT_GROUP_OPTIONS.find(o => o.value === groupBy);
  const sortOpt = PRODUCAO_REPORT_SORT_OPTIONS.find(o => o.value === config.sortBy);

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');

  return {
    config: {
      ...config,
      groupBy,
      startDate,
      endDate,
    },
    selectedColumns,
    rows,
    groups,
    groupLabel: groupOpt?.label || 'Data e Turno',
    groupHeaderPrefix: GROUP_HEADER_PREFIXES[groupBy] || '',
    periodLabel: formatPeriodLabel(startDate, endDate),
    shiftsLabel,
    stagesLabel,
    categoryLabel: categoryFilter === 'TODAS' ? 'Todas as Categorias' : categoryFilter,
    destinationLabel: destinationFilter === 'TODAS' ? 'Todos os Destinos' : destinationFilter,
    scopeLabel: filterContext?.scopeLabel || `${rows.length} lote(s)`,
    searchTerm: filterContext?.searchTerm?.trim() || '',
    sortLabel: `${sortOpt?.label || 'Data e Turno'} (${
      config.sortDirection === 'asc' ? 'Crescente ↑' : 'Decrescente ↓'
    })`,
    generatedAtLabel: `${dd}/${mm}/${yyyy} ${hh}:${min}`,
    productSummary,
    totalLots: rows.length,
    activeLots,
    canceledLots,
    totalQuantity,
    activeQuantity,
    totalOrdersCount,
    distinctProductsCount,
    distinctDaysCount,
    distinctDestinationsCount,
  };
}
