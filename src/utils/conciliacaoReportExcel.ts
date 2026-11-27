import * as XLSXStyleMod from 'xlsx-js-style';
import type { CellObject, CellStyle, Range, WorkBook, WorkSheet } from 'xlsx-js-style';
import {
  BankStatementEntry,
  Order,
  OrderFinancialRecord,
  ReconciliationPeriodLock,
} from '../types';
import {
  formatDateBR,
  getEffectiveInvoiceStatus,
} from './financialReconciliation';

const XLSX = (
  (XLSXStyleMod as unknown as { default?: typeof XLSXStyleMod }).default ?? XLSXStyleMod
) as typeof XLSXStyleMod;

export interface ConciliacaoChannelSummaryRow {
  channel: string;
  count: number;
  gross: number;
  fee: number;
  net: number;
  conciliated: number;
  pending: number;
  ignoredCount: number;
}

export interface ConciliacaoPairRow {
  statement: BankStatementEntry;
  linkedOrders: Order[];
  pedidosTxt: string;
  clientesTxt: string;
  nfStatusLabel: string;
  nfTone: 'emerald' | 'rose' | 'slate';
  auditTxt: string;
}

export interface ConciliacaoPendingItem {
  tipo: 'Extrato Pendente' | 'Pedido s/ Extrato';
  data: string;
  canal: string;
  identificacao: string;
  detalhe: string;
  valorAberto: number;
}

export interface ConciliacaoReportModel {
  competencia: string;
  competenciaLabel: string;
  periodLock?: ReconciliationPeriodLock;
  generatedAtLabel: string;
  channelRows: ConciliacaoChannelSummaryRow[];
  conciliatedRows: ConciliacaoPairRow[];
  pendingItems: ConciliacaoPendingItem[];
  totals: {
    count: number;
    gross: number;
    fee: number;
    net: number;
    conciliated: number;
    pending: number;
    openItemsSum: number;
  };
}

export function formatCompetenciaLabel(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) return competencia;
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const idx = Math.max(0, Math.min(11, Number(m[2]) - 1));
  return `${months[idx]}/${m[1]}`;
}

