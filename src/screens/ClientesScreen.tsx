import React, { useState, useMemo } from 'react';
import { Customer, Order } from '../types';
import { Users, Plus, Search, Phone, MapPin, Edit2, Trash2, X, Save, Printer, LayoutGrid, List, Layers, Filter, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { PrintReportHeader } from '../components/PrintReportHeader';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
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
  onSaveCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customerId: string) => void;
}

export const ClientesScreen: React.FC<ClientesScreenProps> = ({
  customers,
  orders = [],
  onSaveCustomer,
  onDeleteCustomer
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>('TABLE');
  const [groupBy, setGroupBy] = useState<'PENDENCIA' | 'INICIAL' | 'NENHUM'>('PENDENCIA');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);
  const [openOrdersFilter, setOpenOrdersFilter] = useState<'TODOS' | 'COM_ABERTOS' | 'SEM_ABERTOS'>('TODOS');
  const [sortBy, setSortBy] = useState<'PROXIMA_ENTREGA' | 'ABERTOS_DESC' | 'NOME_ASC'>('PROXIMA_ENTREGA');
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const openOrdersByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
      if (o.status === 'ENTREGUE' || o.status === 'CANCELADO') return;
      const phoneKey = (o.clienteTelefone || '').trim();
      const nameKey = (o.clienteNome || '').trim().toLowerCase();
      if (phoneKey) map.set(`tel:${phoneKey}`, (map.get(`tel:${phoneKey}`) || 0) + 1);
      if (nameKey) map.set(`name:${nameKey}`, (map.get(`name:${nameKey}`) || 0) + 1);
    });
    return map;
  }, [orders]);

  const getOpenOrdersCount = (customer: Customer) => {
    const byTel = customer.telefone ? openOrdersByCustomer.get(`tel:${customer.telefone.trim()}`) : undefined;
    if (byTel !== undefined) return byTel;
    return openOrdersByCustomer.get(`name:${customer.nome.trim().toLowerCase()}`) || 0;
  };

  const earliestDeliveryByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
      if (o.status === 'ENTREGUE' || o.status === 'CANCELADO') return;
      const ts = new Date(o.dataHoraEntrega).getTime();
      const phoneKey = (o.clienteTelefone || '').trim();
      const nameKey = (o.clienteNome || '').trim().toLowerCase();
      if (phoneKey) {
        const prev = map.get(`tel:${phoneKey}`);
        if (prev === undefined || ts < prev) map.set(`tel:${phoneKey}`, ts);
      }
      if (nameKey) {
        const prev = map.get(`name:${nameKey}`);
        if (prev === undefined || ts < prev) map.set(`name:${nameKey}`, ts);
      }
    });
    return map;
  }, [orders]);

  const getEarliestDeliveryTs = (customer: Customer) => {
    const byTel = customer.telefone ? earliestDeliveryByCustomer.get(`tel:${customer.telefone.trim()}`) : undefined;
    if (byTel !== undefined) return byTel;
    return earliestDeliveryByCustomer.get(`name:${customer.nome.trim().toLowerCase()}`) ?? Number.MAX_SAFE_INTEGER;
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
  }, [customers, searchTerm, openOrdersFilter, sortBy, openOrdersByCustomer, earliestDeliveryByCustomer]);

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
  }, [filtered, groupBy, openOrdersByCustomer]);

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
    <div className="flex-1 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex items-center gap-2">
            <span>Clientes</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {filtered.length} clientes
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleOpenNew}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Cliente</span>
          </button>

          <button
            onClick={() => window.print()}
            title="Imprimir"
            aria-label="Imprimir"
            className="flex items-center justify-center p-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="px-6 py-3 bg-white/70 border-b border-[#e2e8f0] flex flex-wrap items-center gap-3 print:hidden">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs" role="group" aria-label="Modo de visualização">
          <button
            type="button"
            onClick={() => setViewMode('CARDS')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              viewMode === 'CARDS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('TABLE')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              viewMode === 'TABLE' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Tabela</span>
          </button>
        </div>

        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou endereço..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-500"
          />
        </div>

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

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
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
                      return (
                        <div key={customer.id} className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-bold text-slate-900">{customer.nome}</h3>
                              {openOrdersCount > 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                                  {openOrdersCount} aberto(s)
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">0 abertos</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-700">
                              <Phone className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{customer.telefone}</span>
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
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenEdit(customer)}
                              className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                              title="Editar Cliente"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
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

        <div id="print-report-area" className={`${viewMode === 'CARDS' ? 'hidden print:block' : ''} bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-hidden`}>
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
                  <td colSpan={6} className="py-12 text-center text-slate-400">
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
                        <td colSpan={6} className="py-2 px-4 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                          <span className="inline-flex items-center gap-1.5">
                            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span>{group.label} ({group.items.length})</span>
                          </span>
                        </td>
                      </tr>
                    )}
                    {expanded && group.items.map(customer => {
                      const openOrdersCount = getOpenOrdersCount(customer);
                      return (
                      <tr key={customer.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900">{customer.nome}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                            {customer.telefone}
                          </span>
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
                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              {openOrdersCount}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">0</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 italic">
                          {customer.observacoes || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2 print:hidden">
                          <button
                            onClick={() => handleOpenEdit(customer)}
                            className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                            title="Editar Cliente"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {editingCustomer.id ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={editingCustomer.nome || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, nome: e.target.value })}
                  placeholder="Ex: Ana Maria Santos"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Telefone / WhatsApp *</label>
                <input
                  type="text"
                  required
                  value={editingCustomer.telefone || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, telefone: e.target.value })}
                  placeholder="Ex: +55 11 98765-4321"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">CEP</label>
                <div className="flex items-center gap-2">
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
                    className="w-36 bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                  />
                  <button
                    type="button"
                    disabled={cepLoading}
                    onClick={() => handleLookupCustomerCep()}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer"
                  >
                    {cepLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>Buscar CEP</span>
                  </button>
                  <button
                    type="button"
                    disabled={cepLoading}
                    onClick={handleFindCepFromCustomerAddress}
                    className="flex items-center gap-1 px-2.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
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
                <label className="font-semibold text-slate-700 block mb-1">Endereço Completo</label>
                <input
                  type="text"
                  value={editingCustomer.endereco || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, endereco: e.target.value })}
                  placeholder="Rua, Número, Complemento, Bairro"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Detalhe da Entrega</label>
                <input
                  type="text"
                  value={editingCustomer.detalheEntrega || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, detalheEntrega: e.target.value })}
                  placeholder="Ex: Deixar na portaria, tocar interfone 51, presente para..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={editingCustomer.observacoes || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, observacoes: e.target.value })}
                  placeholder="Preferências, restrições ou referência de entrega..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Cliente</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
