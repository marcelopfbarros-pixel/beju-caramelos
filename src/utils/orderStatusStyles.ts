import { Order, OrderStatus } from '../types';

export function isReplenishmentOrder(order: Pick<Order, 'numeroPedido' | 'observacoes'>): boolean {
  return (
    order.numeroPedido.startsWith('#REP-') ||
    Boolean(order.observacoes?.includes('Pedido Especial de Reposição'))
  );
}

export const REPLENISHMENT_CARD_STYLE =
  'bg-sky-50/90 border-sky-400 hover:border-sky-500 ring-1 ring-sky-200';

/**
 * Progressão de cores para cards de Pedidos e Entregas conforme o status:
 * tons mais claros (verde) -> intermediários (amarelo/laranja) -> mais vivos (vermelho),
 * preservando contraste e legibilidade do texto.
 */
export const ORDER_CARD_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDENTE: 'bg-emerald-50/75 border-emerald-200 hover:border-emerald-400',
  CONFIRMADO: 'bg-lime-50/80 border-lime-300 hover:border-lime-400',
  EM_PRODUCAO: 'bg-amber-50/90 border-amber-300 hover:border-amber-400',
  PRONTO: 'bg-orange-50 border-orange-300 hover:border-orange-400',
  EM_ROTA: 'bg-orange-100/85 border-orange-400 hover:border-orange-500',
  ENTREGUE: 'bg-rose-100/85 border-rose-400 hover:border-rose-500',
  CANCELADO: 'bg-red-100/90 border-red-400 hover:border-red-500',
};
