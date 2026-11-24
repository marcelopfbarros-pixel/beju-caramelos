import React, { useState, useMemo, useEffect } from 'react';
import { Customer, Order, OrderStatus, Product, StoreUnit } from '../types';
import { Users, Plus, Search, Phone, MapPin, Trash2, X, Save, Printer, LayoutGrid, List, Loader2, ChevronDown, ChevronRight, ShoppingBag, Truck, Store, Clock, ExternalLink } from 'lucide-react';
import { PrintReportHeader } from '../components/PrintReportHeader';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { formatCurrencyBR } from '../components/CurrencyInput';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import { normalizePhoneForWhatsApp, resolveOrderUnit } from '../services/whatsappAutomationService';
import { formatDeliveryTimeRange } from '../utils/deliveryTimeRange';
import {
  PAYMENT_STATUS_BADGE_CLASSES,
  PAYMENT_STATUS_LABELS,
  getEffectivePaymentStatus,
  getOrderRemainingAmount,
} from '../utils/paymentStatus';
import {
  formatCep,
  lookupByCep,
  searchCepByAddress,
  extractStreetAndNumber,
  buildFormattedAddressFromCep,
  CepAddressResult
} from '../services/cepService';

interface ClientesScreenProps {
  customers: Customer[];
  orders?: Order[];
  products?: Product[];
  units?: StoreUnit[];
  onSaveCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customerId: string) => void;
  onOpenOrderInPedidos?: (order: Order) => void;
  onOpenCustomerOrdersInPedidos?: (customer: Customer) => void;
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDENTE: 'Pendente',
  CONFIRMADO: 'Confirmado',
  EM_PRODUCAO: 'Em Produção',
  PRONTO: 'Pronto',
  EM_ROTA: 'Em Rota',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

const ORDER_STATUS_BADGES: Record<OrderStatus, string> = {
  PENDENTE: 'bg-amber-100 text-amber-800 border-amber-300',
  CONFIRMADO: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  EM_PRODUCAO: 'bg-blue-100 text-blue-800 border-blue-300',
  PRONTO: 'bg-purple-100 text-purple-800 border-purple-300',
  EM_ROTA: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  ENTREGUE: 'bg-slate-100 text-slate-700 border-slate-300',
  CANCELADO: 'bg-red-100 text-red-800 border-red-300',
};

