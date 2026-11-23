import * as XLSXStyleMod from 'xlsx-js-style';
import type { CellObject, CellStyle, Range, WorkBook, WorkSheet } from 'xlsx-js-style';
import { Product } from '../types';

const XLSX = (
  (XLSXStyleMod as unknown as { default?: typeof XLSXStyleMod }).default ?? XLSXStyleMod
) as typeof XLSXStyleMod;

export interface ProgramacaoExcelCategoryGroup {
  id: string;
  nome: string;
  products: Product[];
}

export interface ProgramacaoExcelOrderRow {
  numeroPedido: string;
  unitName: string;
  dateLine: string;
  shiftLine?: string;
  clienteNome: string;
  quantitiesByProductId: Record<string, number>;
  observacoes: string;
}

export interface ProgramacaoExcelParams {
  selectedUnitLabel: string;
  startDate: string;
  endDate: string;
  shiftsLabel: string;
  categoryGroups: ProgramacaoExcelCategoryGroup[];
  rows: ProgramacaoExcelOrderRow[];
  productTotalsById: Record<string, number>;
  categoryTotalsById: Record<string, number>;
  grandTotal: number;
}

export interface ProgramacaoExcelBuildResult {
  workbook: WorkBook;
  worksheet: WorkSheet;
  sheetName: string;
}

interface ExcelCategoryPalette {
  headerBg: string;
  headerFg: string;
  border: string;
  subBg: string;
  subFg: string;
  totalBg: string;
  totalFg: string;
}

/**
 * Hex colors (6-char uppercase RGB without `#`) matching Tailwind tokens and
 * `CATEGORY_PALETTES` in `ProgramacaoProducaoModal.tsx`.
 */
const COLORS = {
  white: 'FFFFFF',
  filterBg: 'F8F9FF',
  slate50: 'F8FAFC',
  slate200: 'E2E8F0',
  slate300: 'CBD5E1',
  slate400: '94A3B8',
  slate600: '475569',
  slate700: '334155',
  slate800: '1E293B',
  slate900: '0F172A',
  brand50: 'ECFDF5',
  brand100: 'D1FAE5',
  brand200: 'A7F3D0',
  brand500: '10B981',
  brand700: '047857',
  brand900: '004F35',
} as const;

const EXCEL_CATEGORY_PALETTES: readonly ExcelCategoryPalette[] = [
  {
    headerBg: 'FFF1F2',
    headerFg: '881337',
    border: 'FECDD3',
    subBg: 'FFF7F8',
    subFg: '4C0519',
    totalBg: 'FFF1F2',
    totalFg: 'BE123C',
  },
  {
    headerBg: 'FFFBEB',
    headerFg: '78350F',
    border: 'FDE68A',
    subBg: 'FFFDF4',
    subFg: '451A03',
    totalBg: 'FFFBEB',
    totalFg: '92400E',
  },
  {
    headerBg: 'EEF2FF',
    headerFg: '312E81',
    border: 'C7D2FE',
    subBg: 'F5F7FF',
    subFg: '1E1B4B',
    totalBg: 'EEF2FF',
    totalFg: '4338CA',
  },
  {
    headerBg: 'ECFDF5',
    headerFg: '064E3B',
    border: 'A7F3D0',
    subBg: 'F3FDF9',
    subFg: '022C22',
    totalBg: 'ECFDF5',
    totalFg: '047857',
  },
  {
    headerBg: 'FAF5FF',
    headerFg: '581C87',
    border: 'E9D5FF',
    subBg: 'FCF9FF',
    subFg: '3B0764',
    totalBg: 'FAF5FF',
    totalFg: '7E22CE',
  },
];

const QTY_NUM_FMT = '#,##0;-#,##0;"—"';
const TOTAL_NUM_FMT = '#,##0';
const GRAND_TOTAL_NUM_FMT = '"Total Geral: "#,##0';

function solidFill(rgb: string): NonNullable<CellStyle['fill']> {
  return { patternType: 'solid', fgColor: { rgb } };
}

function borderSide(rgb: string, style: 'thin' | 'medium' = 'thin') {
  return { style, color: { rgb } };
}

function makeUniformBorders(
  rgb: string,
  style: 'thin' | 'medium' = 'thin'
): NonNullable<CellStyle['border']> {
  const edge = borderSide(rgb, style);
  return { top: edge, bottom: edge, left: edge, right: edge };
}

