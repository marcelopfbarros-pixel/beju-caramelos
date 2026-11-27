import * as XLSXStyleMod from 'xlsx-js-style';
import type { CellObject, CellStyle, Range, WorkBook, WorkSheet } from 'xlsx-js-style';
import type { ProductionStatus } from '../types';
import {
  ProducaoReportData,
  ProducaoReportOrientation,
  ProducaoReportRow,
  getProducaoReportCellText,
  getProducaoReportColumnTotal,
  getProducaoReportGroupTotal,
  getProducaoReportNumericValue,
  measureProducaoColumnCharLengths,
} from './producaoReportData';

const XLSX = (
  (XLSXStyleMod as unknown as { default?: typeof XLSXStyleMod }).default ?? XLSXStyleMod
) as typeof XLSXStyleMod;

export interface ProducaoExcelBuildResult {
  workbook: WorkBook;
  sheet1: WorkSheet;
  sheet2: WorkSheet;
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

function getStageExcelColors(
  status: ProductionStatus,
  fallbackBg: string
): { bg: string; fg: string; bold: boolean } {
  switch (status) {
    case 'PLANEJADA':
      return { bg: COLORS.slate100, fg: COLORS.slate700, bold: true };
    case 'EM_PREPARO':
      return { bg: COLORS.amber50, fg: COLORS.amber800, bold: true };
    case 'CONCLUIDA':
      return { bg: COLORS.brand50, fg: COLORS.brand700, bold: true };
    case 'CANCELADA':
      return { bg: COLORS.rose50, fg: COLORS.rose700, bold: true };
    default:
      return { bg: fallbackBg, fg: COLORS.slate700, bold: false };
  }
}

function computeExcelColWidths(data: ProducaoReportData): Array<{ wch: number }> {
  const cols = data.selectedColumns;
  const charLengths = measureProducaoColumnCharLengths(data);
  const budget = data.config.orientation === 'portrait' ? 114 : 178;

  const desired = cols.map(col => {
    const contentChars = charLengths.get(col.key) || 0;
    const target = Math.ceil(Math.max(col.label.length + 2, contentChars + 3, col.excelWch));
    return Math.min(col.excelMaxWch, Math.max(col.excelMinWch, target));
  });

  let sum = desired.reduce((a, b) => a + b, 0);
  if (sum > budget) {
    let excess = sum - budget;
    const flexSlack = cols.reduce(
      (acc, c, i) => acc + (c.isFlexible ? Math.max(0, desired[i] - c.excelMinWch) : 0),
      0
    );
    if (flexSlack > 0) {
      const take = Math.min(excess, flexSlack);
      cols.forEach((c, i) => {
        if (!c.isFlexible) return;
        const slack = Math.max(0, desired[i] - c.excelMinWch);
        desired[i] -= take * (slack / flexSlack);
      });
      sum = desired.reduce((a, b) => a + b, 0);
      excess = Math.max(0, sum - budget);
    }

    if (excess > 0.5) {
      const scale = budget / sum;
      cols.forEach((_c, i) => {
        desired[i] = Math.max(7, Math.round(desired[i] * scale));
      });
    }
  }

  return desired.map(w => ({ wch: Math.max(7, Math.round(w)) }));
}

export function buildProducaoReportWorkbook(data: ProducaoReportData): ProducaoExcelBuildResult {
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

  const orientationLabel = data.config.orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem';
  const searchPart = data.searchTerm ? `   •   Busca: "${data.searchTerm}"` : '';

  applyMergedRange(
    ws1,
    merges1,
    0,
    0,
    0,
    maxColIdx,
    `Beju Caramelos — Relatório de Produção (${orientationLabel})`,
    titleStyle
  );
  applyMergedRange(
    ws1,
    merges1,
    1,
    0,
    1,
    maxColIdx,
    `Período: ${data.periodLabel}   •   Turnos: ${data.shiftsLabel}   •   Estágios: ${data.stagesLabel}   •   Categoria: ${data.categoryLabel}   •   Destino: ${data.destinationLabel}   •   Agrupamento: ${data.groupLabel}   •   Ordem: ${data.sortLabel}${searchPart}   •   Emitido em: ${data.generatedAtLabel}`,
    metaStyle
  );

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

  const colWidths1 = computeExcelColWidths(data);
  let cursorRow = headerRowIdx + 1;
  const ungroupedStartRow = cursorRow;
  const isGrouped = data.config.groupBy !== 'nenhum';
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

  const subtotalNumStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand50 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: SUBTOTAL_BORDER,
    numFmt: '#,##0',
  };

