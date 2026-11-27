import * as XLSXStyleMod from 'xlsx-js-style';
import type { CellObject, CellStyle, Range, WorkBook, WorkSheet } from 'xlsx-js-style';

const XLSX = (
  (XLSXStyleMod as unknown as { default?: typeof XLSXStyleMod }).default ?? XLSXStyleMod
) as typeof XLSXStyleMod;

const COLORS = {
  white: 'FFFFFF',
  slate50: 'F8FAFC',
  slate100: 'F1F5F9',
  slate300: 'CBD5E1',
  slate600: '475569',
  slate700: '334155',
  slate900: '0F172A',
  brand50: 'ECFDF5',
  brand200: 'A7F3D0',
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

const CURRENCY_NUM_FMT = '"R$ "#,##0.00';
const DATE_NUM_FMT = 'dd/mm/yyyy';

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

function patchTemplateSheetXml(xml: string, withFreezePaneAndFilter: boolean): string {
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

  if (withFreezePaneAndFilter) {
    const freezeView =
      '<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    if (/<sheetViews>[\s\S]*?<\/sheetViews>/.test(patched)) {
      patched = patched.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, freezeView);
    } else {
      patched = patched.replace('<cols>', `${freezeView}<cols>`);
    }

    if (!patched.includes('<autoFilter')) {
      patched = patched.replace('</sheetData>', '</sheetData><autoFilter ref="A4:H4"/>');
    }
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

/**
 * Gera workbook de modelo padrão vazio (.xlsx) para importação de extratos,
 * formatado no padrão visual da Beju Caramelos sem atrapalhar a reimportação.
 */
export function buildStatementTemplateWorkbook(): WorkBook {
  const wb: WorkBook = XLSX.utils.book_new();

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

  // Sheet 1: Extrato_Importacao
  const ws1: WorkSheet = {};
  const merges1: Range[] = [];
  const cols1 = [
    { label: 'Data', width: 14, kind: 'date' as const },
    { label: 'Canal', width: 14, kind: 'center' as const },
    { label: 'Pagador', width: 30, kind: 'left' as const },
    { label: 'Descrição', width: 34, kind: 'left' as const },
    { label: 'Valor Bruto', width: 16, kind: 'currency' as const },
    { label: 'Taxa MDR', width: 14, kind: 'currency' as const },
    { label: 'Valor Líquido', width: 16, kind: 'currency' as const },
    { label: 'Cód. Transação', width: 26, kind: 'left' as const },
  ];
  const maxCol1 = cols1.length - 1;

  applyMergedRange(
    ws1,
    merges1,
    0,
    0,
    0,
    maxCol1,
    'Beju Caramelos — Modelo Padrão de Importação de Extrato',
    titleStyle
  );
  applyMergedRange(
    ws1,
    merges1,
    1,
    0,
    1,
    maxCol1,
    'Preencha a partir da linha 5 (não altere os cabeçalhos da linha 4)   •   Consulte a aba "Instruções" para exemplos e formato das colunas',
    metaStyle
  );

  cols1.forEach((col, cIdx) => {
    setCell(ws1, 3, cIdx, { t: 's', v: col.label, s: headerStyle });
  });

  const rowHeights1: Array<{ hpt: number }> = [
    { hpt: 28 },
    { hpt: 24 },
    { hpt: 6 },
    { hpt: 26 },
  ];

  // 50 empty pre-formatted rows (rows 5..54) — zero totals or merges in data region
  for (let i = 0; i < 50; i += 1) {
    const r = 4 + i;
    const bg = i % 2 === 0 ? COLORS.white : COLORS.slate50;
    cols1.forEach((col, cIdx) => {
      const style: CellStyle = {
        font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate900 } },
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        alignment: {
          horizontal:
            col.kind === 'currency' ? 'right' : col.kind === 'date' || col.kind === 'center' ? 'center' : 'left',
          vertical: 'center',
          wrapText: col.kind === 'left' || col.kind === 'center',
        },
        border: THIN_SLATE_BORDER,
        ...(col.kind === 'date' ? { numFmt: DATE_NUM_FMT } : {}),
        ...(col.kind === 'currency' ? { numFmt: CURRENCY_NUM_FMT } : {}),
      };
      setCell(ws1, r, cIdx, {
        t: 's',
        v: '',
        ...(col.kind === 'date' ? { z: DATE_NUM_FMT } : {}),
        ...(col.kind === 'currency' ? { z: CURRENCY_NUM_FMT } : {}),
        s: style,
      });
    });
    rowHeights1.push({ hpt: 21 });
  }

  ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 53, c: maxCol1 } });
  ws1['!merges'] = merges1;
  ws1['!cols'] = cols1.map(c => ({ wch: c.width }));
  ws1['!rows'] = rowHeights1;
  ws1['!margins'] = { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  XLSX.utils.book_append_sheet(wb, ws1, 'Extrato_Importacao');

  // Sheet 2: Instruções
  const ws2: WorkSheet = {};
  const merges2: Range[] = [];
  const cols2 = [
    { label: 'Coluna', width: 18 },
    { label: 'Preenchimento', width: 16 },
    { label: 'Formato Aceito', width: 26 },
    { label: 'Exemplo Válido', width: 28 },
    { label: 'Como o importador utiliza', width: 52 },
  ];
  const maxCol2 = cols2.length - 1;

  applyMergedRange(
    ws2,
    merges2,
    0,
    0,
    0,
    maxCol2,
    'Beju Caramelos — Instruções de Preenchimento do Extrato',
    titleStyle
  );
  applyMergedRange(
    ws2,
    merges2,
    1,
    0,
    1,
    maxCol2,
    'Não preencha exemplos na aba "Extrato_Importacao" • Esta aba serve apenas como guia de referência',
    metaStyle
  );
  cols2.forEach((col, cIdx) => {
    setCell(ws2, 3, cIdx, { t: 's', v: col.label, s: headerStyle });
  });

  const instrRows: Array<[string, 'Obrigatório' | 'Recomendado' | 'Opcional', string, string, string]> = [
    ['Data', 'Obrigatório', 'DD/MM/AAAA', '26/11/2026', 'Data do crédito no extrato. Define a competência mensal (YYYY-MM) e pontua o Auto-Match.'],
    ['Canal', 'Recomendado', 'PixC6 / C6pay / Sumup / Rede', 'PixC6', 'Canal financeiro. Se ficar em branco, aplica o canal selecionado no modal de importação.'],
    ['Pagador', 'Recomendado', 'Texto livre', 'ANA CLARA MENEZES', 'Nome do pagador do PIX ou bandeira/lote da maquininha para cruzamento com o cliente.'],
    ['Descrição', 'Opcional', 'Texto livre', 'PIX RECEBIDO • SINAL 50%', 'Histórico complementar exibido abaixo do pagador na aba A Conciliar.'],
    ['Valor Bruto', 'Obrigatório', 'Numérico (R$ #,##0.00)', '320,00', 'Valor bruto da venda/crédito (fecha o pedido). Linhas com valor <= 0 são ignoradas.'],
    ['Taxa MDR', 'Opcional', 'Numérico (R$ #,##0.00)', '9,25', 'Taxa descontada pela maquininha (C6pay / Sumup / Rede). Se vazia, calcula Bruto - Líquido.'],
    ['Valor Líquido', 'Opcional', 'Numérico (R$ #,##0.00)', '310,75', 'Valor líquido depositado em conta. Usado para calcular MDR quando informado junto ao Bruto.'],
    ['Cód. Transação', 'Recomendado', 'Código / NSU / RV / E2E', 'E182361202611261422A91', 'Evita importação duplicada do mesmo lançamento (fingerprint único). Exibido apenas no tooltip e em Ignorados.'],
  ];

  const rowHeights2: Array<{ hpt: number }> = [
    { hpt: 28 },
    { hpt: 24 },
    { hpt: 6 },
    { hpt: 25 },
  ];

  instrRows.forEach((item, idx) => {
    const r = 4 + idx;
    const bg = idx % 2 === 0 ? COLORS.white : COLORS.slate50;
    const reqBadge =
      item[1] === 'Obrigatório'
        ? { fg: COLORS.rose700, bg: COLORS.rose50 }
        : item[1] === 'Recomendado'
        ? { fg: COLORS.brand800, bg: COLORS.brand50 }
        : { fg: COLORS.slate700, bg: COLORS.slate100 };

    setCell(ws2, r, 0, {
      t: 's',
      v: item[0],
      s: {
        font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.slate900 } },
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: THIN_SLATE_BORDER,
      },
    });
    setCell(ws2, r, 1, {
      t: 's',
      v: item[1],
      s: {
        font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: reqBadge.fg } },
        fill: { patternType: 'solid', fgColor: { rgb: reqBadge.bg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: THIN_SLATE_BORDER,
      },
    });
    setCell(ws2, r, 2, {
      t: 's',
      v: item[2],
      s: {
        font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate900 } },
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: THIN_SLATE_BORDER,
      },
    });
    setCell(ws2, r, 3, {
      t: 's',
      v: item[3],
      s: {
        font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate900 } },
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: THIN_SLATE_BORDER,
      },
    });
    setCell(ws2, r, 4, {
      t: 's',
      v: item[4],
      s: {
        font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate700 } },
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: THIN_SLATE_BORDER,
      },
    });
    rowHeights2.push({ hpt: 30 });
  });

  rowHeights2.push({ hpt: 8 });
  applyMergedRange(
    ws2,
    merges2,
    13,
    0,
    13,
    maxCol2,
    'IMPORTAÇÃO LIMPA: O importador localiza automaticamente o cabeçalho na linha 4, ignora as faixas visuais (linhas 1–3) e linhas em branco, e a aba Extrato_Importacao não possui linha de totalização para permitir colar quantos lançamentos precisar.',
    {
      font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.brand800 } },
      fill: { patternType: 'solid', fgColor: { rgb: COLORS.brand50 } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'medium', color: { rgb: COLORS.brand700 } },
        bottom: { style: 'thin', color: { rgb: COLORS.brand200 } },
        left: { style: 'thin', color: { rgb: COLORS.brand200 } },
        right: { style: 'thin', color: { rgb: COLORS.brand200 } },
      },
    }
  );
  rowHeights2.push({ hpt: 34 });

  ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 13, c: maxCol2 } });
  ws2['!merges'] = merges2;
  ws2['!cols'] = cols2.map(c => ({ wch: c.width }));
  ws2['!rows'] = rowHeights2;
  ws2['!margins'] = { left: 0.4, right: 0.4, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  XLSX.utils.book_append_sheet(wb, ws2, 'Instruções');

  return wb;
}

export function buildStatementTemplateXlsxBuffer(): Uint8Array {
  const wb = buildStatementTemplateWorkbook();
  const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | number[];
  const cfb = XLSX.CFB.read(new Uint8Array(raw), { type: 'array' });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  (['/xl/worksheets/sheet1.xml', '/xl/worksheets/sheet2.xml'] as const).forEach((sheetPath, idx) => {
    const entry = XLSX.CFB.find(cfb, sheetPath);
    if (!entry || !entry.content) return;
    const xml = decoder.decode(new Uint8Array(entry.content as Uint8Array | number[]));
    const patched = patchTemplateSheetXml(xml, idx === 0);
    const bytes = encoder.encode(patched);
    entry.content = Array.from(bytes);
    entry.size = bytes.length;
  });

  const out = XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip' }) as ArrayBuffer | number[];
  return new Uint8Array(out);
}

export function downloadStatementTemplateXlsx(): void {
  const buffer = buildStatementTemplateXlsxBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'modelo_importacao_extrato_beju.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