function formatDateBR(dateKey: string, fallback: string): string {
  if (!dateKey) return fallback;
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function setCell(ws: WorkSheet, r: number, c: number, cell: CellObject): void {
  const addr = XLSX.utils.encode_cell({ r, c });
  ws[addr] = cell;
}

function estimateWrappedLines(text: string, colWidth: number): number {
  if (!text) return 1;
  const safeWidth = Math.max(8, colWidth - 2);
  return text.split('\n').reduce((total, segment) => {
    return total + Math.max(1, Math.ceil(segment.length / safeWidth));
  }, 0);
}

/**
 * Builds a styled `xlsx-js-style` workbook reproducing the Programação de Produção
 * pivot table and using live Excel `SUM(...)` formulas in all summary rows.
 */
export function buildProgramacaoProducaoWorkbook(
  params: ProgramacaoExcelParams
): ProgramacaoExcelBuildResult {
  const {
    selectedUnitLabel,
    startDate,
    endDate,
    shiftsLabel,
    categoryGroups,
    rows,
    productTotalsById,
    categoryTotalsById,
    grandTotal,
  } = params;

  const orderedProducts = categoryGroups.flatMap((g) => g.products);
  const obsCol = 3 + orderedProducts.length;
  const lastColIdx = obsCol;
  const ws: WorkSheet = {};
  const merges: Range[] = [];
  const rowHeights: { hpt: number }[] = [];

  // Row 0 (Excel 1): Title banner
  const titleStyle: CellStyle = {
    fill: solidFill(COLORS.brand100),
    font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: COLORS.brand900 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: makeUniformBorders(COLORS.brand200, 'thin'),
  };
  for (let c = 0; c <= lastColIdx; c++) {
    setCell(ws, 0, c, {
      t: 's',
      v: c === 0 ? 'Beju Caramelos  —  Programação de Produção' : '',
      s: titleStyle,
    });
  }
  if (lastColIdx > 0) {
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } });
  }
  rowHeights[0] = { hpt: 28 };

  // Row 1 (Excel 2): Subtitle banner with active filters
  const subtitleText = `${selectedUnitLabel} • ${formatDateBR(startDate, 'Início')} até ${formatDateBR(
    endDate,
    'Fim'
  )} • Turnos: ${shiftsLabel}`;
  const subtitleStyle: CellStyle = {
    fill: solidFill(COLORS.filterBg),
    font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate600 } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: borderSide(COLORS.brand200, 'thin'),
      bottom: borderSide(COLORS.slate300, 'thin'),
      left: borderSide(COLORS.slate200, 'thin'),
      right: borderSide(COLORS.slate200, 'thin'),
    },
  };
  for (let c = 0; c <= lastColIdx; c++) {
    setCell(ws, 1, c, {
      t: 's',
      v: c === 0 ? subtitleText : '',
      s: subtitleStyle,
    });
  }
  if (lastColIdx > 0) {
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: lastColIdx } });
  }
  rowHeights[1] = { hpt: 20 };

  // Row 2 (Excel 3): Visual spacer
  rowHeights[2] = { hpt: 8 };

  // Rows 3 & 4 (Excel 4 & 5): Two-tier table header
  const fixedHeaderTitles: Array<{ col: number; label: string; align: 'left' | 'center' }> = [
    { col: 0, label: 'Número do Pedido', align: 'left' },
    { col: 1, label: 'Data de Entrega', align: 'left' },
    { col: 2, label: 'Cliente', align: 'left' },
    { col: obsCol, label: 'Observações', align: 'center' },
  ];

  fixedHeaderTitles.forEach(({ col, label, align }) => {
    const sharedFont = { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate800 } };
    const sharedAlign = { horizontal: align, vertical: 'center' as const, wrapText: true };

    setCell(ws, 3, col, {
      t: 's',
      v: label,
      s: {
        fill: solidFill(COLORS.slate50),
        font: sharedFont,
        alignment: sharedAlign,
        border: {
          top: borderSide(COLORS.slate300, 'thin'),
          bottom: borderSide(COLORS.slate200, 'thin'),
          left: borderSide(COLORS.slate200, 'thin'),
          right: borderSide(COLORS.slate200, 'thin'),
        },
      },
    });
    setCell(ws, 4, col, {
      t: 's',
      v: '',
      s: {
        fill: solidFill(COLORS.slate50),
        font: sharedFont,
        alignment: sharedAlign,
        border: {
          top: borderSide(COLORS.slate200, 'thin'),
          bottom: borderSide(COLORS.slate300, 'medium'),
          left: borderSide(COLORS.slate200, 'thin'),
          right: borderSide(COLORS.slate200, 'thin'),
        },
      },
    });
    merges.push({ s: { r: 3, c: col }, e: { r: 4, c: col } });
  });

  let headerColCursor = 3;
  categoryGroups.forEach((grp, idx) => {
    const pal = EXCEL_CATEGORY_PALETTES[idx % EXCEL_CATEGORY_PALETTES.length];
    const startCol = headerColCursor;
    const endCol = startCol + grp.products.length - 1;

    if (grp.products.length > 1) {
      merges.push({ s: { r: 3, c: startCol }, e: { r: 3, c: endCol } });
    }

    const catStyle: CellStyle = {
      fill: solidFill(pal.headerBg),
      font: { name: 'Calibri', sz: 9, bold: true, color: { rgb: pal.headerFg } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: borderSide(COLORS.slate300, 'thin'),
        bottom: borderSide(pal.border, 'thin'),
        left: borderSide(COLORS.slate200, 'thin'),
        right: borderSide(COLORS.slate200, 'thin'),
      },
    };

    const prodStyle: CellStyle = {
      fill: solidFill(pal.subBg),
      font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: pal.subFg } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: borderSide(pal.border, 'thin'),
        bottom: borderSide(COLORS.slate300, 'medium'),
        left: borderSide(COLORS.slate200, 'thin'),
        right: borderSide(COLORS.slate200, 'thin'),
      },
    };

    grp.products.forEach((prod, prodIdx) => {
      const col = startCol + prodIdx;
      setCell(ws, 3, col, {
        t: 's',
        v: prodIdx === 0 ? grp.nome.toUpperCase() : '',
        s: catStyle,
      });
      setCell(ws, 4, col, {
        t: 's',
        v: prod.descricao,
        s: prodStyle,
      });
    });

    headerColCursor += grp.products.length;
  });

  // Precompute column widths before sizing headers and body rows so heights match wrapping
  const maxClienteLen = rows.reduce((max, r) => Math.max(max, r.clienteNome.length), 14);
  const maxObsLen = rows.reduce(
    (max, r) => Math.max(max, (r.observacoes || '').length),
    `Total Geral: ${grandTotal}`.length
  );
  const col0Width = 20;
  const col1Width = 18;
  const col2Width = Math.min(34, Math.max(18, maxClienteLen + 3));
  const obsColWidth = Math.min(38, Math.max(20, maxObsLen + 3));
  const productColWidths = orderedProducts.map((prod) => {
    const longestWord = prod.descricao
      .split(/\s+/)
      .reduce((m, w) => Math.max(m, w.length), 0);
    return Math.min(20, Math.max(13, longestWord + 3));
  });

  const colWidths = [
    { wch: col0Width },
    { wch: col1Width },
    { wch: col2Width },
    ...productColWidths.map((wch) => ({ wch })),
    { wch: obsColWidth },
  ];

  let prodWidthCursor = 0;
  const maxCategoryLines = categoryGroups.reduce((maxLines, grp) => {
    const spanWidth = productColWidths
      .slice(prodWidthCursor, prodWidthCursor + grp.products.length)
      .reduce((sum, w) => sum + w, 0);
    prodWidthCursor += grp.products.length;
    return Math.max(maxLines, estimateWrappedLines(grp.nome.toUpperCase(), spanWidth));
  }, 1);

  const maxProductLines = orderedProducts.reduce(
    (maxLines, prod, idx) =>
      Math.max(maxLines, estimateWrappedLines(prod.descricao, productColWidths[idx] || 13)),
    1
  );

  rowHeights[3] = { hpt: Math.max(24, maxCategoryLines * 14 + 6) };
  rowHeights[4] = { hpt: Math.max(34, maxProductLines * 14 + 8) };

  const firstBodyRowIdx = 5;
  const firstBodyExcelRow = firstBodyRowIdx + 1;
  let lastPopulatedRowIdx = firstBodyRowIdx;

  // Empty state (mirrors modal UI: shows notice, omits footer totals & invalid SUM ranges)
  if (rows.length === 0 || orderedProducts.length === 0) {
    const emptyStyle: CellStyle = {
      fill: solidFill(COLORS.white),
      font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: COLORS.slate400 } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: makeUniformBorders(COLORS.slate200, 'thin'),
    };
    for (let c = 0; c <= lastColIdx; c++) {
      setCell(ws, firstBodyRowIdx, c, {
        t: 's',
        v: c === 0 ? 'Nenhum produto a produzir para os filtros selecionados.' : '',
        s: emptyStyle,
      });
    }
    if (lastColIdx > 0) {
      merges.push({
        s: { r: firstBodyRowIdx, c: 0 },
        e: { r: firstBodyRowIdx, c: lastColIdx },
      });
    }
    rowHeights[firstBodyRowIdx] = { hpt: 32 };
  } else {
    const bodyBorder = makeUniformBorders(COLORS.slate200, 'thin');

    // Body order rows
    rows.forEach((row, rowOffset) => {
      const r = firstBodyRowIdx + rowOffset;
      const orderUnitText = `${row.numeroPedido}\n${row.unitName}`;
      const dateShiftText = row.shiftLine ? `${row.dateLine}\n${row.shiftLine}` : row.dateLine;
      const obsText = row.observacoes?.trim() || '—';
      const hasObs = obsText !== '—';

      setCell(ws, r, 0, {
        t: 's',
        v: orderUnitText,
        s: {
          fill: solidFill(COLORS.white),
          border: bodyBorder,
          font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.slate900 } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        },
      });

      setCell(ws, r, 1, {
        t: 's',
        v: dateShiftText,
        s: {
          fill: solidFill(COLORS.white),
          border: bodyBorder,
          font: { name: 'Calibri', sz: 9.5, color: { rgb: COLORS.slate700 } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        },
      });

      setCell(ws, r, 2, {
        t: 's',
        v: row.clienteNome,
        s: {
          fill: solidFill(COLORS.white),
          border: bodyBorder,
          font: { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate800 } },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        },
      });

      orderedProducts.forEach((prod, pIdx) => {
        const col = 3 + pIdx;
        const qty = row.quantitiesByProductId[prod.id] || 0;
        setCell(ws, r, col, {
          t: 'n',
          v: qty,
          s: {
            fill: solidFill(COLORS.white),
            border: bodyBorder,
            font:
              qty > 0
                ? { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } }
                : { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate300 } },
            alignment: { horizontal: 'center', vertical: 'center' },
            numFmt: QTY_NUM_FMT,
          },
        });
      });

      setCell(ws, r, obsCol, {
        t: 's',
        v: obsText,
        s: {
          fill: solidFill(COLORS.white),
          border: bodyBorder,
          font: {
            name: 'Calibri',
            sz: 9.5,
            color: { rgb: hasObs ? COLORS.slate600 : COLORS.slate400 },
          },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        },
      });

      const neededLines = Math.max(
        2,
        estimateWrappedLines(row.clienteNome, col2Width),
        estimateWrappedLines(obsText, obsColWidth)
      );
      rowHeights[r] = { hpt: Math.min(64, Math.max(30, neededLines * 14 + 4)) };
    });

    const lastBodyExcelRow = firstBodyExcelRow + rows.length - 1;
    const totalProdRowIdx = firstBodyRowIdx + rows.length;
    const totalProdExcelRow = totalProdRowIdx + 1;
    const totalCatRowIdx = totalProdRowIdx + 1;
    lastPopulatedRowIdx = totalCatRowIdx;

    // Summary Row 1: TOTAL A PRODUZIR (per product, backed by SUM formulas)
    const totalProdBorders: NonNullable<CellStyle['border']> = {
      top: borderSide(COLORS.brand500, 'medium'),
      bottom: borderSide(COLORS.slate200, 'thin'),
      left: borderSide(COLORS.slate200, 'thin'),
      right: borderSide(COLORS.slate200, 'thin'),
    };

    setCell(ws, totalProdRowIdx, 0, {
      t: 's',
      v: 'TOTAL A PRODUZIR',
      s: {
        fill: solidFill(COLORS.brand50),
        border: totalProdBorders,
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } },
        alignment: { horizontal: 'left', vertical: 'center' },
      },
    });
    setCell(ws, totalProdRowIdx, 1, {
      t: 's',
      v: `${rows.length} pedido(s)`,
      s: {
        fill: solidFill(COLORS.brand50),
        border: totalProdBorders,
        font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.slate800 } },
        alignment: { horizontal: 'left', vertical: 'center' },
      },
    });
    setCell(ws, totalProdRowIdx, 2, {
      t: 's',
      v: '—',
      s: {
        fill: solidFill(COLORS.brand50),
        border: totalProdBorders,
        font: { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate400 } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    });

    orderedProducts.forEach((prod, pIdx) => {
      const col = 3 + pIdx;
      const colLetter = XLSX.utils.encode_col(col);
      setCell(ws, totalProdRowIdx, col, {
        t: 'n',
        f: `SUM(${colLetter}${firstBodyExcelRow}:${colLetter}${lastBodyExcelRow})`,
        v: productTotalsById[prod.id] || 0,
        s: {
          fill: solidFill(COLORS.brand50),
          border: totalProdBorders,
          font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: COLORS.brand700 } },
          alignment: { horizontal: 'center', vertical: 'center' },
          numFmt: TOTAL_NUM_FMT,
        },
      });
    });

    setCell(ws, totalProdRowIdx, obsCol, {
      t: 's',
      v: '—',
      s: {
        fill: solidFill(COLORS.brand50),
        border: totalProdBorders,
        font: { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate400 } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    });
    rowHeights[totalProdRowIdx] = { hpt: 25 };

    // Summary Row 2: TOTAL POR CATEGORIA + Total Geral (all backed by SUM formulas)
    const totalCatBorders: NonNullable<CellStyle['border']> = {
      top: borderSide(COLORS.slate200, 'thin'),
      bottom: borderSide(COLORS.slate300, 'medium'),
      left: borderSide(COLORS.slate200, 'thin'),
      right: borderSide(COLORS.slate200, 'thin'),
    };

    setCell(ws, totalCatRowIdx, 0, {
      t: 's',
      v: 'TOTAL POR CATEGORIA',
      s: {
        fill: solidFill(COLORS.slate50),
        border: totalCatBorders,
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: COLORS.slate900 } },
        alignment: { horizontal: 'left', vertical: 'center' },
      },
    });
    setCell(ws, totalCatRowIdx, 1, {
      t: 's',
      v: `${categoryGroups.length} categoria(s)`,
      s: {
        fill: solidFill(COLORS.slate50),
        border: totalCatBorders,
        font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: COLORS.slate700 } },
        alignment: { horizontal: 'left', vertical: 'center' },
      },
    });
    setCell(ws, totalCatRowIdx, 2, {
      t: 's',
      v: '—',
      s: {
        fill: solidFill(COLORS.slate50),
        border: totalCatBorders,
        font: { name: 'Calibri', sz: 10, color: { rgb: COLORS.slate400 } },
        alignment: { horizontal: 'center', vertical: 'center' },
      },
    });

    let catColCursor = 3;
    categoryGroups.forEach((grp, idx) => {
      const pal = EXCEL_CATEGORY_PALETTES[idx % EXCEL_CATEGORY_PALETTES.length];
      const startCol = catColCursor;
      const endCol = startCol + grp.products.length - 1;
      const startLetter = XLSX.utils.encode_col(startCol);
      const endLetter = XLSX.utils.encode_col(endCol);

      if (grp.products.length > 1) {
        merges.push({ s: { r: totalCatRowIdx, c: startCol }, e: { r: totalCatRowIdx, c: endCol } });
      }

      const catTotalStyle: CellStyle = {
        fill: solidFill(pal.totalBg),
        border: totalCatBorders,
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: pal.totalFg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        numFmt: TOTAL_NUM_FMT,
      };

      grp.products.forEach((_, prodIdx) => {
        const col = startCol + prodIdx;
        if (prodIdx === 0) {
          setCell(ws, totalCatRowIdx, col, {
            t: 'n',
            f: `SUM(${startLetter}${totalProdExcelRow}:${endLetter}${totalProdExcelRow})`,
            v: categoryTotalsById[grp.id] || 0,
            s: catTotalStyle,
          });
        } else {
          setCell(ws, totalCatRowIdx, col, {
            t: 's',
            v: '',
            s: catTotalStyle,
          });
        }
      });

      catColCursor += grp.products.length;
    });

    const firstProdLetter = XLSX.utils.encode_col(3);
    const lastProdLetter = XLSX.utils.encode_col(3 + orderedProducts.length - 1);
    setCell(ws, totalCatRowIdx, obsCol, {
      t: 'n',
      f: `SUM(${firstProdLetter}${totalProdExcelRow}:${lastProdLetter}${totalProdExcelRow})`,
      v: grandTotal,
      s: {
        fill: solidFill(COLORS.slate50),
        border: totalCatBorders,
        font: { name: 'Calibri', sz: 10.5, bold: true, color: { rgb: COLORS.slate900 } },
        alignment: { horizontal: 'center', vertical: 'center' },
        numFmt: GRAND_TOTAL_NUM_FMT,
      },
    });
    rowHeights[totalCatRowIdx] = { hpt: 27 };
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastPopulatedRowIdx, c: lastColIdx } });
  ws['!merges'] = merges;
  ws['!cols'] = colWidths;
  ws['!rows'] = rowHeights;
  ws['!margins'] = {
    left: 0.35,
    right: 0.35,
    top: 0.4,
    bottom: 0.4,
    header: 0.2,
    footer: 0.2,
  };

  const sheetName = 'Programacao_Producao';
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, sheetName);

  return { workbook, worksheet: ws, sheetName };
}

export function exportProgramacaoProducaoExcel(
  params: ProgramacaoExcelParams,
  filename: string
): void {
  const { workbook } = buildProgramacaoProducaoWorkbook(params);
  XLSX.writeFile(workbook, filename);
}
