import React from 'react';
import { formatCurrencyBR } from './CurrencyInput';
import { ReportFormat, ReportPreviewBanner } from './ReportModalShell';
import {
  TabularCellTone,
  TabularColumnKind,
  TabularReportData,
  computeTabularColumnWidthsMm,
} from '../utils/tabularReportTypes';

interface TabularReportPreviewTableProps {
  data: TabularReportData;
  format: ReportFormat;
  activeTab: 'main' | 'summary';
  onTabChange: (tab: 'main' | 'summary') => void;
}

const BADGE_CLASSES: Record<TabularCellTone, string> = {
  default: 'bg-slate-100 text-slate-700 border-slate-300',
  bold: 'bg-slate-100 text-slate-900 border-slate-300',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  amber: 'bg-amber-100 text-amber-800 border-amber-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
  sky: 'bg-sky-100 text-sky-800 border-sky-300',
  blue: 'bg-blue-100 text-blue-800 border-blue-300',
  slate: 'bg-slate-100 text-slate-700 border-slate-300',
};

const TEXT_CLASSES: Record<TabularCellTone, string> = {
  default: 'text-slate-700',
  bold: 'font-semibold text-slate-900',
  emerald: 'font-mono font-bold text-emerald-800',
  amber: 'font-bold text-amber-800',
  rose: 'font-bold text-rose-700',
  sky: 'font-semibold text-sky-700',
  blue: 'font-semibold text-blue-700',
  slate: 'text-slate-600',
};

function formatTotalValue(value: number, kind: TabularColumnKind): string {
  if (kind === 'currency') {
    return `R$ ${formatCurrencyBR(value)}`;
  }
  return String(Number(value.toFixed(3)));
}

