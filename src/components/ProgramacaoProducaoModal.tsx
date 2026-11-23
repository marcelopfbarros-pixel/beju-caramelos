import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Category, Order, Product, ProductionShift, StoreUnit } from '../types';
import { X, Printer, Download, Calendar, Store } from 'lucide-react';

interface ProgramacaoProducaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  products: Product[];
  categories: Category[];
  units?: StoreUnit[];
  activeUnitId?: string;
  startDate: string;
  endDate: string;
  selectedShifts: ProductionShift[];
  onChangeStartDate: (val: string) => void;
  onChangeEndDate: (val: string) => void;
  onChangeSelectedShifts: (shifts: ProductionShift[]) => void;
}

export function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getShiftFromIso(iso: string): ProductionShift {
  const h = new Date(iso).getHours();
  if (h < 12) return 'MANHA';
  if (h < 18) return 'TARDE';
  return 'NOITE';
}

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SHIFT_LABELS: Record<ProductionShift, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  NOITE: 'Noite',
};

const CATEGORY_PALETTES = [
  { header: 'bg-rose-50 text-rose-900 border-rose-200', sub: 'bg-rose-50/60 text-rose-950', total: 'bg-rose-50 text-rose-700' },
  { header: 'bg-amber-50 text-amber-900 border-amber-200', sub: 'bg-amber-50/60 text-amber-950', total: 'bg-amber-50 text-amber-800' },
  { header: 'bg-indigo-50 text-indigo-900 border-indigo-200', sub: 'bg-indigo-50/60 text-indigo-950', total: 'bg-indigo-50 text-indigo-700' },
  { header: 'bg-emerald-50 text-emerald-900 border-emerald-200', sub: 'bg-emerald-50/60 text-emerald-950', total: 'bg-emerald-50 text-emerald-700' },
  { header: 'bg-purple-50 text-purple-900 border-purple-200', sub: 'bg-purple-50/60 text-purple-950', total: 'bg-purple-50 text-purple-700' },
];

