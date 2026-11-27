import { jsPDF } from 'jspdf';
import * as autoTableMod from 'jspdf-autotable';
import type { CellDef, Color, RowInput, Styles } from 'jspdf-autotable';
import type { ProductionStatus } from '../types';
import {
  ProducaoReportColumnDef,
  ProducaoReportData,
  computeProducaoColumnWidthsMm,
  getProducaoReportCellText,
  getProducaoReportColumnTotal,
  getProducaoReportGroupTotal,
} from './producaoReportData';

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
  rose900: [136, 19, 55] as [number, number, number],
  rose700: [190, 18, 60] as [number, number, number],
  rose300: [253, 164, 175] as [number, number, number],
  rose200: [254, 205, 211] as [number, number, number],
  rose50: [255, 241, 242] as [number, number, number],
};

function getStagePdfColors(
  status: ProductionStatus,
  fallbackBg: Color
): { fillColor: Color; textColor: Color; fontStyle: 'normal' | 'bold' } {
  switch (status) {
    case 'PLANEJADA':
      return { fillColor: PDF_COLORS.slate100, textColor: PDF_COLORS.slate700, fontStyle: 'bold' };
    case 'EM_PREPARO':
      return { fillColor: PDF_COLORS.amber50, textColor: PDF_COLORS.amber800, fontStyle: 'bold' };
    case 'CONCLUIDA':
      return { fillColor: PDF_COLORS.brand50, textColor: PDF_COLORS.brand700, fontStyle: 'bold' };
    case 'CANCELADA':
      return { fillColor: PDF_COLORS.rose50, textColor: PDF_COLORS.rose700, fontStyle: 'bold' };
    default:
      return { fillColor: fallbackBg, textColor: PDF_COLORS.slate700, fontStyle: 'normal' };
  }
}

export interface ProducaoPdfBuildOptions {
  logoDataUrl?: string;
}

