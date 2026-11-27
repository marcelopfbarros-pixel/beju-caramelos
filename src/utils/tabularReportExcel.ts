import * as XLSXStyleMod from 'xlsx-js-style';
import type { CellObject, CellStyle, Range, WorkBook, WorkSheet } from 'xlsx-js-style';
import {
  TabularCellTone,
  TabularColumnKind,
  TabularReportData,
  TabularReportRow,
  computeTabularExcelWidths,
} from './tabularReportTypes';

const XLSX = (
  (XLSXStyleMod as unknown as { default?: typeof XLSXStyleMod }).default ?? XLSXStyleMod
) as typeof XLSXStyleMod;

export interface TabularExcelBuildResult {
  workbook: WorkBook;
  sheet1: WorkSheet;
  sheet2?: WorkSheet;
}

const COLORS = {
  white: 'FFFFFF',
  slate50: 'F8FAFC',
  slate100: 'F1F5F9',
  slate300: 'CBD5E1',
  slate600: '475569',
  slate700: '334155',
  slate900: '0F172A',
  brand50: 'ECFDF5',
  brand100: 'D1FAE5',
  brand200: 'A7F3D0',
  brand700: '047857',
  brand800: '065F46',
  brand900: '004F35',
  amber50: 'FFFBEB',
  amber800: '92400E',
  sky50: 'F0F9FF',
  sky700: '0369A1',
  blue50: 'EFF6FF',
  blue800: '1E40AF',
  rose50: 'FFF1F2',
  rose300: 'FDA4AF',
  rose700: 'BE123C',
  filterBg: 'F8F9FF',
} as const;

const THIN_SLATE_BORDER = {
  top: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
  bottom: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
};

const HEADER_BORDER = {
  top: { style: 'medium' as const, color: { rgb: COLORS.brand900 } },
  bottom: { style: 'medium' as const, color: { rgb: COLORS.brand900 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.brand800 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.brand800 } },
};

const GROUP_HEADER_BORDER = {
  top: { style: 'medium' as const, color: { rgb: COLORS.brand700 } },
  bottom: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
};

const SUBTOTAL_BORDER = {
  top: { style: 'thin' as const, color: { rgb: COLORS.brand700 } },
  bottom: { style: 'medium' as const, color: { rgb: COLORS.brand200 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
};

const GRAND_TOTAL_BORDER = {
  top: { style: 'medium' as const, color: { rgb: COLORS.brand900 } },
  bottom: { style: 'medium' as const, color: { rgb: COLORS.brand900 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.brand700 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.brand700 } },
};

const CURRENCY_NUM_FMT = '"R$ "#,##0.00';
const NUMBER_NUM_FMT = '#,##0';

function setCell(ws: WorkSheet, r: number, c: number, cell: CellObject): void {
  const ref = XLSX.utils.encode_cell({ r, c });
  ws[ref] = cell;
}

function applyMergedRange(
  ws: WorkSheet,
  merges: Range[],
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  firstCellValue: string,
  style: CellStyle
): void {
  merges.push({
    s: { r: startRow, c: startCol },
    e: { r: endRow, c: endCol },
  });
  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      setCell(ws, r, c, {
        t: 's',
        v: r === startRow && c === startCol ? firstCellValue : '',
        s: style,
      });
    }
  }
}

function resolveExcelCellTone(
  tone: TabularCellTone | undefined,
  badge: boolean | undefined,
  rowBg: string
): { bg: string; fg: string; bold: boolean } {
  switch (tone) {
    case 'bold':
      return { bg: rowBg, fg: COLORS.slate900, bold: true };
    case 'emerald':
      return { bg: badge ? COLORS.brand50 : rowBg, fg: COLORS.brand800, bold: true };
    case 'amber':
      return { bg: badge ? COLORS.amber50 : rowBg, fg: COLORS.amber800, bold: true };
    case 'rose':
      return { bg: badge ? COLORS.rose50 : rowBg, fg: COLORS.rose700, bold: true };
    case 'sky':
      return { bg: badge ? COLORS.sky50 : rowBg, fg: COLORS.sky700, bold: true };
    case 'blue':
      return { bg: badge ? COLORS.blue50 : rowBg, fg: COLORS.blue800, bold: true };
    case 'slate':
      return { bg: badge ? COLORS.slate100 : rowBg, fg: COLORS.slate700, bold: Boolean(badge) };
    default:
      return { bg: rowBg, fg: COLORS.slate900, bold: false };
  }
}

