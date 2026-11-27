import React, { useMemo, useRef, useState } from 'react';
import {
  FinancialPaymentChannel,
  StatementImportBatch,
  StatementMatchConfidence,
} from '../types';
import {
  ManualColumnMapping,
  ParsedStatementRow,
  StatementParseResult,
  parseStatementFile,
} from '../utils/statementParser';
import { formatCurrencyBR } from './CurrencyInput';
import { formatDateBR } from '../utils/financialReconciliation';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';

interface ImportarExtratoModalProps {
  isOpen: boolean;
  onClose: () => void;
  channels: FinancialPaymentChannel[];
  existingFingerprints: Set<string>;
  operatorName: string;
  onConfirmImport: (
    batch: Omit<StatementImportBatch, 'id' | 'createdAt'>,
    newRows: Array<ParsedStatementRow & { canalId?: string; canalNome: string }>
  ) => Promise<void>;
}

const PRESET_CARDS: Array<{
  nome: string;
  subtitle: string;
  accent: string;
}> = [
  { nome: 'PixC6', subtitle: 'OFX / CSV C6 Bank', accent: 'border-teal-500 bg-teal-50 text-teal-800' },
  { nome: 'C6pay', subtitle: 'CSV / XLSX C6Pay', accent: 'border-indigo-500 bg-indigo-50 text-indigo-800' },
  { nome: 'Sumup', subtitle: 'CSV / XLSX SumUp', accent: 'border-sky-500 bg-sky-50 text-sky-800' },
  { nome: 'Rede', subtitle: 'CSV / XLSX Rede', accent: 'border-orange-500 bg-orange-50 text-orange-800' },
];

