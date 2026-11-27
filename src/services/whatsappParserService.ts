import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Product, StoreUnit, DeliveryType, DeliveryShift, PaymentMethod, OrderItem } from '../types';
import {
  addHoursToDateTime,
  extractLocalDateYyyyMmDd,
  extractTimeHHmm,
  inferDeliveryShiftFromDateTime,
  toLocalDateTimeString
} from '../utils/deliveryTimeRange';

export interface ParsedWhatsAppOrder {
  clienteNome: string;
  clienteTelefone: string;
  tipoEntrega: DeliveryType;
  turnoEntrega?: DeliveryShift;
  enderecoEntrega?: string;
  unidadeSugeridaId?: string;
  dataHoraEntrega: string;
  dataHoraEntregaFim?: string;
  formaPagamento: PaymentMethod;
  trocoPara?: number;
  taxaEntrega?: number;
  desconto?: number;
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

function parseTimeToken(hourStr: string, minStr?: string, period?: string): { h: number; m: number } | null {
  let h = parseInt(hourStr, 10);
  const m = minStr && /^\d{2}$/.test(minStr) ? parseInt(minStr, 10) : 0;
  if ((period === 'tarde' || period === 'noite') && h >= 1 && h <= 11) {
    h += 12;
  }
  if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
    return { h, m };
  }
  return null;
}

function extractDeliveryDateTimeRange(rawText: string): { start: string; end: string; hasExplicitEnd: boolean } {
  const normFull = normalizeText(rawText);
  const now = new Date();
  let targetDate = new Date(now.getTime() + 3 * 3600000);
  let hasExplicitDate = false;

  // Data explícita DD/MM ou DD/MM/YYYY
  const dateMatch = normFull.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      targetDate = new Date(year, month - 1, day, 12, 0, 0, 0);
      hasExplicitDate = true;
    }
  } else if (/\bdepois de amanha\b/.test(normFull)) {
    targetDate = new Date(now.getTime() + 48 * 3600000);
    hasExplicitDate = true;
  } else if (/\bamanha\b/.test(normFull)) {
    targetDate = new Date(now.getTime() + 24 * 3600000);
    hasExplicitDate = true;
  } else if (/\bhoje\b/.test(normFull)) {
    targetDate = new Date(now);
    hasExplicitDate = true;
  }

  let startParsed: { h: number; m: number } | null = null;
  let endParsed: { h: number; m: number } | null = null;

  // 1. Faixa de horário: "das 14:30 às 17:30", "14h30 - 17h30", "entre 14h e 17h", "das 14 às 17"
  const rangeMatch = normFull.match(
    /\b(?:das?|de|entre)?\s*(\d{1,2})(?:\s*[:h]\s*(\d{2})|\s*(?:h|hs|hrs?|horas?))?\s*(?:as|a|ate|e|-|–)\s*(\d{1,2})(?:\s*[:h]\s*(\d{2})|\s*(?:h|hs|hrs?|horas?))(?:\s*da\s+(manha|tarde|noite))?\b/
  ) || normFull.match(
    /\b(?:das?|de|entre)\s*(\d{1,2})(?:\s*[:h]\s*(\d{2}))?\s*(?:as|a|ate|e|-|–)\s*(\d{1,2})(?:\s*[:h]\s*(\d{2}))?(?:\s*da\s+(manha|tarde|noite))?\b/
  );

  if (rangeMatch) {
    const period = rangeMatch[5];
    startParsed = parseTimeToken(rangeMatch[1], rangeMatch[2], period);
    endParsed = parseTimeToken(rangeMatch[3], rangeMatch[4], period);
  }

  // 2. Horário único caso não haja faixa
  if (!startParsed) {
    if (/\bmeio[\s-]?dia\b/.test(normFull)) {
      startParsed = { h: 12, m: 0 };
    } else if (/\bmeia[\s-]?noite\b/.test(normFull)) {
      startParsed = { h: 0, m: 0 };
    } else {
      const explicitTime =
        normFull.match(/\b(\d{1,2})\s*[:h]\s*(\d{2})\b/) ||
        normFull.match(/\b(\d{1,2})\s*(?:h|hs|hrs?|horas?)\b/) ||
        normFull.match(/\b(?:as|para\s+as|para|por\s+volta\s+das?|entre(?:\s+as)?|horario\s*[:\-]?|hora\s*[:\-]?)\s*(\d{1,2})(?:\s*(?:da\s+(manha|tarde|noite)))?\b/);

      if (explicitTime) {
        const minToken = explicitTime[2] && /^\d{2}$/.test(explicitTime[2]) ? explicitTime[2] : undefined;
        const period = explicitTime[2] === 'tarde' || explicitTime[2] === 'noite' ? explicitTime[2] : explicitTime[3];
        startParsed = parseTimeToken(explicitTime[1], minToken, period);
      }
    }
  }

  if (startParsed) {
    if (!hasExplicitDate) {
      targetDate = new Date(now);
    }
    targetDate.setHours(startParsed.h, startParsed.m, 0, 0);
  }

  const startStr = toLocalDateTimeString(targetDate);

  if (endParsed) {
    const endDate = new Date(targetDate);
    endDate.setHours(endParsed.h, endParsed.m, 0, 0);
    if (endDate.getTime() <= targetDate.getTime()) {
      return { start: startStr, end: addHoursToDateTime(startStr, 1), hasExplicitEnd: false };
    }
    return { start: startStr, end: toLocalDateTimeString(endDate), hasExplicitEnd: true };
  }

  return { start: startStr, end: addHoursToDateTime(startStr, 1), hasExplicitEnd: false };
}