export const ClientesScreen: React.FC<ClientesScreenProps> = ({
  customers,
  orders = [],
  products = [],
  units = [],
  onSaveCustomer,
  onDeleteCustomer,
  onOpenOrderInPedidos,
  onOpenCustomerOrdersInPedidos
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'CARDS' : 'TABLE'
  );
  const [groupBy, setGroupBy] = useState<'PENDENCIA' | 'INICIAL' | 'NENHUM'>('PENDENCIA');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);
  const [openOrdersFilter, setOpenOrdersFilter] = useState<'TODOS' | 'COM_ABERTOS' | 'SEM_ABERTOS'>('TODOS');
  const [sortBy, setSortBy] = useState<'PROXIMA_ENTREGA' | 'ABERTOS_DESC' | 'NOME_ASC'>('PROXIMA_ENTREGA');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingOrdersCustomer, setViewingOrdersCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer>>({
    nome: '',
    telefone: '',
    cep: '',
    endereco: '',
    detalheEntrega: '',
    observacoes: ''
  });
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const [addressCandidates, setAddressCandidates] = useState<CepAddressResult[]>([]);

  useEffect(() => {
    if (!viewingOrdersCustomer) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setViewingOrdersCustomer(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingOrdersCustomer]);

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const openOrdersByCustomerId = useMemo(() => {
    const byNormTel = new Map<string, Order[]>();
    const byRawTel = new Map<string, Order[]>();
    const byName = new Map<string, Order[]>();

    orders.forEach(o => {
      if (o.status === 'ENTREGUE' || o.status === 'CANCELADO') return;
      const normTel = normalizePhoneForWhatsApp(o.clienteTelefone || '');
      const rawTel = (o.clienteTelefone || '').trim();
      const nameKey = (o.clienteNome || '').trim().toLowerCase();

      if (normTel) {
        const list = byNormTel.get(normTel) || [];
        list.push(o);
        byNormTel.set(normTel, list);
      }
      if (rawTel) {
        const list = byRawTel.get(rawTel) || [];
        list.push(o);
        byRawTel.set(rawTel, list);
      }
      if (nameKey) {
        const list = byName.get(nameKey) || [];
        list.push(o);
        byName.set(nameKey, list);
      }
    });

    const result = new Map<string, Order[]>();
    customers.forEach(c => {
      const normTel = normalizePhoneForWhatsApp(c.telefone || '');
      const rawTel = (c.telefone || '').trim();
      const nameKey = (c.nome || '').trim().toLowerCase();

      const matched =
        (normTel && byNormTel.get(normTel)) ||
        (rawTel && byRawTel.get(rawTel)) ||
        (nameKey && byName.get(nameKey)) ||
        [];

      const sorted = [...matched].sort(
        (a, b) =>
          new Date(a.dataHoraEntrega || a.dataPedido).getTime() -
          new Date(b.dataHoraEntrega || b.dataPedido).getTime()
      );
      result.set(c.id, sorted);
    });

    return result;
  }, [customers, orders]);

  const getOpenOrders = (customer: Customer): Order[] => {
    return openOrdersByCustomerId.get(customer.id) || [];
  };

  const getOpenOrdersCount = (customer: Customer) => {
    return getOpenOrders(customer).length;
  };

  const getEarliestDeliveryTs = (customer: Customer) => {
    const list = getOpenOrders(customer);
    if (list.length === 0) return Number.MAX_SAFE_INTEGER;
    return new Date(list[0].dataHoraEntrega || list[0].dataPedido).getTime();
  };

  const filtered = useMemo(() => {
    return customers
      .filter(c => {
        const matchSearch =
          c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.telefone.includes(searchTerm) ||
          (c.cep || '').includes(searchTerm) ||
          c.endereco.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchSearch) return false;
        const openCount = getOpenOrdersCount(c);
        if (openOrdersFilter === 'COM_ABERTOS' && openCount === 0) return false;
        if (openOrdersFilter === 'SEM_ABERTOS' && openCount > 0) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'PROXIMA_ENTREGA') {
          const da = getEarliestDeliveryTs(a);
          const db = getEarliestDeliveryTs(b);
          if (da !== db) return da - db;
          return a.nome.localeCompare(b.nome, 'pt-BR');
        }
        if (sortBy === 'ABERTOS_DESC') {
          const diff = getOpenOrdersCount(b) - getOpenOrdersCount(a);
          if (diff !== 0) return diff;
          return a.nome.localeCompare(b.nome, 'pt-BR');
        }
        return a.nome.localeCompare(b.nome, 'pt-BR');
      });
  }, [customers, searchTerm, openOrdersFilter, sortBy, openOrdersByCustomerId]);

  const groupedCustomers = useMemo(() => {
    if (groupBy === 'NENHUM') {
      return [{ label: 'Todos os Clientes', items: filtered }];
    }
    const map = new Map<string, Customer[]>();
    for (const c of filtered) {
      let key = '';
      if (groupBy === 'PENDENCIA') {
        key = getOpenOrdersCount(c) > 0 ? 'Com Pedidos em Aberto' : 'Sem Pedidos em Aberto';
      } else {
        key = (c.nome.trim().charAt(0) || '#').toUpperCase();
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries())
      .map(([label, items]) => ({ label, items }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [filtered, groupBy, openOrdersByCustomerId]);

  const visibleColumnCount = 6;

  const handleOpenNew = () => {
    setEditingCustomer({
      nome: '',
      telefone: '',
      cep: '',
      endereco: '',
      detalheEntrega: '',
      observacoes: ''
    });
    setCepMessage(null);
    setAddressCandidates([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer({ ...customer });
    setCepMessage(null);
    setAddressCandidates([]);
    setIsModalOpen(true);
  };

  const handleLookupCustomerCep = async (cepValue?: string) => {
    const raw = cepValue !== undefined ? cepValue : editingCustomer.cep || '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepMessage('Digite um CEP válido com 8 dígitos.');
      return;
    }
    setCepLoading(true);
    setCepMessage(null);
    setAddressCandidates([]);
    const result = await lookupByCep(digits);
    setCepLoading(false);

    if (!result) {
      setCepMessage('CEP não encontrado. Você também pode buscar pelo nome da rua abaixo.');
      return;
    }

    const { numberPart } = extractStreetAndNumber(editingCustomer.endereco || '');
    const formattedAddr = buildFormattedAddressFromCep({
      logradouro: result.logradouro,
      bairro: result.bairro,
      localidade: result.localidade,
      uf: result.uf,
      existingNumberOrComplement: numberPart
    });

    setEditingCustomer(prev => ({
      ...prev,
      cep: result.cep,
      endereco: formattedAddr || prev.endereco
    }));
    setCepMessage(`Endereço localizado: ${result.logradouro}, ${result.bairro} (${result.localidade}/${result.uf})`);
  };

  const handleFindCepFromCustomerAddress = async () => {
    const rawAddr = editingCustomer.endereco || '';
    const { street } = extractStreetAndNumber(rawAddr);
    if (!street || street.trim().length < 3) {
      setCepMessage('Digite pelo menos o nome da rua/avenida no campo Endereço para descobrir o CEP.');
      return;
    }
    setCepLoading(true);
    setCepMessage(null);
    const results = await searchCepByAddress('BA', 'Salvador', street);
    setCepLoading(false);

    if (results.length === 0) {
      setCepMessage('Nenhum CEP encontrado para este logradouro em Salvador/BA.');
      setAddressCandidates([]);
      return;
    }

    if (results.length === 1) {
      const r = results[0];
      const { numberPart } = extractStreetAndNumber(rawAddr);
      setEditingCustomer(prev => ({
        ...prev,
        cep: r.cep,
        endereco: buildFormattedAddressFromCep({
          logradouro: r.logradouro,
          bairro: r.bairro,
          localidade: r.localidade,
          uf: r.uf,
          existingNumberOrComplement: numberPart
        })
      }));
      setAddressCandidates([]);
      setCepMessage(`CEP ${r.cep} aplicado automaticamente!`);
    } else {
      setAddressCandidates(results);
      setCepMessage(`Encontrados ${results.length} CEPs para "${street}". Selecione o trecho correto:`);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer.nome?.trim() || !editingCustomer.telefone?.trim()) {
      alert('Preencha Nome e Telefone do cliente.');
      return;
    }

    onSaveCustomer({
      id: editingCustomer.id || `cli-${Date.now()}`,
      nome: editingCustomer.nome.trim(),
      telefone: editingCustomer.telefone.trim(),
      cep: editingCustomer.cep ? formatCep(editingCustomer.cep) : undefined,
      endereco: editingCustomer.endereco?.trim() || '',
      detalheEntrega: editingCustomer.detalheEntrega?.trim() || undefined,
      observacoes: editingCustomer.observacoes?.trim() || undefined,
      createdAt: editingCustomer.createdAt || new Date().toISOString()
    });
    setIsModalOpen(false);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between md:bg-white md:border-b md:border-[#e2e8f0] md:px-6 md:py-4 md:gap-4 print:hidden">
        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2.5 md:p-0 md:bg-transparent md:border-b-0">
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex flex-wrap items-center gap-2">
            <span>Clientes</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {filtered.length} clientes
            </span>
          </h1>
        </div>

        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 flex flex-wrap items-center gap-2">
          <div className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs shrink-0" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              title="Cards"
              aria-label="Cards"
              className={`h-full flex items-center justify-center px-2 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'CARDS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              title="Tabela"
              aria-label="Tabela"
              className={`h-full flex items-center justify-center px-2 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'TABLE' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleOpenNew}
            title="Novo Cliente"
            aria-label="Novo Cliente"
            className="flex items-center justify-center gap-1.5 h-8 w-8 md:w-auto px-0 md:px-3.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Cliente</span>
          </button>

          <button
            onClick={() => window.print()}
            title="Imprimir"
            aria-label="Imprimir"
            className="flex items-center justify-center h-8 w-8 p-0 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between md:bg-white/70 md:border-b md:border-[#e2e8f0] md:px-6 md:py-2.5 md:gap-3 print:hidden">
        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 flex items-center w-full md:w-auto min-w-0 overflow-hidden">
          <HybridFilterSort
            filterLabel="Pedidos Abertos:"
            filterValue={openOrdersFilter}
            onFilterChange={(v) => setOpenOrdersFilter(v as 'TODOS' | 'COM_ABERTOS' | 'SEM_ABERTOS')}
            filterOptions={[
              { value: 'TODOS', label: 'Todos' },
              { value: 'COM_ABERTOS', label: 'Com Pedidos Abertos' },
              { value: 'SEM_ABERTOS', label: 'Sem Pedidos Abertos' }
            ]}
            sortValue={sortBy}
            onSortChange={(v) => setSortBy(v as 'PROXIMA_ENTREGA' | 'ABERTOS_DESC' | 'NOME_ASC')}
            sortOptions={[
              { value: 'PROXIMA_ENTREGA', label: 'Data/Turno Entrega ↑' },
              { value: 'ABERTOS_DESC', label: 'Mais Pedidos Abertos' },
              { value: 'NOME_ASC', label: 'Nome (A-Z)' }
            ]}
            groupValue={groupBy}
            onGroupChange={(v) => setGroupBy(v as 'PENDENCIA' | 'INICIAL' | 'NENHUM')}
            groupOptions={[
              { value: 'PENDENCIA', label: 'Pedidos em Aberto' },
              { value: 'INICIAL', label: 'Letra Inicial' },
              { value: 'NENHUM', label: 'Sem Agrupamento' }
            ]}
          />
        </div>

        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 w-full md:flex-1 md:min-w-[140px] md:max-w-xs">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou endereço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-3 py-0 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
        {viewMode === 'CARDS' && (
          <div className="space-y-6 print:hidden">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p>Nenhum cliente encontrado.</p>
              </div>
            ) : (
              groupedCustomers.map(group => {
                const expanded = isGroupExpanded(group.label, groupBy !== 'NENHUM');
                return (
                <div key={group.label} className="space-y-3">
                  {groupBy !== 'NENHUM' && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between border-b border-slate-200 pb-1.5 hover:text-slate-900 cursor-pointer"
                    >
                      <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        <span>{group.label}</span>
                      </h2>
                      <span className="text-[11px] font-mono font-semibold text-slate-500">
                        {group.items.length} cliente(s)
                      </span>
                    </button>
                  )}
                  {expanded && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.items.map(customer => {
                      const openOrdersCount = getOpenOrdersCount(customer);
                      const isEditingCard =
                        (isModalOpen && editingCustomer.id === customer.id) ||
                        viewingOrdersCustomer?.id === customer.id;
                      return (
                        <div
                          key={customer.id}
                          onClick={() => handleOpenEdit(customer)}
                          className={`border rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3 min-w-0 overflow-hidden cursor-pointer transition-colors ${
                            isEditingCard
                              ? 'bg-brand-50/70 border-brand-400 ring-2 ring-brand-500 shadow-md'
                              : 'bg-white border-[#e2e8f0] hover:border-brand-400'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-bold text-slate-900">{customer.nome}</h3>
                              {openOrdersCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingOrdersCustomer(customer);
                                  }}
                                  title={`Ver ${openOrdersCount} pedido(s) aberto(s) de ${customer.nome}`}
                                  aria-label={`Ver ${openOrdersCount} pedido(s) aberto(s) de ${customer.nome}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 hover:border-amber-400 transition-colors cursor-pointer shrink-0"
                                >
                                  <ShoppingBag className="w-3 h-3" />
                                  <span>{openOrdersCount} aberto(s)</span>
                                </button>
                              ) : (
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">0 abertos</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-700">
                              {normalizePhoneForWhatsApp(customer.telefone) ? (
                                <a
                                  href={`https://wa.me/${normalizePhoneForWhatsApp(customer.telefone)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Abrir conversa no WhatsApp"
                                  className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 hover:underline"
                                >
                                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>{customer.telefone}</span>
                                </a>
                              ) : (
                                <>
                                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>{customer.telefone}</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-start gap-1.5 text-xs text-slate-600">
                              <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                              <div className="leading-tight">
                                <span>{customer.endereco || '—'}</span>
                                {customer.cep && (
                                  <span className="block text-[10px] font-mono text-slate-500 mt-0.5">
                                    CEP: {customer.cep}
                                  </span>
                                )}
                              </div>
                            </div>
                            {customer.observacoes && (
                              <p className="text-[11px] text-slate-500 italic">{customer.observacoes}</p>
                            )}
                          </div>
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                if (confirm(`Deseja remover o cliente ${customer.nome}?`)) {
                                  onDeleteCustomer(customer.id);
                                }
                              }}
                              className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Excluir Cliente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
                );
              })
            )}
          </div>
        )}

        <div id="print-report-area" className={`${viewMode === 'CARDS' ? 'hidden print:block' : ''} bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-x-auto max-w-full`}>
          <PrintReportHeader
            title="Clientes"
            badge={groupBy === 'NENHUM' ? 'Geral' : groupBy === 'PENDENCIA' ? 'Por Pedidos em Aberto' : 'Por Inicial'}
            subtitle={`${filtered.length} cliente(s)`}
          />
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-mono uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 font-semibold">Nome</th>
                <th className="py-3 px-4 font-semibold">Telefone / WhatsApp</th>
                <th className="py-3 px-4 font-semibold">Endereço Padrão</th>
                <th className="py-3 px-4 font-semibold text-center">Pedidos Abertos</th>
                <th className="py-3 px-4 font-semibold">Observações</th>
                <th className="py-3 px-4 font-semibold text-right print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p>Nenhum cliente encontrado.</p>
                  </td>
                </tr>
              ) : (
                groupedCustomers.map(group => {
                  const expanded = isGroupExpanded(group.label, groupBy !== 'NENHUM');
                  return (
                  <React.Fragment key={group.label}>
                    {groupBy !== 'NENHUM' && (
                      <tr
                        onClick={() => toggleGroup(group.label)}
                        className="bg-emerald-50 hover:bg-emerald-100/80 cursor-pointer transition-colors"
                      >
                        <td colSpan={visibleColumnCount} className="py-2 px-4 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                          <span className="inline-flex items-center gap-1.5">
                            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span>{group.label} ({group.items.length})</span>
                          </span>
                        </td>
                      </tr>
                    )}
                    {expanded && group.items.map(customer => {
                      const openOrdersCount = getOpenOrdersCount(customer);
                      const isEditingRow =
                        (isModalOpen && editingCustomer.id === customer.id) ||
                        viewingOrdersCustomer?.id === customer.id;
                      return (
                      <tr
                        key={customer.id}
                        onClick={() => handleOpenEdit(customer)}
                        className={`cursor-pointer transition-colors ${
                          isEditingRow
                            ? 'bg-brand-50/70 ring-1 ring-inset ring-brand-400 border-l-4 border-l-brand-600'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="py-3.5 px-4 font-bold text-slate-900">{customer.nome}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          {normalizePhoneForWhatsApp(customer.telefone) ? (
                            <a
                              href={`https://wa.me/${normalizePhoneForWhatsApp(customer.telefone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Abrir conversa no WhatsApp"
                              className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 hover:underline"
                            >
                              <Phone className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{customer.telefone}</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-emerald-600" />
                              {customer.telefone}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span>
                              {customer.endereco || '—'}
                              {customer.cep && (
                                <span className="ml-1.5 text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                  CEP {customer.cep}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {openOrdersCount > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingOrdersCustomer(customer);
                              }}
                              title={`Ver ${openOrdersCount} pedido(s) aberto(s) de ${customer.nome}`}
                              aria-label={`Ver ${openOrdersCount} pedido(s) aberto(s) de ${customer.nome}`}
                              className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 hover:border-amber-400 transition-colors cursor-pointer"
                            >
                              <ShoppingBag className="w-3 h-3" />
                              <span>{openOrdersCount}</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">0</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 italic">
                          {customer.observacoes || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2 print:hidden" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              if (confirm(`Deseja remover o cliente ${customer.nome}?`)) {
                                onDeleteCustomer(customer.id);
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Excluir Cliente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[60] p-2 sm:p-4">
          <form onSubmit={handleSave} className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[94dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-slate-900">
                {editingCustomer.id ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3.5 text-xs overflow-y-auto">
              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={editingCustomer.nome || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, nome: e.target.value })}
                  placeholder="Ex: Ana Maria Santos"
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2.5"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Telefone / WhatsApp *</label>
                <input
                  type="text"
                  required
                  value={editingCustomer.telefone || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, telefone: e.target.value })}
                  placeholder="Ex: +55 11 98765-4321"
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2.5 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">CEP</label>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <input
                    type="text"
                    value={editingCustomer.cep || ''}
                    onChange={(e) => {
                      const formatted = formatCep(e.target.value);
                      setEditingCustomer({ ...editingCustomer, cep: formatted });
                      if (formatted.replace(/\D/g, '').length === 8) {
                        handleLookupCustomerCep(formatted);
                      }
                    }}
                    placeholder="00000-000"
                    maxLength={9}
                    className="w-28 sm:w-36 bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2.5 font-mono"
                  />
                  <button
                    type="button"
                    disabled={cepLoading}
                    onClick={() => handleLookupCustomerCep()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer"
                  >
                    {cepLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>Buscar CEP</span>
                  </button>
                  <button
                    type="button"
                    disabled={cepLoading}
                    onClick={handleFindCepFromCustomerAddress}
                    className="flex items-center gap-1 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
                    title="Descobrir o CEP e endereço correto a partir do nome da rua digitado abaixo"
                  >
                    <MapPin className="w-3.5 h-3.5 text-brand-600" />
                    <span>Descobrir pelo Endereço</span>
                  </button>
                </div>
                {cepMessage && (
                  <p className="text-[11px] text-brand-700 font-medium mt-1.5">{cepMessage}</p>
                )}
                {addressCandidates.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50 divide-y divide-slate-200">
                    {addressCandidates.map((cand, idx) => (
                      <button
                        key={`${cand.cep}-${idx}`}
                        type="button"
                        onClick={() => {
                          const { numberPart } = extractStreetAndNumber(editingCustomer.endereco || '');
                          setEditingCustomer(prev => ({
                            ...prev,
                            cep: cand.cep,
                            endereco: buildFormattedAddressFromCep({
                              logradouro: cand.logradouro,
                              bairro: cand.bairro,
                              localidade: cand.localidade,
                              uf: cand.uf,
                              existingNumberOrComplement: numberPart
                            })
                          }));
                          setAddressCandidates([]);
                          setCepMessage(`CEP ${cand.cep} selecionado!`);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-brand-50 transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="truncate">
                          <span className="font-semibold text-slate-800">{cand.logradouro}</span>
                          {cand.complemento && <span className="text-slate-500"> ({cand.complemento})</span>}
                          <span className="block text-[10px] text-slate-500">
                            {cand.bairro} — {cand.localidade}/{cand.uf}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-[11px] text-brand-700 shrink-0">
                          {cand.cep}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Endereço Completo</label>
                <input
                  type="text"
                  value={editingCustomer.endereco || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, endereco: e.target.value })}
                  placeholder="Rua, Número, Complemento, Bairro"
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2.5"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Detalhe da Entrega</label>
                <input
                  type="text"
                  value={editingCustomer.detalheEntrega || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, detalheEntrega: e.target.value })}
                  placeholder="Ex: Deixar na portaria, tocar interfone 51, presente para..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2.5"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={editingCustomer.observacoes || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, observacoes: e.target.value })}
                  placeholder="Preferências, restrições ou referência de entrega..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2.5"
                />
              </div>
            </div>

            <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 sm:px-5 py-1.5 sm:py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Cliente</span>
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Modal de Pedidos Abertos do Cliente */}
      {viewingOrdersCustomer && (() => {
        const customerOpenOrders = getOpenOrders(viewingOrdersCustomer);
        const totalOpenValue = customerOpenOrders.reduce(
          (sum, o) => sum + (o.valorTotal || 0),
          0
        );
        const waDigits = normalizePhoneForWhatsApp(viewingOrdersCustomer.telefone || '');

        return (
          <div
            onClick={() => setViewingOrdersCustomer(null)}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[60] p-2 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200"
            >
              <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-amber-600 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      Pedidos Abertos — {viewingOrdersCustomer.nome}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {waDigits ? (
                      <a
                        href={`https://wa.me/${waDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-emerald-700 hover:underline"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{viewingOrdersCustomer.telefone}</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-mono text-slate-600">
                        <Phone className="w-3 h-3 text-emerald-600" />
                        <span>{viewingOrdersCustomer.telefone}</span>
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300 text-[10px]">
                      {customerOpenOrders.length}{' '}
                      {customerOpenOrders.length === 1 ? 'pedido' : 'pedidos'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px]">
                      Total: R$ {formatCurrencyBR(totalOpenValue)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingOrdersCustomer(null)}
                  className="text-slate-400 hover:text-slate-700 p-1 shrink-0 cursor-pointer"
                  aria-label="Fechar lista de pedidos abertos"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 sm:p-5 space-y-3 text-xs overflow-y-auto">
                {customerOpenOrders.length === 0 ? (
                  <div className="py-10 text-center text-slate-400">
                    <ShoppingBag className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p>Este cliente não possui pedidos em aberto no momento.</p>
                  </div>
                ) : (
                  customerOpenOrders.map(order => {
                    const payStatus = getEffectivePaymentStatus(order);
                    const remainingAmt = getOrderRemainingAmount(order);
                    const unit = resolveOrderUnit(order, units);
                    const deliveryAddr =
                      (order.enderecoEntrega || '').trim() ||
                      (order.clienteEndereco || '').trim();

                    return (
                      <div
                        key={order.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span className="font-mono font-bold text-slate-900 text-xs">
                              {order.numeroPedido}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ORDER_STATUS_BADGES[order.status]}`}
                            >
                              {ORDER_STATUS_LABELS[order.status]}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${PAYMENT_STATUS_BADGE_CLASSES[payStatus]}`}
                            >
                              {PAYMENT_STATUS_LABELS[payStatus]}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-slate-900 text-xs">
                              R$ {formatCurrencyBR(order.valorTotal)}
                            </div>
                            {payStatus !== 'PAGO' && remainingAmt > 0 && (
                              <div className="font-mono text-[10px] font-semibold text-amber-700">
                                Restante: R$ {formatCurrencyBR(remainingAmt)}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                          <span className="inline-flex items-center gap-1 font-mono text-slate-700">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>
                              {formatDeliveryTimeRange(
                                order.dataHoraEntrega,
                                order.dataHoraEntregaFim,
                                {
                                  tipoEntrega: order.tipoEntrega,
                                  turnoEntrega:
                                    order.tipoEntrega === 'DELIVERY'
                                      ? order.turnoEntrega
                                      : undefined,
                                }
                              )}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                            {order.tipoEntrega === 'DELIVERY' ? (
                              <Truck className="w-3 h-3 text-blue-600 shrink-0" />
                            ) : (
                              <Store className="w-3 h-3 text-emerald-600 shrink-0" />
                            )}
                            <span>
                              {order.tipoEntrega === 'DELIVERY' ? 'Delivery' : 'Retirada'}
                              {unit?.nome ? ` • ${unit.nome}` : ''}
                            </span>
                          </span>
                        </div>

                        {order.tipoEntrega === 'DELIVERY' && deliveryAddr && (
                          <div className="flex items-start gap-1.5 text-[11px] text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                            <span className="break-words min-w-0">
                              {deliveryAddr}
                              {order.detalheEntrega ? ` • ${order.detalheEntrega}` : ''}
                            </span>
                          </div>
                        )}

                        {order.itens && order.itens.length > 0 && (
                          <div className="bg-white border border-slate-200/80 rounded-lg divide-y divide-slate-100">
                            {order.itens.map((item, idx) => {
                              const prod = productMap.get(item.produtoId);
                              return (
                                <div
                                  key={item.id || `${order.id}-${item.produtoId}-${idx}`}
                                  className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                                >
                                  <span className="text-slate-800 min-w-0 truncate">
                                    <strong className="font-mono text-slate-900">
                                      {item.quantidade}x
                                    </strong>{' '}
                                    {prod?.descricao || 'Produto'}
                                  </span>
                                  <span className="font-mono font-semibold text-slate-700 shrink-0">
                                    R$ {formatCurrencyBR(item.subtotal)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-white border border-slate-200/80 rounded-lg px-2.5 py-1.5 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Taxa de entrega:</span>
                            <span className="font-mono font-semibold text-slate-700">
                              R$ {formatCurrencyBR(order.taxaEntrega || 0)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Desconto:</span>
                            <span
                              className={`font-mono font-semibold ${
                                (order.desconto || 0) > 0 ? 'text-emerald-700' : 'text-slate-500'
                              }`}
                            >
                              {(order.desconto || 0) > 0
                                ? `-R$ ${formatCurrencyBR(order.desconto)}`
                                : `R$ ${formatCurrencyBR(0)}`}
                            </span>
                          </div>
                        </div>

                        {onOpenOrderInPedidos && (
                          <div className="flex justify-end pt-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setViewingOrdersCustomer(null);
                                onOpenOrderInPedidos(order);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Abrir em Pedidos</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div>
                  {onOpenCustomerOrdersInPedidos && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetCustomer = viewingOrdersCustomer;
                        setViewingOrdersCustomer(null);
                        onOpenCustomerOrdersInPedidos(targetCustomer);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Ver todos em Pedidos</span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setViewingOrdersCustomer(null)}
                  className="px-4 py-1.5 sm:py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
