import * as XLSXStyleMod from 'xlsx-js-style';
import type { CellObject, CellStyle, Range, WorkBook, WorkSheet } from 'xlsx-js-style';

const XLSX = (
  (XLSXStyleMod as unknown as { default?: typeof XLSXStyleMod }).default ?? XLSXStyleMod
) as typeof XLSXStyleMod;

export interface FinanceiroExcelRow {
  numeroPedido: string;
  dataEntrega: string;
  unidadeNome: string;
  clienteNome: string;
  statusPedido: string;
  valorTotal: number;
  conciliacaoStatus: string;
  meioPagamento: string;
  dataPagamento: string;
  dataExtrato: string;
  valorConciliado: number;
  saldoPendente: number;
  nfStatus: string;
  nfDataEmissao: string;
  nfObservacoes: string;
}

export interface FinanceiroExcelChannelRow {
  nome: string;
  count: number;
  amount: number;
}

export interface FinanceiroExcelParams {
  unitLabel: string;
  filterLabel: string;
  dateFilterLabel: string;
  generatedAtLabel: string;
  rows: FinanceiroExcelRow[];
  channelsSummary: FinanceiroExcelChannelRow[];
}

export interface FinanceiroExcelBuildResult {
  workbook: WorkBook;
  sheet1: WorkSheet;
  sheet2: WorkSheet;
}

const COLORS = {
  white: 'FFFFFF',
  slate50: 'F8FAFC',
  slate100: 'F1F5F9',
  slate200: 'E2E8F0',
  slate300: 'CBD5E1',
  slate600: '475569',
  slate700: '334155',
  slate900: '0F172A',
  brand50: 'ECFDF5',
  brand100: 'D1FAE5',
  brand200: 'A7F3D0',
  brand700: '047857',
  brand900: '004F35',
  blue50: 'EFF6FF',
  blue200: 'BFDBFE',
  blue900: '1E3A8A',
  amber50: 'FFFBEB',
  amber800: '92400E',
  sky50: 'F0F9FF',
  sky800: '075985',
  rose50: 'FFF1F2',
  rose800: '9F1239',
} as const;

const THIN_SLATE_BORDER = {
  top: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
  bottom: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.slate300 } },
};

