import { Customer, Order, StoreUnit } from '../types';
import { normalizePhoneForWhatsApp, resolveOrderUnit } from '../services/whatsappAutomationService';

export interface OrderRegionInfo {
  key: string;
  label: string;
  isPickup: boolean;
}

export function normalizeTextKey(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const KNOWN_REGIONS: Array<{ label: string; keywords: string[] }> = [
  // Mais específicos primeiro para evitar colisões (ex.: Horto Bela Vista vs Horto Florestal, Barra Funda vs Barra)
  { label: 'Horto Bela Vista', keywords: ['horto bela vista'] },
  { label: 'Horto Florestal', keywords: ['horto florestal', 'waldemar falcao', 'horto'] },
  { label: 'Vilas do Atlântico', keywords: ['vilas do atlantico'] },
  { label: 'Praia do Flamengo', keywords: ['praia do flamengo', 'flamengo'] },
  { label: 'Caminho das Árvores', keywords: ['caminho das arvores', 'tancredo neves', 'salvador shopping'] },
  { label: 'Rio Vermelho', keywords: ['rio vermelho', 'barro vermelho'] },
  { label: 'Boca do Rio', keywords: ['boca do rio', 'corsario'] },
  { label: 'Costa Azul', keywords: ['costa azul'] },
  { label: 'Stella Maris', keywords: ['stella maris', 'pedra do sal'] },
  { label: 'Campo Grande', keywords: ['campo grande'] },
  { label: 'São Cristóvão', keywords: ['sao cristovao'] },
  { label: 'Lauro de Freitas', keywords: ['lauro de freitas', 'estrada do coco'] },
  { label: 'Simões Filho', keywords: ['simoes filho'] },
  { label: 'Barra Funda', keywords: ['barra funda', 'marques de sao vicente', 'padeiros'] },
  { label: 'Cerqueira César', keywords: ['cerqueira cesar', 'alameda lorena'] },
  { label: 'Consolação', keywords: ['consolacao', 'bela cintra'] },
  { label: 'Jardins', keywords: ['jardins', 'oscar freire'] },
  { label: 'Moema', keywords: ['moema', 'ibirapuera'] },
  { label: 'Pinheiros', keywords: ['pinheiros'] },
  { label: 'Pituba', keywords: ['pituba', 'paulo vi', 'manoel dias'] },
  { label: 'Itaigara', keywords: ['itaigara', 'antonio carlos magalhaes', 'acm'] },
  { label: 'Graça', keywords: ['graca', 'euclydes da cunha'] },
  { label: 'Ondina', keywords: ['ondina', 'adhemar de barros'] },
  { label: 'Vitória', keywords: ['corredor da vitoria', 'vitoria'] },
  { label: 'Canela', keywords: ['canela'] },
  { label: 'Federação', keywords: ['federacao', 'cardeal da silva'] },
  { label: 'Chame-Chame', keywords: ['chame-chame', 'chame chame'] },
  { label: 'Candeal', keywords: ['candeal'] },
  { label: 'Brotas', keywords: ['brotas', 'dom joao vi'] },
  { label: 'Acupe', keywords: ['acupe'] },
  { label: 'Matatu', keywords: ['matatu'] },
  { label: 'Nazaré', keywords: ['nazare'] },
  { label: 'Barris', keywords: ['barris'] },
  { label: 'Comércio', keywords: ['comercio'] },
  { label: 'Imbuí', keywords: ['imbui', 'jorge amado'] },
  { label: 'STIEP', keywords: ['stiep'] },
  { label: 'Armação', keywords: ['jardim armacao', 'armacao'] },
  { label: 'Patamares', keywords: ['patamares', 'pinto de aguiar', 'greenville'] },
  { label: 'Piatã', keywords: ['piata', 'orlando gomes'] },
  { label: 'Itapuã', keywords: ['itapua', 'dorival caymmi'] },
  { label: 'Paralela', keywords: ['shopping paralela', 'luis viana', 'paralela'] },
  { label: 'Trobogy', keywords: ['trobogy'] },
  { label: 'Alphaville', keywords: ['alphaville 1', 'alphaville 2', 'alphaville'] },
  { label: 'Cabula', keywords: ['cabula', 'silveira martins'] },
  { label: 'Pernambués', keywords: ['pernambues'] },
  { label: 'Jaguaribe', keywords: ['jaguaribe'] },
  { label: 'Mussurunga', keywords: ['mussurunga'] },
  { label: 'Cajazeiras', keywords: ['cajazeiras'] },
  { label: 'Ribeira', keywords: ['ribeira'] },
  { label: 'Bonfim', keywords: ['bonfim'] },
  { label: 'Buraquinho', keywords: ['buraquinho'] },
  { label: 'Miragem', keywords: ['miragem'] },
  { label: 'Abrantes', keywords: ['abrantes'] },
  { label: 'Camaçari', keywords: ['camacari'] },
  { label: 'Barra', keywords: ['farol da barra', 'barra', 'oceanica'] },
  { label: 'Centro', keywords: ['centro'] },
];

const LOWERCASE_PREPOSITIONS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

const IGNORED_CITIES_AND_STATES = new Set([
  'salvador',
  'ba',
  'bahia',
  'sao paulo',
  'sp',
  'brasil',
  'brazil',
]);

const COMPLEMENT_PREFIX_REGEX = /^(?:apto|ap|apartamento|bloco|bl|casa|cs|sala|sl|loja|lj|andar|ed|edificio|cond|condominio|torre|qd|quadra|lt|lote|fundos|frente|terreo|km|cep)\b/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasKeywordMatch(normalizedText: string, keyword: string): boolean {
  const escaped = escapeRegex(keyword);
  const regex = new RegExp(`(?:^|[\\s,\\-/.()])${escaped}(?:$|[\\s,\\-/.()])`, 'i');
  return regex.test(normalizedText);
}

function toCleanTitleCase(raw: string): string {
  const cleaned = raw
    .replace(/\bcep\b[:\s-]*/gi, '')
    .replace(/\d{5}-?\d{3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map((word, index) => {
      if (!word) return '';
      const lower = word.toLowerCase();
      if (index > 0 && LOWERCASE_PREPOSITIONS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .filter(Boolean)
    .join(' ');
}

function isIgnorableSegment(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed) return true;
  const normalized = normalizeTextKey(trimmed);
  if (!normalized || normalized.length < 2) return true;
  if (/^\d+[a-z]?$/i.test(normalized)) return true;
  if (/^\d{5}-?\d{3}$/.test(normalized)) return true;
  if (/^[a-z]{2}$/i.test(normalized)) return true;
  if (/^(?:n|no|num|numero)\s*\d+/i.test(normalized)) return true;
  if (COMPLEMENT_PREFIX_REGEX.test(normalized)) return true;
  if (IGNORED_CITIES_AND_STATES.has(normalized)) return true;
  if (/^(?:salvador|sao paulo)\s*[/-]\s*[a-z]{2}$/i.test(normalized)) return true;
  return false;
}

export function extractNeighborhoodFromAddress(rawAddress?: string): string | null {
  if (!rawAddress || !rawAddress.trim()) return null;

  const normalizedFull = normalizeTextKey(rawAddress);
  for (const region of KNOWN_REGIONS) {
    if (region.keywords.some(kw => hasKeywordMatch(normalizedFull, kw))) {
      return region.label;
    }
  }

  // Strip trailing CEP patterns and "Cidade - UF" / "Cidade/UF"
  const withoutCep = rawAddress
    .replace(/\bcep[:\s-]*\d{5}-?\d{3}\b/gi, '')
    .replace(/\b\d{5}-?\d{3}\b/g, '')
    .trim();

  // 1. Formato ViaCEP: "Rua X, 123, Bairro, Cidade - UF" (or "Rua X, Bairro, Cidade/UF")
  const commaParts = withoutCep
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  if (commaParts.length >= 2) {
    const cityStateIndex = commaParts.findIndex(part => {
      const norm = normalizeTextKey(part);
      return (
        IGNORED_CITIES_AND_STATES.has(norm) ||
        /^[a-z\s]+\s*[/-]\s*[a-z]{2}$/i.test(norm)
      );
    });

    if (cityStateIndex > 0) {
      for (let i = cityStateIndex - 1; i >= 1; i--) {
        const candidatePart = commaParts[i];
        const dashSplit = candidatePart.split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
        const candidate = dashSplit.length > 1 ? dashSplit[dashSplit.length - 1] : candidatePart;
        if (!isIgnorableSegment(candidate)) {
          const title = toCleanTitleCase(candidate);
          if (title) return title;
        }
      }
    }
  }

  // 2. Formato com hífen: "Rua X, 123, Apto 51 - Bairro"
  const hyphenParts = withoutCep
    .split(/\s+[-–—]\s+/)
    .map(p => p.trim())
    .filter(Boolean);

  if (hyphenParts.length >= 2) {
    for (let i = hyphenParts.length - 1; i >= 1; i--) {
      const seg = hyphenParts[i].split(',')[0].trim();
      if (!isIgnorableSegment(seg)) {
        const title = toCleanTitleCase(seg);
        if (title) return title;
      }
    }
  }

  // 3. Fallback percorrendo segmentos separados por vírgula do fim para o começo (ignorando 1º segmento que é logradouro)
  if (commaParts.length >= 3) {
    for (let i = commaParts.length - 1; i >= 1; i--) {
      const candidate = commaParts[i];
      if (!isIgnorableSegment(candidate)) {
        const title = toCleanTitleCase(candidate);
        if (title) return title;
      }
    }
  }

  return null;
}

export function resolveOrderRegion(
  order: Order,
  customers: Customer[],
  units: StoreUnit[]
): OrderRegionInfo {
  const orderPhone = normalizePhoneForWhatsApp(order.clienteTelefone || '');
  const orderNameNorm = normalizeTextKey(order.clienteNome || '');

  const matchedCustomer = customers.find(c => {
    const custPhone = normalizePhoneForWhatsApp(c.telefone || '');
    if (orderPhone && custPhone && orderPhone === custPhone) return true;
    return Boolean(orderNameNorm && normalizeTextKey(c.nome || '') === orderNameNorm);
  });

  if (order.tipoEntrega === 'DELIVERY') {
    const addressSource =
      (order.enderecoEntrega || '').trim() ||
      (order.clienteEndereco || '').trim() ||
      (matchedCustomer?.endereco || '').trim();
    const extracted = extractNeighborhoodFromAddress(addressSource);
    if (extracted) {
      return {
        key: normalizeTextKey(extracted),
        label: extracted,
        isPickup: false,
      };
    }
    return {
      key: 'nao-informado',
      label: 'Não informado',
      isPickup: false,
    };
  }

  // RETIRADA
  const pickupAddressSource =
    (order.clienteEndereco || '').trim() ||
    (matchedCustomer?.endereco || '').trim();
  const extractedPickupRegion = extractNeighborhoodFromAddress(pickupAddressSource);
  if (extractedPickupRegion) {
    return {
      key: normalizeTextKey(extractedPickupRegion),
      label: extractedPickupRegion,
      isPickup: true,
    };
  }

  const pickupUnit = resolveOrderUnit(order, units);
  if (pickupUnit?.nome) {
    const label = `Retirada • ${pickupUnit.nome}`;
    return {
      key: `retirada-${pickupUnit.id}`,
      label,
      isPickup: true,
    };
  }

  return {
    key: 'retirada-loja',
    label: 'Retirada em Loja',
    isPickup: true,
  };
}
