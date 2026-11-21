import React, { useState, useMemo, useEffect } from 'react';
import { CurrencyInput, formatCurrencyBR } from '../components/CurrencyInput';
import { TimeSelect15 } from '../components/TimeSelect15';
import {
  Product,
  Category,
  StoreUnit,
  StockItem,
  Order,
  OrderItem,
  Customer,
  DeliveryType,
  PaymentMethod,
  CardapioIntroConfig,
  CardapioThankYouConfig
} from '../types';
import {
  ShoppingBag,
  Sparkles,
  Search,
  Plus,
  Minus,
  Trash2,
  MapPin,
  Truck,
  Store,
  Clock,
  Phone,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Copy,
  Check,
  Send,
  ChevronRight,
  X,
  Printer
} from 'lucide-react';
import {
  formatCep,
  lookupByCep,
  searchCepByAddress,
  extractStreetAndNumber,
  buildFormattedAddressFromCep,
  CepAddressResult
} from '../services/cepService';
import { WhatsAppParserService } from '../services/whatsappParserService';
import {
  calculateNearestUnitAndDeliveryFee,
  getWhatsAppAutomationSettings,
  normalizePhoneForWhatsApp
} from '../services/whatsappAutomationService';
import {
  addHoursToDateTime,
  combineDateWithTime,
  extractTimeHHmm,
  formatDeliveryTimeRange
} from '../utils/deliveryTimeRange';
import { computeReservedStockMap, getUnitProductAvailability } from '../utils/stockAvailability';

interface CardapioDigitalScreenProps {
  products: Product[];
  categories: Category[];
  units: StoreUnit[];
  stock?: StockItem[];
  orders?: Order[];
  customers?: Customer[];
  introConfig?: CardapioIntroConfig;
  thankYouConfig?: CardapioThankYouConfig;
  onSubmitOrder: (order: Order, customer: Customer) => Promise<void> | void;
  onBackToAdmin?: () => void;
}

function getDefaultDeliveryDateTime(): string {
  const target = new Date(Date.now() + 3 * 3600000);
  const tzOffset = target.getTimezoneOffset() * 60000;
  return new Date(target.getTime() - tzOffset).toISOString().slice(0, 16);
}

