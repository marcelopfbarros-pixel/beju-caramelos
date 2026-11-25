import { formatCurrencyBR } from '../components/CurrencyInput';
import { Order, OrderStatus, PaymentMethod, Product, StoreUnit } from '../types';
import {
  DELIVERY_SHIFT_CONFIG,
  addHoursToDateTime,
  extractTimeHHmm,
  inferDeliveryShiftFromDateTime,
} from './deliveryTimeRange';
import { isReplenishmentOrder } from './orderStatusStyles';
import {
  PAYMENT_STATUS_LABELS,
  getEffectivePaymentStatus,
  getOrderPaidAmount,
  getOrderRemainingAmount,
} from './paymentStatus';

export type PedidosReportFormat = 'PDF' | 'XLSX';

export type PedidosReportOrientation = 'portrait' | 'landscape';

export type PedidosReportColumnKey =
  | 'clientePedido'
  | 'dataHoraEntrega'
  | 'unidadeModalidade'
  | 'enderecoEntrega'
  | 'detalheEntrega'
  | 'itensPedido'
  | 'quantidadeItem'
  | 'observacoes'
  | 'telefone'
  | 'status'
  | 'dataPedido'
  | 'turnoEntrega'
  | 'formaPagamento'
  | 'statusPagamento'
  | 'valorSubtotal'
  | 'taxaEntrega'
  | 'desconto'
  | 'valorTotal'
  | 'valorPago'
  | 'saldoAReceber';

export type PedidosReportSortBy =
  | 'dataEntrega'
  | 'pedido'
  | 'unidade'
  | 'modalidade'
  | 'cliente'
  | 'status'
  | 'valorTotal'
  | 'dataPedido';

export type PedidosReportSortDirection = 'asc' | 'desc';

export type PedidosReportGroupBy =
  | 'dataEntrega'
  | 'unidade'
  | 'modalidade'
  | 'status'
  | 'cliente'
  | 'nenhum';

export interface PedidosReportConfig {
  format: PedidosReportFormat;
  columns: PedidosReportColumnKey[];
  sortBy: PedidosReportSortBy;
  sortDirection: PedidosReportSortDirection;
  groupBy: PedidosReportGroupBy;
  deliveryStartDate?: string;
  deliveryEndDate?: string;
  orientation: PedidosReportOrientation;
}

