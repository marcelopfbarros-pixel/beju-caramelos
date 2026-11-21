import { Order, PaymentStatus } from '../types';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDENTE: 'Pendente',
  SINAL: 'Sinal',
  PAGO: 'Pago',
};

export const PAYMENT_STATUS_BADGE_CLASSES: Record<PaymentStatus, string> = {
  PENDENTE: 'bg-amber-50 text-amber-800 border-amber-200',
  SINAL: 'bg-sky-50 text-sky-700 border-sky-200',
  PAGO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export function getEffectivePaymentStatus(order: Partial<Order>): PaymentStatus {
  return order.statusPagamento || 'PENDENTE';
}

export function getOrderPaidAmount(order: Partial<Order>): number {
  const total = Math.max(0, order.valorTotal || 0);
  const status = getEffectivePaymentStatus(order);
  if (status === 'PAGO') return Number(total.toFixed(2));
  if (status === 'SINAL') {
    if (typeof order.valorPago === 'number' && Number.isFinite(order.valorPago) && order.valorPago >= 0) {
      return Number(Math.min(total, Math.max(0, order.valorPago)).toFixed(2));
    }
    return Number((total / 2).toFixed(2));
  }
  return 0;
}

export function getOrderRemainingAmount(order: Partial<Order>): number {
  const total = Math.max(0, order.valorTotal || 0);
  const paid = getOrderPaidAmount(order);
  return Math.max(0, Number((total - paid).toFixed(2)));
}

const PAYMENT_TAG_REGEX = /\s*\[\[PAGTO:(PENDENTE|SINAL|PAGO)(?::(\d+(?:\.\d+)?))?\]\]\s*/;

export function encodePaymentInstructions(
  baseText?: string,
  statusPagamento?: PaymentStatus,
  valorPago?: number
): string | null {
  const cleanBase = (baseText || '').replace(PAYMENT_TAG_REGEX, '').trim();
  const status = statusPagamento || 'PENDENTE';
  if (status === 'PENDENTE') {
    return cleanBase || null;
  }
  const tag =
    status === 'SINAL' && typeof valorPago === 'number' && Number.isFinite(valorPago) && valorPago > 0
      ? `[[PAGTO:SINAL:${valorPago.toFixed(2)}]]`
      : `[[PAGTO:${status}]]`;
  return cleanBase ? `${cleanBase} ${tag}` : tag;
}

export function decodePaymentInstructions(raw?: string | null): {
  instrucoesPagamento: string;
  statusPagamento: PaymentStatus;
  valorPago?: number;
} {
  const text = raw || '';
  const match = text.match(PAYMENT_TAG_REGEX);
  const cleanBase = text.replace(PAYMENT_TAG_REGEX, '').trim();
  if (!match) {
    return {
      instrucoesPagamento: cleanBase,
      statusPagamento: 'PENDENTE',
    };
  }
  const status = match[1] as PaymentStatus;
  const parsedPaid = match[2] ? Number(match[2]) : undefined;
  return {
    instrucoesPagamento: cleanBase,
    statusPagamento: status,
    valorPago: typeof parsedPaid === 'number' && Number.isFinite(parsedPaid) ? parsedPaid : undefined,
  };
}
