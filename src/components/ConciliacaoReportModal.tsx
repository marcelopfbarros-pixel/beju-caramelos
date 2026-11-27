import React, { useMemo, useState } from 'react';
import {
  BankStatementEntry,
  Order,
  OrderFinancialRecord,
  ReconciliationPeriodLock,
} from '../types';
import { formatCurrencyBR } from './CurrencyInput';
import { formatDateBR } from '../utils/financialReconciliation';
import { buildConciliacaoReportModel } from '../utils/conciliacaoReportExcel';
import { FileSpreadsheet, Printer, X } from 'lucide-react';

interface ConciliacaoReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  competencia: string;
  statements: BankStatementEntry[];
  orders: Order[];
  financialRecords: OrderFinancialRecord[];
  periodLock?: ReconciliationPeriodLock;
  channelNames: string[];
}

export const ConciliacaoReportModal: React.FC<ConciliacaoReportModalProps> = ({
  isOpen,
  onClose,
  competencia,
  statements,
  orders,
  financialRecords,
  periodLock,
  channelNames,
}) => {
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const model = useMemo(() => {
    if (!isOpen) return null;
    return buildConciliacaoReportModel({
      competencia,
      statements,
      orders,
      financialRecords,
      periodLock,
      channelNames,
    });
  }, [isOpen, competencia, statements, orders, financialRecords, periodLock, channelNames]);

  if (!isOpen || !model) return null;

  const handleExportExcel = async () => {
    setExportingXlsx(true);
    try {
      const {
        buildConciliacaoReportXlsxBuffer,
        downloadConciliacaoReportExcelBuffer,
      } = await import('../utils/conciliacaoReportExcel');
      const buffer = buildConciliacaoReportXlsxBuffer(model);
      downloadConciliacaoReportExcelBuffer(buffer, model.competencia);
    } finally {
      setExportingXlsx(false);
    }
  };

  const handlePrintPdf = () => {
    const lockTxt =
      model.periodLock?.status === 'FECHADO'
        ? `FECHADO (${model.periodLock.fechadoPor || 'ADMIN'})`
        : 'ABERTO';

    const escapeHtml = (v: string) =>
      v
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><title>Relatório de Conciliação ${escapeHtml(model.competenciaLabel)}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: Arial, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
        h1 { font-size: 16px; margin: 0 0 4px; color: #065f46; }
        .meta { color: #475569; margin-bottom: 12px; font-size: 10px; }
        h2 { font-size: 12px; margin: 14px 0 6px; padding: 4px 8px; background: #ecfdf5; border-left: 3px solid #047857; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; }
        th { background: #047857; color: #fff; font-size: 10px; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .tot { background: #065f46; color: #fff; font-weight: bold; }
      </style></head><body>
      <h1>Beju Caramelos — Relatório de Conciliação (${escapeHtml(model.competenciaLabel)})</h1>
      <div class="meta">Situação do Período: <strong>${escapeHtml(lockTxt)}</strong> • Emitido em ${escapeHtml(model.generatedAtLabel)}</div>
      <h2>1. Resumo por Canal</h2>
      <table>
        <thead><tr><th>Canal</th><th>Créditos</th><th class="num">Bruto</th><th class="num">Taxa MDR</th><th class="num">Líquido</th><th class="num">Conciliado</th><th class="num">A Conciliar</th></tr></thead>
        <tbody>
          ${model.channelRows
            .map(
              r =>
                `<tr><td><strong>${escapeHtml(r.channel)}</strong></td><td>${r.count}</td><td class="num">R$ ${formatCurrencyBR(r.gross)}</td><td class="num">R$ ${formatCurrencyBR(r.fee)}</td><td class="num">R$ ${formatCurrencyBR(r.net)}</td><td class="num">R$ ${formatCurrencyBR(r.conciliated)}</td><td class="num">R$ ${formatCurrencyBR(r.pending)}</td></tr>`
            )
            .join('')}
          <tr class="tot"><td>TOTAL GERAL</td><td>${model.totals.count}</td><td class="num">R$ ${formatCurrencyBR(model.totals.gross)}</td><td class="num">R$ ${formatCurrencyBR(model.totals.fee)}</td><td class="num">R$ ${formatCurrencyBR(model.totals.net)}</td><td class="num">R$ ${formatCurrencyBR(model.totals.conciliated)}</td><td class="num">R$ ${formatCurrencyBR(model.totals.pending)}</td></tr>
        </tbody>
      </table>
      <h2>2. Lançamentos Conciliados &amp; Auditoria (${model.conciliatedRows.length})</h2>
      <table>
        <thead><tr><th>Data</th><th>Canal</th><th>Pagador</th><th>Pedido(s)</th><th>Cliente(s)</th><th class="num">Bruto</th><th class="num">MDR</th><th>Nota Fiscal</th><th>Auditoria</th></tr></thead>
        <tbody>
          ${
            model.conciliatedRows.length === 0
              ? '<tr><td colspan="9">Nenhum lançamento conciliado neste período.</td></tr>'
              : model.conciliatedRows
                  .map(
                    r =>
                      `<tr><td>${escapeHtml(formatDateBR(r.statement.dataExtrato))}</td><td>${escapeHtml(r.statement.canalNome)}</td><td>${escapeHtml(r.statement.pagadorNome)}</td><td>${escapeHtml(r.pedidosTxt)}</td><td>${escapeHtml(r.clientesTxt)}</td><td class="num">R$ ${formatCurrencyBR(r.statement.valorBruto)}</td><td class="num">R$ ${formatCurrencyBR(r.statement.valorTaxa)}</td><td>${escapeHtml(r.nfStatusLabel)}</td><td>${escapeHtml(r.auditTxt)}</td></tr>`
                  )
                  .join('')
          }
        </tbody>
      </table>
      <h2>3. Pendências em Aberto (${model.pendingItems.length})</h2>
      <table>
        <thead><tr><th>Tipo</th><th>Data</th><th>Canal / Meio</th><th>Identificação / Pagador</th><th>Detalhe</th><th class="num">Valor em Aberto</th></tr></thead>
        <tbody>
          ${
            model.pendingItems.length === 0
              ? '<tr><td colspan="6">Nenhuma pendência neste período.</td></tr>'
              : model.pendingItems
                  .map(
                    p =>
                      `<tr><td>${escapeHtml(p.tipo)}</td><td>${escapeHtml(p.data)}</td><td>${escapeHtml(p.canal)}</td><td>${escapeHtml(p.identificacao)}</td><td>${escapeHtml(p.detalhe)}</td><td class="num">R$ ${formatCurrencyBR(p.valorAberto)}</td></tr>`
                  )
                  .join('')
          }
        </tbody>
      </table>
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1500);
      }, 150);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[70] flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto print:hidden"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-xs"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              Relatório de Conciliação Bancária &amp; Cartões
            </h2>
            <p className="text-[11px] text-slate-500 truncate">
              Competência: {model.competenciaLabel} • Status:{' '}
              {model.periodLock?.status === 'FECHADO'
                ? `FECHADO (${model.periodLock.fechadoPor || 'ADMIN'})`
                : 'ABERTO'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={exportingXlsx}
              onClick={() => void handleExportExcel()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{exportingXlsx ? 'Gerando...' : 'Excel (.xlsx)'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold cursor-pointer transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar relatório"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto bg-[#f8f9ff] flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[10px] font-mono uppercase text-slate-500">Bruto Extratos</div>
              <div className="font-mono font-bold text-sm text-slate-900">
                R$ {formatCurrencyBR(model.totals.gross)}
              </div>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl p-2.5">
              <div className="text-[10px] font-mono uppercase text-amber-700">Taxas MDR</div>
              <div className="font-mono font-bold text-sm text-amber-800">
                R$ {formatCurrencyBR(model.totals.fee)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[10px] font-mono uppercase text-slate-500">Líquido Conta</div>
              <div className="font-mono font-bold text-sm text-slate-900">
                R$ {formatCurrencyBR(model.totals.net)}
              </div>
            </div>
            <div className="bg-white border border-emerald-200 rounded-xl p-2.5">
              <div className="text-[10px] font-mono uppercase text-emerald-700">Conciliado</div>
              <div className="font-mono font-bold text-sm text-emerald-700">
                R$ {formatCurrencyBR(model.totals.conciliated)}
              </div>
            </div>
            <div className="bg-white border border-rose-200 rounded-xl p-2.5">
              <div className="text-[10px] font-mono uppercase text-rose-700">A Conciliar</div>
              <div className="font-mono font-bold text-sm text-rose-700">
                R$ {formatCurrencyBR(model.totals.pending)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3.5 py-2 bg-emerald-50 border-b border-emerald-200 font-bold text-emerald-950">
              1. Resumo por Canal
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-mono uppercase text-slate-500">
                  <tr>
                    <th className="py-2 px-3">Canal</th>
                    <th className="py-2 px-3 text-center">Créditos</th>
                    <th className="py-2 px-3 text-right">Bruto</th>
                    <th className="py-2 px-3 text-right">Taxa MDR</th>
                    <th className="py-2 px-3 text-right">Líquido</th>
                    <th className="py-2 px-3 text-right">Conciliado</th>
                    <th className="py-2 px-3 text-right">A Conciliar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {model.channelRows.map(r => (
                    <tr key={r.channel}>
                      <td className="py-2 px-3 font-bold">{r.channel}</td>
                      <td className="py-2 px-3 text-center font-mono">{r.count}</td>
                      <td className="py-2 px-3 text-right font-mono">R$ {formatCurrencyBR(r.gross)}</td>
                      <td className="py-2 px-3 text-right font-mono text-amber-700">
                        R$ {formatCurrencyBR(r.fee)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">R$ {formatCurrencyBR(r.net)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                        R$ {formatCurrencyBR(r.conciliated)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-rose-700">
                        R$ {formatCurrencyBR(r.pending)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3.5 py-2 bg-emerald-50 border-b border-emerald-200 font-bold text-emerald-950">
              2. Pares Conciliados &amp; Auditoria ({model.conciliatedRows.length})
            </div>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[10.5px] font-mono uppercase text-slate-500">
                  <tr>
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3">Canal</th>
                    <th className="py-2 px-3">Pagador</th>
                    <th className="py-2 px-3">Pedido(s)</th>
                    <th className="py-2 px-3 text-right">Bruto</th>
                    <th className="py-2 px-3 text-center">Nota Fiscal</th>
                    <th className="py-2 px-3">Auditoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {model.conciliatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        Nenhum lançamento conciliado neste período.
                      </td>
                    </tr>
                  ) : (
                    model.conciliatedRows.map(r => (
                      <tr key={r.statement.id}>
                        <td className="py-2 px-3 font-mono whitespace-nowrap">
                          {formatDateBR(r.statement.dataExtrato)}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">{r.statement.canalNome}</td>
                        <td className="py-2 px-3 font-semibold">{r.statement.pagadorNome}</td>
                        <td className="py-2 px-3 font-mono font-bold">{r.pedidosTxt}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                          R$ {formatCurrencyBR(r.statement.valorBruto)}
                        </td>
                        <td className="py-2 px-3 text-center font-semibold whitespace-nowrap">
                          {r.nfStatusLabel}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{r.auditTxt}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3.5 py-2 bg-rose-50 border-b border-rose-200 font-bold text-rose-900">
              3. Pendências em Aberto ({model.pendingItems.length} item(ns) • R${' '}
              {formatCurrencyBR(model.totals.openItemsSum)})
            </div>
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[10.5px] font-mono uppercase text-slate-500">
                  <tr>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3">Canal / Meio</th>
                    <th className="py-2 px-3">Identificação / Pagador</th>
                    <th className="py-2 px-3 text-right">Valor em Aberto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {model.pendingItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-5 text-center text-emerald-700 font-semibold">
                        Nenhuma pendência neste período!
                      </td>
                    </tr>
                  ) : (
                    model.pendingItems.slice(0, 25).map((p, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-semibold">{p.tipo}</td>
                        <td className="py-2 px-3 font-mono">{p.data}</td>
                        <td className="py-2 px-3">{p.canal}</td>
                        <td className="py-2 px-3 font-semibold">{p.identificacao}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          R$ {formatCurrencyBR(p.valorAberto)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