export function buildProducaoReportPdfDocument(
  data: ProducaoReportData,
  options?: ProducaoPdfBuildOptions
): jsPDF {
  const orientation = data.config.orientation;
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
  doc.text('Relatório de Produção', titleStartX, headerY + 12.2);

  const orientationLabel = isPortrait ? 'A4 Retrato' : 'A4 Paisagem';
  const rightX = marginX + usableWidth - 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isPortrait ? 6.4 : 7);
  doc.setTextColor(...PDF_COLORS.slate500);
  const rightMeta = `${data.totalLots} lote(s) • ${data.totalQuantity} un. • Agrupado por: ${data.groupLabel} • ${orientationLabel}`;
  doc.text(rightMeta, rightX, headerY + 11.8, { align: 'right' });

  // Slim metadata bar
  const metaY = headerY + headerH + 2;
  const searchPart = data.searchTerm ? `   |   Busca: "${data.searchTerm}"` : '';
  const metaLine = `Período: ${data.periodLabel}   |   Turnos: ${data.shiftsLabel}   |   Estágios: ${data.stagesLabel}   |   Cat.: ${data.categoryLabel}   |   Dest.: ${data.destinationLabel}   |   Ordem: ${data.sortLabel}${searchPart}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isPortrait ? 6.1 : 6.8);
  const metaLines = doc.splitTextToSize(metaLine, usableWidth - 5) as string[];
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
  const columnWidths = computeProducaoColumnWidthsMm(data, usableWidth);
  const fontSize = isPortrait ? (count >= 9 ? 5.8 : 6.6) : count >= 9 ? 6.5 : 7.6;
  const headFontSize = fontSize + 0.3;
  const cellPadding = isPortrait ? (count >= 9 ? 1.0 : 1.3) : 1.6;

  const isGrouped = data.config.groupBy !== 'nenhum';
  const hasAnySummable = cols.some(c => c.summable);
  const firstSummableIdx = cols.findIndex(c => c.summable);
  const bodyRows: RowInput[] = [];

  if (data.rows.length === 0) {
    bodyRows.push([
      {
        content: 'Nenhuma demanda de produção encontrada com os critérios selecionados.',
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
        bodyRows.push([
          {
            content: `${data.groupHeaderPrefix}: ${group.label}   (${group.totalLots} lote(s) • Total: ${group.totalQuantity} un.)`,
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
        const isCanceled = row.status === 'CANCELADA';
        const rowBg: Color = isCanceled
          ? PDF_COLORS.rose50
          : row.isReplenishment
          ? PDF_COLORS.sky50
          : rowIdx % 2 === 0
          ? PDF_COLORS.white
          : PDF_COLORS.slate50;

        bodyRows.push(
          cols.map((col: ProducaoReportColumnDef): CellDef => {
            const text = getProducaoReportCellText(row, col.key);
            let fillColor: Color = rowBg;
            let textColor: Color = isCanceled ? PDF_COLORS.rose700 : PDF_COLORS.slate900;
            let fontStyle: 'normal' | 'bold' =
              col.key === 'produtoSku' || col.key === 'quantidade' ? 'bold' : 'normal';

            if (col.key === 'quantidade') {
              textColor = isCanceled ? PDF_COLORS.rose700 : PDF_COLORS.brand800;
              fontStyle = 'bold';
            } else if (col.key === 'estagio') {
              const c = getStagePdfColors(row.status, rowBg);
              fillColor = c.fillColor;
              textColor = c.textColor;
              fontStyle = c.fontStyle;
            } else if (col.key === 'origem' && row.isReplenishment && !isCanceled) {
              textColor = PDF_COLORS.sky700;
              fontStyle = 'bold';
            }

            return {
              content: text,
              styles: {
                halign: col.align,
                fillColor,
                textColor,
                fontStyle,
              },
            };
          })
        );
      });

      if (isGrouped && hasAnySummable) {
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

        cols.forEach((col, idx) => {
          if (idx === 0 && firstSummableIdx > 1) {
            subRow.push({
              content: `Subtotal — ${group.label} (${group.totalLots} lote(s))`,
              colSpan: firstSummableIdx,
              styles: subStyle('left'),
            });
            subLabelPlaced = true;
            return;
          }
          if (idx > 0 && idx < firstSummableIdx) return;

          if (col.summable) {
            const val = getProducaoReportGroupTotal(group, col.key) ?? 0;
            subRow.push({
              content: String(val),
              styles: subStyle(col.align),
            });
          } else if (!subLabelPlaced) {
            subRow.push({
              content: `Subtotal (${group.totalLots})`,
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

  const grandTotalPrefix =
    isGrouped && data.groups.length > 0
      ? `TOTAL GERAL (${data.totalLots} lote(s) • ${data.groups.length} grupo(s))`
      : `TOTAL GERAL (${data.totalLots} lote(s))`;

  if (!hasAnySummable) {
    bodyRows.push([
      {
        content: `TOTAL GERAL: ${data.totalLots} lote(s)  •  ${data.totalQuantity} un.  •  ${data.distinctProductsCount} produto(s)`,
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
        const val = getProducaoReportColumnTotal(data, col.key) ?? 0;
        totalRow.push({
          content: String(val),
          styles: grandTotalStyle(col.align),
        });
      } else if (!labelPlaced) {
        totalRow.push({
          content: `TOTAL (${data.totalLots})`,
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
    startY: metaY + metaH + 2,
    margin: { left: marginX, right: marginX, top: 10, bottom: 8 },
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    head: [cols.map(c => c.shortLabel)],
    body: bodyRows,
    styles: {
      font: 'helvetica',
      fontSize,
      cellPadding,
      lineWidth: 0.15,
      lineColor: PDF_COLORS.slate300,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: PDF_COLORS.brand700,
      textColor: PDF_COLORS.white,
      fontStyle: 'bold',
      fontSize: headFontSize,
      lineColor: PDF_COLORS.brand800,
      lineWidth: 0.2,
      halign: 'center',
      valign: 'middle',
    },
    columnStyles,
    didParseCell: hookData => {
      if (hookData.section === 'head') {
        hookData.cell.styles.halign = 'center';
      }
    },
  });

  if (data.config.includeSummaryInPdf && data.productSummary.length > 0) {
    const lastY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
      metaY + metaH + 14;
    let startSummaryY = lastY + 7;
    if (startSummaryY > pageHeight - 28) {
      doc.addPage();
      startSummaryY = 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORS.brand900);
    doc.text(
      `Resumo Consolidado por Produto (${data.productSummary.length} produto(s))`,
      marginX,
      startSummaryY
    );

    const summaryBody: RowInput[] = data.productSummary.map((item, idx) => {
      const bg = idx % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.slate50;
      return [
        { content: item.sku, styles: { halign: 'center', fillColor: bg } },
        {
          content: item.descricao,
          styles: { halign: 'left', fontStyle: 'bold', fillColor: bg },
        },
        { content: item.categoriaNome, styles: { halign: 'left', fillColor: bg } },
        { content: item.unidadeMedida, styles: { halign: 'center', fillColor: bg } },
        { content: String(item.lotsCount), styles: { halign: 'center', fillColor: bg } },
        {
          content: String(item.totalQuantidade),
          styles: {
            halign: 'center',
            fontStyle: 'bold',
            textColor: PDF_COLORS.brand800,
            fillColor: bg,
          },
        },
        { content: item.destinosText || '—', styles: { halign: 'left', fillColor: bg } },
      ];
    });

    summaryBody.push([
      {
        content: `TOTAL CONSOLIDADO (${data.productSummary.length} produto(s))`,
        colSpan: 4,
        styles: {
          halign: 'left',
          fontStyle: 'bold',
          fillColor: PDF_COLORS.brand800,
          textColor: PDF_COLORS.white,
        },
      },
      {
        content: String(data.totalLots),
        styles: {
          halign: 'center',
          fontStyle: 'bold',
          fillColor: PDF_COLORS.brand800,
          textColor: PDF_COLORS.white,
        },
      },
      {
        content: String(data.totalQuantity),
        styles: {
          halign: 'center',
          fontStyle: 'bold',
          fillColor: PDF_COLORS.brand800,
          textColor: PDF_COLORS.white,
        },
      },
      {
        content: `${data.distinctDestinationsCount} destino(s)`,
        styles: {
          halign: 'center',
          fontStyle: 'bold',
          fillColor: PDF_COLORS.brand800,
          textColor: PDF_COLORS.white,
        },
      },
    ]);

    autoTable(doc, {
      startY: startSummaryY + 2.5,
      margin: { left: marginX, right: marginX, top: 10, bottom: 8 },
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      head: [['SKU', 'Produto / Receita', 'Categoria', 'Unid.', 'Lotes', 'Qtd. Total', 'Lojas Destino']],
      body: summaryBody,
      styles: {
        font: 'helvetica',
        fontSize: Math.min(7.4, fontSize + 0.2),
        cellPadding: 1.4,
        lineWidth: 0.15,
        lineColor: PDF_COLORS.slate300,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: PDF_COLORS.brand700,
        textColor: PDF_COLORS.white,
        fontStyle: 'bold',
        fontSize: Math.min(7.6, headFontSize + 0.2),
        lineColor: PDF_COLORS.brand800,
        lineWidth: 0.2,
        halign: 'center',
        valign: 'middle',
      },
    });
  }

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

export async function buildProducaoReportPdfBlob(
  data: ProducaoReportData
): Promise<Blob> {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildProducaoReportPdfDocument(data, { logoDataUrl });
  return doc.output('blob');
}

export function downloadProducaoReportPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  link.href = url;
  link.download = `Beju_Caramelos_Relatorio_Producao_${yyyy}-${mm}-${dd}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
