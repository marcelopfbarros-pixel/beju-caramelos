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
import { Category, Order, Product, StockItem, StoreUnit } from '../types';
import { computeReservedStockMap, isLowStockItem, stockReservationKey } from '../utils/stockAvailability';
import {
  TabularReportColumnDef,
  TabularReportData,
  TabularReportGroup,
  TabularReportRow,
} from '../utils/tabularReportTypes';

export type EstoqueReportColumnKey =
  | 'unidade'
  | 'sku'
  | 'produto'
  | 'quantidadeAtual'
  | 'reservado'
  | 'disponivel'
  | 'situacao'
  | 'categoria'
  | 'unidadeMedida'
  | 'quantidadeMinima'
  | 'valorEstoque'
  | 'atualizadoEm';

export type EstoqueReportGroupBy = 'loja' | 'categoria' | 'situacao' | 'nenhum';
export type EstoqueReportSortBy =
  | 'produto'
  | 'saldo'
  | 'disponivel'
  | 'reservado'
  | 'atualizacao';

interface EstoqueReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allStock: StockItem[];
  filteredStock: StockItem[];
  orders: Order[];
  products: Product[];
  categories: Category[];
  units: StoreUnit[];
  activeUnitId: string;
  initialStatusFilter: 'TODOS' | 'CRITICO' | 'OK' | 'COM_RESERVA';
  initialGroupBy: 'LOJA' | 'CATEGORIA' | 'SITUACAO' | 'NENHUM';
  searchTerm: string;
}

const ESTOQUE_REPORT_COLUMNS: Array<TabularReportColumnDef<EstoqueReportColumnKey>> = [
  {
    key: 'unidade',
    label: 'Loja / Unidade',
    shortLabel: 'Unidade',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 18,
    pdfMinWidthMm: 22,
    pdfMaxWidthMm: 45,
    excelWch: 22,
    excelMinWch: 14,
    excelMaxWch: 30,
  },
  {
    key: 'sku',
    label: 'Código SKU',
    shortLabel: 'SKU',
    isDefault: true,
    kind: 'text',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 22,
    excelWch: 12,
    excelMinWch: 9,
    excelMaxWch: 18,
  },
  {
    key: 'produto',
    label: 'Produto',
    shortLabel: 'Produto',
    isDefault: true,
    kind: 'text',
    align: 'left',
    pdfWeight: 28,
    pdfMinWidthMm: 32,
    pdfMaxWidthMm: 78,
    excelWch: 30,
    excelMinWch: 18,
    excelMaxWch: 46,
    isFlexible: true,
  },
  {
    key: 'quantidadeAtual',
    label: 'Saldo Atual',
    shortLabel: 'Saldo',
    isDefault: true,
    kind: 'number',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 13,
    pdfMaxWidthMm: 20,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 16,
    summable: true,
  },
  {
    key: 'reservado',
    label: 'Reservado',
    shortLabel: 'Reservado',
    isDefault: true,
    kind: 'number',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 22,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 16,
    summable: true,
  },
  {
    key: 'disponivel',
    label: 'Disponível',
    shortLabel: 'Disponível',
    isDefault: true,
    kind: 'number',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 14,
    pdfMaxWidthMm: 22,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 16,
    summable: true,
  },
  {
    key: 'situacao',
    label: 'Situação',
    shortLabel: 'Situação',
    isDefault: true,
    kind: 'badge',
    align: 'center',
    pdfWeight: 16,
    pdfMinWidthMm: 22,
    pdfMaxWidthMm: 36,
    excelWch: 20,
    excelMinWch: 14,
    excelMaxWch: 26,
  },
  {
    key: 'categoria',
    label: 'Categoria',
    shortLabel: 'Categoria',
    isDefault: false,
    kind: 'text',
    align: 'left',
    pdfWeight: 16,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 36,
    excelWch: 18,
    excelMinWch: 12,
    excelMaxWch: 28,
  },
  {
    key: 'unidadeMedida',
    label: 'Unidade de Medida',
    shortLabel: 'Unid.',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 8,
    pdfMinWidthMm: 10,
    pdfMaxWidthMm: 16,
    excelWch: 9,
    excelMinWch: 7,
    excelMaxWch: 12,
  },
  {
    key: 'quantidadeMinima',
    label: 'Estoque Mínimo',
    shortLabel: 'Qtd. Mín.',
    isDefault: false,
    kind: 'number',
    align: 'center',
    pdfWeight: 10,
    pdfMinWidthMm: 13,
    pdfMaxWidthMm: 20,
    excelWch: 12,
    excelMinWch: 10,
    excelMaxWch: 16,
    summable: true,
  },
  {
    key: 'valorEstoque',
    label: 'Valor em Estoque (R$)',
    shortLabel: 'Valor (R$)',
    isDefault: false,
    kind: 'currency',
    align: 'right',
    pdfWeight: 14,
    pdfMinWidthMm: 18,
    pdfMaxWidthMm: 28,
    excelWch: 16,
    excelMinWch: 13,
    excelMaxWch: 22,
    summable: true,
  },
  {
    key: 'atualizadoEm',
    label: 'Última Atualização',
    shortLabel: 'Atualização',
    isDefault: false,
    kind: 'text',
    align: 'center',
    pdfWeight: 15,
    pdfMinWidthMm: 20,
    pdfMaxWidthMm: 32,
    excelWch: 18,
    excelMinWch: 14,
    excelMaxWch: 24,
  },
];