const TOTAL_BORDER = {
  top: { style: 'medium' as const, color: { rgb: COLORS.brand700 } },
  bottom: { style: 'medium' as const, color: { rgb: COLORS.brand700 } },
  left: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
  right: { style: 'thin' as const, color: { rgb: COLORS.brand200 } },
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

function getReconciliationBadgeStyle(statusLabel: string, baseBg: string): CellStyle {
  const lower = statusLabel.toLowerCase();
  let fg: string = COLORS.slate700;
  let bg: string = baseBg;
  if (lower.includes('conciliado')) {
    bg = COLORS.brand50;
    fg = COLORS.brand700;
  } else if (lower.includes('parcial')) {
    bg = COLORS.sky50;
    fg = COLORS.sky800;
  } else if (lower.includes('pendente')) {
    bg = COLORS.amber50;
    fg = COLORS.amber800;
  }
  return {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: fg } },
    fill: { patternType: 'solid', fgColor: { rgb: bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: THIN_SLATE_BORDER,
  };
}

function getInvoiceBadgeStyle(nfLabel: string, baseBg: string): CellStyle {
  const lower = nfLabel.toLowerCase();
  let fg: string = COLORS.slate700;
  let bg: string = baseBg;
  if (lower.includes('emitida')) {
    bg = COLORS.brand50;
    fg = COLORS.brand700;
  } else if (lower.includes('pendente') || lower.includes('emitir')) {
    bg = COLORS.rose50;
    fg = COLORS.rose800;
  } else if (lower.includes('dispensada')) {
    bg = COLORS.slate100;
    fg = COLORS.slate600;
  }
  return {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: fg } },
    fill: { patternType: 'solid', fgColor: { rgb: bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: THIN_SLATE_BORDER,
  };
}

export function buildFinanceiroWorkbook(
  params: FinanceiroExcelParams
): FinanceiroExcelBuildResult {
  const wb: WorkBook = XLSX.utils.book_new();
  const ws1: WorkSheet = {};
  const merges1: Range[] = [];

  const maxColIdx = 14;
  const titleStyle: CellStyle = {
    font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: COLORS.white } },
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
    'BEJU CARAMELOS — RELATÓRIO FINANCEIRO (CONCILIAÇÃO BANCÁRIA & NF)',
    titleStyle
  );
  applyMergedRange(
    ws1,
    merges1,
    1,
    0,
    1,
    maxColIdx,
    `Unidade: ${params.unitLabel}   |   Situação: ${params.filterLabel}   |   Período: ${params.dateFilterLabel}   |   Emitido em: ${params.generatedAtLabel}`,
    subtitleStyle
  );

  const headers = [
    'Pedido',
    'Data Entrega',
    'Unidade',
    'Cliente',
    'Status Pedido',
    'Valor Pedido (R$)',
    'Conciliação',
    'Meio de Pagamento',
    'Data Pagamento',
    'Data Extrato',
    'Valor Conciliado (R$)',
    'Saldo Pendente (R$)',
    'Situação NF',
    'Data Emissão NF',
    'Obs. Fiscal',
  ];

  const headerStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate700 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.slate100 } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: THIN_SLATE_BORDER,
  };

  const headerRow = 3;
  headers.forEach((h, colIdx) => {
    setCell(ws1, headerRow, colIdx, {
      t: 's',
      v: h,
      s: headerStyle,
    });
  });

  const dataStartRow = 4;
  let totalPedidoSum = 0;
  let totalConciliadoSum = 0;
  let totalSaldoSum = 0;

  if (params.rows.length === 0) {
    applyMergedRange(
      ws1,
      merges1,
      dataStartRow,
      0,
      dataStartRow,
      maxColIdx,
      'Nenhum pedido encontrado para os filtros aplicados.',
      {
        font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: COLORS.slate600 } },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: THIN_SLATE_BORDER,
      }
    );
  } else {
    params.rows.forEach((row, idx) => {
      const r = dataStartRow + idx;
      const rowBg = idx % 2 === 0 ? COLORS.white : COLORS.slate50;
      const textLeft: CellStyle = {
        font: { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate900 } },
        fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: THIN_SLATE_BORDER,
      };
      const textCenter: CellStyle = {
        font: { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate700 } },
        fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: THIN_SLATE_BORDER,
      };
      const currencyStyle: CellStyle = {
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } },
        fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: THIN_SLATE_BORDER,
        numFmt: 'R$ #,##0.00',
      };

      const vTotal = Number(row.valorTotal) || 0;
      const vConc = Number(row.valorConciliado) || 0;
      const vSaldo = Number(row.saldoPendente) || 0;
      totalPedidoSum += vTotal;
      totalConciliadoSum += vConc;
      totalSaldoSum += vSaldo;

      setCell(ws1, r, 0, {
        t: 's',
        v: row.numeroPedido,
        s: { ...textCenter, font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } } },
      });
      setCell(ws1, r, 1, { t: 's', v: row.dataEntrega, s: textCenter });
      setCell(ws1, r, 2, { t: 's', v: row.unidadeNome, s: textLeft });
      setCell(ws1, r, 3, { t: 's', v: row.clienteNome, s: textLeft });
      setCell(ws1, r, 4, { t: 's', v: row.statusPedido, s: textCenter });
      setCell(ws1, r, 5, { t: 'n', v: vTotal, z: 'R$ #,##0.00', s: currencyStyle });
      setCell(ws1, r, 6, {
        t: 's',
        v: row.conciliacaoStatus,
        s: getReconciliationBadgeStyle(row.conciliacaoStatus, rowBg),
      });
      setCell(ws1, r, 7, { t: 's', v: row.meioPagamento || '—', s: textCenter });
      setCell(ws1, r, 8, { t: 's', v: row.dataPagamento || '—', s: textCenter });
      setCell(ws1, r, 9, { t: 's', v: row.dataExtrato || '—', s: textCenter });
      setCell(ws1, r, 10, { t: 'n', v: vConc, z: 'R$ #,##0.00', s: currencyStyle });
      setCell(ws1, r, 11, { t: 'n', v: vSaldo, z: 'R$ #,##0.00', s: currencyStyle });
      setCell(ws1, r, 12, {
        t: 's',
        v: row.nfStatus,
        s: getInvoiceBadgeStyle(row.nfStatus, rowBg),
      });
      setCell(ws1, r, 13, { t: 's', v: row.nfDataEmissao || '—', s: textCenter });
      setCell(ws1, r, 14, { t: 's', v: row.nfObservacoes || '', s: textLeft });
    });
  }

  const totalRow = params.rows.length > 0 ? dataStartRow + params.rows.length : dataStartRow + 1;
  const totalLabelStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand50 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: TOTAL_BORDER,
  };
  const totalEmptyStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand50 } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: TOTAL_BORDER,
  };
  const totalCurrencyStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand900 } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand100 } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: TOTAL_BORDER,
    numFmt: 'R$ #,##0.00',
  };

  applyMergedRange(
    ws1,
    merges1,
    totalRow,
    0,
    totalRow,
    4,
    `TOTAL GERAL (${params.rows.length} pedido(s))`,
    totalLabelStyle
  );

  for (let c = 6; c <= 14; c += 1) {
    if (c === 10 || c === 11) continue;
    setCell(ws1, totalRow, c, { t: 's', v: '', s: totalEmptyStyle });
  }

  const excelStartRow = dataStartRow + 1; // 1-based Excel row 5
  const excelEndRow = dataStartRow + params.rows.length;

  const colValorTotalLetter = XLSX.utils.encode_col(5);
  const colConciliadoLetter = XLSX.utils.encode_col(10);
  const colSaldoLetter = XLSX.utils.encode_col(11);

  if (params.rows.length > 0) {
    setCell(ws1, totalRow, 5, {
      t: 'n',
      f: `SUM(${colValorTotalLetter}${excelStartRow}:${colValorTotalLetter}${excelEndRow})`,
      v: Number(totalPedidoSum.toFixed(2)),
      z: 'R$ #,##0.00',
      s: totalCurrencyStyle,
    });
    setCell(ws1, totalRow, 10, {
      t: 'n',
      f: `SUM(${colConciliadoLetter}${excelStartRow}:${colConciliadoLetter}${excelEndRow})`,
      v: Number(totalConciliadoSum.toFixed(2)),
      z: 'R$ #,##0.00',
      s: totalCurrencyStyle,
    });
    setCell(ws1, totalRow, 11, {
      t: 'n',
      f: `SUM(${colSaldoLetter}${excelStartRow}:${colSaldoLetter}${excelEndRow})`,
      v: Number(totalSaldoSum.toFixed(2)),
      z: 'R$ #,##0.00',
      s: totalCurrencyStyle,
    });
  } else {
    setCell(ws1, totalRow, 5, { t: 'n', v: 0, z: 'R$ #,##0.00', s: totalCurrencyStyle });
    setCell(ws1, totalRow, 10, { t: 'n', v: 0, z: 'R$ #,##0.00', s: totalCurrencyStyle });
    setCell(ws1, totalRow, 11, { t: 'n', v: 0, z: 'R$ #,##0.00', s: totalCurrencyStyle });
  }

  ws1['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: totalRow, c: maxColIdx },
  });
  ws1['!merges'] = merges1;
  ws1['!cols'] = [
    { wch: 18 },
    { wch: 15 },
    { wch: 22 },
    { wch: 26 },
    { wch: 15 },
    { wch: 16 },
    { wch: 15 },
    { wch: 18 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 15 },
    { wch: 30 },
  ];
  ws1['!rows'] = [
    { hpt: 28 },
    { hpt: 22 },
    { hpt: 10 },
    { hpt: 24 },
    ...Array.from({ length: Math.max(1, params.rows.length) }, () => ({ hpt: 22 })),
    { hpt: 24 },
  ];
  ws1['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 };

  // Sheet 2: Resumo por Meio de Pagamento
  const ws2: WorkSheet = {};
  const merges2: Range[] = [];
  applyMergedRange(
    ws2,
    merges2,
    0,
    0,
    0,
    2,
    'RESUMO CONCILIADO POR MEIO DE PAGAMENTO',
    titleStyle
  );

  ['Meio de Pagamento', 'Qtd. Pedidos', 'Valor Conciliado (R$)'].forEach((h, cIdx) => {
    setCell(ws2, 1, cIdx, { t: 's', v: h, s: headerStyle });
  });

  const chStartRow = 2;
  let chCountSum = 0;
  let chAmountSum = 0;

  if (params.channelsSummary.length === 0) {
    applyMergedRange(
      ws2,
      merges2,
      chStartRow,
      0,
      chStartRow,
      2,
      'Nenhum valor conciliado registrado.',
      {
        font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: COLORS.slate600 } },
        fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: THIN_SLATE_BORDER,
      }
    );
  } else {
    params.channelsSummary.forEach((ch, idx) => {
      const r = chStartRow + idx;
      const rowBg = idx % 2 === 0 ? COLORS.white : COLORS.slate50;
      const qty = Number(ch.count) || 0;
      const amt = Number(ch.amount) || 0;
      chCountSum += qty;
      chAmountSum += amt;

      setCell(ws2, r, 0, {
        t: 's',
        v: ch.nome,
        s: {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws2, r, 1, {
        t: 'n',
        v: qty,
        z: '#,##0',
        s: {
          font: { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: '#,##0',
        },
      });
      setCell(ws2, r, 2, {
        t: 'n',
        v: amt,
        z: 'R$ #,##0.00',
        s: {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: 'R$ #,##0.00',
        },
      });
    });
  }

  const chTotalRow =
    params.channelsSummary.length > 0 ? chStartRow + params.channelsSummary.length : chStartRow + 1;

  setCell(ws2, chTotalRow, 0, { t: 's', v: 'TOTAL', s: totalLabelStyle });
  const colChCountLetter = XLSX.utils.encode_col(1);
  const colChAmtLetter = XLSX.utils.encode_col(2);

  if (params.channelsSummary.length > 0) {
    const chExcelStart = chStartRow + 1;
    const chExcelEnd = chStartRow + params.channelsSummary.length;
    setCell(ws2, chTotalRow, 1, {
      t: 'n',
      f: `SUM(${colChCountLetter}${chExcelStart}:${colChCountLetter}${chExcelEnd})`,
      v: chCountSum,
      z: '#,##0',
      s: {
        ...totalCurrencyStyle,
        alignment: { horizontal: 'center', vertical: 'center' },
        numFmt: '#,##0',
      },
    });
    setCell(ws2, chTotalRow, 2, {
      t: 'n',
      f: `SUM(${colChAmtLetter}${chExcelStart}:${colChAmtLetter}${chExcelEnd})`,
      v: Number(chAmountSum.toFixed(2)),
      z: 'R$ #,##0.00',
      s: totalCurrencyStyle,
    });
  } else {
    setCell(ws2, chTotalRow, 1, {
      t: 'n',
      v: 0,
      z: '#,##0',
      s: {
        ...totalCurrencyStyle,
        alignment: { horizontal: 'center', vertical: 'center' },
        numFmt: '#,##0',
      },
    });
    setCell(ws2, chTotalRow, 2, { t: 'n', v: 0, z: 'R$ #,##0.00', s: totalCurrencyStyle });
  }

  ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: chTotalRow, c: 2 } });
  ws2['!merges'] = merges2;
  ws2['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 22 }];
  ws2['!rows'] = [
    { hpt: 26 },
    { hpt: 22 },
    ...Array.from({ length: Math.max(1, params.channelsSummary.length) }, () => ({ hpt: 20 })),
    { hpt: 24 },
  ];
  ws2['!margins'] = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 };

  XLSX.utils.book_append_sheet(wb, ws1, 'Conciliacao_NF');
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumo_Meios');

  return { workbook: wb, sheet1: ws1, sheet2: ws2 };
}

export function exportFinanceiroStyledExcel(params: FinanceiroExcelParams): void {
  const { workbook } = buildFinanceiroWorkbook(params);
  XLSX.writeFile(
    workbook,
    `Beju_Caramelos_Financeiro_NF_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
