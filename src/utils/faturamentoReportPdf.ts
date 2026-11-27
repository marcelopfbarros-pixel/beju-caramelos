import { jsPDF } from 'jspdf';
import * as autoTableMod from 'jspdf-autotable';
import type { CellDef, Color, RowInput } from 'jspdf-autotable';
import type { InvoiceStatus } from '../types';
import { formatCurrencyBR } from '../components/CurrencyInput';
import {
  FaturamentoReportData,
  formatPedidoWithPaymentMethod,
} from './faturamentoReportData';
import { toLocalDateInput } from './financialReconciliation';

const autoTable = (
  autoTableMod.autoTable ??
  (autoTableMod as unknown as { default?: typeof autoTableMod.autoTable }).default ??
  autoTableMod
) as typeof autoTableMod.autoTable;

const PDF_COLORS = {
  slate900: [15, 23, 42] as [number, number, number],
  slate700: [51, 65, 85] as [number, number, number],
  slate600: [71, 85, 105] as [number, number, number],
  slate300: [203, 213, 225] as [number, number, number],
  slate100: [241, 245, 249] as [number, number, number],
  slate50: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green50: [240, 253, 244] as [number, number, number],
  brand900: [0, 79, 53] as [number, number, number],
  brand800: [6, 95, 70] as [number, number, number],
  brand700: [4, 120, 87] as [number, number, number],
  brand200: [167, 243, 208] as [number, number, number],
  brand100: [209, 250, 229] as [number, number, number],
  brand50: [236, 253, 245] as [number, number, number],
  blue900: [30, 58, 138] as [number, number, number],
  blue200: [191, 219, 254] as [number, number, number],
  blue50: [239, 246, 255] as [number, number, number],
  rose700: [190, 18, 60] as [number, number, number],
  rose200: [254, 205, 211] as [number, number, number],
  rose50: [255, 241, 242] as [number, number, number],
  teal800: [17, 94, 89] as [number, number, number],
  teal50: [240, 253, 250] as [number, number, number],
  indigo800: [55, 48, 163] as [number, number, number],
  indigo50: [238, 242, 255] as [number, number, number],
  amber800: [146, 64, 14] as [number, number, number],
  amber100: [254, 243, 199] as [number, number, number],
  amber50: [255, 251, 235] as [number, number, number],
};

function getInvoiceBadgePdfColors(
  nfStatus: InvoiceStatus
): { fillColor: Color; textColor: Color; fontStyle: 'normal' | 'bold' } {
  if (nfStatus === 'EMITIDA') {
    return {
      fillColor: PDF_COLORS.brand50,
      textColor: PDF_COLORS.brand700,
      fontStyle: 'bold',
    };
  }
  if (nfStatus === 'PENDENTE') {
    return {
      fillColor: PDF_COLORS.rose50,
      textColor: PDF_COLORS.rose700,
      fontStyle: 'bold',
    };
  }
  return {
    fillColor: PDF_COLORS.slate100,
    textColor: PDF_COLORS.slate600,
    fontStyle: 'normal',
  };
}

function getPaymentBadgePdfColors(
  label: string,
  fallbackBg: Color
): { fillColor: Color; textColor: Color; fontStyle: 'normal' | 'bold' } {
  const lower = (label || '').toLowerCase();
  if (lower.includes('pix')) {
    return {
      fillColor: PDF_COLORS.teal50,
      textColor: PDF_COLORS.teal800,
      fontStyle: 'bold',
    };
  }
  if (
    lower.includes('c6') ||
    lower.includes('sumup') ||
    lower.includes('cart') ||
    lower.includes('crédit') ||
    lower.includes('débit')
  ) {
    return {
      fillColor: PDF_COLORS.indigo50,
      textColor: PDF_COLORS.indigo800,
      fontStyle: 'bold',
    };
  }
  if (lower.includes('dinheiro')) {
    return {
      fillColor: PDF_COLORS.brand50,
      textColor: PDF_COLORS.brand700,
      fontStyle: 'bold',
    };
  }
  if (lower.includes('boleto')) {
    return {
      fillColor: PDF_COLORS.amber50,
      textColor: PDF_COLORS.amber800,
      fontStyle: 'bold',
    };
  }
  if (lower.includes('bonific')) {
    return {
      fillColor: PDF_COLORS.slate100,
      textColor: PDF_COLORS.slate600,
      fontStyle: 'normal',
    };
  }
  return {
    fillColor: fallbackBg,
    textColor: PDF_COLORS.slate700,
    fontStyle: 'normal',
  };
}

function drawSummaryCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  fill: [number, number, number],
  border: [number, number, number],
  valueColor: [number, number, number]
): void {
  doc.setFillColor(...fill);
  doc.setDrawColor(...border);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.text(label.toUpperCase(), x + 3, y + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...valueColor);
  doc.text(value, x + 3, y + 10);
}

export function buildFaturamentoPdfDocument(data: FaturamentoReportData): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const usableWidth = pageWidth - marginX * 2; // 273mm

  // Title banner
  doc.setFillColor(...PDF_COLORS.slate900);
  doc.roundedRect(marginX, 10, usableWidth, 14, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...PDF_COLORS.white);
  doc.text('BEJU CARAMELOS — RELATÓRIO DE FATURAMENTO', marginX + 4, 16.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.slate300);
  doc.text(
    'Agrupado por Unidade e Conciliação • Classificado por Data do Extrato',
    marginX + 4,
    21.5
  );

  // Filter metadata bar
  doc.setFillColor(...PDF_COLORS.blue50);
  doc.setDrawColor(...PDF_COLORS.blue200);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, 26, usableWidth, 9, 1.5, 1.5, 'FD');

  const metaLine = `Unidade: ${data.unitLabel}   |   Situação: ${data.filterLabel}   |   Período: ${data.dateFilterLabel}   |   Extrato: ${data.statementPeriodLabel}   |   Emitido em: ${data.generatedAtLabel}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.blue900);
  const fittedMeta = doc.splitTextToSize(metaLine, usableWidth - 6)[0] || metaLine;
  doc.text(fittedMeta, marginX + 3, 31.6);

  // KPI cards strip
  const cardGap = 4;
  const cardWidth = (usableWidth - cardGap * 3) / 4;
  const cardY = 37;
  const cardH = 12.5;
  const hasGrandSaldo = data.grandTotalSaldo > 0.009;

  drawSummaryCard(
    doc,
    marginX,
    cardY,
    cardWidth,
    cardH,
    'Pedidos / Unidades',
    `${data.totalOrders} ped. • ${data.groups.length} unid.`,
    PDF_COLORS.slate50,
    PDF_COLORS.slate300,
    PDF_COLORS.slate900
  );
  drawSummaryCard(
    doc,
    marginX + (cardWidth + cardGap),
    cardY,
    cardWidth,
    cardH,
    'Valor Total',
    `R$ ${formatCurrencyBR(data.grandTotalValor)}`,
    PDF_COLORS.slate50,
    PDF_COLORS.slate300,
    PDF_COLORS.slate900
  );
  drawSummaryCard(
    doc,
    marginX + (cardWidth + cardGap) * 2,
    cardY,
    cardWidth,
    cardH,
    'Valor Recebido',
    `R$ ${formatCurrencyBR(data.grandTotalRecebido)}`,
    PDF_COLORS.brand50,
    PDF_COLORS.brand200,
    PDF_COLORS.brand700
  );
  drawSummaryCard(
    doc,
    marginX + (cardWidth + cardGap) * 3,
    cardY,
    cardWidth,
    cardH,
    'Saldo a Receber',
    `R$ ${formatCurrencyBR(data.grandTotalSaldo)}`,
    hasGrandSaldo ? PDF_COLORS.rose50 : PDF_COLORS.brand50,
    hasGrandSaldo ? PDF_COLORS.rose200 : PDF_COLORS.brand200,
    hasGrandSaldo ? PDF_COLORS.rose700 : PDF_COLORS.brand700
  );

  // Table rows
  const bodyRows: RowInput[] = [];

  if (data.groups.length === 0) {
    bodyRows.push([
      {
        content: 'Nenhum pedido encontrado para os filtros do Relatório de Faturamento.',
        colSpan: 8,
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
    for (const group of data.groups) {
      const unitHeaderCell: CellDef = {
        content: `UNIDADE: ${group.unidadeNome.toUpperCase()}  (${group.rows.length} pedido(s))`,
        colSpan: 8,
        styles: {
          halign: 'left',
          fontStyle: 'bold',
          fontSize: 8.5,
          fillColor: PDF_COLORS.brand100,
          textColor: PDF_COLORS.brand900,
          cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        },
      };
      bodyRows.push([unitHeaderCell]);

      for (const subgroup of group.subgroups) {
        const isSubConc = subgroup.key === 'CONCILIADO';
        const subHeaderFill = isSubConc ? PDF_COLORS.brand50 : PDF_COLORS.amber50;
        const subHeaderText = isSubConc ? PDF_COLORS.brand700 : PDF_COLORS.amber800;

        bodyRows.push([
          {
            content: `${subgroup.label.toUpperCase()}  (${subgroup.rows.length} pedido(s))`,
            colSpan: 8,
            styles: {
              halign: 'left',
              fontStyle: 'bold',
              fontSize: 8,
              fillColor: subHeaderFill,
              textColor: subHeaderText,
              cellPadding: { top: 2, bottom: 2, left: 4, right: 3 },
            },
          },
        ]);

        subgroup.rows.forEach((row, idx) => {
          const zebraBg = idx % 2 === 0 ? PDF_COLORS.white : PDF_COLORS.slate50;
          const valRecebido = Number(row.valorRecebido) || 0;
          const valSaldo = Number(row.saldoAReceber) || 0;
          const hasOpen = valSaldo > 0.009;
          const paymentColors = getPaymentBadgePdfColors(
            row.formaPagamentoFinanceiro,
            zebraBg
          );
          const nfLabel =
            row.nfStatusLabel ||
            (row.nfStatus === 'EMITIDA'
              ? 'Emitida'
              : row.nfStatus === 'DISPENSADA'
              ? 'Dispensada'
              : 'A emitir');
          const nfColors = getInvoiceBadgePdfColors(row.nfStatus);

          bodyRows.push([
            {
              content: row.dataExtratoLabel || '—',
              styles: { halign: 'center', fillColor: zebraBg, textColor: PDF_COLORS.slate700 },
            },
            {
              content: formatPedidoWithPaymentMethod(
                row.numeroPedido,
                row.formaPagamentoPedido
              ),
              styles: {
                halign: 'center',
                fontStyle: 'bold',
                fillColor: zebraBg,
                textColor: PDF_COLORS.slate900,
              },
            },
            {
              content: row.clienteNome,
              styles: { halign: 'left', fillColor: zebraBg, textColor: PDF_COLORS.slate900 },
            },
            {
              content: `R$ ${formatCurrencyBR(row.valor)}`,
              styles: {
                halign: 'right',
                fontStyle: 'bold',
                fillColor: zebraBg,
                textColor: PDF_COLORS.slate900,
              },
            },
            {
              content: `R$ ${formatCurrencyBR(valRecebido)}`,
              styles: {
                halign: 'right',
                fontStyle: valRecebido > 0 ? 'bold' : 'normal',
                fillColor: zebraBg,
                textColor: valRecebido > 0 ? PDF_COLORS.brand700 : PDF_COLORS.slate600,
              },
            },
            {
              content: `R$ ${formatCurrencyBR(valSaldo)}`,
              styles: {
                halign: 'right',
                fontStyle: hasOpen ? 'bold' : 'normal',
                fillColor: hasOpen ? PDF_COLORS.rose50 : zebraBg,
                textColor: hasOpen ? PDF_COLORS.rose700 : PDF_COLORS.brand700,
              },
            },
            {
              content: row.formaPagamentoFinanceiro || '—',
              styles: {
                halign: 'center',
                fontStyle: paymentColors.fontStyle,
                fillColor: paymentColors.fillColor,
                textColor: paymentColors.textColor,
              },
            },
            {
              content: nfLabel,
              styles: {
                halign: 'center',
                fontStyle: nfColors.fontStyle,
                fillColor: nfColors.fillColor,
                textColor: nfColors.textColor,
              },
            },
          ]);
        });

        const subHasOpen = subgroup.totalSaldo > 0.009;
        const subSubtotalFill = isSubConc ? PDF_COLORS.green50 : PDF_COLORS.amber100;
        const subSubtotalText = isSubConc ? PDF_COLORS.brand900 : PDF_COLORS.amber800;

        bodyRows.push([
          {
            content: `Subtotal ${subgroup.label} (${subgroup.rows.length} pedido(s))`,
            colSpan: 3,
            styles: {
              halign: 'left',
              fontStyle: 'bold',
              fontSize: 7.8,
              fillColor: subSubtotalFill,
              textColor: subSubtotalText,
            },
          },
          {
            content: `R$ ${formatCurrencyBR(subgroup.totalValor)}`,
            styles: {
              halign: 'right',
              fontStyle: 'bold',
              fontSize: 7.8,
              fillColor: subSubtotalFill,
              textColor: subSubtotalText,
            },
          },
          {
            content: `R$ ${formatCurrencyBR(subgroup.totalRecebido)}`,
            styles: {
              halign: 'right',
              fontStyle: 'bold',
              fontSize: 7.8,
              fillColor: subSubtotalFill,
              textColor: subSubtotalText,
            },
          },
          {
            content: `R$ ${formatCurrencyBR(subgroup.totalSaldo)}`,
            styles: {
              halign: 'right',
              fontStyle: 'bold',
              fontSize: 7.8,
              fillColor: subSubtotalFill,
              textColor: subHasOpen ? PDF_COLORS.rose700 : subSubtotalText,
            },
          },
          {
            content: '',
            colSpan: 2,
            styles: {
              fillColor: subSubtotalFill,
            },
          },
        ]);
      }

      const subHasOpen = group.totalSaldo > 0.009;
      bodyRows.push([
        {
          content: `Subtotal Unidade — ${group.unidadeNome} (${group.rows.length} pedido(s))`,
          colSpan: 3,
          styles: {
            halign: 'left',
            fontStyle: 'bold',
            fontSize: 8.2,
            fillColor: PDF_COLORS.brand100,
            textColor: PDF_COLORS.brand900,
          },
        },
        {
          content: `R$ ${formatCurrencyBR(group.totalValor)}`,
          styles: {
            halign: 'right',
            fontStyle: 'bold',
            fontSize: 8.2,
            fillColor: PDF_COLORS.brand100,
            textColor: PDF_COLORS.brand900,
          },
        },
        {
          content: `R$ ${formatCurrencyBR(group.totalRecebido)}`,
          styles: {
            halign: 'right',
            fontStyle: 'bold',
            fontSize: 8.2,
            fillColor: PDF_COLORS.brand100,
            textColor: PDF_COLORS.brand900,
          },
        },
        {
          content: `R$ ${formatCurrencyBR(group.totalSaldo)}`,
          styles: {
            halign: 'right',
            fontStyle: 'bold',
            fontSize: 8.2,
            fillColor: PDF_COLORS.brand100,
            textColor: subHasOpen ? PDF_COLORS.rose700 : PDF_COLORS.brand900,
          },
        },
        {
          content: '',
          colSpan: 2,
          styles: {
            fillColor: PDF_COLORS.brand100,
          },
        },
      ]);
    }
  }

  // Grand total row
  bodyRows.push([
    {
      content: `TOTAL GERAL (${data.totalOrders} pedido(s) • ${data.groups.length} unidade(s))`,
      colSpan: 3,
      styles: {
        halign: 'left',
        fontStyle: 'bold',
        fontSize: 9,
        fillColor: PDF_COLORS.brand800,
        textColor: PDF_COLORS.white,
        cellPadding: 3,
      },
    },
    {
      content: `R$ ${formatCurrencyBR(data.grandTotalValor)}`,
      styles: {
        halign: 'right',
        fontStyle: 'bold',
        fontSize: 9,
        fillColor: PDF_COLORS.brand800,
        textColor: PDF_COLORS.white,
        cellPadding: 3,
      },
    },
    {
      content: `R$ ${formatCurrencyBR(data.grandTotalRecebido)}`,
      styles: {
        halign: 'right',
        fontStyle: 'bold',
        fontSize: 9,
        fillColor: PDF_COLORS.brand800,
        textColor: PDF_COLORS.white,
        cellPadding: 3,
      },
    },
    {
      content: `R$ ${formatCurrencyBR(data.grandTotalSaldo)}`,
      styles: {
        halign: 'right',
        fontStyle: 'bold',
        fontSize: 9,
        fillColor: PDF_COLORS.brand800,
        textColor: PDF_COLORS.white,
        cellPadding: 3,
      },
    },
    {
      content: '',
      colSpan: 2,
      styles: {
        fillColor: PDF_COLORS.brand800,
        cellPadding: 3,
      },
    },
  ]);

  autoTable(doc, {
    startY: 52,
    margin: { left: marginX, right: marginX, bottom: 14 },
    theme: 'grid',
    head: [
      [
        'Data do Extrato',
        'Pedido',
        'Cliente',
        'Valor',
        'Valor Recebido',
        'Saldo a Receber',
        'Forma de Pagamento',
        'Nota Fiscal',
      ],
    ],
    body: bodyRows,
    styles: {
      font: 'helvetica',
      fontSize: 7.8,
      cellPadding: 2,
      lineWidth: 0.15,
      lineColor: PDF_COLORS.slate300,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: PDF_COLORS.brand700,
      textColor: PDF_COLORS.white,
      fontStyle: 'bold',
      fontSize: 8.2,
      lineColor: PDF_COLORS.brand800,
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 25, halign: 'center' },
      1: { cellWidth: 37, halign: 'center' },
      2: { cellWidth: 60, halign: 'left' },
      3: { cellWidth: 29, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 30, halign: 'right' },
      6: { cellWidth: 36, halign: 'center' },
      7: { cellWidth: 26, halign: 'center' },
    },
    didParseCell: hookData => {
      if (hookData.section === 'head') {
        const colIdx = hookData.column.index;
        if (colIdx === 2) {
          hookData.cell.styles.halign = 'left';
        } else if (colIdx === 3 || colIdx === 4 || colIdx === 5) {
          hookData.cell.styles.halign = 'right';
        } else {
          hookData.cell.styles.halign = 'center';
        }
      }
    },
  });

  // Page footer
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...PDF_COLORS.slate300);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.slate600);
    doc.text('Beju Caramelos • Relatório de Faturamento', marginX, pageHeight - 6);
    doc.text(`Página ${page} de ${totalPages}`, pageWidth - marginX, pageHeight - 6, {
      align: 'right',
    });
  }

  return doc;
}

export function buildFaturamentoPdfBlob(data: FaturamentoReportData): Blob {
  const doc = buildFaturamentoPdfDocument(data);
  return doc.output('blob');
}

export function downloadFaturamentoPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateSuffix = toLocalDateInput() || new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `Beju_Caramelos_Relatorio_Faturamento_${dateSuffix}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFaturamentoPdf(data: FaturamentoReportData): void {
  const doc = buildFaturamentoPdfDocument(data);
  const dateSuffix = toLocalDateInput() || new Date().toISOString().slice(0, 10);
  doc.save(`Beju_Caramelos_Relatorio_Faturamento_${dateSuffix}.pdf`);
}