export const ImportarExtratoModal: React.FC<ImportarExtratoModalProps> = ({
  isOpen,
  onClose,
  channels,
  existingFingerprints,
  operatorName,
  onConfirmImport,
}) => {
  const [selectedChannelName, setSelectedChannelName] = useState<string>('PixC6');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<StatementParseResult | null>(null);
  const [showManualMapping, setShowManualMapping] = useState(false);
  const [manualMap, setManualMap] = useState<ManualColumnMapping>({
    dateCol: 0,
    amountCol: 4,
    payerCol: 2,
    descCol: 3,
    feeCol: 5,
    netCol: 6,
    refCol: 7,
    headerRowIdx: 0,
  });
  const [loadingParse, setLoadingParse] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const channelByNameLower = useMemo(
    () => new Map(channels.map(c => [c.nome.trim().toLowerCase(), c])),
    [channels]
  );

  const resetModalState = () => {
    setSelectedFile(null);
    setParseResult(null);
    setShowManualMapping(false);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (savingImport) return;
    resetModalState();
    onClose();
  };

  const runParse = async (file: File, channelName: string, override?: ManualColumnMapping) => {
    setLoadingParse(true);
    setErrorMsg(null);
    try {
      const res = await parseStatementFile(file, channelName, override);
      setParseResult(res);
      if (res.detectedPreset === 'MANUAL' && !override) {
        setShowManualMapping(true);
      }
      if (res.rows.length === 0) {
        setErrorMsg(
          'Nenhum lançamento de crédito (> R$ 0,00) encontrado. Verifique o arquivo ou ajuste o mapeamento de colunas.'
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível ler o arquivo selecionado.');
    } finally {
      setLoadingParse(false);
    }
  };

  const handleFileChosen = async (file: File | undefined) => {
    if (!file) return;
    setSelectedFile(file);
    await runParse(file, selectedChannelName);
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const { downloadStatementTemplateXlsx } = await import('../utils/statementTemplateExcel');
      downloadStatementTemplateXlsx();
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const enrichedPreview = useMemo(() => {
    if (!parseResult) return { newRows: [], duplicateCount: 0, periodoInicio: undefined, periodoFim: undefined };
    const seenInFile = new Set<string>();
    const newRows: Array<ParsedStatementRow & { canalId?: string; canalNome: string; confidencePreview?: StatementMatchConfidence }> = [];
    let duplicateCount = 0;

    for (const row of parseResult.rows) {
      const effCanalName = row.canalOverride || selectedChannelName;
      const resolvedCh = channelByNameLower.get(effCanalName.trim().toLowerCase());
      const fp = row.fingerprintHash;

      if (existingFingerprints.has(fp) || seenInFile.has(fp)) {
        duplicateCount += 1;
        continue;
      }
      seenInFile.add(fp);
      newRows.push({
        ...row,
        fingerprintHash: fp,
        canalId: resolvedCh?.id,
        canalNome: resolvedCh?.nome || effCanalName,
      });
    }

    const dates = newRows.map(r => r.dataExtrato).filter(Boolean).sort();
    return {
      newRows,
      duplicateCount,
      periodoInicio: dates[0],
      periodoFim: dates[dates.length - 1],
    };
  }, [parseResult, selectedChannelName, channelByNameLower, existingFingerprints]);

  const handleConfirm = async () => {
    if (!parseResult || !selectedFile || enrichedPreview.newRows.length === 0 || savingImport) return;
    setSavingImport(true);
    setErrorMsg(null);
    try {
      const ch = channelByNameLower.get(selectedChannelName.trim().toLowerCase());
      await onConfirmImport(
        {
          canalId: ch?.id,
          canalNome: ch?.nome || selectedChannelName,
          arquivoNome: selectedFile.name,
          formato: parseResult.format,
          periodoInicio: enrichedPreview.periodoInicio,
          periodoFim: enrichedPreview.periodoFim,
          totalLinhas: parseResult.rows.length,
          linhasNovas: enrichedPreview.newRows.length,
          linhasDuplicadas: enrichedPreview.duplicateCount,
          importadoPor: operatorName,
        },
        enrichedPreview.newRows
      );
      resetModalState();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Falha ao salvar o extrato importado.');
    } finally {
      setSavingImport(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[70] flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto print:hidden"
      onClick={handleClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              Importar Extrato Bancário ou de Cartão
            </h2>
            <p className="text-[11px] text-slate-500 truncate">
              Deduplicação automática via hash único (data + valor + código da transação)
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto text-xs flex-1">
          {/* Presets */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 font-mono">
                1. Canal Padrão da Importação
              </span>
              {channels.filter(c => c.ativo).length > 4 && (
                <select
                  aria-label="Outro canal financeiro"
                  value={selectedChannelName}
                  onChange={e => {
                    const next = e.target.value;
                    setSelectedChannelName(next);
                    if (selectedFile) void runParse(selectedFile, next);
                  }}
                  className="h-7 px-2 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-700"
                >
                  {channels
                    .filter(c => c.ativo)
                    .map(c => (
                      <option key={c.id} value={c.nome}>
                        {c.nome}
                      </option>
                    ))}
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESET_CARDS.map(card => {
                const active = selectedChannelName.toLowerCase() === card.nome.toLowerCase();
                return (
                  <button
                    key={card.nome}
                    type="button"
                    onClick={() => {
                      setSelectedChannelName(card.nome);
                      if (selectedFile) void runParse(selectedFile, card.nome);
                    }}
                    className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                      active
                        ? `${card.accent} ring-1 ring-current`
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold">{card.nome}</div>
                    <div className="text-[10.5px] opacity-80">{card.subtitle}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dropzone / File Input */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              void handleFileChosen(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-5 text-center bg-slate-50 space-y-1.5 cursor-pointer transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".ofx,.qfx,.csv,.xlsx,.xls"
              onChange={e => void handleFileChosen(e.target.files?.[0])}
              className="hidden"
            />
            <Upload className="w-7 h-7 mx-auto text-blue-600" />
            <div className="font-semibold text-slate-800">
              {selectedFile
                ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                : 'Clique ou arraste o arquivo .OFX, .CSV ou .XLSX aqui'}
            </div>
            <div className="text-[11px] text-slate-500">
              {loadingParse
                ? 'Lendo e validando lançamentos...'
                : 'Importa somente créditos positivos e ignora lançamentos duplicados.'}
            </div>
          </div>

          {/* Download Blank Formatted XLSX Template */}
          <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="min-w-0">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Planilha modelo padrão (.xlsx)</span>
              </div>
              <div className="text-[11px] text-slate-600">
                Vem vazia com cabeçalhos na linha 4, formatação do app (R$ e datas), zero totais na área de dados e aba de instruções.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleDownloadTemplate()}
              disabled={downloadingTemplate}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 bg-white hover:bg-blue-50 text-blue-800 font-bold cursor-pointer shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>{downloadingTemplate ? 'Gerando...' : 'Baixar Modelo (.xlsx)'}</span>
            </button>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Optional Manual Column Mapping */}
          {parseResult && parseResult.format !== 'OFX' && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowManualMapping(v => !v)}
                className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-700 cursor-pointer"
              >
                <span className="inline-flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    Mapeamento de Colunas ({parseResult.detectedPreset} • linha de cabeçalho {parseResult.headerRowIdx + 1})
                  </span>
                </span>
                <span className="text-blue-700">{showManualMapping ? 'Ocultar' : 'Ajustar'}</span>
              </button>
              {showManualMapping && (
                <div className="p-3 bg-white grid grid-cols-2 sm:grid-cols-3 gap-2 border-t border-slate-200">
                  {[
                    { key: 'dateCol', label: 'Coluna Data *' },
                    { key: 'amountCol', label: 'Coluna Valor Bruto *' },
                    { key: 'payerCol', label: 'Coluna Pagador' },
                    { key: 'descCol', label: 'Coluna Descrição' },
                    { key: 'feeCol', label: 'Coluna Taxa MDR' },
                    { key: 'refCol', label: 'Cód. Transação / NSU' },
                  ].map(field => (
                    <label key={field.key} className="block">
                      <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        {field.label}
                      </span>
                      <select
                        value={(manualMap as any)[field.key] ?? -1}
                        onChange={e => {
                          const v = Number(e.target.value);
                          const next = {
                            ...manualMap,
                            headerRowIdx: parseResult.headerRowIdx,
                            [field.key]: v >= 0 ? v : undefined,
                          };
                          setManualMap(next);
                          if (selectedFile) void runParse(selectedFile, selectedChannelName, next);
                        }}
                        className="w-full h-8 px-2 rounded-lg border border-slate-300 bg-white text-[11px]"
                      >
                        <option value={-1}>(Nenhuma)</option>
                        {parseResult.rawHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {i + 1}: {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Summary Preview */}
          {parseResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Pré-visualização ({parseResult.format})</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    {enrichedPreview.newRows.length} novo(s)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">
                    {enrichedPreview.duplicateCount} duplicado(s)
                  </span>
                  {parseResult.debitsSkipped > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                      {parseResult.debitsSkipped} débito(s) ignorado(s)
                    </span>
                  )}
                </div>
              </div>

              {enrichedPreview.newRows.length > 0 ? (
                <div className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-slate-50 border-b border-slate-200 font-mono text-[10px] text-slate-500 uppercase">
                      <tr>
                        <th className="py-1.5 px-2">Data</th>
                        <th className="py-1.5 px-2">Canal</th>
                        <th className="py-1.5 px-2">Pagador</th>
                        <th className="py-1.5 px-2 text-right">Bruto</th>
                        <th className="py-1.5 px-2 text-right">MDR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {enrichedPreview.newRows.slice(0, 8).map((r, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 px-2 font-mono">{formatDateBR(r.dataExtrato)}</td>
                          <td className="py-1.5 px-2 font-semibold">{r.canalNome}</td>
                          <td className="py-1.5 px-2 truncate max-w-[180px]">{r.pagadorNome}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold">
                            R$ {formatCurrencyBR(r.valorBruto)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-amber-700">
                            {r.valorTaxa > 0 ? `R$ ${formatCurrencyBR(r.valorTaxa)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {enrichedPreview.newRows.length > 8 && (
                    <div className="px-2.5 py-1 text-[10px] text-slate-500 bg-slate-50 border-t border-slate-200">
                      + {enrichedPreview.newRows.length - 8} crédito(s) adicional(is)...
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-slate-600">
                  Todos os lançamentos deste arquivo já foram importados anteriormente ou não há créditos novos.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={savingImport}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={savingImport || loadingParse || enrichedPreview.newRows.length === 0}
            onClick={() => void handleConfirm()}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
          >
            {savingImport
              ? 'Salvando...'
              : `Importar ${enrichedPreview.newRows.length} Lançamento(s)`}
          </button>
        </div>
      </div>
    </div>
  );
};
