import * as XLSXStyleMod from 'xlsx-js-style';
import type { CellObject, CellStyle, Range, WorkBook, WorkSheet } from 'xlsx-js-style';
import type { OrderStatus, PaymentStatus } from '../types';
import {
  PedidosReportData,
  PedidosReportOrderRow,
  PedidosReportOrientation,
  getPedidosReportColumnTotal,
  getPedidosReportCombinedParts,
  getPedidosReportOrderCellText,
  getPedidosReportOrderNumericValue,
  measureColumnContentCharLengths,
} from './pedidosReportData';

const XLSX = (
  (XLSXStyleMod as unknown as { default?: typeof XLSXStyleMod }).default ?? XLSXStyleMod
) as typeof XLSXStyleMod;

export interface ExcelRichTextCellSpec {
  primary: string;
  secondary: string;
  secondaryRgb: string;
}

export interface PedidosExcelBuildResult {
  workbook: WorkBook;
  sheet1: WorkSheet;
  sheet2: WorkSheet;
  richTextCells: Map<string, ExcelRichTextCellSpec>;
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
  blue50: 'EFF6FF',
  blue200: 'BFDBFE',
  blue700: '1D4ED8',
  blue900: '1E3A8A',
  amber50: 'FFFBEB',
  amber800: '92400E',
  sky50: 'F0F9FF',
  sky700: '0369A1',
  indigo50: 'EEF2FF',
  indigo800: '3730A3',
  purple50: 'FAF5FF',
  purple800: '6B21A8',
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

function getOrderStatusExcelColors(
  status: OrderStatus,
  fallbackBg: string
): { bg: string; fg: string; bold: boolean } {
  switch (status) {
    case 'PENDENTE':
      return { bg: COLORS.amber50, fg: COLORS.amber800, bold: true };
    case 'CONFIRMADO':
      return { bg: COLORS.brand50, fg: COLORS.brand700, bold: true };
    case 'EM_PRODUCAO':
      return { bg: COLORS.blue50, fg: COLORS.blue700, bold: true };
    case 'PRONTO':
      return { bg: COLORS.purple50, fg: COLORS.purple800, bold: true };
    case 'EM_ROTA':
      return { bg: COLORS.indigo50, fg: COLORS.indigo800, bold: true };
    case 'ENTREGUE':
      return { bg: COLORS.slate100, fg: COLORS.slate700, bold: true };
    case 'CANCELADO':
      return { bg: COLORS.rose50, fg: COLORS.rose700, bold: true };
    default:
      return { bg: fallbackBg, fg: COLORS.slate700, bold: false };
  }
}

function getPaymentStatusExcelColors(status: PaymentStatus): {
  bg: string;
  fg: string;
  bold: boolean;
} {
  if (status === 'PAGO') {
    return { bg: COLORS.brand50, fg: COLORS.brand700, bold: true };
  }
  if (status === 'SINAL') {
    return { bg: COLORS.sky50, fg: COLORS.sky700, bold: true };
  }
  return { bg: COLORS.amber50, fg: COLORS.amber800, bold: true };
}

function computeExcelColWidths(data: PedidosReportData): Array<{ wch: number }> {
  const cols = data.selectedColumns;
  const charLengths = measureColumnContentCharLengths(data);
  const budget = data.config.orientation === 'portrait' ? 118 : 185;

  const desired = cols.map(col => {
    const contentChars = charLengths.get(col.key) || 0;
    if (col.isFlexible && data.orders.length > 0 && contentChars === 0) {
      return col.excelMinWch;
    }
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
      const nonFlexSlack = cols.reduce(
        (acc, c, i) => acc + (!c.isFlexible ? Math.max(0, desired[i] - c.excelMinWch) : 0),
        0
      );
      if (nonFlexSlack > 0) {
        const take = Math.min(excess, nonFlexSlack);
        cols.forEach((c, i) => {
          if (c.isFlexible) return;
          const slack = Math.max(0, desired[i] - c.excelMinWch);
          desired[i] -= take * (slack / nonFlexSlack);
        });
        sum = desired.reduce((a, b) => a + b, 0);
        excess = Math.max(0, sum - budget);
      }
    }

    if (excess > 0.5) {
      const scale = budget / sum;
      cols.forEach((c, i) => {
        desired[i] = Math.max(6, Math.round(desired[i] * scale));
      });
    }
  }

  return desired.map(w => ({ wch: Math.max(6, Math.round(w)) }));
}

export function buildPedidosReportWorkbook(data: PedidosReportData): PedidosExcelBuildResult {
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

  const searchPart = data.searchTerm ? `   •   Busca: "${data.searchTerm}"` : '';
  const orientationLabel = data.config.orientation === 'portrait' ? 'A4 Retrato' : 'A4 Paisagem';

  applyMergedRange(
    ws1,
    merges1,
    0,
    0,
    0,
    maxColIdx,
    `Beju Caramelos — Relatório de Pedidos (${orientationLabel})`,
    titleStyle
  );
  applyMergedRange(
    ws1,
    merges1,
    1,
    0,
    1,
    maxColIdx,
    `Período (Entrega): ${data.periodLabel}   •   Unidade: ${data.unitLabel}   •   Status: ${data.statusLabel}   •   Agrupamento: ${data.groupLabel}   •   Ordem: ${data.sortLabel}${searchPart}   •   Emitido em: ${data.generatedAtLabel}`,
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
    { hpt: 20 },
    { hpt: 6 },
    { hpt: 26 },
  ];

  const colWidths1 = computeExcelColWidths(data);
  let cursorRow = headerRowIdx + 1;
  const dataStartRow = cursorRow;
  const isGrouped = data.config.groupBy !== 'nenhum';
  const richTextCells = new Map<string, ExcelRichTextCellSpec>();

  const groupHeaderStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand100 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: GROUP_HEADER_BORDER,
  };

