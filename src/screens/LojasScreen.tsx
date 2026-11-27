import React, { useState, useMemo, useEffect } from 'react';
import { StoreUnit, Product, Category, StockItem, Order } from '../types';
import { Building2, Plus, Phone, MapPin, X, CheckCircle, Shield, Printer, LayoutGrid, List, Layers, Filter, Search, Loader2, ClipboardList, AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { PrintReportHeader } from '../components/PrintReportHeader';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import { canManageUnits, UserRole } from '../utils/permissions';
import {
  formatCep,
  lookupByCep,
  searchCepByAddress,
  extractStreetAndNumber,
  buildFormattedAddressFromCep,
  CepAddressResult
} from '../services/cepService';

interface LojasScreenProps {
  units: StoreUnit[];
  products?: Product[];
  categories?: Category[];
  stock?: StockItem[];
  userRole?: UserRole;
  onSaveUnit: (unit: StoreUnit) => void;
  onDeleteUnit?: (unitId: string) => void;
  onUpdateStock?: (stock: StockItem[]) => void;
  onDeleteStockItem?: (stockId: string) => void;
  onSaveOrder?: (order: Order) => Promise<void> | void;
}

export const LojasScreen: React.FC<LojasScreenProps> = ({
  units,
  products = [],
  categories = [],
  stock = [],
  userRole = 'ADMIN',
  onSaveUnit,
  onUpdateStock,
  onDeleteStockItem,
  onSaveOrder
}) => {
  const canManage = canManageUnits(userRole);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productsModalUnit, setProductsModalUnit] = useState<StoreUnit | null>(null);
  const [unitProductSearch, setUnitProductSearch] = useState('');
  const [expandedProductCategories, setExpandedProductCategories] = useState<Record<string, boolean>>({});
  const [draftUnitProducts, setDraftUnitProducts] = useState<
    Record<string, { enabled: boolean; currentQty: number; minQty: number }>
  >({});
  const [inventoryPrintUnit, setInventoryPrintUnit] = useState<StoreUnit | null>(null);
  const [replenishmentModalUnit, setReplenishmentModalUnit] = useState<StoreUnit | null>(null);
  const [replenishmentDraftQtys, setReplenishmentDraftQtys] = useState<Record<string, number>>({});
  const [replenishmentFilter, setReplenishmentFilter] = useState<'TODOS' | 'PRECISAM_REPOSICAO'>('TODOS');
  const [confirmedReplenishmentOrder, setConfirmedReplenishmentOrder] = useState<Order | null>(null);
  const [replenishmentPrintOrder, setReplenishmentPrintOrder] = useState<Order | null>(null);
  const [replenishmentSuccessMsg, setReplenishmentSuccessMsg] = useState<string | null>(null);

  const openReplenishmentModal = (unit: StoreUnit) => {
    const prodSet = new Set(products.map(p => p.id));
    const initial: Record<string, number> = {};
    stock
      .filter(s => s.unidadeId === unit.id && prodSet.has(s.produtoId))
      .forEach(s => {
        initial[s.produtoId] =
          s.quantidadeAtual < s.quantidadeMinima
            ? Math.max(0, Number((s.quantidadeMinima - s.quantidadeAtual).toFixed(3)))
            : 0;
      });
    setReplenishmentDraftQtys(initial);
    setReplenishmentFilter('TODOS');
    setConfirmedReplenishmentOrder(null);
    setReplenishmentModalUnit(unit);
  };

  const handlePrintReplenishmentOrder = (order: Order) => {
    setInventoryPrintUnit(null);
    setReplenishmentPrintOrder(order);
    setTimeout(() => {
      window.print();
    }, 80);
  };

  const handleConfirmReplenishment = async () => {
    if (!replenishmentModalUnit || !onSaveOrder) {
      setReplenishmentModalUnit(null);
      return;
    }
    const items = Object.entries(replenishmentDraftQtys)
      .filter(([, qty]) => qty > 0)
      .map(([produtoId, quantidade]) => ({
        id: `ri-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        produtoId,
        quantidade,
        precoUnitario: 0,
        subtotal: 0
      }));

    if (items.length === 0) {
      alert('Informe ao menos 1 produto com quantidade maior que zero para gerar o pedido de reposição.');
      return;
    }

    const now = new Date();
    const deliveryDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const centralUnit = units.find(u => u.tipo === 'CENTRAL');
    const newOrder: Order = {
      id: `ord-rep-${Date.now()}`,
      numeroPedido: `#REP-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'CONFIRMADO',
      dataPedido: now.toISOString(),
      dataHoraEntrega: deliveryDate.toISOString(),
      tipoEntrega: 'DELIVERY',
      unidadeOrigemId: replenishmentModalUnit.id,
      clienteNome: `Reposição — ${replenishmentModalUnit.nome}`,
      clienteTelefone: replenishmentModalUnit.telefone || centralUnit?.telefone || '(71) 00000-0000',
      clienteEndereco: replenishmentModalUnit.endereco,
      enderecoEntrega: `${replenishmentModalUnit.endereco}, ${replenishmentModalUnit.cidade}`,
      valorSubtotal: 0,
      taxaEntrega: 0,
      desconto: 0,
      valorTotal: 0,
      formaPagamento: 'pix',
      observacoes: `Pedido Especial de Reposição de Estoque (${replenishmentModalUnit.nome} → ${centralUnit?.nome || 'Ateliê'})`,
      itens: items
    };

    await onSaveOrder(newOrder);
    setReplenishmentSuccessMsg(`Pedido especial ${newOrder.numeroPedido} criado para ${replenishmentModalUnit.nome}!`);
    setTimeout(() => setReplenishmentSuccessMsg(null), 4000);
    setConfirmedReplenishmentOrder(newOrder);
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      setInventoryPrintUnit(null);
      setReplenishmentPrintOrder(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const openProductsModal = (unit: StoreUnit) => {
    const unitStockMap = new Map<string, StockItem>();
    stock.filter(s => s.unidadeId === unit.id).forEach(s => unitStockMap.set(s.produtoId, s));
    const initial: Record<string, { enabled: boolean; currentQty: number; minQty: number }> = {};
    products.forEach(p => {
      const existing = unitStockMap.get(p.id);
      initial[p.id] = {
        enabled: Boolean(existing),
        currentQty: existing ? existing.quantidadeAtual : 0,
        minQty: existing ? existing.quantidadeMinima : 5
      };
    });
    setDraftUnitProducts(initial);
    setUnitProductSearch('');
    setExpandedProductCategories({});
    setProductsModalUnit(unit);
  };

  const handleSaveUnitProducts = () => {
    if (!productsModalUnit || !onUpdateStock) {
      setProductsModalUnit(null);
      return;
    }
    const unitId = productsModalUnit.id;
    const existingForUnit = stock.filter(s => s.unidadeId === unitId);
    const existingByProd = new Map(existingForUnit.map(s => [s.produtoId, s]));
    const otherUnitsStock = stock.filter(s => s.unidadeId !== unitId);
    const nowIso = new Date().toISOString();
    const updatedUnitStock: StockItem[] = [];

    products.forEach(prod => {
      const cfg = draftUnitProducts[prod.id];
      const existing = existingByProd.get(prod.id);
      if (cfg?.enabled) {
        if (existing) {
          updatedUnitStock.push({
            ...existing,
            quantidadeAtual: Math.max(0, Number(cfg.currentQty) || 0),
            quantidadeMinima: Math.max(0, Number(cfg.minQty) || 0),
            dataAtualizacao: nowIso
          });
        } else {
          updatedUnitStock.push({
            id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            unidadeId: unitId,
            produtoId: prod.id,
            quantidadeAtual: Math.max(0, Number(cfg.currentQty) || 0),
            quantidadeMinima: Math.max(0, Number(cfg.minQty) || 0),
            dataAtualizacao: nowIso
          });
        }
      } else if (existing && onDeleteStockItem) {
        onDeleteStockItem(existing.id);
      }
    });

    onUpdateStock([...otherUnitsStock, ...updatedUnitStock]);
    setProductsModalUnit(null);
  };

  const handlePrintInventory = (unit: StoreUnit) => {
    setInventoryPrintUnit(unit);
    setTimeout(() => {
      window.print();
    }, 80);
  };
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [groupBy, setGroupBy] = useState<'TIPO' | 'STATUS' | 'NENHUM'>('TIPO');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);
  const [typeFilter, setTypeFilter] = useState<'TODAS' | 'CENTRAL' | 'LOJA' | 'ATIVAS' | 'INATIVAS'>('TODAS');
  const [sortBy, setSortBy] = useState<'NOME_ASC' | 'CODIGO_ASC' | 'TIPO_ASC'>('NOME_ASC');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUnits = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return units
      .filter(u => {
        if (typeFilter === 'CENTRAL' && u.tipo !== 'CENTRAL') return false;
        if (typeFilter === 'LOJA' && u.tipo !== 'LOJA') return false;
        if (typeFilter === 'ATIVAS' && !u.ativo) return false;
        if (typeFilter === 'INATIVAS' && u.ativo) return false;
        if (q) {
          const match =
            u.nome.toLowerCase().includes(q) ||
            u.codigo.toLowerCase().includes(q) ||
            u.cidade.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'CODIGO_ASC') return a.codigo.localeCompare(b.codigo, 'pt-BR');
        if (sortBy === 'TIPO_ASC') return a.tipo.localeCompare(b.tipo, 'pt-BR');
        return a.nome.localeCompare(b.nome, 'pt-BR');
      });
  }, [units, typeFilter, sortBy, searchTerm]);

  const groupedUnits = useMemo(() => {
    if (groupBy === 'NENHUM') {
      return [{ label: 'Todas as Unidades', items: filteredUnits }];
    }
    const map = new Map<string, StoreUnit[]>();
    for (const u of filteredUnits) {
      const key =
        groupBy === 'TIPO'
          ? u.tipo === 'CENTRAL'
            ? 'Unidade Central'
            : 'Lojas / Filiais'
          : u.ativo
          ? 'Ativas'
          : 'Inativas';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return Array.from(map.entries())
      .map(([label, items]) => ({ label, items }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [filteredUnits, groupBy]);

  const hideTipo = groupBy === 'TIPO';
  const hideStatus = groupBy === 'STATUS';
  const visibleColumnCount = 7 - (hideTipo ? 1 : 0) - (hideStatus ? 1 : 0);
  const [editingUnit, setEditingUnit] = useState<Partial<StoreUnit>>({
    codigo: `LOJA-0${units.length}`,
    nome: '',
    tipo: 'LOJA',
    cep: '',
    endereco: '',
    cidade: 'Salvador',
    telefone: '',
    chavePix: '',
    ativo: true
  });
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const [addressCandidates, setAddressCandidates] = useState<CepAddressResult[]>([]);

  const handleLookupUnitCep = async (cepValue?: string) => {
    const raw = cepValue !== undefined ? cepValue : editingUnit.cep || '';
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
      setCepMessage('CEP não encontrado. Você também pode buscar pelo nome da rua.');
      return;
    }

    const { numberPart } = extractStreetAndNumber(editingUnit.endereco || '');
    const formattedAddr = buildFormattedAddressFromCep({
      logradouro: result.logradouro,
      bairro: result.bairro,
      existingNumberOrComplement: numberPart
    });

    setEditingUnit(prev => ({
      ...prev,
      cep: result.cep,
      endereco: formattedAddr || prev.endereco,
      cidade: result.localidade || prev.cidade || 'Salvador'
    }));
    setCepMessage(`Endereço localizado: ${result.logradouro}, ${result.bairro} (${result.localidade}/${result.uf})`);
  };

  const handleFindCepFromUnitAddress = async () => {
    const rawAddr = editingUnit.endereco || '';
    const { street } = extractStreetAndNumber(rawAddr);
    if (!street || street.trim().length < 3) {
      setCepMessage('Digite pelo menos o nome da rua/avenida no campo Endereço para descobrir o CEP.');
      return;
    }
    setCepLoading(true);
    setCepMessage(null);
    const cityToSearch = editingUnit.cidade?.trim() || 'Salvador';
    const results = await searchCepByAddress('BA', cityToSearch, street);
    setCepLoading(false);

    if (results.length === 0) {
      setCepMessage(`Nenhum CEP encontrado para "${street}" em ${cityToSearch}/BA.`);
      setAddressCandidates([]);
      return;
    }

    if (results.length === 1) {
      const r = results[0];
      const { numberPart } = extractStreetAndNumber(rawAddr);
      setEditingUnit(prev => ({
        ...prev,
        cep: r.cep,
        endereco: buildFormattedAddressFromCep({
          logradouro: r.logradouro,
          bairro: r.bairro,
          existingNumberOrComplement: numberPart
        }),
        cidade: r.localidade || prev.cidade || 'Salvador'
      }));
      setAddressCandidates([]);
      setCepMessage(`CEP ${r.cep} aplicado automaticamente!`);
    } else {
      setAddressCandidates(results);
      setCepMessage(`Encontrados ${results.length} CEPs para "${street}". Selecione o trecho correto:`);
    }
  };

  const handleSave = () => {
    if (!editingUnit.nome || !editingUnit.codigo) {
      alert('Informe o código e o nome da unidade.');
      return;
    }

    const fullUnit: StoreUnit = {
      id: editingUnit.id || `u-loja-${Date.now()}`,
      codigo: editingUnit.codigo,
      nome: editingUnit.nome,
      tipo: editingUnit.tipo || 'LOJA',
      cep: editingUnit.cep ? formatCep(editingUnit.cep) : undefined,
      endereco: editingUnit.endereco || '',
      cidade: editingUnit.cidade || 'Salvador',
      telefone: editingUnit.telefone || '',
      chavePix: editingUnit.chavePix || '',
      ativo: editingUnit.ativo !== undefined ? editingUnit.ativo : true
    };

    onSaveUnit(fullUnit);
    setIsModalOpen(false);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between md:bg-white md:border-b md:border-[#e2e8f0] md:px-6 md:py-4 md:gap-4 print:hidden">
        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2.5 md:p-0 md:bg-transparent md:border-b-0 min-w-0">
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex flex-wrap items-center gap-2 min-w-0">
            <span>Unidades</span>
            {(() => {
              const typeLabels: Record<string, string> = {
                TODAS: 'Todas',
                CENTRAL: 'Central',
                LOJA: 'Lojas / Filiais',
                ATIVAS: 'Ativas',
                INATIVAS: 'Inativas',
              };
              const parts = [typeLabels[typeFilter] || typeFilter];
              if (searchTerm.trim()) {
                parts.push(`Busca: "${searchTerm.trim()}"`);
              }
              const badgeText = `${filteredUnits.length} unidades • ${parts.join(' • ')}`;
              return (
                <span
                  className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 max-w-full truncate"
                  title={badgeText}
                >
                  {badgeText}
                </span>
              );
            })()}
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

          {canManage && (
            <button
              onClick={() => {
                setEditingUnit({
                  codigo: `LOJA-0${units.length}`,
                  nome: '',
                  tipo: 'LOJA',
                  cep: '',
                  endereco: '',
                  cidade: 'Salvador',
                  telefone: '',
                  chavePix: '',
                  ativo: true
                });
                setCepMessage(null);
                setAddressCandidates([]);
                setIsModalOpen(true);
              }}
              title="Nova Unidade"
              aria-label="Nova Unidade"
              className="flex items-center justify-center gap-1.5 h-8 w-8 md:w-auto px-0 md:px-3.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Unidade</span>
            </button>
          )}

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

      {/* Filter & Grouping Bar */}
      <div className="shrink-0 min-w-0 flex flex-col md:flex-row md:flex-wrap md:items-center justify-between md:bg-white/70 md:border-b md:border-[#e2e8f0] md:px-6 md:py-2.5 md:gap-3 print:hidden">
        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 flex items-center w-full md:w-auto min-w-0 overflow-hidden">
          <HybridFilterSort
            filterLabel="Filtrar:"
            filterValue={typeFilter}
            onFilterChange={(v) => setTypeFilter(v as 'TODAS' | 'CENTRAL' | 'LOJA' | 'ATIVAS' | 'INATIVAS')}
            filterActive={typeFilter !== 'TODAS'}
            filterOptions={[
              { value: 'TODAS', label: 'Todas' },
              { value: 'CENTRAL', label: 'Central' },
              { value: 'LOJA', label: 'Lojas / Filiais' },
              { value: 'ATIVAS', label: 'Ativas' },
              { value: 'INATIVAS', label: 'Inativas' }
            ]}
            sortValue={sortBy}
            onSortChange={(v) => setSortBy(v as 'NOME_ASC' | 'CODIGO_ASC' | 'TIPO_ASC')}
            sortOptions={[
              { value: 'NOME_ASC', label: 'Nome (A-Z)' },
              { value: 'CODIGO_ASC', label: 'Código' },
              { value: 'TIPO_ASC', label: 'Tipo (Central/Loja)' }
            ]}
            groupValue={groupBy}
            onGroupChange={(v) => setGroupBy(v as 'TIPO' | 'STATUS' | 'NENHUM')}
            groupOptions={[
              { value: 'TIPO', label: 'Tipo (Central / Loja)' },
              { value: 'STATUS', label: 'Status' },
              { value: 'NENHUM', label: 'Sem Agrupamento' }
            ]}
            hasActiveFilters={typeFilter !== 'TODAS' || searchTerm.trim() !== ''}
            onResetFilters={() => {
              setTypeFilter('TODAS');
              setSearchTerm('');
            }}
          />
        </div>

        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 w-full md:flex-1 md:min-w-[140px] md:max-w-xs">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, código ou cidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-3 py-0 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-brand-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Grid / Table of Stores + Print Report */}
      <div
        className={
          viewMode === 'TABLE' && !inventoryPrintUnit && !replenishmentPrintOrder
            ? 'flex-1 min-h-0 min-w-0 flex flex-col p-3 sm:p-6 overflow-hidden'
            : 'flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-6'
        }
      >
        {inventoryPrintUnit && (
          <div id="print-report-area" className="hidden print:block bg-white p-4">
            <PrintReportHeader
              title={`Inventário de Estoque — ${inventoryPrintUnit.nome}`}
              badge={inventoryPrintUnit.codigo}
              subtitle={`${inventoryPrintUnit.endereco}, ${inventoryPrintUnit.cidade}`}
            />
            {(() => {
              const prodMap = new Map(products.map(p => [p.id, p]));
              const unitItems = stock
                .filter(s => s.unidadeId === inventoryPrintUnit.id)
                .map(s => ({ stockItem: s, prod: prodMap.get(s.produtoId) }))
                .filter((x): x is { stockItem: StockItem; prod: Product } => Boolean(x.prod))
                .sort((a, b) => a.prod.descricao.localeCompare(b.prod.descricao, 'pt-BR'));

              if (unitItems.length === 0) {
                return (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    Nenhum produto associado a esta unidade para inventário.
                  </p>
                );
              }

              return (
                <table className="w-full text-left text-xs border-collapse mt-4">
                  <thead>
                    <tr className="border-b-2 border-slate-800 text-[11px] font-mono uppercase text-slate-700">
                      <th className="py-2 px-2">SKU</th>
                      <th className="py-2 px-2">Produto</th>
                      <th className="py-2 px-2 text-right">Disponível</th>
                      <th className="py-2 px-2 text-right">Qtd. Mínima</th>
                      <th className="py-2 px-2 text-center w-40">Contagem Física</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {unitItems.map(({ stockItem, prod }) => (
                      <tr key={stockItem.id}>
                        <td className="py-2.5 px-2 font-mono text-[11px] text-slate-600">{prod.sku}</td>
                        <td className="py-2.5 px-2 font-semibold text-slate-900">{prod.descricao}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold">
                          {stockItem.quantidadeAtual} {prod.unidade}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                          {stockItem.quantidadeMinima} {prod.unidade}
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="h-6 border-b border-slate-700" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        )}

        {replenishmentPrintOrder && (
          <div id="print-report-area" className="hidden print:block bg-white p-4">
            <PrintReportHeader
              title={`Pedido Especial de Reposição — ${replenishmentPrintOrder.numeroPedido}`}
              badge="Reposição"
              subtitle={`${replenishmentPrintOrder.clienteNome} • ${replenishmentPrintOrder.enderecoEntrega || ''}`}
            />
            <div className="mt-3 text-xs text-slate-700 space-y-1">
              <div>
                <strong>Data do Pedido:</strong>{' '}
                {new Date(replenishmentPrintOrder.dataPedido).toLocaleString('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short'
                })}
              </div>
              {replenishmentPrintOrder.observacoes && (
                <div>
                  <strong>Observações:</strong> {replenishmentPrintOrder.observacoes}
                </div>
              )}
            </div>
            <table className="w-full text-left text-xs border-collapse mt-4">
              <thead>
                <tr className="border-b-2 border-slate-800 text-[11px] font-mono uppercase text-slate-700">
                  <th className="py-2 px-2">SKU</th>
                  <th className="py-2 px-2">Produto</th>
                  <th className="py-2 px-2 text-right">Qtd. Solicitada</th>
                  <th className="py-2 px-2 text-center w-36">Conferência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {replenishmentPrintOrder.itens.map(item => {
                  const prod = products.find(p => p.id === item.produtoId);
                  return (
                    <tr key={item.id}>
                      <td className="py-2.5 px-2 font-mono text-[11px] text-slate-600">{prod?.sku || '—'}</td>
                      <td className="py-2.5 px-2 font-semibold text-slate-900">
                        {prod?.descricao || item.produtoId}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold">
                        {item.quantidade} {prod?.unidade || 'UN'}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="h-5 border-b border-slate-700" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-8 pt-4 border-t border-slate-300 grid grid-cols-2 gap-8 text-[11px] text-slate-600">
              <div>
                <div className="h-8 border-b border-slate-500" />
                <div className="mt-1 text-center">Responsável Ateliê (Envio)</div>
              </div>
              <div>
                <div className="h-8 border-b border-slate-500" />
                <div className="mt-1 text-center">Responsável Unidade (Recebimento)</div>
              </div>
            </div>
          </div>
        )}

        <div
          id={inventoryPrintUnit || replenishmentPrintOrder ? undefined : 'print-report-area'}
          className={`${viewMode === 'CARDS' || inventoryPrintUnit || replenishmentPrintOrder ? 'hidden' : ''} ${
            inventoryPrintUnit || replenishmentPrintOrder ? 'print:hidden' : 'print:block'
          } bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-auto max-w-full max-h-full min-h-0 print:overflow-visible print:max-h-none`}
        >
          <PrintReportHeader
            title="Unidades"
            badge={groupBy === 'TIPO' ? 'Por Tipo' : groupBy === 'STATUS' ? 'Por Status' : 'Geral'}
            subtitle={`${filteredUnits.length} unidade(s) cadastrada(s)`}
          />
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-[#f8f9ff] border-b border-slate-200 text-[11px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
              <tr>
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Nome</th>
                {!hideTipo && <th className="py-3 px-4">Tipo</th>}
                <th className="py-3 px-4">Endereço / Cidade</th>
                <th className="py-3 px-4">Telefone</th>
                {!hideStatus && <th className="py-3 px-4">Status</th>}
                <th className="py-3 px-4 text-right print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupedUnits.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="py-10 px-4 text-center text-slate-400 text-xs">
                    Nenhuma unidade encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                groupedUnits.map(group => {
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
                  {expanded && group.items.map(u => {
                    const isEditingRow = isModalOpen && editingUnit.id === u.id;
                    return (
                    <tr
                      key={u.id}
                      onClick={() => {
                        if (canManage) {
                          setEditingUnit(u);
                          setIsModalOpen(true);
                        }
                      }}
                      className={`transition-colors ${canManage ? 'cursor-pointer ' : ''}${
                        isEditingRow
                          ? 'bg-brand-50/70 ring-1 ring-inset ring-brand-400 border-l-4 border-l-brand-600'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{u.codigo}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{u.nome}</td>
                      {!hideTipo && <td className="py-3 px-4">{u.tipo}</td>}
                      <td className="py-3 px-4 text-slate-600">
                        <div>{u.endereco}, {u.cidade}</div>
                        {u.cep && (
                          <span className="text-[10px] font-mono text-slate-500">CEP: {u.cep}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">{u.telefone || '—'}</td>
                      {!hideStatus && (
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => canManage && onSaveUnit({ ...u, ativo: !u.ativo })}
                          title={
                            !canManage
                              ? 'Somente leitura'
                              : u.ativo
                              ? 'Clique para inativar unidade'
                              : 'Clique para ativar unidade'
                          }
                          className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors ${
                            canManage ? 'cursor-pointer' : 'cursor-default opacity-90'
                          } ${
                            u.ativo
                              ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200/80'
                              : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200/80'
                          }`}
                        >
                          {u.ativo ? 'Ativa' : 'Inativa'}
                        </button>
                      </td>
                      )}
                      <td className="py-3 px-4 text-right print:hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openProductsModal(u)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                            title="Gerenciar inventário, produtos oferecidos e estoque mínimo"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                            <span>Inventário</span>
                          </button>
                          <button
                            onClick={() => openReplenishmentModal(u)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors"
                            title="Criar pedido especial de reposição de estoque ao ateliê"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Reposição</span>
                          </button>
                        </div>
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

        {viewMode === 'CARDS' && (
          <div className="space-y-6 print:hidden">
            {groupedUnits.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-400">
                Nenhuma unidade encontrada com os filtros atuais.
              </div>
            ) : (
              groupedUnits.map(group => {
              const expanded = isGroupExpanded(group.label, groupBy !== 'NENHUM');
              return (
              <div key={group.label} className="space-y-3">
                {groupBy !== 'NENHUM' && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 rounded-lg cursor-pointer transition-colors"
                  >
                    <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>{group.label}</span>
                    </h2>
                    <span className="text-[11px] font-mono font-semibold text-slate-600">
                      {group.items.length} unidade(s)
                    </span>
                  </button>
                )}
                {expanded && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.items.map(unit => {
                    const isEditingCard = isModalOpen && editingUnit.id === unit.id;
                    return (
                    <div
                      key={unit.id}
                      onClick={() => {
                        if (canManage) {
                          setEditingUnit(unit);
                          setIsModalOpen(true);
                        }
                      }}
                      className={`border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-colors min-w-0 overflow-hidden ${
                        canManage ? 'cursor-pointer hover:border-brand-500 ' : ''
                      }${
                        isEditingCard
                          ? 'bg-brand-50/70 border-brand-400 ring-2 ring-brand-500 shadow-md'
                          : 'bg-white border-[#e2e8f0]'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-lg ${
                              unit.tipo === 'CENTRAL' ? 'bg-amber-100 text-amber-800' : 'bg-brand-100 text-brand-800'
                            }`}>
                              <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-900">{unit.nome}</h3>
                              <span className="text-[10px] font-mono text-slate-500 uppercase">{unit.codigo}</span>
                            </div>
                          </div>

                          {!hideStatus && (
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canManage) onSaveUnit({ ...unit, ativo: !unit.ativo });
                            }}
                            title={
                              !canManage
                                ? 'Somente leitura'
                                : unit.ativo
                                ? 'Clique para inativar unidade'
                                : 'Clique para ativar unidade'
                            }
                            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors ${
                              canManage ? 'cursor-pointer' : 'cursor-default opacity-90'
                            } ${
                              unit.ativo
                                ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200/80'
                                : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200/80'
                            }`}
                          >
                            {unit.ativo ? 'Ativa' : 'Inativa'}
                          </button>
                          )}
                        </div>

                        <div className="space-y-2 text-xs text-slate-600">
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                            <div>
                              <span>{unit.endereco}, {unit.cidade}</span>
                              {unit.cep && (
                                <span className="block text-[10px] font-mono text-slate-500 mt-0.5">
                                  CEP: {unit.cep}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="font-mono">{unit.telefone || 'Telefone não informado'}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                            <span className="font-mono text-[11px] truncate">PIX: {unit.chavePix || 'Não configurada'}</span>
                          </div>

                          {(() => {
                            const unitStock = stock.filter(s => s.unidadeId === unit.id);
                            const toRestockCount = unitStock.filter(
                              s => s.quantidadeAtual < s.quantidadeMinima
                            ).length;
                            return (
                              <div className="pt-1 flex items-center justify-between gap-2 text-[11px]">
                                <span className="text-slate-500 font-mono">
                                  {unitStock.length} produto(s)
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border ${
                                    toRestockCount > 0
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  {toRestockCount > 0 && <AlertTriangle className="w-3 h-3" />}
                                  <span>Produtos a repor: {toRestockCount}</span>
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => openProductsModal(unit)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            title="Gerenciar inventário, produtos oferecidos e estoque mínimo"
                          >
                            <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                            <span>Inventário</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openReplenishmentModal(unit)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            title="Criar pedido especial de reposição de estoque ao ateliê"
                          >
                            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                            <span>Reposição</span>
                          </button>
                        </div>
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
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[60] p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl w-full max-w-lg max-h-[94dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-bold text-slate-900 font-sans">
                {editingUnit.id ? 'Editar Unidade / Loja' : 'Cadastrar Nova Filial / Loja'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3.5 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Código da Unidade</label>
                  <input
                    type="text"
                    value={editingUnit.codigo || ''}
                    onChange={(e) => setEditingUnit({ ...editingUnit, codigo: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Tipo de Unidade</label>
                  <select
                    value={editingUnit.tipo}
                    onChange={(e) => setEditingUnit({ ...editingUnit, tipo: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                  >
                    <option value="LOJA">Loja Física / Filial</option>
                    <option value="CENTRAL">Ateliê de Produção</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Nome da Unidade *</label>
                <input
                  type="text"
                  placeholder="Ex: Loja 4 - Itaim Bibi"
                  value={editingUnit.nome || ''}
                  onChange={(e) => setEditingUnit({ ...editingUnit, nome: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">CEP da Unidade</label>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <input
                    type="text"
                    placeholder="00000-000"
                    maxLength={9}
                    value={editingUnit.cep || ''}
                    onChange={(e) => {
                      const formatted = formatCep(e.target.value);
                      setEditingUnit({ ...editingUnit, cep: formatted });
                      if (formatted.replace(/\D/g, '').length === 8) {
                        handleLookupUnitCep(formatted);
                      }
                    }}
                    className="w-28 sm:w-36 bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono"
                  />
                  <button
                    type="button"
                    disabled={cepLoading}
                    onClick={() => handleLookupUnitCep()}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer"
                  >
                    {cepLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>Buscar CEP</span>
                  </button>
                  <button
                    type="button"
                    disabled={cepLoading}
                    onClick={handleFindCepFromUnitAddress}
                    className="flex items-center gap-1 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
                    title="Descobrir o CEP e endereço correto a partir da rua digitada abaixo"
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
                          const { numberPart } = extractStreetAndNumber(editingUnit.endereco || '');
                          setEditingUnit(prev => ({
                            ...prev,
                            cep: cand.cep,
                            endereco: buildFormattedAddressFromCep({
                              logradouro: cand.logradouro,
                              bairro: cand.bairro,
                              existingNumberOrComplement: numberPart
                            }),
                            cidade: cand.localidade || prev.cidade || 'Salvador'
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

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="col-span-2">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Endereço Completo</label>
                  <input
                    type="text"
                    placeholder="Rua, Número, Bairro..."
                    value={editingUnit.endereco || ''}
                    onChange={(e) => setEditingUnit({ ...editingUnit, endereco: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Cidade</label>
                  <input
                    type="text"
                    placeholder="Ex: Salvador"
                    value={editingUnit.cidade || ''}
                    onChange={(e) => setEditingUnit({ ...editingUnit, cidade: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Telefone WhatsApp</label>
                  <input
                    type="text"
                    placeholder="+55 11 9XXXX-XXXX"
                    value={editingUnit.telefone || ''}
                    onChange={(e) => setEditingUnit({ ...editingUnit, telefone: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1">Chave PIX da Unidade</label>
                  <input
                    type="text"
                    placeholder="Chave PIX para pagamentos"
                    value={editingUnit.chavePix || ''}
                    onChange={(e) => setEditingUnit({ ...editingUnit, chavePix: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="px-3.5 py-2.5 sm:px-6 sm:py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 sm:px-5 py-1.5 sm:py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
              >
                Salvar Unidade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNIT PRODUCTS & MINIMUM STOCK MODAL */}
      {productsModalUnit && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 font-sans">
                  Produtos &amp; Estoque Mínimo — {productsModalUnit.nome}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Selecione quais produtos esta unidade oferece e defina a quantidade mínima de reposição.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProductsModalUnit(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={unitProductSearch}
                  onChange={(e) => setUnitProductSearch(e.target.value)}
                  placeholder="Buscar produto por nome ou SKU..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-brand-500"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = { ...draftUnitProducts };
                  products.forEach(p => {
                    next[p.id] = {
                      ...(next[p.id] || { currentQty: 0, minQty: 5 }),
                      enabled: true
                    };
                  });
                  setDraftUnitProducts(next);
                }}
                className="px-2.5 py-1.5 text-[11px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg border border-brand-200"
              >
                Marcar Todos
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-2">
              {(() => {
                const q = unitProductSearch.trim().toLowerCase();
                const filteredProds = products.filter(
                  p => !q || p.descricao.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
                );
                if (filteredProds.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Nenhum produto encontrado.
                    </div>
                  );
                }

                const catOrderMap = new Map(categories.map(c => [c.id, c]));
                const groupsMap = new Map<string, { label: string; ordem: number; items: Product[] }>();
                filteredProds.forEach(p => {
                  const cat = catOrderMap.get(p.categoriaId);
                  const key = cat ? cat.id : '__sem_categoria__';
                  if (!groupsMap.has(key)) {
                    groupsMap.set(key, {
                      label: cat ? cat.nome : 'Sem Categoria',
                      ordem: cat ? cat.ordem : 9999,
                      items: []
                    });
                  }
                  groupsMap.get(key)!.items.push(p);
                });

                const sortedGroups = Array.from(groupsMap.values()).sort(
                  (a, b) => a.ordem - b.ordem || a.label.localeCompare(b.label, 'pt-BR')
                );

                return sortedGroups.map(group => {
                  const isExpanded = Boolean(unitProductSearch.trim()) || Boolean(expandedProductCategories[group.label]);
                  return (
                  <div key={group.label} className="pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedProductCategories(prev => ({
                          ...prev,
                          [group.label]: !prev[group.label]
                        }))
                      }
                      className="w-full sticky top-0 z-10 bg-slate-100/95 hover:bg-slate-200/80 backdrop-blur-xs px-3 py-1.5 rounded-md border border-slate-200 flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        <span>{group.label}</span>
                      </span>
                      <span className="text-slate-500">{group.items.length}</span>
                    </button>
                    {isExpanded && (
                    <div className="divide-y divide-slate-100">
                      {group.items
                        .slice()
                        .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'))
                        .map(prod => {
                          const cfg = draftUnitProducts[prod.id] || { enabled: false, currentQty: 0, minQty: 5 };
                          return (
                            <div key={prod.id} className="py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs">
                              <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={cfg.enabled}
                                  onChange={(e) =>
                                    setDraftUnitProducts(prev => ({
                                      ...prev,
                                      [prod.id]: {
                                        enabled: e.target.checked,
                                        currentQty: prev[prod.id]?.currentQty ?? 0,
                                        minQty: prev[prod.id]?.minQty ?? 5
                                      }
                                    }))
                                  }
                                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 truncate">{prod.descricao}</div>
                                  <div className="text-[10px] font-mono text-slate-500">
                                    {prod.sku} • {prod.unidade}
                                  </div>
                                </div>
                              </label>

                              <div className="flex items-center gap-2.5 shrink-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] text-slate-500">Atual:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    disabled={!cfg.enabled}
                                    value={cfg.currentQty}
                                    onChange={(e) =>
                                      setDraftUnitProducts(prev => ({
                                        ...prev,
                                        [prod.id]: {
                                          enabled: prev[prod.id]?.enabled ?? true,
                                          currentQty: Math.max(0, Number(e.target.value) || 0),
                                          minQty: prev[prod.id]?.minQty ?? 5
                                        }
                                      }))
                                    }
                                    className="w-20 bg-white disabled:bg-slate-100 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono text-right font-bold"
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] text-slate-500">Mín:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    disabled={!cfg.enabled}
                                    value={cfg.minQty}
                                    onChange={(e) =>
                                      setDraftUnitProducts(prev => ({
                                        ...prev,
                                        [prod.id]: {
                                          enabled: prev[prod.id]?.enabled ?? true,
                                          currentQty: prev[prod.id]?.currentQty ?? 0,
                                          minQty: Math.max(0, Number(e.target.value) || 0)
                                        }
                                      }))
                                    }
                                    className="w-20 bg-white disabled:bg-slate-100 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono text-right font-bold"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    )}
                  </div>
                  );
                });
              })()}
            </div>

            <div className="px-6 py-3 bg-[#f8f9ff] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => productsModalUnit && handlePrintInventory(productsModalUnit)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                title="Imprimir folha de inventário desta unidade"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Inventário</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProductsModalUnit(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveUnitProducts}
                  className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
                >
                  Salvar Produtos da Unidade
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SPECIAL REPLENISHMENT ORDER MODAL */}
      {replenishmentModalUnit && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-sky-200 flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 bg-sky-50 border-b border-sky-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-sky-950 font-sans flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-sky-600" />
                  <span>Pedido Especial de Reposição — {replenishmentModalUnit.nome}</span>
                </h2>
                <p className="text-[11px] text-sky-800 mt-0.5">
                  Quantidades sugeridas pela diferença entre estoque mínimo e quantidade atual. Ajuste antes de confirmar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplenishmentModalUnit(null)}
                className="text-sky-700 hover:text-sky-950"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {confirmedReplenishmentOrder ? (
              <>
                <div className="p-6 space-y-4 text-xs">
                  <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold text-sky-950 text-sm">
                        Pedido {confirmedReplenishmentOrder.numeroPedido} confirmado!
                      </p>
                      <p className="text-sky-800">
                        {confirmedReplenishmentOrder.itens.length} produto(s) incluído(s) para{' '}
                        <strong>{replenishmentModalUnit.nome}</strong> ({confirmedReplenishmentOrder.enderecoEntrega}).
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-3 bg-[#f8f9ff] border-t border-slate-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrintReplenishmentOrder(confirmedReplenishmentOrder)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir Pedido</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmedReplenishmentOrder(null);
                      setReplenishmentModalUnit(null);
                    }}
                    className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </>
            ) : (
            <>
            <div className="px-6 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between gap-2 text-xs">
              <span className="text-[11px] font-semibold text-slate-600">Exibir:</span>
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setReplenishmentFilter('TODOS')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    replenishmentFilter === 'TODOS'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos os associados
                </button>
                <button
                  type="button"
                  onClick={() => setReplenishmentFilter('PRECISAM_REPOSICAO')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    replenishmentFilter === 'PRECISAM_REPOSICAO'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Apenas para repor
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 px-6">
              {(() => {
                const prodMap = new Map(products.map(p => [p.id, p]));
                const unitStock = stock
                  .filter(s => s.unidadeId === replenishmentModalUnit.id && prodMap.has(s.produtoId))
                  .map(s => ({ stockItem: s, prod: prodMap.get(s.produtoId)! }))
                  .filter(({ stockItem }) =>
                    replenishmentFilter === 'TODOS'
                      ? true
                      : stockItem.quantidadeAtual < stockItem.quantidadeMinima
                  )
                  .sort((a, b) => a.prod.descricao.localeCompare(b.prod.descricao, 'pt-BR'));

                if (unitStock.length === 0) {
                  return (
                    <div className="py-10 text-center text-xs text-slate-500">
                      {replenishmentFilter === 'PRECISAM_REPOSICAO'
                        ? 'Todos os produtos desta unidade estão com estoque igual ou acima do mínimo.'
                        : 'Nenhum produto associado a esta unidade.'}
                    </div>
                  );
                }

                return unitStock.map(({ stockItem, prod }) => {
                  const qty = replenishmentDraftQtys[prod.id] ?? 0;
                  const needsRestock = stockItem.quantidadeAtual < stockItem.quantidadeMinima;
                  return (
                    <div key={prod.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 truncate">{prod.descricao}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {prod.sku} • Atual:{' '}
                          <strong className={needsRestock ? 'text-rose-700' : 'text-emerald-700'}>
                            {stockItem.quantidadeAtual}
                          </strong>{' '}
                          • Mínimo: <strong>{stockItem.quantidadeMinima}</strong> {prod.unidade}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-semibold text-sky-800">Repor:</span>
                        <input
                          type="number"
                          min="0"
                          value={qty}
                          onChange={(e) =>
                            setReplenishmentDraftQtys(prev => ({
                              ...prev,
                              [prod.id]: Math.max(0, Number(e.target.value) || 0)
                            }))
                          }
                          className="w-20 bg-sky-50/60 border border-sky-300 rounded-lg px-2 py-1 text-xs font-mono text-right font-bold text-sky-950 focus:outline-none focus:border-sky-500"
                        />
                        <span className="text-[11px] font-mono text-slate-500">{prod.unidade}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="px-6 py-3 bg-[#f8f9ff] border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReplenishmentModalUnit(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReplenishment}
                className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm cursor-pointer"
              >
                Confirmar Pedido de Reposição
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {replenishmentSuccessMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-sky-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 print:hidden">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{replenishmentSuccessMsg}</span>
        </div>
      )}
    </div>
  );
};
