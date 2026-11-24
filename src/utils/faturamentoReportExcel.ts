import * as XLSXStyleMod from 'xlsx-js-style';
import type { CellObject, CellStyle, Range, WorkBook, WorkSheet } from 'xlsx-js-style';
import type { InvoiceStatus } from '../types';
import {
  FaturamentoReportData,
  formatPedidoWithPaymentMethod,
} from './faturamentoReportData';
import { toLocalDateInput } from './financialReconciliation';

const XLSX = (
  (XLSXStyleMod as unknown as { default?: typeof XLSXStyleMod }).default ?? XLSXStyleMod
) as typeof XLSXStyleMod;

export interface FaturamentoExcelBuildResult {
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
  green50: 'F0FDF4',
  brand50: 'ECFDF5',
  brand100: 'D1FAE5',
  brand200: 'A7F3D0',
  brand700: '047857',
  brand800: '065F46',
  brand900: '004F35',
  blue50: 'EFF6FF',
  blue200: 'BFDBFE',
  blue900: '1E3A8A',
  rose50: 'FFF1F2',
  rose700: 'BE123C',
  teal50: 'F0FDFA',
  teal800: '115E59',
  indigo50: 'EEF2FF',
  indigo800: '3730A3',
  amber50: 'FFFBEB',
  amber100: 'FEF3C7',
  amber200: 'FDE68A',
  amber800: '92400E',
} as const;

const THIN_SLATE_BORDER = {
  top: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
  bottom: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
};

const GROUP_HEADER_BORDER = {
  top: { style: 'medium' as const, color: { rgb: COLORS.brand700 } },
  bottom: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
};