function getNumFmtForKind(kind: TabularColumnKind): string {
  return kind === 'currency' ? CURRENCY_NUM_FMT : NUMBER_NUM_FMT;
}

export function buildTabularReportWorkbook(data: TabularReportData): TabularExcelBuildResult {
  const wb: WorkBook = XLSX.utils.book_new();
  const ws1: WorkSheet = {};
  const merges1: Range[] = [];
  const cols = data.selectedColumns;
  const maxColIdx = Math.max(0, cols.length - 1);

  const titleStyle: CellStyle = {
    font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: COLORS.slate900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.rose50 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: COLORS.rose300 } },
      bottom: { style: 'medium', color: { rgb: COLORS.rose300 } },
      left: { style: 'thin', color: { rgb: COLORS.rose300 } },
      right: { style: 'thin', color: { rgb: COLORS.rose300 } },
    },
  };

  const metaStyle: CellStyle = {
    font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate600 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.filterBg } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    border: THIN_SLATE_BORDER,
  };

  const orientationLabel = data.orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem';
  const metaText = `${data.filterParts
    .map(p => `${p.label}: ${p.value}`)
    .join('   •   ')}   •   Emitido em: ${data.generatedAtLabel}`;

  applyMergedRange(
    ws1,
    merges1,
    0,
    0,
    0,
    maxColIdx,
    `Beju Caramelos — ${data.title} (${orientationLabel})`,
    titleStyle
  );
  applyMergedRange(ws1, merges1, 1, 0, 1, maxColIdx, metaText, metaStyle);

  const headerRowIdx = 3;
  cols.forEach((col, colIdx) => {
    setCell(ws1, headerRowIdx, colIdx, {
      t: 's',
      v: col.label,
      s: {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand700 } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: HEADER_BORDER,
      },
    });
  });

  const rowHeights1: Array<{ hpt: number }> = [
    { hpt: 28 },
    { hpt: 24 },
    { hpt: 6 },
    { hpt: 26 },
  ];

  const colWidths1 = computeTabularExcelWidths(cols, data.rows, data.orientation);
  let cursorRow = headerRowIdx + 1;
  const ungroupedStartRow = cursorRow;
  const isGrouped = data.isGrouped;
  const subtotalExcelRows: number[] = [];
  const firstSummableIdx = cols.findIndex(c => c.summable);

  const groupHeaderStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand100 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: GROUP_HEADER_BORDER,
  };

  const subtotalLabelStyle: CellStyle = {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.brand800 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand50 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: SUBTOTAL_BORDER,
  };

  const subtotalEmptyStyle: CellStyle = {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.brand800 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand50 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: SUBTOTAL_BORDER,
  };

  const writeDataRow = (row: TabularReportRow, rowIdx: number) => {
    const r = cursorRow;
    const rowBg =
      row.rowTone === 'rose'
        ? COLORS.rose50
        : row.rowTone === 'sky'
        ? COLORS.sky50
        : row.rowTone === 'amber'
        ? COLORS.amber50
        : rowIdx % 2 === 0
        ? COLORS.white
        : COLORS.slate50;

    let maxLines = 1;

    cols.forEach((col, colIdx) => {
      const cell = row.cells[col.key] || { text: '—' };
      const styled = resolveExcelCellTone(cell.tone, cell.badge, rowBg);
      const baseStyle: CellStyle = {
        font: { name: 'Calibri', sz: 9.5, bold: styled.bold, color: { rgb: styled.fg } },
        fill: { patternType: 'solid', fgColor: { rgb: styled.bg } },
        alignment: { horizontal: col.align, vertical: 'center', wrapText: true },
        border: THIN_SLATE_BORDER,
      };

      const isNumeric =
        (col.kind === 'number' || col.kind === 'currency') &&
        cell.numValue !== undefined &&
        cell.numValue !== null &&
        Number.isFinite(cell.numValue);

      if (isNumeric) {
        const fmt = getNumFmtForKind(col.kind);
        setCell(ws1, r, colIdx, {
          t: 'n',
          v: Number(cell.numValue),
          z: fmt,
          s: { ...baseStyle, numFmt: fmt },
        });
      } else {
        const textVal = cell.text || '';
        setCell(ws1, r, colIdx, {
          t: 's',
          v: textVal,
          s: baseStyle,
        });
        const colWch = Math.max(8, colWidths1[colIdx]?.wch || 14);
        const wrapped = textVal
          .split('\n')
          .reduce(
            (sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(6, colWch - 2))),
            0
          );
        if (wrapped > maxLines) {
          maxLines = wrapped;
        }
      }
    });

    rowHeights1.push({ hpt: Math.max(21, maxLines * 14.5) });
    cursorRow += 1;
  };

  if (data.rows.length === 0) {
    applyMergedRange(
      ws1,
      merges1,
      cursorRow,
      0,
      cursorRow,
      maxColIdx,
      data.emptyMessage,
      {
        font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: COLORS.slate600 } },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: THIN_SLATE_BORDER,
      }
    );
    rowHeights1.push({ hpt: 24 });
    cursorRow += 1;
  } else {
    data.groups.forEach(group => {
      if (isGrouped) {
        const suffix = group.headerSummary ? `   (${group.headerSummary})` : '';
        const prefix = data.groupHeaderPrefix ? `${data.groupHeaderPrefix}: ` : '';
        applyMergedRange(
          ws1,
          merges1,
          cursorRow,
          0,
          cursorRow,
          maxColIdx,
          `${prefix}${group.label.toUpperCase()}${suffix}`,
          groupHeaderStyle
        );
        rowHeights1.push({ hpt: 23 });
        cursorRow += 1;
      }

      const groupStartRow = cursorRow;
      group.rows.forEach((row, rowIdx) => {
        writeDataRow(row, rowIdx);
      });
      const groupEndRow = cursorRow - 1;

      if (isGrouped && group.rows.length > 0 && firstSummableIdx !== -1) {
        const subRow = cursorRow;
        const excelStart = groupStartRow + 1;
        const excelEnd = groupEndRow + 1;
        let subLabelPlaced = false;
        const subText =
          group.subtotalLabel ||
          `Subtotal — ${group.label} (${group.rows.length} ${
            group.rows.length === 1 ? data.itemNounSingular : data.itemNounPlural
          })`;

        if (firstSummableIdx > 1) {
          applyMergedRange(
            ws1,
            merges1,
            subRow,
            0,
            subRow,
            firstSummableIdx - 1,
            subText,
            subtotalLabelStyle
          );
          subLabelPlaced = true;
        }

        cols.forEach((col, colIdx) => {
          if (firstSummableIdx > 1 && colIdx < firstSummableIdx) return;

          if (col.summable) {
            const colLetter = XLSX.utils.encode_col(colIdx);
            const cachedVal = group.subtotals[col.key] ?? 0;
            const fmt = getNumFmtForKind(col.kind);
            setCell(ws1, subRow, colIdx, {
              t: 'n',
              f: `SUM(${colLetter}${excelStart}:${colLetter}${excelEnd})`,
              v: cachedVal,
              z: fmt,
              s: {
                font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand900 } },
                fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand50 } },
                alignment: { horizontal: col.align, vertical: 'center' },
                border: SUBTOTAL_BORDER,
                numFmt: fmt,
              },
            });
          } else if (!subLabelPlaced) {
            setCell(ws1, subRow, colIdx, {
              t: 's',
              v: `Subtotal (${group.rows.length})`,
              s: subtotalLabelStyle,
            });
            subLabelPlaced = true;
          } else {
            setCell(ws1, subRow, colIdx, {
              t: 's',
              v: '',
              s: subtotalEmptyStyle,
            });
          }
        });

        subtotalExcelRows.push(subRow + 1);
        rowHeights1.push({ hpt: 22 });
        cursorRow += 1;
      }
    });
  }

  // Grand total row with native SUM(...) formula
  const grandTotalRowIdx = cursorRow;
  const grandTotalLabelStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
  };
  const grandTotalEmptyStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
  };

  const countLabel = `${data.rows.length} ${
    data.rows.length === 1 ? data.itemNounSingular : data.itemNounPlural
  }`;
  const grandTotalLabelText =
    isGrouped && data.groups.length > 0
      ? `TOTAL GERAL (${countLabel} • ${data.groups.length} grupo(s))`
      : `TOTAL GERAL (${countLabel})`;

  if (firstSummableIdx === -1) {
    applyMergedRange(
      ws1,
      merges1,
      grandTotalRowIdx,
      0,
      grandTotalRowIdx,
      maxColIdx,
      data.grandTotalSummaryText || grandTotalLabelText,
      grandTotalLabelStyle
    );
  } else {
    let totalLabelPlaced = false;
    if (firstSummableIdx > 1) {
      applyMergedRange(
        ws1,
        merges1,
        grandTotalRowIdx,
        0,
        grandTotalRowIdx,
        firstSummableIdx - 1,
        grandTotalLabelText,
        grandTotalLabelStyle
      );
      totalLabelPlaced = true;
    }

    const ungroupedExcelStart = ungroupedStartRow + 1;
    const ungroupedExcelEnd = cursorRow;

    cols.forEach((col, colIdx) => {
      if (firstSummableIdx > 1 && colIdx < firstSummableIdx) return;

      if (col.summable) {
        const colLetter = XLSX.utils.encode_col(colIdx);
        const cachedVal = data.grandTotals[col.key] ?? 0;
        const fmt = getNumFmtForKind(col.kind);
        const cellStyle: CellStyle = {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
          fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
          alignment: { horizontal: col.align, vertical: 'center' },
          border: GRAND_TOTAL_BORDER,
          numFmt: fmt,
        };

        if (data.rows.length === 0) {
          setCell(ws1, grandTotalRowIdx, colIdx, {
            t: 'n',
            v: 0,
            z: fmt,
            s: cellStyle,
          });
        } else {
          const formula =
            isGrouped && subtotalExcelRows.length > 0
              ? `SUM(${subtotalExcelRows.map(r => `${colLetter}${r}`).join(',')})`
              : `SUM(${colLetter}${ungroupedExcelStart}:${colLetter}${ungroupedExcelEnd})`;

          setCell(ws1, grandTotalRowIdx, colIdx, {
            t: 'n',
            f: formula,
            v: cachedVal,
            z: fmt,
            s: cellStyle,
          });
        }
      } else if (!totalLabelPlaced) {
        setCell(ws1, grandTotalRowIdx, colIdx, {
          t: 's',
          v: `TOTAL (${data.rows.length})`,
          s: grandTotalLabelStyle,
        });
        totalLabelPlaced = true;
      } else {
        setCell(ws1, grandTotalRowIdx, colIdx, {
          t: 's',
          v: '',
          s: grandTotalEmptyStyle,
        });
      }
    });
  }

  rowHeights1.push({ hpt: 25 });
  ws1['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: grandTotalRowIdx, c: maxColIdx },
  });
  ws1['!merges'] = merges1;
  ws1['!cols'] = colWidths1;
  ws1['!rows'] = rowHeights1;
  ws1['!margins'] = { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };

  XLSX.utils.book_append_sheet(wb, ws1, data.sheetName);

  // Sheet 2: Consolidated Summary Sheet (with native SUM formulas)
  let ws2: WorkSheet | undefined;
  if (data.summarySheet) {
    const sumSheet = data.summarySheet;
    ws2 = {};
    const merges2: Range[] = [];
    const sumCols = sumSheet.columns;
    const sumMaxCol = Math.max(0, sumCols.length - 1);

    applyMergedRange(
      ws2,
      merges2,
      0,
      0,
      0,
      sumMaxCol,
      `Beju Caramelos — ${sumSheet.title}`,
      titleStyle
    );
    applyMergedRange(
      ws2,
      merges2,
      1,
      0,
      1,
      sumMaxCol,
      `${data.filterParts.map(p => `${p.label}: ${p.value}`).join('   •   ')}   •   Emitido em: ${data.generatedAtLabel}`,
      metaStyle
    );

    const sumHeaderIdx = 3;
    sumCols.forEach((col, cIdx) => {
      setCell(ws2!, sumHeaderIdx, cIdx, {
        t: 's',
        v: col.label,
        s: {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
          fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand700 } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: HEADER_BORDER,
        },
      });
    });

    const rowHeights2: Array<{ hpt: number }> = [
      { hpt: 28 },
      { hpt: 22 },
      { hpt: 6 },
      { hpt: 24 },
    ];

    let sumCursor = sumHeaderIdx + 1;
    const sumStartRow = sumCursor;

    if (sumSheet.rows.length === 0) {
      applyMergedRange(
        ws2,
        merges2,
        sumCursor,
        0,
        sumCursor,
        sumMaxCol,
        sumSheet.emptyMessage,
        {
          font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: COLORS.slate600 } },
          fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        }
      );
      rowHeights2.push({ hpt: 24 });
      sumCursor += 1;
    } else {
      sumSheet.rows.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? COLORS.white : COLORS.slate50;
        sumCols.forEach((col, cIdx) => {
          const cell = row.cells[col.key] || { text: '—' };
          const styled = resolveExcelCellTone(cell.tone, cell.badge, bg);
          const style: CellStyle = {
            font: { name: 'Calibri', sz: 9.5, bold: styled.bold, color: { rgb: styled.fg } },
            fill: { patternType: 'solid', fgColor: { rgb: styled.bg } },
            alignment: { horizontal: col.align, vertical: 'center', wrapText: true },
            border: THIN_SLATE_BORDER,
          };

          const isNumeric =
            (col.kind === 'number' || col.kind === 'currency') &&
            cell.numValue !== undefined &&
            cell.numValue !== null &&
            Number.isFinite(cell.numValue);

          if (isNumeric) {
            const fmt = getNumFmtForKind(col.kind);
            setCell(ws2!, sumCursor, cIdx, {
              t: 'n',
              v: Number(cell.numValue),
              z: fmt,
              s: { ...style, numFmt: fmt },
            });
          } else {
            setCell(ws2!, sumCursor, cIdx, {
              t: 's',
              v: cell.text || '',
              s: style,
            });
          }
        });
        rowHeights2.push({ hpt: 21 });
        sumCursor += 1;
      });
    }

    const sumEndRow = sumCursor - 1;
    const sumTotalRowIdx = sumCursor;
    const sumHasSummable = sumCols.some(c => c.summable);
    const sumFirstSummable = sumCols.findIndex(c => c.summable);

    if (!sumHasSummable) {
      applyMergedRange(
        ws2,
        merges2,
        sumTotalRowIdx,
        0,
        sumTotalRowIdx,
        sumMaxCol,
        sumSheet.totalLabel,
        grandTotalLabelStyle
      );
    } else {
      let labelPlaced = false;
      if (sumFirstSummable > 1) {
        applyMergedRange(
          ws2,
          merges2,
          sumTotalRowIdx,
          0,
          sumTotalRowIdx,
          sumFirstSummable - 1,
          sumSheet.totalLabel,
          grandTotalLabelStyle
        );
        labelPlaced = true;
      }

      sumCols.forEach((col, cIdx) => {
        if (sumFirstSummable > 1 && cIdx < sumFirstSummable) return;

        if (col.summable) {
          const colLetter = XLSX.utils.encode_col(cIdx);
          const fmt = getNumFmtForKind(col.kind);
          const cachedVal = sumSheet.totals[col.key] ?? 0;
          const style: CellStyle = {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
            fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
            alignment: { horizontal: col.align, vertical: 'center' },
            border: GRAND_TOTAL_BORDER,
            numFmt: fmt,
          };

          if (sumSheet.rows.length > 0) {
            setCell(ws2!, sumTotalRowIdx, cIdx, {
              t: 'n',
              f: `SUM(${colLetter}${sumStartRow + 1}:${colLetter}${sumEndRow + 1})`,
              v: cachedVal,
              z: fmt,
              s: style,
            });
          } else {
            setCell(ws2!, sumTotalRowIdx, cIdx, {
              t: 'n',
              v: 0,
              z: fmt,
              s: style,
            });
          }
        } else if (!labelPlaced) {
          setCell(ws2!, sumTotalRowIdx, cIdx, {
            t: 's',
            v: sumSheet.totalLabel,
            s: grandTotalLabelStyle,
          });
          labelPlaced = true;
        } else {
          setCell(ws2!, sumTotalRowIdx, cIdx, {
            t: 's',
            v: '',
            s: grandTotalEmptyStyle,
          });
        }
      });
    }

    rowHeights2.push({ hpt: 24 });
    ws2['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: sumTotalRowIdx, c: sumMaxCol },
    });
    ws2['!merges'] = merges2;
    ws2['!cols'] = sumCols.map(c => ({ wch: c.wch || Math.max(12, c.label.length + 4) }));
    ws2['!rows'] = rowHeights2;
    ws2['!margins'] = { left: 0.4, right: 0.4, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };

    XLSX.utils.book_append_sheet(wb, ws2, sumSheet.sheetName);
  }

  return { workbook: wb, sheet1: ws1, sheet2: ws2 };
}

