import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import {
  ReportFiltersCard,
  ReportKpiItem,
  ReportModalShell,
  ReportOrganizationCard,
  ReportOutputStrip,
  ReportPdfPreviewFrame,
  ReportPreviewBanner,
} from './ReportModalShell';
import {
  Category,
  Product,
  ProductionShift,
  ProductionStatus,
  StoreUnit,
} from '../types';
import {
  ConsolidatedProductionItem,
  DEFAULT_PRODUCAO_REPORT_COLUMNS,
  PRODUCAO_REPORT_COLUMNS,
  PRODUCAO_REPORT_GROUP_OPTIONS,
  PRODUCAO_REPORT_SORT_OPTIONS,
  PRODUCAO_SHIFT_LABELS,
  PRODUCAO_STAGE_LABELS,
  ProducaoReportColumnKey,
  ProducaoReportConfig,
  ProducaoReportFormat,
  ProducaoReportGroupBy,
  ProducaoReportOrientation,
  ProducaoReportSortBy,
  ProducaoReportSortDirection,
  buildProducaoReportData,
  computeProducaoColumnWidthsMm,
  getProducaoReportCellText,
  getProducaoReportColumnTotal,
  getProducaoReportGroupTotal,
} from '../utils/producaoReportData';

interface ProducaoReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allItems: ConsolidatedProductionItem[];
  filteredItems: ConsolidatedProductionItem[];
  products: Product[];
  categories: Category[];
  units: StoreUnit[];
  initialDateFilter: 'PROXIMOS_7_DIAS' | 'TODAS' | 'HOJE' | 'AMANHA';
  initialShift: 'TODOS' | ProductionShift;
  initialStageFilter: 'TODOS' | ProductionStatus;
  initialGroupBy: 'NENHUM' | 'TURNO_DATA' | 'PRODUTO' | 'CATEGORIA' | 'LOJA_DESTINO';
  searchTerm: string;
}

const ALL_SHIFTS: ProductionShift[] = ['MANHA', 'TARDE', 'NOITE'];
const ALL_STAGES: ProductionStatus[] = ['PLANEJADA', 'EM_PREPARO', 'CONCLUIDA', 'CANCELADA'];

