import React, { useState } from 'react';
import { Sparkles, X, MessageSquare, Loader2, AlertTriangle, Wand2 } from 'lucide-react';
import { Product, StoreUnit } from '../types';
import { WhatsAppParserService, ParsedWhatsAppOrder } from '../services/whatsappParserService';

interface WhatsAppImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  units: StoreUnit[];
  onOrderParsed: (parsed: ParsedWhatsAppOrder) => void;
}

export const WhatsAppImportModal: React.FC<WhatsAppImportModalProps> = ({
  isOpen,
  onClose,
  products,
  units,
  onOrderParsed
}) => {
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!rawText.trim()) {
      setErrorMsg('Cole a mensagem do cliente do WhatsApp antes de continuar.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const parsed = await WhatsAppParserService.parseMessage(rawText, products, units);
      onOrderParsed(parsed);
      setRawText('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar mensagem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2 sm:p-4">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[94dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white px-3.5 py-2.5 sm:px-6 sm:py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-200" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm truncate">Importar Pedido do WhatsApp com IA</h3>
              <p className="text-[11px] text-emerald-100 hidden sm:block">
                Extração automática de itens do catálogo, endereço, horário e pagamento
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <span>Cole a conversa ou mensagem do cliente:</span>
            </label>
          </div>

          <textarea
            rows={6}
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="Ex: Oi, sou a Maria (11 99999-1234), quero 1 Red Velvet e 2 macarons para entregar na Rua Oscar Freire, 500 às 16h. Pagamento no PIX..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 sm:p-3.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 font-sans leading-relaxed"
          />

          {errorMsg && (
            <div className="p-2.5 sm:p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleParse}
            disabled={loading || !rawText.trim()}
            className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analisando conversa...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>Extrair Pedido com IA</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
