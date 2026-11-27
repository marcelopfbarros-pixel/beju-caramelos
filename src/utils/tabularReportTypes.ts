export type TabularCellTone =
  | 'default'
  | 'bold'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'blue'
  | 'slate';

export type TabularColumnKind = 'text' | 'number' | 'currency' | 'badge';

export interface TabularReportColumnDef<K extends string = string> {
  key: K;
  label: string;
  shortLabel: string;
  isDefault: boolean;
  kind: TabularColumnKind;
  align: 'left' | 'center' | 'right';
  pdfWeight: number;
  pdfMinWidthMm: number;
  pdfMaxWidthMm: number;
  excelWch: number;
  excelMinWch: number;
  excelMaxWch: number;
  isFlexible?: boolean;
  summable?: boolean;
}

export interface TabularReportCellValue {
  text: string;
  numValue?: number | null;
  tone?: TabularCellTone;
  badge?: boolean;
}

export interface TabularReportRow<K extends string = string> {
  key: string;
  rowTone?: 'default' | 'rose' | 'sky' | 'amber';
  cells: Record<K, TabularReportCellValue>;
}

export interface TabularReportGroup<K extends string = string> {
  key: string;
  label: string;
  headerSummary?: string;
  subtotalLabel?: string;
  rows: Array<TabularReportRow<K>>;
  subtotals: Partial<Record<K, number>>;
}

export interface TabularReportSummaryColumn<K extends string = string> {
  key: K;
  label: string;
  align: 'left' | 'center' | 'right';
  kind: TabularColumnKind;
  wch?: number;
  summable?: boolean;
}

export interface TabularReportSummarySheet<K extends string = string> {
  sheetName: string;
  tabLabel: string;
  title: string;
  columns: Array<TabularReportSummaryColumn<K>>;
  rows: Array<TabularReportRow<K>>;
  totalLabel: string;
  totals: Partial<Record<K, number>>;
  emptyMessage: string;
}

export interface TabularReportData<K extends string = string> {
  title: string;
  filePrefix: string;
  sheetName: string;
  mainTabLabel: string;
  orientation: 'landscape' | 'portrait';
  isGrouped: boolean;
  groupLabel: string;
  groupHeaderPrefix: string;
  itemNounSingular: string;
  itemNounPlural: string;
  generatedAtLabel: string;
  rightMeta: string;
  filterParts: Array<{ label: string; value: string }>;
  selectedColumns: Array<TabularReportColumnDef<K>>;
  rows: Array<TabularReportRow<K>>;
  groups: Array<TabularReportGroup<K>>;
  grandTotals: Partial<Record<K, number>>;
  grandTotalSummaryText?: string;
  emptyMessage: string;
  includeSummaryInPdf: boolean;
  summarySheet?: TabularReportSummarySheet;
}

function measureColumnMaxLineChars<K extends string>(
  columns: Array<TabularReportColumnDef<K>>,
  rows: Array<TabularReportRow<K>>
): Map<K, number> {
  const maxMap = new Map<K, number>();
  columns.forEach(c => maxMap.set(c.key, c.shortLabel.length));

  rows.forEach(row => {
    columns.forEach(col => {
      const cell = row.cells[col.key];
      const text = cell?.text || '';
      const longestLine = text
        .split('\n')
        .reduce((max, line) => Math.max(max, line.trim().length), 0);
      const prev = maxMap.get(col.key) || 0;
      if (longestLine > prev) {
        maxMap.set(col.key, longestLine);
      }
    });
  });

  return maxMap;
}

