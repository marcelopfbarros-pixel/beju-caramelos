import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  RectangleHorizontal,
  RectangleVertical,
  X,
} from 'lucide-react';
import { formatCurrencyBR } from './CurrencyInput';
import { Order, Product, StoreUnit } from '../types';
import {
  DEFAULT_PEDIDOS_REPORT_COLUMNS,
  PEDIDOS_REPORT_COLUMNS,
  PEDIDOS_REPORT_GROUP_OPTIONS,
  PEDIDOS_REPORT_SORT_OPTIONS,
  PedidosReportColumnKey,
  PedidosReportConfig,
  PedidosReportFormat,
  PedidosReportGroupBy,
  PedidosReportOrientation,
  PedidosReportSortBy,
  PedidosReportSortDirection,
  buildPedidosReportData,
  computeBalancedColumnWidthsMm,
  getPedidosReportColumnTotal,
  getPedidosReportCombinedParts,
  getPedidosReportOrderCellText,
} from '../utils/pedidosReportData';

interface PedidosReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  filteredOrders: Order[];
  products: Product[];
  units: StoreUnit[];
  activeUnitId: string;
  statusFilter: string;
  searchTerm: string;
}

const STATUS_FILTER_LABELS: Record<string, string> = {
  TODOS: 'Todos os Status',
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  EM_PRODUCAO: 'Em Produção',
  PRONTO: 'Pronto',
  EM_ROTA: 'Em Rota',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

const COLUMN_LABEL_MAP = new Map(PEDIDOS_REPORT_COLUMNS.map(c => [c.key, c]));
const DEFAULT_COLUMN_DEFS = PEDIDOS_REPORT_COLUMNS.filter(c => c.isDefault);
const OPTIONAL_COLUMN_DEFS = PEDIDOS_REPORT_COLUMNS.filter(c => !c.isDefault);

function toLocalYyyyMmDd(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDatePresets(): Array<{ label: string; start: string; end: string }> {
  const now = new Date();
  const today = toLocalYyyyMmDd(now);

  const plus6 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6);
  const next7End = toLocalYyyyMmDd(plus6);

  const monthStart = toLocalYyyyMmDd(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = toLocalYyyyMmDd(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const prevMonthStart = toLocalYyyyMmDd(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMonthEnd = toLocalYyyyMmDd(new Date(now.getFullYear(), now.getMonth(), 0));

  return [
    { label: 'Todo o período', start: '', end: '' },
    { label: 'Hoje', start: today, end: today },
    { label: 'Próx. 7 dias', start: today, end: next7End },
    { label: 'Este mês', start: monthStart, end: monthEnd },
    { label: 'Mês anterior', start: prevMonthStart, end: prevMonthEnd },
  ];
}

export const PedidosReportModal: React.FC<PedidosReportModalProps> = ({
  isOpen,
  onClose,
  orders,
  filteredOrders,
  products,
  units,
  activeUnitId,
  statusFilter,
  searchTerm,
}) => {
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');
  const [format, setFormat] = useState<PedidosReportFormat>('PDF');
  const [orientation, setOrientation] = useState<PedidosReportOrientation>('landscape');
  const [groupBy, setGroupBy] = useState<PedidosReportGroupBy>('dataEntrega');
  const [deliveryStartDate, setDeliveryStartDate] = useState<string>('');
  const [deliveryEndDate, setDeliveryEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<PedidosReportSortBy>('dataEntrega');
  const [sortDirection, setSortDirection] = useState<PedidosReportSortDirection>('asc');
  const [selectedColumns, setSelectedColumns] = useState<PedidosReportColumnKey[]>(
    DEFAULT_PEDIDOS_REPORT_COLUMNS
  );
  const [exporting, setExporting] = useState(false);
  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [xlsxPreviewTab, setXlsxPreviewTab] = useState<'pedidos' | 'resumo'>('pedidos');
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
  const isInvalidDateRange = Boolean(
    deliveryStartDate && deliveryEndDate && deliveryStartDate > deliveryEndDate
  );

  const hasActiveFilterDiff = filteredOrders.length !== orders.length;

  useEffect(() => {
    if (!isOpen) {
      clearPreviewArtifacts();
      setStep('config');
      return;
    }
    setScope(hasActiveFilterDiff ? 'filtered' : 'all');
    setStep('config');
  }, [isOpen, hasActiveFilterDiff, clearPreviewArtifacts]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !exporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, exporting, onClose]);

  const targetOrders = useMemo(() => {
    if (scope === 'filtered' && hasActiveFilterDiff) {
      return filteredOrders;
    }
    return orders;
  }, [scope, hasActiveFilterDiff, filteredOrders, orders]);

  const reportConfig: PedidosReportConfig = useMemo(
    () => ({
      format,
      columns: selectedColumns,
      sortBy,
      sortDirection,
      groupBy,
      deliveryStartDate: deliveryStartDate || undefined,
      deliveryEndDate: deliveryEndDate || undefined,
      orientation,
    }),
    [
      format,
      selectedColumns,
      sortBy,
      sortDirection,
      groupBy,
      deliveryStartDate,
      deliveryEndDate,
      orientation,
    ]
  );

  const reportData = useMemo(() => {
    if (!isOpen) return null;
    const unitLabel =
      scope === 'all' || activeUnitId === 'all'
        ? 'Todas as Unidades'
        : units.find(u => u.id === activeUnitId)?.nome || 'Unidade';
    const statusLabel =
      scope === 'all' ? 'Todos os Status' : STATUS_FILTER_LABELS[statusFilter] || statusFilter;
    const scopeLabel =
      scope === 'filtered' && hasActiveFilterDiff
        ? `Pedidos filtrados (${targetOrders.length} de ${orders.length})`
        : `Todos os pedidos (${targetOrders.length})`;

    return buildPedidosReportData({
      orders: targetOrders,
      products,
      units,
      config: reportConfig,
      filterContext: {
        unitLabel,
        statusLabel,
        searchTerm: scope === 'filtered' ? searchTerm : '',
        scopeLabel,
      },
    });
  }, [
    isOpen,
    scope,
    activeUnitId,
    units,
    statusFilter,
    hasActiveFilterDiff,
    targetOrders,
    orders.length,
    products,
    reportConfig,
    searchTerm,
  ]);

  const toggleColumn = (key: PedidosReportColumnKey) => {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const moveColumn = (index: number, delta: -1 | 1) => {
    setSelectedColumns(prev => {
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleOpenPreview = async () => {
    if (!reportData || selectedColumns.length === 0 || isInvalidDateRange || exporting) return;
    setExporting(true);
    clearPreviewArtifacts();
    try {
      if (format === 'PDF') {
        const { buildPedidosReportPdfBlob } = await import('../utils/pedidosReportPdf');
        const blob = await buildPedidosReportPdfBlob(reportData);
        pdfBlobRef.current = blob;
        setPdfPreviewUrl(URL.createObjectURL(blob));
      } else {
        const { buildPedidosReportXlsxBuffer } = await import('../utils/pedidosReportExcel');
        const buffer = buildPedidosReportXlsxBuffer(reportData);
        xlsxBufferRef.current = buffer;
        setXlsxPreviewTab('pedidos');
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
    if (exporting) return;
    setExporting(true);
    try {
      if (format === 'PDF' && pdfBlobRef.current) {
        const { downloadPedidosReportPdfBlob } = await import('../utils/pedidosReportPdf');
        downloadPedidosReportPdfBlob(pdfBlobRef.current);
      } else if (format === 'XLSX' && xlsxBufferRef.current) {
        const { downloadPedidosReportExcelBuffer } = await import('../utils/pedidosReportExcel');
        downloadPedidosReportExcelBuffer(xlsxBufferRef.current);
      }
      onClose();
    } finally {
      setExporting(false);
    }
  };

  const renderSpreadsheetPreview = () => {
    if (!reportData) return null;
    const cols = reportData.selectedColumns;
    const isGrouped = reportData.config.groupBy !== 'nenhum';
    const hasAnySummable = cols.some(c => c.summable);
    const firstSummableIdx = cols.findIndex(c => c.summable);
    const previewUsableMm = orientation === 'portrait' ? 194 : 281;
    const previewWidthsMm = computeBalancedColumnWidthsMm(reportData, previewUsableMm);
    const previewWidthPcts = previewWidthsMm.map(
      w => `${((w / previewUsableMm) * 100).toFixed(2)}%`
    );

    return (
      <div className="space-y-3">
        {format === 'XLSX' && (
          <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setXlsxPreviewTab('pedidos')}
              className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                xlsxPreviewTab === 'pedidos'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aba 1: Relatorio_Pedidos
            </button>
            <button
              type="button"
              onClick={() => setXlsxPreviewTab('resumo')}
              className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                xlsxPreviewTab === 'resumo'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aba 2: Resumo_Itens
            </button>
          </div>
        )}

        <div className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden">
          {/* Standard PrintReportHeader-style Banner */}
          <div className="px-4 py-3 border-b-2 border-rose-300 bg-gradient-to-r from-rose-50 via-white to-amber-50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <img
                src="/logo.jpg"
                alt="Beju Caramelos"
                className="w-10 h-10 rounded-full object-cover border-2 border-rose-300"
              />
              <div>
                <div className="text-sm font-extrabold text-slate-900">Beju Caramelos</div>
                <div className="text-xs font-semibold text-rose-900">
                  {xlsxPreviewTab === 'resumo' && format === 'XLSX'
                    ? 'Resumo Consolidado de Itens'
                    : 'Relatório de Pedidos'}
                </div>
              </div>
            </div>
            <div className="text-right font-mono text-[10px] text-slate-600">
              <div className="font-bold text-slate-800">
                {reportData.generatedAtLabel} • Página 1 de 1
              </div>
              <div>
                {reportData.totalOrders} pedido(s) • Agrupado por: {reportData.groupLabel} •{' '}
                {orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem'}
              </div>
            </div>
          </div>

          <div className="px-3 py-1.5 bg-[#f8f9ff] border-b border-slate-200 text-[10px] text-slate-600 font-medium">
            Período (Entrega): <strong className="text-slate-800">{reportData.periodLabel}</strong> •
            Unidade: <strong className="text-slate-800">{reportData.unitLabel}</strong> • Status:{' '}
            <strong className="text-slate-800">{reportData.statusLabel}</strong> • Ordem:{' '}
            <strong className="text-slate-800">{reportData.sortLabel}</strong>
          </div>

          {xlsxPreviewTab === 'resumo' && format === 'XLSX' ? (
            <div className="overflow-x-auto max-w-full max-h-[54vh]">
              <table className="w-full min-w-[560px] text-left border-collapse text-[11px]">
                <thead className="sticky top-0 bg-emerald-700 text-white text-[10px] font-bold uppercase">
                  <tr>
                    <th className="py-2 px-2.5 text-center border border-emerald-800">SKU</th>
                    <th className="py-2 px-2.5 text-center border border-emerald-800">Produto</th>
                    <th className="py-2 px-2.5 text-center border border-emerald-800">Unidade</th>
                    <th className="py-2 px-2.5 text-center border border-emerald-800">Pedidos</th>
                    <th className="py-2 px-2.5 text-center border border-emerald-800">Qtd. Total</th>
                    <th className="py-2 px-2.5 text-center border border-emerald-800">Valor Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.productSummary.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 italic">
                        Nenhum item encontrado nos pedidos selecionados.
                      </td>
                    </tr>
                  ) : (
                    reportData.productSummary.map((item, idx) => (
                      <tr key={item.produtoId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="py-1.5 px-2 text-center font-mono text-slate-600 border border-slate-200">
                          {item.sku}
                        </td>
                        <td className="py-1.5 px-2 font-bold text-slate-900 border border-slate-200">
                          {item.descricao}
                        </td>
                        <td className="py-1.5 px-2 text-center text-slate-700 border border-slate-200">
                          {item.unidade}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono text-slate-700 border border-slate-200">
                          {item.ordersCount}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-bold text-emerald-800 border border-slate-200">
                          {item.totalQuantidade}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900 border border-slate-200 whitespace-nowrap">
                          R$ {formatCurrencyBR(item.totalValor)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-800 text-white font-bold text-[11px]">
                    <td colSpan={4} className="py-2 px-2.5 border border-emerald-900">
                      TOTAL CONSOLIDADO ({reportData.productSummary.length} item(ns))
                    </td>
                    <td className="py-2 px-2 text-center font-mono border border-emerald-900">
                      {reportData.totalItemQuantity}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono border border-emerald-900 whitespace-nowrap">
                      R${' '}
                      {formatCurrencyBR(
                        reportData.productSummary.reduce((s, p) => s + p.totalValor, 0)
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto max-w-full max-h-[54vh]">
              <table
                className="w-full table-fixed text-left border-collapse text-[11px]"
                style={{
                  minWidth: `${Math.max(
                    orientation === 'portrait' ? 680 : 880,
                    cols.length * 95
                  )}px`,
                }}
              >
                <colgroup>
                  {cols.map((col, idx) => (
                    <col key={col.key} style={{ width: previewWidthPcts[idx] }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-emerald-700 text-white text-[10px] font-bold">
                  <tr>
                    {cols.map(col => (
                      <th
                        key={col.key}
                        className="py-2 px-2 border border-emerald-800 whitespace-nowrap text-center"
                      >
                        {col.shortLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.orders.length === 0 ? (
                    <tr>
                      <td colSpan={cols.length} className="py-8 text-center text-slate-500 italic">
                        Nenhum pedido encontrado com os critérios selecionados.
                      </td>
                    </tr>
                  ) : (
                    reportData.groups.map(group => (
                      <React.Fragment key={group.key}>
                        {isGrouped && (
                          <tr className="bg-emerald-100 text-emerald-950 font-bold text-[11px]">
                            <td colSpan={cols.length} className="py-1.5 px-2.5 border border-emerald-200">
                              {reportData.groupHeaderPrefix}: {group.label.toUpperCase()} ({group.totalOrders}{' '}
                              pedido(s) • {group.totalItemQuantity} item(ns))
                            </td>
                          </tr>
                        )}
                        {group.orders.map((orderRow, orderIdx) => {
                          const zebraBg = orderRow.isReplenishment
                            ? 'bg-sky-50'
                            : orderIdx % 2 === 0
                            ? 'bg-white'
                            : 'bg-slate-50';
                          const itemsToRender =
                            reportData.expandItems && orderRow.itens.length > 0
                              ? orderRow.itens
                              : [undefined];
                          const spanCount = itemsToRender.length;

                          return itemsToRender.map((item, subIdx) => (
                            <tr key={`${orderRow.orderId}-${subIdx}`} className={zebraBg}>
                              {cols.map(col => {
                                if (subIdx > 0 && col.level === 'order') return null;
                                const rowSpan =
                                  subIdx === 0 && col.level === 'order' && spanCount > 1
                                    ? spanCount
                                    : undefined;
                                const alignCls =
                                  col.align === 'center'
                                    ? 'text-center'
                                    : col.align === 'right'
                                    ? 'text-right'
                                    : 'text-left';

                                const combined = getPedidosReportCombinedParts(orderRow, col.key);
                                if (combined) {
                                  const secCls =
                                    combined.secondaryTone === 'blue'
                                      ? 'text-blue-700'
                                      : combined.secondaryTone === 'amber'
                                      ? 'text-amber-800'
                                      : 'text-slate-500';
                                  return (
                                    <td
                                      key={col.key}
                                      rowSpan={rowSpan}
                                      className={`py-1.5 px-2 border border-slate-200 align-middle ${alignCls}`}
                                    >
                                      <div className="font-bold text-slate-900 leading-snug">
                                        {combined.primary}
                                      </div>
                                      <div className={`font-normal text-[10px] leading-snug ${secCls}`}>
                                        {combined.secondary}
                                      </div>
                                    </td>
                                  );
                                }

                                const text = getPedidosReportOrderCellText(orderRow, col.key, item);
                                const extraCls =
                                  col.key === 'quantidadeItem'
                                    ? 'font-mono font-bold text-emerald-800'
                                    : col.key === 'valorTotal'
                                    ? 'font-mono font-bold text-slate-900'
                                    : col.kind === 'currency'
                                    ? 'font-mono text-slate-800 whitespace-nowrap'
                                    : 'text-slate-700 whitespace-pre-line';
                                return (
                                  <td
                                    key={col.key}
                                    rowSpan={rowSpan}
                                    className={`py-1.5 px-2 border border-slate-200 align-middle ${alignCls} ${extraCls}`}
                                  >
                                    {text}
                                  </td>
                                );
                              })}
                            </tr>
                          ));
                        })}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
                <tfoot>
                  {!hasAnySummable ? (
                    <tr className="bg-emerald-800 text-white font-bold text-[11px]">
                      <td colSpan={cols.length} className="py-2 px-2.5 border border-emerald-900">
                        TOTAL GERAL: {reportData.totalOrders} pedido(s) • {reportData.totalItemQuantity}{' '}
                        item(ns) • R$ {formatCurrencyBR(reportData.grandTotalValor)}
                      </td>
                    </tr>
                  ) : (
                    <tr className="bg-emerald-800 text-white font-bold text-[11px]">
                      {cols.map((col, idx) => {
                        if (idx === 0 && firstSummableIdx > 1) {
                          return (
                            <td
                              key={col.key}
                              colSpan={firstSummableIdx}
                              className="py-2 px-2.5 border border-emerald-900"
                            >
                              TOTAL GERAL ({reportData.totalOrders} ped.
                              {isGrouped && reportData.groups.length > 0
                                ? ` • ${reportData.groups.length} grupo(s)`
                                : ''}
                              )
                            </td>
                          );
                        }
                        if (idx > 0 && idx < firstSummableIdx) return null;
                        const alignCls =
                          col.align === 'center'
                            ? 'text-center'
                            : col.align === 'right'
                            ? 'text-right'
                            : 'text-left';
                        if (col.summable) {
                          const total = getPedidosReportColumnTotal(reportData, col.key) ?? 0;
                          return (
                            <td
                              key={col.key}
                              className={`py-2 px-2 border border-emerald-900 font-mono whitespace-nowrap ${alignCls}`}
                            >
                              {col.kind === 'currency' ? `R$ ${formatCurrencyBR(total)}` : total}
                            </td>
                          );
                        }
                        return (
                          <td key={col.key} className="py-2 px-2 border border-emerald-900">
                            {idx === firstSummableIdx ? `TOTAL (${reportData.totalOrders})` : ''}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[70] flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:hidden"
      onClick={() => {
        if (!exporting) onClose();
      }}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl border border-slate-200 w-full min-w-0 max-w-full ${
          step === 'preview' ? 'sm:max-w-6xl' : 'sm:max-w-3xl'
        } overflow-hidden flex flex-col max-h-[92vh] transition-all`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3.5 py-3 sm:px-6 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              {step === 'preview' ? (
                <Eye className="w-4 h-4 text-brand-600 shrink-0" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-brand-600 shrink-0" />
              )}
              <span>
                {step === 'preview'
                  ? `Prévia do Relatório (${format} • A4 ${
                      orientation === 'portrait' ? 'Retrato' : 'Paisagem'
                    })`
                  : 'Formatar Relatório de Pedidos'}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {step === 'preview'
                ? 'Confira o resultado antes de abrir a caixa de download do arquivo'
                : 'Escolha formato, período de entrega, agrupamento, colunas, ordenação e modo A4'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {step === 'preview' && (
              <button
                type="button"
                disabled={exporting}
                onClick={handleBackToConfig}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ajustar Opções</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!exporting) onClose();
              }}
              aria-label="Fechar modal"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-3 sm:p-5 overflow-y-auto space-y-3 sm:space-y-4 text-xs flex-1">
          {step === 'preview' ? (
            format === 'PDF' && pdfPreviewUrl ? (
              <div className="space-y-3">
                <div className="hidden sm:block">
                  <iframe
                    src={pdfPreviewUrl}
                    title="Prévia do Relatório PDF"
                    className="w-full h-[65vh] rounded-xl border border-slate-300 bg-slate-100"
                  />
                </div>
                <div className="sm:hidden space-y-2.5">
                  <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-xl p-2.5">
                    <span className="text-[11px] font-semibold text-blue-900">
                      Prévia do PDF pronta
                    </span>
                    <a
                      href={pdfPreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-blue-300 rounded-lg text-[11px] font-bold text-blue-800"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Abrir PDF</span>
                    </a>
                  </div>
                  {renderSpreadsheetPreview()}
                </div>
              </div>
            ) : (
              renderSpreadsheetPreview()
            )
          ) : (
            <>
          {/* Scope toggle when filters are active */}
          {hasActiveFilterDiff && (
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-blue-900">
                Filtros ativos na tela de Pedidos. Quais pedidos incluir?
              </span>
              <div className="inline-flex rounded-lg border border-blue-200 bg-white p-0.5 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setScope('filtered')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    scope === 'filtered'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Filtrados ({filteredOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    scope === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Todos ({orders.length})
                </button>
              </div>
            </div>
          )}

          {/* Row 1: Formato + Modo de impressão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 min-w-0">
            {/* 1. Formato do arquivo */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 sm:p-3 space-y-2 min-w-0 max-w-full">
              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                1. Formato do Arquivo
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat('PDF')}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    format === 'PDF'
                      ? 'bg-rose-50 border-rose-400 ring-1 ring-rose-300 text-rose-900'
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <FileText
                    className={`w-4 h-4 shrink-0 ${
                      format === 'PDF' ? 'text-rose-600' : 'text-slate-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold leading-tight">PDF</div>
                    <div className="text-[10px] text-slate-500 truncate">Pronto p/ A4</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('XLSX')}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    format === 'XLSX'
                      ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-300 text-emerald-900'
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <FileSpreadsheet
                    className={`w-4 h-4 shrink-0 ${
                      format === 'XLSX' ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold leading-tight">XLSX</div>
                    <div className="text-[10px] text-slate-500 truncate">Excel + Somas</div>
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Modo de impressão (Retrato / Paisagem) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 sm:p-3 space-y-2 min-w-0 max-w-full">
              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                2. Modo de Impressão (Página A4)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    orientation === 'landscape'
                      ? 'bg-brand-50 border-brand-500 ring-1 ring-brand-300 text-brand-900'
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <RectangleHorizontal
                    className={`w-4 h-4 shrink-0 ${
                      orientation === 'landscape' ? 'text-brand-600' : 'text-slate-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold leading-tight">Paisagem</div>
                    <div className="text-[10px] text-slate-500 truncate">297 × 210 mm</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    orientation === 'portrait'
                      ? 'bg-brand-50 border-brand-500 ring-1 ring-brand-300 text-brand-900'
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <RectangleVertical
                    className={`w-4 h-4 shrink-0 ${
                      orientation === 'portrait' ? 'text-brand-600' : 'text-slate-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold leading-tight">Retrato</div>
                    <div className="text-[10px] text-slate-500 truncate">210 × 297 mm</div>
                  </div>
                </button>
              </div>
              {orientation === 'portrait' && selectedColumns.length > 9 && (
                <p className="text-[10px] text-amber-700 leading-snug">
                  Em Retrato com {selectedColumns.length} colunas, as fontes e larguras serão
                  compactadas automaticamente para caber na folha A4.
                </p>
              )}
            </div>
          </div>

          {/* 3. Período (Data da Entrega) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 sm:p-3 space-y-2 min-w-0 max-w-full overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                3. Período (Data da Entrega)
              </span>
              {(deliveryStartDate || deliveryEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryStartDate('');
                    setDeliveryEndDate('');
                  }}
                  className="text-[10px] font-bold text-brand-700 hover:underline cursor-pointer"
                >
                  Limpar período
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {datePresets.map(preset => {
                const isActive =
                  deliveryStartDate === preset.start && deliveryEndDate === preset.end;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setDeliveryStartDate(preset.start);
                      setDeliveryEndDate(preset.end);
                    }}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
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
                  value={deliveryStartDate}
                  onChange={e => setDeliveryStartDate(e.target.value)}
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
                  value={deliveryEndDate}
                  onChange={e => setDeliveryEndDate(e.target.value)}
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

          {/* 4. Agrupamento + 5. Ordem de classificação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 min-w-0">
            {/* 4. Agrupamento */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 sm:p-3 space-y-2 min-w-0 max-w-full">
              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                4. Agrupamento
              </span>
              <div className="relative">
                <select
                  aria-label="Agrupamento do relatório"
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value as PedidosReportGroupBy)}
                  className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                >
                  {PEDIDOS_REPORT_GROUP_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* 5. Ordem de classificação */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 sm:p-3 space-y-2 min-w-0 max-w-full">
              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                5. Ordem de Classificação
              </span>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <select
                    aria-label="Ordem de classificação do relatório"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as PedidosReportSortBy)}
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    {PEDIDOS_REPORT_SORT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
                  }
                  title={sortDirection === 'asc' ? 'Crescente' : 'Decrescente'}
                  aria-label="Alternar direção da ordenação"
                  className="h-9 px-2.5 inline-flex items-center justify-center gap-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer shrink-0"
                >
                  {sortDirection === 'asc' ? (
                    <>
                      <ArrowUp className="w-3.5 h-3.5 text-brand-600" />
                      <span className="hidden md:inline">Crescente</span>
                    </>
                  ) : (
                    <>
                      <ArrowDown className="w-3.5 h-3.5 text-brand-600" />
                      <span className="hidden md:inline">Decrescente</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 6. Colunas da tabela */}
          <div className="border border-slate-200 rounded-xl overflow-hidden min-w-0 max-w-full">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600">
                  6. Colunas da Tabela
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-mono text-[10px] font-bold">
                  {selectedColumns.length} selecionada(s)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedColumns(DEFAULT_PEDIDOS_REPORT_COLUMNS)}
                  className="text-[11px] font-bold text-brand-700 hover:underline cursor-pointer"
                >
                  Padrão ({DEFAULT_PEDIDOS_REPORT_COLUMNS.length})
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedColumns(PEDIDOS_REPORT_COLUMNS.map(c => c.key))
                  }
                  className="text-[11px] font-bold text-slate-600 hover:underline cursor-pointer"
                >
                  Todas
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => setSelectedColumns([])}
                  className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="p-2.5 sm:p-3 space-y-3 bg-white">
              {/* Padrão */}
              <div>
                <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700 mb-1.5">
                  Colunas Padrão
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {DEFAULT_COLUMN_DEFS.map(col => {
                    const checked = selectedColumns.includes(col.key);
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                          checked
                            ? 'bg-emerald-50/70 border-emerald-300 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumn(col.key)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Adicionais */}
              <div>
                <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Colunas Adicionais (Contato, Status e Financeiro)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {OPTIONAL_COLUMN_DEFS.map(col => {
                    const checked = selectedColumns.includes(col.key);
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                          checked
                            ? 'bg-blue-50/70 border-blue-300 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumn(col.key)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Ordem das colunas selecionadas */}
              {selectedColumns.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Ordem das Colunas no Relatório
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedColumns.map((colKey, idx) => {
                      const def = COLUMN_LABEL_MAP.get(colKey);
                      if (!def) return null;
                      return (
                        <div
                          key={colKey}
                          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-800"
                        >
                          <span className="font-mono text-slate-500">{idx + 1}.</span>
                          <span>{def.shortLabel}</span>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveColumn(idx, -1)}
                            title="Mover para esquerda"
                            aria-label={`Mover ${def.shortLabel} para esquerda`}
                            className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                          >
                            <ArrowLeft className="w-2.5 h-2.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === selectedColumns.length - 1}
                            onClick={() => moveColumn(idx, 1)}
                            title="Mover para direita"
                            aria-label={`Mover ${def.shortLabel} para direita`}
                            className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                          >
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedColumns.length === 0 && (
                <p className="text-[11px] font-semibold text-rose-600">
                  Selecione pelo menos 1 coluna para gerar o relatório.
                </p>
              )}
            </div>
          </div>

          {/* KPI preview strip */}
          {reportData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[10px] font-mono uppercase text-slate-500 block">
                  Pedidos
                </span>
                <span className="text-sm font-mono font-bold text-slate-900">
                  {reportData.totalOrders}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {reportData.deliveryCount} Ent. • {reportData.pickupCount} Ret.
                  {groupBy !== 'nenhum' && reportData.groups.length > 0
                    ? ` • ${reportData.groups.length} grupo(s)`
                    : ''}
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                <span className="text-[10px] font-mono uppercase text-emerald-800 block">
                  Total de Itens
                </span>
                <span className="text-sm font-mono font-bold text-emerald-700">
                  {reportData.totalItemQuantity} unid.
                </span>
                <span className="text-[10px] text-emerald-700/80 block">
                  {reportData.productSummary.length} produto(s)
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-[10px] font-mono uppercase text-slate-500 block">
                  Unidades
                </span>
                <span className="text-sm font-mono font-bold text-slate-900">
                  {reportData.distinctUnitsCount}
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                <span className="text-[10px] font-mono uppercase text-emerald-800 block">
                  Valor Total
                </span>
                <span className="text-sm font-mono font-bold text-emerald-700">
                  R$ {formatCurrencyBR(reportData.grandTotalValor)}
                </span>
              </div>
            </div>
          )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2 shrink-0">
          {step === 'preview' ? (
            <>
              <button
                type="button"
                disabled={exporting}
                onClick={handleBackToConfig}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={onClose}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleConfirmDownload()}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer ${
                  format === 'PDF'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {format === 'PDF' ? 'Baixar PDF' : 'Baixar Excel (.xlsx)'}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={exporting}
                onClick={onClose}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={exporting || selectedColumns.length === 0 || isInvalidDateRange}
                onClick={() => void handleOpenPreview()}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer ${
                  format === 'PDF'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>
                  {exporting
                    ? format === 'PDF'
                      ? 'Preparando PDF...'
                      : 'Preparando Excel...'
                    : 'Visualizar Relatório'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
