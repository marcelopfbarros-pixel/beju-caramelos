import React, { useMemo, useState, useEffect } from 'react';
import { Customer, Order, Product, StoreUnit } from '../types';
import { formatCurrencyBR } from './CurrencyInput';
import { resolveOrderRegion } from '../utils/orderRegion';
import { BarChart3, ChevronDown, ChevronUp, MapPin } from 'lucide-react';

interface IndicadoresChartsProps {
  orders: Order[];
  products: Product[];
  customers: Customer[];
  units: StoreUnit[];
  canViewFinancials: boolean;
  isRegionExpanded: boolean;
  onToggleRegion: () => void;
  isProductExpanded: boolean;
  onToggleProduct: () => void;
}

type PeriodFilter = 'TODOS' | '30D' | 'MES';
type RegionScope = 'TODOS' | 'DELIVERY';
type ProductMetric = 'PEDIDOS' | 'QUANTIDADE' | 'VALOR';

const REGION_PALETTE = [
  '#059669', // emerald-600
  '#0284c7', // sky-600
  '#d97706', // amber-600
  '#7c3aed', // violet-600
  '#e11d48', // rose-600
  '#0d9488', // teal-600
];
const OTHERS_COLOR = '#64748b'; // slate-500

const PRODUCT_BAR_COLORS = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-teal-500',
];

