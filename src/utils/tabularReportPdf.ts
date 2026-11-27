import { jsPDF } from 'jspdf';
import * as autoTableMod from 'jspdf-autotable';
import type { CellDef, Color, RowInput, Styles } from 'jspdf-autotable';
import { formatCurrencyBR } from '../components/CurrencyInput';
import {
  TabularCellTone,
  TabularColumnKind,
  TabularReportData,
  computeTabularColumnWidthsMm,
} from './tabularReportTypes';

const autoTable = (
  autoTableMod.autoTable ??
  (autoTableMod as unknown as { default?: typeof autoTableMod.autoTable }).default ??
  autoTableMod
) as typeof autoTableMod.autoTable;

const PDF_COLORS = {
  slate900: [15, 23, 42] as [number, number, number],
  slate800: [30, 41, 59] as [number, number, number],
  slate700: [51, 65, 85] as [number, number, number],
  slate600: [71, 85, 105] as [number, number, number],
  slate500: [100, 116, 139] as [number, number, number],
  slate300: [203, 213, 225] as [number, number, number],
  slate100: [241, 245, 249] as [number, number, number],
  slate50: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  brand900: [0, 79, 53] as [number, number, number],
  brand800: [6, 95, 70] as [number, number, number],
  brand700: [4, 120, 87] as [number, number, number],
  brand200: [167, 243, 208] as [number, number, number],
  brand100: [209, 250, 229] as [number, number, number],
  brand50: [236, 253, 245] as [number, number, number],
  amber800: [146, 64, 14] as [number, number, number],
  amber50: [255, 251, 235] as [number, number, number],
  sky700: [3, 105, 161] as [number, number, number],
  sky50: [240, 249, 255] as [number, number, number],
  blue800: [30, 64, 175] as [number, number, number],
  blue50: [239, 246, 255] as [number, number, number],
  rose900: [136, 19, 55] as [number, number, number],
  rose700: [190, 18, 60] as [number, number, number],
  rose300: [253, 164, 175] as [number, number, number],
  rose200: [254, 205, 211] as [number, number, number],
  rose50: [255, 241, 242] as [number, number, number],
};

function resolveCellStyleColors(
  tone: TabularCellTone | undefined,
  badge: boolean | undefined,
  rowBg: Color
): { fillColor: Color; textColor: Color; fontStyle: 'normal' | 'bold' } {
  switch (tone) {
    case 'bold':
      return { fillColor: rowBg, textColor: PDF_COLORS.slate900, fontStyle: 'bold' };
    case 'emerald':
      return {
        fillColor: badge ? PDF_COLORS.brand50 : rowBg,
        textColor: PDF_COLORS.brand800,
        fontStyle: 'bold',
      };
    case 'amber':
      return {
        fillColor: badge ? PDF_COLORS.amber50 : rowBg,
        textColor: PDF_COLORS.amber800,
        fontStyle: 'bold',
      };
    case 'rose':
      return {
        fillColor: badge ? PDF_COLORS.rose50 : rowBg,
        textColor: PDF_COLORS.rose700,
        fontStyle: 'bold',
      };
    case 'sky':
      return {
        fillColor: badge ? PDF_COLORS.sky50 : rowBg,
        textColor: PDF_COLORS.sky700,
        fontStyle: 'bold',
      };
    case 'blue':
      return {
        fillColor: badge ? PDF_COLORS.blue50 : rowBg,
        textColor: PDF_COLORS.blue800,
        fontStyle: 'bold',
      };
    case 'slate':
      return {
        fillColor: badge ? PDF_COLORS.slate100 : rowBg,
        textColor: PDF_COLORS.slate700,
        fontStyle: badge ? 'bold' : 'normal',
      };
    default:
      return { fillColor: rowBg, textColor: PDF_COLORS.slate800, fontStyle: 'normal' };
  }
}

function formatTotalCellValue(value: number, kind: TabularColumnKind): string {
  if (kind === 'currency') {
    return `R$ ${formatCurrencyBR(value)}`;
  }
  return String(Number(value.toFixed(3)));
}

export interface TabularPdfBuildOptions {
  logoDataUrl?: string;
}