export interface PedidosReportColumnDef {
  key: PedidosReportColumnKey;
  label: string;
  shortLabel: string;
  isDefault: boolean;
  level: 'order' | 'item';
  kind: 'text' | 'date' | 'number' | 'currency' | 'badge';
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

export interface PedidosReportItemRow {
  produtoId: string;
  sku: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
  observacoes?: string;
}

export interface PedidosReportOrderRow {
  orderId: string;
  numeroPedido: string;
  pedidoDisplay: string;
  isReplenishment: boolean;
  dataEntregaKey: string;
  dataEntregaGroupLabel: string;
  dataEntregaLabel: string;
  dataEntregaTimestamp: number;
  horaEntregaLabel: string;
  modalidadeLabel: string;
  tipoEntrega: Order['tipoEntrega'];
  unidadeNome: string;
  clienteNome: string;
  clienteTelefone: string;
  enderecoEntrega: string;
  detalheEntrega: string;
  observacoes: string;
  status: OrderStatus;
  statusLabel: string;
  dataPedidoLabel: string;
  dataPedidoTimestamp: number;
  turnoEntregaLabel: string;
  formaPagamento: PaymentMethod;
  formaPagamentoLabel: string;
  statusPagamento: 'PENDENTE' | 'SINAL' | 'PAGO';
  statusPagamentoLabel: string;
  valorSubtotal: number;
  taxaEntrega: number;
  desconto: number;
  valorTotal: number;
  valorPago: number;
  saldoAReceber: number;
  itens: PedidosReportItemRow[];
  itensCombinedText: string;
  totalQuantidadeItens: number;
}

export interface PedidosReportProductSummaryRow {
  produtoId: string;
  sku: string;
  descricao: string;
  unidade: string;
  ordersCount: number;
  totalQuantidade: number;
  totalValor: number;
}

export interface PedidosReportGroup {
  key: string;
  label: string;
  orders: PedidosReportOrderRow[];
  totalOrders: number;
  deliveryCount: number;
  pickupCount: number;
  totalItemQuantity: number;
  totalSubtotal: number;
  totalTaxaEntrega: number;
  totalDesconto: number;
  totalValor: number;
  totalPago: number;
  totalSaldo: number;
}

export interface PedidosReportData {
  config: PedidosReportConfig;
  selectedColumns: PedidosReportColumnDef[];
  expandItems: boolean;
  orders: PedidosReportOrderRow[];
  groups: PedidosReportGroup[];
  groupLabel: string;
  groupHeaderPrefix: string;
  periodLabel: string;
  productSummary: PedidosReportProductSummaryRow[];
  unitLabel: string;
  statusLabel: string;
  scopeLabel: string;
  searchTerm: string;
  sortLabel: string;
  generatedAtLabel: string;
  totalOrders: number;
  deliveryCount: number;
  pickupCount: number;
  distinctUnitsCount: number;
  totalItemQuantity: number;
  grandTotalSubtotal: number;
  grandTotalTaxaEntrega: number;
  grandTotalDesconto: number;
  grandTotalValor: number;
  grandTotalPago: number;
  grandTotalSaldo: number;
}

export const DEFAULT_PEDIDOS_REPORT_COLUMNS: PedidosReportColumnKey[] = [
  'clientePedido',
  'dataHoraEntrega',
  'unidadeModalidade',
  'enderecoEntrega',
  'detalheEntrega',
  'itensPedido',
  'quantidadeItem',
  'observacoes',
];

export const PEDIDOS_REPORT_COLUMNS: PedidosReportColumnDef[] = [
  {
    key: 'clientePedido',
    label: 'Cliente / Pedido',
    shortLabel: 'Cliente / Pedido',
    isDefault: true,
    level: 'order',
    kind: 'text',
    align: 'left',
    pdfWeight: 19,
    pdfMinWidthMm: 24,
    pdfMaxWidthMm: 44,
    excelWch: 24,
    excelMinWch: 18,
    excelMaxWch: 30,
    isFlexible: true,
  },
  {
    key: 'dataHoraEntrega',
    label: 'Data / Hora da entrega',
    shortLabel: 'Data / Hora',
    isDefault: true,
    level: 'order',
    kind: 'text',
    align: 'center',
    pdfWeight: 13,
    pdfMinWidthMm: 20,
    pdfMaxWidthMm: 29,
    excelWch: 20,
    excelMinWch: 16,
    excelMaxWch: 23,
  },
  {
    key: 'unidadeModalidade',
    label: 'Unidade / Modalidade',
    shortLabel: 'Unidade / Mod.',
    isDefault: true,
    level: 'order',
    kind: 'text',
    align: 'left',
    pdfWeight: 13,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 28,
    excelWch: 18,
    excelMinWch: 15,
    excelMaxWch: 24,
  },
  {
    key: 'enderecoEntrega',
    label: 'Endereço de entrega',
    shortLabel: 'Endereço',
    isDefault: true,
    level: 'order',
    kind: 'text',
    align: 'left',
    pdfWeight: 32,
    pdfMinWidthMm: 24,
    pdfMaxWidthMm: 82,
    excelWch: 36,
    excelMinWch: 16,
    excelMaxWch: 48,
    isFlexible: true,
  },
  {
    key: 'detalheEntrega',
    label: 'Detalhe da entrega',
    shortLabel: 'Detalhe',
    isDefault: true,
    level: 'order',
    kind: 'text',
    align: 'left',
    pdfWeight: 16,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 42,
    excelWch: 20,
    excelMinWch: 12,
    excelMaxWch: 28,
    isFlexible: true,
  },
  {
    key: 'itensPedido',
    label: 'Itens do pedido',
    shortLabel: 'Itens do Pedido',
    isDefault: true,
    level: 'item',
    kind: 'text',
    align: 'left',
    pdfWeight: 30,
    pdfMinWidthMm: 24,
    pdfMaxWidthMm: 78,
    excelWch: 34,
    excelMinWch: 18,
    excelMaxWch: 46,
    isFlexible: true,
  },
  {
    key: 'quantidadeItem',
    label: 'Quantidade de cada item',
    shortLabel: 'Qtd.',
    isDefault: true,
    level: 'item',
    kind: 'number',
    align: 'center',
    pdfWeight: 5,
    pdfMinWidthMm: 8.5,
    pdfMaxWidthMm: 12,
    excelWch: 8,
    excelMinWch: 7,
    excelMaxWch: 10,
    summable: true,
  },
  {
    key: 'observacoes',
    label: 'Observações',
    shortLabel: 'Observações',
    isDefault: true,
    level: 'order',
    kind: 'text',
    align: 'left',
    pdfWeight: 20,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 52,
    excelWch: 24,
    excelMinWch: 12,
    excelMaxWch: 36,
    isFlexible: true,
  },
  {
    key: 'telefone',
    label: 'Telefone / WhatsApp',
    shortLabel: 'Telefone',
    isDefault: false,
    level: 'order',
    kind: 'text',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 26,
    excelWch: 16,
    excelMinWch: 14,
    excelMaxWch: 20,
  },
  {
    key: 'status',
    label: 'Status do pedido',
    shortLabel: 'Status',
    isDefault: false,
    level: 'order',
    kind: 'badge',
    align: 'center',
    pdfWeight: 11,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 24,
    excelWch: 15,
    excelMinWch: 12,
    excelMaxWch: 18,
  },
  {
    key: 'dataPedido',
    label: 'Data do pedido',
    shortLabel: 'Data Pedido',
    isDefault: false,
    level: 'order',
    kind: 'date',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 22,
    excelWch: 14,
    excelMinWch: 12,
    excelMaxWch: 16,
  },
  {
    key: 'turnoEntrega',
    label: 'Turno da entrega',
    shortLabel: 'Turno',
    isDefault: false,
    level: 'order',
    kind: 'text',
    align: 'center',
    pdfWeight: 9,
    pdfMinWidthMm: 12,
    pdfMaxWidthMm: 18,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 15,
  },
  {
    key: 'formaPagamento',
    label: 'Forma de pagamento',
    shortLabel: 'Pagamento',
    isDefault: false,
    level: 'order',
    kind: 'text',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 13,
    pdfMaxWidthMm: 22,
    excelWch: 15,
    excelMinWch: 12,
    excelMaxWch: 18,
  },
  {
    key: 'statusPagamento',
    label: 'Status do pagamento',
    shortLabel: 'Status Pagto',
    isDefault: false,
    level: 'order',
    kind: 'badge',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 13,
    pdfMaxWidthMm: 22,
    excelWch: 14,
    excelMinWch: 12,
    excelMaxWch: 17,
  },
  {
    key: 'valorSubtotal',
    label: 'Subtotal (R$)',
    shortLabel: 'Subtotal',
    isDefault: false,
    level: 'order',
    kind: 'currency',
    align: 'right',
    pdfWeight: 10,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 24,
    excelWch: 15,
    excelMinWch: 13,
    excelMaxWch: 17,
    summable: true,
  },
  {
    key: 'taxaEntrega',
    label: 'Taxa de entrega (R$)',
    shortLabel: 'Taxa Entr.',
    isDefault: false,
    level: 'order',
    kind: 'currency',
    align: 'right',
    pdfWeight: 9,
    pdfMinWidthMm: 13,
    pdfMaxWidthMm: 22,
    excelWch: 14,
    excelMinWch: 12,
    excelMaxWch: 16,
    summable: true,
  },
  {
    key: 'desconto',
    label: 'Desconto (R$)',
    shortLabel: 'Desconto',
    isDefault: false,
    level: 'order',
    kind: 'currency',
    align: 'right',
    pdfWeight: 9,
    pdfMinWidthMm: 13,
    pdfMaxWidthMm: 22,
    excelWch: 14,
    excelMinWch: 12,
    excelMaxWch: 16,
    summable: true,
  },
  {
    key: 'valorTotal',
    label: 'Valor total (R$)',
    shortLabel: 'Valor Total',
    isDefault: false,
    level: 'order',
    kind: 'currency',
    align: 'right',
    pdfWeight: 11,
    pdfMinWidthMm: 15,
    pdfMaxWidthMm: 26,
    excelWch: 16,
    excelMinWch: 13,
    excelMaxWch: 18,
    summable: true,
  },
  {
    key: 'valorPago',
    label: 'Valor pago (R$)',
    shortLabel: 'Valor Pago',
    isDefault: false,
    level: 'order',
    kind: 'currency',
    align: 'right',
    pdfWeight: 10,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 24,
    excelWch: 15,
    excelMinWch: 13,
    excelMaxWch: 17,
    summable: true,
  },
  {
    key: 'saldoAReceber',
    label: 'Saldo a receber (R$)',
    shortLabel: 'Saldo',
    isDefault: false,
    level: 'order',
    kind: 'currency',
    align: 'right',
    pdfWeight: 10,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 24,
    excelWch: 15,
    excelMinWch: 13,
    excelMaxWch: 17,
    summable: true,
  },
];

export const PEDIDOS_REPORT_SORT_OPTIONS: Array<{ value: PedidosReportSortBy; label: string }> = [
  { value: 'dataEntrega', label: 'Data da entrega' },
  { value: 'pedido', label: 'Número do pedido' },
  { value: 'unidade', label: 'Unidade' },
  { value: 'modalidade', label: 'Modalidade' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'status', label: 'Status do pedido' },
  { value: 'valorTotal', label: 'Valor total' },
  { value: 'dataPedido', label: 'Data do pedido' },
];

export const PEDIDOS_REPORT_GROUP_OPTIONS: Array<{ value: PedidosReportGroupBy; label: string }> = [
  { value: 'dataEntrega', label: 'Data da entrega' },
  { value: 'unidade', label: 'Unidade' },
  { value: 'modalidade', label: 'Modalidade (Entrega / Retirada)' },
  { value: 'status', label: 'Status do pedido' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'nenhum', label: 'Sem agrupamento' },
];

const GROUP_HEADER_PREFIXES: Record<PedidosReportGroupBy, string> = {
  dataEntrega: 'DATA DA ENTREGA',
  unidade: 'UNIDADE',
  modalidade: 'MODALIDADE',
  status: 'STATUS',
  cliente: 'CLIENTE',
  nenhum: '',
};

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const COLUMN_MAP = new Map<PedidosReportColumnKey, PedidosReportColumnDef>(
  PEDIDOS_REPORT_COLUMNS.map(col => [col.key, col])
);

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  EM_PRODUCAO: 'Em Produção',
  PRONTO: 'Pronto',
  EM_ROTA: 'Em Rota',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  debito: 'Débito',
  credito: 'Crédito',
  dinheiro: 'Dinheiro',
};