function formatQuantity(qty: number): string {
  return Number.isInteger(qty)
    ? String(qty)
    : qty.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export const IndicadoresCharts: React.FC<IndicadoresChartsProps> = ({
  orders,
  products,
  customers,
  units,
  canViewFinancials,
  isRegionExpanded,
  onToggleRegion,
  isProductExpanded,
  onToggleProduct,
}) => {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('TODOS');
  const [regionScope, setRegionScope] = useState<RegionScope>('TODOS');
  const [productMetric, setProductMetric] = useState<ProductMetric>('PEDIDOS');
  const [selectedRegionKey, setSelectedRegionKey] = useState<string | null>(null);
  const [hoveredRegionKey, setHoveredRegionKey] = useState<string | null>(null);
  const [showAllRegions, setShowAllRegions] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);

  useEffect(() => {
    if (!canViewFinancials && productMetric === 'VALOR') {
      setProductMetric('PEDIDOS');
    }
  }, [canViewFinancials, productMetric]);

  const filteredOrders = useMemo(() => {
    if (periodFilter === 'TODOS') return orders;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const thirtyDaysAgoMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 30
    ).getTime();

    return orders.filter(order => {
      const dateStr = order.dataHoraEntrega || order.dataPedido;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return false;
      if (periodFilter === 'MES') {
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      }
      return d.getTime() >= thirtyDaysAgoMs;
    });
  }, [orders, periodFilter]);

  // 1. Pedidos por Região da Cidade
  const regionStats = useMemo(() => {
    const scoped =
      regionScope === 'DELIVERY'
        ? filteredOrders.filter(o => o.tipoEntrega === 'DELIVERY')
        : filteredOrders;

    const map = new Map<
      string,
      { key: string; label: string; count: number; revenue: number; isPickup: boolean }
    >();

    for (const order of scoped) {
      const region = resolveOrderRegion(order, customers, units);
      const existing = map.get(region.key);
      if (existing) {
        existing.count += 1;
        existing.revenue += order.valorTotal || 0;
      } else {
        map.set(region.key, {
          key: region.key,
          label: region.label,
          count: 1,
          revenue: order.valorTotal || 0,
          isPickup: region.isPickup,
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.count - a.count ||
        b.revenue - a.revenue ||
        a.label.localeCompare(b.label, 'pt-BR')
    );
  }, [filteredOrders, regionScope, customers, units]);

  const totalRegionOrders = useMemo(
    () => regionStats.reduce((sum, r) => sum + r.count, 0),
    [regionStats]
  );

  const donutSlices = useMemo(() => {
    if (regionStats.length === 0 || totalRegionOrders === 0) return [];
    const topSix = regionStats.slice(0, 6);
    const rest = regionStats.slice(6);

    const slices = topSix.map((item, idx) => ({
      key: item.key,
      label: item.label,
      count: item.count,
      revenue: item.revenue,
      pct: (item.count / totalRegionOrders) * 100,
      color: REGION_PALETTE[idx % REGION_PALETTE.length],
      isOthers: false,
    }));

    if (rest.length > 0) {
      const othersCount = rest.reduce((s, r) => s + r.count, 0);
      const othersRevenue = rest.reduce((s, r) => s + r.revenue, 0);
      slices.push({
        key: '__others__',
        label: `Outras regiões (${rest.length})`,
        count: othersCount,
        revenue: othersRevenue,
        pct: (othersCount / totalRegionOrders) * 100,
        color: OTHERS_COLOR,
        isOthers: true,
      });
    }

    return slices;
  }, [regionStats, totalRegionOrders]);

  const activeRegionKey = hoveredRegionKey ?? selectedRegionKey;

  const activeDonutKey = useMemo(() => {
    if (!activeRegionKey) return null;
    if (donutSlices.some(s => s.key === activeRegionKey)) return activeRegionKey;
    if (regionStats.slice(6).some(r => r.key === activeRegionKey)) return '__others__';
    return null;
  }, [activeRegionKey, donutSlices, regionStats]);

  const highlightedDetail = useMemo(() => {
    if (regionStats.length === 0 || totalRegionOrders === 0) return null;
    if (activeRegionKey === '__others__') {
      const othersSlice = donutSlices.find(s => s.key === '__others__');
      if (othersSlice) {
        return {
          key: othersSlice.key,
          label: othersSlice.label,
          count: othersSlice.count,
          revenue: othersSlice.revenue,
          pct: othersSlice.pct,
          color: othersSlice.color,
        };
      }
    }
    if (activeRegionKey) {
      const foundIdx = regionStats.findIndex(r => r.key === activeRegionKey);
      if (foundIdx >= 0) {
        const found = regionStats[foundIdx];
        return {
          key: found.key,
          label: found.label,
          count: found.count,
          revenue: found.revenue,
          pct: (found.count / totalRegionOrders) * 100,
          color: foundIdx < 6 ? REGION_PALETTE[foundIdx % REGION_PALETTE.length] : OTHERS_COLOR,
        };
      }
    }
    const first = regionStats[0];
    return {
      key: first.key,
      label: first.label,
      count: first.count,
      revenue: first.revenue,
      pct: (first.count / totalRegionOrders) * 100,
      color: REGION_PALETTE[0],
    };
  }, [regionStats, totalRegionOrders, activeRegionKey, donutSlices]);

  useEffect(() => {
    if (
      selectedRegionKey &&
      selectedRegionKey !== '__others__' &&
      !regionStats.some(r => r.key === selectedRegionKey)
    ) {
      setSelectedRegionKey(null);
    }
  }, [regionStats, selectedRegionKey]);

  const visibleRegions = showAllRegions ? regionStats : regionStats.slice(0, 6);

  // SVG Donut geometry
  const donutRadius = 38;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let cumulativeOffset = 0;

  // 2. Pedidos por Produto
  const productStats = useMemo(() => {
    const prodMap = new Map(products.map(p => [p.id, p]));
    const aggMap = new Map<
      string,
      {
        produtoId: string;
        descricao: string;
        sku: string;
        unidade: string;
        orderIds: Set<string>;
        totalQty: number;
        totalRevenue: number;
      }
    >();

    for (const order of filteredOrders) {
      for (const item of order.itens || []) {
        const prod = prodMap.get(item.produtoId);
        const existing = aggMap.get(item.produtoId);
        const qty = Number(item.quantidade) || 0;
        const rev = Number(item.subtotal ?? qty * (Number(item.precoUnitario) || 0)) || 0;
        if (existing) {
          existing.orderIds.add(order.id);
          existing.totalQty += qty;
          existing.totalRevenue += rev;
        } else {
          aggMap.set(item.produtoId, {
            produtoId: item.produtoId,
            descricao: prod?.descricao || 'Produto removido',
            sku: prod?.sku || '',
            unidade: (prod?.unidade || 'UN').toLowerCase(),
            orderIds: new Set([order.id]),
            totalQty: qty,
            totalRevenue: rev,
          });
        }
      }
    }

    const list = Array.from(aggMap.values()).map(item => ({
      produtoId: item.produtoId,
      descricao: item.descricao,
      sku: item.sku,
      unidade: item.unidade,
      ordersCount: item.orderIds.size,
      totalQty: item.totalQty,
      totalRevenue: item.totalRevenue,
    }));

    return list.sort((a, b) => {
      if (productMetric === 'QUANTIDADE') {
        return (
          b.totalQty - a.totalQty ||
          b.ordersCount - a.ordersCount ||
          a.descricao.localeCompare(b.descricao, 'pt-BR')
        );
      }
      if (productMetric === 'VALOR') {
        return (
          b.totalRevenue - a.totalRevenue ||
          b.ordersCount - a.ordersCount ||
          a.descricao.localeCompare(b.descricao, 'pt-BR')
        );
      }
      return (
        b.ordersCount - a.ordersCount ||
        b.totalQty - a.totalQty ||
        a.descricao.localeCompare(b.descricao, 'pt-BR')
      );
    });
  }, [filteredOrders, products, productMetric]);

  const getProductMetricValue = (item: (typeof productStats)[number]): number => {
    if (productMetric === 'QUANTIDADE') return item.totalQty;
    if (productMetric === 'VALOR') return item.totalRevenue;
    return item.ordersCount;
  };

  const totalProductMetric = useMemo(
    () => productStats.reduce((sum, p) => sum + getProductMetricValue(p), 0),
    [productStats, productMetric]
  );

  const maxProductMetric = productStats[0] ? getProductMetricValue(productStats[0]) || 1 : 1;
  const visibleProducts = showAllProducts ? productStats : productStats.slice(0, 6);

  const renderPeriodBar = () => (
    <div className="flex items-center justify-between gap-2 bg-white/80 border border-slate-200/80 rounded-xl px-2.5 py-1.5">
      <div className="inline-flex bg-white p-0.5 rounded-lg border border-slate-200">
        {(
          [
            { value: 'TODOS', label: 'Todos' },
            { value: '30D', label: '30d' },
            { value: 'MES', label: 'Mês' },
          ] as const
        ).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPeriodFilter(opt.value)}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
              periodFilter === opt.value
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <span className="text-[10px] font-mono font-semibold text-slate-500 shrink-0">
        {filteredOrders.length} ped.
      </span>
    </div>
  );

  return (
    <div className="space-y-3 w-full max-w-full min-w-0 overflow-hidden">
      {/* Gráfico 1: Pedidos por Região da Cidade */}
      <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/70 shadow-2xs min-w-0 overflow-hidden">
        <button
          type="button"
          onClick={onToggleRegion}
          aria-expanded={isRegionExpanded}
          className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-amber-100/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700 truncate">
              Pedidos por Região
            </span>
          </div>
          {isRegionExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          )}
        </button>

        {isRegionExpanded && (
          <div className="p-3 border-t border-amber-200/70 space-y-2.5 min-w-0">
            {renderPeriodBar()}

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                Escopo
              </span>
              <div className="inline-flex bg-white/80 p-0.5 rounded-lg border border-amber-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setRegionScope('TODOS')}
                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    regionScope === 'TODOS'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setRegionScope('DELIVERY')}
                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    regionScope === 'DELIVERY'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Delivery
                </button>
              </div>
            </div>

        {regionStats.length === 0 ? (
          <div className="py-5 text-center text-[11px] text-slate-400">
            Nenhum pedido encontrado para este recorte.
          </div>
        ) : (
          <>
            {/* Donut + Detalhe em destaque */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-24 h-24 shrink-0">
                <svg viewBox="0 0 120 120" className="w-24 h-24 -rotate-90">
                  <circle
                    cx="60"
                    cy="60"
                    r={donutRadius}
                    fill="transparent"
                    stroke="#f1f5f9"
                    strokeWidth="14"
                  />
                  {donutSlices.map(slice => {
                    const segLen = (slice.count / totalRegionOrders) * donutCircumference;
                    const gap = donutSlices.length > 1 ? 1.5 : 0;
                    const visibleLen = Math.max(0.5, segLen - gap);
                    const dashOffset = -cumulativeOffset;
                    cumulativeOffset += segLen;
                    const isActive = activeDonutKey === slice.key;
                    const isDimmed = Boolean(activeDonutKey) && !isActive;

                    return (
                      <circle
                        key={slice.key}
                        cx="60"
                        cy="60"
                        r={donutRadius}
                        fill="transparent"
                        stroke={slice.color}
                        strokeWidth={isActive ? 16 : 14}
                        strokeDasharray={`${visibleLen} ${donutCircumference}`}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="butt"
                        opacity={isDimmed ? 0.35 : 1}
                        className="cursor-pointer transition-all duration-150"
                        onMouseEnter={() => setHoveredRegionKey(slice.key)}
                        onMouseLeave={() => setHoveredRegionKey(null)}
                        onClick={() =>
                          setSelectedRegionKey(prev => (prev === slice.key ? null : slice.key))
                        }
                      >
                        <title>
                          {slice.label}: {slice.count} ped. ({slice.pct.toFixed(0)}%)
                        </title>
                      </circle>
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
                  {activeDonutKey && highlightedDetail ? (
                    <>
                      <span className="text-xs font-mono font-bold text-slate-900 leading-none">
                        {highlightedDetail.pct.toFixed(0)}%
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 leading-tight mt-0.5">
                        {highlightedDetail.count} ped.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-mono font-bold text-slate-900 leading-none">
                        {totalRegionOrders}
                      </span>
                      <span className="text-[9px] text-slate-500 leading-tight mt-0.5">
                        pedidos
                      </span>
                    </>
                  )}
                </div>
              </div>

              {highlightedDetail && (
                <div className="min-w-0 flex-1 bg-white/80 border border-amber-200/70 rounded-lg p-2 space-y-0.5">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 block">
                    {activeRegionKey ? 'Selecionado' : 'Líder'}
                  </span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: highlightedDetail.color }}
                    />
                    <span
                      className="text-xs font-bold text-slate-900 truncate"
                      title={highlightedDetail.label}
                    >
                      {highlightedDetail.label}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-600">
                    {highlightedDetail.count}{' '}
                    {highlightedDetail.count === 1 ? 'pedido' : 'pedidos'} (
                    {highlightedDetail.pct.toFixed(0)}%)
                  </div>
                  {canViewFinancials && (
                    <div className="text-[10px] font-mono font-bold text-emerald-700">
                      R$ {formatCurrencyBR(highlightedDetail.revenue)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Legenda compacta das regiões */}
            <div className="divide-y divide-amber-200/50 border-t border-amber-200/60 pt-1">
              {visibleRegions.map((region, idx) => {
                const color =
                  idx < 6 ? REGION_PALETTE[idx % REGION_PALETTE.length] : OTHERS_COLOR;
                const pct = totalRegionOrders > 0 ? (region.count / totalRegionOrders) * 100 : 0;
                const isActive =
                  activeRegionKey === region.key ||
                  (activeRegionKey === '__others__' && idx >= 6);

                return (
                  <button
                    key={region.key}
                    type="button"
                    onMouseEnter={() => setHoveredRegionKey(region.key)}
                    onMouseLeave={() => setHoveredRegionKey(null)}
                    onClick={() =>
                      setSelectedRegionKey(prev => (prev === region.key ? null : region.key))
                    }
                    className={`w-full text-left rounded-md px-1.5 py-1 transition-colors cursor-pointer flex items-center justify-between gap-2 text-[10px] ${
                      isActive ? 'bg-white/90 ring-1 ring-amber-200' : 'hover:bg-white/60'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span
                        className="font-semibold text-slate-800 truncate"
                        title={region.label}
                      >
                        {region.label}
                      </span>
                    </div>
                    <span className="font-mono text-slate-600 shrink-0">
                      <strong className="text-slate-900">{region.count}</strong> ({pct.toFixed(0)}%)
                    </span>
                  </button>
                );
              })}
            </div>

            {regionStats.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllRegions(prev => !prev)}
                className="w-full py-1 text-[10px] font-bold text-amber-800 hover:text-amber-900 hover:bg-amber-100/70 rounded-lg transition-colors cursor-pointer"
              >
                {showAllRegions
                  ? 'Mostrar top 6'
                  : `Ver todas (${regionStats.length})`}
              </button>
            )}
          </>
        )}
          </div>
        )}
      </div>

      {/* Gráfico 2: Pedidos por Produto */}
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50/70 shadow-2xs min-w-0 overflow-hidden">
        <button
          type="button"
          onClick={onToggleProduct}
          aria-expanded={isProductExpanded}
          className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-violet-100/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <BarChart3 className="w-3.5 h-3.5 text-violet-600 shrink-0" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700 truncate">
              Pedidos por Produto
            </span>
          </div>
          {isProductExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          )}
        </button>

        {isProductExpanded && (
          <div className="p-3 border-t border-violet-200/70 space-y-2.5 min-w-0">
            {renderPeriodBar()}

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                Ordenar
              </span>
              <div className="inline-flex bg-white/80 p-0.5 rounded-lg border border-violet-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setProductMetric('PEDIDOS')}
                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    productMetric === 'PEDIDOS'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Ped.
                </button>
                <button
                  type="button"
                  onClick={() => setProductMetric('QUANTIDADE')}
                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    productMetric === 'QUANTIDADE'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Qtd
                </button>
                {canViewFinancials && (
                  <button
                    type="button"
                    onClick={() => setProductMetric('VALOR')}
                    className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                      productMetric === 'VALOR'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    R$
                  </button>
                )}
              </div>
            </div>

        {productStats.length === 0 ? (
          <div className="py-5 text-center text-[11px] text-slate-400">
            Nenhum item vendido neste período.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {visibleProducts.map((item, idx) => {
                const metricVal = getProductMetricValue(item);
                const sharePct =
                  totalProductMetric > 0 ? (metricVal / totalProductMetric) * 100 : 0;
                const barWidth =
                  metricVal > 0 ? Math.max(4, (metricVal / maxProductMetric) * 100) : 0;
                const barColor = PRODUCT_BAR_COLORS[idx % PRODUCT_BAR_COLORS.length];
                const fullTitle = item.sku
                  ? `${item.descricao} (${item.sku})`
                  : item.descricao;

                const primaryLabel =
                  productMetric === 'QUANTIDADE'
                    ? `${formatQuantity(item.totalQty)} ${item.unidade}`
                    : productMetric === 'VALOR'
                    ? `R$ ${formatCurrencyBR(item.totalRevenue)}`
                    : `${item.ordersCount} ped.`;

                const secondaryLabel =
                  productMetric === 'QUANTIDADE'
                    ? `${item.ordersCount} ped.`
                    : productMetric === 'VALOR'
                    ? `${item.ordersCount} ped.`
                    : `${formatQuantity(item.totalQty)} ${item.unidade}`;

                return (
                  <div key={item.produtoId} className="space-y-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="inline-flex items-center justify-center px-1 py-0.2 rounded bg-white/80 border border-violet-200/70 text-violet-800 font-mono font-bold text-[9px] shrink-0">
                          #{idx + 1}
                        </span>
                        <span
                          className="font-semibold text-slate-800 truncate"
                          title={fullTitle}
                        >
                          {item.descricao}
                        </span>
                      </div>
                      <span className="font-mono text-slate-600 shrink-0 whitespace-nowrap">
                        <strong className="text-slate-900">{primaryLabel}</strong> ·{' '}
                        {secondaryLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/80 border border-violet-200/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono font-semibold text-slate-500 w-7 text-right shrink-0">
                        {sharePct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {productStats.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllProducts(prev => !prev)}
                className="w-full py-1 text-[10px] font-bold text-violet-800 hover:text-violet-900 hover:bg-violet-100/70 rounded-lg transition-colors cursor-pointer"
              >
                {showAllProducts
                  ? 'Mostrar top 6'
                  : `Ver todos (${productStats.length})`}
              </button>
            )}
          </>
        )}
          </div>
        )}
      </div>
    </div>
  );
};
