import { Order, OrderStatus, Product, StoreUnit } from '../types';
import { resolveCoordinates, haversineKm } from './routeOptimizerService';
import { formatDeliveryTimeRange } from '../utils/deliveryTimeRange';
import { formatCurrencyBR } from '../components/CurrencyInput';

export interface WhatsAppAutomationSettings {
  autoPromptOnStatusChange: boolean;
  apiEnabled: boolean;
  apiProvider: 'WEBHOOK' | 'EVOLUTION' | 'ZAPI';
  apiEndpointUrl: string;
  apiToken: string;
  defaultDeliveryFee: number;
  baseFeeMaxKm: number;
  baseFeeAmount: number;
  extraFeePerKm: number;
  maxDeliveryRadiusKm: number;
  templates: Record<OrderStatus, string>;
}

const STORAGE_KEY = 'juju_whatsapp_automation_settings';

export const DEFAULT_WHATSAPP_TEMPLATES: Record<OrderStatus, string> = {
  PENDENTE:
    '🍰 *Beju Caramelos*\nOlá, *{cliente}*! Recebemos o seu pedido *{pedido}*.\n\n*Itens:*\n{itens}\n\n*Modalidade:* {modalidade}\n*Data/Horário:* {horario}\n*Total:* R$ {total} ({pagamento})\n{pix}\nEm instantes confirmaremos o seu pedido! ✨',
  CONFIRMADO:
    '✅ *Pedido Confirmado — Beju Caramelos*\nOlá, *{cliente}*! Seu pedido *{pedido}* foi confirmado com sucesso!\n\n*Itens:*\n{itens}\n\n*Modalidade:* {modalidade}\n*Previsão:* {horario}\n*Total:* R$ {total}\nObrigado pela preferência! 💖',
  EM_PRODUCAO:
    '👩‍🍳 *Em Produção — Beju Caramelos*\nOlá, *{cliente}*! Seu pedido *{pedido}* já está sendo preparado com todo carinho pelo nosso ateliê! 🍰✨\n\n*Previsão de entrega/retirada:* {horario}',
  PRONTO:
    '🎁 *Pedido Pronto — Beju Caramelos*\nOlá, *{cliente}*! Seu pedido *{pedido}* já está prontinho!\n\n*Modalidade:* {modalidade}\n*Unidade:* {unidade}\n{endereco}',
  EM_ROTA:
    '🛵 *Saiu para Entrega — Beju Caramelos*\nOlá, *{cliente}*! Seu pedido *{pedido}* acabou de sair para entrega a partir da unidade *{unidade}*!\n\n*Endereço de destino:* {endereco}\nPrepare-se para receber suas delícias! 🍰✨',
  ENTREGUE:
    '🎉 *Pedido Entregue — Beju Caramelos*\nOlá, *{cliente}*! Consta que o seu pedido *{pedido}* foi entregue.\nEsperamos que você ame cada detalhe! Muito obrigado por escolher a Beju Caramelos! 💕',
  CANCELADO:
    '⚠️ *Atualização de Pedido — Beju Caramelos*\nOlá, *{cliente}*. Informamos que o pedido *{pedido}* foi cancelado. Caso tenha qualquer dúvida, estamos à disposição por aqui.'
};

export const DEFAULT_AUTOMATION_SETTINGS: WhatsAppAutomationSettings = {
  autoPromptOnStatusChange: true,
  apiEnabled: false,
  apiProvider: 'WEBHOOK',
  apiEndpointUrl: '',
  apiToken: '',
  defaultDeliveryFee: 18.0,
  baseFeeMaxKm: 15,
  baseFeeAmount: 18.0,
  extraFeePerKm: 2.0,
  maxDeliveryRadiusKm: 25,
  templates: { ...DEFAULT_WHATSAPP_TEMPLATES }
};