function formatDateBR(iso?: string): {
  label: string;
  dateKey: string;
  groupLabel: string;
  timestamp: number;
} {
  if (!iso) {
    return { label: '—', dateKey: '', groupLabel: 'Sem data definida', timestamp: 0 };
  }
  const pureDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const parsed = pureDateMatch
    ? new Date(Number(pureDateMatch[1]), Number(pureDateMatch[2]) - 1, Number(pureDateMatch[3]))
    : new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return { label: '—', dateKey: '', groupLabel: 'Sem data definida', timestamp: 0 };
  }
  const dd = String(parsed.getDate()).padStart(2, '0');
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const yyyy = parsed.getFullYear();
  const weekday = WEEKDAYS_PT[parsed.getDay()];
  return {
    label: `${dd}/${mm}/${yyyy}`,
    dateKey: `${yyyy}-${mm}-${dd}`,
    groupLabel: `${dd}/${mm}/${yyyy} (${weekday})`,
    timestamp: parsed.getTime(),
  };
}

function formatInputDateBR(dateStr?: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [yyyy, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

function formatPeriodLabel(start?: string, end?: string): string {
  const s = formatInputDateBR(start);
  const e = formatInputDateBR(end);
  if (s && e) return s === e ? s : `${s} a ${e}`;
  if (s) return `A partir de ${s}`;
  if (e) return `Até ${e}`;
  return 'Todo o período';
}

function formatDeliveryHourLabel(order: Order): string {
  if (!order.dataHoraEntrega) return 'A combinar';
  const startDate = new Date(order.dataHoraEntrega);
  if (Number.isNaN(startDate.getTime())) return 'A combinar';

  const startHHmm = extractTimeHHmm(order.dataHoraEntrega);
  const resolvedEnd = order.dataHoraEntregaFim || addHoursToDateTime(order.dataHoraEntrega, 1);
  const endHHmm = extractTimeHHmm(resolvedEnd);
  const timeRange = startHHmm && endHHmm ? `${startHHmm}–${endHHmm}` : startHHmm || '';

  if (order.tipoEntrega === 'DELIVERY') {
    const shift = order.turnoEntrega || inferDeliveryShiftFromDateTime(order.dataHoraEntrega);
    const shiftLabel = DELIVERY_SHIFT_CONFIG[shift]?.label;
    if (timeRange && shiftLabel) return `${timeRange} (${shiftLabel})`;
    return timeRange || shiftLabel || 'A combinar';
  }

  return timeRange || 'A combinar';
}

function resolveOrderUnitName(order: Order, unitMap: Map<string, StoreUnit>): string {
  if (order.tipoEntrega === 'RETIRADA' && order.unidadeRetiradaId) {
    return unitMap.get(order.unidadeRetiradaId)?.nome || unitMap.get(order.unidadeOrigemId)?.nome || 'Unidade';
  }
  return unitMap.get(order.unidadeOrigemId)?.nome || 'Unidade';
}

export interface PedidosReportCombinedParts {
  primary: string;
  secondary: string;
  secondaryTone?: 'slate' | 'blue' | 'amber';
}

export function getPedidosReportCombinedParts(
  row: PedidosReportOrderRow,
  colKey: PedidosReportColumnKey
): PedidosReportCombinedParts | null {
  switch (colKey) {
    case 'clientePedido':
      return {
        primary: row.clienteNome,
        secondary: row.isReplenishment
          ? `${row.numeroPedido} • Reposição`
          : row.numeroPedido,
        secondaryTone: 'slate',
      };
    case 'dataHoraEntrega':
      return {
        primary: row.dataEntregaLabel,
        secondary: row.horaEntregaLabel,
        secondaryTone: 'slate',
      };
    case 'unidadeModalidade':
      return {
        primary: row.unidadeNome,
        secondary: row.modalidadeLabel,
        secondaryTone: row.tipoEntrega === 'DELIVERY' ? 'blue' : 'amber',
      };
    default:
      return null;
  }
}

export function getPedidosReportOrderCellText(
  row: PedidosReportOrderRow,
  colKey: PedidosReportColumnKey,
  item?: PedidosReportItemRow
): string {
  const combined = getPedidosReportCombinedParts(row, colKey);
  if (combined) {
    return `${combined.primary}\n${combined.secondary}`;
  }

  switch (colKey) {
    case 'enderecoEntrega':
      return row.enderecoEntrega;
    case 'detalheEntrega':
      return row.detalheEntrega;
    case 'itensPedido':
      if (item) return item.descricao;
      return row.itensCombinedText || '—';
    case 'quantidadeItem':
      return String(item ? item.quantidade : row.totalQuantidadeItens);
    case 'observacoes':
      return row.observacoes;
    case 'telefone':
      return row.clienteTelefone || '—';
    case 'status':
      return row.statusLabel;
    case 'dataPedido':
      return row.dataPedidoLabel;
    case 'turnoEntrega':
      return row.turnoEntregaLabel;
    case 'formaPagamento':
      return row.formaPagamentoLabel;
    case 'statusPagamento':
      return row.statusPagamentoLabel;
    case 'valorSubtotal':
      return `R$ ${formatCurrencyBR(row.valorSubtotal)}`;
    case 'taxaEntrega':
      return `R$ ${formatCurrencyBR(row.taxaEntrega)}`;
    case 'desconto':
      return `R$ ${formatCurrencyBR(row.desconto)}`;
    case 'valorTotal':
      return `R$ ${formatCurrencyBR(row.valorTotal)}`;
    case 'valorPago':
      return `R$ ${formatCurrencyBR(row.valorPago)}`;
    case 'saldoAReceber':
      return `R$ ${formatCurrencyBR(row.saldoAReceber)}`;
  }
}

export function getPedidosReportOrderNumericValue(
  row: PedidosReportOrderRow,
  colKey: PedidosReportColumnKey,
  item?: PedidosReportItemRow
): number | null {
  switch (colKey) {
    case 'quantidadeItem':
      return item ? item.quantidade : row.totalQuantidadeItens;
    case 'valorSubtotal':
      return row.valorSubtotal;
    case 'taxaEntrega':
      return row.taxaEntrega;
    case 'desconto':
      return row.desconto;
    case 'valorTotal':
      return row.valorTotal;
    case 'valorPago':
      return row.valorPago;
    case 'saldoAReceber':
      return row.saldoAReceber;
    default:
      return null;
  }
}

export function getPedidosReportColumnTotal(
  data: PedidosReportData,
  colKey: PedidosReportColumnKey
): number | null {
  switch (colKey) {
    case 'quantidadeItem':
      return data.totalItemQuantity;
    case 'valorSubtotal':
      return data.grandTotalSubtotal;
    case 'taxaEntrega':
      return data.grandTotalTaxaEntrega;
    case 'desconto':
      return data.grandTotalDesconto;
    case 'valorTotal':
      return data.grandTotalValor;
    case 'valorPago':
      return data.grandTotalPago;
    case 'saldoAReceber':
      return data.grandTotalSaldo;
    default:
      return null;
  }
}

export function getPedidosReportGroupTotal(
  group: PedidosReportGroup,
  colKey: PedidosReportColumnKey
): number | null {
  switch (colKey) {
    case 'quantidadeItem':
      return group.totalItemQuantity;
    case 'valorSubtotal':
      return group.totalSubtotal;
    case 'taxaEntrega':
      return group.totalTaxaEntrega;
    case 'desconto':
      return group.totalDesconto;
    case 'valorTotal':
      return group.totalValor;
    case 'valorPago':
      return group.totalPago;
    case 'saldoAReceber':
      return group.totalSaldo;
    default:
      return null;
  }
}

export function measureColumnContentCharLengths(
  data: PedidosReportData
): Map<PedidosReportColumnKey, number> {
  const maxLengths = new Map<PedidosReportColumnKey, number>();
  data.selectedColumns.forEach(col => maxLengths.set(col.key, 0));

  const recordText = (key: PedidosReportColumnKey, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed === '—' || trimmed === 'Retirada na loja') {
      if (trimmed === 'Retirada na loja') {
        const cur = maxLengths.get(key) || 0;
        if (16 > cur) maxLengths.set(key, 16);
      }
      return;
    }
    const longestLine = trimmed
      .split('\n')
      .reduce((m, line) => Math.max(m, line.trim().length), 0);
    const cur = maxLengths.get(key) || 0;
    if (longestLine > cur) {
      maxLengths.set(key, longestLine);
    }
  };

  data.orders.forEach(row => {
    const itemsToScan =
      data.expandItems && row.itens.length > 0 ? row.itens : [undefined];
    data.selectedColumns.forEach(col => {
      if (col.level === 'order') {
        recordText(col.key, getPedidosReportOrderCellText(row, col.key));
      } else {
        itemsToScan.forEach(item => {
          recordText(col.key, getPedidosReportOrderCellText(row, col.key, item));
        });
      }
    });
  });

  return maxLengths;
}

export function computeBalancedColumnWidthsMm(
  data: PedidosReportData,
  usableWidthMm: number
): number[] {
  const cols = data.selectedColumns;
  if (cols.length === 0) return [];

  const charLengths = measureColumnContentCharLengths(data);
  const totalWeight = cols.reduce((s, c) => s + c.pdfWeight, 0) || 1;

  const widths = cols.map(col => {
    const contentChars = charLengths.get(col.key) || 0;
    if (col.isFlexible && data.orders.length > 0 && contentChars === 0) {
      return col.pdfMinWidthMm;
    }
    const effectiveChars = Math.max(col.shortLabel.length, contentChars);
    const contentBasedMm = effectiveChars * 1.45 + 3.5;
    const weightBasedMm =
      col.pdfMinWidthMm + (col.pdfWeight / totalWeight) * usableWidthMm * 0.52;
    const raw =
      contentChars > 0 ? Math.max(contentBasedMm, weightBasedMm) : weightBasedMm;
    return Math.min(col.pdfMaxWidthMm, Math.max(col.pdfMinWidthMm, raw));
  });

  let sum = widths.reduce((a, b) => a + b, 0);

  // Step A: If wider than usableWidthMm, compress flexible columns down toward pdfMinWidthMm first
  if (sum > usableWidthMm) {
    let excess = sum - usableWidthMm;
    const flexSlack = cols.reduce(
      (acc, c, i) => acc + (c.isFlexible ? Math.max(0, widths[i] - c.pdfMinWidthMm) : 0),
      0
    );
    if (flexSlack > 0) {
      const take = Math.min(excess, flexSlack);
      cols.forEach((c, i) => {
        if (!c.isFlexible) return;
        const slack = Math.max(0, widths[i] - c.pdfMinWidthMm);
        widths[i] -= take * (slack / flexSlack);
      });
      sum = widths.reduce((a, b) => a + b, 0);
      excess = Math.max(0, sum - usableWidthMm);
    }

    // Compress remaining columns toward pdfMinWidthMm
    if (excess > 0.01) {
      const totalSlack = cols.reduce(
        (acc, c, i) => acc + Math.max(0, widths[i] - c.pdfMinWidthMm),
        0
      );
      if (totalSlack >= excess && totalSlack > 0) {
        cols.forEach((c, i) => {
          const slack = Math.max(0, widths[i] - c.pdfMinWidthMm);
          widths[i] -= excess * (slack / totalSlack);
        });
      } else {
        const scale = usableWidthMm / sum;
        for (let i = 0; i < widths.length; i += 1) {
          widths[i] *= scale;
        }
      }
    }
  } else if (sum < usableWidthMm) {
    // Step B: Distribute remaining space to columns below pdfMaxWidthMm (flexible first)
    let remaining = usableWidthMm - sum;
    const flexHeadroom = cols.reduce(
      (acc, c, i) => acc + (c.isFlexible ? Math.max(0, c.pdfMaxWidthMm - widths[i]) : 0),
      0
    );
    if (flexHeadroom > 0) {
      const flexWeightSum = cols.reduce(
        (acc, c, i) =>
          acc + (c.isFlexible && widths[i] < c.pdfMaxWidthMm ? c.pdfWeight : 0),
        0
      );
      const give = Math.min(remaining, flexHeadroom);
      cols.forEach((c, i) => {
        if (!c.isFlexible || widths[i] >= c.pdfMaxWidthMm || flexWeightSum <= 0) return;
        const room = c.pdfMaxWidthMm - widths[i];
        const share = Math.min(room, give * (c.pdfWeight / flexWeightSum));
        widths[i] += share;
      });
      sum = widths.reduce((a, b) => a + b, 0);
      remaining = Math.max(0, usableWidthMm - sum);
    }

    if (remaining > 0.01) {
      const allHeadroom = cols.reduce(
        (acc, c, i) => acc + Math.max(0, c.pdfMaxWidthMm - widths[i]),
        0
      );
      if (allHeadroom > 0) {
        const give = Math.min(remaining, allHeadroom);
        cols.forEach((c, i) => {
          const room = Math.max(0, c.pdfMaxWidthMm - widths[i]);
          widths[i] += give * (room / allHeadroom);
        });
        sum = widths.reduce((a, b) => a + b, 0);
        remaining = Math.max(0, usableWidthMm - sum);
      }
    }

    // If all columns hit pdfMaxWidthMm, distribute residual proportionally excluding hard-capped quantidadeItem
    if (remaining > 0.01) {
      const growWeight = cols.reduce(
        (acc, c) => acc + (c.key !== 'quantidadeItem' ? c.pdfWeight : 0),
        0
      );
      if (growWeight > 0) {
        cols.forEach((c, i) => {
          if (c.key === 'quantidadeItem') return;
          widths[i] += remaining * (c.pdfWeight / growWeight);
        });
      } else {
        const perCol = remaining / widths.length;
        for (let i = 0; i < widths.length; i += 1) {
          widths[i] += perCol;
        }
      }
    }
  }

  const rounded = widths.map(w => Number(w.toFixed(2)));
  const roundedSum = rounded.reduce((a, b) => a + b, 0);
  const diff = Number((usableWidthMm - roundedSum).toFixed(2));
  if (Math.abs(diff) > 0 && rounded.length > 0) {
    let targetIdx = rounded.length - 1;
    let widestFlex = -1;
    cols.forEach((c, i) => {
      if (c.isFlexible && rounded[i] > widestFlex) {
        widestFlex = rounded[i];
        targetIdx = i;
      }
    });
    rounded[targetIdx] = Number((rounded[targetIdx] + diff).toFixed(2));
  }

  return rounded;
}

export function buildPedidosReportData(params: {
  orders: Order[];
  products: Product[];
  units: StoreUnit[];
  config: PedidosReportConfig;
  filterContext?: {
    unitLabel?: string;
    statusLabel?: string;
    searchTerm?: string;
    scopeLabel?: string;
  };
}): PedidosReportData {
  const { orders, products, units, config, filterContext } = params;
  const prodMap = new Map(products.map(p => [p.id, p]));
  const unitMap = new Map(units.map(u => [u.id, u]));

  const resolvedColumns = config.columns
    .map(k => COLUMN_MAP.get(k))
    .filter((def): def is PedidosReportColumnDef => Boolean(def));

  const selectedColumns =
    resolvedColumns.length > 0
      ? resolvedColumns
      : DEFAULT_PEDIDOS_REPORT_COLUMNS.map(k => COLUMN_MAP.get(k)!);

  const selectedKeys = new Set(selectedColumns.map(c => c.key));
  const expandItems = selectedKeys.has('itensPedido') && selectedKeys.has('quantidadeItem');

  const startDate = config.deliveryStartDate?.trim() || '';
  const endDate = config.deliveryEndDate?.trim() || '';
  const hasInvalidRange = Boolean(startDate && endDate && startDate > endDate);

  const periodFilteredOrders = hasInvalidRange
    ? []
    : orders.filter(order => {
        if (!startDate && !endDate) return true;
        const { dateKey } = formatDateBR(order.dataHoraEntrega);
        if (!dateKey) return false;
        if (startDate && dateKey < startDate) return false;
        if (endDate && dateKey > endDate) return false;
        return true;
      });

  const mappedRows: PedidosReportOrderRow[] = periodFilteredOrders.map(order => {
    const isRep = isReplenishmentOrder(order);
    const dataEntrega = formatDateBR(order.dataHoraEntrega);
    const dataPedido = formatDateBR(order.dataPedido);
    const unidadeNome = resolveOrderUnitName(order, unitMap);
    const payStatus = getEffectivePaymentStatus(order);
    const valorPago = getOrderPaidAmount(order);
    const saldoAReceber = getOrderRemainingAmount(order);

    const itens: PedidosReportItemRow[] = (order.itens || []).map(it => {
      const prod = prodMap.get(it.produtoId);
      const baseDesc = prod?.descricao || 'Produto';
      const obsTrim = it.observacoes?.trim();
      const descricao = obsTrim ? `${baseDesc} (${obsTrim})` : baseDesc;
      return {
        produtoId: it.produtoId,
        sku: prod?.sku || '—',
        descricao,
        unidade: prod?.unidade || 'UN',
        quantidade: Number(it.quantidade) || 0,
        precoUnitario: Number(it.precoUnitario) || 0,
        subtotal: Number(it.subtotal) || 0,
        observacoes: obsTrim || undefined,
      };
    });

    const totalQuantidadeItens = itens.reduce((sum, i) => sum + i.quantidade, 0);
    const itensCombinedText =
      itens.length > 0 ? itens.map(i => `${i.quantidade}x ${i.descricao}`).join('\n') : '—';

    const shift =
      order.tipoEntrega === 'DELIVERY'
        ? order.turnoEntrega || inferDeliveryShiftFromDateTime(order.dataHoraEntrega)
        : undefined;

    return {
      orderId: order.id,
      numeroPedido: order.numeroPedido,
      pedidoDisplay: isRep ? `${order.numeroPedido}\n[Reposição]` : order.numeroPedido,
      isReplenishment: isRep,
      dataEntregaKey: dataEntrega.dateKey,
      dataEntregaGroupLabel: dataEntrega.groupLabel,
      dataEntregaLabel: dataEntrega.label,
      dataEntregaTimestamp: dataEntrega.timestamp,
      horaEntregaLabel: formatDeliveryHourLabel(order),
      modalidadeLabel: order.tipoEntrega === 'DELIVERY' ? 'Entrega' : 'Retirada',
      tipoEntrega: order.tipoEntrega,
      unidadeNome,
      clienteNome: order.clienteNome?.trim() || '—',
      clienteTelefone: order.clienteTelefone?.trim() || '—',
      enderecoEntrega:
        order.tipoEntrega === 'DELIVERY'
          ? order.enderecoEntrega?.trim() || order.clienteEndereco?.trim() || '—'
          : 'Retirada na loja',
      detalheEntrega: order.detalheEntrega?.trim() || '—',
      observacoes: order.observacoes?.trim() || '—',
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status] || order.status,
      dataPedidoLabel: dataPedido.label,
      dataPedidoTimestamp: dataPedido.timestamp,
      turnoEntregaLabel: shift ? DELIVERY_SHIFT_CONFIG[shift]?.label || '—' : '—',
      formaPagamento: order.formaPagamento,
      formaPagamentoLabel: PAYMENT_METHOD_LABELS[order.formaPagamento] || String(order.formaPagamento || '—').toUpperCase(),
      statusPagamento: payStatus,
      statusPagamentoLabel: PAYMENT_STATUS_LABELS[payStatus],
      valorSubtotal: Number(order.valorSubtotal) || 0,
      taxaEntrega: order.tipoEntrega === 'DELIVERY' ? Number(order.taxaEntrega) || 0 : 0,
      desconto: Number(order.desconto) || 0,
      valorTotal: Number(order.valorTotal) || 0,
      valorPago,
      saldoAReceber,
      itens,
      itensCombinedText,
      totalQuantidadeItens,
    };
  });

  const dir = config.sortDirection === 'desc' ? -1 : 1;
  mappedRows.sort((a, b) => {
    let cmp = 0;
    switch (config.sortBy) {
      case 'dataEntrega':
        cmp = a.dataEntregaTimestamp - b.dataEntregaTimestamp;
        break;
      case 'pedido':
        cmp = a.numeroPedido.localeCompare(b.numeroPedido, 'pt-BR', { numeric: true });
        break;
      case 'unidade':
        cmp = a.unidadeNome.localeCompare(b.unidadeNome, 'pt-BR');
        break;
      case 'modalidade':
        cmp = a.modalidadeLabel.localeCompare(b.modalidadeLabel, 'pt-BR');
        break;
      case 'cliente':
        cmp = a.clienteNome.localeCompare(b.clienteNome, 'pt-BR');
        break;
      case 'status':
        cmp = a.statusLabel.localeCompare(b.statusLabel, 'pt-BR');
        break;
      case 'valorTotal':
        cmp = a.valorTotal - b.valorTotal;
        break;
      case 'dataPedido':
        cmp = a.dataPedidoTimestamp - b.dataPedidoTimestamp;
        break;
    }
    if (cmp !== 0) return cmp * dir;
    const fallbackDate = a.dataEntregaTimestamp - b.dataEntregaTimestamp;
    if (fallbackDate !== 0) return fallbackDate;
    return a.numeroPedido.localeCompare(b.numeroPedido, 'pt-BR', { numeric: true });
  });

  // Consolidated product summary
  const summaryMap = new Map<
    string,
    {
      produtoId: string;
      sku: string;
      descricao: string;
      unidade: string;
      orderIds: Set<string>;
      totalQuantidade: number;
      totalValor: number;
    }
  >();

  mappedRows.forEach(row => {
    row.itens.forEach(it => {
      const prod = prodMap.get(it.produtoId);
      const existing = summaryMap.get(it.produtoId) || {
        produtoId: it.produtoId,
        sku: it.sku,
        descricao: prod?.descricao || it.descricao,
        unidade: it.unidade,
        orderIds: new Set<string>(),
        totalQuantidade: 0,
        totalValor: 0,
      };
      existing.orderIds.add(row.orderId);
      existing.totalQuantidade += it.quantidade;
      existing.totalValor += it.subtotal;
      summaryMap.set(it.produtoId, existing);
    });
  });

  const productSummary: PedidosReportProductSummaryRow[] = Array.from(summaryMap.values())
    .map(entry => ({
      produtoId: entry.produtoId,
      sku: entry.sku,
      descricao: entry.descricao,
      unidade: entry.unidade,
      ordersCount: entry.orderIds.size,
      totalQuantidade: entry.totalQuantidade,
      totalValor: Number(entry.totalValor.toFixed(2)),
    }))
    .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));

  const deliveryCount = mappedRows.filter(r => r.tipoEntrega === 'DELIVERY').length;
  const pickupCount = mappedRows.length - deliveryCount;
  const distinctUnitsCount = new Set(mappedRows.map(r => r.unidadeNome)).size;
  const totalItemQuantity = mappedRows.reduce((s, r) => s + r.totalQuantidadeItens, 0);
  const grandTotalSubtotal = Number(mappedRows.reduce((s, r) => s + r.valorSubtotal, 0).toFixed(2));
  const grandTotalTaxaEntrega = Number(mappedRows.reduce((s, r) => s + r.taxaEntrega, 0).toFixed(2));
  const grandTotalDesconto = Number(mappedRows.reduce((s, r) => s + r.desconto, 0).toFixed(2));
  const grandTotalValor = Number(mappedRows.reduce((s, r) => s + r.valorTotal, 0).toFixed(2));
  const grandTotalPago = Number(mappedRows.reduce((s, r) => s + r.valorPago, 0).toFixed(2));
  const grandTotalSaldo = Number(mappedRows.reduce((s, r) => s + r.saldoAReceber, 0).toFixed(2));

  const sortOpt = PEDIDOS_REPORT_SORT_OPTIONS.find(o => o.value === config.sortBy);
  const sortLabel = `${sortOpt?.label || 'Data da entrega'} (${
    config.sortDirection === 'asc' ? 'Crescente ↑' : 'Decrescente ↓'
  })`;

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');

  const groupBy: PedidosReportGroupBy = config.groupBy || 'dataEntrega';
  const groupOpt = PEDIDOS_REPORT_GROUP_OPTIONS.find(o => o.value === groupBy);
  const groupLabel = groupOpt?.label || 'Data da entrega';
  const groupHeaderPrefix = GROUP_HEADER_PREFIXES[groupBy] || '';
  const periodLabel = formatPeriodLabel(startDate, endDate);

  const summarizeGroup = (key: string, label: string, groupOrders: PedidosReportOrderRow[]): PedidosReportGroup => {
    const gDelivery = groupOrders.filter(r => r.tipoEntrega === 'DELIVERY').length;
    return {
      key,
      label,
      orders: groupOrders,
      totalOrders: groupOrders.length,
      deliveryCount: gDelivery,
      pickupCount: groupOrders.length - gDelivery,
      totalItemQuantity: groupOrders.reduce((s, r) => s + r.totalQuantidadeItens, 0),
      totalSubtotal: Number(groupOrders.reduce((s, r) => s + r.valorSubtotal, 0).toFixed(2)),
      totalTaxaEntrega: Number(groupOrders.reduce((s, r) => s + r.taxaEntrega, 0).toFixed(2)),
      totalDesconto: Number(groupOrders.reduce((s, r) => s + r.desconto, 0).toFixed(2)),
      totalValor: Number(groupOrders.reduce((s, r) => s + r.valorTotal, 0).toFixed(2)),
      totalPago: Number(groupOrders.reduce((s, r) => s + r.valorPago, 0).toFixed(2)),
      totalSaldo: Number(groupOrders.reduce((s, r) => s + r.saldoAReceber, 0).toFixed(2)),
    };
  };

  let groups: PedidosReportGroup[] = [];
  if (mappedRows.length > 0) {
    if (groupBy === 'nenhum') {
      groups = [summarizeGroup('ALL', '', mappedRows)];
    } else {
      const groupMap = new Map<string, { key: string; label: string; orders: PedidosReportOrderRow[] }>();
      mappedRows.forEach(row => {
        let key = '';
        let label = '';
        switch (groupBy) {
          case 'dataEntrega':
            key = row.dataEntregaKey || '__sem_data__';
            label = row.dataEntregaGroupLabel;
            break;
          case 'unidade':
            key = row.unidadeNome;
            label = row.unidadeNome;
            break;
          case 'modalidade':
            key = row.tipoEntrega;
            label = row.modalidadeLabel;
            break;
          case 'status':
            key = row.status;
            label = row.statusLabel;
            break;
          case 'cliente':
            key = row.clienteNome.toLowerCase();
            label = row.clienteNome;
            break;
        }
        const cur = groupMap.get(key) || { key, label, orders: [] };
        cur.orders.push(row);
        groupMap.set(key, cur);
      });

      const entries = Array.from(groupMap.values());
      if (groupBy === 'dataEntrega') {
        const dateDir = config.sortBy === 'dataEntrega' && config.sortDirection === 'desc' ? -1 : 1;
        entries.sort((a, b) => {
          if (a.key === '__sem_data__' && b.key !== '__sem_data__') return 1;
          if (b.key === '__sem_data__' && a.key !== '__sem_data__') return -1;
          return a.key.localeCompare(b.key) * dateDir;
        });
      } else {
        const textDir = config.sortBy === groupBy && config.sortDirection === 'desc' ? -1 : 1;
        entries.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR') * textDir);
      }

      groups = entries.map(e => summarizeGroup(e.key, e.label, e.orders));
    }
  }

  return {
    config: {
      ...config,
      groupBy,
      deliveryStartDate: startDate || undefined,
      deliveryEndDate: endDate || undefined,
    },
    selectedColumns,
    expandItems,
    orders: mappedRows,
    groups,
    groupLabel,
    groupHeaderPrefix,
    periodLabel,
    productSummary,
    unitLabel: filterContext?.unitLabel || 'Todas as Unidades',
    statusLabel: filterContext?.statusLabel || 'Todos os Status',
    scopeLabel: filterContext?.scopeLabel || `${mappedRows.length} pedido(s)`,
    searchTerm: filterContext?.searchTerm?.trim() || '',
    sortLabel,
    generatedAtLabel: `${dd}/${mm}/${yyyy} ${hh}:${min}`,
    totalOrders: mappedRows.length,
    deliveryCount,
    pickupCount,
    distinctUnitsCount,
    totalItemQuantity,
    grandTotalSubtotal,
    grandTotalTaxaEntrega,
    grandTotalDesconto,
    grandTotalValor,
    grandTotalPago,
    grandTotalSaldo,
  };
}