export function buildTabularReportPdfDocument(
  data: TabularReportData,
  options?: TabularPdfBuildOptions
): jsPDF {
  const orientation = data.orientation;
  const isPortrait = orientation === 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 8;
  const usableWidth = pageWidth - marginX * 2;

  // Beju Caramelos rose-50 header banner
  const headerY = 8;
  const headerH = 15.5;
  doc.setFillColor(...PDF_COLORS.rose50);
  doc.setDrawColor(...PDF_COLORS.rose200);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, headerY, usableWidth, headerH, 2, 2, 'FD');

  doc.setDrawColor(...PDF_COLORS.rose300);
  doc.setLineWidth(0.6);
  doc.line(marginX + 1, headerY + headerH, marginX + usableWidth - 1, headerY + headerH);

  let titleStartX = marginX + 3.5;
  if (options?.logoDataUrl) {
    try {
      doc.addImage(options.logoDataUrl, 'JPEG', marginX + 3, headerY + 2.5, 10.5, 10.5);
      doc.setDrawColor(...PDF_COLORS.rose300);
      doc.setLineWidth(0.35);
      doc.roundedRect(marginX + 3, headerY + 2.5, 10.5, 10.5, 1.5, 1.5, 'S');
      titleStartX = marginX + 16;
    } catch {
      // ignore invalid image
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isPortrait ? 11 : 12.5);
  doc.setTextColor(...PDF_COLORS.slate900);
  doc.text('Beju Caramelos', titleStartX, headerY + 6.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isPortrait ? 8.8 : 9.6);
  doc.setTextColor(...PDF_COLORS.rose900);
  doc.text(data.title, titleStartX, headerY + 12.2);

  const rightX = marginX + usableWidth - 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isPortrait ? 6.4 : 7);
  doc.setTextColor(...PDF_COLORS.slate500);
  doc.text(data.rightMeta, rightX, headerY + 11.8, { align: 'right' });

  // Filter metadata bar
  const metaY = headerY + headerH + 2;
  const metaLine = data.filterParts.map(p => `${p.label}: ${p.value}`).join('   |   ');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isPortrait ? 6.1 : 6.8);
  const metaLines = doc.splitTextToSize(metaLine || 'Sem filtros adicionais', usableWidth - 5) as string[];
  const metaH = Math.max(7.4, metaLines.slice(0, 2).length * 3.8 + 3);

  doc.setFillColor(...PDF_COLORS.slate50);
  doc.setDrawColor(...PDF_COLORS.slate300);
  doc.setLineWidth(0.2);
  doc.roundedRect(marginX, metaY, usableWidth, metaH, 1.2, 1.2, 'FD');

  doc.setTextColor(...PDF_COLORS.slate700);
  metaLines.slice(0, 2).forEach((line, idx) => {
    doc.text(line, marginX + 2.5, metaY + 4.3 + idx * 3.8);
  });

  const cols = data.selectedColumns;
  const count = cols.length;
  const columnWidths = computeTabularColumnWidthsMm(cols, data.rows, usableWidth);
  const fontSize = isPortrait ? (count >= 9 ? 5.6 : 6.6) : count >= 10 ? 6.3 : 7.5;
  const headFontSize = fontSize + 0.3;
  const cellPadding = isPortrait ? (count >= 9 ? 1.0 : 1.3) : 1.55;

  const isGrouped = data.isGrouped;
  const hasAnySummable = cols.some(c => c.summable);
  const firstSummableIdx = cols.findIndex(c => c.summable);
  const bodyRows: RowInput[] = [];

  if (data.rows.length === 0) {
    bodyRows.push([
      {
        content: data.emptyMessage,
        colSpan: cols.length,
        styles: {
          halign: 'center',
          fontStyle: 'italic',
          textColor: PDF_COLORS.slate600,
          fillColor: PDF_COLORS.white,
          cellPadding: 6,
        },
      },
    ]);
  } else {
    data.groups.forEach(group => {
      if (isGrouped) {
        const suffix = group.headerSummary ? `   (${group.headerSummary})` : '';
        const prefix = data.groupHeaderPrefix ? `${data.groupHeaderPrefix}: ` : '';
        bodyRows.push([
          {
            content: `${prefix}${group.label}${suffix}`,
            colSpan: cols.length,
            styles: {
              halign: 'left',
              fontStyle: 'bold',
              fontSize: Math.min(8.2, fontSize + 0.6),
              fillColor: PDF_COLORS.brand100,
              textColor: PDF_COLORS.brand900,
              cellPadding: {
                top: Math.max(1.6, cellPadding + 0.4),
                bottom: Math.max(1.6, cellPadding + 0.4),
                left: 2.5,
                right: 2.5,
              },
            },
          },
        ]);
      }

      group.rows.forEach((row, rowIdx) => {
        const rowBg: Color =
          row.rowTone === 'rose'
            ? PDF_COLORS.rose50
            : row.rowTone === 'sky'
            ? PDF_COLORS.sky50
            : row.rowTone === 'amber'
            ? PDF_COLORS.amber50
            : rowIdx % 2 === 0
            ? PDF_COLORS.white
            : PDF_COLORS.slate50;

        bodyRows.push(
          cols.map((col): CellDef => {
            const cell = row.cells[col.key] || { text: '—' };
            const styled = resolveCellStyleColors(cell.tone, cell.badge, rowBg);
            return {
              content: cell.text,
              styles: {
                halign: col.align,
                fillColor: styled.fillColor,
                textColor: styled.textColor,
                fontStyle: styled.fontStyle,
              },
            };
          })
        );
      });

      if (isGrouped && hasAnySummable && group.rows.length > 0) {
        const subRow: CellDef[] = [];
        let subLabelPlaced = false;
        const subStyle = (halign: 'left' | 'center' | 'right'): Partial<Styles> => ({
          halign,
          fontStyle: 'bold',
          fontSize: Math.min(7.8, fontSize + 0.3),
          fillColor: PDF_COLORS.brand50,
          textColor: PDF_COLORS.brand900,
          cellPadding,
        });
        const subText =
          group.subtotalLabel ||
          `Subtotal — ${group.label} (${group.rows.length} ${
            group.rows.length === 1 ? data.itemNounSingular : data.itemNounPlural
          })`;

        cols.forEach((col, idx) => {
          if (idx === 0 && firstSummableIdx > 1) {
            subRow.push({
              content: subText,
              colSpan: firstSummableIdx,
              styles: subStyle('left'),
            });
            subLabelPlaced = true;
            return;
          }
          if (idx > 0 && idx < firstSummableIdx) return;

          if (col.summable) {
            const val = group.subtotals[col.key] ?? 0;
            subRow.push({
              content: formatTotalCellValue(val, col.kind),
              styles: subStyle(col.align),
            });
          } else if (!subLabelPlaced) {
            subRow.push({
              content: `Subtotal (${group.rows.length})`,
              styles: subStyle('left'),
            });
            subLabelPlaced = true;
          } else {
            subRow.push({
              content: '',
              styles: subStyle(col.align),
            });
          }
        });
        bodyRows.push(subRow);
      }
    });
  }

  // Grand total row
  const grandTotalStyle = (halign: 'left' | 'center' | 'right'): Partial<Styles> => ({
    halign,
    fontStyle: 'bold',
    fontSize: Math.min(8.2, fontSize + 0.5),
    fillColor: PDF_COLORS.brand800,
    textColor: PDF_COLORS.white,
    cellPadding: Math.max(1.5, cellPadding + 0.3),
  });

  const countLabel = `${data.rows.length} ${
    data.rows.length === 1 ? data.itemNounSingular : data.itemNounPlural
  }`;
  const grandTotalPrefix =
    isGrouped && data.groups.length > 0
      ? `TOTAL GERAL (${countLabel} • ${data.groups.length} grupo(s))`
      : `TOTAL GERAL (${countLabel})`;

  if (!hasAnySummable) {
    bodyRows.push([
      {
        content: data.grandTotalSummaryText || grandTotalPrefix,
        colSpan: cols.length,
        styles: grandTotalStyle('left'),
      },
    ]);
  } else {
    const totalRow: CellDef[] = [];
    let labelPlaced = false;
    cols.forEach((col, idx) => {
      if (idx === 0 && firstSummableIdx > 1) {
        totalRow.push({
          content: grandTotalPrefix,
          colSpan: firstSummableIdx,
          styles: grandTotalStyle('left'),
        });
        labelPlaced = true;
        return;
      }
      if (idx > 0 && idx < firstSummableIdx) return;

      if (col.summable) {
        const val = data.grandTotals[col.key] ?? 0;
        totalRow.push({
          content: formatTotalCellValue(val, col.kind),
          styles: grandTotalStyle(col.align),
        });
      } else if (!labelPlaced) {
        totalRow.push({
          content: `TOTAL (${data.rows.length})`,
          styles: grandTotalStyle('left'),
        });
        labelPlaced = true;
      } else {
        totalRow.push({
          content: '',
          styles: grandTotalStyle(col.align),
        });
      }
    });
    bodyRows.push(totalRow);
  }

  const columnStyles: Record<number, Partial<Styles>> = {};
  cols.forEach((col, idx) => {
    columnStyles[idx] = {
      cellWidth: columnWidths[idx],
      halign: col.align,
    };
  });

  autoTable(doc, {
    startY: metaY + metaH + 2.5,
    margin: { top: 10, right: marginX, bottom: 10, left: marginX },
    tableWidth: usableWidth,
    head: [cols.map(c => c.shortLabel)],
    body: bodyRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize,
      cellPadding,
      lineColor: PDF_COLORS.slate300,
      lineWidth: 0.16,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: PDF_COLORS.brand700,
      textColor: PDF_COLORS.white,
      fontStyle: 'bold',
      fontSize: headFontSize,
      halign: 'center',
      valign: 'middle',
      cellPadding: Math.max(1.4, cellPadding + 0.2),
    },
    columnStyles,
  });

  // Optional consolidated summary sheet in PDF
  if (data.includeSummaryInPdf && data.summarySheet && data.summarySheet.rows.length > 0) {
    const sumSheet = data.summarySheet;
    const lastTable = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
    let nextY = (lastTable?.finalY ?? metaY + metaH + 20) + 6;
    if (nextY > pageHeight - 45) {
      doc.addPage();
      nextY = 12;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isPortrait ? 9 : 10);
    doc.setTextColor(...PDF_COLORS.brand900);
    doc.text(sumSheet.title, marginX, nextY);

    const sumCols = sumSheet.columns;
    const sumHasSummable = sumCols.some(c => c.summable);
    const sumFirstSummable = sumCols.findIndex(c => c.summable);

    const sumBody: RowInput[] = sumSheet.rows.map((row, idx) => {
      const rowBg = idx % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.slate50;
      return sumCols.map((col): CellDef => {
        const cell = row.cells[col.key] || { text: '—' };
        const styled = resolveCellStyleColors(cell.tone, cell.badge, rowBg);
        return {
          content: cell.text,
          styles: {
            halign: col.align,
            fillColor: styled.fillColor,
            textColor: styled.textColor,
            fontStyle: styled.fontStyle,
          },
        };
      });
    });

    const sumTotalStyle = (halign: 'left' | 'center' | 'right'): Partial<Styles> => ({
      halign,
      fontStyle: 'bold',
      fillColor: PDF_COLORS.brand800,
      textColor: PDF_COLORS.white,
    });

    if (!sumHasSummable) {
      sumBody.push([
        {
          content: sumSheet.totalLabel,
          colSpan: sumCols.length,
          styles: sumTotalStyle('left'),
        },
      ]);
    } else {
      const sumTotalRow: CellDef[] = [];
      let sumLabelPlaced = false;
      sumCols.forEach((col, idx) => {
        if (idx === 0 && sumFirstSummable > 1) {
          sumTotalRow.push({
            content: sumSheet.totalLabel,
            colSpan: sumFirstSummable,
            styles: sumTotalStyle('left'),
          });
          sumLabelPlaced = true;
          return;
        }
        if (idx > 0 && idx < sumFirstSummable) return;

        if (col.summable) {
          const val = sumSheet.totals[col.key] ?? 0;
          sumTotalRow.push({
            content: formatTotalCellValue(val, col.kind),
            styles: sumTotalStyle(col.align),
          });
        } else if (!sumLabelPlaced) {
          sumTotalRow.push({
            content: sumSheet.totalLabel,
            styles: sumTotalStyle('left'),
          });
          sumLabelPlaced = true;
        } else {
          sumTotalRow.push({
            content: '',
            styles: sumTotalStyle(col.align),
          });
        }
      });
      sumBody.push(sumTotalRow);
    }

    const sumColStyles: Record<number, Partial<Styles>> = {};
    sumCols.forEach((col, idx) => {
      sumColStyles[idx] = { halign: col.align };
    });

    autoTable(doc, {
      startY: nextY + 2.5,
      margin: { top: 10, right: marginX, bottom: 10, left: marginX },
      tableWidth: usableWidth,
      head: [sumCols.map(c => c.label)],
      body: sumBody,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: isPortrait ? 6.6 : 7.4,
        cellPadding: 1.5,
        lineColor: PDF_COLORS.slate300,
        lineWidth: 0.16,
        valign: 'middle',
      },
      headStyles: {
        fillColor: PDF_COLORS.brand700,
        textColor: PDF_COLORS.white,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: sumColStyles,
    });
  }

  // Page numbers in top right
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    const label = `${data.generatedAtLabel}  •  Página ${page} de ${totalPages}`;
    if (page === 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isPortrait ? 7.4 : 8);
      doc.setTextColor(...PDF_COLORS.slate800);
      doc.text(label, rightX, headerY + 6.3, { align: 'right' });
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...PDF_COLORS.slate600);
      doc.text(label, rightX, 6.5, { align: 'right' });
    }
  }

  return doc;
}

async function loadLogoDataUrl(): Promise<string | undefined> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return undefined;
  try {
    const res = await fetch('/logo.jpg');
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string | undefined>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export async function buildTabularReportPdfBlob(data: TabularReportData): Promise<Blob> {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildTabularReportPdfDocument(data, { logoDataUrl });
  return doc.output('blob');
}

export function downloadTabularReportPdfBlob(blob: Blob, filePrefix: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  link.href = url;
  link.download = `${filePrefix}_${yyyy}-${mm}-${dd}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
