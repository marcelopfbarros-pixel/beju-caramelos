import {
  FinancialPaymentCategory,
  FinancialPaymentChannel,
  InvoiceStatus,
  Order,
  OrderFinancialPaymentEntry,
  OrderFinancialRecord,
  ReconciliationStatus,
} from '../types';
import { isReplenishmentOrder } from './orderStatusStyles';
import { getEffectivePaymentStatus } from './paymentStatus';

export const DEFAULT_FINANCIAL_PAYMENT_CHANNELS: FinancialPaymentChannel[] = [
  { id: 'fin-ch-pixc6', nome: 'PixC6', categoria: 'PIX', exigeNfPadrao: true, ativo: true, ordem: 1 },
  { id: 'fin-ch-c6pay', nome: 'C6pay', categoria: 'CARTAO', exigeNfPadrao: true, ativo: true, ordem: 2 },
  { id: 'fin-ch-sumup', nome: 'Sumup', categoria: 'CARTAO', exigeNfPadrao: true, ativo: true, ordem: 3 },
  { id: 'fin-ch-dinheiro', nome: 'Dinheiro', categoria: 'DINHEIRO', exigeNfPadrao: true, ativo: true, ordem: 4 },
  { id: 'fin-ch-bonificado', nome: 'Bonificado', categoria: 'BONIFICADO', exigeNfPadrao: false, ativo: true, ordem: 5 },
  { id: 'fin-ch-boleto', nome: 'Boleto', categoria: 'BOLETO', exigeNfPadrao: true, ativo: true, ordem: 6 },
  { id: 'fin-ch-rede', nome: 'Rede', categoria: 'CARTAO', exigeNfPadrao: true, ativo: true, ordem: 7 },
];

export const FINANCIAL_CATEGORY_LABELS: Record<FinancialPaymentCategory, string> = {
  PIX: 'PIX',
  CARTAO: 'Cartão / Maquininha',
  DINHEIRO: 'Dinheiro',
  BOLETO: 'Boleto Bancário',
  BONIFICADO: 'Bonificado / Cortesia',
  OUTROS: 'Outros',
};

export const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatus, string> = {
  PENDENTE: 'Pendente',
  PARCIAL: 'Parcial',
  CONCILIADO: 'Conciliado',
};

export const RECONCILIATION_STATUS_BADGES: Record<ReconciliationStatus, string> = {
  PENDENTE: 'bg-amber-100 text-amber-800 border-amber-300',
  PARCIAL: 'bg-sky-100 text-sky-800 border-sky-300',
  CONCILIADO: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDENTE: 'A emitir',
  EMITIDA: 'NF Emitida',
  DISPENSADA: 'NF Dispensada',
};

export const INVOICE_STATUS_BADGES: Record<InvoiceStatus, string> = {
  PENDENTE: 'bg-rose-100 text-rose-800 border-rose-300',
  EMITIDA: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  DISPENSADA: 'bg-slate-100 text-slate-700 border-slate-300',
};