export const ProgramacaoProducaoModal: React.FC<ProgramacaoProducaoModalProps> = ({
  isOpen,
  onClose,
  orders,
  products,
  categories,
  units = [],
  activeUnitId = 'all',
  startDate,
  endDate,
  selectedShifts,
  onChangeStartDate,
  onChangeEndDate,
  onChangeSelectedShifts,
}) => {
  const [unitFilter, setUnitFilter] = useState<string>(activeUnitId);

  useEffect(() => {
    if (isOpen) {
      setUnitFilter(activeUnitId);
    }
  }, [isOpen, activeUnitId]);

  const unitMap = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);

  const toggleShift = (shift: ProductionShift) => {
    if (selectedShifts.includes(shift)) {
      if (selectedShifts.length > 1) {
        onChangeSelectedShifts(selectedShifts.filter(s => s !== shift));
      }
    } else {
      onChangeSelectedShifts([...selectedShifts, shift]);
    }
  };

  const allShiftsSelected = selectedShifts.length === 3;

  // Filter orders for selected period(s), unit, and non-cancelled/non-delivered status
  const filteredOrders = useMemo(() => {
    return orders
      .filter(o => {
        if (o.status === 'CANCELADO' || o.status === 'ENTREGUE') return false;
        if (unitFilter !== 'all' && o.unidadeOrigemId !== unitFilter && o.unidadeRetiradaId !== unitFilter) {
          return false;
        }
        const dateKey = toLocalDateKey(o.dataHoraEntrega);
        if (startDate && dateKey < startDate) return false;
        if (endDate && dateKey > endDate) return false;
        const shift = getShiftFromIso(o.dataHoraEntrega);
        if (!selectedShifts.includes(shift)) return false;
        return true;
      })
      .sort((a, b) => new Date(a.dataHoraEntrega).getTime() - new Date(b.dataHoraEntrega).getTime());
  }, [orders, unitFilter, startDate, endDate, selectedShifts]);

  // Precompute order item qty lookup + totals per product (only keep products with total > 0!)
  const { orderQtyMap, rawProductTotals } = useMemo(() => {
    const qtyMap = new Map<string, Map<string, number>>();
    const prodTotals = new Map<string, number>();

    filteredOrders.forEach(o => {
      const m = new Map<string, number>();
      o.itens.forEach(it => {
        m.set(it.produtoId, (m.get(it.produtoId) || 0) + it.quantidade);
        prodTotals.set(it.produtoId, (prodTotals.get(it.produtoId) || 0) + it.quantidade);
      });
      qtyMap.set(o.id, m);
    });

    return { orderQtyMap: qtyMap, rawProductTotals: prodTotals };
  }, [filteredOrders]);

  // Group ONLY non-zero products by category
  const categoryGroups = useMemo(() => {
    const nonZeroProds = products.filter(p => (rawProductTotals.get(p.id) || 0) > 0);
    const catMap = new Map(categories.map(c => [c.id, c]));
    const groups = new Map<string, { id: string; nome: string; ordem: number; products: Product[] }>();

    nonZeroProds.forEach(prod => {
      const cat = catMap.get(prod.categoriaId);
      const key = cat ? cat.id : '__sem_cat__';
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          nome: cat ? cat.nome : 'Sem Categoria',
          ordem: cat ? cat.ordem : 9999,
          products: [],
        });
      }
      groups.get(key)!.products.push(prod);
    });

    return Array.from(groups.values())
      .map(g => ({
        ...g,
        products: g.products.slice().sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')),
      }))
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [products, categories, rawProductTotals]);

  const orderedProducts = useMemo(
    () => categoryGroups.flatMap(g => g.products),
    [categoryGroups]
  );

  const { categoryTotals, grandTotal } = useMemo(() => {
    const catTotals = new Map<string, number>();
    let overall = 0;
    categoryGroups.forEach(g => {
      const sum = g.products.reduce((acc, p) => acc + (rawProductTotals.get(p.id) || 0), 0);
      catTotals.set(g.id, sum);
      overall += sum;
    });
    return { categoryTotals: catTotals, grandTotal: overall };
  }, [categoryGroups, rawProductTotals]);

  const formatDeliveryLabel = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const weekday = WEEKDAYS_PT[d.getDay()];
    const shift = SHIFT_LABELS[getShiftFromIso(iso)];
    return { dateLine: `${dd}/${mm} (${weekday})`, shiftLine: shift };
  };

  const selectedUnitLabel =
    unitFilter === 'all' ? 'Todas as Unidades' : unitMap.get(unitFilter)?.nome || 'Unidade';

  const shiftsLabel = allShiftsSelected
    ? 'Todos'
    : selectedShifts.map(s => SHIFT_LABELS[s]).join(', ');

  const handleExportExcel = async () => {
    const rows = filteredOrders.map(o => {
      const lbl = formatDeliveryLabel(o.dataHoraEntrega);
      const dateLine = typeof lbl === 'string' ? lbl : lbl.dateLine;
      const shiftLine = typeof lbl === 'string' ? undefined : lbl.shiftLine;
      const unitName = unitMap.get(o.unidadeOrigemId)?.nome || '—';
      const qtyMap = orderQtyMap.get(o.id);
      const quantitiesByProductId: Record<string, number> = {};
      orderedProducts.forEach(p => {
        quantitiesByProductId[p.id] = qtyMap?.get(p.id) || 0;
      });
      return {
        numeroPedido: o.numeroPedido,
        unitName,
        dateLine,
        shiftLine,
        clienteNome: o.clienteNome,
        quantitiesByProductId,
        observacoes: o.observacoes?.trim() || '—',
      };
    });

    const productTotalsById: Record<string, number> = {};
    orderedProducts.forEach(p => {
      productTotalsById[p.id] = rawProductTotals.get(p.id) || 0;
    });

    const categoryTotalsById: Record<string, number> = {};
    categoryGroups.forEach(g => {
      categoryTotalsById[g.id] = categoryTotals.get(g.id) || 0;
    });

    const { exportProgramacaoProducaoExcel } = await import('../utils/programacaoProducaoExcel');
    exportProgramacaoProducaoExcel(
      {
        selectedUnitLabel,
        startDate,
        endDate,
        shiftsLabel,
        categoryGroups: categoryGroups.map(g => ({
          id: g.id,
          nome: g.nome,
          products: g.products,
        })),
        rows,
        productTotalsById,
        categoryTotalsById,
        grandTotal,
      },
      `Programacao_Producao_${toLocalDateKey(new Date().toISOString())}.xlsx`
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          body > *:not(.programacao-print-root) {
            display: none !important;
          }
          .programacao-print-root,
          .programacao-print-root * {
            visibility: visible !important;
          }
          .programacao-print-root .print\:hidden {
            display: none !important;
          }
          .programacao-print-root {
            position: static !important;
            inset: auto !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
            display: block !important;
          }
          .programacao-print-card {
            max-width: none !important;
            width: 100% !important;
            height: auto !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
          }
          .programacao-print-scroll {
            overflow: visible !important;
            max-height: none !important;
            padding: 0 !important;
          }
          .programacao-print-table {
            font-size: 9px !important;
            width: 100% !important;
          }
          .programacao-print-table th,
          .programacao-print-table td {
            padding: 3px 5px !important;
            position: static !important;
          }
        }
      `}</style>
      <div className="programacao-print-root fixed inset-0 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center z-[80] p-2 sm:p-4">
        <div className="programacao-print-card bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[96vw] h-[90vh] flex flex-col overflow-hidden">
          {/* Top Modal Header */}
          <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-700 text-[11px] font-bold">
                  Beju Caramelos
                </span>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 font-sans">
                  Programação de Produção
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {selectedUnitLabel} • {startDate ? startDate.split('-').reverse().join('/') : 'Início'} até{' '}
                {endDate ? endDate.split('-').reverse().join('/') : 'Fim'} • Turnos: {shiftsLabel}
              </p>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                title="Imprimir (A4 Paisagem)"
                aria-label="Imprimir"
                className="flex items-center justify-center p-2 text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-300 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar Excel</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Fechar</span>
              </button>
            </div>
          </div>

          {/* Filter Bar: Unit, Date Range & Multi-Shift Selection */}
          <div className="px-4 sm:px-6 py-2.5 bg-[#f8f9ff] border-b border-slate-200 flex flex-wrap items-center gap-3 text-xs shrink-0 print:hidden">
            <div className="flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-brand-600" />
              <span className="font-semibold text-slate-600">Unidade:</span>
              <select
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800"
              >
                <option value="all">Todas as Unidades</option>
                {units.filter(u => u.ativo).map(u => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-brand-600" />
              <span className="font-semibold text-slate-600">De:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onChangeStartDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-mono text-xs text-slate-800"
              />
              <span className="font-semibold text-slate-600">Até:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onChangeEndDate(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-mono text-xs text-slate-800"
              />
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    onChangeStartDate('');
                    onChangeEndDate('');
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Todas
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Turno:</span>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => onChangeSelectedShifts(['MANHA', 'TARDE', 'NOITE'])}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                    allShiftsSelected
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Todos
                </button>
                {(['MANHA', 'TARDE', 'NOITE'] as ProductionShift[]).map(sh => {
                  const active = selectedShifts.includes(sh);
                  return (
                    <button
                      key={sh}
                      type="button"
                      onClick={() => toggleShift(sh)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                        active && !allShiftsSelected
                          ? 'bg-brand-600 text-white'
                          : active
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {SHIFT_LABELS[sh]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pivot Table Area */}
          <div className="programacao-print-scroll flex-1 overflow-auto p-3 sm:p-5 bg-white">
            <div className="programacao-print-scroll border border-slate-200 rounded-xl overflow-auto max-h-full print:border-slate-300 print:rounded-none">
              <table className="programacao-print-table w-full text-xs border-collapse">
                <thead className="sticky top-0 z-20">
                  {/* Tier 1: Fixed Left Headers + Category Banners + Observações */}
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 font-bold">
                    <th
                      rowSpan={2}
                      className="py-2.5 px-3 text-left border-r border-slate-200 bg-slate-50 sticky left-0 z-30 min-w-[130px]"
                    >
                      Número do Pedido
                    </th>
                    <th
                      rowSpan={2}
                      className="py-2.5 px-3 text-left border-r border-slate-200 bg-slate-50 min-w-[115px]"
                    >
                      Data de Entrega
                    </th>
                    <th
                      rowSpan={2}
                      className="py-2.5 px-3 text-left border-r border-slate-200 bg-slate-50 min-w-[125px]"
                    >
                      Cliente
                    </th>
                    {categoryGroups.map((grp, idx) => {
                      const pal = CATEGORY_PALETTES[idx % CATEGORY_PALETTES.length];
                      return (
                        <th
                          key={grp.id}
                          colSpan={grp.products.length}
                          className={`py-2 px-2.5 text-center uppercase tracking-wider text-[10px] font-extrabold border-r border-slate-200 ${pal.header}`}
                        >
                          {grp.nome}
                        </th>
                      );
                    })}
                    <th
                      rowSpan={2}
                      className="py-2.5 px-3 text-center bg-slate-50 min-w-[140px]"
                    >
                      Observações
                    </th>
                  </tr>

                  {/* Tier 2: Non-zero Product Columns */}
                  <tr className="border-b-2 border-slate-300 text-[11px] font-semibold">
                    {categoryGroups.map((grp, idx) => {
                      const pal = CATEGORY_PALETTES[idx % CATEGORY_PALETTES.length];
                      return grp.products.map(prod => (
                        <th
                          key={prod.id}
                          className={`py-2 px-2 text-center border-r border-slate-200 min-w-[78px] leading-tight ${pal.sub}`}
                          title={`${prod.sku} — ${prod.descricao}`}
                        >
                          {prod.descricao}
                        </th>
                      ));
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {filteredOrders.length === 0 || orderedProducts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4 + orderedProducts.length}
                        className="py-10 text-center text-slate-400 text-xs"
                      >
                        Nenhum produto a produzir para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map(order => {
                      const lbl = formatDeliveryLabel(order.dataHoraEntrega);
                      const qtyMap = orderQtyMap.get(order.id);
                      const unitName = unitMap.get(order.unidadeOrigemId)?.nome || '—';
                      return (
                        <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-3 border-r border-slate-200 bg-white sticky left-0 z-10 whitespace-nowrap">
                            <div className="font-mono font-semibold text-slate-900">
                              {order.numeroPedido}
                            </div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              {unitName}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-slate-700 border-r border-slate-200 whitespace-nowrap">
                            {typeof lbl === 'string' ? (
                              lbl
                            ) : (
                              <>
                                <div className="font-medium">{lbl.dateLine}</div>
                                <div className="text-[10px] text-slate-500">{lbl.shiftLine}</div>
                              </>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-800 font-medium border-r border-slate-200">
                            {order.clienteNome}
                          </td>
                          {orderedProducts.map(prod => {
                            const q = qtyMap?.get(prod.id) || 0;
                            return (
                              <td
                                key={prod.id}
                                className={`py-2 px-2 text-center font-mono border-r border-slate-200 ${
                                  q > 0 ? 'font-bold text-slate-900' : 'text-slate-300'
                                }`}
                              >
                                {q > 0 ? q : '—'}
                              </td>
                            );
                          })}
                          <td className="py-2 px-3 text-center text-[11px] text-slate-600">
                            {order.observacoes?.trim() || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {orderedProducts.length > 0 && (
                  <tfoot className="sticky bottom-0 z-20">
                    {/* Summary Row 1: TOTAL A PRODUZIR (per product) */}
                    <tr className="bg-brand-50/95 border-t-2 border-brand-500 font-bold text-xs">
                      <td className="py-2 px-3 text-slate-900 border-r border-slate-200 bg-brand-50 sticky left-0 z-30 whitespace-nowrap">
                        TOTAL A PRODUZIR
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-800 border-r border-slate-200 whitespace-nowrap">
                        {filteredOrders.length} pedido(s)
                      </td>
                      <td className="py-2 px-3 text-center text-slate-400 border-r border-slate-200">
                        —
                      </td>
                      {orderedProducts.map(prod => {
                        const tot = rawProductTotals.get(prod.id) || 0;
                        return (
                          <td
                            key={prod.id}
                            className="py-2 px-2 text-center font-mono font-extrabold text-brand-700 border-r border-slate-200"
                          >
                            {tot}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-center text-slate-400">—</td>
                    </tr>

                    {/* Summary Row 2: TOTAL POR CATEGORIA */}
                    <tr className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                      <td className="py-2 px-3 text-slate-900 border-r border-slate-200 bg-slate-50 sticky left-0 z-30 whitespace-nowrap">
                        TOTAL POR CATEGORIA
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-700 border-r border-slate-200 whitespace-nowrap">
                        {categoryGroups.length} categoria(s)
                      </td>
                      <td className="py-2 px-3 text-center text-slate-400 border-r border-slate-200">
                        —
                      </td>
                      {categoryGroups.map((grp, idx) => {
                        const pal = CATEGORY_PALETTES[idx % CATEGORY_PALETTES.length];
                        return (
                          <td
                            key={grp.id}
                            colSpan={grp.products.length}
                            className={`py-2 px-2 text-center font-mono font-extrabold text-sm border-r border-slate-200 ${pal.total}`}
                          >
                            {categoryTotals.get(grp.id) || 0}
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-center font-mono font-extrabold text-slate-900 whitespace-nowrap">
                        Total Geral: {grandTotal}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};
