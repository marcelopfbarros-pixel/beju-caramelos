import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';

export type ReportFormat = 'PDF' | 'XLSX';
export type ReportOrientation = 'landscape' | 'portrait';
export type ReportSortDirection = 'asc' | 'desc';
export type ReportStep = 'config' | 'preview';

export interface ReportKpiItem {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: 'neutral' | 'emerald';
  subtextTone?: 'default' | 'rose';
}

export interface ReportColumnOption<K extends string = string> {
  key: K;
  label: string;
  shortLabel: string;
  isDefault: boolean;
}

export interface ReportSelectOption<V extends string = string> {
  value: V;
  label: string;
}

interface ReportModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  step: ReportStep;
  title: string;
  configSubtitle: string;
  format: ReportFormat;
  orientation: ReportOrientation;
  busy: boolean;
  canPreview: boolean;
  kpis?: ReportKpiItem[];
  onOpenPreview: () => void;
  onBackToConfig: () => void;
  onConfirmDownload: () => void;
  children: React.ReactNode;
}

export const ReportModalShell: React.FC<ReportModalShellProps> = ({
  isOpen,
  onClose,
  step,
  title,
  configSubtitle,
  format,
  orientation,
  busy,
  canPreview,
  kpis,
  onOpenPreview,
  onBackToConfig,
  onConfirmDownload,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[70] flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:hidden"
      onClick={() => {
        if (!busy) onClose();
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
              <span className="truncate">
                {step === 'preview'
                  ? `Prévia — ${title} (${format} • A4 ${
                      orientation === 'portrait' ? 'Retrato' : 'Paisagem'
                    })`
                  : title}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {step === 'preview'
                ? 'Confira o resultado, agrupamentos e totais antes de baixar o arquivo'
                : configSubtitle}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {step === 'preview' && (
              <button
                type="button"
                disabled={busy}
                onClick={onBackToConfig}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer disabled:opacity-60"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ajustar Opções</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!busy) onClose();
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
          {children}
        </div>

        {/* Docked Live KPI Summary Strip */}
        {step === 'config' && kpis && kpis.length > 0 && (
          <div className="px-3.5 py-2 sm:px-6 bg-emerald-50/50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            {kpis.map((kpi, idx) => {
              const isEmerald = kpi.tone === 'emerald';
              return (
                <div
                  key={`${kpi.label}-${idx}`}
                  className={`bg-white/90 rounded-lg px-2.5 py-1.5 border ${
                    isEmerald ? 'border-emerald-200' : 'border-slate-200/80'
                  }`}
                >
                  <span
                    className={`text-[9.5px] font-mono uppercase block ${
                      isEmerald ? 'text-emerald-800' : 'text-slate-500'
                    }`}
                  >
                    {kpi.label}
                  </span>
                  <span
                    className={`text-xs font-mono font-bold ${
                      isEmerald ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {kpi.value}
                  </span>
                  {kpi.subtext && (
                    <span
                      className={`text-[9.5px] block truncate ${
                        kpi.subtextTone === 'rose'
                          ? 'text-rose-700 font-semibold'
                          : isEmerald
                          ? 'text-emerald-700/80'
                          : 'text-slate-500'
                      }`}
                    >
                      {kpi.subtext}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2 shrink-0">
          {step === 'preview' ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onBackToConfig}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirmDownload}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer ${
                  format === 'PDF'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{format === 'PDF' ? 'Baixar PDF' : 'Baixar Excel (.xlsx)'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={busy || !canPreview}
                onClick={onOpenPreview}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer ${
                  format === 'PDF'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>
                  {busy
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

interface ReportOutputStripProps {
  format: ReportFormat;
  onFormatChange: (format: ReportFormat) => void;
  orientation: ReportOrientation;
  onOrientationChange: (orientation: ReportOrientation) => void;
  selectedColumnsCount: number;
}

export const ReportOutputStrip: React.FC<ReportOutputStripProps> = ({
  format,
  onFormatChange,
  orientation,
  onOrientationChange,
  selectedColumnsCount,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0">
    <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1.5 min-w-0">
      <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
        Formato
      </span>
      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
        <button
          type="button"
          onClick={() => onFormatChange('PDF')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-left transition-all cursor-pointer ${
            format === 'PDF'
              ? 'bg-white text-rose-700 shadow-2xs ring-1 ring-rose-200 font-bold'
              : 'text-slate-600 hover:text-slate-900 font-semibold'
          }`}
        >
          <FileText
            className={`w-3.5 h-3.5 shrink-0 ${
              format === 'PDF' ? 'text-rose-600' : 'text-slate-400'
            }`}
          />
          <span className="text-[11px] truncate">PDF — A4</span>
        </button>
        <button
          type="button"
          onClick={() => onFormatChange('XLSX')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-left transition-all cursor-pointer ${
            format === 'XLSX'
              ? 'bg-white text-emerald-800 shadow-2xs ring-1 ring-emerald-200 font-bold'
              : 'text-slate-600 hover:text-slate-900 font-semibold'
          }`}
        >
          <FileSpreadsheet
            className={`w-3.5 h-3.5 shrink-0 ${
              format === 'XLSX' ? 'text-emerald-600' : 'text-slate-400'
            }`}
          />
          <span className="text-[11px] truncate">XLSX — Excel + Somas</span>
        </button>
      </div>
    </div>

    <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1.5 min-w-0">
      <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
        Orientação A4
      </span>
      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
        <button
          type="button"
          onClick={() => onOrientationChange('landscape')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-left transition-all cursor-pointer ${
            orientation === 'landscape'
              ? 'bg-white text-brand-800 shadow-2xs ring-1 ring-brand-200 font-bold'
              : 'text-slate-600 hover:text-slate-900 font-semibold'
          }`}
        >
          <RectangleHorizontal
            className={`w-3.5 h-3.5 shrink-0 ${
              orientation === 'landscape' ? 'text-brand-600' : 'text-slate-400'
            }`}
          />
          <span className="text-[11px] truncate">Paisagem</span>
        </button>
        <button
          type="button"
          onClick={() => onOrientationChange('portrait')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-left transition-all cursor-pointer ${
            orientation === 'portrait'
              ? 'bg-white text-brand-800 shadow-2xs ring-1 ring-brand-200 font-bold'
              : 'text-slate-600 hover:text-slate-900 font-semibold'
          }`}
        >
          <RectangleVertical
            className={`w-3.5 h-3.5 shrink-0 ${
              orientation === 'portrait' ? 'text-brand-600' : 'text-slate-400'
            }`}
          />
          <span className="text-[11px] truncate">Retrato</span>
        </button>
      </div>
      {orientation === 'portrait' && selectedColumnsCount > 9 && (
        <p className="text-[10px] text-amber-700 leading-snug pt-0.5">
          Em Retrato com {selectedColumnsCount} colunas, as fontes e larguras serão
          compactadas automaticamente para caber na folha A4.
        </p>
      )}
    </div>
  </div>
);

interface ReportFiltersCardProps {
  hasClearableFilters?: boolean;
  onClearFilters?: () => void;
  clearLabel?: string;
  showScopeToggle?: boolean;
  scopeLabel?: string;
  scopeSummary?: string;
  scope?: 'filtered' | 'all';
  filteredCount?: number;
  totalCount?: number;
  onScopeChange?: (nextScope: 'filtered' | 'all') => void;
  children?: React.ReactNode;
}

export const ReportFiltersCard: React.FC<ReportFiltersCardProps> = ({
  hasClearableFilters = false,
  onClearFilters,
  clearLabel = 'Limpar filtros',
  showScopeToggle = false,
  scopeLabel = 'Base de registros',
  scopeSummary,
  scope = 'filtered',
  filteredCount = 0,
  totalCount = 0,
  onScopeChange,
  children,
}) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden min-w-0 max-w-full">
    <div className="px-3 py-2 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
        <Filter className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span>Filtros</span>
      </div>
      {hasClearableFilters && onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>{clearLabel}</span>
        </button>
      )}
    </div>

    <div className="p-3 space-y-3">
      {showScopeToggle && onScopeChange && (
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
            children ? 'pb-2.5 border-b border-slate-100' : ''
          }`}
        >
          <div className="min-w-0">
            <span className="block text-[11px] font-bold text-slate-800">{scopeLabel}</span>
            {scope === 'filtered' && scopeSummary && (
              <span className="block text-[10px] text-slate-500 truncate mt-0.5">
                {scopeSummary}
              </span>
            )}
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => onScopeChange('filtered')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                scope === 'filtered'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Filtrados ({filteredCount})
            </button>
            <button
              type="button"
              onClick={() => onScopeChange('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                scope === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({totalCount})
            </button>
          </div>
        </div>
      )}

      {children}
    </div>
  </div>
);

interface ReportOrganizationCardProps<
  G extends string,
  S extends string,
  C extends string
> {
  groupBy: G;
  onGroupByChange: (value: G) => void;
  groupOptions: Array<ReportSelectOption<G>>;
  sortBy: S;
  onSortByChange: (value: S) => void;
  sortOptions: Array<ReportSelectOption<S>>;
  sortDirection: ReportSortDirection;
  onToggleSortDirection: () => void;
  columns: Array<ReportColumnOption<C>>;
  defaultColumns: C[];
  selectedColumns: C[];
  onSelectedColumnsChange: (columns: C[]) => void;
  optionalColumnsTitle?: string;
  extraOption?: React.ReactNode;
}

export function ReportOrganizationCard<
  G extends string,
  S extends string,
  C extends string
>({
  groupBy,
  onGroupByChange,
  groupOptions,
  sortBy,
  onSortByChange,
  sortOptions,
  sortDirection,
  onToggleSortDirection,
  columns,
  defaultColumns,
  selectedColumns,
  onSelectedColumnsChange,
  optionalColumnsTitle = 'Colunas Adicionais',
  extraOption,
}: ReportOrganizationCardProps<G, S, C>) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const columnMap = new Map(columns.map(c => [c.key, c]));
  const defaultDefs = columns.filter(c => c.isDefault);
  const optionalDefs = columns.filter(c => !c.isDefault);

  const toggleColumn = (key: C) => {
    onSelectedColumnsChange(
      selectedColumns.includes(key)
        ? selectedColumns.filter(k => k !== key)
        : [...selectedColumns, key]
    );
  };

  const moveColumn = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= selectedColumns.length) return;
    const next = [...selectedColumns];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    onSelectedColumnsChange(next);
  };

  const expanded = isPickerOpen || selectedColumns.length === 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden min-w-0 max-w-full">
      <div className="px-3 py-2 bg-slate-50/90 border-b border-slate-200 flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
        <SlidersHorizontal className="w-3.5 h-3.5 text-brand-600 shrink-0" />
        <span>Organização e Colunas</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 min-w-0">
        <div className="space-y-1 min-w-0">
          <span className="block text-[10px] font-semibold text-slate-500">Agrupar por</span>
          <div className="relative">
            <select
              aria-label="Agrupamento do relatório"
              value={groupBy}
              onChange={e => onGroupByChange(e.target.value as G)}
              className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
            >
              {groupOptions.map(opt => (
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

        <div className="space-y-1 min-w-0">
          <span className="block text-[10px] font-semibold text-slate-500">Ordenar por</span>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <select
                aria-label="Ordem de classificação do relatório"
                value={sortBy}
                onChange={e => onSortByChange(e.target.value as S)}
                className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
              >
                {sortOptions.map(opt => (
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
              onClick={onToggleSortDirection}
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

      {/* Colunas sub-block */}
      <div className="px-3 pb-3 pt-2.5 border-t border-slate-100 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-800">Colunas</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-mono text-[10px] font-bold">
              {selectedColumns.length} selecionada(s)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectedColumnsChange(defaultColumns)}
              className="text-[11px] font-bold text-brand-700 hover:underline cursor-pointer"
            >
              Padrão ({defaultColumns.length})
            </button>
            <span className="text-slate-300">•</span>
            <button
              type="button"
              onClick={() => onSelectedColumnsChange(columns.map(c => c.key))}
              className="text-[11px] font-bold text-slate-600 hover:underline cursor-pointer"
            >
              Todas
            </button>
            <span className="text-slate-300">•</span>
            <button
              type="button"
              onClick={() => onSelectedColumnsChange([])}
              className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => setIsPickerOpen(prev => !prev)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer ml-1"
            >
              <span>Personalizar</span>
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* Always-visible ordered chips */}
        {selectedColumns.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedColumns.map((colKey, idx) => {
              const def = columnMap.get(colKey);
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
                  <button
                    type="button"
                    onClick={() => toggleColumn(colKey)}
                    title={`Remover ${def.shortLabel}`}
                    aria-label={`Remover ${def.shortLabel}`}
                    className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Collapsible checkbox picker */}
        {expanded && (
          <div className="pt-2.5 border-t border-slate-100 space-y-3">
            <div>
              <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700 mb-1.5">
                Colunas Padrão
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {defaultDefs.map(col => {
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

            {optionalDefs.length > 0 && (
              <div>
                <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  {optionalColumnsTitle}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {optionalDefs.map(col => {
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
            )}
          </div>
        )}

        {extraOption && (
          <div className="pt-2 border-t border-slate-100">{extraOption}</div>
        )}

        {selectedColumns.length === 0 && (
          <p className="text-[11px] font-semibold text-rose-600">
            Selecione pelo menos 1 coluna para gerar o relatório.
          </p>
        )}
      </div>
    </div>
  );
}

interface ReportPdfPreviewFrameProps {
  pdfUrl: string;
  iframeTitle: string;
  fallbackContent: React.ReactNode;
}

export const ReportPdfPreviewFrame: React.FC<ReportPdfPreviewFrameProps> = ({
  pdfUrl,
  iframeTitle,
  fallbackContent,
}) => (
  <div className="space-y-3">
    <div className="hidden sm:block">
      <iframe
        src={pdfUrl}
        title={iframeTitle}
        className="w-full h-[65vh] rounded-xl border border-slate-300 bg-slate-100"
      />
    </div>
    <div className="sm:hidden space-y-2.5">
      <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-xl p-2.5">
        <span className="text-[11px] font-semibold text-blue-900">
          Prévia do PDF pronta
        </span>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-blue-300 rounded-lg text-[11px] font-bold text-blue-800"
        >
          <ExternalLink className="w-3 h-3" />
          <span>Abrir PDF</span>
        </a>
      </div>
      {fallbackContent}
    </div>
  </div>
);

interface ReportPreviewBannerProps {
  tabs?: Array<{ key: string; label: string }>;
  activeTab?: string;
  onTabChange?: (key: string) => void;
  reportTitle: string;
  generatedAtLabel: string;
  rightMeta: string;
  filterParts: Array<{ label: string; value: string }>;
  children: React.ReactNode;
}

export const ReportPreviewBanner: React.FC<ReportPreviewBannerProps> = ({
  tabs,
  activeTab,
  onTabChange,
  reportTitle,
  generatedAtLabel,
  rightMeta,
  filterParts,
  children,
}) => (
  <div className="space-y-3">
    {tabs && tabs.length > 0 && onTabChange && (
      <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-white text-emerald-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    )}

    <div className="bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b-2 border-rose-300 bg-gradient-to-r from-rose-50 via-white to-amber-50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpg"
            alt="Beju Caramelos"
            className="w-10 h-10 rounded-full object-cover border-2 border-rose-300"
          />
          <div>
            <div className="text-sm font-extrabold text-slate-900">Beju Caramelos</div>
            <div className="text-xs font-semibold text-rose-900">{reportTitle}</div>
          </div>
        </div>
        <div className="text-right font-mono text-[10px] text-slate-600">
          <div className="font-bold text-slate-800">
            {generatedAtLabel} • Página 1 de 1
          </div>
          <div>{rightMeta}</div>
        </div>
      </div>

      {filterParts.length > 0 && (
        <div className="px-3 py-1.5 bg-[#f8f9ff] border-b border-slate-200 text-[10px] text-slate-600 font-medium">
          {filterParts.map((part, idx) => (
            <React.Fragment key={`${part.label}-${idx}`}>
              {idx > 0 && ' • '}
              {part.label}: <strong className="text-slate-800">{part.value}</strong>
            </React.Fragment>
          ))}
        </div>
      )}

      {children}
    </div>
  </div>
);