export const CardapioDigitalScreen: React.FC<CardapioDigitalScreenProps> = ({
  products,
  categories,
  units,
  stock = [],
  orders = [],
  customers = [],
  introConfig = { imageUrl: '/logo.jpg', phrase: 'Beju Caramelos', durationSeconds: 5 },
  thankYouConfig = { imageUrl: '/logo.jpg', phrase: 'Muito obrigado!', durationSeconds: 3 },
  onSubmitOrder,
  onBackToAdmin
}) => {
  const urlUnitId = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get('unidade');
    if (!raw) return null;
    return units.some(u => u.id === raw && u.ativo) ? raw : null;
  }, [units]);

  const reservedStockMap = useMemo(() => computeReservedStockMap(orders), [orders]);

  const storeUnits = useMemo(
    () => units.filter(u => u.ativo),
    [units]
  );

  const [selectedUnitId, setSelectedUnitId] = useState<string>(() => urlUnitId || storeUnits[0]?.id || '');

  useEffect(() => {
    if (urlUnitId && selectedUnitId !== urlUnitId) {
      setSelectedUnitId(urlUnitId);
    }
  }, [urlUnitId, selectedUnitId]);

  const currentSellingUnit = useMemo(
    () => units.find(u => u.id === selectedUnitId) || storeUnits[0],
    [units, selectedUnitId, storeUnits]
  );

  const unitProductIds = useMemo(() => {
    if (!selectedUnitId) return new Set<string>();
    return new Set(stock.filter(s => s.unidadeId === selectedUnitId).map(s => s.produtoId));
  }, [stock, selectedUnitId]);

  const hasUnitSpecificProducts = unitProductIds.size > 0;

  const activeProducts = useMemo(
    () =>
      products.filter(
        p => p.ativo && (!hasUnitSpecificProducts || unitProductIds.has(p.id))
      ),
    [products, hasUnitSpecificProducts, unitProductIds]
  );

  const categoryMap = useMemo(
    () => new Map(categories.map(c => [c.id, c.nome])),
    [categories]
  );

  const activeCategories = useMemo(
    () =>
      categories
        .filter(c => c.ativo && activeProducts.some(p => p.categoriaId === c.id))
        .sort((a, b) => a.ordem - b.ordem),
    [categories, activeProducts]
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [cart, setCart] = useState<Record<string, number>>({});

  // AI Assistant state
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  // Customer & Delivery form state
  const [clienteNome, setClienteNome] = useState<string>('');
  const [clienteTelefone, setClienteTelefone] = useState<string>('');
  const [tipoEntrega, setTipoEntrega] = useState<DeliveryType>('DELIVERY');
  const [cep, setCep] = useState<string>('');
  const [numeroComplemento, setNumeroComplemento] = useState<string>('');
  const [logradouroBairro, setLogradouroBairro] = useState<string>('');
  const [enderecoCompleto, setEnderecoCompleto] = useState<string>('');
  const [detalheEntrega, setDetalheEntrega] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [baseFeeMaxKm, setBaseFeeMaxKm] = useState<number>(
    () => getWhatsAppAutomationSettings().baseFeeMaxKm ?? 15
  );
  const [exceedsMaxRadius, setExceedsMaxRadius] = useState<boolean>(false);
  const [taxaEntrega, setTaxaEntrega] = useState<number>(
    () => getWhatsAppAutomationSettings().defaultDeliveryFee
  );
  const [isCalculatingFee, setIsCalculatingFee] = useState<boolean>(false);
  const [cepFeedback, setCepFeedback] = useState<string | null>(null);
  const [addressCandidates, setAddressCandidates] = useState<CepAddressResult[]>([]);
  const [dataHoraEntrega, setDataHoraEntrega] = useState<string>(() => getDefaultDeliveryDateTime());
  const [dataHoraEntregaFim, setDataHoraEntregaFim] = useState<string>(() =>
    addHoursToDateTime(getDefaultDeliveryDateTime(), 1)
  );
  const [formaPagamento, setFormaPagamento] = useState<PaymentMethod>('pix');
  const [trocoPara, setTrocoPara] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [pixCopied, setPixCopied] = useState<boolean>(false);
  const [isCheckoutCollapsed, setIsCheckoutCollapsed] = useState<boolean>(true);
  const [activeIntroConfig, setActiveIntroConfig] = useState<CardapioIntroConfig>(() => {
    try {
      const saved = localStorage.getItem('juju_cardapio_intro_config');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<CardapioIntroConfig>;
        return {
          imageUrl: typeof parsed.imageUrl === 'string' && parsed.imageUrl.trim() ? parsed.imageUrl : introConfig?.imageUrl || '/logo.jpg',
          phrase: typeof parsed.phrase === 'string' ? parsed.phrase : introConfig?.phrase ?? 'Beju Caramelos',
          durationSeconds:
            typeof parsed.durationSeconds === 'number' && parsed.durationSeconds > 0
              ? parsed.durationSeconds
              : introConfig?.durationSeconds || 5
        };
      }
    } catch {
      // ignore storage errors
    }
    return {
      imageUrl: introConfig?.imageUrl || '/logo.jpg',
      phrase: introConfig?.phrase || 'Beju Caramelos',
      durationSeconds: introConfig?.durationSeconds || 5
    };
  });
  const [introPhase, setIntroPhase] = useState<'enter' | 'exit' | 'done'>('enter');
  const [activeThankYouConfig, setActiveThankYouConfig] = useState<CardapioThankYouConfig>(() => {
    try {
      const saved = localStorage.getItem('juju_cardapio_thankyou_config');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<CardapioThankYouConfig>;
        return {
          imageUrl:
            typeof parsed.imageUrl === 'string' && parsed.imageUrl.trim()
              ? parsed.imageUrl
              : thankYouConfig?.imageUrl || '/logo.jpg',
          phrase:
            typeof parsed.phrase === 'string' ? parsed.phrase : thankYouConfig?.phrase ?? 'Muito obrigado!',
          durationSeconds:
            typeof parsed.durationSeconds === 'number' && parsed.durationSeconds > 0
              ? parsed.durationSeconds
              : thankYouConfig?.durationSeconds || 3
        };
      }
    } catch {
      // ignore storage errors
    }
    return {
      imageUrl: thankYouConfig?.imageUrl || '/logo.jpg',
      phrase: thankYouConfig?.phrase ?? 'Muito obrigado!',
      durationSeconds: thankYouConfig?.durationSeconds || 3
    };
  });
  const [thankYouPhase, setThankYouPhase] = useState<'idle' | 'enter' | 'exit'>('idle');
  const [glowingProductIds, setGlowingProductIds] = useState<Record<string, boolean>>({});
  const [zoomedProduct, setZoomedProduct] = useState<Product | null>(null);

  useEffect(() => {
    setActiveIntroConfig({
      imageUrl: introConfig?.imageUrl?.trim() ? introConfig.imageUrl : '/logo.jpg',
      phrase: typeof introConfig?.phrase === 'string' ? introConfig.phrase : 'Beju Caramelos',
      durationSeconds: introConfig?.durationSeconds || 5
    });
  }, [introConfig?.imageUrl, introConfig?.phrase, introConfig?.durationSeconds]);

  useEffect(() => {
    setActiveThankYouConfig({
      imageUrl: thankYouConfig?.imageUrl?.trim() ? thankYouConfig.imageUrl : '/logo.jpg',
      phrase: typeof thankYouConfig?.phrase === 'string' ? thankYouConfig.phrase : 'Muito obrigado!',
      durationSeconds: thankYouConfig?.durationSeconds || 3
    });
  }, [thankYouConfig?.imageUrl, thankYouConfig?.phrase, thankYouConfig?.durationSeconds]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'juju_cardapio_intro_config' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Partial<CardapioIntroConfig>;
          setActiveIntroConfig({
            imageUrl: parsed.imageUrl?.trim() ? parsed.imageUrl : '/logo.jpg',
            phrase: typeof parsed.phrase === 'string' ? parsed.phrase : 'Beju Caramelos',
            durationSeconds:
              typeof parsed.durationSeconds === 'number' && parsed.durationSeconds > 0
                ? parsed.durationSeconds
                : 5
          });
        } catch {
          // ignore parse error
        }
      }
      if (e.key === 'juju_cardapio_thankyou_config' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Partial<CardapioThankYouConfig>;
          setActiveThankYouConfig({
            imageUrl: parsed.imageUrl?.trim() ? parsed.imageUrl : '/logo.jpg',
            phrase: typeof parsed.phrase === 'string' ? parsed.phrase : 'Muito obrigado!',
            durationSeconds:
              typeof parsed.durationSeconds === 'number' && parsed.durationSeconds > 0
                ? parsed.durationSeconds
                : 3
          });
        } catch {
          // ignore parse error
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (thankYouPhase === 'idle') return;
    const totalMs = Math.max(1000, Math.round((activeThankYouConfig.durationSeconds || 3) * 1000));
    const exitMs = Math.min(750, Math.floor(totalMs * 0.35));
    const exitStartMs = Math.max(200, totalMs - exitMs);

    const exitTimer = window.setTimeout(() => {
      setThankYouPhase('exit');
    }, exitStartMs);

    const doneTimer = window.setTimeout(() => {
      setThankYouPhase('idle');
    }, totalMs);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [thankYouPhase === 'enter', activeThankYouConfig.durationSeconds]);

  useEffect(() => {
    const totalMs = Math.max(1000, Math.round((activeIntroConfig.durationSeconds || 5) * 1000));
    const exitMs = Math.min(900, Math.floor(totalMs * 0.4));
    const exitStartMs = Math.max(200, totalMs - exitMs);

    setIntroPhase('enter');
    const exitTimer = window.setTimeout(() => {
      setIntroPhase('exit');
    }, exitStartMs);

    const doneTimer = window.setTimeout(() => {
      setIntroPhase('done');
    }, totalMs);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [activeIntroConfig.durationSeconds]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return activeProducts
      .filter(p => {
        if (selectedCategoryId !== 'ALL' && p.categoriaId !== selectedCategoryId) return false;
        if (q && !p.descricao.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  }, [activeProducts, selectedCategoryId, searchTerm]);

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, { categoryId: string; categoryName: string; items: Product[] }>();
    for (const prod of filteredProducts) {
      const catId = prod.categoriaId || 'outros';
      const catName = categoryMap.get(prod.categoriaId) || 'Outros';
      if (!groups.has(catId)) {
        groups.set(catId, { categoryId: catId, categoryName: catName, items: [] });
      }
      groups.get(catId)!.items.push(prod);
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName, 'pt-BR')
    );
  }, [filteredProducts, categoryMap]);

  const cartItems: OrderItem[] = useMemo(() => {
    const list: OrderItem[] = [];
    for (const [produtoId, qtd] of Object.entries(cart)) {
      if (qtd <= 0) continue;
      const prod = activeProducts.find(p => p.id === produtoId);
      if (!prod) continue;
      list.push({
        id: `item-${produtoId}`,
        produtoId: prod.id,
        quantidade: qtd,
        precoUnitario: prod.precoUnitario,
        subtotal: qtd * prod.precoUnitario
      });
    }
    return list;
  }, [cart, activeProducts]);

  const valorSubtotal = useMemo(
    () => cartItems.reduce((sum, i) => sum + i.subtotal, 0),
    [cartItems]
  );

  const effectiveDeliveryFee = tipoEntrega === 'DELIVERY' ? taxaEntrega : 0;
  const valorTotal = Math.max(0, valorSubtotal + effectiveDeliveryFee);

  const selectedUnit = useMemo(
    () => units.find(u => u.id === selectedUnitId) || storeUnits[0] || units[0],
    [units, storeUnits, selectedUnitId]
  );

  // Recalculate nearest store and delivery fee when CEP or address changes
  useEffect(() => {
    let cancelled = false;
    if (tipoEntrega !== 'DELIVERY') return;
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8 && enderecoCompleto.trim().length < 6) return;

    setIsCalculatingFee(true);
    calculateNearestUnitAndDeliveryFee(enderecoCompleto, cleanCep, units)
      .then(res => {
        if (cancelled) return;
        if (res.nearestUnit) {
          setSelectedUnitId(res.nearestUnit.id);
        }
        setDistanceKm(res.distanceKm);
        setTaxaEntrega(res.deliveryFee);
        setBaseFeeMaxKm(res.baseFeeMaxKm);
        setExceedsMaxRadius(res.exceedsMaxRadius);
        setIsCalculatingFee(false);
      })
      .catch(() => {
        if (!cancelled) setIsCalculatingFee(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cep, enderecoCompleto, tipoEntrega, units]);

  const handleOpenCheckoutPanel = () => {
    setIsCheckoutCollapsed(false);
    window.setTimeout(() => {
      document.getElementById('checkout-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleCepChange = async (rawValue: string) => {
    const formatted = formatCep(rawValue);
    setCep(formatted);
    setCepFeedback(null);
    setAddressCandidates([]);
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 8) {
      setIsCalculatingFee(true);
      const res = await lookupByCep(digits);
      if (res) {
        const base = `${res.logradouro}${res.bairro ? `, ${res.bairro}` : ''}, ${res.localidade} - ${res.uf}`;
        setLogradouroBairro(base);
        const full = buildFormattedAddressFromCep({
          logradouro: res.logradouro,
          bairro: res.bairro,
          localidade: res.localidade,
          uf: res.uf,
          existingNumberOrComplement: numeroComplemento
        });
        setEnderecoCompleto(full);
        setCepFeedback(`Endereço localizado: ${res.logradouro}, ${res.bairro}`);
      } else {
        setCepFeedback('CEP não localizado. Você pode digitar o endereço e clicar em "Descobrir CEP".');
      }
      setIsCalculatingFee(false);
    }
  };

  const handleFindCepFromAddress = async () => {
    const { street, numberPart } = extractStreetAndNumber(enderecoCompleto);
    if (!street || street.trim().length < 3) {
      setCepFeedback('Digite pelo menos o nome da rua/avenida no campo Endereço abaixo.');
      return;
    }
    setIsCalculatingFee(true);
    setCepFeedback(null);
    const list = await searchCepByAddress('BA', 'Salvador', street);
    setIsCalculatingFee(false);
    if (list.length === 0) {
      setCepFeedback('Nenhum CEP encontrado para esta rua em Salvador/BA.');
      setAddressCandidates([]);
      return;
    }
    if (list.length === 1) {
      const r = list[0];
      setCep(r.cep);
      const full = buildFormattedAddressFromCep({
        logradouro: r.logradouro,
        bairro: r.bairro,
        localidade: r.localidade,
        uf: r.uf,
        existingNumberOrComplement: numeroComplemento || numberPart
      });
      setLogradouroBairro(`${r.logradouro}, ${r.bairro}, ${r.localidade} - ${r.uf}`);
      setEnderecoCompleto(full);
      setCepFeedback(`CEP ${r.cep} preenchido automaticamente!`);
      setAddressCandidates([]);
    } else {
      setAddressCandidates(list);
      setCepFeedback(`Encontrados ${list.length} CEPs para "${street}". Selecione abaixo:`);
    }
  };

  const handleNumeroComplementoChange = (val: string) => {
    setNumeroComplemento(val);
    if (logradouroBairro) {
      const parts = logradouroBairro.split(',');
      const street = parts[0] || '';
      const rest = parts.slice(1).join(',').trim();
      setEnderecoCompleto(
        val.trim()
          ? `${street}, ${val.trim()}${rest ? `, ${rest}` : ''}`
          : logradouroBairro
      );
    }
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart(prev => {
      const nextQty = Math.max(0, (prev[productId] || 0) + delta);
      const copy = { ...prev };
      if (nextQty === 0) {
        delete copy[productId];
      } else {
        copy[productId] = nextQty;
      }
      return copy;
    });
    if (delta > 0) {
      setGlowingProductIds(prev => ({ ...prev, [productId]: true }));
      window.setTimeout(() => {
        setGlowingProductIds(prev => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
      }, 850);
    }
  };

  const handleRunAiAssistant = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    setAiFeedback(null);
    try {
      const parsed = await WhatsAppParserService.parseMessage(aiPrompt, activeProducts, units);
      if (parsed.itens.length > 0) {
        const nextCart: Record<string, number> = { ...cart };
        parsed.itens.forEach(item => {
          nextCart[item.produtoId] = (nextCart[item.produtoId] || 0) + item.quantidade;
        });
        setCart(nextCart);
      }
      if (parsed.clienteNome && parsed.clienteNome !== 'Cliente WhatsApp') {
        setClienteNome(parsed.clienteNome);
      }
      if (parsed.clienteTelefone) {
        setClienteTelefone(parsed.clienteTelefone);
      }
      if (parsed.tipoEntrega) {
        setTipoEntrega(parsed.tipoEntrega);
      }
      if (parsed.enderecoEntrega) {
        setEnderecoCompleto(parsed.enderecoEntrega);
      }
      if (parsed.unidadeSugeridaId) {
        setSelectedUnitId(parsed.unidadeSugeridaId);
      }
      if (parsed.dataHoraEntrega) {
        setDataHoraEntrega(parsed.dataHoraEntrega.slice(0, 16));
      }
      if (parsed.formaPagamento) {
        setFormaPagamento(parsed.formaPagamento);
      }
      if (parsed.trocoPara) {
        setTrocoPara(String(parsed.trocoPara));
      }
      setAiFeedback(
        parsed.itens.length > 0
          ? `✨ A IA adicionou ${parsed.itens.length} produto(s) ao seu carrinho e preencheu os dados do pedido!`
          : `✨ Dados preenchidos! Selecione abaixo os itens desejados no cardápio.`
      );
    } catch {
      setAiFeedback('Não foi possível interpretar automaticamente. Você pode selecionar os itens abaixo.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const buildStoreWhatsAppSummary = (order: Order): string => {
    const prodMap = new Map(products.map(p => [p.id, p]));
    const itensList = order.itens
      .map(i => `• ${i.quantidade}x ${prodMap.get(i.produtoId)?.descricao || 'Produto'} (R$ ${formatCurrencyBR(i.subtotal)})`)
      .join('\n');

    const paymentLabel = {
      pix: 'PIX',
      debito: 'Cartão de Débito',
      credito: 'Cartão de Crédito',
      dinheiro: 'Dinheiro'
    }[order.formaPagamento];

    return `🍰 *NOVO PEDIDO DIGITAL — BEJU CARAMELOS*
*Pedido:* ${order.numeroPedido}
*Cliente:* ${order.clienteNome}
*WhatsApp:* ${order.clienteTelefone}

*Modalidade:* ${
      order.tipoEntrega === 'DELIVERY'
        ? `Entrega Delivery (Origem: ${selectedUnit?.nome || 'Loja'})`
        : `Retirada na Loja (${selectedUnit?.nome || 'Loja'})`
    }
${order.tipoEntrega === 'DELIVERY' ? `*Endereço:* ${order.enderecoEntrega}${cep ? ` (CEP: ${cep})` : ''}\n${order.detalheEntrega ? `*Detalhe:* ${order.detalheEntrega}\n` : ''}` : ''}*Faixa de Horário desejada:* ${formatDeliveryTimeRange(order.dataHoraEntrega, order.dataHoraEntregaFim)}

*Itens do Pedido:*
${itensList}

*Subtotal:* R$ ${formatCurrencyBR(order.valorSubtotal)}
${order.tipoEntrega === 'DELIVERY' ? `*Taxa de Entrega${distanceKm > 0 ? ` (~${distanceKm} km)` : ''}:* R$ ${formatCurrencyBR(order.taxaEntrega)}\n` : ''}*TOTAL:* R$ ${formatCurrencyBR(order.valorTotal)}
*Pagamento:* ${paymentLabel}${order.trocoPara ? ` (Troco p/ R$ ${formatCurrencyBR(order.trocoPara)})` : ''}${order.observacoes ? `\n*Obs:* ${order.observacoes}` : ''}`;
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) {
      alert('Adicione pelo menos 1 item ao seu pedido.');
      return;
    }
    if (!clienteNome.trim() || !clienteTelefone.trim()) {
      alert('Informe seu Nome e WhatsApp para contato.');
      return;
    }
    if (tipoEntrega === 'DELIVERY' && !enderecoCompleto.trim()) {
      alert('Informe o CEP ou Endereço completo para entrega.');
      return;
    }

    setIsSubmitting(true);
    const numeroPedido = `#PED-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      numeroPedido,
      status: 'PENDENTE',
      dataPedido: new Date().toISOString(),
      dataHoraEntrega: dataHoraEntrega || getDefaultDeliveryDateTime(),
      dataHoraEntregaFim:
        dataHoraEntregaFim || addHoursToDateTime(dataHoraEntrega || getDefaultDeliveryDateTime(), 1),
      tipoEntrega,
      unidadeOrigemId: selectedUnit?.id || units[0]?.id || 'u-central',
      unidadeRetiradaId: tipoEntrega === 'RETIRADA' ? selectedUnit?.id : undefined,
      clienteNome: clienteNome.trim(),
      clienteTelefone: clienteTelefone.trim(),
      clienteEndereco: enderecoCompleto.trim(),
      enderecoEntrega: tipoEntrega === 'DELIVERY' ? enderecoCompleto.trim() : undefined,
      detalheEntrega: detalheEntrega.trim() || undefined,
      valorSubtotal,
      taxaEntrega: effectiveDeliveryFee,
      desconto: 0,
      valorTotal,
      formaPagamento,
      trocoPara: formaPagamento === 'dinheiro' && trocoPara ? Number(trocoPara) : undefined,
      observacoes: observacoes.trim() || 'Pedido realizado pelo Cardápio Digital IA',
      itens: cartItems
    };

    const customerRecord: Customer = {
      id: `cli-${Date.now()}`,
      nome: clienteNome.trim(),
      telefone: clienteTelefone.trim(),
      cep: cep ? formatCep(cep) : undefined,
      endereco: enderecoCompleto.trim(),
      detalheEntrega: detalheEntrega.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    try {
      await onSubmitOrder(newOrder, customerRecord);
    } finally {
      setIsSubmitting(false);
    }

    setThankYouPhase('enter');
    setConfirmedOrder(newOrder);
  };

  const thankYouOverlay =
    thankYouPhase !== 'idle' ? (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm px-6 pointer-events-none">
        <div
          className={`flex flex-col items-center justify-center text-center ${
            thankYouPhase === 'exit' ? 'animate-cardapio-intro-blink-exit' : 'animate-cardapio-intro-enter'
          }`}
        >
          <img
            src={activeThankYouConfig.imageUrl || '/logo.jpg'}
            alt={activeThankYouConfig.phrase || 'Muito obrigado!'}
            className="w-auto h-auto min-h-[28vh] max-h-[42vh] max-w-[80vw] rounded-3xl shadow-2xl border-2 border-slate-200/80 block"
          />
          {activeThankYouConfig.phrase && (
            <p className="mt-5 text-2xl sm:text-4xl font-extrabold tracking-tight max-w-md animate-cardapio-rainbow-text drop-shadow-xs">
              {activeThankYouConfig.phrase}
            </p>
          )}
        </div>
      </div>
    ) : null;

  if (confirmedOrder) {
    return (
      <div className="h-screen overflow-y-auto bg-[#f8f9ff] flex items-center justify-center p-4 font-sans">
        {thankYouOverlay}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-lg w-full p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Pedido {confirmedOrder.numeroPedido} Registrado!
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            Seu pedido já entrou na fila de atendimento da unidade <strong>{selectedUnit?.nome}</strong>.
          </p>

          {confirmedOrder.formaPagamento === 'pix' && selectedUnit?.chavePix && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-left space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase text-brand-700 block">
                Pagamento via PIX — Chave da Unidade ({selectedUnit.nome})
              </span>
              <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                <span className="font-mono text-xs font-bold text-slate-800 truncate">
                  {selectedUnit.chavePix}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedUnit.chavePix);
                    setPixCopied(true);
                    setTimeout(() => setPixCopied(false), 2000);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  {pixCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{pixCopied ? 'Copiada!' : 'Copiar Chave'}</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Pedido</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmedOrder(null);
                setCart({});
                setIsCheckoutCollapsed(true);
              }}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
            >
              Voltar ao Cardápio
            </button>
          </div>

          {/* Printable Receipt Area */}
          <div id="print-area" className="hidden text-left font-mono text-[11px] text-slate-900 space-y-2">
            <div className="text-center border-b border-dashed border-slate-400 pb-2">
              <p className="font-bold text-sm">Beju Caramelos</p>
              <p>{selectedUnit?.nome || 'Unidade'}</p>
              <p className="font-bold mt-1">Pedido {confirmedOrder.numeroPedido}</p>
            </div>
            <div className="space-y-0.5 border-b border-dashed border-slate-400 pb-2">
              <p><strong>Cliente:</strong> {confirmedOrder.clienteNome}</p>
              <p><strong>WhatsApp:</strong> {confirmedOrder.clienteTelefone}</p>
              <p>
                <strong>Modalidade:</strong>{' '}
                {confirmedOrder.tipoEntrega === 'DELIVERY' ? 'Delivery' : 'Retirada na Loja'}
              </p>
              {confirmedOrder.tipoEntrega === 'DELIVERY' && confirmedOrder.enderecoEntrega && (
                <p><strong>Endereço:</strong> {confirmedOrder.enderecoEntrega}</p>
              )}
              <p>
                <strong>Horário:</strong>{' '}
                {formatDeliveryTimeRange(confirmedOrder.dataHoraEntrega, confirmedOrder.dataHoraEntregaFim)}
              </p>
            </div>
            <div className="space-y-1 border-b border-dashed border-slate-400 pb-2">
              {confirmedOrder.itens.map(item => {
                const prod = products.find(p => p.id === item.produtoId);
                return (
                  <div key={item.id} className="flex justify-between gap-2">
                    <span>{item.quantidade}x {prod?.descricao || 'Produto'}</span>
                    <span>R$ {formatCurrencyBR(item.subtotal)}</span>
                  </div>
                );
              })}
            </div>
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>R$ {formatCurrencyBR(confirmedOrder.valorSubtotal)}</span>
              </div>
              {confirmedOrder.tipoEntrega === 'DELIVERY' && (
                <div className="flex justify-between">
                  <span>Taxa de Entrega</span>
                  <span>R$ {formatCurrencyBR(confirmedOrder.taxaEntrega)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-slate-300">
                <span>Total</span>
                <span>R$ {formatCurrencyBR(confirmedOrder.valorTotal)}</span>
              </div>
              <p className="pt-1"><strong>Pagamento:</strong> {confirmedOrder.formaPagamento.toUpperCase()}</p>
              {confirmedOrder.observacoes && (
                <p><strong>Obs:</strong> {confirmedOrder.observacoes}</p>
              )}
            </div>
          </div>
          {onBackToAdmin && (
            <button
              type="button"
              onClick={onBackToAdmin}
              className="text-xs text-slate-500 hover:text-slate-900 underline pt-1 block mx-auto cursor-pointer"
            >
              Voltar ao Painel Administrativo
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-[#f8f9ff] flex flex-col font-sans text-slate-900">
      {introPhase !== 'done' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm px-6 pointer-events-none">
          <div
            className={`flex flex-col items-center justify-center text-center ${
              introPhase === 'exit' ? 'animate-cardapio-intro-blink-exit' : 'animate-cardapio-intro-enter'
            }`}
          >
            <div className="relative inline-block">
              <img
                src={activeIntroConfig.imageUrl || '/logo.jpg'}
                alt={activeIntroConfig.phrase || 'Beju Caramelos'}
                className="w-auto h-auto min-h-[38vh] max-h-[50vh] max-w-[85vw] rounded-3xl shadow-2xl border-2 border-slate-200/80 block"
              />
              <img
                src="/logo.jpg"
                alt="Beju Caramelos"
                className="absolute top-3 right-3 w-11 h-11 rounded-full object-cover shadow-lg ring-2 ring-white bg-white"
              />
            </div>
            {activeIntroConfig.phrase && (
              <p className="mt-5 text-xl sm:text-2xl font-extrabold text-blue-600 tracking-tight max-w-md">
                {activeIntroConfig.phrase}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Unified Clean Header with Unit Info */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 lg:px-8 py-2.5 shadow-2xs">
        <div className="max-w-7xl w-full mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/logo.jpg"
              alt="Beju Caramelos"
              className="w-9 h-9 rounded-full object-cover ring-2 ring-brand-200 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                  Beju Caramelos • Cardápio
                </h1>
                {currentSellingUnit && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {activeProducts.length} {activeProducts.length === 1 ? 'produto' : 'produtos'}
                  </span>
                )}
              </div>
              {currentSellingUnit && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600 mt-0.5">
                  <span className="font-semibold text-brand-700 inline-flex items-center gap-1">
                    <Store className="w-3 h-3 shrink-0" />
                    <span>{currentSellingUnit.nome}</span>
                  </span>
                  {currentSellingUnit.endereco && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-slate-500 truncate max-w-xs">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{currentSellingUnit.endereco}</span>
                    </span>
                  )}
                  {currentSellingUnit.telefone && (
                    <span className="hidden md:inline-flex items-center gap-1 text-slate-500 font-mono">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{currentSellingUnit.telefone}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!urlUnitId && storeUnits.length > 1 && (
              <select
                aria-label="Trocar Unidade"
                title="Trocar Unidade"
                value={selectedUnitId}
                onChange={e => {
                  setSelectedUnitId(e.target.value);
                  setCart({});
                  setSelectedCategoryId('ALL');
                }}
                className="px-2.5 py-1.5 bg-slate-50 hover:bg-white border border-slate-300 rounded-full text-xs font-semibold text-slate-800 outline-none focus:border-brand-500 cursor-pointer"
              >
                {storeUnits.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            )}

            <a
              href="#checkout-panel"
              onClick={handleOpenCheckoutPanel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-xs font-bold hover:bg-brand-100 transition-colors"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-brand-600" />
              <span>{cartItems.reduce((acc, i) => acc + i.quantidade, 0)} item(ns)</span>
              <span className="font-mono">• R$ {formatCurrencyBR(valorSubtotal)}</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 lg:p-6 pb-24 lg:pb-6">
        {/* Left 7 Cols (or 12 when collapsed): Product Catalog */}
        <div className={`${isCheckoutCollapsed ? 'lg:col-span-12' : 'lg:col-span-7'} space-y-4 transition-all`}>
          {/* Search & Category Tabs */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar doces, bolos, caramelos..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('ALL')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategoryId === 'ALL'
                    ? 'bg-emerald-700 text-white shadow-sm border border-emerald-800'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 shadow-2xs'
                }`}
              >
                <span>Todos</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    selectedCategoryId === 'ALL'
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {activeProducts.length}
                </span>
              </button>

              {[...activeCategories]
                .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                .map(cat => {
                  const catCount = activeProducts.filter(p => p.categoriaId === cat.id).length;
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-700 text-white shadow-sm border border-emerald-800'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 shadow-2xs'
                      }`}
                    >
                      <span>{cat.nome}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {catCount}
                      </span>
                    </button>
                  );
                })}
            </div>

            {/* Product Grid */}
            {filteredProducts.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-2">
                <p className="text-xs font-semibold text-slate-600">
                  Nenhum produto encontrado para esta unidade ou filtro.
                </p>
                {(searchTerm || selectedCategoryId !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCategoryId('ALL');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
            <div className="space-y-5">
              {groupedProducts.map(group => (
                <div key={group.categoryId} className="space-y-2.5">
                  <div className="flex items-center justify-between bg-gradient-to-r from-brand-50 via-rose-50/70 to-amber-50/50 border border-brand-200/80 rounded-xl px-3.5 py-2 shadow-2xs">
                    <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-900">
                      {group.categoryName}
                    </h2>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/80 border border-brand-200/60 text-brand-700">
                      {group.items.length} {group.items.length === 1 ? 'item' : 'itens'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {group.items.map(prod => {
                const qty = cart[prod.id] || 0;
                const catName = categoryMap.get(prod.categoriaId);
                const avail =
                  selectedUnit?.id && stock.length > 0
                    ? getUnitProductAvailability(stock, reservedStockMap, selectedUnit.id, prod.id)
                    : null;
                return (
                  <div
                    key={prod.id}
                    className={`bg-white rounded-xl border p-2.5 flex gap-2.5 items-center justify-between transition-all shadow-2xs ${
                      qty > 0 ? 'border-brand-500 ring-1 ring-brand-500/30' : 'border-slate-200'
                    }`}
                  >
                    {prod.fotoUrl && (
                      <img
                        src={prod.fotoUrl}
                        alt={prod.descricao}
                        onClick={() => setZoomedProduct(prod)}
                        title="Clique para ampliar a foto"
                        className="w-[68px] h-[68px] rounded-lg object-cover shrink-0 bg-slate-100 border border-slate-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[9px] font-mono text-slate-400">{prod.sku}</span>
                        {catName && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 truncate max-w-[110px]">
                            {catName}
                          </span>
                        )}
                        {avail && avail.disponivel <= 0 && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            Sob encomenda
                          </span>
                        )}
                        {avail && avail.disponivel > 0 && qty > avail.disponivel && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            Disp: {avail.disponivel} • restante sob encomenda
                          </span>
                        )}
                      </div>
                      <h3 className="text-[11px] font-bold text-slate-900 leading-snug line-clamp-2">
                        {prod.descricao}
                      </h3>
                      <div className="flex items-center justify-between pt-0.5">
                        <div>
                          <span className="text-xs font-mono font-bold text-brand-700">
                            R$ {formatCurrencyBR(prod.precoUnitario)}
                          </span>
                          <span className="text-[9px] text-slate-400 ml-1">/{prod.unidade}</span>
                        </div>

                        {qty === 0 ? (
                          <button
                            type="button"
                            onClick={() => updateCartQty(prod.id, 1)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold transition-colors cursor-pointer ${
                              glowingProductIds[prod.id] ? 'animate-add-glow' : ''
                            }`}
                          >
                            <Plus className="w-3 h-3" />
                            <span>Adicionar</span>
                          </button>
                        ) : (
                          <div
                            className={`inline-flex items-center gap-1.5 bg-brand-50 border border-brand-200 rounded-lg px-1.5 py-0.5 ${
                              glowingProductIds[prod.id] ? 'animate-add-glow' : ''
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => updateCartQty(prod.id, -1)}
                              className="p-0.5 text-brand-700 hover:bg-brand-100 rounded cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono font-bold text-[11px] text-brand-900 w-4 text-center">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQty(prod.id, 1)}
                              className="p-0.5 text-brand-700 hover:bg-brand-100 rounded cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>

        {/* Right 5 Cols: Cart & Smart Checkout */}
        {!isCheckoutCollapsed ? (
        <div id="checkout-panel" className="lg:col-span-5 lg:self-start">
          <form
            onSubmit={handleCheckout}
            className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-brand-600" />
                <h2 className="text-sm font-bold text-slate-900">Peça aqui</h2>
              </div>
              <div className="flex items-center gap-2">
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart({})}
                    className="text-[11px] text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Limpar</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCheckoutCollapsed(true)}
                  title="Recolher painel Peça aqui"
                  aria-label="Recolher painel Peça aqui"
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cart Items List */}
            {cartItems.length > 0 && (
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 shadow-2xs">
                <div className="max-h-44 overflow-y-auto divide-y divide-sky-200/70 pr-1">
                  {cartItems.map(item => {
                    const prod = activeProducts.find(p => p.id === item.produtoId);
                    return (
                      <div key={item.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 truncate">{prod?.descricao}</p>
                          <span className="text-[11px] font-mono text-slate-500">
                            {item.quantidade}x R$ {formatCurrencyBR(item.precoUnitario)}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-slate-900">
                          R$ {formatCurrencyBR(item.subtotal)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Totals Summary */}
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-1 text-xs shadow-2xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal dos Itens</span>
                <span className="font-mono">R$ {formatCurrencyBR(valorSubtotal)}</span>
              </div>
              {tipoEntrega === 'DELIVERY' && (
                <div className="flex justify-between text-slate-600">
                  <span>Taxa de Entrega ({selectedUnit?.nome})</span>
                  <span className="font-mono">R$ {formatCurrencyBR(effectiveDeliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-sky-200/70">
                <span>Total a Pagar</span>
                <span className="font-mono text-brand-700">R$ {formatCurrencyBR(valorTotal)}</span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Seu Nome *</label>
                <input
                  type="text"
                  required
                  value={clienteNome}
                  onChange={e => setClienteNome(e.target.value)}
                  placeholder="Nome e Sobrenome"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Seu WhatsApp *</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={clienteTelefone}
                    onChange={e => {
                      const val = e.target.value;
                      setClienteTelefone(val);
                      const digits = val.replace(/\D/g, '');
                      if (digits.length >= 10 && customers.length > 0) {
                        const matched = customers.find(c =>
                          c.telefone.replace(/\D/g, '').endsWith(digits.slice(-9))
                        );
                        if (matched) {
                          if (!clienteNome.trim()) setClienteNome(matched.nome);
                          if (!cep && matched.cep) setCep(formatCep(matched.cep));
                          if (!enderecoCompleto.trim() && matched.endereco) {
                            setEnderecoCompleto(matched.endereco);
                          }
                          if (!detalheEntrega.trim() && matched.detalheEntrega) {
                            setDetalheEntrega(matched.detalheEntrega);
                          }
                        }
                      }
                    }}
                    placeholder="(71) 99999-9999"
                    className="w-full pl-8 pr-2 py-2 bg-white border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Delivery vs Pickup */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setTipoEntrega('DELIVERY')}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold transition-all cursor-pointer ${
                  tipoEntrega === 'DELIVERY'
                    ? 'bg-white text-brand-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Delivery</span>
              </button>
              <button
                type="button"
                onClick={() => setTipoEntrega('RETIRADA')}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold transition-all cursor-pointer ${
                  tipoEntrega === 'RETIRADA'
                    ? 'bg-white text-brand-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Retirar na Loja</span>
              </button>
            </div>

            {tipoEntrega === 'DELIVERY' ? (
              <div className="space-y-2.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <label className="font-semibold text-slate-700 block mb-1">CEP de Entrega</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        maxLength={9}
                        value={cep}
                        onChange={e => handleCepChange(e.target.value)}
                        placeholder="40000-000"
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleCepChange(cep)}
                        className="px-2.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-[11px] shrink-0 cursor-pointer"
                        title="Consultar endereço pelo CEP"
                      >
                        Buscar
                      </button>
                    </div>
                  </div>
                  <div className="col-span-5">
                    <label className="font-semibold text-slate-700 block mb-1">Número / Apto</label>
                    <input
                      type="text"
                      value={numeroComplemento}
                      onChange={e => handleNumeroComplementoChange(e.target.value)}
                      placeholder="Ex: 781, Apto 402"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Endereço Completo *</label>
                    <button
                      type="button"
                      onClick={handleFindCepFromAddress}
                      className="text-[11px] font-semibold text-brand-700 hover:underline cursor-pointer"
                    >
                      Não sabe o CEP? Descobrir pela rua
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={enderecoCompleto}
                    onChange={e => setEnderecoCompleto(e.target.value)}
                    placeholder="Rua, Número, Bairro, Cidade"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2"
                  />
                  {cepFeedback && (
                    <p className="text-[11px] text-brand-700 font-medium mt-1">{cepFeedback}</p>
                  )}
                  {addressCandidates.length > 0 && (
                    <div className="mt-1.5 max-h-28 overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">
                      {addressCandidates.map((cand, i) => (
                        <button
                          key={`${cand.cep}-${i}`}
                          type="button"
                          onClick={() => {
                            const { numberPart } = extractStreetAndNumber(enderecoCompleto);
                            setCep(cand.cep);
                            setLogradouroBairro(`${cand.logradouro}, ${cand.bairro}, ${cand.localidade} - ${cand.uf}`);
                            setEnderecoCompleto(
                              buildFormattedAddressFromCep({
                                logradouro: cand.logradouro,
                                bairro: cand.bairro,
                                localidade: cand.localidade,
                                uf: cand.uf,
                                existingNumberOrComplement: numeroComplemento || numberPart
                              })
                            );
                            setAddressCandidates([]);
                            setCepFeedback(`CEP ${cand.cep} selecionado!`);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-brand-50 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="truncate">
                            <strong>{cand.logradouro}</strong> — {cand.bairro}
                          </span>
                          <span className="font-mono font-bold text-brand-700 shrink-0">{cand.cep}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Referência / Detalhe da Entrega
                  </label>
                  <input
                    type="text"
                    value={detalheEntrega}
                    onChange={e => setDetalheEntrega(e.target.value)}
                    placeholder="Ex: Portaria 24h, interfone 402..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2"
                  />
                </div>

                {/* Nearest Store & Fee Badge */}
                <div className="bg-white border border-brand-200 rounded-lg px-3 py-2 text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                      <span>
                        Unidade mais próxima: <strong>{selectedUnit?.nome}</strong>
                        {distanceKm > 0 && ` (~${distanceKm} km)`}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-brand-700">
                      {isCalculatingFee ? 'Calculando...' : `Taxa: R$ ${formatCurrencyBR(taxaEntrega)}`}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Taxa base até {baseFeeMaxKm} km: R$ {formatCurrencyBR(getWhatsAppAutomationSettings().baseFeeAmount ?? 18)}
                  </p>
                  {exceedsMaxRadius && (
                    <p className="text-[10px] font-semibold text-amber-700">
                      ⚠️ Endereço acima do raio habitual ({getWhatsAppAutomationSettings().maxDeliveryRadiusKm} km) — sujeito a confirmação no WhatsApp.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <label className="font-semibold text-slate-700 block">
                  Escolha a Loja para Retirada:
                </label>
                <select
                  value={selectedUnit?.id || ''}
                  onChange={e => setSelectedUnitId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-semibold"
                >
                  {storeUnits.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.nome} — {u.endereco}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Schedule & Payment */}
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 flex items-center gap-1 mb-1">
                  <Clock className="w-3.5 h-3.5 text-brand-600" />
                  <span>Faixa de Horário (Entrega / Retirada)</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    required
                    aria-label="Data desejada"
                    value={(dataHoraEntrega || getDefaultDeliveryDateTime()).slice(0, 10)}
                    onChange={e => {
                      const newDate = e.target.value;
                      if (!newDate) return;
                      const startTime = extractTimeHHmm(dataHoraEntrega) || '12:00';
                      const endTime = extractTimeHHmm(
                        dataHoraEntregaFim || addHoursToDateTime(dataHoraEntrega, 1)
                      ) || '13:00';
                      setDataHoraEntrega(`${newDate}T${startTime}`);
                      setDataHoraEntregaFim(`${newDate}T${endTime}`);
                    }}
                    className="flex-1 min-w-[130px] h-9 bg-white border border-slate-300 rounded-lg px-2.5 py-0 font-mono text-[11px]"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 shrink-0">Das</span>
                    <TimeSelect15
                      ariaLabel="Hora inicial desejada"
                      value={extractTimeHHmm(dataHoraEntrega || getDefaultDeliveryDateTime())}
                      onChange={hhmm => {
                        const newStart = combineDateWithTime(
                          dataHoraEntrega || getDefaultDeliveryDateTime(),
                          hhmm
                        );
                        if (newStart) {
                          setDataHoraEntrega(newStart);
                          setDataHoraEntregaFim(addHoursToDateTime(newStart, 1));
                        }
                      }}
                      className="text-[11px] h-9 py-0"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 shrink-0">às</span>
                    <TimeSelect15
                      ariaLabel="Hora final desejada"
                      value={extractTimeHHmm(dataHoraEntregaFim || addHoursToDateTime(dataHoraEntrega, 1))}
                      onChange={hhmm => {
                        const newEnd = combineDateWithTime(
                          dataHoraEntrega || getDefaultDeliveryDateTime(),
                          hhmm
                        );
                        if (newEnd) setDataHoraEntregaFim(newEnd);
                      }}
                      className="text-[11px] h-9 py-0"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Forma de Pagamento</label>
                <select
                  value={formaPagamento}
                  onChange={e => setFormaPagamento(e.target.value as PaymentMethod)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-semibold"
                >
                  <option value="pix">PIX</option>
                  <option value="credito">Cartão de Crédito</option>
                  <option value="debito">Cartão de Débito</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
              </div>
            </div>

            {formaPagamento === 'dinheiro' && (
              <div className="text-xs">
                <label className="font-semibold text-slate-700 block mb-1">Troco para quanto? (R$)</label>
                <CurrencyInput
                  allowEmpty
                  value={trocoPara ? Number(trocoPara) : undefined}
                  onChangeValue={val => setTrocoPara(val > 0 ? String(val) : '')}
                  placeholder="Ex: 200,00"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono"
                />
              </div>
            )}

            <div className="text-xs">
              <label className="font-semibold text-slate-700 block mb-1">Observações do Pedido</label>
              <input
                type="text"
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Ex: Escrever Parabéns na placa de chocolate..."
                className="w-full bg-white border border-slate-300 rounded-lg p-2"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || cartItems.length === 0}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isSubmitting ? 'Registrando Pedido...' : 'Finalizar Pedido'}
              </span>
            </button>
          </form>
        </div>
        ) : (
          <button
            type="button"
            onClick={handleOpenCheckoutPanel}
            title="Abrir painel Peça aqui"
            aria-label="Abrir painel Peça aqui"
            className="fixed right-0 top-24 z-40 flex flex-col items-center gap-1.5 py-3.5 px-2.5 bg-sky-100 hover:bg-sky-200 text-sky-900 rounded-l-2xl shadow-xl border border-r-0 border-sky-300 cursor-pointer transition-all"
          >
            <ShoppingBag className="w-4 h-4 text-sky-700" />
            <span className="text-[11px] font-extrabold tracking-wide [writing-mode:vertical-rl] rotate-180">
              Peça aqui
            </span>
            {cartItems.length > 0 && (
              <span className="mt-0.5 px-1.5 py-0.5 rounded-full bg-sky-700 text-white font-mono text-[10px] font-extrabold leading-none">
                {cartItems.reduce((acc, i) => acc + i.quantidade, 0)}
              </span>
            )}
          </button>
        )}
      </div>
      {/* Mobile Sticky Cart Bar */}
      {cartItems.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-[11px] text-slate-500 font-medium">
              {cartItems.reduce((acc, i) => acc + i.quantidade, 0)} item(ns) • {currentSellingUnit?.nome || 'Beju'}
            </p>
            <p className="text-sm font-mono font-bold text-slate-900">
              R$ {formatCurrencyBR(valorSubtotal)}
            </p>
          </div>
          <a
            href="#checkout-panel"
            onClick={handleOpenCheckoutPanel}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-xs"
          >
            Finalizar Pedido
          </a>
        </div>
      )}

      {/* Zoomed Product Photo Modal */}
      {zoomedProduct?.fotoUrl && (
        <div
          onClick={() => setZoomedProduct(null)}
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="relative max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-white/20"
          >
            <button
              type="button"
              onClick={() => setZoomedProduct(null)}
              aria-label="Fechar foto ampliada"
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative bg-slate-50">
              <img
                src={zoomedProduct.fotoUrl}
                alt={zoomedProduct.descricao}
                className="w-full max-h-[75vh] object-contain"
              />
              <div className="absolute bottom-3 left-3 max-w-[60%] px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-xs shadow-md border border-slate-200/70">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {zoomedProduct.descricao}
                </p>
              </div>
              <div className="absolute bottom-3 right-3 px-3.5 py-2 rounded-2xl bg-slate-900/85 text-white shadow-lg backdrop-blur-xs">
                <span className="text-base font-mono font-extrabold">
                  R$ {formatCurrencyBR(zoomedProduct.precoUnitario)}
                </span>
                <span className="text-[11px] text-slate-300 ml-1">/{zoomedProduct.unidade}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