export function cleanTextForMoneyParsing(rawText: string): string {
  return normalizeText(rawText).replace(/[*_~]+/g, ' ');
}

export function parseBrazilianCurrency(raw: string): number {
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return NaN;
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, ''));
  }
  return parseFloat(cleaned);
}

const BR_AMOUNT_PATTERN = '(\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,2})|\\d+(?:[.,]\\d{1,2})?)(?![\\d.,/%]|\\s*(?:%|km|h|hs|hrs)\\b)';

export function extractDeliveryFee(rawText: string, tipoEntrega: DeliveryType): number | undefined {
  if (tipoEntrega === 'RETIRADA') return 0;

  const normClean = cleanTextForMoneyParsing(rawText);

  if (
    /\b(?:frete\s+gratis|entrega\s+gratuita|taxa\s+(?:de\s+)?entrega\s+(?:gratis|gratuita|isenta|inclusa|cortesia)|sem\s+taxa\s+de\s+entrega)\b/.test(
      normClean
    )
  ) {
    return 0;
  }

  const feePatterns = [
    new RegExp(
      `\\b(?:taxa\\s+(?:de\\s+)?entrega|taxa\\s+delivery|valor\\s+da\\s+entrega|frete)\\s*(?:\\([^)]*\\))?\\s*(?:de|:|=|-)?\\s*(?:\\+\\s*)?(?:r\\$\\s*)?${BR_AMOUNT_PATTERN}`,
      'i'
    ),
    new RegExp(
      `\\bentrega\\s*(?:[:=]\\s*(?:\\+\\s*)?(?:r\\$\\s*)?|(?:de\\s+)?r\\$\\s*)${BR_AMOUNT_PATTERN}`,
      'i'
    ),
  ];

  for (const pattern of feePatterns) {
    const match = normClean.match(pattern);
    if (match?.[1]) {
      const val = parseBrazilianCurrency(match[1]);
      if (Number.isFinite(val) && val >= 0 && val <= 500) {
        return Number(val.toFixed(2));
      }
    }
  }

  return undefined;
}

