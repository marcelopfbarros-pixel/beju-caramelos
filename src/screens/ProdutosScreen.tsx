import React, { useState, useRef, useMemo } from 'react';
import { Product, Category, ProductUnit } from '../types';
import { 
  Plus, 
  Download, 
  Upload, 
  Search, 
  Tag, 
  Trash2, 
  Check, 
  X, 
  Image as ImageIcon,
  FolderPlus,
  LayoutGrid,
  Table as TableIcon,
  Printer,
  Layers,
  Power,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { ExcelService } from '../services/excelService';
import { PrintReportHeader } from '../components/PrintReportHeader';
import { HybridFilterSort } from '../components/HybridFilterSort';
import { ProdutosReportModal } from '../components/ProdutosReportModal';
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import { CurrencyInput, formatCurrencyBR } from '../components/CurrencyInput';
import { canEditProducts, UserRole } from '../utils/permissions';

interface ProdutosScreenProps {
  products: Product[];
  categories: Category[];
  userRole?: UserRole;
  onSaveProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onSaveCategory: (category: Category) => void;
  onDeleteCategory: (categoryId: string) => void;
  onBatchImportProducts: (products: Product[]) => void;
}

export const ProdutosScreen: React.FC<ProdutosScreenProps> = ({
  products,
  categories,
  userRole = 'ADMIN',
  onSaveProduct,
  onDeleteProduct,
  onSaveCategory,
  onDeleteCategory,
  onBatchImportProducts
}) => {
  const canEdit = canEditProducts(userRole);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');
  const [sortBy, setSortBy] = useState<'NOME_ASC' | 'SKU_ASC' | 'PRECO_ASC' | 'PRECO_DESC' | 'TEMPO_ASC'>('NOME_ASC');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');
  const [groupBy, setGroupBy] = useState<'CATEGORIA' | 'STATUS' | 'UNIDADE' | 'NENHUM'>('CATEGORIA');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productImageFileRef = useRef<HTMLInputElement>(null);

  const handleProductImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const maxSide = 512;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setEditingProduct(prev => ({ ...prev, fotoUrl: canvas.toDataURL('image/jpeg', 0.85) }));
        } else {
          setEditingProduct(prev => ({ ...prev, fotoUrl: dataUrl }));
        }
      };
      img.onerror = () => {
        setEditingProduct(prev => ({ ...prev, fotoUrl: dataUrl }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const activeCategories = useMemo(
    () => categories.filter(c => c.ativo),
    [categories]
  );

  const defaultCategoryId = activeCategories[0]?.id || categories[0]?.id || '';

  const [editingProduct, setEditingProduct] = useState<Partial<Product>>({
    sku: `SKU-${Math.floor(100 + Math.random() * 900)}`,
    descricao: '',
    fotoUrl: '/logo.jpg',
    precoUnitario: 0,
    unidade: 'UN',
    categoriaId: defaultCategoryId,
    tempoProducaoMinutos: 30,
    ativo: true
  });

  const filteredProducts = products
    .filter(p => {
      const matchesCategory = selectedCategory === 'TODAS' || p.categoriaId === selectedCategory;
      const matchesStatus =
        statusFilter === 'TODOS'
          ? true
          : statusFilter === 'ATIVOS'
          ? p.ativo
          : !p.ativo;
      const matchesSearch = 
        p.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'SKU_ASC') return a.sku.localeCompare(b.sku, 'pt-BR');
      if (sortBy === 'PRECO_ASC') return a.precoUnitario - b.precoUnitario;
      if (sortBy === 'PRECO_DESC') return b.precoUnitario - a.precoUnitario;
      if (sortBy === 'TEMPO_ASC') return a.tempoProducaoMinutos - b.tempoProducaoMinutos;
      return a.descricao.localeCompare(b.descricao, 'pt-BR');
    });

  const groupedProducts = useMemo(() => {
    if (groupBy === 'NENHUM') {
      return [{ label: 'Todos os Produtos', items: filteredProducts }];
    }
    const map = new Map<string, Product[]>();
    for (const p of filteredProducts) {
      let key = '';
      if (groupBy === 'CATEGORIA') {
        const cat = categories.find(c => c.id === p.categoriaId);
        key = cat?.nome || 'Sem Categoria';
      } else if (groupBy === 'STATUS') {
        key = p.ativo ? 'Ativos' : 'Inativos';
      } else {
        key = `Unidade: ${p.unidade}`;
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries())
      .map(([label, items]) => ({ label, items }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [filteredProducts, groupBy, categories]);

  const hideCategoria = groupBy === 'CATEGORIA';
  const hideStatus = groupBy === 'STATUS';
  const hideUnidade = groupBy === 'UNIDADE';
  const visibleColumnCount = 7 - (hideCategoria ? 1 : 0) - (hideStatus ? 1 : 0);

  const hasActiveFilters =
    selectedCategory !== 'TODAS' ||
    statusFilter !== 'TODOS' ||
    searchTerm.trim() !== '';

  const handleResetFilters = () => {
    setSelectedCategory('TODAS');
    setStatusFilter('TODOS');
    setSearchTerm('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await ExcelService.importProducts(file, categories);
      if (imported.length > 0) {
        onBatchImportProducts(imported);
        alert(`${imported.length} produtos importados com sucesso a partir da planilha Excel!`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao processar arquivo .xlsx. Verifique a estrutura da planilha.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveProduct = () => {
    if (!editingProduct.descricao || !editingProduct.precoUnitario) {
      alert('Informe a descrição e o preço unitário do produto.');
      return;
    }

    const validSelectedCategory = editingProduct.categoriaId &&
      categories.some(c => c.id === editingProduct.categoriaId)
      ? editingProduct.categoriaId
      : defaultCategoryId;

    if (!validSelectedCategory) {
      alert('Cadastre ou ative ao menos uma categoria antes de salvar o produto.');
      return;
    }

    const fullProduct: Product = {
      id: editingProduct.id || `p-${Date.now()}`,
      sku: editingProduct.sku || `SKU-${Date.now()}`,
      descricao: editingProduct.descricao,
      fotoUrl: editingProduct.fotoUrl || '/logo.jpg',
      precoUnitario: Number(editingProduct.precoUnitario),
      unidade: (editingProduct.unidade as ProductUnit) || 'UN',
      categoriaId: validSelectedCategory,
      tempoProducaoMinutos: Number(editingProduct.tempoProducaoMinutos || 30),
      ativo: editingProduct.ativo !== undefined ? editingProduct.ativo : true
    };

    onSaveProduct(fullProduct);
    setIsProductModalOpen(false);
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    const cat: Category = {
      id: `cat-${Date.now()}`,
      nome: newCategoryName.trim(),
      ordem: categories.length + 1,
      ativo: true
    };
    onSaveCategory(cat);
    setNewCategoryName('');
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Top Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between md:bg-white md:border-b md:border-[#e2e8f0] md:px-6 md:py-4 md:gap-4 print:hidden">
        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2.5 md:p-0 md:bg-transparent md:border-b-0 min-w-0">
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex flex-wrap items-center gap-2 min-w-0">
            <span>Produtos</span>
            {(() => {
              const catLabel =
                selectedCategory === 'TODAS'
                  ? 'Todas as Categorias'
                  : categories.find(c => c.id === selectedCategory)?.nome || 'Categoria';
              const parts = [catLabel];
              if (statusFilter !== 'TODOS') {
                parts.push(statusFilter === 'ATIVOS' ? 'Ativos' : 'Inativos');
              }
              if (searchTerm.trim()) {
                parts.push(`Busca: "${searchTerm.trim()}"`);
              }
              const badgeText = `${filteredProducts.length} itens • ${parts.join(' • ')}`;
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
              onClick={() => setViewMode('GRID')}
              title="Visualização em Cards"
              aria-label="Visualização em Cards"
              className={`h-full flex items-center justify-center px-2 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'GRID' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              title="Visualização em Tabela"
              aria-label="Visualização em Tabela"
              className={`h-full flex items-center justify-center px-2 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'TABLE' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx"
            className="hidden"
          />

          {canEdit && (
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Importar"
              aria-label="Importar"
              className="flex items-center justify-center h-8 w-8 p-0 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
            >
              <Upload className="w-4 h-4 text-slate-500" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            title="Exportar Relatório de Produtos (PDF / XLSX)"
            aria-label="Exportar Relatório de Produtos (PDF / XLSX)"
            className="flex items-center justify-center h-8 w-8 p-0 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
          </button>

          {canEdit && (
            <>
              <button
                onClick={() => setIsCategoryModalOpen(true)}
                title="Categorias"
                aria-label="Categorias"
                className="flex items-center justify-center gap-1.5 h-8 w-8 md:w-auto px-0 md:px-3 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Categorias</span>
              </button>

              <button
                onClick={() => {
                  setEditingProduct({
                    sku: `SKU-${Math.floor(100 + Math.random() * 900)}`,
                    descricao: '',
                    fotoUrl: '/logo.jpg',
                    precoUnitario: 0,
                    unidade: 'UN',
                    categoriaId: defaultCategoryId,
                    tempoProducaoMinutos: 30,
                    ativo: true
                  });
                  setIsProductModalOpen(true);
                }}
                title="Novo Produto"
                aria-label="Novo Produto"
                className="flex items-center justify-center gap-1.5 h-8 w-8 md:w-auto px-0 md:px-3.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden md:inline">Produto</span>
              </button>
            </>
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

      {/* Filter & Sort + Search */}
      <div className="shrink-0 min-w-0 flex flex-col md:flex-row md:flex-wrap md:items-center justify-between md:bg-white/70 md:border-b md:border-[#e2e8f0] md:px-6 md:py-2.5 md:gap-3 print:hidden">
        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 flex items-center w-full md:w-auto min-w-0 overflow-hidden">
          <HybridFilterSort
            filterLabel="Categoria:"
            filterValue={selectedCategory}
            onFilterChange={setSelectedCategory}
            filterActive={selectedCategory !== 'TODAS'}
            filterOptions={[
              { value: 'TODAS', label: 'Todas as Categorias' },
              ...categories.filter(c => c.ativo).map(cat => ({ value: cat.id, label: cat.nome }))
            ]}
            secondFilterLabel="Status:"
            secondFilterValue={statusFilter}
            onSecondFilterChange={(v) => setStatusFilter(v as 'TODOS' | 'ATIVOS' | 'INATIVOS')}
            secondFilterActive={statusFilter !== 'TODOS'}
            secondFilterOptions={[
              { value: 'TODOS', label: 'Todos Status' },
              { value: 'ATIVOS', label: 'Ativos' },
              { value: 'INATIVOS', label: 'Inativos' }
            ]}
            sortValue={sortBy}
            onSortChange={(v) => setSortBy(v as 'NOME_ASC' | 'SKU_ASC' | 'PRECO_ASC' | 'PRECO_DESC' | 'TEMPO_ASC')}
            sortOptions={[
              { value: 'NOME_ASC', label: 'Nome (A-Z)' },
              { value: 'SKU_ASC', label: 'SKU (A-Z)' },
              { value: 'PRECO_ASC', label: 'Menor Preço' },
              { value: 'PRECO_DESC', label: 'Maior Preço' },
              { value: 'TEMPO_ASC', label: 'Menor Tempo Prep.' }
            ]}
            groupValue={groupBy}
            onGroupChange={(v) => setGroupBy(v as 'CATEGORIA' | 'STATUS' | 'UNIDADE' | 'NENHUM')}
            groupOptions={[
              { value: 'CATEGORIA', label: 'Categoria' },
              { value: 'STATUS', label: 'Status' },
              { value: 'UNIDADE', label: 'Unidade' },
              { value: 'NENHUM', label: 'Sem Agrupamento' }
            ]}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={handleResetFilters}
          />
        </div>

        <div className="bg-white/70 border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 w-full md:flex-1 md:min-w-[140px] md:max-w-xs">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar produto por nome ou SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-3 py-0 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Products Grid or Table */}
      <div
        className={
          viewMode === 'TABLE'
            ? 'flex-1 min-h-0 min-w-0 flex flex-col p-3 sm:p-6 overflow-hidden'
            : 'flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-6'
        }
      >
        <div
          id="print-report-area"
          className={
            viewMode === 'TABLE'
              ? 'bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-auto max-w-full max-h-full min-h-0 print:overflow-visible print:max-h-none'
              : 'hidden print:block bg-white'
          }
        >
          <PrintReportHeader
            title="Produtos"
            badge={
              groupBy === 'CATEGORIA'
                ? 'Por Categoria'
                : groupBy === 'STATUS'
                ? 'Por Status'
                : groupBy === 'UNIDADE'
                ? 'Por Unidade'
                : 'Geral'
            }
            subtitle={`${filteredProducts.length} produto(s)`}
          />
          <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50/95 border-b border-slate-200 text-[11px] font-mono uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-semibold">SKU</th>
                  <th className="py-3 px-4 font-semibold">Produto</th>
                  {!hideCategoria && <th className="py-3 px-4 font-semibold">Categoria</th>}
                  <th className="py-3 px-4 font-semibold text-right">Preço Unitário</th>
                  <th className="py-3 px-4 font-semibold text-center">Tempo Prep.</th>
                  {!hideStatus && <th className="py-3 px-4 font-semibold text-center">Status</th>}
                  <th className="py-3 px-4 font-semibold text-right print:hidden">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnCount} className="py-10 text-center text-slate-400">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  groupedProducts.map(group => {
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
                      {expanded && group.items.map(prod => {
                        const cat = categories.find(c => c.id === prod.categoriaId);
                        const isEditingRow = isProductModalOpen && editingProduct.id === prod.id;
                        return (
                          <tr
                            key={prod.id}
                            onClick={() => {
                              if (canEdit) {
                                setEditingProduct(prod);
                                setIsProductModalOpen(true);
                              }
                            }}
                            className={`transition-colors ${canEdit ? 'cursor-pointer ' : ''}${
                              isEditingRow
                                ? 'bg-brand-50/70 ring-1 ring-inset ring-brand-400 border-l-4 border-l-brand-600'
                                : 'hover:bg-slate-50/70'
                            }`}
                          >
                            <td className="py-3 px-4 font-mono text-slate-600 font-semibold">{prod.sku}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={prod.fotoUrl}
                                  alt={prod.descricao}
                                  className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                                />
                                <span className="font-bold text-slate-900">{prod.descricao}</span>
                              </div>
                            </td>
                            {!hideCategoria && (
                            <td className="py-3 px-4">
                              <span className="text-[11px] font-medium text-brand-700 bg-brand-50 border border-brand-200/60 px-2 py-0.5 rounded-full">
                                {cat?.nome || 'Sobremesas'}
                              </span>
                            </td>
                            )}
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                              R$ {formatCurrencyBR(prod.precoUnitario)}
                              {!hideUnidade && <span className="text-[10px] font-normal text-slate-500 ml-1">/{prod.unidade}</span>}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-slate-600">
                              {prod.tempoProducaoMinutos} min
                            </td>
                            {!hideStatus && (
                            <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() => canEdit && onSaveProduct({ ...prod, ativo: !prod.ativo })}
                                title={
                                  !canEdit
                                    ? 'Somente leitura'
                                    : prod.ativo
                                    ? 'Clique para inativar produto'
                                    : 'Clique para ativar produto'
                                }
                                className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors ${
                                  canEdit ? 'cursor-pointer' : 'cursor-default opacity-90'
                                } ${
                                  prod.ativo
                                    ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200/80'
                                    : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200/80'
                                }`}
                              >
                                {prod.ativo ? 'Ativo' : 'Inativo'}
                              </button>
                            </td>
                            )}
                            <td className="py-3 px-4 text-right print:hidden" onClick={(e) => e.stopPropagation()}>
                              {canEdit && (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    if (confirm(`Deseja excluir o produto "${prod.descricao}"?`)) {
                                      onDeleteProduct(prod.id);
                                    }
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Excluir Produto"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              )}
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
        {viewMode === 'GRID' && (
        <div className="space-y-6 print:hidden">
          {groupedProducts.map(group => {
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
                    {group.items.length} item(ns)
                  </span>
                </button>
              )}
              {expanded && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {group.items.map(prod => {
                  const cat = categories.find(c => c.id === prod.categoriaId);
                  const isEditingCard = isProductModalOpen && editingProduct.id === prod.id;
                  return (
                    <div
                      key={prod.id}
                      onClick={() => {
                        if (canEdit) {
                          setEditingProduct(prod);
                          setIsProductModalOpen(true);
                        }
                      }}
                      className={`border rounded-xl min-w-0 overflow-hidden shadow-xs hover:shadow-sm transition-all flex flex-col justify-between ${
                        canEdit ? 'cursor-pointer hover:border-brand-400 ' : ''
                      }${
                        isEditingCard
                          ? 'bg-brand-50/70 border-brand-400 ring-2 ring-brand-500 shadow-md'
                          : 'bg-white border-[#e2e8f0]'
                      }`}
                    >
                      <div>
                        {/* Image container */}
                        <div className="h-28 w-full overflow-hidden bg-slate-100 relative group">
                          <img
                            src={prod.fotoUrl}
                            alt={prod.descricao}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-1.5 left-1.5 flex gap-1">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-slate-900/80 text-white backdrop-blur-xs font-semibold">
                              {prod.sku}
                            </span>
                          </div>
                        </div>

                        {/* Body Content */}
                        <div className="p-2.5">
                          {(!hideCategoria || !hideStatus) && (
                          <div className="flex items-center flex-wrap gap-1 mb-1">
                            {!hideCategoria && (
                            <span className="text-[9px] font-medium text-brand-700 bg-brand-50 border border-brand-200/60 px-1.5 py-0.5 rounded-full inline-block">
                              {cat?.nome || 'Sobremesas'}
                            </span>
                            )}
                            {!hideStatus && (
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canEdit) onSaveProduct({ ...prod, ativo: !prod.ativo });
                              }}
                              title={
                                !canEdit
                                  ? 'Somente leitura'
                                  : prod.ativo
                                  ? 'Clique para inativar produto'
                                  : 'Clique para ativar produto'
                              }
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border transition-colors ${
                                canEdit ? 'cursor-pointer' : 'cursor-default opacity-90'
                              } ${
                                prod.ativo
                                  ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200/90'
                                  : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200/90'
                              }`}
                            >
                              {prod.ativo ? 'Ativo' : 'Inativo'}
                            </button>
                            )}
                          </div>
                          )}
                          <h3 className="text-[11px] font-bold text-slate-900 line-clamp-2 leading-tight">
                            {prod.descricao}
                          </h3>
                        </div>
                      </div>

                      {/* Footer with Price and Actions */}
                      <div className="p-2.5 pt-1.5 border-t border-slate-100 flex items-center justify-between mt-1">
                        <div>
                          <span className="text-[9px] text-slate-400 block">Preço</span>
                          <span className="text-xs font-mono font-bold text-slate-900">
                            R$ {formatCurrencyBR(prod.precoUnitario)}
                            {!hideUnidade && <span className="text-[9px] font-normal text-slate-500 ml-0.5">/{prod.unidade}</span>}
                          </span>
                        </div>

                        {canEdit && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              if (confirm(`Deseja excluir o produto "${prod.descricao}"?`)) {
                                onDeleteProduct(prod.id);
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Excluir Produto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        )}
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
      </div>

      {/* CREATE / EDIT PRODUCT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[60] p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl w-full max-w-lg max-h-[94dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-bold text-slate-900 font-sans">
                {editingProduct.id ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h2>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3.5 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Código SKU</label>
                  <input
                    type="text"
                    value={editingProduct.sku || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono"
                  />
                </div>
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Categoria</label>
                  <select
                    value={
                      editingProduct.categoriaId &&
                      (activeCategories.some(c => c.id === editingProduct.categoriaId) ||
                        (editingProduct.id && categories.some(c => c.id === editingProduct.categoriaId)))
                        ? editingProduct.categoriaId
                        : defaultCategoryId
                    }
                    onChange={(e) => setEditingProduct({ ...editingProduct, categoriaId: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                  >
                    {editingProduct.id &&
                      editingProduct.categoriaId &&
                      !activeCategories.some(c => c.id === editingProduct.categoriaId) &&
                      categories
                        .filter(c => c.id === editingProduct.categoriaId)
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.nome} (Inativa)</option>
                        ))}
                    {activeCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Descrição do Produto *</label>
                <input
                  type="text"
                  placeholder="Ex: Torta Holandesa com Chocolate Meio Amargo"
                  value={editingProduct.descricao || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, descricao: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Preço Unit. (R$) *</label>
                  <CurrencyInput
                    value={editingProduct.precoUnitario || 0}
                    onChangeValue={(val) => setEditingProduct({ ...editingProduct, precoUnitario: val })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono font-bold"
                  />
                </div>
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Unidade</label>
                  <select
                    value={editingProduct.unidade}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unidade: e.target.value as ProductUnit })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                  >
                    <option value="UN">UN (Unidade)</option>
                    <option value="KG">KG (Quilo)</option>
                    <option value="G">G (Gramas)</option>
                    <option value="CENTO">CENTO (100 un)</option>
                    <option value="CX">CX (Caixa)</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Tempo (min)</label>
                  <input
                    type="number"
                    value={editingProduct.tempoProducaoMinutos || 30}
                    onChange={(e) => setEditingProduct({ ...editingProduct, tempoProducaoMinutos: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5 sm:mb-1 truncate">Imagem / Foto do Produto</label>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2">
                  <input
                    type="text"
                    placeholder="https://... ou selecione um arquivo local"
                    value={editingProduct.fotoUrl || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, fotoUrl: e.target.value })}
                    className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 font-mono text-[11px]"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    ref={productImageFileRef}
                    onChange={handleProductImageFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => productImageFileRef.current?.click()}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shrink-0 transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-brand-600" />
                    <span>Arquivo Local</span>
                  </button>
                </div>
                {editingProduct.fotoUrl && (
                  <div className="mt-2 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border border-slate-200">
                    <img src={editingProduct.fotoUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1 sm:pt-2">
                <input
                  type="checkbox"
                  id="prod-ativo"
                  checked={editingProduct.ativo}
                  onChange={(e) => setEditingProduct({ ...editingProduct, ativo: e.target.checked })}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="prod-ativo" className="font-medium text-slate-800">
                  Produto Ativo no Cardápio para Venda
                </label>
              </div>
            </div>

            <div className="px-3.5 py-2.5 sm:px-6 sm:py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveProduct}
                className="px-4 sm:px-5 py-1.5 sm:py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
              >
                Salvar Produto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORIES MANAGEMENT MODAL */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[60] p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[94dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-bold text-slate-900 font-sans">
                Gerenciar Categorias de Produtos
              </h2>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-4 text-xs overflow-y-auto">
              <div className="flex gap-1.5 sm:gap-2">
                <input
                  type="text"
                  placeholder="Nova Categoria (ex: Diet / Zero Açúcar)"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-1.5 sm:py-2 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 shrink-0"
                >
                  Adicionar
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {categories.map(cat => (
                  <div
                    key={cat.id}
                    className={`p-2 sm:p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 ${
                      !cat.ativo ? 'bg-slate-50/70 opacity-75' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`font-semibold truncate ${
                          cat.ativo ? 'text-slate-800' : 'text-slate-400 line-through'
                        }`}
                      >
                        {cat.nome}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          cat.ativo
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {cat.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSaveCategory({ ...cat, ativo: !cat.ativo })}
                        title={cat.ativo ? 'Inativar categoria' : 'Ativar categoria'}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          cat.ativo
                            ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                            : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        <Power className="w-3 h-3" />
                        <span>{cat.ativo ? 'Inativar' : 'Ativar'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Excluir a categoria "${cat.nome}"?`)) {
                            onDeleteCategory(cat.id);
                          }
                        }}
                        title="Excluir categoria"
                        className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-3.5 py-2.5 sm:px-6 sm:py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <ProdutosReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        allProducts={products}
        filteredProducts={filteredProducts}
        categories={categories}
        initialCategoryFilter={selectedCategory}
        initialStatusFilter={statusFilter}
        initialGroupBy={groupBy}
        searchTerm={searchTerm}
      />
    </div>
  );
};