export function getWhatsAppAutomationSettings(): WhatsAppAutomationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUTOMATION_SETTINGS;
    const parsed = JSON.parse(raw);
    const mergedTemplates: Record<OrderStatus, string> = {
      ...DEFAULT_WHATSAPP_TEMPLATES,
      ...(parsed.templates || {})
    };
    (Object.keys(mergedTemplates) as OrderStatus[]).forEach(k => {
      mergedTemplates[k] = mergedTemplates[k]
        .replace(/JuJu Delivery/gi, 'Beju Caramelos')
        .replace(/JuJu/gi, 'Beju Caramelos');
    });
    return {
      ...DEFAULT_AUTOMATION_SETTINGS,
      ...parsed,
      baseFeeMaxKm: typeof parsed.baseFeeMaxKm === 'number' ? parsed.baseFeeMaxKm : 15,
      baseFeeAmount: typeof parsed.baseFeeAmount === 'number' ? parsed.baseFeeAmount : 18.0,
      defaultDeliveryFee:
        typeof parsed.baseFeeMaxKm === 'number' && typeof parsed.defaultDeliveryFee === 'number'
          ? parsed.defaultDeliveryFee
          : 18.0,
      templates: mergedTemplates
    };
  } catch {
    return DEFAULT_AUTOMATION_SETTINGS;
  }
}

export function saveWhatsAppAutomationSettings(settings: WhatsAppAutomationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Erro ao salvar configurações de automação WhatsApp:', err);
  }
}

export function normalizePhoneForWhatsApp(rawPhone: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function formatStatusNotificationMessage(
  order: Order,
  status: OrderStatus,
  products: Product[],
  units: StoreUnit[],
  customSettings?: WhatsAppAutomationSettings
): string {
  const settings = customSettings || getWhatsAppAutomationSettings();
  const template = settings.templates[status] || DEFAULT_WHATSAPP_TEMPLATES[status];
  const prodMap = new Map(products.map(p => [p.id, p]));
  const unit = units.find(u => u.id === (order.unidadeRetiradaId || order.unidadeOrigemId)) || units[0];

  const itensText = (order.itens || [])
    .map(i => `• ${i.quantidade}x ${prodMap.get(i.produtoId)?.descricao || 'Produto'} (R$ ${formatCurrencyBR(i.subtotal)})`)
    .join('\n');

  const paymentLabel = {
    pix: 'PIX',
    debito: 'Cartão de Débito',
    credito: 'Cartão de Crédito',
    dinheiro: 'Dinheiro'
  }[order.formaPagamento] || order.formaPagamento;

  const modalidadeText =
    order.tipoEntrega === 'DELIVERY'
      ? `Entrega Delivery (${order.enderecoEntrega || 'Endereço cadastrado'})`
      : `Retirada na Loja (${unit?.nome || 'Unidade'})`;

  const pixInfo =
    order.formaPagamento === 'pix'
      ? `*Chave PIX:* ${unit?.chavePix || 'financeiro@bejucaramelos.com.br'}`
      : '';

  const horarioText = formatDeliveryTimeRange(order.dataHoraEntrega, order.dataHoraEntregaFim, {
    tipoEntrega: order.tipoEntrega,
    turnoEntrega: order.tipoEntrega === 'DELIVERY' ? order.turnoEntrega : undefined
  });

  return template
    .replace(/\{cliente\}/g, order.clienteNome || 'Cliente')
    .replace(/\{pedido\}/g, order.numeroPedido || '')
    .replace(/\{itens\}/g, itensText || '—')
    .replace(/\{total\}/g, formatCurrencyBR(order.valorTotal))
    .replace(/\{modalidade\}/g, modalidadeText)
    .replace(/\{endereco\}/g, order.enderecoEntrega || unit?.endereco || '')
    .replace(/\{unidade\}/g, unit?.nome || 'Beju Caramelos')
    .replace(/\{horario\}/g, horarioText)
    .replace(/\{pagamento\}/g, paymentLabel)
    .replace(/\{pix\}/g, pixInfo)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function dispatchWhatsAppMessage(
  phone: string,
  message: string,
  settings?: WhatsAppAutomationSettings
): Promise<{ sentViaApi: boolean }> {
  const cfg = settings || getWhatsAppAutomationSettings();
  const cleanPhone = normalizePhoneForWhatsApp(phone);

  if (cfg.apiEnabled && cfg.apiEndpointUrl.trim()) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (cfg.apiToken.trim()) {
        headers['Authorization'] = `Bearer ${cfg.apiToken.trim()}`;
        headers['apikey'] = cfg.apiToken.trim();
      }
      const res = await fetch(cfg.apiEndpointUrl.trim(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: cleanPhone,
          number: cleanPhone,
          text: message,
          message,
          provider: cfg.apiProvider
        })
      });
      if (res.ok) {
        return { sentViaApi: true };
      }
    } catch (err) {
      console.warn('Falha ao enviar via API WhatsApp, abrindo WhatsApp Web:', err);
    }
  }

  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
  return { sentViaApi: false };
}