export function extractDiscountInfo(
  rawText: string,
  subtotal: number,
  deliveryFee = 0
): { discount: number; explicitFinalTotal?: number } {
  const normClean = cleanTextForMoneyParsing(rawText);
  const baseTotal = Number((subtotal + deliveryFee).toFixed(2));

  // 1. Desconto explícito em valor (ex: "*Desconto:* -R$ 20,00", "desconto de R$ 20,00", "20 reais de desconto")
  const explicitDiscountPatterns = [
    new RegExp(
      `(?<!\\bcom\\s)\\b(?:desconto|desc\\.?)\\s*(?:\\([^)]*\\))?\\s*(?:(?:de|concedido(?:\\s+de)?)\\s*(?:-\\s*)?(?:r\\$\\s*)?|(?::|=)\\s*(?:-\\s*)?(?:r\\$\\s*)?|-\\s*(?:r\\$\\s*)?|r\\$\\s*)${BR_AMOUNT_PATTERN}`,
      'i'
    ),
    /(?:^|\s)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)(?![\d.,/%]|\s*%)\s*(?:reais\s+)?de\s+desconto\b/i,
  ];

  for (const pattern of explicitDiscountPatterns) {
    const explicitValMatch = normClean.match(pattern);
    if (explicitValMatch?.[1]) {
      const val = parseBrazilianCurrency(explicitValMatch[1]);
      if (Number.isFinite(val) && val > 0 && (baseTotal <= 0 || val <= baseTotal)) {
        return { discount: Number(val.toFixed(2)) };
      }
    }
  }

  // 2. Desconto percentual: "10% de desconto", "desconto de 10%" ou "desconto: 10%"
  const pctMatch =
    normClean.match(/desconto\s*(?:de|concedido(?:\s+de)?|:|=)?\s*(\d+(?:[.,]\d{1,2})?)\s*%/) ||
    normClean.match(/(\d+(?:[.,]\d{1,2})?)\s*%\s*(?:de\s+)?desconto/);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1].replace(',', '.'));
    if (pct > 0 && pct <= 100 && subtotal > 0) {
      return { discount: Number(((subtotal * pct) / 100).toFixed(2)) };
    }
  }

  // 3. Caso informe o total final com desconto ("Total com desconto: R$ 195,00", "com desconto fica R$ 195")
  const totalWithDiscountMatch = normClean.match(
    /(?:valor\s+total\s+com\s+desconto|total\s+com\s+desconto|valor\s+com\s+desconto|com\s+desconto\s+(?:fica|sai|e|eh)?)\s*(?::|=|por|fica)?\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)(?![\d.,/%]|\s*%)/i
  );
  if (totalWithDiscountMatch?.[1]) {
    const finalVal = parseBrazilianCurrency(totalWithDiscountMatch[1]);
    if (Number.isFinite(finalVal) && finalVal >= 0 && baseTotal > finalVal) {
      return { discount: Number((baseTotal - finalVal).toFixed(2)), explicitFinalTotal: finalVal };
    }
    return { discount: 0, explicitFinalTotal: Number.isFinite(finalVal) ? finalVal : undefined };
  }

  // 4. Caso cite desconto e informe um total explícito inferior a subtotal + entrega
  if (/\bdesconto\b/.test(normClean) && baseTotal > 0) {
    const explicitTotalMatch = normClean.match(
      /(?:valor\s+total|total\s+a\s+pagar|total)\s*[:=]\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)(?![\d.,/%]|\s*%)/i
    );
    if (explicitTotalMatch?.[1]) {
      const finalVal = parseBrazilianCurrency(explicitTotalMatch[1]);
      if (Number.isFinite(finalVal) && finalVal >= 0 && baseTotal > finalVal) {
        return { discount: Number((baseTotal - finalVal).toFixed(2)), explicitFinalTotal: finalVal };
      }
    }
  }

  return { discount: 0 };
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

  // 7. Data/Hora (faixa de horário)
  const { start: dataHoraEntrega, end: dataHoraEntregaFim } = extractDeliveryDateTimeRange(rawText);

  // 8. Casamento de Produtos (pontuação por cláusula para não duplicar variações)
  const itens: OrderItem[] = [];
  const unmatchedItems: string[] = [];

  const STOP_WORDS = new Set([
    'para', 'com', 'sem', 'tradicional', 'artesanal', 'caixa', 'cento',
    'unidade', 'unidades', 'pacote', 'pote', 'mini', 'grande', 'pequeno', 'medio'
  ]);

  const extractKeywords = (text: string): string[] =>
    normalizeText(text)
      .replace(/[().,/\\\-+]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  const activeCatalog = catalog.filter(p => p.ativo);
  const catalogEntries = activeCatalog.map(prod => {
    const descNorm = normalizeText(prod.descricao);
    const keywords = Array.from(new Set(extractKeywords(prod.descricao)));
    return { prod, descNorm, keywords };
  });

  // Frequência de cada palavra no catálogo (palavras comuns como "caramelo" pesam menos)
  const docFreq = new Map<string, number>();
  for (const entry of catalogEntries) {
    for (const kw of entry.keywords) {
      docFreq.set(kw, (docFreq.get(kw) || 0) + 1);
    }
  }

  // Ignora linhas de metadados (endereço, totais, pagamento, data/hora) para não casar com nome da loja/rua
  const isMetadataLine = (line: string): boolean => {
    const n = cleanTextForMoneyParsing(line).trim();
    return (
      /^(?:endereco|entregar\s+em|rua|av\.?|avenida|alameda|travessa|cep|bairro|nome|cliente|whatsapp|telefone|fone|pagamento|forma\s+de\s+pagamento|pix|chave\s+pix|troco|valor\s+total|total(?:\s+a\s+pagar)?|subtotal|desconto|taxa(?:\s+de)?\s+entrega|taxa\s+delivery|frete|modalidade|itens\s+(?:solicitados|do\s+pedido)|obs\.?|pedido(?:\s+para)?|retirada|delivery|data|horario|hora)\b/.test(
        n
      ) || /\bbeju\s+caramelos\b/.test(n)
    );
  };

  // Divide a mensagem em segmentos/itens (por quebra de linha, vírgula, ponto-e-vírgula ou " e ")
  const clauses = rawText
    .split(/\r?\n/)
    .filter(line => !isMetadataLine(line))
    .flatMap(line => line.split(/[,;]+|\s+\be\b\s+/i))
    .map(c => c.trim())
    .filter(c => c.length >= 3);

  const qtyByProductId = new Map<string, number>();

  for (const clause of clauses) {
    const clauseNorm = normalizeText(clause);
    const clauseWords = new Set(extractKeywords(clause));
    if (clauseWords.size === 0) continue;

    let bestEntry: (typeof catalogEntries)[number] | null = null;
    let bestScore = 0;

    for (const entry of catalogEntries) {
      if (entry.keywords.length === 0) continue;

      if (clauseNorm.includes(entry.descNorm) && entry.descNorm.length >= 5) {
        bestEntry = entry;
        bestScore = 1000 + entry.descNorm.length;
        break;
      }

      const matched = entry.keywords.filter(kw => clauseWords.has(kw));
      if (matched.length === 0) continue;

      const coverage = matched.length / entry.keywords.length;
      const hasUniqueKeyword = matched.some(kw => (docFreq.get(kw) || 0) === 1 && kw.length >= 5);
      const allNonGenericMatched = matched.some(kw => (docFreq.get(kw) || 0) <= 2);

      // Exige cobertura forte (>= 50% das palavras do produto ou >= 2 palavras) ou palavra única no catálogo
      if (matched.length < 2 && coverage < 0.5 && !hasUniqueKeyword) continue;
      if (!allNonGenericMatched && matched.length < 2) continue;

      let score = 0;
      for (const kw of matched) {
        const freq = docFreq.get(kw) || 1;
        score += 10 / freq;
      }
      score += coverage * 15;

      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    }

    if (bestEntry) {
      const qMatch = clauseNorm.match(/(?:^|\s)(\d+)\s*(?:x|un|und|cx|caixas?|centos?|pct|pacotes?|potes?)?\b/);
      let qtd = 1;
      if (qMatch) {
        const parsedQ = parseInt(qMatch[1], 10);
        // Evita confundir CEP/telefone/número de endereço com quantidade
        if (parsedQ >= 1 && parsedQ <= 500 && !/^\d{4,}$/.test(qMatch[1])) {
          qtd = parsedQ;
        }
      }
      qtyByProductId.set(bestEntry.prod.id, (qtyByProductId.get(bestEntry.prod.id) || 0) + qtd);
    }
  }

  for (const [prodId, qtd] of qtyByProductId.entries()) {
    const prod = activeCatalog.find(p => p.id === prodId);
    if (!prod) continue;
    itens.push({
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      produtoId: prod.id,
      quantidade: qtd,
      precoUnitario: prod.precoUnitario,
      subtotal: qtd * prod.precoUnitario
    });
  }

  const itensSubtotal = itens.reduce((acc, i) => acc + i.subtotal, 0);
  const taxaEntrega = extractDeliveryFee(rawText, tipoEntrega);
  const { discount: desconto } = extractDiscountInfo(rawText, itensSubtotal, taxaEntrega ?? 0);

  let turnoEntrega: DeliveryShift | undefined;
  if (tipoEntrega === 'DELIVERY') {
    if (/\bmanha\b/.test(normFull)) turnoEntrega = 'MANHA';
    else if (/\btarde\b/.test(normFull)) turnoEntrega = 'TARDE';
    else if (/\bnoite\b/.test(normFull)) turnoEntrega = 'NOITE';
    else turnoEntrega = inferDeliveryShiftFromDateTime(dataHoraEntrega);
  }

  return {
    clienteNome: clienteNome || 'Cliente WhatsApp',
    clienteTelefone,
    tipoEntrega,
    turnoEntrega,
    enderecoEntrega,
    unidadeSugeridaId,
    dataHoraEntrega,
    dataHoraEntregaFim,
    formaPagamento,
    trocoPara,
    taxaEntrega,
    desconto,
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
      const EDGE_TIMEOUT_MS = 10000;
          const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
          const invokePromise = supabase.functions.invoke('parse-whatsapp-order', {
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
          currentDate: localNow
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tempo limite excedido na IA (10s), usando parser local.')), EDGE_TIMEOUT_MS)
      );

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

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

      const toLocalDateTimeValue = (raw?: string): string => {
        if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return '';
        const datePart = extractLocalDateYyyyMmDd(raw);
        const timePart = extractTimeHHmm(raw);
        return datePart && timePart ? `${datePart}T${timePart}` : '';
      };

      const localRange = extractDeliveryDateTimeRange(rawText);
      const resolvedStart = toLocalDateTimeValue(parsed.dataHoraEntrega) || localRange.start;
      const resolvedEnd =
        toLocalDateTimeValue(parsed.dataHoraEntregaFim) ||
        (localRange.hasExplicitEnd
          ? `${resolvedStart.slice(0, 10)}T${localRange.end.slice(11, 16)}`
          : addHoursToDateTime(resolvedStart, 1));

      const resolvedTipoEntrega: DeliveryType =
        parsed.tipoEntrega === 'RETIRADA' ? 'RETIRADA' : 'DELIVERY';

      const itensSubtotal = itens.reduce((acc, i) => acc + i.subtotal, 0);
      const localDeliveryFee = extractDeliveryFee(rawText, resolvedTipoEntrega);
      const aiDeliveryFee =
        parsed.taxaEntrega != null && Number.isFinite(Number(parsed.taxaEntrega)) && Number(parsed.taxaEntrega) >= 0
          ? Number(Number(parsed.taxaEntrega).toFixed(2))
          : undefined;
      const resolvedTaxaEntrega =
        resolvedTipoEntrega === 'RETIRADA'
          ? 0
          : localDeliveryFee !== undefined
          ? localDeliveryFee
          : aiDeliveryFee !== undefined && aiDeliveryFee > 0
          ? aiDeliveryFee
          : undefined;

      const baseTotal = Number((itensSubtotal + (resolvedTaxaEntrega ?? 0)).toFixed(2));
      const { discount: localDiscount, explicitFinalTotal } = extractDiscountInfo(
        rawText,
        itensSubtotal,
        resolvedTaxaEntrega ?? 0
      );
      const aiDiscount = parsed.desconto != null ? Number(parsed.desconto) : 0;
      const aiMistookFinalTotal =
        explicitFinalTotal !== undefined && Math.abs(aiDiscount - explicitFinalTotal) < 0.01;
      const resolvedDiscount =
        localDiscount > 0
          ? localDiscount
          : !aiMistookFinalTotal && aiDiscount > 0 && (baseTotal <= 0 || aiDiscount <= baseTotal)
          ? Number(aiDiscount.toFixed(2))
          : 0;

      const normRaw = normalizeText(rawText);
      const resolvedTurnoEntrega: DeliveryShift | undefined =
        resolvedTipoEntrega === 'DELIVERY'
          ? /\bmanha\b/.test(normRaw)
            ? 'MANHA'
            : /\btarde\b/.test(normRaw)
            ? 'TARDE'
            : /\bnoite\b/.test(normRaw)
            ? 'NOITE'
            : inferDeliveryShiftFromDateTime(resolvedStart)
          : undefined;

      return {
        clienteNome: parsed.clienteNome || 'Cliente WhatsApp',
        clienteTelefone: parsed.clienteTelefone || '',
        tipoEntrega: resolvedTipoEntrega,
        turnoEntrega: resolvedTurnoEntrega,
        enderecoEntrega: parsed.enderecoEntrega || '',
        unidadeSugeridaId: parsed.unidadeSugeridaId,
        dataHoraEntrega: resolvedStart,
        dataHoraEntregaFim: resolvedEnd,
        formaPagamento: (['pix', 'debito', 'credito', 'dinheiro'].includes(parsed.formaPagamento)
          ? parsed.formaPagamento
          : 'pix') as PaymentMethod,
        trocoPara: parsed.trocoPara ? Number(parsed.trocoPara) : undefined,
        taxaEntrega: resolvedTaxaEntrega,
        desconto: resolvedDiscount,
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
