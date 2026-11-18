import React, { useState, useMemo } from 'react';
import { StockItem, Product, StoreUnit } from '../types';
import { 
  ArrowLeftRight, 
  AlertTriangle, 
  Download, 
  Plus, 
  Check, 
  X, 
  Edit2,
  Trash2,
  Save,
  Printer,
  LayoutGrid,
  List,
  Search,
  Layers,
  Filter
} from 'lucide-react';
import { ExcelService } from '../services/excelService';
import { PrintReportHeader } from '../components/PrintReportHeader';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface EstoqueScreenProps {
  stock: StockItem[];
  products: Product[];
  units: StoreUnit[];
  activeUnitId: string;
  onUpdateStock: (updatedStock: StockItem[]) => void;
  onDeleteStockItem?: (stockId: string) => void;
}

export const EstoqueScreen: React.FC<EstoqueScreenProps> = ({
  stock,
  products,
  units,
  activeUnitId,
  onUpdateStock,
  onDeleteStockItem
}) => {
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferOrigin, setTransferOrigin] = useState<string>(units[0]?.id || 'u-central');
  const [transferDestination, setTransferDestination] = useState<string>(units[1]?.id || 'u-loja1');
  const [transferProduct, setTransferProduct] = useState<string>(products[0]?.id || '');
  const [transferQty, setTransferQty] = useState<number>(5);

  // Add / Edit Stock Modal State
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockFormUnitId, setStockFormUnitId] = useState<string>(activeUnitId !== 'all' ? activeUnitId : units[0]?.id || '');
  const [stockFormProdId, setStockFormProdId] = useState<string>(products[0]?.id || '');
  const [stockFormQty, setStockFormQty] = useState<number>(10);
  const [stockFormMin, setStockFormMin] = useState<number>(5);

  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'CARDS' : 'TABLE'
  );
  const [groupBy, setGroupBy] = useState<'LOJA' | 'SITUACAO' | 'NENHUM'>('LOJA');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'CRITICO' | 'OK'>('TODOS');
  const [sortBy, setSortBy] = useState<'PRODUTO_ASC' | 'SALDO_ASC' | 'SALDO_DESC' | 'ATUALIZACAO_DESC'>('PRODUTO_ASC');
  const [searchTerm, setSearchTerm] = useState('');

  const prodMap = new Map(products.map(p => [p.id, p]));
  const unitMap = new Map(units.map(u => [u.id, u]));

  // Filter & sort stock for the active store, status and search
  const filteredStock = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return stock
      .filter(s => {
        if (activeUnitId !== 'all' && s.unidadeId !== activeUnitId) return false;
        const isLow = s.quantidadeAtual <= s.quantidadeMinima;
        if (statusFilter === 'CRITICO' && !isLow) return false;
        if (statusFilter === 'OK' && isLow) return false;
        if (q) {
          const prod = prodMap.get(s.produtoId);
          const unit = unitMap.get(s.unidadeId);
          const match =
            (prod?.descricao || '').toLowerCase().includes(q) ||
            (prod?.sku || '').toLowerCase().includes(q) ||
            (unit?.nome || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'SALDO_ASC') return a.quantidadeAtual - b.quantidadeAtual;
        if (sortBy === 'SALDO_DESC') return b.quantidadeAtual - a.quantidadeAtual;
        if (sortBy === 'ATUALIZACAO_DESC') {
          return new Date(b.dataAtualizacao).getTime() - new Date(a.dataAtualizacao).getTime();
        }
        const pa = prodMap.get(a.produtoId)?.descricao || '';
        const pb = prodMap.get(b.produtoId)?.descricao || '';
        return pa.localeCompare(pb, 'pt-BR');
      });
  }, [stock, activeUnitId, statusFilter, sortBy, searchTerm, prodMap, unitMap]);

  const groupedStock = useMemo(() => {
    if (groupBy === 'NENHUM') {
      return [{ label: 'Todos os Registros', items: filteredStock }];
    }
    const map = new Map<string, StockItem[]>();
    for (const item of filteredStock) {
      let key = '';
      if (groupBy === 'LOJA') {
        const unit = unitMap.get(item.unidadeId);
        key = unit ? `${unit.tipo === 'CENTRAL' ? '🏭 ' : '🏪 '}${unit.nome}` : item.unidadeId;
      } else {
        key = item.quantidadeAtual <= item.quantidadeMinima ? 'Reposição Necessária' : 'Abastecido';
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries())
      .map(([label, items]) => ({ label, items }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [filteredStock, groupBy, unitMap]);

  const handleExecuteTransfer = () => {
    if (transferOrigin === transferDestination) {
      alert('Selecione lojas de origem e destino diferentes.');
      return;
    }
    if (transferQty <= 0) {
      alert('Informe uma quantidade válida para transferência.');
      return;
    }

    const originStock = stock.find(s => s.unidadeId === transferOrigin && s.produtoId === transferProduct);
    if (!originStock || originStock.quantidadeAtual < transferQty) {
      alert('A loja de origem não possui saldo suficiente para esta transferência.');
      return;
    }

    const newStock = stock.map(s => {
      if (s.unidadeId === transferOrigin && s.produtoId === transferProduct) {
        return { ...s, quantidadeAtual: s.quantidadeAtual - transferQty, dataAtualizacao: new Date().toISOString() };
      }
      if (s.unidadeId === transferDestination && s.produtoId === transferProduct) {
        return { ...s, quantidadeAtual: s.quantidadeAtual + transferQty, dataAtualizacao: new Date().toISOString() };
      }
      return s;
    });

    // If destination didn't have an entry yet, add it
    const hasDest = stock.some(s => s.unidadeId === transferDestination && s.produtoId === transferProduct);
    if (!hasDest) {
      newStock.push({
        id: `st-${Date.now()}`,
        unidadeId: transferDestination,
        produtoId: transferProduct,
        quantidadeAtual: transferQty,
        quantidadeMinima: 5,
        dataAtualizacao: new Date().toISOString()
      });
    }

    onUpdateStock(newStock);
    setIsTransferModalOpen(false);
    alert(`Transferência de ${transferQty} itens realizada com sucesso!`);
  };

  const handleAdjustQuantity = (stockId: string, delta: number) => {
    const updated = stock.map(s => {
      if (s.id === stockId) {
        const novaQtd = Math.max(0, s.quantidadeAtual + delta);
        return { ...s, quantidadeAtual: novaQtd, dataAtualizacao: new Date().toISOString() };
      }
      return s;
    });
    onUpdateStock(updated);
  };

  const handleOpenAddStock = () => {
    setEditingStockId(null);
    setStockFormUnitId(activeUnitId !== 'all' ? activeUnitId : units[0]?.id || '');
    setStockFormProdId(products[0]?.id || '');
    setStockFormQty(10);
    setStockFormMin(5);
    setIsStockModalOpen(true);
  };

  const handleOpenEditStock = (item: StockItem) => {
    setEditingStockId(item.id);
    setStockFormUnitId(item.unidadeId);
    setStockFormProdId(item.produtoId);
    setStockFormQty(item.quantidadeAtual);
    setStockFormMin(item.quantidadeMinima);
    setIsStockModalOpen(true);
  };

  const handleSaveStockEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockFormUnitId || !stockFormProdId) {
      alert('Selecione a unidade e o produto.');
      return;
    }

    const now = new Date().toISOString();
    if (editingStockId) {
      const updated = stock.map(s =>
        s.id === editingStockId
          ? {
              ...s,
              quantidadeAtual: Math.max(0, stockFormQty),
              quantidadeMinima: Math.max(0, stockFormMin),
              dataAtualizacao: now
            }
          : s
      );
      onUpdateStock(updated);
    } else {
      const existing = stock.find(s => s.unidadeId === stockFormUnitId && s.produtoId === stockFormProdId);
      if (existing) {
        const updated = stock.map(s =>
          s.id === existing.id
            ? {
                ...s,
                quantidadeAtual: Math.max(0, stockFormQty),
                quantidadeMinima: Math.max(0, stockFormMin),
                dataAtualizacao: now
              }
            : s
        );
        onUpdateStock(updated);
      } else {
        onUpdateStock([
          ...stock,
          {
            id: `st-${Date.now()}`,
            unidadeId: stockFormUnitId,
            produtoId: stockFormProdId,
            quantidadeAtual: Math.max(0, stockFormQty),
            quantidadeMinima: Math.max(0, stockFormMin),
            dataAtualizacao: now
          }
        ]);
      }
    }
    setIsStockModalOpen(false);
  };

  const handleDeleteStock = (item: StockItem) => {
    const prodName = prodMap.get(item.produtoId)?.descricao || 'este item';
    if (!confirm(`Remover "${prodName}" do estoque desta unidade?`)) return;
    onUpdateStock(stock.filter(s => s.id !== item.id));
    if (onDeleteStockItem) onDeleteStockItem(item.id);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex items-center gap-2">
            <span>Estoque</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {filteredStock.length} registros
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => ExcelService.exportStock(stock, products, units)}
            className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Exportar Estoque (.xlsx)</span>
          </button>

          <button
            onClick={handleOpenAddStock}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>Estoque</span>
          </button>

          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm active:scale-95"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Transferir entre Lojas</span>
          </button>

          <button
            onClick={() => window.print()}
            title="Imprimir"
            aria-label="Imprimir"
            className="hidden md:flex items-center justify-center p-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter & Grouping Bar */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
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

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar produto, SKU ou unidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
            />
          </div>

          <HybridFilterSort
            filterLabel="Situação:"
            filterValue={statusFilter}
            onFilterChange={(v) => setStatusFilter(v as 'TODOS' | 'CRITICO' | 'OK')}
            filterOptions={[
              { value: 'TODOS', label: 'Todas' },
              { value: 'CRITICO', label: 'Reposição Necessária' },
              { value: 'OK', label: 'Abastecido' }
            ]}
            sortValue={sortBy}
            onSortChange={(v) => setSortBy(v as 'PRODUTO_ASC' | 'SALDO_ASC' | 'SALDO_DESC' | 'ATUALIZACAO_DESC')}
            sortOptions={[
              { value: 'PRODUTO_ASC', label: 'Produto (A-Z)' },
              { value: 'SALDO_ASC', label: 'Menor Saldo' },
              { value: 'SALDO_DESC', label: 'Maior Saldo' },
              { value: 'ATUALIZACAO_DESC', label: 'Atualização Recente' }
            ]}
            groupValue={groupBy}
            onGroupChange={(v) => setGroupBy(v as 'LOJA' | 'SITUACAO' | 'NENHUM')}
            groupOptions={[
              { value: 'LOJA', label: 'Loja / Unidade' },
              { value: 'SITUACAO', label: 'Situação' },
              { value: 'NENHUM', label: 'Sem Agrupamento' }
            ]}
          />
        </div>
      </div>

      {/* Stock Content */}
      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'CARDS' && (
          <div className="space-y-6 print:hidden">
            {groupedStock.map(group => {
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
                      {group.items.length} item(ns)
                    </span>
                  </button>
                )}
                {expanded && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.items.map(item => {
                    const prod = prodMap.get(item.produtoId);
                    const unit = unitMap.get(item.unidadeId);
                    const isLow = item.quantidadeAtual <= item.quantidadeMinima;

                    return (
                      <div
                        key={item.id}
                        className={`bg-white border rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3 ${
                          isLow ? 'border-rose-200 bg-rose-50/20' : 'border-[#e2e8f0]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {unit?.tipo === 'CENTRAL' ? '🏭 ' : '🏪 '}{unit?.nome || item.unidadeId} • {prod?.sku || '-'}
                            </div>
                            <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                              {prod?.descricao || 'Produto não encontrado'}
                            </h3>
                          </div>
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 shrink-0">
                              <AlertTriangle className="w-3 h-3" />
                              Reposição
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                              <Check className="w-3 h-3" />
                              OK
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-3">
                            <div>
                              <span className="text-[10px] uppercase font-mono text-slate-400 block">Atual</span>
                              <span className={`font-mono font-bold text-sm ${isLow ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {item.quantidadeAtual} {prod?.unidade || 'UN'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-mono text-slate-400 block">Mínimo</span>
                              <span className="font-mono font-semibold text-xs text-slate-600">
                                {item.quantidadeMinima} {prod?.unidade || 'UN'}
                              </span>
                            </div>
                          </div>

                          <div className="inline-flex items-center gap-1.5">
                            <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                              <button
                                onClick={() => handleAdjustQuantity(item.id, -1)}
                                className="px-2 py-0.5 text-slate-600 hover:text-black font-bold text-xs"
                                title="Subtrair 1"
                              >-</button>
                              <button
                                onClick={() => handleAdjustQuantity(item.id, 1)}
                                className="px-2 py-0.5 text-slate-600 hover:text-black font-bold text-xs"
                                title="Adicionar 1"
                              >+</button>
                            </div>
                            <button
                              onClick={() => handleOpenEditStock(item)}
                              className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                              title="Editar Saldo e Mínimo"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteStock(item)}
                              className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Remover do Estoque"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
            })}
          </div>
        )}

        <div id="print-report-area" className={`${viewMode === 'CARDS' ? 'hidden print:block' : ''} bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-hidden`}>
          <PrintReportHeader
            title="Estoque"
            badge={groupBy === 'NENHUM' ? 'Geral' : groupBy === 'LOJA' ? 'Por Loja / Unidade' : 'Por Situação'}
            subtitle={`${filteredStock.length} registro(s)`}
          />
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#f8f9ff] border-b border-[#e2e8f0] text-[11px] font-mono font-semibold uppercase text-slate-500 tracking-wider">
              <tr>
                <th className="py-3 px-4">Loja / Unidade</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Produto</th>
                <th className="py-3 px-4 text-center">Saldo Atual</th>
                <th className="py-3 px-4 text-center">Estoque Mínimo</th>
                <th className="py-3 px-4 text-center">Situação</th>
                <th className="py-3 px-4 text-right print:hidden">Ajuste Rápido (+/-)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {groupedStock.map(group => {
                const expanded = isGroupExpanded(group.label, groupBy !== 'NENHUM');
                return (
                <React.Fragment key={group.label}>
                  {groupBy !== 'NENHUM' && (
                    <tr
                      onClick={() => toggleGroup(group.label)}
                      className="bg-emerald-50 hover:bg-emerald-100/80 cursor-pointer transition-colors"
                    >
                      <td colSpan={7} className="py-2 px-4 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                        <span className="inline-flex items-center gap-1.5">
                          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <span>{group.label} ({group.items.length})</span>
                        </span>
                      </td>
                    </tr>
                  )}
                  {expanded && group.items.map(item => {
                    const prod = prodMap.get(item.produtoId);
                    const unit = unitMap.get(item.unidadeId);
                    const isLow = item.quantidadeAtual <= item.quantidadeMinima;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {unit?.tipo === 'CENTRAL' ? '🏭 ' : '🏪 '}
                          {unit?.nome || item.unidadeId}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-700">
                          {prod?.sku || '-'}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          {prod?.descricao || 'Produto não encontrado'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block font-mono font-bold px-3 py-1 rounded-lg text-sm ${
                            isLow 
                              ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}>
                            {item.quantidadeAtual} {prod?.unidade || 'UN'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-500">
                          {item.quantidadeMinima} {prod?.unidade || 'UN'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Reposição Necessária</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <Check className="w-3 h-3" />
                              <span>Abastecido</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right print:hidden">
                          <div className="inline-flex items-center gap-2">
                            <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                              <button
                                onClick={() => handleAdjustQuantity(item.id, -1)}
                                className="px-2 py-0.5 text-slate-600 hover:text-black font-bold text-xs"
                                title="Subtrair 1"
                              >-</button>
                              <button
                                onClick={() => handleAdjustQuantity(item.id, 1)}
                                className="px-2 py-0.5 text-slate-600 hover:text-black font-bold text-xs"
                                title="Adicionar 1"
                              >+</button>
                            </div>
                            <button
                              onClick={() => handleOpenEditStock(item)}
                              className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                              title="Editar Saldo e Mínimo"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteStock(item)}
                              className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Remover do Estoque"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TRANSFER MODAL */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 font-sans flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-brand-600" />
                <span>Transferência de Estoque entre Unidades</span>
              </h2>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Loja de Origem</label>
                  <select
                    value={transferOrigin}
                    onChange={(e) => setTransferOrigin(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2"
                  >
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Loja de Destino</label>
                  <select
                    value={transferDestination}
                    onChange={(e) => setTransferDestination(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2"
                  >
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Produto a Transferir</label>
                <select
                  value={transferProduct}
                  onChange={(e) => setTransferProduct(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.sku} - {p.descricao}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Quantidade a Transferir</label>
                <input
                  type="number"
                  min="1"
                  value={transferQty}
                  onChange={(e) => setTransferQty(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold"
                />
              </div>
            </div>

            <div className="px-6 py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteTransfer}
                className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
              >
                Confirmar Transferência
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT STOCK MODAL */}
      {isStockModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveStockEntry} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 font-sans">
                {editingStockId ? 'Alterar Saldo de Estoque' : 'Adicionar Produto ao Estoque'}
              </h2>
              <button type="button" onClick={() => setIsStockModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Loja / Unidade</label>
                <select
                  value={stockFormUnitId}
                  disabled={!!editingStockId}
                  onChange={(e) => setStockFormUnitId(e.target.value)}
                  className="w-full bg-white disabled:bg-slate-100 border border-slate-300 rounded-lg p-2.5 font-medium"
                >
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Produto</label>
                <select
                  value={stockFormProdId}
                  disabled={!!editingStockId}
                  onChange={(e) => setStockFormProdId(e.target.value)}
                  className="w-full bg-white disabled:bg-slate-100 border border-slate-300 rounded-lg p-2.5 font-medium"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.descricao}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Saldo Atual</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    required
                    value={stockFormQty}
                    onChange={(e) => setStockFormQty(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Estoque Mínimo</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    required
                    value={stockFormMin}
                    onChange={(e) => setStockFormMin(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsStockModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Estoque</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