  const writeOrderRows = (orderRow: PedidosReportOrderRow, orderIdx: number) => {
    const rowBg = orderRow.isReplenishment
      ? COLORS.sky50
      : orderIdx % 2 === 0
      ? COLORS.white
      : COLORS.slate50;

    const itemsToRender =
      data.expandItems && orderRow.itens.length > 0 ? orderRow.itens : [undefined];
    const spanCount = itemsToRender.length;
    const orderStartRow = cursorRow;
    const orderEndRow = cursorRow + spanCount - 1;

    // Register vertical merges for order-level columns when order spans multiple items
    if (spanCount > 1) {
      cols.forEach((col, colIdx) => {
        if (col.level === 'order') {
          merges1.push({
            s: { r: orderStartRow, c: colIdx },
            e: { r: orderEndRow, c: colIdx },
          });
        }
      });
    }

    itemsToRender.forEach((item, subIdx) => {
      const r = cursorRow;
      let maxLines = 1;

      cols.forEach((col, colIdx) => {
        const isMergedSlave = spanCount > 1 && col.level === 'order' && subIdx > 0;
        let bg: string = rowBg;
        let fg: string = COLORS.slate900;
        let bold = false;

        if (col.key === 'quantidadeItem') {
          fg = COLORS.brand800;
          bold = true;
        } else if (col.key === 'status') {
          const c = getOrderStatusExcelColors(orderRow.status, rowBg);
          bg = c.bg;
          fg = c.fg;
          bold = c.bold;
        } else if (col.key === 'statusPagamento') {
          const c = getPaymentStatusExcelColors(orderRow.statusPagamento);
          bg = c.bg;
          fg = c.fg;
          bold = c.bold;
        } else if (col.key === 'valorTotal') {
          bold = true;
        } else if (col.key === 'saldoAReceber') {
          if (orderRow.saldoAReceber > 0.009) {
            bg = COLORS.rose50;
            fg = COLORS.rose700;
            bold = true;
          } else {
            fg = COLORS.brand700;
          }
        }

        const baseStyle: CellStyle = {
          font: { name: 'Calibri', sz: 9.5, bold, color: { rgb: fg } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: col.align, vertical: 'center', wrapText: true },
          border: THIN_SLATE_BORDER,
        };

        if (isMergedSlave) {
          // Keep style & border on every cell in vertical merge, empty value to avoid double-counting in SUM()
          setCell(ws1, r, colIdx, {
            t: 's',
            v: '',
            s: baseStyle,
          });
          return;
        }

        const numVal = getPedidosReportOrderNumericValue(orderRow, col.key, item);
        if (col.kind === 'currency' && numVal !== null) {
          setCell(ws1, r, colIdx, {
            t: 'n',
            v: numVal,
            z: 'R$ #,##0.00',
            s: { ...baseStyle, numFmt: 'R$ #,##0.00' },
          });
        } else if (col.kind === 'number' && numVal !== null) {
          setCell(ws1, r, colIdx, {
            t: 'n',
            v: numVal,
            z: '#,##0',
            s: { ...baseStyle, numFmt: '#,##0' },
          });
        } else {
          const textVal = getPedidosReportOrderCellText(orderRow, col.key, item);
          setCell(ws1, r, colIdx, {
            t: 's',
            v: textVal,
            s: baseStyle,
          });
          const combined = getPedidosReportCombinedParts(orderRow, col.key);
          if (combined) {
            const ref = XLSX.utils.encode_cell({ r, c: colIdx });
            const secondaryRgb =
              combined.secondaryTone === 'blue'
                ? COLORS.blue700
                : combined.secondaryTone === 'amber'
                ? COLORS.amber800
                : COLORS.slate600;
            richTextCells.set(ref, {
              primary: combined.primary,
              secondary: combined.secondary,
              secondaryRgb,
            });
          }
          const colWch = Math.max(8, colWidths1[colIdx]?.wch || 14);
          const explicitLines = textVal.split('\n');
          const wrapped = explicitLines.reduce(
            (sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(6, colWch - 2))),
            0
          );
          const effectiveWrapped =
            spanCount > 1 && col.level === 'order' ? Math.ceil(wrapped / spanCount) : wrapped;
          if (effectiveWrapped > maxLines) {
            maxLines = effectiveWrapped;
          }
        }
      });

      rowHeights1.push({ hpt: Math.max(20, maxLines * 14.5) });
      cursorRow += 1;
    });
  };

  const firstSummableIdx = cols.findIndex(c => c.summable);

  if (data.orders.length === 0) {
    applyMergedRange(
      ws1,
      merges1,
      cursorRow,
      0,
      cursorRow,
      maxColIdx,
      'Nenhum pedido encontrado com os critérios selecionados.',
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
          `${data.groupHeaderPrefix}: ${group.label.toUpperCase()}   (${group.totalOrders} pedido(s) • ${group.totalItemQuantity} item(ns))`,
          groupHeaderStyle
        );
        rowHeights1.push({ hpt: 23 });
        cursorRow += 1;
      }

      group.orders.forEach((orderRow, orderIdx) => {
        writeOrderRows(orderRow, orderIdx);
      });
    });
  }

  const dataEndRow = cursorRow - 1;
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
  const grandTotalCurrencyStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
    numFmt: 'R$ #,##0.00',
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
      ? `TOTAL GERAL (${data.totalOrders} ped. • ${data.groups.length} grupo(s))`
      : `TOTAL GERAL (${data.totalOrders} pedido(s))`;

  if (firstSummableIdx === -1) {
    applyMergedRange(
      ws1,
      merges1,
      grandTotalRow,
      0,
      grandTotalRow,
      maxColIdx,
      `TOTAL GERAL: ${data.totalOrders} pedido(s)  •  ${data.totalItemQuantity} item(ns)  •  R$ ${data.grandTotalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
        const cachedVal = getPedidosReportColumnTotal(data, col.key) ?? 0;
        const isCurrency = col.kind === 'currency';
        const colLetter = XLSX.utils.encode_col(colIdx);

        if (data.orders.length > 0 && dataEndRow >= dataStartRow) {
          const excelStart = dataStartRow + 1;
          const excelEnd = dataEndRow + 1;
          setCell(ws1, grandTotalRow, colIdx, {
            t: 'n',
            f: `SUM(${colLetter}${excelStart}:${colLetter}${excelEnd})`,
            v: cachedVal,
            z: isCurrency ? 'R$ #,##0.00' : '#,##0',
            s: isCurrency ? grandTotalCurrencyStyle : grandTotalCountStyle,
          });
        } else {
          setCell(ws1, grandTotalRow, colIdx, {
            t: 'n',
            v: 0,
            z: isCurrency ? 'R$ #,##0.00' : '#,##0',
            s: isCurrency ? grandTotalCurrencyStyle : grandTotalCountStyle,
          });
        }
      } else if (!labelPlaced) {
        setCell(ws1, grandTotalRow, colIdx, {
          t: 's',
          v: `TOTAL (${data.totalOrders})`,
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

  // Sheet 2: Resumo Consolidado de Itens
  const ws2: WorkSheet = {};
  const merges2: Range[] = [];
  const maxColIdx2 = 4;

  applyMergedRange(
    ws2,
    merges2,
    0,
    0,
    0,
    maxColIdx2,
    'Beju Caramelos — Resumo Consolidado de Itens',
    titleStyle
  );
  applyMergedRange(
    ws2,
    merges2,
    1,
    0,
    1,
    maxColIdx2,
    `Período (Entrega): ${data.periodLabel}  •  ${data.totalOrders} pedido(s)  •  ${data.productSummary.length} produto(s) distinto(s)  •  Emitido em: ${data.generatedAtLabel}`,
    metaStyle
  );

  const summaryHeaders = ['SKU', 'Produto', 'Unidade', 'Pedidos', 'Qtd. Total'];
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
      'Nenhum item encontrado nos pedidos selecionados.',
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
        v: item.unidade,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate700 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws2, r, 3, {
        t: 'n',
        v: item.ordersCount,
        z: '#,##0',
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate700 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: '#,##0',
        },
      });
      setCell(ws2, r, 4, {
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
      rowHeights2.push({ hpt: 21 });
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
    `TOTAL CONSOLIDADO (${data.productSummary.length} item(ns))`,
    grandTotalLabelStyle
  );

  const colSumQtyLetter = XLSX.utils.encode_col(4);

  if (data.productSummary.length > 0) {
    const excelStart2 = sumStartRow + 1;
    const excelEnd2 = sumStartRow + data.productSummary.length;
    setCell(ws2, sumTotalRow, 4, {
      t: 'n',
      f: `SUM(${colSumQtyLetter}${excelStart2}:${colSumQtyLetter}${excelEnd2})`,
      v: data.totalItemQuantity,
      z: '#,##0',
      s: grandTotalCountStyle,
    });
  } else {
    setCell(ws2, sumTotalRow, 4, { t: 'n', v: 0, z: '#,##0', s: grandTotalCountStyle });
  }
  rowHeights2.push({ hpt: 24 });

  ws2['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: sumTotalRow, c: maxColIdx2 },
  });
  ws2['!merges'] = merges2;
  ws2['!cols'] = [
    { wch: 14 },
    { wch: 44 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];
  ws2['!rows'] = rowHeights2;
  ws2['!margins'] = { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 };

  XLSX.utils.book_append_sheet(wb, ws1, 'Relatorio_Pedidos');
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumo_Itens');

  return { workbook: wb, sheet1: ws1, sheet2: ws2, richTextCells };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function patchRichTextCellsInXml(
  xml: string,
  richTextCells: Map<string, ExcelRichTextCellSpec>
): string {
  let patched = xml;
  richTextCells.forEach((spec, ref) => {
    const cellRegex = new RegExp(
      `<c r="${ref}"([^>]*)t="str"[^>]*><v[^>]*>[\\s\\S]*?<\\/v><\\/c>`
    );
    patched = patched.replace(cellRegex, (_match, rawAttrs: string) => {
      const cleanAttrs = rawAttrs.replace(/\s*xml:space="preserve"/g, '');
      return (
        `<c r="${ref}"${cleanAttrs}t="inlineStr"><is>` +
        `<r><rPr><b/><sz val="9.5"/><color rgb="FF${COLORS.slate900}"/><rFont val="Calibri"/></rPr>` +
        `<t xml:space="preserve">${escapeXml(spec.primary)}&#10;</t></r>` +
        `<r><rPr><sz val="8.5"/><color rgb="FF${spec.secondaryRgb}"/><rFont val="Calibri"/></rPr>` +
        `<t xml:space="preserve">${escapeXml(spec.secondary)}</t></r>` +
        `</is></c>`
      );
    });
  });
  return patched;
}

