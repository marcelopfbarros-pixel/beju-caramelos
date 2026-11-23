---
name: styled-excel-export
description: >-
  Implementation and verification guide for styled Excel (.xlsx) exports with
  native SUM() formulas using xlsx-js-style in JuJu Delivery (Vite 6 + React +
  TypeScript). Use when building or updating formatted spreadsheet reports that
  must mirror on-screen colors, borders, merges, and dynamic Excel formulas.
---

# Styled Excel Export Guide (`xlsx-js-style`)

## 1. Library & Vite Chunking Strategy

- Keep `xlsx` (`0.18.5`) untouched for plain tabular import/export (`excelService.ts`, `ProducaoScreen.tsx`).
- Use `xlsx-js-style` for formatted `.xlsx` reports (SheetJS CE silently drops `cell.s` styles).
- Isolate workbook generation in a pure, DOM-free module under `src/utils/` (e.g., `src/utils/programacaoProducaoExcel.ts`) and load it lazily via dynamic `await import(...)` in the UI click handler.
- Keep `'vendor-xlsx-style': ['xlsx-js-style']` in `vite.config.ts` `build.rollupOptions.output.manualChunks`.

## 2. Critical `xlsx-js-style` & Formula Rules

1. **CJS/ESM default unwrap** (`tsconfig.json` does not set `esModuleInterop: true`):
   ```ts
   import * as XLSXStyleMod from 'xlsx-js-style';
   const XLSX = ((XLSXStyleMod as unknown as { default?: typeof XLSXStyleMod }).default ?? XLSXStyleMod) as typeof XLSXStyleMod;
   ```
2. **RGB hex colors**: Always use **6 uppercase hex digits without `#`** (e.g., `'ECFDF5'`, never `'#ecfdf5'`), with `fill: { patternType: 'solid', fgColor: { rgb } }`.
3. **Live `SUM(...)` formulas (never hardcoded totals)**:
   - Store `t: 'n'`, formula `f` **without** a leading `=` (e.g., `'SUM(D6:D15)'`), and cached numeric value `v`.
   - Always compute column letters via `XLSX.utils.encode_col(colIdx)` so tables exceeding 26 columns (`AA`, `AB`, ...) produce valid formulas.
   - Guard empty data states (`rows.length === 0`) so invalid ranges like `SUM(D6:D5)` are never written.
4. **Numeric zero display & labeled totals**:
   - Store zero quantities as numeric `0` with `numFmt: '#,##0;-#,##0;"—"'` so Excel displays `—` like the UI while keeping cells numeric for live `SUM()` recalculation.
   - For labeled grand-total cells, keep the cell numeric with a `SUM(...)` formula and use custom `numFmt` (e.g., `'"Total Geral: "#,##0'`).
5. **Merged range styling**:
   - Populate `fill` and `border` styles on **every cell** inside each merged range (`rowSpan` and `colSpan`), not just the top-left anchor cell, so Excel/LibreOffice render continuous outer borders.
6. **Sizing & margins**:
   - Set `ws['!ref']`, `ws['!merges']`, `ws['!cols']`, `ws['!rows']` (dynamically sized for wrapped text), and `ws['!margins']`.

## 3. Verification Checklist

1. Run `npx tsc --noEmit` (exit `0`) and `npm run build` (confirm `vendor-xlsx-style` bundles cleanly without Node polyfill errors).
2. Generate a sample `.xlsx` buffer from the pure builder in Node and inspect the raw ZIP entries `xl/worksheets/sheet1.xml` and `xl/styles.xml` to verify:
   - `<f>SUM(...)</f>` tags appear on every summary cell alongside `s="..."` style references (including a `> 26` columns case and an empty-rows edge case).
   - `<mergeCells>` covers all banners, vertical headers, and grouped totals.
   - `xl/styles.xml` contains the expected RGB fills, border colors, and custom `numFmt` codes.
