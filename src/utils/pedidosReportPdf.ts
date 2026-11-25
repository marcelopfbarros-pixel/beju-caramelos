import { jsPDF } from 'jspdf';
import * as autoTableMod from 'jspdf-autotable';
import type { CellDef, Color, RowInput, Styles } from 'jspdf-autotable';
import { formatCurrencyBR } from '../components/CurrencyInput';
import type { OrderStatus, PaymentStatus } from '../types';
import {
  PedidosReportCombinedParts,
  PedidosReportColumnDef,
  PedidosReportData,
  computeBalancedColumnWidthsMm,
  getPedidosReportColumnTotal,
  getPedidosReportCombinedParts,
  getPedidosReportOrderCellText,
} from './pedidosReportData';

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
  blue900: [30, 58, 138] as [number, number, number],
  blue700: [29, 78, 216] as [number, number, number],
  blue200: [191, 219, 254] as [number, number, number],
  blue50: [239, 246, 255] as [number, number, number],
  amber800: [146, 64, 14] as [number, number, number],
  amber50: [255, 251, 235] as [number, number, number],
  sky700: [3, 105, 161] as [number, number, number],
  sky50: [240, 249, 255] as [number, number, number],
  indigo800: [55, 48, 163] as [number, number, number],
  indigo50: [238, 242, 255] as [number, number, number],
  purple800: [107, 33, 168] as [number, number, number],
  purple50: [250, 245, 255] as [number, number, number],
  rose900: [136, 19, 55] as [number, number, number],
  rose700: [190, 18, 60] as [number, number, number],
  rose600: [225, 29, 72] as [number, number, number],
  rose300: [253, 164, 175] as [number, number, number],
  rose200: [254, 205, 211] as [number, number, number],
  rose50: [255, 241, 242] as [number, number, number],
};

interface ComputedPdfLayout {
  columnWidths: number[];
  fontSize: number;
  headFontSize: number;
  cellPadding: number;
}

function computePdfColumnLayout(
  data: PedidosReportData,
  usableWidth: number,
  orientation: 'portrait' | 'landscape'
): ComputedPdfLayout {
  const columns = data.selectedColumns;
  const count = columns.length;
  const columnWidths = computeBalancedColumnWidthsMm(data, usableWidth);
  const totalWeight = columns.reduce((s, c) => s + c.pdfWeight, 0) || 1;
  const density = usableWidth / totalWeight;

  let fontSize = 7.2;
  let headFontSize = 7.4;
  let cellPadding = 1.45;

  if (count <= 8) {
    if (orientation === 'landscape') {
      fontSize = 7.6;
      headFontSize = 7.8;
      cellPadding = 1.6;
    } else {
      fontSize = 6.4;
      headFontSize = 6.6;
      cellPadding = 1.15;
    }
  } else if (density >= 1.7) {
    fontSize = 7.2;
    headFontSize = 7.4;
    cellPadding = 1.45;
  } else if (density >= 1.25) {
    fontSize = 6.5;
    headFontSize = 6.7;
    cellPadding = 1.25;
  } else if (density >= 0.95) {
    fontSize = 5.8;
    headFontSize = 6.0;
    cellPadding = 1.05;
  } else {
    fontSize = 5.2;
    headFontSize = 5.4;
    cellPadding = 0.85;
  }

  if (orientation === 'portrait' && count >= 10 && fontSize > 5.8) {
    fontSize = count >= 14 ? 5.0 : 5.6;
    headFontSize = fontSize + 0.2;
    cellPadding = count >= 14 ? 0.8 : 1.0;
  }

  return { columnWidths, fontSize, headFontSize, cellPadding };
}

function getOrderStatusPdfColors(
  status: OrderStatus,
  fallbackBg: Color
): { fillColor: Color; textColor: Color; fontStyle: 'normal' | 'bold' } {
  switch (status) {
    case 'PENDENTE':
      return { fillColor: PDF_COLORS.amber50, textColor: PDF_COLORS.amber800, fontStyle: 'bold' };
    case 'CONFIRMADO':
      return { fillColor: PDF_COLORS.brand50, textColor: PDF_COLORS.brand700, fontStyle: 'bold' };
    case 'EM_PRODUCAO':
      return { fillColor: PDF_COLORS.blue50, textColor: PDF_COLORS.blue700, fontStyle: 'bold' };
    case 'PRONTO':
      return { fillColor: PDF_COLORS.purple50, textColor: PDF_COLORS.purple800, fontStyle: 'bold' };
    case 'EM_ROTA':
      return { fillColor: PDF_COLORS.indigo50, textColor: PDF_COLORS.indigo800, fontStyle: 'bold' };
    case 'ENTREGUE':
      return { fillColor: PDF_COLORS.slate100, textColor: PDF_COLORS.slate700, fontStyle: 'bold' };
    case 'CANCELADO':
      return { fillColor: PDF_COLORS.rose50, textColor: PDF_COLORS.rose700, fontStyle: 'bold' };
    default:
      return { fillColor: fallbackBg, textColor: PDF_COLORS.slate700, fontStyle: 'normal' };
  }
}

