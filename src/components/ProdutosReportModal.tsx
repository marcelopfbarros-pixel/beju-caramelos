import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatCurrencyBR } from './CurrencyInput';
import {
  ReportFiltersCard,
  ReportFormat,
  ReportKpiItem,
  ReportModalShell,
  ReportOrganizationCard,
  ReportOrientation,
  ReportOutputStrip,
  ReportPdfPreviewFrame,
  ReportSelectOption,
  ReportSortDirection,
} from './ReportModalShell';
import { TabularReportPreviewTable } from './TabularReportPreviewTable';
import { Category, Product } from '../types';
import {
  TabularReportColumnDef,
  TabularReportData,
  TabularReportGroup,
  TabularReportRow,
} from '../utils/tabularReportTypes';

export type ProdutosReportColumnKey =
  | 'sku'
  | 'descricao'
  | 'categoria'
  | 'unidade'
  | 'precoUnitario'
  | 'status'
  | 'tempoProducaoMinutos'
  | 'fotoUrl';

export type ProdutosReportGroupBy = 'categoria' | 'status' | 'unidade' | 'nenhum';
export type ProdutosReportSortBy =
  | 'nome'
  | 'sku'
  | 'preco'
  | 'tempo'
  | 'categoria';

interface ProdutosReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allProducts: Product[];
  filteredProducts: Product[];
  categories: Category[];
  initialCategoryFilter: string;
  initialStatusFilter: 'TODOS' | 'ATIVOS' | 'INATIVOS';
  initialGroupBy: 'CATEGORIA' | 'STATUS' | 'UNIDADE' | 'NENHUM';
  searchTerm: string;
}

const PRODUTOS_REPORT_COLUMNS: Array<TabularReportColumnDef<ProdutosReportColumnKey>> = [
  {
    key: 'sku',
    label: 'Código SKU',
    shortLabel: 'SKU',
    isDefault: true,
    kind: 'text',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 26,
    excelWch: 13,
    excelMinWch: 10,
    excelMaxWch: 18,
  },
  {
    key: 'descricao',
    label: 'Descrição do Produto',
    shortLabel: 'Produto',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 32,
    pdfMinWidthMm: 38,
    pdfMaxWidthMm: 90,
    excelWch: 34,
    excelMinWch: 20,
    excelMaxWch: 52,
    isFlexible: true,
  },
  {
    key: 'categoria',
    label: 'Categoria',
    shortLabel: 'Categoria',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 18,
    pdfMinWidthMm: 22,
    pdfMaxWidthMm: 45,
    excelWch: 20,
    excelMinWch: 14,
    excelMaxWch: 30,
  },
  {
    key: 'unidade',
    label: 'Unidade',
    shortLabel: 'Unid.',
    isDefault: true,
    kind: 'text',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 12,
    pdfMaxWidthMm: 18,
    excelWch: 10,
    excelMinWch: 8,
    excelMaxWch: 14,
  },
  {
    key: 'precoUnitario',
    label: 'Preço Unitário (R$)',
    shortLabel: 'Preço Unit.',
    isDefault: true,
    kind: 'currency',
    align: 'right',
    pdfWeight: 14,
    pdfMinWidthMm: 20,
    pdfMaxWidthMm: 30,
    excelWch: 16,
    excelMinWch: 13,
    excelMaxWch: 22,
  },
  {
    key: 'status',
    label: 'Status',
    shortLabel: 'Status',
    isDefault: true,
    kind: 'badge',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 26,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 16,
  },
  {
    key: 'tempoProducaoMinutos',
    label: 'Tempo de Produção (Min)',
    shortLabel: 'Tempo (min)',
    isDefault: false,
    kind: 'number',
    align: 'center',
    pdfWeight: 12,
    pdfMinWidthMm: 16,
    pdfMaxWidthMm: 24,
    excelWch: 14,
    excelMinWch: 11,
    excelMaxWch: 18,
  },
  {
    key: 'fotoUrl',
    label: 'URL da Foto',
    shortLabel: 'Foto URL',
    isDefault: false,
    kind: 'text',
    align: 'left',
    pdfWeight: 22,
    pdfMinWidthMm: 26,
    pdfMaxWidthMm: 60,
    excelWch: 28,
    excelMinWch: 16,
    excelMaxWch: 48,
    isFlexible: true,
  },
];