  const writeProductionRow = (row: ProducaoReportRow, rowIdx: number) => {
    const r = cursorRow;
    const isCanceled = row.status === 'CANCELADA';
    const rowBg = isCanceled
      ? COLORS.rose50
      : row.isReplenishment
      ? COLORS.sky50
      : rowIdx % 2 === 0
      ? COLORS.white
      : COLORS.slate50;

    let maxLines = 1;

    cols.forEach((col, colIdx) => {
      let bg: string = rowBg;
      let fg: string = isCanceled ? COLORS.rose700 : COLORS.slate900;
      let bold = col.key === 'produtoSku' || col.key === 'quantidade';

      if (col.key === 'quantidade') {
        fg = isCanceled ? COLORS.rose700 : COLORS.brand800;
        bold = true;
      } else if (col.key === 'estagio') {
        const c = getStageExcelColors(row.status, rowBg);
        bg = c.bg;
        fg = c.fg;
        bold = c.bold;
      } else if (col.key === 'origem' && row.isReplenishment && !isCanceled) {
        fg = COLORS.sky700;
        bold = true;
      }

      const baseStyle: CellStyle = {
        font: { name: 'Calibri', sz: 9.5, bold, color: { rgb: fg } },
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        alignment: { horizontal: col.align, vertical: 'center', wrapText: true },
        border: THIN_SLATE_BORDER,
      };

      const numVal = getProducaoReportNumericValue(row, col.key);
      if (col.kind === 'number' && numVal !== null) {
        setCell(ws1, r, colIdx, {
          t: 'n',
          v: numVal,
          z: '#,##0',
          s: { ...baseStyle, numFmt: '#,##0' },
        });
      } else {
        const textVal = getProducaoReportCellText(row, col.key);
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
      'Nenhuma demanda de produção encontrada com os filtros selecionados.',
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
        applyMergedRange(
          ws1,
          merges1,
          cursorRow,
          0,
          cursorRow,
          maxColIdx,
          `${data.groupHeaderPrefix}: ${group.label.toUpperCase()}   (${group.totalLots} lote(s) • Total: ${group.totalQuantity} un.)`,
          groupHeaderStyle
        );
        rowHeights1.push({ hpt: 23 });
        cursorRow += 1;
      }

      const groupStartRow = cursorRow;
      group.rows.forEach((row, rowIdx) => {
        writeProductionRow(row, rowIdx);
      });
      const groupEndRow = cursorRow - 1;

      if (isGrouped && group.rows.length > 0 && firstSummableIdx !== -1) {
        const subRow = cursorRow;
        const excelStart = groupStartRow + 1;
        const excelEnd = groupEndRow + 1;
        let subLabelPlaced = false;

        if (firstSummableIdx > 1) {
          applyMergedRange(
            ws1,
            merges1,
            subRow,
            0,
            subRow,
            firstSummableIdx - 1,
            `Subtotal — ${group.label} (${group.totalLots} lote(s))`,
            subtotalLabelStyle
          );
          subLabelPlaced = true;
        }

        cols.forEach((col, colIdx) => {
          if (firstSummableIdx > 1 && colIdx < firstSummableIdx) return;

          if (col.summable) {
            const colLetter = XLSX.utils.encode_col(colIdx);
            const cachedVal = getProducaoReportGroupTotal(group, col.key) ?? 0;
            setCell(ws1, subRow, colIdx, {
              t: 'n',
              f: `SUM(${colLetter}${excelStart}:${colLetter}${excelEnd})`,
              v: cachedVal,
              z: '#,##0',
              s: subtotalNumStyle,
            });
          } else if (!subLabelPlaced) {
            setCell(ws1, subRow, colIdx, {
              t: 's',
              v: `Subtotal (${group.totalLots})`,
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
        rowHeights1.push({ hpt: 21 });
        cursorRow += 1;
      }
    });
  }

  const ungroupedEndRow = cursorRow - 1;
  const grandTotalRow = cursorRow;

  const grandTotalLabelStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
  };
  const grandTotalEmptyStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
  };
  const grandTotalCountStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
    numFmt: '#,##0',
  };

  const grandTotalLabelText =
    isGrouped && data.groups.length > 0
      ? `TOTAL GERAL (${data.totalLots} lote(s) • ${data.groups.length} grupo(s))`
      : `TOTAL GERAL (${data.totalLots} lote(s))`;

  if (firstSummableIdx === -1) {
    applyMergedRange(
      ws1,
      merges1,
      grandTotalRow,
      0,
      grandTotalRow,
      maxColIdx,
      `TOTAL GERAL: ${data.totalLots} lote(s)  •  ${data.totalQuantity} un.  •  ${data.distinctProductsCount} produto(s)`,
      grandTotalLabelStyle
    );
  } else {
    let labelPlaced = false;
    if (firstSummableIdx > 1) {
      applyMergedRange(
        ws1,
        merges1,
        grandTotalRow,
        0,
        grandTotalRow,
        firstSummableIdx - 1,
        grandTotalLabelText,
        grandTotalLabelStyle
      );
      labelPlaced = true;
    }

    cols.forEach((col, colIdx) => {
      if (firstSummableIdx > 1 && colIdx < firstSummableIdx) return;

      if (col.summable) {
        const cachedVal = getProducaoReportColumnTotal(data, col.key) ?? 0;
        const colLetter = XLSX.utils.encode_col(colIdx);

        if (data.rows.length > 0 && isGrouped && subtotalExcelRows.length > 0) {
          const refs = subtotalExcelRows.map(rNum => `${colLetter}${rNum}`).join(',');
          setCell(ws1, grandTotalRow, colIdx, {
            t: 'n',
            f: `SUM(${refs})`,
            v: cachedVal,
            z: '#,##0',
            s: grandTotalCountStyle,
          });
        } else if (data.rows.length > 0 && ungroupedEndRow >= ungroupedStartRow) {
          setCell(ws1, grandTotalRow, colIdx, {
            t: 'n',
            f: `SUM(${colLetter}${ungroupedStartRow + 1}:${colLetter}${ungroupedEndRow + 1})`,
            v: cachedVal,
            z: '#,##0',
            s: grandTotalCountStyle,
          });
        } else {
          setCell(ws1, grandTotalRow, colIdx, {
            t: 'n',
            v: 0,
            z: '#,##0',
            s: grandTotalCountStyle,
          });
        }
      } else if (!labelPlaced) {
        setCell(ws1, grandTotalRow, colIdx, {
          t: 's',
          v: `TOTAL (${data.totalLots})`,
          s: grandTotalLabelStyle,
        });
        labelPlaced = true;
      } else {
        setCell(ws1, grandTotalRow, colIdx, {
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
    e: { r: grandTotalRow, c: maxColIdx },
  });
  ws1['!merges'] = merges1;
  ws1['!cols'] = colWidths1;
  ws1['!rows'] = rowHeights1;
  ws1['!margins'] = { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 };

  // Sheet 2: Resumo Consolidado por Produto
  const ws2: WorkSheet = {};
  const merges2: Range[] = [];
  const maxColIdx2 = 6;

  applyMergedRange(
    ws2,
    merges2,
    0,
    0,
    0,
    maxColIdx2,
    'Beju Caramelos — Resumo Consolidado por Produto',
    titleStyle
  );
  applyMergedRange(
    ws2,
    merges2,
    1,
    0,
    1,
    maxColIdx2,
    `Período: ${data.periodLabel}  •  Turnos: ${data.shiftsLabel}  •  ${data.distinctProductsCount} produto(s)  •  Emitido em: ${data.generatedAtLabel}`,
    metaStyle
  );

  const summaryHeaders = [
    'SKU',
    'Produto / Receita',
    'Categoria',
    'Unidade',
    'Lotes',
    'Qtd. Total',
    'Lojas Destino',
  ];
  const sumHeaderRow = 3;
  summaryHeaders.forEach((h, colIdx) => {
    setCell(ws2, sumHeaderRow, colIdx, {
      t: 's',
      v: h,
      s: {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand700 } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
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

  const sumStartRow = sumHeaderRow + 1;
  if (data.productSummary.length === 0) {
    applyMergedRange(
      ws2,
      merges2,
      sumStartRow,
      0,
      sumStartRow,
      maxColIdx2,
      'Nenhum produto encontrado com os critérios selecionados.',
      {
        font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: COLORS.slate600 } },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: THIN_SLATE_BORDER,
      }
    );
    rowHeights2.push({ hpt: 22 });
  } else {
    data.productSummary.forEach((item, idx) => {
      const r = sumStartRow + idx;
      const rowBg = idx % 2 === 0 ? COLORS.white : COLORS.slate50;

      setCell(ws2, r, 0, {
        t: 's',
        v: item.sku,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate700 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws2, r, 1, {
        t: 's',
        v: item.descricao,
        s: {
          font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws2, r, 2, {
        t: 's',
        v: item.categoriaNome,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate700 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws2, r, 3, {
        t: 's',
        v: item.unidadeMedida,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate700 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws2, r, 4, {
        t: 'n',
        v: item.lotsCount,
        z: '#,##0',
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate700 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: '#,##0',
        },
      });
      setCell(ws2, r, 5, {
        t: 'n',
        v: item.totalQuantidade,
        z: '#,##0',
        s: {
          font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.brand800 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: '#,##0',
        },
      });
      setCell(ws2, r, 6, {
        t: 's',
        v: item.destinosText || '—',
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate700 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
          border: THIN_SLATE_BORDER,
        },
      });
      const destLines = Math.max(1, Math.ceil((item.destinosText || '').length / 32));
      const descLines = Math.max(1, Math.ceil(item.descricao.length / 34));
      rowHeights2.push({ hpt: Math.max(21, Math.max(destLines, descLines) * 14.5) });
    });
  }

  const sumTotalRow =
    data.productSummary.length > 0 ? sumStartRow + data.productSummary.length : sumStartRow + 1;

  applyMergedRange(
    ws2,
    merges2,
    sumTotalRow,
    0,
    sumTotalRow,
    3,
    `TOTAL CONSOLIDADO (${data.productSummary.length} produto(s))`,
    grandTotalLabelStyle
  );

  const colLotsLetter = XLSX.utils.encode_col(4);
  const colQtyLetter = XLSX.utils.encode_col(5);

  if (data.productSummary.length > 0) {
    const excelStart2 = sumStartRow + 1;
    const excelEnd2 = sumStartRow + data.productSummary.length;
    setCell(ws2, sumTotalRow, 4, {
      t: 'n',
      f: `SUM(${colLotsLetter}${excelStart2}:${colLotsLetter}${excelEnd2})`,
      v: data.totalLots,
      z: '#,##0',
      s: grandTotalCountStyle,
    });
    setCell(ws2, sumTotalRow, 5, {
      t: 'n',
      f: `SUM(${colQtyLetter}${excelStart2}:${colQtyLetter}${excelEnd2})`,
      v: data.totalQuantity,
      z: '#,##0',
      s: grandTotalCountStyle,
    });
  } else {
    setCell(ws2, sumTotalRow, 4, { t: 'n', v: 0, z: '#,##0', s: grandTotalCountStyle });
    setCell(ws2, sumTotalRow, 5, { t: 'n', v: 0, z: '#,##0', s: grandTotalCountStyle });
  }
  setCell(ws2, sumTotalRow, 6, {
    t: 's',
    v: `${data.distinctDestinationsCount} destino(s)`,
    s: grandTotalEmptyStyle,
  });
  rowHeights2.push({ hpt: 24 });

  ws2['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: sumTotalRow, c: maxColIdx2 },
  });
  ws2['!merges'] = merges2;
  ws2['!cols'] = [
    { wch: 13 },
    { wch: 36 },
    { wch: 18 },
    { wch: 10 },
    { wch: 10 },
    { wch: 13 },
    { wch: 34 },
  ];
  ws2['!rows'] = rowHeights2;
  ws2['!margins'] = { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 };

  XLSX.utils.book_append_sheet(wb, ws1, 'Ordem_Producao');
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumo_Produtos');

  return { workbook: wb, sheet1: ws1, sheet2: ws2 };
}

function patchWorksheetXmlForA4(
  xml: string,
  orientation: ProducaoReportOrientation
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

export function buildProducaoReportXlsxBuffer(data: ProducaoReportData): Uint8Array {
  const { workbook } = buildProducaoReportWorkbook(data);
  const raw = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | number[];
  const cfb = XLSX.CFB.read(new Uint8Array(raw), { type: 'array' });

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  for (const sheetPath of ['/xl/worksheets/sheet1.xml', '/xl/worksheets/sheet2.xml']) {
    const entry = XLSX.CFB.find(cfb, sheetPath);
    if (!entry || !entry.content) continue;
    const xml = decoder.decode(new Uint8Array(entry.content as Uint8Array | number[]));
    const patched = patchWorksheetXmlForA4(xml, data.config.orientation);
    const bytes = encoder.encode(patched);
    entry.content = Array.from(bytes);
    entry.size = bytes.length;
  }

  const out = XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip' }) as ArrayBuffer | number[];
  return new Uint8Array(out);
}

export function downloadProducaoReportExcelBuffer(buffer: Uint8Array): void {
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
  link.download = `Beju_Caramelos_Relatorio_Producao_${yyyy}-${mm}-${dd}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