export function buildConciliacaoReportModel(params: {
  competencia: string;
  statements: BankStatementEntry[];
  orders: Order[];
  financialRecords: OrderFinancialRecord[];
  periodLock?: ReconciliationPeriodLock;
  channelNames: string[];
}): ConciliacaoReportModel {
  const { competencia, statements, orders, financialRecords, periodLock, channelNames } = params;
  const recordByOrderId = new Map(financialRecords.map(r => [r.pedidoId, r]));
  const compStatements = statements.filter(s => s.competencia === competencia);

  const uniqueChannels = Array.from(
    new Set([
      ...channelNames,
      ...compStatements.map(s => s.canalNome).filter(Boolean),
    ])
  );

  const channelRows: ConciliacaoChannelSummaryRow[] = uniqueChannels.map(ch => {
    const list = compStatements.filter(s => s.canalNome === ch);
    const active = list.filter(s => s.status !== 'IGNORADO');
    const conc = list.filter(s => s.status === 'CONCILIADO');
    const pend = list.filter(s => s.status === 'PENDENTE' || s.status === 'PARCIAL');
    const ign = list.filter(s => s.status === 'IGNORADO');
    return {
      channel: ch,
      count: active.length,
      gross: Number(active.reduce((a, s) => a + s.valorBruto, 0).toFixed(2)),
      fee: Number(active.reduce((a, s) => a + s.valorTaxa, 0).toFixed(2)),
      net: Number(active.reduce((a, s) => a + s.valorLiquido, 0).toFixed(2)),
      conciliated: Number(conc.reduce((a, s) => a + s.valorBruto, 0).toFixed(2)),
      pending: Number(pend.reduce((a, s) => a + s.valorBruto, 0).toFixed(2)),
      ignoredCount: ign.length,
    };
  });

  const conciliatedRows: ConciliacaoPairRow[] = compStatements
    .filter(s => s.status === 'CONCILIADO')
    .map(s => {
      const linkedOrders = orders.filter(o => s.linkedOrderIds.includes(o.id));
      const pedidosTxt = linkedOrders.map(o => o.numeroPedido).join(', ') || '—';
      const clientesTxt = linkedOrders.map(o => o.clienteNome).join(', ') || '—';

      let nfStatusLabel = 'A emitir';
      let nfTone: 'emerald' | 'rose' | 'slate' = 'rose';
      for (const ord of linkedOrders) {
        const rec = recordByOrderId.get(ord.id);
        const eff = getEffectiveInvoiceStatus(rec);
        if (eff === 'EMITIDA') {
          nfStatusLabel = rec?.nfDataEmissao ? `Emitida (${formatDateBR(rec.nfDataEmissao)})` : 'Emitida';
          nfTone = 'emerald';
          break;
        }
        if (eff === 'DISPENSADA') {
          nfStatusLabel = 'Dispensada';
          nfTone = 'slate';
        }
      }

      const auditTxt = s.conciliadoPor
        ? `${s.conciliadoPor}${s.conciliadoEm ? ` • ${new Date(s.conciliadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}`
        : '—';

      return {
        statement: s,
        linkedOrders,
        pedidosTxt,
        clientesTxt,
        nfStatusLabel,
        nfTone,
        auditTxt,
      };
    });

  const pendingStatements = compStatements.filter(
    s => s.status === 'PENDENTE' || s.status === 'PARCIAL'
  );
  const openOrders = orders.filter(o => {
    if (o.status === 'CANCELADO') return false;
    const pedMonth = (o.dataPedido || '').slice(0, 7);
    const delMonth = (o.dataHoraEntrega || '').slice(0, 7);
    if (pedMonth !== competencia && delMonth !== competencia) return false;
    const rec = recordByOrderId.get(o.id);
    const conc = Math.max(0, Number(rec?.valorConciliado) || 0);
    return conc < o.valorTotal - 0.01;
  });

  const pendingItems: ConciliacaoPendingItem[] = [
    ...pendingStatements.map(s => ({
      tipo: 'Extrato Pendente' as const,
      data: formatDateBR(s.dataExtrato),
      canal: s.canalNome,
      identificacao: s.pagadorNome,
      detalhe: s.descricao,
      valorAberto: s.valorBruto,
    })),
    ...openOrders.map(o => {
      const rec = recordByOrderId.get(o.id);
      const owed = Math.max(0, Number((o.valorTotal - (Number(rec?.valorConciliado) || 0)).toFixed(2)));
      return {
        tipo: 'Pedido s/ Extrato' as const,
        data: formatDateBR(o.dataPedido),
        canal: o.formaPagamento.toUpperCase(),
        identificacao: `${o.numeroPedido} • ${o.clienteNome}`,
        detalhe: `${o.status} • Pagto: ${o.statusPagamento || 'PENDENTE'}`,
        valorAberto: owed,
      };
    }),
  ];

  const now = new Date();
  const generatedAtLabel = now.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    competencia,
    competenciaLabel: formatCompetenciaLabel(competencia),
    periodLock,
    generatedAtLabel,
    channelRows,
    conciliatedRows,
    pendingItems,
    totals: {
      count: channelRows.reduce((a, r) => a + r.count, 0),
      gross: Number(channelRows.reduce((a, r) => a + r.gross, 0).toFixed(2)),
      fee: Number(channelRows.reduce((a, r) => a + r.fee, 0).toFixed(2)),
      net: Number(channelRows.reduce((a, r) => a + r.net, 0).toFixed(2)),
      conciliated: Number(channelRows.reduce((a, r) => a + r.conciliated, 0).toFixed(2)),
      pending: Number(channelRows.reduce((a, r) => a + r.pending, 0).toFixed(2)),
      openItemsSum: Number(pendingItems.reduce((a, p) => a + p.valorAberto, 0).toFixed(2)),
    },
  };
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
  brand700: '047857',
  brand800: '065F46',
  brand900: '004F35',
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
  merges.push({ s: { r: startRow, c: startCol }, e: { r: endRow, c: endCol } });
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

function patchLandscapeXml(xml: string): string {
  let patched = xml;
  if (patched.includes('<sheetPr')) {
    if (/<sheetPr[^>]*\/>/.test(patched)) {
      patched = patched.replace(/<sheetPr([^>]*)\/>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/></sheetPr>');
    } else if (!patched.includes('<pageSetUpPr')) {
      patched = patched.replace(/<sheetPr([^>]*)>/, '<sheetPr$1><pageSetUpPr fitToPage="1"/>');
    }
  } else {
    patched = patched.replace('<dimension ', '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ');
  }
  const pageSetupTag = '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
  if (/<pageSetup\b[^>]*\/>/.test(patched)) {
    patched = patched.replace(/<pageSetup\b[^>]*\/>/, pageSetupTag);
  } else if (/<pageMargins\b[^>]*\/>/.test(patched)) {
    patched = patched.replace(/(<pageMargins\b[^>]*\/>)/, `$1${pageSetupTag}`);
  } else {
    patched = patched.replace('</worksheet>', `${pageSetupTag}</worksheet>`);
  }
  return patched;
}

export function buildConciliacaoReportWorkbook(model: ConciliacaoReportModel): WorkBook {
  const wb: WorkBook = XLSX.utils.book_new();
  const lockInfo =
    model.periodLock?.status === 'FECHADO'
      ? `FECHADO (${model.periodLock.fechadoPor || 'ADMIN'})`
      : 'ABERTO';
  const metaText = `Competência: ${model.competenciaLabel}   •   Situação: ${lockInfo}   •   Emitido em: ${model.generatedAtLabel}`;

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
  const headerStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand700 } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: HEADER_BORDER,
  };
  const grandTotalLabelStyle: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
  };

  // Sheet 1: Resumo_Canais
  const ws1: WorkSheet = {};
  const m1: Range[] = [];
  const s1Cols = [
    { label: 'Canal', w: 16 },
    { label: 'Créditos', w: 12 },
    { label: 'Valor Bruto', w: 16 },
    { label: 'Taxa MDR', w: 15 },
    { label: 'Valor Líquido', w: 16 },
    { label: 'Conciliado', w: 16 },
    { label: 'A Conciliar', w: 16 },
  ];
  applyMergedRange(ws1, m1, 0, 0, 0, s1Cols.length - 1, 'Beju Caramelos — Resumo da Conciliação por Canal', titleStyle);
  applyMergedRange(ws1, m1, 1, 0, 1, s1Cols.length - 1, metaText, metaStyle);
  s1Cols.forEach((c, idx) => setCell(ws1, 3, idx, { t: 's', v: c.label, s: headerStyle }));
  const rh1: Array<{ hpt: number }> = [{ hpt: 28 }, { hpt: 24 }, { hpt: 6 }, { hpt: 25 }];

  let cur1 = 4;
  const hasS1 = model.channelRows.length > 0;
  if (!hasS1) {
    applyMergedRange(ws1, m1, cur1, 0, cur1, s1Cols.length - 1, 'Nenhum canal encontrado neste período.', {
      font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: COLORS.slate600 } },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: THIN_SLATE_BORDER,
    });
    rh1.push({ hpt: 24 });
    cur1 += 1;
  } else {
    model.channelRows.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? COLORS.white : COLORS.slate50;
      const numCell = (val: number): CellObject => ({
        t: 'n',
        v: val,
        z: CURRENCY_NUM_FMT,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: CURRENCY_NUM_FMT,
        },
      });
      setCell(ws1, cur1, 0, {
        t: 's',
        v: r.channel,
        s: {
          font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws1, cur1, 1, {
        t: 'n',
        v: r.count,
        z: NUMBER_NUM_FMT,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: NUMBER_NUM_FMT,
        },
      });
      setCell(ws1, cur1, 2, numCell(r.gross));
      setCell(ws1, cur1, 3, numCell(r.fee));
      setCell(ws1, cur1, 4, numCell(r.net));
      setCell(ws1, cur1, 5, numCell(r.conciliated));
      setCell(ws1, cur1, 6, numCell(r.pending));
      rh1.push({ hpt: 21 });
      cur1 += 1;
    });
  }

  const s1EndExcel = cur1;
  setCell(ws1, cur1, 0, { t: 's', v: 'TOTAL GERAL', s: grandTotalLabelStyle });
  const s1Totals = [
    { val: model.totals.count, fmt: NUMBER_NUM_FMT, align: 'center' as const },
    { val: model.totals.gross, fmt: CURRENCY_NUM_FMT, align: 'right' as const },
    { val: model.totals.fee, fmt: CURRENCY_NUM_FMT, align: 'right' as const },
    { val: model.totals.net, fmt: CURRENCY_NUM_FMT, align: 'right' as const },
    { val: model.totals.conciliated, fmt: CURRENCY_NUM_FMT, align: 'right' as const },
    { val: model.totals.pending, fmt: CURRENCY_NUM_FMT, align: 'right' as const },
  ];
  s1Totals.forEach((tot, i) => {
    const colIdx = 1 + i;
    const colLetter = XLSX.utils.encode_col(colIdx);
    const cellStyle: CellStyle = {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
      alignment: { horizontal: tot.align, vertical: 'center' },
      border: GRAND_TOTAL_BORDER,
      numFmt: tot.fmt,
    };
    setCell(ws1, cur1, colIdx, hasS1
      ? { t: 'n', f: `SUM(${colLetter}5:${colLetter}${s1EndExcel})`, v: tot.val, z: tot.fmt, s: cellStyle }
      : { t: 'n', v: 0, z: tot.fmt, s: cellStyle });
  });
  rh1.push({ hpt: 24 });
  ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cur1, c: s1Cols.length - 1 } });
  ws1['!merges'] = m1;
  ws1['!cols'] = s1Cols.map(c => ({ wch: c.w }));
  ws1['!rows'] = rh1;
  ws1['!margins'] = { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumo_Canais');

  // Sheet 2: Conciliados
  const ws2: WorkSheet = {};
  const m2: Range[] = [];
  const s2Cols = [
    { label: 'Data Extrato', w: 13 },
    { label: 'Canal', w: 11 },
    { label: 'Pagador', w: 28 },
    { label: 'Pedido(s)', w: 19 },
    { label: 'Cliente(s)', w: 24 },
    { label: 'Valor Bruto', w: 15 },
    { label: 'Taxa MDR', w: 14 },
    { label: 'Valor Líquido', w: 15 },
    { label: 'Nota Fiscal', w: 20 },
    { label: 'Auditoria', w: 26 },
  ];
  applyMergedRange(ws2, m2, 0, 0, 0, s2Cols.length - 1, 'Beju Caramelos — Lançamentos Conciliados & Auditoria', titleStyle);
  applyMergedRange(ws2, m2, 1, 0, 1, s2Cols.length - 1, metaText, metaStyle);
  s2Cols.forEach((c, idx) => setCell(ws2, 3, idx, { t: 's', v: c.label, s: headerStyle }));
  const rh2: Array<{ hpt: number }> = [{ hpt: 28 }, { hpt: 24 }, { hpt: 6 }, { hpt: 25 }];

  let cur2 = 4;
  const hasS2 = model.conciliatedRows.length > 0;
  if (!hasS2) {
    applyMergedRange(ws2, m2, cur2, 0, cur2, s2Cols.length - 1, 'Nenhum lançamento conciliado neste período.', {
      font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: COLORS.slate600 } },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: THIN_SLATE_BORDER,
    });
    rh2.push({ hpt: 24 });
    cur2 += 1;
  } else {
    model.conciliatedRows.forEach((row, idx) => {
      const bg = idx % 2 === 0 ? COLORS.white : COLORS.slate50;
      const textCell = (val: string, align: 'left' | 'center', bold = false): CellObject => ({
        t: 's',
        v: val,
        s: {
          font: { name: 'Calibri', sz: 9.5, bold, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: align, vertical: 'center', wrapText: true },
          border: THIN_SLATE_BORDER,
        },
      });
      const numCell = (val: number): CellObject => ({
        t: 'n',
        v: val,
        z: CURRENCY_NUM_FMT,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: CURRENCY_NUM_FMT,
        },
      });
      setCell(ws2, cur2, 0, textCell(formatDateBR(row.statement.dataExtrato), 'center'));
      setCell(ws2, cur2, 1, textCell(row.statement.canalNome, 'center'));
      setCell(ws2, cur2, 2, textCell(row.statement.pagadorNome, 'left', true));
      setCell(ws2, cur2, 3, textCell(row.pedidosTxt, 'left'));
      setCell(ws2, cur2, 4, textCell(row.clientesTxt, 'left'));
      setCell(ws2, cur2, 5, numCell(row.statement.valorBruto));
      setCell(ws2, cur2, 6, numCell(row.statement.valorTaxa));
      setCell(ws2, cur2, 7, numCell(row.statement.valorLiquido));
      setCell(ws2, cur2, 8, {
        t: 's',
        v: row.nfStatusLabel,
        s: {
          font: {
            name: 'Calibri',
            sz: 9.5,
            bold: true,
            color: { rgb: row.nfTone === 'emerald' ? COLORS.brand800 : row.nfTone === 'rose' ? COLORS.rose700 : COLORS.slate700 },
          },
          fill: {
            patternType: 'solid',
            fgColor: { rgb: row.nfTone === 'emerald' ? COLORS.brand50 : row.nfTone === 'rose' ? COLORS.rose50 : COLORS.slate100 },
          },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws2, cur2, 9, textCell(row.auditTxt, 'left'));
      rh2.push({ hpt: 22 });
      cur2 += 1;
    });
  }

  const s2EndExcel = cur2;
  applyMergedRange(ws2, m2, cur2, 0, cur2, 4, `TOTAL CONCILIADO (${model.conciliatedRows.length})`, grandTotalLabelStyle);
  const cGross = Number(model.conciliatedRows.reduce((a, r) => a + r.statement.valorBruto, 0).toFixed(2));
  const cFee = Number(model.conciliatedRows.reduce((a, r) => a + r.statement.valorTaxa, 0).toFixed(2));
  const cNet = Number(model.conciliatedRows.reduce((a, r) => a + r.statement.valorLiquido, 0).toFixed(2));
  [
    { col: 5, val: cGross },
    { col: 6, val: cFee },
    { col: 7, val: cNet },
  ].forEach(item => {
    const colLetter = XLSX.utils.encode_col(item.col);
    const cellStyle: CellStyle = {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: GRAND_TOTAL_BORDER,
      numFmt: CURRENCY_NUM_FMT,
    };
    setCell(ws2, cur2, item.col, hasS2
      ? { t: 'n', f: `SUM(${colLetter}5:${colLetter}${s2EndExcel})`, v: item.val, z: CURRENCY_NUM_FMT, s: cellStyle }
      : { t: 'n', v: 0, z: CURRENCY_NUM_FMT, s: cellStyle });
  });
  setCell(ws2, cur2, 8, { t: 's', v: '', s: grandTotalLabelStyle });
  setCell(ws2, cur2, 9, { t: 's', v: '', s: grandTotalLabelStyle });
  rh2.push({ hpt: 24 });
  ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cur2, c: s2Cols.length - 1 } });
  ws2['!merges'] = m2;
  ws2['!cols'] = s2Cols.map(c => ({ wch: c.w }));
  ws2['!rows'] = rh2;
  ws2['!margins'] = { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  XLSX.utils.book_append_sheet(wb, ws2, 'Conciliados');

  // Sheet 3: Pendencias
  const ws3: WorkSheet = {};
  const m3: Range[] = [];
  const s3Cols = [
    { label: 'Tipo', w: 18 },
    { label: 'Data', w: 13 },
    { label: 'Canal / Meio', w: 14 },
    { label: 'Identificação / Pagador', w: 30 },
    { label: 'Detalhe / Situação', w: 28 },
    { label: 'Valor em Aberto', w: 16 },
  ];
  applyMergedRange(ws3, m3, 0, 0, 0, s3Cols.length - 1, 'Beju Caramelos — Pendências para Conferência', titleStyle);
  applyMergedRange(ws3, m3, 1, 0, 1, s3Cols.length - 1, metaText, metaStyle);
  s3Cols.forEach((c, idx) => setCell(ws3, 3, idx, { t: 's', v: c.label, s: headerStyle }));
  const rh3: Array<{ hpt: number }> = [{ hpt: 28 }, { hpt: 24 }, { hpt: 6 }, { hpt: 25 }];

  let cur3 = 4;
  const hasS3 = model.pendingItems.length > 0;
  if (!hasS3) {
    applyMergedRange(ws3, m3, cur3, 0, cur3, s3Cols.length - 1, 'Nenhuma pendência neste período!', {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.brand800 } },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand50 } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: THIN_SLATE_BORDER,
    });
    rh3.push({ hpt: 24 });
    cur3 += 1;
  } else {
    model.pendingItems.forEach((p, idx) => {
      const bg = idx % 2 === 0 ? COLORS.white : COLORS.slate50;
      const isExt = p.tipo === 'Extrato Pendente';
      setCell(ws3, cur3, 0, {
        t: 's',
        v: p.tipo,
        s: {
          font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: isExt ? COLORS.rose700 : COLORS.slate700 } },
          fill: { patternType: 'solid', fgColor: { rgb: isExt ? COLORS.rose50 : COLORS.slate100 } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws3, cur3, 1, {
        t: 's',
        v: p.data,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws3, cur3, 2, {
        t: 's',
        v: p.canal,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws3, cur3, 3, {
        t: 's',
        v: p.identificacao,
        s: {
          font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws3, cur3, 4, {
        t: 's',
        v: p.detalhe,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate700 } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
          border: THIN_SLATE_BORDER,
        },
      });
      setCell(ws3, cur3, 5, {
        t: 'n',
        v: p.valorAberto,
        z: CURRENCY_NUM_FMT,
        s: {
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate900 } },
          fill: { patternType: 'solid', fgColor: { rgb: bg } },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: THIN_SLATE_BORDER,
          numFmt: CURRENCY_NUM_FMT,
        },
      });
      rh3.push({ hpt: 22 });
      cur3 += 1;
    });
  }

  const s3EndExcel = cur3;
  applyMergedRange(ws3, m3, cur3, 0, cur3, 4, `TOTAL PENDÊNCIAS (${model.pendingItems.length} itens)`, grandTotalLabelStyle);
  const fColLetter = XLSX.utils.encode_col(5);
  const totS3Style: CellStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand800 } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: GRAND_TOTAL_BORDER,
    numFmt: CURRENCY_NUM_FMT,
  };
  setCell(ws3, cur3, 5, hasS3
    ? { t: 'n', f: `SUM(${fColLetter}5:${fColLetter}${s3EndExcel})`, v: model.totals.openItemsSum, z: CURRENCY_NUM_FMT, s: totS3Style }
    : { t: 'n', v: 0, z: CURRENCY_NUM_FMT, s: totS3Style });
  rh3.push({ hpt: 24 });
  ws3['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cur3, c: s3Cols.length - 1 } });
  ws3['!merges'] = m3;
  ws3['!cols'] = s3Cols.map(c => ({ wch: c.w }));
  ws3['!rows'] = rh3;
  ws3['!margins'] = { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  XLSX.utils.book_append_sheet(wb, ws3, 'Pendencias');

  return wb;
}

export function buildConciliacaoReportXlsxBuffer(model: ConciliacaoReportModel): Uint8Array {
  const wb = buildConciliacaoReportWorkbook(model);
  const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | number[];
  const cfb = XLSX.CFB.read(new Uint8Array(raw), { type: 'array' });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  for (const sheetPath of [
    '/xl/worksheets/sheet1.xml',
    '/xl/worksheets/sheet2.xml',
    '/xl/worksheets/sheet3.xml',
  ]) {
    const entry = XLSX.CFB.find(cfb, sheetPath);
    if (!entry || !entry.content) continue;
    const xml = decoder.decode(new Uint8Array(entry.content as Uint8Array | number[]));
    const patched = patchLandscapeXml(xml);
    const bytes = encoder.encode(patched);
    entry.content = Array.from(bytes);
    entry.size = bytes.length;
  }

  const out = XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip' }) as ArrayBuffer | number[];
  return new Uint8Array(out);
}

export function downloadConciliacaoReportExcelBuffer(buffer: Uint8Array, competencia: string): void {
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio_conciliacao_${competencia}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
