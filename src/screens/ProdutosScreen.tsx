import React, { useState, useRef, useMemo } from 'react';
import { Product, Category, ProductUnit } from '../types';
import { 
  Plus, 
  Download, 
  Upload, 
  Search, 
  Tag, 
  Edit2, 
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
import { useExpandedGroups } from '../hooks/useExpandedGroups';
import { CurrencyInput } from '../components/CurrencyInput';

interface ProdutosScreenProps {
  products: Product[];
  categories: Category[];
  onSaveProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onSaveCategory: (category: Category) => void;
  onDeleteCategory: (categoryId: string) => void;
  onBatchImportProducts: (products: Product[]) => void;
}

export const ProdutosScreen: React.FC<ProdutosScreenProps> = ({
  products,
  categories,
  onSaveProduct,
  onDeleteProduct,
  onSaveCategory,
  onDeleteCategory,
  onBatchImportProducts
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  const [sortBy, setSortBy] = useState<'NOME_ASC' | 'PRECO_ASC' | 'PRECO_DESC' | 'TEMPO_ASC'>('NOME_ASC');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');
  const [groupBy, setGroupBy] = useState<'CATEGORIA' | 'STATUS' | 'UNIDADE' | 'NENHUM'>('CATEGORIA');
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(groupBy);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
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

  const [editingProduct, setEditingProduct] = useState<Partial<Product>>({
    sku: `SKU-${Math.floor(100 + Math.random() * 900)}`,
    descricao: '',
    fotoUrl: '/logo.jpg',
    precoUnitario: 0,
    unidade: 'UN',
    categoriaId: categories[0]?.id || 'cat-1',
    tempoProducaoMinutos: 30,
    ativo: true
  });

  const filteredProducts = products
    .filter(p => {
      const matchesCategory = selectedCategory === 'TODAS' || p.categoriaId === selectedCategory;
      const matchesSearch = 
        p.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
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

    const fullProduct: Product = {
      id: editingProduct.id || `p-${Date.now()}`,
      sku: editingProduct.sku || `SKU-${Date.now()}`,
      descricao: editingProduct.descricao,
      fotoUrl: editingProduct.fotoUrl || '/logo.jpg',
      precoUnitario: Number(editingProduct.precoUnitario),
      unidade: (editingProduct.unidade as ProductUnit) || 'UN',
      categoriaId: editingProduct.categoriaId || categories[0].id,
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
    <div className="flex-1 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Top Action Bar */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex items-center gap-2">
            <span>Produtos</span>
            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {filteredProducts.length} itens
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Importar .xlsx</span>
          </button>

          <button
            onClick={() => ExcelService.exportProducts(products, categories)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Exportar .xlsx</span>
          </button>

          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Categorias</span>
          </button>

          <button
            onClick={() => {
              setEditingProduct({
                sku: `SKU-${Math.floor(100 + Math.random() * 900)}`,
                descricao: '',
                fotoUrl: '/logo.jpg',
                precoUnitario: 0,
                unidade: 'UN',
                categoriaId: categories[0]?.id || 'cat-1',
                tempoProducaoMinutos: 30,
                ativo: true
              });
              setIsProductModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Produto</span>
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

      {/* Filter & Sort + Search */}
      <div className="px-6 py-3 bg-white/70 border-b border-[#e2e8f0] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              onClick={() => setViewMode('GRID')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'GRID' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Visualização em Cards"
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
              title="Visualização em Tabela"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabela</span>
            </button>
          </div>

          <HybridFilterSort
            filterLabel="Categoria:"
            filterValue={selectedCategory}
            onFilterChange={setSelectedCategory}
            filterOptions={[
              { value: 'TODAS', label: 'Todas as Categorias' },
              ...categories.filter(c => c.ativo).map(cat => ({ value: cat.id, label: cat.nome }))
            ]}
            sortValue={sortBy}
            onSortChange={(v) => setSortBy(v as 'NOME_ASC' | 'PRECO_ASC' | 'PRECO_DESC' | 'TEMPO_ASC')}
            sortOptions={[
              { value: 'NOME_ASC', label: 'Nome (A-Z)' },
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
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar produto por nome ou SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-500 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* Products Grid or Table */}
      <div className="flex-1 overflow-auto p-6">
        <div
          id="print-report-area"
          className={
            viewMode === 'TABLE'
              ? 'bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-hidden'
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
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 font-semibold">SKU</th>
                  <th className="py-3 px-4 font-semibold">Produto</th>
                  <th className="py-3 px-4 font-semibold">Categoria</th>
                  <th className="py-3 px-4 font-semibold text-right">Preço Unitário</th>
                  <th className="py-3 px-4 font-semibold text-center">Tempo Prep.</th>
                  <th className="py-3 px-4 font-semibold text-center">Status</th>
                  <th className="py-3 px-4 font-semibold text-right print:hidden">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
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
                          <td colSpan={7} className="py-2 px-4 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                            <span className="inline-flex items-center gap-1.5">
                              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              <span>{group.label} ({group.items.length})</span>
                            </span>
                          </td>
                        </tr>
                      )}
                      {expanded && group.items.map(prod => {
                        const cat = categories.find(c => c.id === prod.categoriaId);
                        return (
                          <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
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
                            <td className="py-3 px-4">
                              <span className="text-[11px] font-medium text-brand-700 bg-brand-50 border border-brand-200/60 px-2 py-0.5 rounded-full">
                                {cat?.nome || 'Sobremesas'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                              R$ {prod.precoUnitario.toFixed(2)}
                              <span className="text-[10px] font-normal text-slate-500 ml-1">/{prod.unidade}</span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-slate-600">
                              {prod.tempoProducaoMinutos} min
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                prod.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {prod.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right print:hidden">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingProduct(prod);
                                    setIsProductModalOpen(true);
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                                  title="Editar Produto"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {group.items.map(prod => {
                  const cat = categories.find(c => c.id === prod.categoriaId);
                  return (
                    <div
                      key={prod.id}
                      className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden shadow-xs hover:shadow-sm transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Image container */}
                        <div className="h-40 w-full overflow-hidden bg-slate-100 relative group">
                          <img
                            src={prod.fotoUrl}
                            alt={prod.descricao}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-2 left-2 flex gap-1">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-900/80 text-white backdrop-blur-xs font-semibold">
                              {prod.sku}
                            </span>
                          </div>
                          <div className="absolute top-2 right-2">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                              prod.ativo ? 'bg-emerald-500 text-white' : 'bg-slate-500 text-white'
                            }`}>
                              {prod.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                        </div>

                        {/* Body Content */}
                        <div className="p-3.5">
                          <span className="text-[10px] font-medium text-brand-700 bg-brand-50 border border-brand-200/60 px-2 py-0.5 rounded-full inline-block mb-1.5">
                            {cat?.nome || 'Sobremesas'}
                          </span>
                          <h3 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
                            {prod.descricao}
                          </h3>
                        </div>
                      </div>

                      {/* Footer with Price and Actions */}
                      <div className="p-3.5 pt-0 border-t border-slate-100 flex items-center justify-between mt-2">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Preço Unitário</span>
                          <span className="text-sm font-mono font-bold text-slate-900">
                            R$ {prod.precoUnitario.toFixed(2)}
                            <span className="text-[10px] font-normal text-slate-500 ml-1">/{prod.unidade}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingProduct(prod);
                              setIsProductModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors"
                            title="Editar Produto"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between">
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

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Código SKU</label>
                  <input
                    type="text"
                    value={editingProduct.sku || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Categoria</label>
                  <select
                    value={editingProduct.categoriaId}
                    onChange={(e) => setEditingProduct({ ...editingProduct, categoriaId: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2"
                  >
                    {categories.filter(c => c.ativo).map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Descrição do Produto *</label>
                <input
                  type="text"
                  placeholder="Ex: Torta Holandesa com Chocolate Meio Amargo"
                  value={editingProduct.descricao || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, descricao: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Preço Unitário (R$) *</label>
                  <CurrencyInput
                    value={editingProduct.precoUnitario || 0}
                    onChangeValue={(val) => setEditingProduct({ ...editingProduct, precoUnitario: val })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Unidade</label>
                  <select
                    value={editingProduct.unidade}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unidade: e.target.value as ProductUnit })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2"
                  >
                    <option value="UN">UN (Unidade)</option>
                    <option value="KG">KG (Quilo)</option>
                    <option value="G">G (Gramas)</option>
                    <option value="CENTO">CENTO (100 un)</option>
                    <option value="CX">CX (Caixa)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tempo Prep. (min)</label>
                  <input
                    type="number"
                    value={editingProduct.tempoProducaoMinutos || 30}
                    onChange={(e) => setEditingProduct({ ...editingProduct, tempoProducaoMinutos: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Imagem / Foto do Produto</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="https://... ou selecione um arquivo local"
                    value={editingProduct.fotoUrl || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, fotoUrl: e.target.value })}
                    className="flex-1 bg-white border border-slate-300 rounded-lg p-2 font-mono text-[11px]"
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
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg shrink-0 transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-brand-600" />
                    <span>Arquivo Local</span>
                  </button>
                </div>
                {editingProduct.fotoUrl && (
                  <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                    <img src={editingProduct.fotoUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
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

            <div className="px-6 py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveProduct}
                className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm"
              >
                Salvar Produto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORIES MANAGEMENT MODAL */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#f8f9ff] border-b border-slate-200 flex items-center justify-between">
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

            <div className="p-6 space-y-4 text-xs">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nova Categoria (ex: Diet / Zero Açúcar)"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-lg p-2"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-2 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700"
                >
                  Adicionar
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {categories.map(cat => (
                  <div
                    key={cat.id}
                    className={`p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 ${
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

            <div className="px-6 py-3 bg-[#f8f9ff] border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
