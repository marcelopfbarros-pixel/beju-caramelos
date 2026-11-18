import React, { useState, useMemo, useEffect } from 'react';
import { CurrencyInput } from '../components/CurrencyInput';
import {
  Product,
  Category,
  StoreUnit,
  Order,
  OrderItem,
  Customer,
  DeliveryType,
  PaymentMethod
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
  Send
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

interface CardapioDigitalScreenProps {
  products: Product[];
  categories: Category[];
  units: StoreUnit[];
  customers?: Customer[];
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
  customers = [],
  onSubmitOrder,
  onBackToAdmin
}) => {
  const activeProducts = useMemo(() => products.filter(p => p.ativo), [products]);
  const activeCategories = useMemo(
    () => categories.filter(c => c.ativo).sort((a, b) => a.ordem - b.ordem),
    [categories]
  );
  const storeUnits = useMemo(() => {
    const lojas = units.filter(u => u.ativo && u.tipo === 'LOJA');
    return lojas.length > 0 ? lojas : units.filter(u => u.ativo);
  }, [units]);

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
  const [selectedUnitId, setSelectedUnitId] = useState<string>(() => storeUnits[0]?.id || '');
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
  const [formaPagamento, setFormaPagamento] = useState<PaymentMethod>('pix');
  const [trocoPara, setTrocoPara] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [pixCopied, setPixCopied] = useState<boolean>(false);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return activeProducts.filter(p => {
      if (selectedCategoryId !== 'ALL' && p.categoriaId !== selectedCategoryId) return false;
      if (q && !p.descricao.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activeProducts, selectedCategoryId, searchTerm]);

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
      .map(i => `• ${i.quantidade}x ${prodMap.get(i.produtoId)?.descricao || 'Produto'} (R$ ${i.subtotal.toFixed(2)})`)
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
${order.tipoEntrega === 'DELIVERY' ? `*Endereço:* ${order.enderecoEntrega}${cep ? ` (CEP: ${cep})` : ''}\n${order.detalheEntrega ? `*Detalhe:* ${order.detalheEntrega}\n` : ''}` : ''}*Data/Horário desejado:* ${new Date(order.dataHoraEntrega).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}

*Itens do Pedido:*
${itensList}

*Subtotal:* R$ ${order.valorSubtotal.toFixed(2)}
${order.tipoEntrega === 'DELIVERY' ? `*Taxa de Entrega${distanceKm > 0 ? ` (~${distanceKm} km)` : ''}:* R$ ${order.taxaEntrega.toFixed(2)}\n` : ''}*TOTAL:* R$ ${order.valorTotal.toFixed(2)}
*Pagamento:* ${paymentLabel}${order.trocoPara ? ` (Troco p/ R$ ${order.trocoPara.toFixed(2)})` : ''}${order.observacoes ? `\n*Obs:* ${order.observacoes}` : ''}`;
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

    setConfirmedOrder(newOrder);

    const storePhone = normalizePhoneForWhatsApp(selectedUnit?.telefone || '');
    const msg = buildStoreWhatsAppSummary(newOrder);
    const waUrl = storePhone
      ? `https://wa.me/${storePhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  if (confirmedOrder) {
    return (
      <div className="h-screen overflow-y-auto bg-[#f8f9ff] flex items-center justify-center p-4 font-sans">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-lg w-full p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Pedido {confirmedOrder.numeroPedido} Registrado!
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            Seu pedido já entrou na fila de atendimento da unidade <strong>{selectedUnit?.nome}</strong> e abrimos o WhatsApp para envio da confirmação.
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
              onClick={() => {
                const storePhone = normalizePhoneForWhatsApp(selectedUnit?.telefone || '');
                const msg = buildStoreWhatsAppSummary(confirmedOrder);
                const waUrl = storePhone
                  ? `https://wa.me/${storePhone}?text=${encodeURIComponent(msg)}`
                  : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                window.open(waUrl, '_blank', 'noopener,noreferrer');
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Reabrir no WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmedOrder(null);
                setCart({});
              }}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
            >
              Fazer Outro Pedido
            </button>
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
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 lg:px-8 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.jpg"
              alt="Beju Caramelos"
              className="w-10 h-10 rounded-full object-cover ring-2 ring-brand-200"
            />
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">
                Beju - Cardápio
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-xs font-bold">
            <ShoppingBag className="w-3.5 h-3.5 text-brand-600" />
            <span>{cartItems.reduce((acc, i) => acc + i.quantidade, 0)} item(ns)</span>
            <span className="font-mono">• R$ {valorSubtotal.toFixed(2)}</span>
          </span>
        </div>
      </header>

      {/* Main Layout */}
      <div className="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 lg:p-6">
        {/* Left 7 Cols: Product Catalog */}
        <div className="lg:col-span-7 space-y-5">
          {/* Search & Category Tabs */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar doces, bolos, salgados..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-brand-500"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('ALL')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategoryId === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Todos
                </button>
                {activeCategories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategoryId === cat.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat.nome}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {filteredProducts.map(prod => {
                const qty = cart[prod.id] || 0;
                return (
                  <div
                    key={prod.id}
                    className={`bg-white rounded-2xl border p-3.5 flex gap-3.5 items-center justify-between transition-all shadow-2xs ${
                      qty > 0 ? 'border-brand-500 ring-1 ring-brand-500/30' : 'border-slate-200'
                    }`}
                  >
                    {prod.fotoUrl && (
                      <img
                        src={prod.fotoUrl}
                        alt={prod.descricao}
                        className="w-20 h-20 rounded-xl object-cover shrink-0 bg-slate-100 border border-slate-100"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <span className="text-[10px] font-mono text-slate-400 block">{prod.sku}</span>
                      <h3 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                        {prod.descricao}
                      </h3>
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="text-sm font-mono font-bold text-brand-700">
                            R$ {prod.precoUnitario.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1">/{prod.unidade}</span>
                        </div>

                        {qty === 0 ? (
                          <button
                            type="button"
                            onClick={() => updateCartQty(prod.id, 1)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Adicionar</span>
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-2 py-1">
                            <button
                              type="button"
                              onClick={() => updateCartQty(prod.id, -1)}
                              className="p-0.5 text-brand-700 hover:bg-brand-100 rounded cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-mono font-bold text-xs text-brand-900 w-5 text-center">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQty(prod.id, 1)}
                              className="p-0.5 text-brand-700 hover:bg-brand-100 rounded cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
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
        </div>

        {/* Right 5 Cols: Cart & Smart Checkout */}
        <div className="lg:col-span-5">
          <form
            onSubmit={handleCheckout}
            className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4 sticky top-20"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-brand-600" />
                <h2 className="text-sm font-bold text-slate-900">Seu Pedido & Entrega</h2>
              </div>
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
            </div>

            {/* Cart Items List */}
            {cartItems.length === 0 ? (
              <div className="py-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                Adicione produtos do cardápio ao lado para montar seu pedido.
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 pr-1">
                {cartItems.map(item => {
                  const prod = activeProducts.find(p => p.id === item.produtoId);
                  return (
                    <div key={item.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 truncate">{prod?.descricao}</p>
                        <span className="text-[11px] font-mono text-slate-500">
                          {item.quantidade}x R$ {item.precoUnitario.toFixed(2)}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">
                        R$ {item.subtotal.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

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
                <span>Entrega (Delivery)</span>
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
                      {isCalculatingFee ? 'Calculando...' : `Taxa: R$ ${taxaEntrega.toFixed(2)}`}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Taxa base até {baseFeeMaxKm} km: R$ {(getWhatsAppAutomationSettings().baseFeeAmount ?? 18).toFixed(2)}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 flex items-center gap-1 mb-1">
                  <Clock className="w-3.5 h-3.5 text-brand-600" />
                  <span>Data e Horário</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={dataHoraEntrega}
                  onChange={e => setDataHoraEntrega(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono text-[11px]"
                />
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

            {/* Totals Summary */}
            <div className="border-t border-slate-200 pt-3 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal dos Itens</span>
                <span className="font-mono">R$ {valorSubtotal.toFixed(2)}</span>
              </div>
              {tipoEntrega === 'DELIVERY' && (
                <div className="flex justify-between text-slate-600">
                  <span>Taxa de Entrega ({selectedUnit?.nome})</span>
                  <span className="font-mono">R$ {effectiveDeliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1">
                <span>Total a Pagar</span>
                <span className="font-mono text-brand-700">R$ {valorTotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || cartItems.length === 0}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSubmitting ? 'Registrando Pedido...' : 'Finalizar Pedido e Enviar no WhatsApp'}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
