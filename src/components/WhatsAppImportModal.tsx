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

  const buildDynamicSampleMessage = () => {
    const activeProds = products.filter(p => p.ativo);
    const prod1 = activeProds[0]?.descricao || 'Bolo Red Velvet';
    const prod2 = activeProds[1]?.descricao || 'Macarons';
    return `Olá! Gostaria de fazer um pedido para hoje às 17h30.
Meu nome é Fernanda Albuquerque, WhatsApp (71) 99123-4567.
Quero:
- 2x ${prod1}
- 1x ${prod2}
Entregar na Av. Waldemar Falcão, 500, Horto Florestal, Salvador.
Vou pagar no PIX! Por favor embalar para presente.`;
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-teal-700 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Importar Pedido do WhatsApp com IA</h3>
              <p className="text-[11px] text-emerald-100">
                Extração automática de itens do catálogo, endereço, horário e pagamento
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <span>Cole a conversa ou mensagem do cliente:</span>
            </label>
            <button
              type="button"
              onClick={() => setRawText(buildDynamicSampleMessage())}
              className="text-[11px] font-semibold text-brand-700 hover:text-brand-800 hover:underline"
            >
              Usar mensagem de exemplo
            </button>
          </div>

          <textarea
            rows={7}
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="Ex: Oi, sou a Maria (11 99999-1234), quero 1 Red Velvet e 2 macarons para entregar na Rua Oscar Freire, 500 às 16h. Pagamento no PIX..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 font-sans leading-relaxed"
          />

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleParse}
            disabled={loading || !rawText.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
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