const DEFAULT_COLUMNS: ProdutosReportColumnKey[] = PRODUTOS_REPORT_COLUMNS.filter(
  c => c.isDefault
).map(c => c.key);

const GROUP_OPTIONS: Array<ReportSelectOption<ProdutosReportGroupBy>> = [
  { value: 'categoria', label: 'Categoria' },
  { value: 'status', label: 'Status (Ativo / Inativo)' },
  { value: 'unidade', label: 'Unidade de Medida' },
  { value: 'nenhum', label: 'Sem Agrupamento' },
];

const SORT_OPTIONS: Array<ReportSelectOption<ProdutosReportSortBy>> = [
  { value: 'nome', label: 'Produto (A-Z)' },
  { value: 'sku', label: 'Código SKU' },
  { value: 'preco', label: 'Preço Unitário' },
  { value: 'tempo', label: 'Tempo de Produção' },
  { value: 'categoria', label: 'Categoria' },
];

function mapScreenGroup(
  g: ProdutosReportModalProps['initialGroupBy']
): ProdutosReportGroupBy {
  switch (g) {
    case 'CATEGORIA':
      return 'categoria';
    case 'STATUS':
      return 'status';
    case 'UNIDADE':
      return 'unidade';
    default:
      return 'nenhum';
  }
}