const DEFAULT_COLUMNS: EstoqueReportColumnKey[] = ESTOQUE_REPORT_COLUMNS.filter(
  c => c.isDefault
).map(c => c.key);

const GROUP_OPTIONS: Array<ReportSelectOption<EstoqueReportGroupBy>> = [
  { value: 'loja', label: 'Loja / Unidade' },
  { value: 'categoria', label: 'Categoria' },
  { value: 'situacao', label: 'Situação (Alerta / OK)' },
  { value: 'nenhum', label: 'Sem Agrupamento' },
];

const SORT_OPTIONS: Array<ReportSelectOption<EstoqueReportSortBy>> = [
  { value: 'produto', label: 'Produto (A-Z)' },
  { value: 'saldo', label: 'Saldo Atual' },
  { value: 'disponivel', label: 'Disponível' },
  { value: 'reservado', label: 'Reservado' },
  { value: 'atualizacao', label: 'Última Atualização' },
];

const STATUS_LABELS: Record<'TODOS' | 'CRITICO' | 'OK' | 'COM_RESERVA', string> = {
  TODOS: 'Todas as Situações',
  CRITICO: 'Reposição Necessária',
  OK: 'Abastecido',
  COM_RESERVA: 'Com Reserva',
};

function mapScreenGroup(
  g: EstoqueReportModalProps['initialGroupBy']
): EstoqueReportGroupBy {
  switch (g) {
    case 'LOJA':
      return 'loja';
    case 'CATEGORIA':
      return 'categoria';
    case 'SITUACAO':
      return 'situacao';
    default:
      return 'nenhum';
  }
}