function patchWorksheetXmlForA4(
  xml: string,
  orientation: 'portrait' | 'landscape'
): string {
  let patched = xml;

  if (patched.includes('<sheetPr')) {
    if (/<sheetPr[^>]*\/>/.test(patched)) {
      patched = patched.replace(
        /<sheetPr([^>]*)\/>/,
        '<sheetPr$1><pageSetUpPr fitToPage="1"/></sheetPr>'
      );
    } else if (!patched.includes('<pageSetUpPr')) {
      patched = patched.replace(
        /<sheetPr([^>]*)>/,
        '<sheetPr$1><pageSetUpPr fitToPage="1"/>'
      );
    }
  } else {
    patched = patched.replace(
      '<dimension ',
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension '
    );
  }

  const pageSetupTag = `<pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="0"/>`;
  if (/<pageSetup\b[^>]*\/>/.test(patched)) {
    patched = patched.replace(/<pageSetup\b[^>]*\/>/, pageSetupTag);
  } else if (/<pageMargins\b[^>]*\/>/.test(patched)) {
    patched = patched.replace(/(<pageMargins\b[^>]*\/>)/, `$1${pageSetupTag}`);
  } else {
    patched = patched.replace('</worksheet>', `${pageSetupTag}</worksheet>`);
  }

  return patched;
}

export function buildTabularReportXlsxBuffer(data: TabularReportData): Uint8Array {
  const { workbook } = buildTabularReportWorkbook(data);
  const raw = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | number[];
  const cfb = XLSX.CFB.read(new Uint8Array(raw), { type: 'array' });

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  for (const sheetPath of ['/xl/worksheets/sheet1.xml', '/xl/worksheets/sheet2.xml']) {
    const entry = XLSX.CFB.find(cfb, sheetPath);
    if (!entry || !entry.content) continue;
    const xml = decoder.decode(new Uint8Array(entry.content as Uint8Array | number[]));
    const patched = patchWorksheetXmlForA4(xml, data.orientation);
    const bytes = encoder.encode(patched);
    entry.content = Array.from(bytes);
    entry.size = bytes.length;
  }

  const out = XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip' }) as ArrayBuffer | number[];
  return new Uint8Array(out);
}

export function downloadTabularReportExcelBuffer(buffer: Uint8Array, filePrefix: string): void {
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  link.href = url;
  link.download = `${filePrefix}_${yyyy}-${mm}-${dd}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