export function computeTabularColumnWidthsMm<K extends string>(
  columns: Array<TabularReportColumnDef<K>>,
  rows: Array<TabularReportRow<K>>,
  usableWidthMm: number
): number[] {
  if (columns.length === 0) return [];
  const charLengths = measureColumnMaxLineChars(columns, rows);
  const count = columns.length;
  const charFactor = count <= 7 ? 1.75 : count <= 10 ? 1.48 : 1.28;

  const desired = columns.map(col => {
    const contentChars = charLengths.get(col.key) || 0;
    const minHeaderMm = Math.max(col.pdfMinWidthMm, col.shortLabel.length * 1.65 + 4);
    const estContentMm = contentChars * charFactor + 4;
    return Math.min(col.pdfMaxWidthMm, Math.max(minHeaderMm, estContentMm));
  });

  const sumDesired = desired.reduce((a, b) => a + b, 0);
  if (sumDesired <= usableWidthMm) {
    const remaining = usableWidthMm - sumDesired;
    const flexIndices = columns
      .map((c, idx) => (c.isFlexible ? idx : -1))
      .filter(i => i >= 0);
    if (flexIndices.length > 0) {
      const flexWeightSum =
        flexIndices.reduce((s, i) => s + columns[i].pdfWeight, 0) || 1;
      flexIndices.forEach(i => {
        desired[i] += remaining * (columns[i].pdfWeight / flexWeightSum);
      });
    } else {
      const totalWeight = columns.reduce((s, c) => s + c.pdfWeight, 0) || 1;
      columns.forEach((c, i) => {
        desired[i] += remaining * (c.pdfWeight / totalWeight);
      });
    }
    return desired;
  }

  let excess = sumDesired - usableWidthMm;
  const flexSlack = columns.reduce(
    (acc, col, i) => acc + (col.isFlexible ? Math.max(0, desired[i] - col.pdfMinWidthMm) : 0),
    0
  );
  if (flexSlack > 0) {
    const takeFromFlex = Math.min(excess, flexSlack);
    columns.forEach((col, i) => {
      if (!col.isFlexible) return;
      const slack = Math.max(0, desired[i] - col.pdfMinWidthMm);
      desired[i] -= takeFromFlex * (slack / flexSlack);
    });
    excess -= takeFromFlex;
  }

  if (excess > 0.01) {
    const allSlack = columns.reduce(
      (acc, col, i) => acc + Math.max(0, desired[i] - col.pdfMinWidthMm * 0.8),
      0
    );
    if (allSlack > 0) {
      const takeAll = Math.min(excess, allSlack);
      columns.forEach((col, i) => {
        const slack = Math.max(0, desired[i] - col.pdfMinWidthMm * 0.8);
        desired[i] -= takeAll * (slack / allSlack);
      });
    }
  }

  const finalSum = desired.reduce((a, b) => a + b, 0) || 1;
  return desired.map(w => (w * usableWidthMm) / finalSum);
}

export function computeTabularExcelWidths<K extends string>(
  columns: Array<TabularReportColumnDef<K>>,
  rows: Array<TabularReportRow<K>>,
  orientation: 'landscape' | 'portrait'
): Array<{ wch: number }> {
  const charLengths = measureColumnMaxLineChars(columns, rows);
  const budget = orientation === 'portrait' ? 114 : 182;

  const desired = columns.map(col => {
    const contentChars = charLengths.get(col.key) || 0;
    const target = Math.ceil(Math.max(col.label.length + 2, contentChars + 3, col.excelWch));
    return Math.min(col.excelMaxWch, Math.max(col.excelMinWch, target));
  });

  let sum = desired.reduce((a, b) => a + b, 0);
  if (sum > budget) {
    let excess = sum - budget;
    const flexSlack = columns.reduce(
      (acc, c, i) => acc + (c.isFlexible ? Math.max(0, desired[i] - c.excelMinWch) : 0),
      0
    );
    if (flexSlack > 0) {
      const take = Math.min(excess, flexSlack);
      columns.forEach((c, i) => {
        if (!c.isFlexible) return;
        const slack = Math.max(0, desired[i] - c.excelMinWch);
        desired[i] -= take * (slack / flexSlack);
      });
      sum = desired.reduce((a, b) => a + b, 0);
      excess = Math.max(0, sum - budget);
    }

    if (excess > 0.5) {
      const scale = budget / sum;
      columns.forEach((_c, i) => {
        desired[i] = Math.max(7, Math.round(desired[i] * scale));
      });
    }
  }

  return desired.map(w => ({ wch: Math.max(7, Math.round(w)) }));
}