const SUBTOTAL_BORDER = {
  top: { style: 'thin' as const, color: { rgb: COLORS.brand700 } },
  bottom: { style: 'medium' as const, color: { rgb: COLORS.brand700 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
};

const GRAND_TOTAL_BORDER = {
  top: { style: 'medium' as const, color: { rgb: COLORS.brand900 } },
  bottom: { style: 'medium' as const, color: { rgb: COLORS.brand900 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.brand700 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.brand700 } },
};

function setCell(
  ws: WorkSheet,
  r: number,
  c: number,
  cell: CellObject
): void {
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

function getPaymentMethodCellStyle(label: string, baseBg: string): CellStyle {
  const lower = (label || '').toLowerCase();
  let bg: string = baseBg;
  let fg: string = COLORS.slate700;
  let bold = false;

  if (lower.includes('pix')) {
    bg = COLORS.teal50;
    fg = COLORS.teal800;
    bold = true;
  } else if (
    lower.includes('c6') ||
    lower.includes('sumup') ||
    lower.includes('cart') ||
    lower.includes('crédit') ||
    lower.includes('débit')
  ) {
    bg = COLORS.indigo50;
    fg = COLORS.indigo800;
    bold = true;
  } else if (lower.includes('dinheiro')) {
    bg = COLORS.brand50;
    fg = COLORS.brand700;
    bold = true;
  } else if (lower.includes('boleto')) {
    bg = COLORS.amber50;
    fg = COLORS.amber800;
    bold = true;
  } else if (lower.includes('bonific')) {
    bg = COLORS.slate100;
    fg = COLORS.slate600;
  }

  return {
    font: { name: 'Calibri', sz: 10, bold, color: { rgb: fg } },
    fill: { patternType: 'solid', fgColor: { rgb: bg } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: THIN_SLATE_BORDER,
  };
}

function getInvoiceStatusCellStyle(nfStatus: InvoiceStatus, baseBg: string): CellStyle {
  let bg: string = baseBg;
  let fg: string = COLORS.slate600;
  let bold = false;

  if (nfStatus === 'EMITIDA') {
    bg = COLORS.brand50;
    fg = COLORS.brand700;
    bold = true;
  } else if (nfStatus === 'PENDENTE') {
    bg = COLORS.rose50;
    fg = COLORS.rose700;
    bold = true;
  } else if (nfStatus === 'DISPENSADA') {
    bg = COLORS.slate100;
    fg = COLORS.slate600;
  }

  return {
    font: { name: 'Calibri', sz: 10, bold, color: { rgb: fg } },
    fill: { patternType: 'solid', fgColor: { rgb: bg } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: THIN_SLATE_BORDER,
  };
}

export function buildFaturamentoWorkbook(
  data: FaturamentoReportData
): FaturamentoExcelBuildResult {
  const wb: WorkBook = XLSX.utils.book_new();
  const ws1: WorkSheet = {};
  const merges1: Range[] = [];
  const maxColIdx = 7;

  const titleStyle: CellStyle = {
    font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.slate900 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: THIN_SLATE_BORDER,
  };
  const subtitleStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.blue900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.blue50 } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: COLORS.blue200 } },
      bottom: { style: 'thin', color: { rgb: COLORS.blue200 } },
      left: { style: 'thin', color: { rgb: COLORS.blue200 } },
      right: { style: 'thin', color: { rgb: COLORS.blue200 } },
    },
  };

  applyMergedRange(
    ws1,
    merges1,
    0,
    0,
    0,
    maxColIdx,
    'BEJU CARAMELOS — RELATÓRIO DE FATURAMENTO',
    titleStyle
  );
  applyMergedRange(
    ws1,
    merges1,
    1,
    0,
    1,
    maxColIdx,
    `Unidade: ${data.unitLabel}   |   Situação: ${data.filterLabel}   |   Período: ${data.dateFilterLabel}   |   Extrato: ${data.statementPeriodLabel}   |   Emitido em: ${data.generatedAtLabel}`,
    subtitleStyle
  );

  const headers = [
    'Data do Extrato',
    'Pedido',
    'Cliente',
    'Valor',
    'Valor Recebido',
    'Saldo a Receber',
    'Forma de Pagamento',
    'Nota Fiscal',
  ];

  const headerAligns: Array<'left' | 'center' | 'right'> = [
    'center',
    'center',
    'left',
    'right',
    'right',
    'right',
    'center',
    'center',
  ];

  const headerRowIdx = 3;
  headers.forEach((h, colIdx) => {
    setCell(ws1, headerRowIdx, colIdx, {
      t: 's',
      v: h,
      s: {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand700 } },
        alignment: { horizontal: headerAligns[colIdx], vertical: 'center', wrapText: true },
        border: {
          top: { style: 'medium', color: { rgb: COLORS.brand900 } },
          bottom: { style: 'medium', color: { rgb: COLORS.brand900 } },
          left: { style: 'thin', color: { rgb: COLORS.brand800 } },
          right: { style: 'thin', color: { rgb: COLORS.brand800 } },
        },
      },
    });
  });

  const rowHeights1: Array<{ hpt: number }> = [
    { hpt: 30 },
    { hpt: 22 },
    { hpt: 8 },
    { hpt: 26 },
  ];

  const groupHeaderStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: COLORS.brand900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand100 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: GROUP_HEADER_BORDER,
  };
  const subtotalLabelStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand100 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: SUBTOTAL_BORDER,
  };
  const subtotalEmptyStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand100 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: SUBTOTAL_BORDER,
  };
  const subtotalCurrencyStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand100 } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: SUBTOTAL_BORDER,
    numFmt: 'R$ #,##0.00',
  };
  const grandTotalLabelStyle: CellStyle = {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
  };
  const grandTotalEmptyStyle: CellStyle = {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
  };
  const grandTotalCurrencyStyle: CellStyle = {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
    numFmt: 'R$ #,##0.00',
  };

  let cursorRow = headerRowIdx + 1;
  const subtotalExcelRows: number[] = [];

  const colValorLetter = XLSX.utils.encode_col(3);
  const colRecebidoLetter = XLSX.utils.encode_col(4);
  const colSaldoLetter = XLSX.utils.encode_col(5);

  if (data.groups.length === 0) {
    applyMergedRange(
      ws1,
      merges1,
      cursorRow,
      0,
      cursorRow,
      maxColIdx,
      'Nenhum pedido encontrado para o Relatório de Faturamento.',
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
    for (const group of data.groups) {
      applyMergedRange(
        ws1,
        merges1,
        cursorRow,
        0,
        cursorRow,
        maxColIdx,
        `UNIDADE: ${group.unidadeNome.toUpperCase()}  (${group.rows.length} pedido(s))`,
        groupHeaderStyle
      );
      rowHeights1.push({ hpt: 24 });
      cursorRow += 1;

      const unitSubgroupSubtotalExcelRows: number[] = [];

      for (const subgroup of group.subgroups) {
        const isSubConc = subgroup.key === 'CONCILIADO';
        const subHeaderColor = isSubConc ? COLORS.brand700 : COLORS.amber800;
        const subHeaderBg = isSubConc ? COLORS.brand50 : COLORS.amber50;
        const subBorderColor = isSubConc ? COLORS.brand200 : COLORS.amber200;
        const subHeaderBorder = {
          top: { style: 'thin' as const, color: { rgb: subBorderColor } },
          bottom: { style: 'thin' as const, color: { rgb: subBorderColor } },
          left: { style: 'thin' as const, color: { rgb: subBorderColor } },
          right: { style: 'thin' as const, color: { rgb: subBorderColor } },
        };

        applyMergedRange(
          ws1,
          merges1,
          cursorRow,
          0,
          cursorRow,
          maxColIdx,
          `${subgroup.label.toUpperCase()}  (${subgroup.rows.length} pedido(s))`,
          {
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: subHeaderColor } },
            fill: { patternType: 'solid', fgColor: { rgb: subHeaderBg } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: subHeaderBorder,
          }
        );
        rowHeights1.push({ hpt: 21 });
        cursorRow += 1;

        const subDetailStartIdx = cursorRow;

        subgroup.rows.forEach((row, idx) => {
          const r = cursorRow;
          const rowBg = idx % 2 === 0 ? COLORS.white : COLORS.slate50;
          const valTotal = Number(row.valor) || 0;
          const valRecebido = Number(row.valorRecebido) || 0;
          const valSaldo = Number(row.saldoAReceber) || 0;
          const hasOpenBalance = valSaldo > 0.009;
          const pedidoDisplay = formatPedidoWithPaymentMethod(
            row.numeroPedido,
            row.formaPagamentoPedido
          );
          const nfLabel =
            row.nfStatusLabel ||
            (row.nfStatus === 'EMITIDA'
              ? 'Emitida'
              : row.nfStatus === 'DISPENSADA'
              ? 'Dispensada'
              : 'A emitir');

          const textCenter: CellStyle = {
            font: { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate700 } },
            fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: THIN_SLATE_BORDER,
          };
          const textLeft: CellStyle = {
            font: { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate900 } },
            fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
            alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
            border: THIN_SLATE_BORDER,
          };

          setCell(ws1, r, 0, { t: 's', v: row.dataExtratoLabel || '—', s: textCenter });
          setCell(ws1, r, 1, {
            t: 's',
            v: pedidoDisplay,
            s: {
              ...textCenter,
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } },
            },
          });
          setCell(ws1, r, 2, { t: 's', v: row.clienteNome, s: textLeft });
          setCell(ws1, r, 3, {
            t: 'n',
            v: valTotal,
            z: 'R$ #,##0.00',
            s: {
              font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } },
              fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: THIN_SLATE_BORDER,
              numFmt: 'R$ #,##0.00',
            },
          });
          setCell(ws1, r, 4, {
            t: 'n',
            v: valRecebido,
            z: 'R$ #,##0.00',
            s: {
              font: {
                name: 'Calibri',
                sz: 10,
                bold: valRecebido > 0,
                color: { rgb: valRecebido > 0 ? COLORS.brand700 : COLORS.slate600 },
              },
              fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: THIN_SLATE_BORDER,
              numFmt: 'R$ #,##0.00',
            },
          });
          setCell(ws1, r, 5, {
            t: 'n',
            v: valSaldo,
            z: 'R$ #,##0.00',
            s: {
              font: {
                name: 'Calibri',
                sz: 10,
                bold: hasOpenBalance,
                color: { rgb: hasOpenBalance ? COLORS.rose700 : COLORS.brand700 },
              },
              fill: {
                patternType: 'solid',
                fgColor: { rgb: hasOpenBalance ? COLORS.rose50 : rowBg },
              },
              alignment: { horizontal: 'right', vertical: 'center' },
              border: THIN_SLATE_BORDER,
              numFmt: 'R$ #,##0.00',
            },
          });
          setCell(ws1, r, 6, {
            t: 's',
            v: row.formaPagamentoFinanceiro || '—',
            s: getPaymentMethodCellStyle(row.formaPagamentoFinanceiro, rowBg),
          });
          setCell(ws1, r, 7, {
            t: 's',
            v: nfLabel,
            s: getInvoiceStatusCellStyle(row.nfStatus, rowBg),
          });

          const wrappedLines = Math.max(
            1,
            Math.ceil((row.clienteNome || '').length / 28),
            Math.ceil((row.dataExtratoLabel || '').length / 16),
            Math.ceil(pedidoDisplay.length / 22)
          );
          rowHeights1.push({ hpt: Math.max(21, wrappedLines * 14) });
          cursorRow += 1;
        });

        const subDetailEndIdx = cursorRow - 1;
        const subSubtotalRow = cursorRow;
        const subSubtotalBg = isSubConc ? COLORS.green50 : COLORS.amber50;
        const subSubtotalFg = isSubConc ? COLORS.brand900 : COLORS.amber800;
        const subSubtotalLabelStyle: CellStyle = {
          font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: subSubtotalFg } },
          fill: { patternType: 'solid', fgColor: { rgb: subSubtotalBg } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: subHeaderBorder,
        };
        const subSubtotalEmptyStyle: CellStyle = {
          font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: subSubtotalFg } },
          fill: { patternType: 'solid', fgColor: { rgb: subSubtotalBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: subHeaderBorder,
        };
        const subSubtotalCurrencyStyle: CellStyle = {
          font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: subSubtotalFg } },
          fill: { patternType: 'solid', fgColor: { rgb: subSubtotalBg } },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: subHeaderBorder,
          numFmt: 'R$ #,##0.00',
        };

        applyMergedRange(
          ws1,
          merges1,
          subSubtotalRow,
          0,
          subSubtotalRow,
          2,
          `Subtotal ${subgroup.label} (${subgroup.rows.length} pedido(s))`,
          subSubtotalLabelStyle
        );

        if (subgroup.rows.length > 0) {
          const excelStart = subDetailStartIdx + 1;
          const excelEnd = subDetailEndIdx + 1;
          setCell(ws1, subSubtotalRow, 3, {
            t: 'n',
            f: `SUM(${colValorLetter}${excelStart}:${colValorLetter}${excelEnd})`,
            v: subgroup.totalValor,
            z: 'R$ #,##0.00',
            s: subSubtotalCurrencyStyle,
          });
          setCell(ws1, subSubtotalRow, 4, {
            t: 'n',
            f: `SUM(${colRecebidoLetter}${excelStart}:${colRecebidoLetter}${excelEnd})`,
            v: subgroup.totalRecebido,
            z: 'R$ #,##0.00',
            s: subSubtotalCurrencyStyle,
          });
          setCell(ws1, subSubtotalRow, 5, {
            t: 'n',
            f: `SUM(${colSaldoLetter}${excelStart}:${colSaldoLetter}${excelEnd})`,
            v: subgroup.totalSaldo,
            z: 'R$ #,##0.00',
            s: {
              ...subSubtotalCurrencyStyle,
              font: {
                name: 'Calibri',
                sz: 9.5,
                bold: true,
                color: {
                  rgb: subgroup.totalSaldo > 0.009 ? COLORS.rose700 : subSubtotalFg,
                },
              },
            },
          });
        } else {
          setCell(ws1, subSubtotalRow, 3, {
            t: 'n',
            v: 0,
            z: 'R$ #,##0.00',
            s: subSubtotalCurrencyStyle,
          });
          setCell(ws1, subSubtotalRow, 4, {
            t: 'n',
            v: 0,
            z: 'R$ #,##0.00',
            s: subSubtotalCurrencyStyle,
          });
          setCell(ws1, subSubtotalRow, 5, {
            t: 'n',
            v: 0,
            z: 'R$ #,##0.00',
            s: subSubtotalCurrencyStyle,
          });
        }
        setCell(ws1, subSubtotalRow, 6, { t: 's', v: '', s: subSubtotalEmptyStyle });
        setCell(ws1, subSubtotalRow, 7, { t: 's', v: '', s: subSubtotalEmptyStyle });

        unitSubgroupSubtotalExcelRows.push(subSubtotalRow + 1);
        rowHeights1.push({ hpt: 21 });
        cursorRow += 1;
      }

      const subtotalRow = cursorRow;
      applyMergedRange(
        ws1,
        merges1,
        subtotalRow,
        0,
        subtotalRow,
        2,
        `Subtotal Unidade — ${group.unidadeNome} (${group.rows.length} pedido(s))`,
        subtotalLabelStyle
      );

      if (unitSubgroupSubtotalExcelRows.length > 0) {
        setCell(ws1, subtotalRow, 3, {
          t: 'n',
          f: `SUM(${unitSubgroupSubtotalExcelRows.map(r => `${colValorLetter}${r}`).join(',')})`,
          v: group.totalValor,
          z: 'R$ #,##0.00',
          s: subtotalCurrencyStyle,
        });
        setCell(ws1, subtotalRow, 4, {
          t: 'n',
          f: `SUM(${unitSubgroupSubtotalExcelRows.map(r => `${colRecebidoLetter}${r}`).join(',')})`,
          v: group.totalRecebido,
          z: 'R$ #,##0.00',
          s: subtotalCurrencyStyle,
        });
        setCell(ws1, subtotalRow, 5, {
          t: 'n',
          f: `SUM(${unitSubgroupSubtotalExcelRows.map(r => `${colSaldoLetter}${r}`).join(',')})`,
          v: group.totalSaldo,
          z: 'R$ #,##0.00',
          s: {
            ...subtotalCurrencyStyle,
            font: {
              name: 'Calibri',
              sz: 10,
              bold: true,
              color: { rgb: group.totalSaldo > 0.009 ? COLORS.rose700 : COLORS.brand900 },
            },
          },
        });
      } else {
        setCell(ws1, subtotalRow, 3, { t: 'n', v: 0, z: 'R$ #,##0.00', s: subtotalCurrencyStyle });
        setCell(ws1, subtotalRow, 4, { t: 'n', v: 0, z: 'R$ #,##0.00', s: subtotalCurrencyStyle });
        setCell(ws1, subtotalRow, 5, { t: 'n', v: 0, z: 'R$ #,##0.00', s: subtotalCurrencyStyle });
      }
      setCell(ws1, subtotalRow, 6, { t: 's', v: '', s: subtotalEmptyStyle });
      setCell(ws1, subtotalRow, 7, { t: 's', v: '', s: subtotalEmptyStyle });

      subtotalExcelRows.push(subtotalRow + 1);
      rowHeights1.push({ hpt: 23 });
      cursorRow += 1;
    }
  }

  const grandTotalRow = cursorRow;
  applyMergedRange(
    ws1,
    merges1,
    grandTotalRow,
    0,
    grandTotalRow,
    2,
    `TOTAL GERAL (${data.totalOrders} pedido(s) • ${data.groups.length} unidade(s))`,
    grandTotalLabelStyle
  );

  if (subtotalExcelRows.length > 0) {
    setCell(ws1, grandTotalRow, 3, {
      t: 'n',
      f: `SUM(${subtotalExcelRows.map(r => `${colValorLetter}${r}`).join(',')})`,
      v: data.grandTotalValor,
      z: 'R$ #,##0.00',
      s: grandTotalCurrencyStyle,
    });
    setCell(ws1, grandTotalRow, 4, {
      t: 'n',
      f: `SUM(${subtotalExcelRows.map(r => `${colRecebidoLetter}${r}`).join(',')})`,
      v: data.grandTotalRecebido,
      z: 'R$ #,##0.00',
      s: grandTotalCurrencyStyle,
    });
    setCell(ws1, grandTotalRow, 5, {
      t: 'n',
      f: `SUM(${subtotalExcelRows.map(r => `${colSaldoLetter}${r}`).join(',')})`,
      v: data.grandTotalSaldo,
      z: 'R$ #,##0.00',
      s: grandTotalCurrencyStyle,
    });
  } else {
    setCell(ws1, grandTotalRow, 3, { t: 'n', v: 0, z: 'R$ #,##0.00', s: grandTotalCurrencyStyle });
    setCell(ws1, grandTotalRow, 4, { t: 'n', v: 0, z: 'R$ #,##0.00', s: grandTotalCurrencyStyle });
    setCell(ws1, grandTotalRow, 5, { t: 'n', v: 0, z: 'R$ #,##0.00', s: grandTotalCurrencyStyle });
  }
  setCell(ws1, grandTotalRow, 6, { t: 's', v: '', s: grandTotalEmptyStyle });
  setCell(ws1, grandTotalRow, 7, { t: 's', v: '', s: grandTotalEmptyStyle });
  rowHeights1.push({ hpt: 28 });

  ws1['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: grandTotalRow, c: maxColIdx },
  });
  ws1['!merges'] = merges1;
  ws1['!cols'] = [
    { wch: 16 },
    { wch: 24 },
    { wch: 30 },
    { wch: 16 },
    { wch: 17 },
    { wch: 17 },
    { wch: 22 },
    { wch: 15 },
  ];
  ws1['!rows'] = rowHeights1;
  ws1['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 };

  // Sheet 2: Resumo por Unidade
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
    'BEJU CARAMELOS — RESUMO DE FATURAMENTO POR UNIDADE',
    titleStyle
  );
  applyMergedRange(
    ws2,
    merges2,
    1,
    0,
    1,
    maxColIdx2,
    `${data.totalOrders} pedido(s) • ${data.groups.length} unidade(s) • Emitido em: ${data.generatedAtLabel}`,
    subtitleStyle
  );

  const summaryHeaders = [
    'Unidade',
    'Qtd. Pedidos',
    'Conciliados',
    'Não Conciliados',
    'Valor Total',
    'Valor Recebido',
    'Saldo a Receber',
  ];
  const summaryAligns: Array<'left' | 'center' | 'right'> = [
    'left',
    'center',
    'center',
    'center',
    'right',
    'right',
    'right',
  ];
  const sumHeaderRow = 3;
  summaryHeaders.forEach((h, colIdx) => {
    setCell(ws2, sumHeaderRow, colIdx, {
      t: 's',
      v: h,
      s: {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand700 } },
        alignment: { horizontal: summaryAligns[colIdx], vertical: 'center', wrapText: true },
        border: {
          top: { style: 'medium', color: { rgb: COLORS.brand900 } },
          bottom: { style: 'medium', color: { rgb: COLORS.brand900 } },
          left: { style: 'thin', color: { rgb: COLORS.brand800 } },
          right: { style: 'thin', color: { rgb: COLORS.brand800 } },
        },
      },
    });
  });

  const rowHeights2: Array<{ hpt: number }> = [
    { hpt: 28 },
    { hpt: 22 },
    { hpt: 8 },
    { hpt: 24 },
  ];

  const sumStartRow = sumHeaderRow + 1;
  if (data.groups.length === 0) {
    applyMergedRange(
      ws2,
      merges2,
      sumStartRow,
      0,
      sumStartRow,
      maxColIdx2,
      'Nenhuma unidade com pedidos no filtro selecionado.',
      {
        font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: COLORS.slate600 } },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: THIN_SLATE_BORDER,
      }
    );
    rowHeights2.push({ hpt: 22 });
  } else {
    data.groups.forEach((g, idx) => {
      const r = sumStartRow + idx;
      const rowBg = idx % 2 === 0 ? COLORS.white : COLORS.slate50;
      const hasOpen = g.totalSaldo > 0.009;
      const conciliadosCount = g.rows.filter(row => row.conciliado).length;
      const naoConciliadosCount = g.rows.length - conciliadosCount;

      setCell(ws2, r, 0, {
        t: 's',
        v: g.unidadeNome,
        s: {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws2, r, 1, {
        t: 'n',
        v: g.rows.length,
        z: '#,##0',
        s: {
          font: { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate700 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: '#,##0',
        },
      });
      setCell(ws2, r, 2, {
        t: 'n',
        v: conciliadosCount,
        z: '#,##0',
        s: {
          font: {
            name: 'Calibri',
            sz: 10,
            bold: conciliadosCount > 0,
            color: { rgb: conciliadosCount > 0 ? COLORS.brand700 : COLORS.slate600 },
          },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: '#,##0',
        },
      });
      setCell(ws2, r, 3, {
        t: 'n',
        v: naoConciliadosCount,
        z: '#,##0',
        s: {
          font: {
            name: 'Calibri',
            sz: 10,
            bold: naoConciliadosCount > 0,
            color: { rgb: naoConciliadosCount > 0 ? COLORS.amber800 : COLORS.slate600 },
          },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: '#,##0',
        },
      });
      setCell(ws2, r, 4, {
        t: 'n',
        v: g.totalValor,
        z: 'R$ #,##0.00',
        s: {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: 'R$ #,##0.00',
        },
      });
      setCell(ws2, r, 5, {
        t: 'n',
        v: g.totalRecebido,
        z: 'R$ #,##0.00',
        s: {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand700 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: 'R$ #,##0.00',
        },
      });
      setCell(ws2, r, 6, {
        t: 'n',
        v: g.totalSaldo,
        z: 'R$ #,##0.00',
        s: {
          font: {
            name: 'Calibri',
            sz: 10,
            bold: hasOpen,
            color: { rgb: hasOpen ? COLORS.rose700 : COLORS.brand700 },
          },
          fill: {
            patternType: 'solid',
            fgColor: { rgb: hasOpen ? COLORS.rose50 : rowBg },
          },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: 'R$ #,##0.00',
        },
      });
      rowHeights2.push({ hpt: 22 });
    });
  }

  const sumTotalRow =
    data.groups.length > 0 ? sumStartRow + data.groups.length : sumStartRow + 1;
  setCell(ws2, sumTotalRow, 0, { t: 's', v: 'TOTAL GERAL', s: grandTotalLabelStyle });

  const colSumQtyLetter = XLSX.utils.encode_col(1);
  const colSumConcLetter = XLSX.utils.encode_col(2);
  const colSumNaoConcLetter = XLSX.utils.encode_col(3);
  const colSumValLetter = XLSX.utils.encode_col(4);
  const colSumRecLetter = XLSX.utils.encode_col(5);
  const colSumSalLetter = XLSX.utils.encode_col(6);

  const totalConciliadosAll = data.groups.reduce(
    (sum, g) => sum + g.rows.filter(r => r.conciliado).length,
    0
  );
  const totalNaoConciliadosAll = data.totalOrders - totalConciliadosAll;

  const grandTotalCountStyle: CellStyle = {
    ...grandTotalCurrencyStyle,
    alignment: { horizontal: 'center', vertical: 'center' },
    numFmt: '#,##0',
  };

  if (data.groups.length > 0) {
    const excelStart2 = sumStartRow + 1;
    const excelEnd2 = sumStartRow + data.groups.length;
    setCell(ws2, sumTotalRow, 1, {
      t: 'n',
      f: `SUM(${colSumQtyLetter}${excelStart2}:${colSumQtyLetter}${excelEnd2})`,
      v: data.totalOrders,
      z: '#,##0',
      s: grandTotalCountStyle,
    });
    setCell(ws2, sumTotalRow, 2, {
      t: 'n',
      f: `SUM(${colSumConcLetter}${excelStart2}:${colSumConcLetter}${excelEnd2})`,
      v: totalConciliadosAll,
      z: '#,##0',
      s: grandTotalCountStyle,
    });
    setCell(ws2, sumTotalRow, 3, {
      t: 'n',
      f: `SUM(${colSumNaoConcLetter}${excelStart2}:${colSumNaoConcLetter}${excelEnd2})`,
      v: totalNaoConciliadosAll,
      z: '#,##0',
      s: grandTotalCountStyle,
    });
    setCell(ws2, sumTotalRow, 4, {
      t: 'n',
      f: `SUM(${colSumValLetter}${excelStart2}:${colSumValLetter}${excelEnd2})`,
      v: data.grandTotalValor,
      z: 'R$ #,##0.00',
      s: grandTotalCurrencyStyle,
    });
    setCell(ws2, sumTotalRow, 5, {
      t: 'n',
      f: `SUM(${colSumRecLetter}${excelStart2}:${colSumRecLetter}${excelEnd2})`,
      v: data.grandTotalRecebido,
      z: 'R$ #,##0.00',
      s: grandTotalCurrencyStyle,
    });
    setCell(ws2, sumTotalRow, 6, {
      t: 'n',
      f: `SUM(${colSumSalLetter}${excelStart2}:${colSumSalLetter}${excelEnd2})`,
      v: data.grandTotalSaldo,
      z: 'R$ #,##0.00',
      s: grandTotalCurrencyStyle,
    });
  } else {
    setCell(ws2, sumTotalRow, 1, { t: 'n', v: 0, z: '#,##0', s: grandTotalCountStyle });
    setCell(ws2, sumTotalRow, 2, { t: 'n', v: 0, z: '#,##0', s: grandTotalCountStyle });
    setCell(ws2, sumTotalRow, 3, { t: 'n', v: 0, z: '#,##0', s: grandTotalCountStyle });
    setCell(ws2, sumTotalRow, 4, { t: 'n', v: 0, z: 'R$ #,##0.00', s: grandTotalCurrencyStyle });
    setCell(ws2, sumTotalRow, 5, { t: 'n', v: 0, z: 'R$ #,##0.00', s: grandTotalCurrencyStyle });
    setCell(ws2, sumTotalRow, 6, { t: 'n', v: 0, z: 'R$ #,##0.00', s: grandTotalCurrencyStyle });
  }
  rowHeights2.push({ hpt: 26 });

  ws2['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: sumTotalRow, c: maxColIdx2 },
  });
  ws2['!merges'] = merges2;
  ws2['!cols'] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];
  ws2['!rows'] = rowHeights2;
  ws2['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 };

  XLSX.utils.book_append_sheet(wb, ws1, 'Relatorio_Faturamento');
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumo_Unidades');

  return { workbook: wb, sheet1: ws1, sheet2: ws2 };
}

export function exportFaturamentoStyledExcel(data: FaturamentoReportData): void {
  const { workbook } = buildFaturamentoWorkbook(data);
  const dateSuffix = toLocalDateInput() || new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `Beju_Caramelos_Relatorio_Faturamento_${dateSuffix}.xlsx`);
}