const STAGE_BADGE_CLASSES: Record<ProductionStatus, string> = {
  PLANEJADA: 'bg-slate-100 text-slate-700 border-slate-300',
  EM_PREPARO: 'bg-amber-100 text-amber-800 border-amber-300',
  CONCLUIDA: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  CANCELADA: 'bg-rose-100 text-rose-800 border-rose-300',
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
  const tomorrow = toLocalYyyyMmDd(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  );
  const next7End = toLocalYyyyMmDd(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
  );
  const monthStart = toLocalYyyyMmDd(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = toLocalYyyyMmDd(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  return [
    { label: 'Todo o período', start: '', end: '' },
    { label: 'Hoje', start: today, end: today },
    { label: 'Amanhã', start: tomorrow, end: tomorrow },
    { label: 'Próx. 7 dias', start: today, end: next7End },
    { label: 'Este mês', start: monthStart, end: monthEnd },
  ];
}

function mapScreenGroupBy(
  g: ProducaoReportModalProps['initialGroupBy']
): ProducaoReportGroupBy {
  switch (g) {
    case 'TURNO_DATA':
      return 'turnoData';
    case 'PRODUTO':
      return 'produto';
    case 'CATEGORIA':
      return 'categoria';
    case 'LOJA_DESTINO':
      return 'lojaDestino';
    default:
      return 'nenhum';
  }
}

export const ProducaoReportModal: React.FC<ProducaoReportModalProps> = ({
  isOpen,
  onClose,
  allItems,
  filteredItems,
  products,
  categories,
  units,
  initialDateFilter,
  initialShift,
  initialStageFilter,
  initialGroupBy,
  searchTerm,
}) => {
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');
  const [format, setFormat] = useState<ProducaoReportFormat>('PDF');
  const [orientation, setOrientation] = useState<ProducaoReportOrientation>('landscape');
  const [groupBy, setGroupBy] = useState<ProducaoReportGroupBy>('turnoData');
  const [sortBy, setSortBy] = useState<ProducaoReportSortBy>('dataTurno');
  const [sortDirection, setSortDirection] = useState<ProducaoReportSortDirection>('asc');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [shifts, setShifts] = useState<ProductionShift[]>(ALL_SHIFTS);
  const [stages, setStages] = useState<ProductionStatus[]>(ALL_STAGES);
  const [categoryFilter, setCategoryFilter] = useState<string>('TODAS');
  const [destinationFilter, setDestinationFilter] = useState<string>('TODAS');
  const [includeSummaryInPdf, setIncludeSummaryInPdf] = useState<boolean>(true);
  const [selectedColumns, setSelectedColumns] = useState<ProducaoReportColumnKey[]>(
    DEFAULT_PRODUCAO_REPORT_COLUMNS
  );
  const [exporting, setExporting] = useState(false);
  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [xlsxPreviewTab, setXlsxPreviewTab] = useState<'ordem' | 'resumo'>('ordem');
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
  const isInvalidDateRange = Boolean(startDate && endDate && startDate > endDate);
  const hasActiveFilterDiff = filteredItems.length !== allItems.length;

  useEffect(() => {
    if (!isOpen) {
      clearPreviewArtifacts();
      setStep('config');
      return;
    }
    setScope(hasActiveFilterDiff ? 'filtered' : 'all');
    setGroupBy(mapScreenGroupBy(initialGroupBy));
    setShifts(initialShift === 'TODOS' ? ALL_SHIFTS : [initialShift]);
    setStages(initialStageFilter === 'TODOS' ? ALL_STAGES : [initialStageFilter]);
    setCategoryFilter('TODAS');
    setDestinationFilter('TODAS');

    const now = new Date();
    const today = toLocalYyyyMmDd(now);
    const tomorrow = toLocalYyyyMmDd(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    );
    const next7 = toLocalYyyyMmDd(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
    );

    if (initialDateFilter === 'HOJE') {
      setStartDate(today);
      setEndDate(today);
    } else if (initialDateFilter === 'AMANHA') {
      setStartDate(tomorrow);
      setEndDate(tomorrow);
    } else if (initialDateFilter === 'PROXIMOS_7_DIAS') {
      setStartDate(today);
      setEndDate(next7);
    } else {
      setStartDate('');
      setEndDate('');
    }
    setStep('config');
  }, [
    isOpen,
    hasActiveFilterDiff,
    initialDateFilter,
    initialShift,
    initialStageFilter,
    initialGroupBy,
    clearPreviewArtifacts,
  ]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const availableCategories = useMemo(() => {
    const names = new Set<string>();
    categories.forEach(c => {
      if (c.nome) names.add(c.nome);
    });
    allItems.forEach(it => {
      if (it.categoriaNome) names.add(it.categoriaNome);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [categories, allItems]);

  const availableDestinations = useMemo(() => {
    const names = new Set<string>();
    units.forEach(u => {
      if (u.nome) names.add(u.nome);
    });
    allItems.forEach(it => {
      it.lojasDestino.forEach(dest => {
        if (dest) names.add(dest);
      });
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [units, allItems]);

  const targetItems = useMemo(() => {
    if (scope === 'filtered' && hasActiveFilterDiff) {
      return filteredItems;
    }
    return allItems;
  }, [scope, hasActiveFilterDiff, filteredItems, allItems]);

  const reportConfig: ProducaoReportConfig = useMemo(
    () => ({
      format,
      orientation,
      columns: selectedColumns,
      groupBy,
      sortBy,
      sortDirection,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      shifts,
      stages,
      categoryFilter,
      destinationFilter,
      includeSummaryInPdf,
    }),
    [
      format,
      orientation,
      selectedColumns,
      groupBy,
      sortBy,
      sortDirection,
      startDate,
      endDate,
      shifts,
      stages,
      categoryFilter,
      destinationFilter,
      includeSummaryInPdf,
    ]
  );

  const reportData = useMemo(() => {
    if (!isOpen) return null;
    const scopeLabel =
      scope === 'filtered' && hasActiveFilterDiff
        ? `Lotes filtrados (${targetItems.length} de ${allItems.length})`
        : `Todos os lotes (${targetItems.length})`;

    return buildProducaoReportData({
      items: targetItems,
      products,
      config: reportConfig,
      filterContext: {
        scopeLabel,
        searchTerm: scope === 'filtered' ? searchTerm : '',
      },
    });
  }, [
    isOpen,
    scope,
    hasActiveFilterDiff,
    targetItems,
    allItems.length,
    products,
    reportConfig,
    searchTerm,
  ]);

  const hasClearableFilters = Boolean(
    startDate ||
      endDate ||
      shifts.length < ALL_SHIFTS.length ||
      stages.length < ALL_STAGES.length ||
      categoryFilter !== 'TODAS' ||
      destinationFilter !== 'TODAS'
  );

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setShifts(ALL_SHIFTS);
    setStages(ALL_STAGES);
    setCategoryFilter('TODAS');
    setDestinationFilter('TODAS');
  };

  const toggleShift = (shift: ProductionShift) => {
    setShifts(prev => {
      if (prev.includes(shift)) {
        return prev.length > 1 ? prev.filter(s => s !== shift) : prev;
      }
      return [...prev, shift];
    });
  };

  const toggleStage = (stage: ProductionStatus) => {
    setStages(prev => {
      if (prev.includes(stage)) {
        return prev.length > 1 ? prev.filter(s => s !== stage) : prev;
      }
      return [...prev, stage];
    });
  };

  const handleOpenPreview = async () => {
    if (!reportData || selectedColumns.length === 0 || isInvalidDateRange || exporting) return;
    setExporting(true);
    clearPreviewArtifacts();
    try {
      if (format === 'PDF') {
        const { buildProducaoReportPdfBlob } = await import('../utils/producaoReportPdf');
        const blob = await buildProducaoReportPdfBlob(reportData);
        pdfBlobRef.current = blob;
        setPdfPreviewUrl(URL.createObjectURL(blob));
      } else {
        const { buildProducaoReportXlsxBuffer } = await import('../utils/producaoReportExcel');
        const buffer = buildProducaoReportXlsxBuffer(reportData);
        xlsxBufferRef.current = buffer;
        setXlsxPreviewTab('ordem');
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
        const { downloadProducaoReportPdfBlob } = await import('../utils/producaoReportPdf');
        downloadProducaoReportPdfBlob(pdfBlobRef.current);
      } else if (format === 'XLSX' && xlsxBufferRef.current) {
        const { downloadProducaoReportExcelBuffer } = await import('../utils/producaoReportExcel');
        downloadProducaoReportExcelBuffer(xlsxBufferRef.current);
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
        label: 'Lotes',
        value: reportData.totalLots,
        subtext: `${reportData.distinctDaysCount} dia(s)${groupText}`,
        tone: 'neutral',
      },
      {
        label: 'Qtd. Consolidada',
        value: `${reportData.totalQuantity} un.`,
        subtext:
          reportData.canceledLots > 0
            ? `Ativa: ${reportData.activeQuantity} un.`
            : undefined,
        tone: 'emerald',
        subtextTone: reportData.canceledLots > 0 ? 'rose' : 'default',
      },
      {
        label: 'Produtos',
        value: reportData.distinctProductsCount,
        tone: 'neutral',
      },
      {
        label: 'Destinos',
        value: reportData.distinctDestinationsCount,
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
    const previewWidthsMm = computeProducaoColumnWidthsMm(reportData, previewUsableMm);
    const previewWidthPcts = previewWidthsMm.map(
      w => `${((w / previewUsableMm) * 100).toFixed(2)}%`
    );

    const tabs =
      format === 'XLSX'
        ? [
            { key: 'ordem', label: 'Aba 1: Ordem_Producao' },
            { key: 'resumo', label: 'Aba 2: Resumo_Produtos' },
          ]
        : undefined;

    return (
      <ReportPreviewBanner
        tabs={tabs}
        activeTab={xlsxPreviewTab}
        onTabChange={key => setXlsxPreviewTab(key === 'resumo' ? 'resumo' : 'ordem')}
        reportTitle={
          xlsxPreviewTab === 'resumo' && format === 'XLSX'
            ? 'Resumo Consolidado por Produto'
            : 'Relatório de Produção'
        }
        generatedAtLabel={reportData.generatedAtLabel}
        rightMeta={`${reportData.totalLots} lote(s) • ${
          reportData.totalQuantity
        } un. • Agrupado por: ${reportData.groupLabel} • ${
          orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem'
        }`}
        filterParts={[
          { label: 'Período', value: reportData.periodLabel },
          { label: 'Turnos', value: reportData.shiftsLabel },
          { label: 'Estágios', value: reportData.stagesLabel },
          { label: 'Categoria', value: reportData.categoryLabel },
          { label: 'Destino', value: reportData.destinationLabel },
        ]}
      >
        {xlsxPreviewTab === 'resumo' && format === 'XLSX' ? (
          <div className="overflow-x-auto max-w-full max-h-[54vh]">
            <table className="w-full min-w-[560px] text-left border-collapse text-[11px]">
              <thead className="sticky top-0 bg-emerald-700 text-white text-[10px] font-bold uppercase">
                <tr>
                  <th className="py-2 px-2.5 text-center border border-emerald-800">SKU</th>
                  <th className="py-2 px-2.5 text-left border border-emerald-800">
                    Produto / Receita
                  </th>
                  <th className="py-2 px-2.5 text-left border border-emerald-800">Categoria</th>
                  <th className="py-2 px-2.5 text-center border border-emerald-800">Unid.</th>
                  <th className="py-2 px-2.5 text-center border border-emerald-800">Lotes</th>
                  <th className="py-2 px-2.5 text-center border border-emerald-800">Qtd. Total</th>
                  <th className="py-2 px-2.5 text-left border border-emerald-800">
                    Lojas Destino
                  </th>
                </tr>
              </thead>
              <tbody>
                {reportData.productSummary.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500 italic">
                      Nenhum produto encontrado nos critérios selecionados.
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
                      <td className="py-1.5 px-2 text-slate-700 border border-slate-200">
                        {item.categoriaNome}
                      </td>
                      <td className="py-1.5 px-2 text-center text-slate-700 border border-slate-200">
                        {item.unidadeMedida}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono text-slate-700 border border-slate-200">
                        {item.lotsCount}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono font-bold text-emerald-800 border border-slate-200">
                        {item.totalQuantidade}
                      </td>
                      <td className="py-1.5 px-2 text-slate-700 border border-slate-200">
                        {item.destinosText || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-800 text-white font-bold text-[11px]">
                  <td colSpan={4} className="py-2 px-2.5 border border-emerald-900">
                    TOTAL CONSOLIDADO ({reportData.productSummary.length} produto(s))
                  </td>
                  <td className="py-2 px-2 text-center font-mono border border-emerald-900">
                    {reportData.totalLots}
                  </td>
                  <td className="py-2 px-2 text-center font-mono border border-emerald-900">
                    {reportData.totalQuantity}
                  </td>
                  <td className="py-2 px-2 text-center font-mono border border-emerald-900">
                    {reportData.distinctDestinationsCount} destino(s)
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
                  orientation === 'portrait' ? 620 : 820,
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
                {reportData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={cols.length} className="py-8 text-center text-slate-500 italic">
                      Nenhuma demanda de produção encontrada com os critérios selecionados.
                    </td>
                  </tr>
                ) : (
                  reportData.groups.map(group => (
                    <React.Fragment key={group.key}>
                      {isGrouped && (
                        <tr className="bg-emerald-100 text-emerald-950 font-bold text-[11px]">
                          <td colSpan={cols.length} className="py-1.5 px-2.5 border border-emerald-200">
                            {reportData.groupHeaderPrefix}: {group.label.toUpperCase()} ({group.totalLots}{' '}
                            lote(s) • Total: {group.totalQuantity} un.)
                          </td>
                        </tr>
                      )}
                      {group.rows.map((row, rowIdx) => {
                        const isCanceled = row.status === 'CANCELADA';
                        const rowBg = isCanceled
                          ? 'bg-rose-50/70'
                          : row.isReplenishment
                          ? 'bg-sky-50'
                          : rowIdx % 2 === 0
                          ? 'bg-white'
                          : 'bg-slate-50';
                        return (
                          <tr key={row.key} className={rowBg}>
                            {cols.map(col => {
                              const alignCls =
                                col.align === 'center'
                                  ? 'text-center'
                                  : col.align === 'right'
                                  ? 'text-right'
                                  : 'text-left';

                              if (col.key === 'estagio') {
                                return (
                                  <td
                                    key={col.key}
                                    className={`py-1.5 px-2 border border-slate-200 align-middle ${alignCls}`}
                                  >
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${STAGE_BADGE_CLASSES[row.status]}`}
                                    >
                                      {row.statusLabel}
                                    </span>
                                  </td>
                                );
                              }

                              const text = getProducaoReportCellText(row, col.key);
                              const extraCls =
                                col.key === 'quantidade'
                                  ? 'font-mono font-bold text-emerald-800'
                                  : col.key === 'produtoSku'
                                  ? 'font-semibold text-slate-900 whitespace-pre-line'
                                  : col.key === 'origem' && row.isReplenishment
                                  ? 'font-semibold text-sky-700'
                                  : 'text-slate-700 whitespace-pre-line';

                              return (
                                <td
                                  key={col.key}
                                  className={`py-1.5 px-2 border border-slate-200 align-middle ${alignCls} ${extraCls}`}
                                >
                                  {text}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {isGrouped && hasAnySummable && (
                        <tr className="bg-emerald-50 text-emerald-950 font-bold text-[10.5px]">
                          {cols.map((col, idx) => {
                            if (idx === 0 && firstSummableIdx > 1) {
                              return (
                                <td
                                  key={col.key}
                                  colSpan={firstSummableIdx}
                                  className="py-1.5 px-2 border border-emerald-200"
                                >
                                  Subtotal — {group.label} ({group.totalLots} lote(s))
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
                              return (
                                <td
                                  key={col.key}
                                  className={`py-1.5 px-2 border border-emerald-200 font-mono ${alignCls}`}
                                >
                                  {getProducaoReportGroupTotal(group, col.key) ?? 0}
                                </td>
                              );
                            }
                            return (
                              <td key={col.key} className="py-1.5 px-2 border border-emerald-200">
                                {idx === firstSummableIdx ? `Subtotal (${group.totalLots})` : ''}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
              <tfoot>
                {!hasAnySummable ? (
                  <tr className="bg-emerald-800 text-white font-bold text-[11px]">
                    <td colSpan={cols.length} className="py-2 px-2.5 border border-emerald-900">
                      TOTAL GERAL: {reportData.totalLots} lote(s) • {reportData.totalQuantity} un.
                      • {reportData.distinctProductsCount} produto(s)
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
                            TOTAL GERAL ({reportData.totalLots} lote(s)
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
                        return (
                          <td
                            key={col.key}
                            className={`py-2 px-2 border border-emerald-900 font-mono whitespace-nowrap ${alignCls}`}
                          >
                            {getProducaoReportColumnTotal(reportData, col.key) ?? 0}
                          </td>
                        );
                      }
                      return (
                        <td key={col.key} className="py-2 px-2 border border-emerald-900">
                          {idx === firstSummableIdx ? `TOTAL (${reportData.totalLots})` : ''}
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
      title="Relatório de Produção"
      configSubtitle="Escolha formato, período de produção, filtros, agrupamento, ordenação e colunas"
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
            iframeTitle="Prévia do Relatório de Produção PDF"
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
            scopeLabel="Base de lotes"
            scopeSummary={
              reportData
                ? `${reportData.periodLabel} • ${reportData.shiftsLabel}${
                    searchTerm.trim() ? ` • Busca: "${searchTerm.trim()}"` : ''
                  }`
                : undefined
            }
            scope={scope}
            filteredCount={filteredItems.length}
            totalCount={allItems.length}
            onScopeChange={nextScope => {
              setScope(nextScope);
              if (nextScope === 'all') {
                setStartDate('');
                setEndDate('');
                setShifts(ALL_SHIFTS);
                setStages(ALL_STAGES);
              }
            }}
          >
            {/* Período de Produção */}
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Período (Data de Produção)</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {datePresets.map(preset => {
                  const isActive = startDate === preset.start && endDate === preset.end;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setStartDate(preset.start);
                        setEndDate(preset.end);
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
                    De (Produção)
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    aria-label="Data inicial de produção"
                    className="w-full min-w-0 max-w-full h-9 bg-white border border-slate-300 rounded-lg px-2 sm:px-2.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    Até (Produção)
                  </span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    aria-label="Data final de produção"
                    className="w-full min-w-0 max-w-full h-9 bg-white border border-slate-300 rounded-lg px-2 sm:px-2.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {isInvalidDateRange && (
                <p className="text-[11px] font-semibold text-rose-600">
                  A data inicial não pode ser maior que a data final.
                </p>
              )}
            </div>

            {/* Turnos + Estágios Cozinha */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2.5 border-t border-slate-100">
              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-1">
                  Turnos
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_SHIFTS.map(sh => {
                    const active = shifts.includes(sh);
                    return (
                      <button
                        key={sh}
                        type="button"
                        onClick={() => toggleShift(sh)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {PRODUCAO_SHIFT_LABELS[sh]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-1">
                  Estágios Cozinha
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_STAGES.map(st => {
                    const active = stages.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => toggleStage(st)}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                          active
                            ? STAGE_BADGE_CLASSES[st]
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {PRODUCAO_STAGE_LABELS[st]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Categoria + Loja Destino */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Categoria
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por categoria"
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas as Categorias</option>
                    {availableCategories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
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
                  Loja Destino
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por loja destino"
                    value={destinationFilter}
                    onChange={e => setDestinationFilter(e.target.value)}
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODAS">Todos os Destinos</option>
                    {availableDestinations.map(dest => (
                      <option key={dest} value={dest}>
                        {dest}
                      </option>
                    ))}
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
            groupOptions={PRODUCAO_REPORT_GROUP_OPTIONS}
            sortBy={sortBy}
            onSortByChange={val => setSortBy(val)}
            sortOptions={PRODUCAO_REPORT_SORT_OPTIONS}
            sortDirection={sortDirection}
            onToggleSortDirection={() =>
              setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
            }
            columns={PRODUCAO_REPORT_COLUMNS}
            defaultColumns={DEFAULT_PRODUCAO_REPORT_COLUMNS}
            selectedColumns={selectedColumns}
            onSelectedColumnsChange={setSelectedColumns}
            optionalColumnsTitle="Colunas Adicionais (SKU, Pedidos e Preparo)"
            extraOption={
              format === 'PDF' ? (
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSummaryInPdf}
                    onChange={e => setIncludeSummaryInPdf(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  <span>Incluir tabela de Resumo Consolidado por Produto ao final do PDF</span>
                </label>
              ) : undefined
            }
          />
        </div>
      )}
    </ReportModalShell>
  );
};