export const ProdutosReportModal: React.FC<ProdutosReportModalProps> = ({
  isOpen,
  onClose,
  allProducts,
  filteredProducts,
  categories,
  initialCategoryFilter,
  initialStatusFilter,
  initialGroupBy,
  searchTerm,
}) => {
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');
  const [format, setFormat] = useState<ReportFormat>('PDF');
  const [orientation, setOrientation] = useState<ReportOrientation>('landscape');
  const [categoryFilter, setCategoryFilter] = useState<string>('TODAS');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');
  const [measureUnitFilter, setMeasureUnitFilter] = useState<string>('TODAS');
  const [groupBy, setGroupBy] = useState<ProdutosReportGroupBy>('categoria');
  const [sortBy, setSortBy] = useState<ProdutosReportSortBy>('nome');
  const [sortDirection, setSortDirection] = useState<ReportSortDirection>('asc');
  const [selectedColumns, setSelectedColumns] =
    useState<ProdutosReportColumnKey[]>(DEFAULT_COLUMNS);
  const [includeSummaryInPdf, setIncludeSummaryInPdf] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [previewTab, setPreviewTab] = useState<'main' | 'summary'>('main');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
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

  const hasActiveFilterDiff = filteredProducts.length !== allProducts.length;

  useEffect(() => {
    if (!isOpen) {
      clearPreviewArtifacts();
      setStep('config');
      return;
    }
    setScope(hasActiveFilterDiff ? 'filtered' : 'all');
    setCategoryFilter(initialCategoryFilter);
    setStatusFilter(initialStatusFilter);
    setMeasureUnitFilter('TODAS');
    setGroupBy(mapScreenGroup(initialGroupBy));
    setStep('config');
  }, [
    isOpen,
    hasActiveFilterDiff,
    initialCategoryFilter,
    initialStatusFilter,
    initialGroupBy,
    clearPreviewArtifacts,
  ]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const availableCategories = useMemo(
    () =>
      [...categories]
        .filter(c => c.nome)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [categories]
  );

  const availableMeasureUnits = useMemo(() => {
    const set = new Set<string>();
    allProducts.forEach(p => {
      if (p.unidade) set.add(p.unidade);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allProducts]);

  const sortedProducts = useMemo(() => {
    const base =
      scope === 'filtered' && hasActiveFilterDiff ? filteredProducts : allProducts;
    const filtered = base.filter(p => {
      if (categoryFilter !== 'TODAS' && p.categoriaId !== categoryFilter) return false;
      if (statusFilter === 'ATIVOS' && !p.ativo) return false;
      if (statusFilter === 'INATIVOS' && p.ativo) return false;
      if (measureUnitFilter !== 'TODAS' && p.unidade !== measureUnitFilter) return false;
      return true;
    });

    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'sku') {
        return a.sku.localeCompare(b.sku, 'pt-BR') * dir;
      }
      if (sortBy === 'preco') {
        const cmp = (a.precoUnitario - b.precoUnitario) * dir;
        if (cmp !== 0) return cmp;
      } else if (sortBy === 'tempo') {
        const cmp = ((a.tempoProducaoMinutos || 0) - (b.tempoProducaoMinutos || 0)) * dir;
        if (cmp !== 0) return cmp;
      } else if (sortBy === 'categoria') {
        const ca = catMap.get(a.categoriaId)?.nome || 'Sem Categoria';
        const cb = catMap.get(b.categoriaId)?.nome || 'Sem Categoria';
        const cmp = ca.localeCompare(cb, 'pt-BR') * dir;
        if (cmp !== 0) return cmp;
      }
      return a.descricao.localeCompare(b.descricao, 'pt-BR') * dir;
    });
  }, [
    scope,
    hasActiveFilterDiff,
    filteredProducts,
    allProducts,
    categoryFilter,
    statusFilter,
    measureUnitFilter,
    sortBy,
    sortDirection,
    catMap,
  ]);

  const reportData: TabularReportData<ProdutosReportColumnKey> | null = useMemo(() => {
    if (!isOpen) return null;
    const selectedColDefs = selectedColumns
      .map(key => PRODUTOS_REPORT_COLUMNS.find(c => c.key === key))
      .filter((c): c is TabularReportColumnDef<ProdutosReportColumnKey> => Boolean(c));

    const toRow = (p: Product): TabularReportRow<ProdutosReportColumnKey> => {
      const catName = catMap.get(p.categoriaId)?.nome || 'Sem Categoria';
      return {
        key: p.id,
        rowTone: p.ativo ? 'default' : 'rose',
        cells: {
          sku: { text: p.sku, tone: 'slate' },
          descricao: { text: p.descricao, tone: 'bold' },
          categoria: { text: catName, tone: 'default' },
          unidade: { text: p.unidade, tone: 'slate' },
          precoUnitario: {
            text: `R$ ${formatCurrencyBR(p.precoUnitario)}`,
            numValue: p.precoUnitario,
            tone: 'emerald',
          },
          status: {
            text: p.ativo ? 'Ativo' : 'Inativo',
            tone: p.ativo ? 'emerald' : 'rose',
            badge: true,
          },
          tempoProducaoMinutos: {
            text: String(p.tempoProducaoMinutos || 0),
            numValue: p.tempoProducaoMinutos || 0,
            tone: 'slate',
          },
          fotoUrl: { text: p.fotoUrl || '—', tone: 'slate' },
        },
      };
    };

    const allTabularRows = sortedProducts.map(toRow);
    const groups: Array<TabularReportGroup<ProdutosReportColumnKey>> = [];

    if (groupBy === 'nenhum') {
      groups.push({
        key: 'all',
        label: 'Todos os Produtos',
        rows: allTabularRows,
        subtotals: {},
      });
    } else {
      const bucket = new Map<string, Product[]>();
      sortedProducts.forEach(p => {
        const key =
          groupBy === 'categoria'
            ? catMap.get(p.categoriaId)?.nome || 'Sem Categoria'
            : groupBy === 'status'
            ? p.ativo
              ? 'Ativos'
              : 'Inativos'
            : `Unidade: ${p.unidade}`;
        const arr = bucket.get(key) || [];
        arr.push(p);
        bucket.set(key, arr);
      });
      Array.from(bucket.entries())
        .sort(([ka], [kb]) => ka.localeCompare(kb, 'pt-BR'))
        .forEach(([label, prods]) => {
          const avgPrice =
            prods.length > 0
              ? prods.reduce((s, p) => s + p.precoUnitario, 0) / prods.length
              : 0;
          groups.push({
            key: label,
            label,
            headerSummary: `${prods.length} produto(s) • Ticket médio: R$ ${formatCurrencyBR(
              avgPrice
            )}`,
            rows: prods.map(toRow),
            subtotals: {},
          });
        });
    }

    // Category summary sheet
    const catSummaryMap = new Map<
      string,
      {
        name: string;
        count: number;
        activeCount: number;
        inactiveCount: number;
        minPrice: number;
        maxPrice: number;
      }
    >();
    sortedProducts.forEach(p => {
      const catName = catMap.get(p.categoriaId)?.nome || 'Sem Categoria';
      const cur = catSummaryMap.get(catName) || {
        name: catName,
        count: 0,
        activeCount: 0,
        inactiveCount: 0,
        minPrice: p.precoUnitario,
        maxPrice: p.precoUnitario,
      };
      cur.count += 1;
      if (p.ativo) cur.activeCount += 1;
      else cur.inactiveCount += 1;
      cur.minPrice = Math.min(cur.minPrice, p.precoUnitario);
      cur.maxPrice = Math.max(cur.maxPrice, p.precoUnitario);
      catSummaryMap.set(catName, cur);
    });

    const catEntries = Array.from(catSummaryMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR')
    );

    const summaryRows: TabularReportRow[] = catEntries.map(c => ({
      key: c.name,
      cells: {
        categoria: { text: c.name, tone: 'bold' },
        produtos: { text: String(c.count), numValue: c.count, tone: 'bold' },
        ativos: { text: String(c.activeCount), numValue: c.activeCount, tone: 'emerald' },
        inativos: {
          text: String(c.inactiveCount),
          numValue: c.inactiveCount,
          tone: c.inactiveCount > 0 ? 'rose' : 'slate',
        },
        menorPreco: {
          text: `R$ ${formatCurrencyBR(c.minPrice)}`,
          numValue: c.minPrice,
          tone: 'slate',
        },
        maiorPreco: {
          text: `R$ ${formatCurrencyBR(c.maxPrice)}`,
          numValue: c.maxPrice,
          tone: 'emerald',
        },
      },
    }));

    const activeTotal = sortedProducts.filter(p => p.ativo).length;
    const inactiveTotal = sortedProducts.length - activeTotal;
    const avgTicket =
      sortedProducts.length > 0
        ? sortedProducts.reduce((s, p) => s + p.precoUnitario, 0) / sortedProducts.length
        : 0;

    const now = new Date();
    const generatedAtLabel = `${String(now.getDate()).padStart(2, '0')}/${String(
      now.getMonth() + 1
    ).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(
      2,
      '0'
    )}:${String(now.getMinutes()).padStart(2, '0')}`;

    const groupOpt = GROUP_OPTIONS.find(o => o.value === groupBy);
    const sortOpt = SORT_OPTIONS.find(o => o.value === sortBy);
    const catLabel =
      categoryFilter === 'TODAS'
        ? 'Todas as Categorias'
        : catMap.get(categoryFilter)?.nome || 'Categoria';
    const statusLabel =
      statusFilter === 'TODOS' ? 'Todos' : statusFilter === 'ATIVOS' ? 'Ativos' : 'Inativos';

    const groupPrefixMap: Record<ProdutosReportGroupBy, string> = {
      categoria: 'CATEGORIA',
      status: 'STATUS',
      unidade: 'UNIDADE',
      nenhum: '',
    };

    return {
      title: 'Relatório de Produtos',
      filePrefix: 'Beju_Caramelos_Relatorio_Produtos',
      sheetName: 'Relatorio_Produtos',
      mainTabLabel: 'Aba 1: Relatorio_Produtos',
      orientation,
      isGrouped: groupBy !== 'nenhum',
      groupLabel: groupOpt?.label || 'Categoria',
      groupHeaderPrefix: groupPrefixMap[groupBy],
      itemNounSingular: 'produto',
      itemNounPlural: 'produtos',
      generatedAtLabel,
      rightMeta: `${sortedProducts.length} produto(s) • ${activeTotal} ativo(s) • Agrupado por: ${
        groupOpt?.label || 'Categoria'
      } • ${orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem'}`,
      filterParts: [
        { label: 'Categoria', value: catLabel },
        { label: 'Status', value: statusLabel },
        {
          label: 'Unidade',
          value: measureUnitFilter === 'TODAS' ? 'Todas' : measureUnitFilter,
        },
        {
          label: 'Ordem',
          value: `${sortOpt?.label || 'Produto'} (${
            sortDirection === 'asc' ? 'Crescente ↑' : 'Decrescente ↓'
          })`,
        },
        ...(scope === 'filtered' && searchTerm.trim()
          ? [{ label: 'Busca', value: `"${searchTerm.trim()}"` }]
          : []),
      ],
      selectedColumns: selectedColDefs,
      rows: allTabularRows,
      groups,
      grandTotals: {},
      grandTotalSummaryText: `TOTAL GERAL: ${sortedProducts.length} produto(s) (${activeTotal} ativos, ${inactiveTotal} inativos) • Ticket médio: R$ ${formatCurrencyBR(
        avgTicket
      )}`,
      emptyMessage: 'Nenhum produto encontrado com os critérios selecionados.',
      includeSummaryInPdf,
      summarySheet: {
        sheetName: 'Resumo_Categorias',
        tabLabel: 'Aba 2: Resumo_Categorias',
        title: 'Resumo Consolidado por Categoria',
        columns: [
          { key: 'categoria', label: 'Categoria', align: 'left', kind: 'text', wch: 26 },
          {
            key: 'produtos',
            label: 'Produtos',
            align: 'center',
            kind: 'number',
            wch: 12,
            summable: true,
          },
          {
            key: 'ativos',
            label: 'Ativos',
            align: 'center',
            kind: 'number',
            wch: 11,
            summable: true,
          },
          {
            key: 'inativos',
            label: 'Inativos',
            align: 'center',
            kind: 'number',
            wch: 11,
            summable: true,
          },
          {
            key: 'menorPreco',
            label: 'Menor Preço',
            align: 'right',
            kind: 'currency',
            wch: 15,
          },
          {
            key: 'maiorPreco',
            label: 'Maior Preço',
            align: 'right',
            kind: 'currency',
            wch: 15,
          },
        ],
        rows: summaryRows,
        totalLabel: `TOTAL CONSOLIDADO (${summaryRows.length} categoria(s))`,
        totals: {
          produtos: sortedProducts.length,
          ativos: activeTotal,
          inativos: inactiveTotal,
        },
        emptyMessage: 'Nenhuma categoria encontrada nos critérios selecionados.',
      },
    };
  }, [
    isOpen,
    selectedColumns,
    sortedProducts,
    catMap,
    groupBy,
    sortBy,
    sortDirection,
    orientation,
    categoryFilter,
    statusFilter,
    measureUnitFilter,
    scope,
    searchTerm,
    includeSummaryInPdf,
  ]);

  const hasClearableFilters = Boolean(
    categoryFilter !== 'TODAS' || statusFilter !== 'TODOS' || measureUnitFilter !== 'TODAS'
  );

  const handleClearFilters = () => {
    setCategoryFilter('TODAS');
    setStatusFilter('TODOS');
    setMeasureUnitFilter('TODAS');
  };

  const handleOpenPreview = async () => {
    if (!reportData || selectedColumns.length === 0 || exporting) return;
    setExporting(true);
    clearPreviewArtifacts();
    try {
      if (format === 'PDF') {
        const { buildTabularReportPdfBlob } = await import('../utils/tabularReportPdf');
        const blob = await buildTabularReportPdfBlob(reportData);
        pdfBlobRef.current = blob;
        setPdfPreviewUrl(URL.createObjectURL(blob));
      } else {
        const { buildTabularReportXlsxBuffer } = await import('../utils/tabularReportExcel');
        const buffer = buildTabularReportXlsxBuffer(reportData);
        xlsxBufferRef.current = buffer;
        setPreviewTab('main');
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
    if (!reportData || exporting) return;
    setExporting(true);
    try {
      if (format === 'PDF' && pdfBlobRef.current) {
        const { downloadTabularReportPdfBlob } = await import('../utils/tabularReportPdf');
        downloadTabularReportPdfBlob(pdfBlobRef.current, reportData.filePrefix);
      } else if (format === 'XLSX' && xlsxBufferRef.current) {
        const { downloadTabularReportExcelBuffer } = await import('../utils/tabularReportExcel');
        downloadTabularReportExcelBuffer(xlsxBufferRef.current, reportData.filePrefix);
      }
      onClose();
    } finally {
      setExporting(false);
    }
  };

  const kpis: ReportKpiItem[] = useMemo(() => {
    const activeCount = sortedProducts.filter(p => p.ativo).length;
    const inactiveCount = sortedProducts.length - activeCount;
    const distinctCats = new Set(sortedProducts.map(p => p.categoriaId)).size;
    const avgPrice =
      sortedProducts.length > 0
        ? sortedProducts.reduce((s, p) => s + p.precoUnitario, 0) / sortedProducts.length
        : 0;
    return [
      {
        label: 'Produtos',
        value: sortedProducts.length,
        subtext:
          groupBy !== 'nenhum' && reportData
            ? `${reportData.groups.length} grupo(s)`
            : undefined,
        tone: 'neutral',
      },
      {
        label: 'Ativos',
        value: activeCount,
        subtext: inactiveCount > 0 ? `${inactiveCount} inativo(s)` : 'Todos ativos',
        tone: 'emerald',
        subtextTone: inactiveCount > 0 ? 'rose' : 'default',
      },
      {
        label: 'Categorias',
        value: distinctCats,
        tone: 'neutral',
      },
      {
        label: 'Ticket Médio',
        value: `R$ ${formatCurrencyBR(avgPrice)}`,
        tone: 'emerald',
      },
    ];
  }, [sortedProducts, groupBy, reportData]);

  return (
    <ReportModalShell
      isOpen={isOpen}
      onClose={onClose}
      step={step}
      title="Relatório de Produtos"
      configSubtitle="Escolha formato, categoria, status, agrupamento, ordenação e colunas"
      format={format}
      orientation={orientation}
      busy={exporting}
      canPreview={selectedColumns.length > 0}
      kpis={kpis}
      onOpenPreview={() => void handleOpenPreview()}
      onBackToConfig={handleBackToConfig}
      onConfirmDownload={() => void handleConfirmDownload()}
    >
      {step === 'preview' && reportData ? (
        format === 'PDF' && pdfPreviewUrl ? (
          <ReportPdfPreviewFrame
            pdfUrl={pdfPreviewUrl}
            iframeTitle="Prévia do Relatório de Produtos PDF"
            fallbackContent={
              <TabularReportPreviewTable
                data={reportData}
                format={format}
                activeTab={previewTab}
                onTabChange={setPreviewTab}
              />
            }
          />
        ) : (
          <TabularReportPreviewTable
            data={reportData}
            format={format}
            activeTab={previewTab}
            onTabChange={setPreviewTab}
          />
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
            scopeLabel="Base de produtos"
            scopeSummary={
              searchTerm.trim() ? `Busca ativa: "${searchTerm.trim()}"` : undefined
            }
            scope={scope}
            filteredCount={filteredProducts.length}
            totalCount={allProducts.length}
            onScopeChange={setScope}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                      <option key={cat.id} value={cat.id}>
                        {cat.nome}
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
                  Status
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por status do produto"
                    value={statusFilter}
                    onChange={e =>
                      setStatusFilter(e.target.value as 'TODOS' | 'ATIVOS' | 'INATIVOS')
                    }
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODOS">Todos os Status</option>
                    <option value="ATIVOS">Ativos</option>
                    <option value="INATIVOS">Inativos</option>
                  </select>
                  <ChevronDown
                    className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                  Unidade de Medida
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por unidade de medida"
                    value={measureUnitFilter}
                    onChange={e => setMeasureUnitFilter(e.target.value)}
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODAS">Todas as Unidades</option>
                    {availableMeasureUnits.map(u => (
                      <option key={u} value={u}>
                        {u}
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
            groupOptions={GROUP_OPTIONS}
            sortBy={sortBy}
            onSortByChange={val => setSortBy(val)}
            sortOptions={SORT_OPTIONS}
            sortDirection={sortDirection}
            onToggleSortDirection={() =>
              setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
            }
            columns={PRODUTOS_REPORT_COLUMNS}
            defaultColumns={DEFAULT_COLUMNS}
            selectedColumns={selectedColumns}
            onSelectedColumnsChange={setSelectedColumns}
            optionalColumnsTitle="Colunas Adicionais (Preparo e Mídia)"
            extraOption={
              format === 'PDF' ? (
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSummaryInPdf}
                    onChange={e => setIncludeSummaryInPdf(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  <span>Incluir tabela de Resumo Consolidado por Categoria ao final do PDF</span>
                </label>
              ) : undefined
            }
          />
        </div>
      )}
    </ReportModalShell>
  );
};