export const EstoqueReportModal: React.FC<EstoqueReportModalProps> = ({
  isOpen,
  onClose,
  allStock,
  filteredStock,
  orders,
  products,
  categories,
  units,
  activeUnitId,
  initialStatusFilter,
  initialGroupBy,
  searchTerm,
}) => {
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered');
  const [format, setFormat] = useState<ReportFormat>('PDF');
  const [orientation, setOrientation] = useState<ReportOrientation>('landscape');
  const [unitFilter, setUnitFilter] = useState<string>('TODAS');
  const [situationFilter, setSituationFilter] = useState<
    'TODOS' | 'CRITICO' | 'OK' | 'COM_RESERVA'
  >('TODOS');
  const [categoryFilter, setCategoryFilter] = useState<string>('TODAS');
  const [groupBy, setGroupBy] = useState<EstoqueReportGroupBy>('loja');
  const [sortBy, setSortBy] = useState<EstoqueReportSortBy>('produto');
  const [sortDirection, setSortDirection] = useState<ReportSortDirection>('asc');
  const [selectedColumns, setSelectedColumns] =
    useState<EstoqueReportColumnKey[]>(DEFAULT_COLUMNS);
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

  const hasActiveFilterDiff = filteredStock.length !== allStock.length;

  useEffect(() => {
    if (!isOpen) {
      clearPreviewArtifacts();
      setStep('config');
      return;
    }
    setScope(hasActiveFilterDiff ? 'filtered' : 'all');
    setUnitFilter(activeUnitId !== 'all' ? activeUnitId : 'TODAS');
    setSituationFilter(initialStatusFilter);
    setCategoryFilter('TODAS');
    setGroupBy(mapScreenGroup(initialGroupBy));
    setStep('config');
  }, [
    isOpen,
    hasActiveFilterDiff,
    activeUnitId,
    initialStatusFilter,
    initialGroupBy,
    clearPreviewArtifacts,
  ]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const reservedMap = useMemo(() => computeReservedStockMap(orders), [orders]);
  const prodMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const unitMap = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);

  const availableCategories = useMemo(() => {
    return [...categories]
      .filter(c => c.nome)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [categories]);

  const enrichedRows = useMemo(() => {
    const base = scope === 'filtered' && hasActiveFilterDiff ? filteredStock : allStock;

    return base
      .filter(s => {
        if (unitFilter !== 'TODAS' && s.unidadeId !== unitFilter) return false;
        const isLow = isLowStockItem(s);
        const reserved = reservedMap.get(stockReservationKey(s.unidadeId, s.produtoId)) || 0;
        if (situationFilter === 'CRITICO' && !isLow) return false;
        if (situationFilter === 'OK' && isLow) return false;
        if (situationFilter === 'COM_RESERVA' && reserved <= 0) return false;
        if (categoryFilter !== 'TODAS') {
          const prod = prodMap.get(s.produtoId);
          if (!prod || prod.categoriaId !== categoryFilter) return false;
        }
        return true;
      })
      .map(s => {
        const prod = prodMap.get(s.produtoId);
        const cat = prod ? catMap.get(prod.categoriaId) : undefined;
        const unit = unitMap.get(s.unidadeId);
        const reserved = reservedMap.get(stockReservationKey(s.unidadeId, s.produtoId)) || 0;
        const disponivel = Math.max(0, s.quantidadeAtual - reserved);
        const isLow = isLowStockItem(s);
        const valorEstoque = Number((s.quantidadeAtual * (prod?.precoUnitario || 0)).toFixed(2));
        return {
          item: s,
          unitName: unit?.nome || s.unidadeId,
          unitType: unit?.tipo || 'LOJA',
          sku: prod?.sku || '—',
          produto: prod?.descricao || 'Produto não encontrado',
          categoria: cat?.nome || 'Sem Categoria',
          unidadeMedida: prod?.unidade || 'UN',
          reserved,
          disponivel,
          isLow,
          situacaoLabel: isLow ? 'Reposição Necessária' : 'Abastecido',
          valorEstoque,
          atualizadoLabel: s.dataAtualizacao
            ? new Date(s.dataAtualizacao).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—',
        };
      });
  }, [
    scope,
    hasActiveFilterDiff,
    filteredStock,
    allStock,
    unitFilter,
    situationFilter,
    categoryFilter,
    reservedMap,
    prodMap,
    catMap,
    unitMap,
  ]);

  const sortedRows = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...enrichedRows].sort((a, b) => {
      if (sortBy === 'saldo') {
        const cmp = (a.item.quantidadeAtual - b.item.quantidadeAtual) * dir;
        if (cmp !== 0) return cmp;
      } else if (sortBy === 'disponivel') {
        const cmp = (a.disponivel - b.disponivel) * dir;
        if (cmp !== 0) return cmp;
      } else if (sortBy === 'reservado') {
        const cmp = (a.reserved - b.reserved) * dir;
        if (cmp !== 0) return cmp;
      } else if (sortBy === 'atualizacao') {
        const ta = new Date(a.item.dataAtualizacao || 0).getTime();
        const tb = new Date(b.item.dataAtualizacao || 0).getTime();
        if (ta !== tb) return (ta - tb) * dir;
      }
      const pCmp = a.produto.localeCompare(b.produto, 'pt-BR') * dir;
      if (pCmp !== 0) return pCmp;
      return a.unitName.localeCompare(b.unitName, 'pt-BR');
    });
  }, [enrichedRows, sortBy, sortDirection]);

  const reportData: TabularReportData<EstoqueReportColumnKey> | null = useMemo(() => {
    if (!isOpen) return null;

    const selectedColDefs = selectedColumns
      .map(key => ESTOQUE_REPORT_COLUMNS.find(c => c.key === key))
      .filter((c): c is TabularReportColumnDef<EstoqueReportColumnKey> => Boolean(c));

    const toTabularRow = (
      entry: (typeof sortedRows)[number]
    ): TabularReportRow<EstoqueReportColumnKey> => ({
      key: entry.item.id,
      rowTone: entry.isLow ? 'amber' : 'default',
      cells: {
        unidade: { text: entry.unitName, tone: 'bold' },
        sku: { text: entry.sku, tone: 'slate' },
        produto: { text: entry.produto, tone: 'bold' },
        quantidadeAtual: {
          text: String(entry.item.quantidadeAtual),
          numValue: entry.item.quantidadeAtual,
          tone: entry.isLow ? 'rose' : 'emerald',
        },
        reservado: {
          text: String(entry.reserved),
          numValue: entry.reserved,
          tone: entry.reserved > 0 ? 'blue' : 'slate',
        },
        disponivel: {
          text: String(entry.disponivel),
          numValue: entry.disponivel,
          tone: entry.disponivel <= entry.item.quantidadeMinima ? 'rose' : 'emerald',
        },
        situacao: {
          text: entry.situacaoLabel,
          tone: entry.isLow ? 'rose' : 'emerald',
          badge: true,
        },
        categoria: { text: entry.categoria, tone: 'default' },
        unidadeMedida: { text: entry.unidadeMedida, tone: 'slate' },
        quantidadeMinima: {
          text: String(entry.item.quantidadeMinima),
          numValue: entry.item.quantidadeMinima,
          tone: 'slate',
        },
        valorEstoque: {
          text: `R$ ${formatCurrencyBR(entry.valorEstoque)}`,
          numValue: entry.valorEstoque,
          tone: 'bold',
        },
        atualizadoEm: { text: entry.atualizadoLabel, tone: 'slate' },
      },
    });

    const summarizeEntries = (entries: typeof sortedRows) => ({
      quantidadeAtual: entries.reduce((s, r) => s + r.item.quantidadeAtual, 0),
      reservado: entries.reduce((s, r) => s + r.reserved, 0),
      disponivel: entries.reduce((s, r) => s + r.disponivel, 0),
      quantidadeMinima: entries.reduce((s, r) => s + r.item.quantidadeMinima, 0),
      valorEstoque: Number(entries.reduce((s, r) => s + r.valorEstoque, 0).toFixed(2)),
    });

    const allTabularRows = sortedRows.map(toTabularRow);
    const grandTotals = summarizeEntries(sortedRows);

    const groups: Array<TabularReportGroup<EstoqueReportColumnKey>> = [];
    if (groupBy === 'nenhum') {
      groups.push({
        key: 'all',
        label: 'Todos os Registros',
        rows: allTabularRows,
        subtotals: grandTotals,
      });
    } else {
      const bucket = new Map<string, typeof sortedRows>();
      sortedRows.forEach(entry => {
        const key =
          groupBy === 'loja'
            ? entry.unitName
            : groupBy === 'categoria'
            ? entry.categoria
            : entry.situacaoLabel;
        const arr = bucket.get(key) || [];
        arr.push(entry);
        bucket.set(key, arr);
      });
      Array.from(bucket.entries())
        .sort(([ka], [kb]) => ka.localeCompare(kb, 'pt-BR'))
        .forEach(([label, entries]) => {
          const subs = summarizeEntries(entries);
          groups.push({
            key: label,
            label,
            headerSummary: `${entries.length} item(ns) • Saldo: ${subs.quantidadeAtual} • Disp.: ${subs.disponivel}`,
            subtotalLabel: `Subtotal — ${label} (${entries.length} item(ns))`,
            rows: entries.map(toTabularRow),
            subtotals: subs,
          });
        });
    }

    // Summary by Unit (Sheet 2 / Optional PDF summary)
    const unitBucket = new Map<
      string,
      {
        unitName: string;
        count: number;
        lowCount: number;
        saldo: number;
        reservado: number;
        disponivel: number;
        valor: number;
      }
    >();
    sortedRows.forEach(r => {
      const cur = unitBucket.get(r.item.unidadeId) || {
        unitName: r.unitName,
        count: 0,
        lowCount: 0,
        saldo: 0,
        reservado: 0,
        disponivel: 0,
        valor: 0,
      };
      cur.count += 1;
      if (r.isLow) cur.lowCount += 1;
      cur.saldo += r.item.quantidadeAtual;
      cur.reservado += r.reserved;
      cur.disponivel += r.disponivel;
      cur.valor = Number((cur.valor + r.valorEstoque).toFixed(2));
      unitBucket.set(r.item.unidadeId, cur);
    });

    const summaryEntries = Array.from(unitBucket.entries()).sort(([, a], [, b]) =>
      a.unitName.localeCompare(b.unitName, 'pt-BR')
    );

    const summaryRows: TabularReportRow[] = summaryEntries.map(([uid, u]) => ({
      key: uid,
      cells: {
        unidade: { text: u.unitName, tone: 'bold' },
        itens: { text: String(u.count), numValue: u.count, tone: 'slate' },
        alerta: {
          text: String(u.lowCount),
          numValue: u.lowCount,
          tone: u.lowCount > 0 ? 'rose' : 'emerald',
        },
        saldo: { text: String(u.saldo), numValue: u.saldo, tone: 'bold' },
        reservado: { text: String(u.reservado), numValue: u.reservado, tone: 'blue' },
        disponivel: { text: String(u.disponivel), numValue: u.disponivel, tone: 'emerald' },
        valor: { text: `R$ ${formatCurrencyBR(u.valor)}`, numValue: u.valor, tone: 'bold' },
      },
    }));

    const summaryTotals = {
      itens: summaryEntries.reduce((s, [, u]) => s + u.count, 0),
      alerta: summaryEntries.reduce((s, [, u]) => s + u.lowCount, 0),
      saldo: summaryEntries.reduce((s, [, u]) => s + u.saldo, 0),
      reservado: summaryEntries.reduce((s, [, u]) => s + u.reservado, 0),
      disponivel: summaryEntries.reduce((s, [, u]) => s + u.disponivel, 0),
      valor: Number(summaryEntries.reduce((s, [, u]) => s + u.valor, 0).toFixed(2)),
    };

    const now = new Date();
    const generatedAtLabel = `${String(now.getDate()).padStart(2, '0')}/${String(
      now.getMonth() + 1
    ).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(
      2,
      '0'
    )}:${String(now.getMinutes()).padStart(2, '0')}`;

    const groupOpt = GROUP_OPTIONS.find(o => o.value === groupBy);
    const sortOpt = SORT_OPTIONS.find(o => o.value === sortBy);
    const unitLabel =
      unitFilter === 'TODAS' ? 'Todas as Unidades' : unitMap.get(unitFilter)?.nome || 'Unidade';
    const catLabel =
      categoryFilter === 'TODAS'
        ? 'Todas as Categorias'
        : catMap.get(categoryFilter)?.nome || 'Categoria';

    const groupPrefixMap: Record<EstoqueReportGroupBy, string> = {
      loja: 'UNIDADE',
      categoria: 'CATEGORIA',
      situacao: 'SITUAÇÃO',
      nenhum: '',
    };

    return {
      title: 'Relatório de Estoque',
      filePrefix: 'Beju_Caramelos_Relatorio_Estoque',
      sheetName: 'Relatorio_Estoque',
      mainTabLabel: 'Aba 1: Relatorio_Estoque',
      orientation,
      isGrouped: groupBy !== 'nenhum',
      groupLabel: groupOpt?.label || 'Loja / Unidade',
      groupHeaderPrefix: groupPrefixMap[groupBy],
      itemNounSingular: 'registro',
      itemNounPlural: 'registros',
      generatedAtLabel,
      rightMeta: `${sortedRows.length} registro(s) • Saldo: ${grandTotals.quantidadeAtual} un. • Agrupado por: ${
        groupOpt?.label || 'Loja / Unidade'
      } • ${orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem'}`,
      filterParts: [
        { label: 'Unidade', value: unitLabel },
        { label: 'Situação', value: STATUS_LABELS[situationFilter] },
        { label: 'Categoria', value: catLabel },
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
      grandTotals,
      emptyMessage: 'Nenhum item de estoque encontrado com os critérios selecionados.',
      includeSummaryInPdf,
      summarySheet: {
        sheetName: 'Resumo_Unidades',
        tabLabel: 'Aba 2: Resumo_Unidades',
        title: 'Resumo Consolidado de Estoque por Unidade',
        columns: [
          { key: 'unidade', label: 'Unidade', align: 'left', kind: 'text', wch: 24 },
          { key: 'itens', label: 'Itens', align: 'center', kind: 'number', wch: 11, summable: true },
          {
            key: 'alerta',
            label: 'Alerta Mínimo',
            align: 'center',
            kind: 'number',
            wch: 15,
            summable: true,
          },
          {
            key: 'saldo',
            label: 'Saldo Total',
            align: 'center',
            kind: 'number',
            wch: 14,
            summable: true,
          },
          {
            key: 'reservado',
            label: 'Reservado',
            align: 'center',
            kind: 'number',
            wch: 13,
            summable: true,
          },
          {
            key: 'disponivel',
            label: 'Disponível',
            align: 'center',
            kind: 'number',
            wch: 14,
            summable: true,
          },
          {
            key: 'valor',
            label: 'Valor Estimado',
            align: 'right',
            kind: 'currency',
            wch: 18,
            summable: true,
          },
        ],
        rows: summaryRows,
        totalLabel: `TOTAL CONSOLIDADO (${summaryRows.length} unidade(s))`,
        totals: summaryTotals,
        emptyMessage: 'Nenhuma unidade encontrada nos critérios selecionados.',
      },
    };
  }, [
    isOpen,
    selectedColumns,
    sortedRows,
    groupBy,
    sortBy,
    sortDirection,
    orientation,
    unitFilter,
    situationFilter,
    categoryFilter,
    unitMap,
    catMap,
    scope,
    searchTerm,
    includeSummaryInPdf,
  ]);

  const hasClearableFilters = Boolean(
    unitFilter !== 'TODAS' || situationFilter !== 'TODOS' || categoryFilter !== 'TODAS'
  );

  const handleClearFilters = () => {
    setUnitFilter('TODAS');
    setSituationFilter('TODOS');
    setCategoryFilter('TODAS');
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
    const totalSaldo = sortedRows.reduce((s, r) => s + r.item.quantidadeAtual, 0);
    const totalDisp = sortedRows.reduce((s, r) => s + r.disponivel, 0);
    const lowCount = sortedRows.filter(r => r.isLow).length;
    const totalValor = sortedRows.reduce((s, r) => s + r.valorEstoque, 0);
    return [
      {
        label: 'Registros',
        value: sortedRows.length,
        subtext:
          groupBy !== 'nenhum' && reportData
            ? `${reportData.groups.length} grupo(s)`
            : undefined,
        tone: 'neutral',
      },
      {
        label: 'Saldo Total',
        value: `${totalSaldo} un.`,
        subtext: `Disponível: ${totalDisp} un.`,
        tone: 'emerald',
      },
      {
        label: 'Alerta Mínimo',
        value: lowCount,
        subtext: lowCount > 0 ? 'Reposição necessária' : 'Estoque regular',
        tone: 'neutral',
        subtextTone: lowCount > 0 ? 'rose' : 'default',
      },
      {
        label: 'Valor Estimado',
        value: `R$ ${formatCurrencyBR(totalValor)}`,
        tone: 'emerald',
      },
    ];
  }, [sortedRows, groupBy, reportData]);

  return (
    <ReportModalShell
      isOpen={isOpen}
      onClose={onClose}
      step={step}
      title="Relatório de Estoque"
      configSubtitle="Escolha formato, unidade, situação, agrupamento, ordenação e colunas"
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
            iframeTitle="Prévia do Relatório de Estoque PDF"
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
            scopeLabel="Base de estoque"
            scopeSummary={`${STATUS_LABELS[initialStatusFilter]}${
              searchTerm.trim() ? ` • Busca: "${searchTerm.trim()}"` : ''
            }`}
            scope={scope}
            filteredCount={filteredStock.length}
            totalCount={allStock.length}
            onScopeChange={setScope}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                  Situação
                </span>
                <div className="relative">
                  <select
                    aria-label="Filtrar por situação do estoque"
                    value={situationFilter}
                    onChange={e =>
                      setSituationFilter(
                        e.target.value as 'TODOS' | 'CRITICO' | 'OK' | 'COM_RESERVA'
                      )
                    }
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="TODOS">Todas as Situações</option>
                    <option value="CRITICO">Reposição Necessária</option>
                    <option value="OK">Abastecido</option>
                    <option value="COM_RESERVA">Com Reserva</option>
                  </select>
                  <ChevronDown
                    className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>
              </div>

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
            columns={ESTOQUE_REPORT_COLUMNS}
            defaultColumns={DEFAULT_COLUMNS}
            selectedColumns={selectedColumns}
            onSelectedColumnsChange={setSelectedColumns}
            optionalColumnsTitle="Colunas Adicionais (Categoria, Mínimo e Valor)"
            extraOption={
              format === 'PDF' ? (
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSummaryInPdf}
                    onChange={e => setIncludeSummaryInPdf(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  <span>Incluir tabela de Resumo Consolidado por Unidade ao final do PDF</span>
                </label>
              ) : undefined
            }
          />
        </div>
      )}
    </ReportModalShell>
  );
};