export function toLocalDateInput(date?: Date | string): string {
  if (typeof date === 'string') {
    const trimmed = date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return '';
  }
  const d = date instanceof Date ? date : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isFutureDateInput(dateStr?: string | null): boolean {
  const normalized = (dateStr || '').trim();
  if (!normalized) return false;
  const localDate = toLocalDateInput(normalized);
  if (!localDate) return false;
  return localDate > toLocalDateInput();
}

export function formatDateBR(dateStr?: string): string {
  if (!dateStr) return '—';
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleDateString('pt-BR');
}

export function isOrderEligibleForFinancial(order: Order): boolean {
  return order.status !== 'CANCELADO' && !isReplenishmentOrder(order);
}

export function isOrderOperationallyReadyForInvoice(order: Order): boolean {
  return (
    order.status === 'PRONTO' ||
    order.status === 'EM_ROTA' ||
    order.status === 'ENTREGUE'
  );
}

export function getEffectiveReconciliationStatus(
  _order: Order,
  record?: OrderFinancialRecord
): ReconciliationStatus {
  return record?.conciliacaoStatus || 'PENDENTE';
}

export function getEffectiveInvoiceStatus(
  record?: OrderFinancialRecord
): InvoiceStatus {
  return record?.nfStatus || 'PENDENTE';
}

export function isOrderPaidAndAwaitingStatement(
  order: Order,
  record?: OrderFinancialRecord
): boolean {
  return (
    getEffectivePaymentStatus(order) === 'PAGO' &&
    getEffectiveReconciliationStatus(order, record) !== 'CONCILIADO'
  );
}

export function isOrderReadyForInvoice(
  order: Order,
  record?: OrderFinancialRecord
): boolean {
  const reconciled = getEffectiveReconciliationStatus(order, record) === 'CONCILIADO';
  const paidOnOrder = getEffectivePaymentStatus(order) === 'PAGO';
  return (
    (reconciled || paidOnOrder) &&
    getEffectiveInvoiceStatus(record) === 'PENDENTE' &&
    isOrderOperationallyReadyForInvoice(order)
  );
}

export function isOrderPendingFinancialAction(
  order: Order,
  record?: OrderFinancialRecord
): boolean {
  if (!isOrderEligibleForFinancial(order)) return false;
  return (
    getEffectiveReconciliationStatus(order, record) !== 'CONCILIADO' ||
    getEffectiveInvoiceStatus(record) === 'PENDENTE'
  );
}

export const FINANCIAL_PENDING_GROUP_ORDER = [
  'Não Conciliados',
  'NF não emitida',
  'NF emitida',
] as const;

export function getFinancialPendingGroupLabel(
  order: Order,
  record?: OrderFinancialRecord
): string {
  if (getEffectiveReconciliationStatus(order, record) !== 'CONCILIADO') {
    return 'Não Conciliados';
  }
  if (getEffectiveInvoiceStatus(record) === 'PENDENTE') {
    return 'NF não emitida';
  }
  return 'NF emitida';
}

function resolveChannelForEntry(
  entry: OrderFinancialPaymentEntry,
  channels: FinancialPaymentChannel[]
): FinancialPaymentChannel | undefined {
  if (entry.meioPagamentoId) {
    const byId = channels.find(c => c.id === entry.meioPagamentoId);
    if (byId) return byId;
  }
  const nomeLower = (entry.meioPagamentoNome || '').trim().toLowerCase();
  if (!nomeLower) return undefined;
  return channels.find(c => c.nome.trim().toLowerCase() === nomeLower);
}

export function isEntryBonificado(
  entry: OrderFinancialPaymentEntry,
  channels: FinancialPaymentChannel[]
): boolean {
  const ch = resolveChannelForEntry(entry, channels);
  if (ch) return ch.categoria === 'BONIFICADO' || !ch.exigeNfPadrao;
  return (entry.meioPagamentoNome || '').toLowerCase().includes('bonificad');
}

export function isEntryCash(
  entry: OrderFinancialPaymentEntry,
  channels: FinancialPaymentChannel[]
): boolean {
  const ch = resolveChannelForEntry(entry, channels);
  if (ch) return ch.categoria === 'DINHEIRO';
  return (entry.meioPagamentoNome || '').toLowerCase().includes('dinheiro');
}

export function isEntryReconciled(
  entry: OrderFinancialPaymentEntry,
  channels: FinancialPaymentChannel[]
): boolean {
  const nome = (entry.meioPagamentoNome || '').trim();
  if (!nome) return false;
  if (isEntryBonificado(entry, channels)) return true;

  const valor = Number(entry.valor) || 0;
  if (valor <= 0) return false;

  if (isFutureDateInput(entry.dataExtrato)) return false;

  if (isEntryCash(entry, channels)) {
    const effectiveDate = (entry.dataExtrato || '').trim() || (entry.dataPagamento || '').trim();
    return Boolean(effectiveDate) && !isFutureDateInput(effectiveDate);
  }
  return Boolean((entry.dataExtrato || '').trim());
}

export function getEntryMissingDateWarning(
  entry: OrderFinancialPaymentEntry,
  channels: FinancialPaymentChannel[]
): string | null {
  if (isFutureDateInput(entry.dataExtrato)) {
    return 'A data informada no extrato não pode ser futura.';
  }

  const nome = (entry.meioPagamentoNome || '').trim();
  const valor = Number(entry.valor) || 0;
  if (!nome || valor <= 0 || isEntryBonificado(entry, channels)) return null;

  if (isEntryCash(entry, channels)) {
    if (!(entry.dataExtrato || '').trim() && isFutureDateInput(entry.dataPagamento)) {
      return 'A data informada no extrato não pode ser futura.';
    }
    if (!(entry.dataPagamento || '').trim() && !(entry.dataExtrato || '').trim()) {
      return 'Informe a Data do Pagamento para confirmar a conciliação em dinheiro.';
    }
    return null;
  }

  if (!(entry.dataExtrato || '').trim()) {
    return 'Informe a Data no Extrato para confirmar a conciliação bancária.';
  }
  return null;
}

export interface ConciliatedTotalsResult {
  reconciledEntries: OrderFinancialPaymentEntry[];
  valorConciliado: number;
  valorValidadoExtrato: number;
  hasBonificado: boolean;
  canMarkConciliated: boolean;
}

export function computeConciliatedTotals(
  order: Order,
  entries: OrderFinancialPaymentEntry[],
  channels: FinancialPaymentChannel[]
): ConciliatedTotalsResult {
  const reconciledEntries = entries.filter(e => isEntryReconciled(e, channels));
  const hasBonificado = reconciledEntries.some(e => isEntryBonificado(e, channels));
  const valorValidadoExtrato = Number(
    reconciledEntries
      .reduce((sum, e) => sum + Math.max(0, Number(e.valor) || 0), 0)
      .toFixed(2)
  );
  const totalPedido = Math.max(0, Number(order.valorTotal) || 0);
  const saldoDevedorValidado = hasBonificado
    ? 0
    : Math.max(0, Number((totalPedido - valorValidadoExtrato).toFixed(2)));
  const canMarkConciliated =
    hasBonificado || (valorValidadoExtrato > 0 && saldoDevedorValidado <= 0.009);
  return {
    reconciledEntries,
    valorConciliado: valorValidadoExtrato,
    valorValidadoExtrato,
    hasBonificado,
    canMarkConciliated,
  };
}

export function deriveReconciliationState(
  order: Order,
  entries: OrderFinancialPaymentEntry[],
  channels: FinancialPaymentChannel[],
  manualConciliated = false
): {
  valorConciliado: number;
  conciliacaoStatus: ReconciliationStatus;
  canMarkConciliated: boolean;
} {
  const { valorValidadoExtrato, canMarkConciliated } = computeConciliatedTotals(
    order,
    entries,
    channels
  );
  const totalPedido = Math.max(0, Number(order.valorTotal) || 0);

  if (manualConciliated && canMarkConciliated) {
    return {
      valorConciliado: valorValidadoExtrato,
      conciliacaoStatus: 'CONCILIADO',
      canMarkConciliated,
    };
  }

  if (valorValidadoExtrato <= 0) {
    return {
      valorConciliado: 0,
      conciliacaoStatus: 'PENDENTE',
      canMarkConciliated,
    };
  }

  if (valorValidadoExtrato + 0.009 < totalPedido) {
    return {
      valorConciliado: valorValidadoExtrato,
      conciliacaoStatus: 'PARCIAL',
      canMarkConciliated,
    };
  }

  return {
    valorConciliado: valorValidadoExtrato,
    conciliacaoStatus: 'PENDENTE',
    canMarkConciliated,
  };
}

export interface FinancialSummaryResult {
  totalOrders: number;
  pendingReconciliationCount: number;
  pendingReconciliationAmount: number;
  readyForInvoiceCount: number;
  readyForInvoiceAmount: number;
  pendingInvoiceTotalCount: number;
  pendingInvoiceTotalAmount: number;
  completedCount: number;
  completedAmount: number;
  totalConciliatedAmount: number;
  byChannel: Array<{ nome: string; count: number; amount: number }>;
}

export function computeFinancialSummary(
  orders: Order[],
  recordsByOrderId: Map<string, OrderFinancialRecord>,
  channels: FinancialPaymentChannel[]
): FinancialSummaryResult {
  let totalOrders = 0;
  let pendingReconciliationCount = 0;
  let pendingReconciliationAmount = 0;
  let readyForInvoiceCount = 0;
  let readyForInvoiceAmount = 0;
  let pendingInvoiceTotalCount = 0;
  let pendingInvoiceTotalAmount = 0;
  let completedCount = 0;
  let completedAmount = 0;
  let totalConciliatedAmount = 0;

  const channelTotals = new Map<string, { orderIds: Set<string>; amount: number }>();

  for (const order of orders) {
    if (!isOrderEligibleForFinancial(order)) continue;
    totalOrders += 1;

    const record = recordsByOrderId.get(order.id);
    const recStatus = getEffectiveReconciliationStatus(order, record);
    const nfStatus = getEffectiveInvoiceStatus(record);
    const valorTotal = Math.max(0, Number(order.valorTotal) || 0);
    const valorConciliado = Math.max(0, Number(record?.valorConciliado) || 0);
    const countedConciliated =
      recStatus === 'CONCILIADO' || recStatus === 'PARCIAL' ? valorConciliado : 0;

    totalConciliatedAmount += countedConciliated;

    if (recStatus !== 'CONCILIADO') {
      pendingReconciliationCount += 1;
      pendingReconciliationAmount += Math.max(0, valorTotal - countedConciliated);
    }

    if (nfStatus === 'PENDENTE') {
      pendingInvoiceTotalCount += 1;
      pendingInvoiceTotalAmount += valorTotal;
      if (isOrderReadyForInvoice(order, record)) {
        readyForInvoiceCount += 1;
        readyForInvoiceAmount += valorTotal;
      }
    }

    if (recStatus === 'CONCILIADO' && nfStatus !== 'PENDENTE') {
      completedCount += 1;
      completedAmount += valorTotal;
    }

    if (record && (recStatus === 'CONCILIADO' || recStatus === 'PARCIAL')) {
      const entries = record.lancamentos || [];
      if (entries.length > 0) {
        for (const entry of entries) {
          if (!isEntryReconciled(entry, channels)) continue;
          const nome = (entry.meioPagamentoNome || '').trim();
          const val = Math.max(0, Number(entry.valor) || 0);
          if (!nome) continue;
          const bucket = channelTotals.get(nome) || { orderIds: new Set<string>(), amount: 0 };
          bucket.orderIds.add(order.id);
          bucket.amount += val;
          channelTotals.set(nome, bucket);
        }
      } else if (record.meioPagamentoNome) {
        const nome = record.meioPagamentoNome.trim();
        const bucket = channelTotals.get(nome) || { orderIds: new Set<string>(), amount: 0 };
        bucket.orderIds.add(order.id);
        bucket.amount += valorConciliado;
        channelTotals.set(nome, bucket);
      }
    }
  }

  const orderedNames: string[] = [];
  const seen = new Set<string>();
  const sortedChannels = [...channels].sort(
    (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR')
  );
  for (const ch of sortedChannels) {
    if (ch.ativo || channelTotals.has(ch.nome)) {
      orderedNames.push(ch.nome);
      seen.add(ch.nome);
    }
  }
  for (const name of channelTotals.keys()) {
    if (!seen.has(name)) {
      orderedNames.push(name);
    }
  }

  const byChannel = orderedNames.map(nome => {
    const bucket = channelTotals.get(nome);
    return {
      nome,
      count: bucket ? bucket.orderIds.size : 0,
      amount: bucket ? Number(bucket.amount.toFixed(2)) : 0,
    };
  });

  return {
    totalOrders,
    pendingReconciliationCount,
    pendingReconciliationAmount: Number(pendingReconciliationAmount.toFixed(2)),
    readyForInvoiceCount,
    readyForInvoiceAmount: Number(readyForInvoiceAmount.toFixed(2)),
    pendingInvoiceTotalCount,
    pendingInvoiceTotalAmount: Number(pendingInvoiceTotalAmount.toFixed(2)),
    completedCount,
    completedAmount: Number(completedAmount.toFixed(2)),
    totalConciliatedAmount: Number(totalConciliatedAmount.toFixed(2)),
    byChannel,
  };
}