function patchWorksheetXmlForA4(
  xml: string,
  orientation: PedidosReportOrientation
): string {
  let patched = xml;

  // 1. Enable fitToPage inside <sheetPr>
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

  // 2. Insert <pageSetup paperSize="9" .../> immediately after <pageMargins .../> (before <ignoredErrors>)
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

export function buildPedidosReportXlsxBuffer(data: PedidosReportData): Uint8Array {
  const { workbook, richTextCells } = buildPedidosReportWorkbook(data);
  const raw = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | number[];
  const cfb = XLSX.CFB.read(new Uint8Array(raw), { type: 'array' });

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  for (const sheetPath of ['/xl/worksheets/sheet1.xml', '/xl/worksheets/sheet2.xml']) {
    const entry = XLSX.CFB.find(cfb, sheetPath);
    if (!entry || !entry.content) continue;
    const xml = decoder.decode(new Uint8Array(entry.content as Uint8Array | number[]));
    let patched = patchWorksheetXmlForA4(xml, data.config.orientation);
    if (sheetPath === '/xl/worksheets/sheet1.xml' && richTextCells.size > 0) {
      patched = patchRichTextCellsInXml(patched, richTextCells);
    }
    const bytes = encoder.encode(patched);
    entry.content = Array.from(bytes);
    entry.size = bytes.length;
  }

  const out = XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip' }) as ArrayBuffer | number[];
  return new Uint8Array(out);
}

export function downloadPedidosReportExcelBuffer(buffer: Uint8Array): void {
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
  link.download = `Beju_Caramelos_Relatorio_Pedidos_${yyyy}-${mm}-${dd}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportPedidosReportExcel(data: PedidosReportData): void {
  const buffer = buildPedidosReportXlsxBuffer(data);
  downloadPedidosReportExcelBuffer(buffer);
}