function getPaymentStatusPdfColors(
  status: PaymentStatus
): { fillColor: Color; textColor: Color; fontStyle: 'normal' | 'bold' } {
  if (status === 'PAGO') {
    return { fillColor: PDF_COLORS.brand50, textColor: PDF_COLORS.brand700, fontStyle: 'bold' };
  }
  if (status === 'SINAL') {
    return { fillColor: PDF_COLORS.sky50, textColor: PDF_COLORS.sky700, fontStyle: 'bold' };
  }
  return { fillColor: PDF_COLORS.amber50, textColor: PDF_COLORS.amber800, fontStyle: 'bold' };
}

export interface PedidosPdfBuildOptions {
  logoDataUrl?: string;
}

export function buildPedidosReportPdfDocument(
  data: PedidosReportData,
  options?: PedidosPdfBuildOptions
): jsPDF {
  const orientation = data.config.orientation;
  const isPortrait = orientation === 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 8;
  const usableWidth = pageWidth - marginX * 2;

  // Standard PrintReportHeader-style rose banner (matching all other reports in the system)
  const headerY = 8;
  const headerH = 15.5;
  doc.setFillColor(...PDF_COLORS.rose50);
  doc.setDrawColor(...PDF_COLORS.rose200);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, headerY, usableWidth, headerH, 2, 2, 'FD');

  // Bottom rose-300 accent border matching PrintReportHeader border-b-2 border-rose-300
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
      // ignore invalid image payload
    }
  }

  // Brand title (without PEDIDOS badge)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isPortrait ? 11 : 12.5);
  doc.setTextColor(...PDF_COLORS.slate900);
  doc.text('Beju Caramelos', titleStartX, headerY + 6.5);

  // Report subtitle in rose-900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isPortrait ? 8.8 : 9.6);
  doc.setTextColor(...PDF_COLORS.rose900);
  doc.text('Relatório de Pedidos', titleStartX, headerY + 12.2);

  // Right-aligned grouping/sort summary (date + page number drawn post-layout on every page)
  const orientationLabel = isPortrait ? 'A4 Retrato' : 'A4 Paisagem';
  const rightX = marginX + usableWidth - 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isPortrait ? 6.4 : 7);
  doc.setTextColor(...PDF_COLORS.slate500);
  const rightMeta = `${data.totalOrders} pedido(s) • Agrupado por: ${data.groupLabel} • ${orientationLabel}`;
  doc.text(rightMeta, rightX, headerY + 11.8, { align: 'right' });

  // Slim filter metadata strip directly below header (no KPI cards above table)
  const metaY = headerY + headerH + 2;
  const metaH = 7.4;
  doc.setFillColor(...PDF_COLORS.slate50);
  doc.setDrawColor(...PDF_COLORS.slate300);
  doc.setLineWidth(0.2);
  doc.roundedRect(marginX, metaY, usableWidth, metaH, 1.2, 1.2, 'FD');

  const searchPart = data.searchTerm ? `   |   Busca: "${data.searchTerm}"` : '';
  const metaLine = `Período (Entrega): ${data.periodLabel}   |   Unidade: ${data.unitLabel}   |   Status: ${data.statusLabel}   |   Ordem: ${data.sortLabel}${searchPart}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isPortrait ? 6.3 : 7.0);
  doc.setTextColor(...PDF_COLORS.slate700);
  const fittedMeta = doc.splitTextToSize(metaLine, usableWidth - 5)[0] || metaLine;
  doc.text(fittedMeta, marginX + 2.5, metaY + 4.8);

  // Table layout & body construction
  const cols = data.selectedColumns;
  const layout = computePdfColumnLayout(data, usableWidth, orientation);
  const bodyRows: RowInput[] = [];
  const combinedCells = new Map<
    string,
    PedidosReportCombinedParts & { align: 'left' | 'center' | 'right' }
  >();
  const hasAnySummable = cols.some(c => c.summable);
  const firstSummableIdx = cols.findIndex(c => c.summable);
  const isGrouped = data.config.groupBy !== 'nenhum';

  if (data.orders.length === 0) {
    bodyRows.push([
      {
        content: 'Nenhum pedido encontrado com os critérios selecionados.',
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
            content: `${data.groupHeaderPrefix}: ${group.label}   (${group.totalOrders} ped. • ${group.totalItemQuantity} item(ns))`,
            colSpan: cols.length,
            styles: {
              halign: 'left',
              fontStyle: 'bold',
              fontSize: Math.min(8.2, layout.fontSize + 0.6),
              fillColor: PDF_COLORS.brand100,
              textColor: PDF_COLORS.brand900,
              cellPadding: {
                top: Math.max(1.6, layout.cellPadding + 0.4),
                bottom: Math.max(1.6, layout.cellPadding + 0.4),
                left: 2.5,
                right: 2.5,
              },
            },
          },
        ]);
      }

      group.orders.forEach((orderRow, orderIdx) => {
        const zebraBg = orderRow.isReplenishment
          ? PDF_COLORS.sky50
          : orderIdx % 2 === 0
          ? PDF_COLORS.white
          : PDF_COLORS.slate50;

        const itemsToRender =
          data.expandItems && orderRow.itens.length > 0 ? orderRow.itens : [undefined];
        const spanCount = itemsToRender.length;

        const buildCell = (
          col: PedidosReportColumnDef,
          item: (typeof itemsToRender)[number],
          rowSpan?: number
        ): CellDef => {
          const text = getPedidosReportOrderCellText(orderRow, col.key, item);
          let fillColor: Color = zebraBg;
          let textColor: Color = PDF_COLORS.slate900;
          let fontStyle: 'normal' | 'bold' = 'normal';

          if (col.key === 'quantidadeItem') {
            fontStyle = 'bold';
            textColor = PDF_COLORS.brand800;
          } else if (col.key === 'status') {
            const c = getOrderStatusPdfColors(orderRow.status, zebraBg);
            fillColor = c.fillColor;
            textColor = c.textColor;
            fontStyle = c.fontStyle;
          } else if (col.key === 'statusPagamento') {
            const c = getPaymentStatusPdfColors(orderRow.statusPagamento);
            fillColor = c.fillColor;
            textColor = c.textColor;
            fontStyle = c.fontStyle;
          } else if (col.key === 'valorTotal') {
            fontStyle = 'bold';
          } else if (col.key === 'saldoAReceber') {
            if (orderRow.saldoAReceber > 0.009) {
              fillColor = PDF_COLORS.rose50;
              textColor = PDF_COLORS.rose700;
              fontStyle = 'bold';
            } else {
              textColor = PDF_COLORS.brand700;
            }
          } else if (col.key === 'observacoes' || col.key === 'detalheEntrega') {
            textColor = text === '—' ? PDF_COLORS.slate600 : PDF_COLORS.slate700;
          }

          const cell: CellDef = {
            content: text,
            styles: {
              halign: col.align,
              fillColor,
              textColor,
              fontStyle,
            },
          };
          if (rowSpan && rowSpan > 1) {
            cell.rowSpan = rowSpan;
          }
          return cell;
        };

        itemsToRender.forEach((item, subIdx) => {
          if (subIdx === 0) {
            const bodyRowIdx = bodyRows.length;
            cols.forEach((col, colIdx) => {
              const parts = getPedidosReportCombinedParts(orderRow, col.key);
              if (parts) {
                combinedCells.set(`${bodyRowIdx}:${colIdx}`, {
                  ...parts,
                  align: col.align,
                });
              }
            });
            bodyRows.push(
              cols.map(col => buildCell(col, item, col.level === 'order' ? spanCount : undefined))
            );
          } else {
            // Only item-level columns; jspdf-autotable skips active rowSpan slots automatically
            bodyRows.push(
              cols.filter(col => col.level === 'item').map(col => buildCell(col, item))
            );
          }
        });
      });
    });
  }

  // Grand total row
  const grandTotalStyle = (halign: 'left' | 'center' | 'right'): Partial<Styles> => ({
    halign,
    fontStyle: 'bold',
    fontSize: Math.min(8.2, layout.fontSize + 0.5),
    fillColor: PDF_COLORS.brand800,
    textColor: PDF_COLORS.white,
    cellPadding: Math.max(1.5, layout.cellPadding + 0.3),
  });

  const grandTotalPrefix =
    isGrouped && data.groups.length > 0
      ? `TOTAL GERAL (${data.totalOrders} ped. • ${data.groups.length} grupo(s))`
      : `TOTAL GERAL (${data.totalOrders} ped.)`;

  if (!hasAnySummable) {
    bodyRows.push([
      {
        content: `TOTAL GERAL: ${data.totalOrders} pedido(s)  •  ${data.totalItemQuantity} item(ns)  •  R$ ${formatCurrencyBR(data.grandTotalValor)}`,
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
      if (idx > 0 && idx < firstSummableIdx) {
        return;
      }

      if (col.summable) {
        const val = getPedidosReportColumnTotal(data, col.key) ?? 0;
        const formatted =
          col.kind === 'currency' ? `R$ ${formatCurrencyBR(val)}` : String(val);
        totalRow.push({
          content: formatted,
          styles: grandTotalStyle(col.align),
        });
      } else if (!labelPlaced) {
        totalRow.push({
          content: `TOTAL (${data.totalOrders})`,
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
      cellWidth: layout.columnWidths[idx],
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
      fontSize: layout.fontSize,
      cellPadding: layout.cellPadding,
      lineWidth: 0.15,
      lineColor: PDF_COLORS.slate300,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: PDF_COLORS.brand700,
      textColor: PDF_COLORS.white,
      fontStyle: 'bold',
      fontSize: layout.headFontSize,
      lineColor: PDF_COLORS.brand800,
      lineWidth: 0.2,
      halign: 'center',
      valign: 'middle',
    },
    columnStyles,
    didParseCell: hookData => {
      if (hookData.section === 'head') {
        hookData.cell.styles.halign = 'center';
      } else if (
        hookData.section === 'body' &&
        combinedCells.has(`${hookData.row.index}:${hookData.column.index}`)
      ) {
        // Use bold during autoTable height measurement so bold Line 1 never clips
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
    willDrawCell: hookData => {
      if (
        hookData.section === 'body' &&
        combinedCells.has(`${hookData.row.index}:${hookData.column.index}`)
      ) {
        // Clear default text so background/borders draw cleanly before custom rich drawing
        hookData.cell.text = [];
      }
    },
    didDrawCell: hookData => {
      if (hookData.section !== 'body') return;
      const entry = combinedCells.get(`${hookData.row.index}:${hookData.column.index}`);
      if (!entry) return;

      const padX = layout.cellPadding;
      const maxW = Math.max(4, hookData.cell.width - padX * 2);
      const primaryFontSize = layout.fontSize;
      const secondaryFontSize = Math.max(4.7, layout.fontSize - 0.6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(primaryFontSize);
      const primaryLines = doc.splitTextToSize(entry.primary, maxW) as string[];

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(secondaryFontSize);
      const secondaryLines = doc.splitTextToSize(entry.secondary, maxW) as string[];

      const lineH1 = primaryFontSize * 0.405;
      const lineH2 = secondaryFontSize * 0.405;
      const totalH = primaryLines.length * lineH1 + secondaryLines.length * lineH2;
      let cursorY =
        hookData.cell.y +
        Math.max(padX, (hookData.cell.height - totalH) / 2) +
        lineH1 * 0.78;

      const anchorX =
        entry.align === 'center'
          ? hookData.cell.x + hookData.cell.width / 2
          : entry.align === 'right'
          ? hookData.cell.x + hookData.cell.width - padX
          : hookData.cell.x + padX;
      const textOpts =
        entry.align === 'center'
          ? { align: 'center' as const }
          : entry.align === 'right'
          ? { align: 'right' as const }
          : undefined;

      // Line 1: Bold primary text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(primaryFontSize);
      doc.setTextColor(...PDF_COLORS.slate900);
      primaryLines.forEach(line => {
        doc.text(line, anchorX, cursorY, textOpts);
        cursorY += lineH1;
      });

      // Line 2: Regular secondary text
      const secColor =
        entry.secondaryTone === 'blue'
          ? PDF_COLORS.blue700
          : entry.secondaryTone === 'amber'
          ? PDF_COLORS.amber800
          : PDF_COLORS.slate600;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(secondaryFontSize);
      doc.setTextColor(...secColor);
      secondaryLines.forEach(line => {
        doc.text(line, anchorX, cursorY, textOpts);
        cursorY += lineH2;
      });
    },
  });

  // Draw date + page indicator in header (page/pages moved from footer to title right of date; no footer)
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

export async function buildPedidosReportPdfBlob(
  data: PedidosReportData
): Promise<Blob> {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildPedidosReportPdfDocument(data, { logoDataUrl });
  return doc.output('blob');
}

export function downloadPedidosReportPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  link.href = url;
  link.download = `Beju_Caramelos_Relatorio_Pedidos_${yyyy}-${mm}-${dd}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPedidosReportPdf(data: PedidosReportData): Promise<void> {
  const blob = await buildPedidosReportPdfBlob(data);
  downloadPedidosReportPdfBlob(blob);
}
