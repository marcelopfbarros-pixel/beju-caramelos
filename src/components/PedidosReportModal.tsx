import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { formatCurrencyBR } from './CurrencyInput';
import {
  ReportFiltersCard,
  ReportKpiItem,
  ReportModalShell,
  ReportOrganizationCard,
  ReportOutputStrip,
  ReportPdfPreviewFrame,
  ReportPreviewBanner,
} from './ReportModalShell';
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
  SEM_ENTREGUES: 'Em Aberto (Sem Entregues/Cancelados)',
  TODOS: 'Todos os Status',
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  EM_PRODUCAO: 'Em Produção',
  PRONTO: 'Pronto',
  EM_ROTA: 'Em Rota',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

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
  const [unitFilter, setUnitFilter] = useState<string>('TODAS');
  const [modalityFilter, setModalityFilter] = useState<'TODAS' | 'DELIVERY' | 'RETIRADA'>('TODAS');
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
    setUnitFilter('TODAS');
    setModalityFilter('TODAS');
    setStep('config');
  }, [isOpen, hasActiveFilterDiff, clearPreviewArtifacts]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const baseOrders = useMemo(() => {
    if (scope === 'filtered' && hasActiveFilterDiff) {
      return filteredOrders;
    }
    return orders;
  }, [scope, hasActiveFilterDiff, filteredOrders, orders]);

  const targetOrders = useMemo(() => {
    return baseOrders.filter(o => {
      if (
        unitFilter !== 'TODAS' &&
        o.unidadeOrigemId !== unitFilter &&
        o.unidadeRetiradaId !== unitFilter
      ) {
        return false;
      }
      if (modalityFilter !== 'TODAS' && o.tipoEntrega !== modalityFilter) {
        return false;
      }
      return true;
    });
  }, [baseOrders, unitFilter, modalityFilter]);

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
    const baseUnitLabel =
      scope === 'all' || activeUnitId === 'all'
        ? 'Todas as Unidades'
        : units.find(u => u.id === activeUnitId)?.nome || 'Unidade';
    const unitLabel =
      unitFilter !== 'TODAS'
        ? units.find(u => u.id === unitFilter)?.nome || 'Unidade'
        : baseUnitLabel;
    const modalitySuffix =
      modalityFilter === 'DELIVERY'
        ? ' (Entrega)'
        : modalityFilter === 'RETIRADA'
        ? ' (Retirada)'
        : '';
    const statusLabel = `${
      scope === 'all' ? 'Todos os Status' : STATUS_FILTER_LABELS[statusFilter] || statusFilter
    }${modalitySuffix}`;
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
    unitFilter,
    modalityFilter,
    units,
    statusFilter,
    hasActiveFilterDiff,
    targetOrders,
    orders.length,
    products,
    reportConfig,
    searchTerm,
  ]);

  const hasClearableFilters = Boolean(
    deliveryStartDate ||
      deliveryEndDate ||
      unitFilter !== 'TODAS' ||
      modalityFilter !== 'TODAS'
  );

  const handleClearFilters = () => {
    setDeliveryStartDate('');
    setDeliveryEndDate('');
    setUnitFilter('TODAS');
    setModalityFilter('TODAS');
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

  const kpis: ReportKpiItem[] = useMemo(() => {
    if (!reportData) return [];
    const groupText =
      groupBy !== 'nenhum' && reportData.groups.length > 0
        ? ` • ${reportData.groups.length} grupo(s)`
        : '';
    return [
      {
        label: 'Pedidos',
        value: reportData.totalOrders,
        subtext: `${reportData.deliveryCount} Ent. • ${reportData.pickupCount} Ret.${groupText}`,
        tone: 'neutral',
      },
      {
        label: 'Itens',
        value: `${reportData.totalItemQuantity} un.`,
        subtext: `${reportData.productSummary.length} prod.`,
        tone: 'emerald',
      },
      {
        label: 'Unidades',
        value: reportData.distinctUnitsCount,
        tone: 'neutral',
      },
      {
        label: 'Valor Total',
        value: `R$ ${formatCurrencyBR(reportData.grandTotalValor)}`,
        tone: 'emerald',
      },
    ];
  }, [reportData, groupBy]);

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

    const tabs =
      format === 'XLSX'
        ? [
            { key: 'pedidos', label: 'Aba 1: Relatorio_Pedidos' },
            { key: 'resumo', label: 'Aba 2: Resumo_Itens' },
          ]
        : undefined;

    return (
      <ReportPreviewBanner
        tabs={tabs}
        activeTab={xlsxPreviewTab}
        onTabChange={key => setXlsxPreviewTab(key === 'resumo' ? 'resumo' : 'pedidos')}
        reportTitle={
          xlsxPreviewTab === 'resumo' && format === 'XLSX'
            ? 'Resumo Consolidado de Itens'
            : 'Relatório de Pedidos'
        }
        generatedAtLabel={reportData.generatedAtLabel}
        rightMeta={`${reportData.totalOrders} pedido(s) • Agrupado por: ${
          reportData.groupLabel
        } • ${orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem'}`}
        filterParts={[
          { label: 'Período (Entrega)', value: reportData.periodLabel },
          { label: 'Unidade', value: reportData.unitLabel },
          { label: 'Status', value: reportData.statusLabel },
          { label: 'Ordem', value: reportData.sortLabel },
        ]}
      >
        {xlsxPreviewTab === 'resumo' && format === 'XLSX' ? (
          <div className="overflow-x-auto max-w-full max-h-[54vh]">
            <table className="w-full min-w-[460px] text-left border-collapse text-[11px]">
              <thead className="sticky top-0 bg-emerald-700 text-white text-[10px] font-bold uppercase">
                <tr>
                  <th className="py-2 px-2.5 text-center border border-emerald-800">SKU</th>
                  <th className="py-2 px-2.5 text-center border border-emerald-800">Produto</th>
                  <th className="py-2 px-2.5 text-center border border-emerald-800">Unidade</th>
                  <th className="py-2 px-2.5 text-center border border-emerald-800">Pedidos</th>
                  <th className="py-2 px-2.5 text-center border border-emerald-800">Qtd. Total</th>
                </tr>
              </thead>
              <tbody>
                {reportData.productSummary.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500 italic">
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
      </ReportPreviewBanner>
    );
  };

  return (
    <ReportModalShell
      isOpen={isOpen}
      onClose={onClose}
      step={step}
      title="Relatório de Pedidos"
      configSubtitle="Escolha formato, período de entrega, filtros, agrupamento, ordenação e colunas"
      format={format}
      orientation={orientation}
      busy={exporting}
      canPreview={selectedColumns.length > 0 && !isInvalidDateRange}
      kpis={kpis}
      onOpenPreview={() => void handleOpenPreview()}
      onBackToConfig={handleBackToConfig}
      onConfirmDownload={() => void handleConfirmDownload()}
    >
      {step === 'preview' ? (
        format === 'PDF' && pdfPreviewUrl ? (
          <ReportPdfPreviewFrame
            pdfUrl={pdfPreviewUrl}
            iframeTitle="Prévia do Relatório de Pedidos PDF"
            fallbackContent={renderSpreadsheetPreview()}
          />
        ) : (
          renderSpreadsheetPreview()
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
            scopeLabel="Base de pedidos"
            scopeSummary={
              reportData
                ? `${reportData.unitLabel} • ${reportData.statusLabel}${
                    searchTerm.trim() ? ` • Busca: "${searchTerm.trim()}"` : ''
                  }`
                : undefined
            }
            scope={scope}
            filteredCount={filteredOrders.length}
            totalCount={orders.length}
            onScopeChange={setScope}
          >
            {/* Período de Entrega */}
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Período (Data da Entrega)</span>
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
                          ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
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

            {/* Unidade + Modalidade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 border-t border-slate-100">
              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Unidade
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por unidade"
                    value={unitFilter}
                    onChange={e => setUnitFilter(e.target.value)}
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas as Unidades</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
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
                  Modalidade
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por modalidade"
                    value={modalityFilter}
                    onChange={e =>
                      setModalityFilter(e.target.value as 'TODAS' | 'DELIVERY' | 'RETIRADA')
                    }
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas (Entrega e Retirada)</option>
                    <option value="DELIVERY">Entrega (Delivery)</option>
                    <option value="RETIRADA">Retirada na Loja</option>
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
            groupOptions={PEDIDOS_REPORT_GROUP_OPTIONS}
            sortBy={sortBy}
            onSortByChange={val => setSortBy(val)}
            sortOptions={PEDIDOS_REPORT_SORT_OPTIONS}
            sortDirection={sortDirection}
            onToggleSortDirection={() =>
              setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
            }
            columns={PEDIDOS_REPORT_COLUMNS}
            defaultColumns={DEFAULT_PEDIDOS_REPORT_COLUMNS}
            selectedColumns={selectedColumns}
            onSelectedColumnsChange={setSelectedColumns}
            optionalColumnsTitle="Colunas Adicionais (Contato, Status e Financeiro)"
          />
        </div>
      )}
    </ReportModalShell>
  );
};
