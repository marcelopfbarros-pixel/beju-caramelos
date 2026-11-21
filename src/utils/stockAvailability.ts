import { Order, OrderStatus, StockItem } from '../types';

export const RESERVED_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'CONFIRMADO',
  'EM_PRODUCAO',
  'PRONTO',
  'EM_ROTA',
]);

export function stockReservationKey(unidadeId: string, produtoId: string): string {
  return `${unidadeId}::${produtoId}`;
}

export function computeReservedStockMap(
  orders: Order[],
  excludeOrderId?: string
): Map<string, number> {
  const reserved = new Map<string, number>();
  for (const order of orders) {
    if (excludeOrderId && order.id === excludeOrderId) continue;
    if (!RESERVED_ORDER_STATUSES.has(order.status)) continue;
    if (!order.unidadeOrigemId || !order.itens) continue;

    for (const item of order.itens) {
      if (item.quantidade <= 0) continue;
      const key = stockReservationKey(order.unidadeOrigemId, item.produtoId);
      reserved.set(key, (reserved.get(key) || 0) + item.quantidade);
    }
  }
  return reserved;
}

export function getUnitProductAvailability(
  stock: StockItem[],
  reservedMap: Map<string, number>,
  unidadeId: string,
  produtoId: string
): { atual: number; reservado: number; disponivel: number } {
  const stockEntry = stock.find(
    s => s.unidadeId === unidadeId && s.produtoId === produtoId
  );
  const atual = stockEntry ? stockEntry.quantidadeAtual : 0;
  const reservado = reservedMap.get(stockReservationKey(unidadeId, produtoId)) || 0;
  return {
    atual,
    reservado,
    disponivel: Math.max(0, atual - reservado),
  };
}
