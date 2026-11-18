import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Product, StoreUnit, DeliveryType, PaymentMethod, OrderItem } from '../types';

export interface ParsedWhatsAppOrder {
  clienteNome: string;
  clienteTelefone: string;
  tipoEntrega: DeliveryType;
  enderecoEntrega?: string;
  unidadeSugeridaId?: string;
  dataHoraEntrega: string;
  formaPagamento: PaymentMethod;
  trocoPara?: number;
  observacoes?: string;
  itens: OrderItem[];
  unmatchedItems: string[];
  source: 'gemini' | 'local_fallback';
  fallbackReason?: string;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function localFallbackParse(
  rawText: string,
  catalog: Product[],
  units: StoreUnit[],
  reason?: string
): ParsedWhatsAppOrder {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const normFull = normalizeText(rawText);

  // 1. Telefone
  const phoneMatch = rawText.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\d{4}|\d{4})[-\s]?\d{4}/);
  const clienteTelefone = phoneMatch ? phoneMatch[0].trim() : '';

  // 2. Nome
  let clienteNome = '';
  const nameExplicit = rawText.match(/(?:nome|cliente|sou o|sou a|aqui é)\s*[:\-]?\s*([A-ZÀ-Úa-zà-ú\s]{2,40})/i);
  if (nameExplicit) {
    clienteNome = nameExplicit[1].split(/\n|,|\./)[0].trim();
  } else if (lines.length > 0 && !/\d{4}/.test(lines[0]) && lines[0].length < 40) {
    clienteNome = lines[0].replace(/^(olá|oi|bom dia|boa tarde|boa noite)[!,.\s]*/i, '').trim();
  }

  // 3. Modalidade
  const isRetirada = /\b(retirada|retirar|buscar|balcao|pegar na loja)\b/.test(normFull);
  const tipoEntrega: DeliveryType = isRetirada ? 'RETIRADA' : 'DELIVERY';

  // 4. Endereço
  let enderecoEntrega = '';
  const addrMatch = rawText.match(/(?:endere[çc]o|entregar em|rua|av\.?|avenida|alameda|travessa)\s*[:\-]?\s*([^\n]+)/i);
  if (addrMatch && tipoEntrega === 'DELIVERY') {
    enderecoEntrega = addrMatch[0].replace(/^endere[çc]o\s*[:\-]?\s*/i, '').trim();
  }

  // 5. Unidade sugerida
  let unidadeSugeridaId: string | undefined;
  for (const u of units) {
    const uNorm = normalizeText(u.nome);
    const words = uNorm.split(/[\s-]+/).filter(w => w.length > 3 && w !== 'loja');
    if (words.some(w => normFull.includes(w))) {
      unidadeSugeridaId = u.id;
      break;
    }
  }

  // 6. Pagamento e Troco
  let formaPagamento: PaymentMethod = 'pix';
  if (/\b(dinheiro|especie)\b/.test(normFull)) formaPagamento = 'dinheiro';
  else if (/\b(credito|cartao de credito)\b/.test(normFull)) formaPagamento = 'credito';
  else if (/\b(debito|cartao de debito)\b/.test(normFull)) formaPagamento = 'debito';
  else if (/\bpix\b/.test(normFull)) formaPagamento = 'pix';

  let trocoPara: number | undefined;
  const trocoMatch = normFull.match(/troco\s*(?:para|p\/|pra)?\s*(?:r\$)?\s*(\d+(?:[.,]\d{1,2})?)/);
  if (trocoMatch) {
    trocoPara = parseFloat(trocoMatch[1].replace(',', '.'));
  }

  // 7. Data/Hora
  const now = new Date();
  let targetDate = new Date(now.getTime() + 3 * 3600000);
  if (/\bamanha\b/.test(normFull)) {
    targetDate = new Date(now.getTime() + 24 * 3600000);
  }
  const timeMatch = normFull.match(/(?:as|às|para)?\s*(\d{1,2})[:h](\d{2})?\b/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (h >= 7 && h <= 22) {
      targetDate.setHours(h, m, 0, 0);
    }
  }
  const tzOffset = targetDate.getTimezoneOffset() * 60000;
  const dataHoraEntrega = new Date(targetDate.getTime() - tzOffset).toISOString().slice(0, 16);

  // 8. Casamento de Produtos
  const itens: OrderItem[] = [];
  const unmatchedItems: string[] = [];

  for (const prod of catalog) {
    if (!prod.ativo) continue;
    const descNorm = normalizeText(prod.descricao);
    const keywords = descNorm
      .replace(/[().,/]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !['para', 'com', 'tradicional', 'artesanal', 'caixa', 'cento'].includes(w));

    // Match if at least 2 significant keywords appear or 1 very distinctive keyword (>= 6 chars)
    const matchedKeywords = keywords.filter(k => normFull.includes(k));
    const strongMatch = matchedKeywords.length >= 2 || matchedKeywords.some(k => k.length >= 6);

    if (strongMatch) {
      // Try to find quantity right before the matched keyword
      let qtd = 1;
      for (const kw of matchedKeywords) {
        const qtdRegex = new RegExp(`(\\d+)\\s*(?:x|un|cx|caixas?|centos?)?\\s*(?:de\\s+)?[a-z\\s]{0,20}${kw}`, 'i');
        const qMatch = normFull.match(qtdRegex);
        if (qMatch) {
          qtd = Math.max(1, parseInt(qMatch[1], 10));
          break;
        }
      }

      itens.push({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        produtoId: prod.id,
        quantidade: qtd,
        precoUnitario: prod.precoUnitario,
        subtotal: qtd * prod.precoUnitario
      });
    }
  }

  return {
    clienteNome: clienteNome || 'Cliente WhatsApp',
    clienteTelefone,
    tipoEntrega,
    enderecoEntrega,
    unidadeSugeridaId,
    dataHoraEntrega,
    formaPagamento,
    trocoPara,
    observacoes: `Importado via WhatsApp:\n${rawText.slice(0, 220)}${rawText.length > 220 ? '...' : ''}`,
    itens,
    unmatchedItems,
    source: 'local_fallback',
    fallbackReason: reason
  };
}