export const TabularReportPreviewTable: React.FC<TabularReportPreviewTableProps> = ({
  data,
  format,
  activeTab,
  onTabChange,
}) => {
  const cols = data.selectedColumns;
  const hasAnySummable = cols.some(c => c.summable);
  const firstSummableIdx = cols.findIndex(c => c.summable);
  const previewUsableMm = data.orientation === 'portrait' ? 194 : 281;
  const previewWidthsMm = computeTabularColumnWidthsMm(cols, data.rows, previewUsableMm);
  const previewWidthPcts = previewWidthsMm.map(
    w => `${((w / previewUsableMm) * 100).toFixed(2)}%`
  );

  const showSummary = activeTab === 'summary' && format === 'XLSX' && Boolean(data.summarySheet);
  const tabs =
    format === 'XLSX' && data.summarySheet
      ? [
          { key: 'main', label: data.mainTabLabel },
          { key: 'summary', label: data.summarySheet.tabLabel },
        ]
      : undefined;

  return (
    <ReportPreviewBanner
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={key => onTabChange(key === 'summary' ? 'summary' : 'main')}
      reportTitle={
        showSummary && data.summarySheet ? data.summarySheet.title : data.title
      }
      generatedAtLabel={data.generatedAtLabel}
      rightMeta={data.rightMeta}
      filterParts={data.filterParts}
    >
      {showSummary && data.summarySheet ? (
        <div className="overflow-x-auto max-w-full max-h-[54vh]">
          <table className="w-full min-w-[520px] text-left border-collapse text-[11px]">
            <thead className="sticky top-0 bg-emerald-700 text-white text-[10px] font-bold uppercase">
              <tr>
                {data.summarySheet.columns.map(col => (
                  <th
                    key={col.key}
                    className={`py-2 px-2.5 border border-emerald-800 whitespace-nowrap ${
                      col.align === 'center'
                        ? 'text-center'
                        : col.align === 'right'
                        ? 'text-right'
                        : 'text-left'
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.summarySheet.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.summarySheet.columns.length}
                    className="py-6 text-center text-slate-500 italic"
                  >
                    {data.summarySheet.emptyMessage}
                  </td>
                </tr>
              ) : (
                data.summarySheet.rows.map((row, idx) => (
                  <tr key={row.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    {data.summarySheet!.columns.map(col => {
                      const cell = row.cells[col.key] || { text: '—' };
                      const alignCls =
                        col.align === 'center'
                          ? 'text-center'
                          : col.align === 'right'
                          ? 'text-right'
                          : 'text-left';
                      const toneCls = TEXT_CLASSES[cell.tone || 'default'];
                      return (
                        <td
                          key={col.key}
                          className={`py-1.5 px-2 border border-slate-200 align-middle ${alignCls} ${toneCls}`}
                        >
                          {cell.text}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              {(() => {
                const sumCols = data.summarySheet!.columns;
                const sumHasSummable = sumCols.some(c => c.summable);
                const sumFirstSummable = sumCols.findIndex(c => c.summable);
                if (!sumHasSummable) {
                  return (
                    <tr className="bg-emerald-800 text-white font-bold text-[11px]">
                      <td colSpan={sumCols.length} className="py-2 px-2.5 border border-emerald-900">
                        {data.summarySheet!.totalLabel}
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr className="bg-emerald-800 text-white font-bold text-[11px]">
                    {sumCols.map((col, idx) => {
                      if (idx === 0 && sumFirstSummable > 1) {
                        return (
                          <td
                            key={col.key}
                            colSpan={sumFirstSummable}
                            className="py-2 px-2.5 border border-emerald-900"
                          >
                            {data.summarySheet!.totalLabel}
                          </td>
                        );
                      }
                      if (idx > 0 && idx < sumFirstSummable) return null;
                      const alignCls =
                        col.align === 'center'
                          ? 'text-center'
                          : col.align === 'right'
                          ? 'text-right'
                          : 'text-left';
                      if (col.summable) {
                        const val = data.summarySheet!.totals[col.key] ?? 0;
                        return (
                          <td
                            key={col.key}
                            className={`py-2 px-2 border border-emerald-900 font-mono whitespace-nowrap ${alignCls}`}
                          >
                            {formatTotalValue(val, col.kind)}
                          </td>
                        );
                      }
                      return (
                        <td key={col.key} className="py-2 px-2 border border-emerald-900">
                          {idx === sumFirstSummable ? data.summarySheet!.totalLabel : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto max-w-full max-h-[54vh]">
          <table
            className="w-full table-fixed text-left border-collapse text-[11px]"
            style={{
              minWidth: `${Math.max(
                data.orientation === 'portrait' ? 620 : 840,
                cols.length * 92
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
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={cols.length} className="py-8 text-center text-slate-500 italic">
                    {data.emptyMessage}
                  </td>
                </tr>
              ) : (
                data.groups.map(group => {
                  const subText =
                    group.subtotalLabel ||
                    `Subtotal — ${group.label} (${group.rows.length} ${
                      group.rows.length === 1 ? data.itemNounSingular : data.itemNounPlural
                    })`;
                  return (
                    <React.Fragment key={group.key}>
                      {data.isGrouped && (
                        <tr className="bg-emerald-100 text-emerald-950 font-bold text-[11px]">
                          <td colSpan={cols.length} className="py-1.5 px-2.5 border border-emerald-200">
                            {data.groupHeaderPrefix ? `${data.groupHeaderPrefix}: ` : ''}
                            {group.label.toUpperCase()}
                            {group.headerSummary ? ` (${group.headerSummary})` : ''}
                          </td>
                        </tr>
                      )}
                      {group.rows.map((row, rowIdx) => {
                        const rowBg =
                          row.rowTone === 'rose'
                            ? 'bg-rose-50/70'
                            : row.rowTone === 'sky'
                            ? 'bg-sky-50'
                            : row.rowTone === 'amber'
                            ? 'bg-amber-50/70'
                            : rowIdx % 2 === 0
                            ? 'bg-white'
                            : 'bg-slate-50';

                        return (
                          <tr key={row.key} className={rowBg}>
                            {cols.map(col => {
                              const cell = row.cells[col.key] || { text: '—' };
                              const alignCls =
                                col.align === 'center'
                                  ? 'text-center'
                                  : col.align === 'right'
                                  ? 'text-right'
                                  : 'text-left';

                              if (cell.badge) {
                                const badgeCls = BADGE_CLASSES[cell.tone || 'default'];
                                return (
                                  <td
                                    key={col.key}
                                    className={`py-1.5 px-2 border border-slate-200 align-middle ${alignCls}`}
                                  >
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeCls}`}
                                    >
                                      {cell.text}
                                    </span>
                                  </td>
                                );
                              }

                              const toneCls = TEXT_CLASSES[cell.tone || 'default'];
                              return (
                                <td
                                  key={col.key}
                                  className={`py-1.5 px-2 border border-slate-200 align-middle whitespace-pre-line ${alignCls} ${toneCls}`}
                                >
                                  {cell.text}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {data.isGrouped && hasAnySummable && group.rows.length > 0 && (
                        <tr className="bg-emerald-50 text-emerald-950 font-bold text-[10.5px]">
                          {cols.map((col, idx) => {
                            if (idx === 0 && firstSummableIdx > 1) {
                              return (
                                <td
                                  key={col.key}
                                  colSpan={firstSummableIdx}
                                  className="py-1.5 px-2 border border-emerald-200"
                                >
                                  {subText}
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
                              const val = group.subtotals[col.key] ?? 0;
                              return (
                                <td
                                  key={col.key}
                                  className={`py-1.5 px-2 border border-emerald-200 font-mono whitespace-nowrap ${alignCls}`}
                                >
                                  {formatTotalValue(val, col.kind)}
                                </td>
                              );
                            }
                            return (
                              <td key={col.key} className="py-1.5 px-2 border border-emerald-200">
                                {idx === firstSummableIdx ? `Subtotal (${group.rows.length})` : ''}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            <tfoot>
              {!hasAnySummable ? (
                <tr className="bg-emerald-800 text-white font-bold text-[11px]">
                  <td colSpan={cols.length} className="py-2 px-2.5 border border-emerald-900">
                    {data.grandTotalSummaryText ||
                      `TOTAL GERAL: ${data.rows.length} ${
                        data.rows.length === 1 ? data.itemNounSingular : data.itemNounPlural
                      }`}
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
                          TOTAL GERAL ({data.rows.length}{' '}
                          {data.rows.length === 1 ? data.itemNounSingular : data.itemNounPlural}
                          {data.isGrouped && data.groups.length > 0
                            ? ` • ${data.groups.length} grupo(s)`
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
                      const val = data.grandTotals[col.key] ?? 0;
                      return (
                        <td
                          key={col.key}
                          className={`py-2 px-2 border border-emerald-900 font-mono whitespace-nowrap ${alignCls}`}
                        >
                          {formatTotalValue(val, col.kind)}
                        </td>
                      );
                    }
                    return (
                      <td key={col.key} className="py-2 px-2 border border-emerald-900">
                        {idx === firstSummableIdx ? `TOTAL (${data.rows.length})` : ''}
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