export async function calculateNearestUnitAndDeliveryFee(
  customerAddress: string,
  customerCep: string | undefined,
  units: StoreUnit[]
): Promise<{
  nearestUnit: StoreUnit;
  distanceKm: number;
  deliveryFee: number;
  baseFeeMaxKm: number;
  exceedsMaxRadius: boolean;
}> {
  const settings = getWhatsAppAutomationSettings();
  const baseLimitKm = settings.baseFeeMaxKm ?? 15;
  const baseFee = settings.baseFeeAmount ?? 18.0;
  const activeStores = units.filter(u => u.ativo && u.tipo === 'LOJA');
  const candidateUnits = activeStores.length > 0 ? activeStores : units.filter(u => u.ativo);
  const fallbackUnit = candidateUnits[0] || units[0];

  if (!customerAddress.trim() && !(customerCep || '').replace(/\D/g, '')) {
    return {
      nearestUnit: fallbackUnit,
      distanceKm: 0,
      deliveryFee: settings.defaultDeliveryFee,
      baseFeeMaxKm: baseLimitKm,
      exceedsMaxRadius: false
    };
  }

  const custCoords = await resolveCoordinates(customerAddress, customerCep, 'Salvador', 'BA');
  const unitCoordsList = await Promise.all(
    candidateUnits.map(unit =>
      resolveCoordinates(unit.endereco, unit.cep, unit.cidade || 'Salvador', 'BA')
    )
  );

  let bestUnit = fallbackUnit;
  let minRoadKm = Number.POSITIVE_INFINITY;

  // Try real road distance via OSRM Table API first
  try {
    const allPts = [custCoords, ...unitCoordsList];
    const coordsParam = allPts.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const res = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coordsParam}?sources=0&annotations=distance`
    );
    if (res.ok) {
      const data = await res.json();
      const row = data?.distances?.[0];
      if (Array.isArray(row)) {
        candidateUnits.forEach((unit, idx) => {
          const meters = row[idx + 1];
          if (typeof meters === 'number' && meters > 0) {
            const km = meters / 1000;
            if (km < minRoadKm) {
              minRoadKm = km;
              bestUnit = unit;
            }
          }
        });
      }
    }
  } catch {
    // Fallback to Haversine below
  }

  if (!Number.isFinite(minRoadKm)) {
    candidateUnits.forEach((unit, idx) => {
      const roadKm = haversineKm(custCoords, unitCoordsList[idx]) * 1.35;
      if (roadKm < minRoadKm) {
        minRoadKm = roadKm;
        bestUnit = unit;
      }
    });
  }

  const roundedKm = Number(minRoadKm.toFixed(1));
  const extraKm = Math.max(0, roundedKm - baseLimitKm);
  const computedFee = baseFee + extraKm * settings.extraFeePerKm;
  const finalFee = Math.round(computedFee * 2) / 2; // round to nearest 0.50

  return {
    nearestUnit: bestUnit,
    distanceKm: roundedKm,
    deliveryFee: Number.isFinite(finalFee) ? finalFee : settings.defaultDeliveryFee,
    baseFeeMaxKm: baseLimitKm,
    exceedsMaxRadius: roundedKm > (settings.maxDeliveryRadiusKm || 25)
  };
}