export class WhatsAppParserService {
  static async parseMessage(
    rawText: string,
    catalog: Product[],
    units: StoreUnit[]
  ): Promise<ParsedWhatsAppOrder> {
    if (!isSupabaseConfigured || !supabase) {
      return localFallbackParse(rawText, catalog, units, 'BD não configurado (modo offline)');
    }

    try {
      const { data, error } = await supabase.functions.invoke('parse-whatsapp-order', {
        body: {
          rawText,
          catalog: catalog.filter(p => p.ativo).map(p => ({
            id: p.id,
            sku: p.sku,
            descricao: p.descricao,
            precoUnitario: p.precoUnitario,
            unidade: p.unidade
          })),
          units: units.filter(u => u.ativo).map(u => ({
            id: u.id,
            nome: u.nome,
            tipo: u.tipo
          })),
          currentDate: new Date().toISOString()
        }
      });

      if (error) {
        console.warn('Edge function erro, usando fallback local:', error);
        return localFallbackParse(rawText, catalog, units, error.message);
      }

      if (!data?.success || !data?.data) {
        const reason = data?.code === 'GEMINI_API_KEY_NOT_SET'
          ? 'GEMINI_API_KEY ainda não configurada no BD (usando parser inteligente local)'
          : 'Extração realizada automaticamente pelo parser inteligente local.';
        return localFallbackParse(rawText, catalog, units, reason);
      }

      const parsed = data.data;
      const prodMap = new Map(catalog.map(p => [p.id, p]));

      const itens: OrderItem[] = (parsed.itens || [])
        .filter((i: any) => prodMap.has(i.produtoId) && i.quantidade > 0)
        .map((i: any) => {
          const prod = prodMap.get(i.produtoId)!;
          const qtd = Number(i.quantidade) || 1;
          return {
            id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            produtoId: prod.id,
            quantidade: qtd,
            precoUnitario: prod.precoUnitario,
            subtotal: qtd * prod.precoUnitario,
            observacoes: i.observacoes || undefined
          };
        });

      const unmatched: string[] = Array.isArray(parsed.unmatchedItems) ? parsed.unmatchedItems : [];
      let obs = parsed.observacoes || '';
      if (unmatched.length > 0) {
        const aviso = `⚠️ Itens não encontrados no catálogo: ${unmatched.join(', ')}`;
        obs = obs ? `${aviso}\n${obs}` : aviso;
      }

      return {
        clienteNome: parsed.clienteNome || 'Cliente WhatsApp',
        clienteTelefone: parsed.clienteTelefone || '',
        tipoEntrega: parsed.tipoEntrega === 'RETIRADA' ? 'RETIRADA' : 'DELIVERY',
        enderecoEntrega: parsed.enderecoEntrega || '',
        unidadeSugeridaId: parsed.unidadeSugeridaId,
        dataHoraEntrega: parsed.dataHoraEntrega || new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 16),
        formaPagamento: (['pix', 'debito', 'credito', 'dinheiro'].includes(parsed.formaPagamento)
          ? parsed.formaPagamento
          : 'pix') as PaymentMethod,
        trocoPara: parsed.trocoPara ? Number(parsed.trocoPara) : undefined,
        observacoes: obs,
        itens,
        unmatchedItems: unmatched,
        source: 'gemini'
      };
    } catch (err: any) {
      console.warn('Falha ao chamar Edge Function, usando fallback local:', err);
      return localFallbackParse(rawText, catalog, units, err.message);
    }
  }
}
