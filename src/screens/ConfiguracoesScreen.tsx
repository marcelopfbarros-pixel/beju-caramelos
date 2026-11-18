import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, StoreUnit, Category, Product, Order, StockItem, Customer, ProductionOrder, MonthlyRevenueGoals } from '../types';
import { getMonthGoalForUnit, getMonthYearKey, getUnitMonthGoalKey, getYearGoalForUnit } from '../utils/revenueGoals';
import { 
  User, 
  Building2, 
  Database, 
  ShieldCheck, 
  Download, 
  Upload, 
  Save, 
  CheckCircle, 
  Sparkles,
  RefreshCw,
  ExternalLink,
  Plus,
  Edit3,
  Power,
  X,
  Users,
  Target,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Copy,
  Check,
  Truck,
  Trash2
} from 'lucide-react';
import { ExcelService } from '../services/excelService';
import { CurrencyInput } from '../components/CurrencyInput';
import { SupabaseService } from '../services/supabaseService';
import {
  WhatsAppAutomationSettings,
  getWhatsAppAutomationSettings,
  saveWhatsAppAutomationSettings,
  DEFAULT_WHATSAPP_TEMPLATES
} from '../services/whatsappAutomationService';

interface ConfiguracoesScreenProps {
  userProfile: UserProfile;
  units: StoreUnit[];
  categories: Category[];
  products: Product[];
  orders: Order[];
  stock: StockItem[];
  customers: Customer[];
  productionOrders: ProductionOrder[];
  users: UserProfile[];
  onSaveUserProfile: (profile: UserProfile) => void;
  onSaveUser: (user: UserProfile) => void;
  onToggleUserActive: (userId: string, ativo: boolean) => void;
  onRestoreFullBackup: (data: {
    units?: StoreUnit[];
    categories?: Category[];
    products?: Product[];
    orders?: Order[];
    stock?: StockItem[];
    customers?: Customer[];
    productionOrders?: ProductionOrder[];
    users?: UserProfile[];
  }) => void;
  isSupabaseOnline: boolean;
  onSyncSupabase?: () => Promise<void> | void;
  revenueGoals?: MonthlyRevenueGoals;
  onSaveRevenueGoals?: (goals: MonthlyRevenueGoals) => void;
  onOpenCardapioDigital?: () => void;
  activeUnitId?: string;
}

export const ConfiguracoesScreen: React.FC<ConfiguracoesScreenProps> = ({
  userProfile,
  units,
  categories,
  products,
  orders,
  stock,
  customers,
  productionOrders,
  users,
  onSaveUserProfile,
  onSaveUser,
  onToggleUserActive,
  onRestoreFullBackup,
  isSupabaseOnline,
  onSyncSupabase,
  revenueGoals = {},
  onSaveRevenueGoals,
  onOpenCardapioDigital,
  activeUnitId
}) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'empresas' | 'metas' | 'whatsapp' | 'banco'>('perfil');
  const [waSettings, setWaSettings] = useState<WhatsAppAutomationSettings>(() =>
    getWhatsAppAutomationSettings()
  );
  const [waSavedSuccess, setWaSavedSuccess] = useState(false);
  const [catalogLinkCopied, setCatalogLinkCopied] = useState(false);
  const [selectedGoalYear, setSelectedGoalYear] = useState<number>(new Date().getFullYear());
  const [selectedGoalUnitId, setSelectedGoalUnitId] = useState<string>(
    () => activeUnitId || units.find(u => u.ativo)?.id || 'all'
  );
  const [draftGoals, setDraftGoals] = useState<MonthlyRevenueGoals>(revenueGoals);

  useEffect(() => {
    if (activeUnitId) {
      setSelectedGoalUnitId(activeUnitId);
      setFocusedGoalKey(null);
    }
  }, [activeUnitId]);
  const [goalsSavedSuccess, setGoalsSavedSuccess] = useState(false);
  const [bulkGoalValue, setBulkGoalValue] = useState<string>('');
  const [focusedGoalKey, setFocusedGoalKey] = useState<string | null>(null);
  const [focusedGoalText, setFocusedGoalText] = useState<string>('');
  const [formData, setFormData] = useState<UserProfile>(userProfile);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Gestão de usuários
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userForm, setUserForm] = useState<UserProfile>({
    nome: '',
    email: '',
    avatarUrl: '',
    role: 'ATENDIMENTO',
    unidadePadraoId: units[0]?.id || '',
    autenticadoGoogle: false,
    ativo: true,
    unidadesPermitidas: units.map(u => u.id)
  });

  // Associação de lojas por usuário
  const [selectedAssocUserId, setSelectedAssocUserId] = useState<string>('');
  const [exportingBackup, setExportingBackup] = useState(false);
  const [myNewPassword, setMyNewPassword] = useState('');
  const [myConfirmPassword, setMyConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    setFormData(userProfile);
  }, [userProfile]);

  useEffect(() => {
    setDraftGoals(revenueGoals);
  }, [revenueGoals]);

  useEffect(() => {
    if (!selectedAssocUserId && users.length > 0) {
      setSelectedAssocUserId(users[0].id || users[0].email);
    }
  }, [users, selectedAssocUserId]);
  const [mockLoading, setMockLoading] = useState<'populate' | 'clean' | null>(null);
  const [mockMessage, setMockMessage] = useState<string | null>(null);
  const [confirmCleanMock, setConfirmCleanMock] = useState(false);
  const backupFileRef = useRef<HTMLInputElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const maxSide = 256;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setFormData(prev => ({ ...prev, avatarUrl: canvas.toDataURL('image/jpeg', 0.85) }));
        } else {
          setFormData(prev => ({ ...prev, avatarUrl: dataUrl }));
        }
      };
      img.onerror = () => {
        setFormData(prev => ({ ...prev, avatarUrl: dataUrl }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

  const handleSaveProfile = async () => {
    setPasswordError(null);
    let updatedProfile = { ...formData };
    if (myNewPassword || myConfirmPassword) {
      if (!/^\d{8}$/.test(myNewPassword)) {
        setPasswordError('A nova senha deve conter exatamente 8 números.');
        return;
      }
      if (myNewPassword !== myConfirmPassword) {
        setPasswordError('A confirmação da senha não confere.');
        return;
      }
      updatedProfile = { ...updatedProfile, senha: myNewPassword };
      setMyNewPassword('');
      setMyConfirmPassword('');
    }
    await onSaveUserProfile(updatedProfile);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const openNewUserModal = () => {
    setEditingUser(null);
    setUserForm({
      id: `usr-${Date.now()}`,
      nome: '',
      email: '',
      avatarUrl: '',
      role: 'ATENDIMENTO',
      unidadePadraoId: units[0]?.id || '',
      autenticadoGoogle: false,
      ativo: true,
      unidadesPermitidas: units.map(u => u.id)
    });
    setShowUserModal(true);
  };

  const openEditUserModal = (u: UserProfile) => {
    setEditingUser(u);
    setUserForm({
      ...u,
      ativo: u.ativo !== false,
      unidadesPermitidas: u.unidadesPermitidas || []
    });
    setShowUserModal(true);
  };

  const handleSaveUserModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.nome.trim() || !userForm.email.trim()) {
      alert('Informe o nome e o e-mail do usuário.');
      return;
    }
    const pwd = (userForm.senha || '').trim();
    if ((!editingUser || pwd.length > 0) && !/^\d{8}$/.test(pwd)) {
      alert('A senha deve conter exatamente 8 números (ex: 12345678).');
      return;
    }
    onSaveUser({
      ...userForm,
      senha: pwd.length === 8 ? pwd : editingUser?.senha
    });
    setShowUserModal(false);
  };

  const selectedAssocUser = users.find(u => (u.id || u.email) === selectedAssocUserId) || users[0];

  const handleToggleUnitAssociation = (unitId: string) => {
    if (!selectedAssocUser) return;
    const current = selectedAssocUser.unidadesPermitidas || [];
    const exists = current.includes(unitId);
    const updated = exists ? current.filter(id => id !== unitId) : [...current, unitId];
    onSaveUser({
      ...selectedAssocUser,
      unidadesPermitidas: updated
    });
  };

  const handleExportFullBackup = async () => {
    setExportingBackup(true);
    try {
      if (isSupabaseOnline) {
        const [dbUnits, dbCats, dbProds, dbOrders, dbStock, dbCustomers, dbProdOrders, dbUsers] = await Promise.all([
          SupabaseService.getUnits().catch(() => units),
          SupabaseService.getCategories().catch(() => categories),
          SupabaseService.getProducts().catch(() => products),
          SupabaseService.getOrders().catch(() => orders),
          SupabaseService.getStock().catch(() => stock),
          SupabaseService.getCustomers().catch(() => customers),
          SupabaseService.getProductionOrders().catch(() => productionOrders),
          SupabaseService.getUsers().catch(() => users)
        ]);
        ExcelService.exportFullBackup(
          dbUnits.length ? dbUnits : units,
          dbCats.length ? dbCats : categories,
          dbProds.length ? dbProds : products,
          dbOrders.length ? dbOrders : orders,
          dbStock.length ? dbStock : stock,
          dbCustomers.length ? dbCustomers : customers,
          dbProdOrders.length ? dbProdOrders : productionOrders,
          dbUsers.length ? dbUsers : users
        );
      } else {
        ExcelService.exportFullBackup(units, categories, products, orders, stock, customers, productionOrders, users);
      }
    } finally {
      setExportingBackup(false);
    }
  };

  const handleBackupUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await ExcelService.importFullBackup(file);
      onRestoreFullBackup(data);
      alert('Backup completo em Excel (.xlsx) restaurado com sucesso no sistema!');
    } catch (err) {
      console.error(err);
      alert('Erro ao restaurar arquivo de backup. Verifique se o arquivo possui as abas corretas.');
    } finally {
      if (backupFileRef.current) backupFileRef.current.value = '';
    }
  };

  const handlePopulateMockData = async () => {
    setConfirmCleanMock(false);
    setMockLoading('populate');
    setMockMessage(null);
    try {
      const counts = await SupabaseService.populateMockData();
      if (onSyncSupabase) await onSyncSupabase();
      setMockMessage(
        `Mock data populado! Categorias: ${counts.categorias}, Produtos: ${counts.produtos}, Clientes: ${counts.clientes}, Pedidos: ${counts.pedidos} (${counts.itensPedido} itens), Estoque: ${counts.estoque}, Movimentações: ${counts.movimentacoes}, Produção: ${counts.ordensProducao} (${counts.itensProducao} itens). Usuários e Unidades preservados.`
      );
    } catch (err: any) {
      console.error('Erro ao popular mock data:', err);
      setMockMessage(`Erro ao popular mock data: ${err.message || 'Verifique as permissões do banco'}`);
    } finally {
      setMockLoading(null);
    }
  };

  const handleCleanMockData = async () => {
    if (!confirmCleanMock) {
      setConfirmCleanMock(true);
      return;
    }
    setConfirmCleanMock(false);
    setMockLoading('clean');
    setMockMessage(null);
    try {
      await SupabaseService.cleanMockData();
      if (onSyncSupabase) await onSyncSupabase();
      setMockMessage('Dados mock limpos com sucesso! As tabelas de Usuários e Unidades foram preservadas.');
    } catch (err: any) {
      console.error('Erro ao limpar mock data:', err);
      setMockMessage(`Erro ao limpar mock data: ${err.message || 'Verifique as permissões do banco'}`);
    } finally {
      setMockLoading(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Top Header */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#0f172a] font-sans">Configurações</h1>
          </div>

          {/* Segmented Navigation Tabs */}
          <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
            <button
              onClick={() => setActiveTab('perfil')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'perfil'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Usuários</span>
            </button>

            <button
              onClick={() => setActiveTab('empresas')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'empresas'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Unidades</span>
            </button>

            <button
              onClick={() => setActiveTab('metas')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'metas'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>Metas</span>
            </button>

            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'whatsapp'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>Whatsapp</span>
            </button>

            <button
              onClick={() => setActiveTab('banco')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'banco'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Dados</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
        {/* SEÇÃO 1: PERFIL DO USUÁRIO */}
        {activeTab === 'perfil' && (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Meu Perfil</h2>
                <p className="text-xs text-slate-500">Dados do operador conectado e senha de acesso</p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-mono font-semibold">
                {formData.role}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">E-mail Cadastrado</label>
                <input
                  type="email"
                  disabled
                  value={formData.email}
                  className="w-full bg-slate-100 border border-slate-300 rounded-lg p-2.5 text-slate-600 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nível de Permissão (Role)</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-medium"
                >
                  <option value="ADMIN">Administrador Geral</option>
                  <option value="GERENTE">Gerente de Loja</option>
                  <option value="ATENDIMENTO">Atendimento / Recepção WhatsApp</option>
                  <option value="CONFEITEIRO">Chef / Produção Central</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Unidade Padrão de Trabalho</label>
                <select
                  value={formData.unidadePadraoId}
                  onChange={(e) => setFormData({ ...formData, unidadePadraoId: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-medium"
                >
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-full">
                <label className="font-semibold text-slate-700 block mb-1">Foto do Avatar</label>
                <div className="flex items-center gap-3">
                  <img
                    src={formData.avatarUrl || '/logo.jpg'}
                    alt={formData.nome}
                    className="w-12 h-12 rounded-full object-cover border border-slate-300 ring-2 ring-brand-500/20 shrink-0"
                  />
                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => avatarFileRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold transition-colors shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Selecionar Arquivo</span>
                  </button>
                  <input
                    type="text"
                    value={formData.avatarUrl}
                    onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                    placeholder="Ou cole a URL da imagem..."
                    className="flex-1 bg-white border border-slate-300 rounded-lg p-2.5 font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-100">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nova Senha (8 números)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={myNewPassword}
                  onChange={(e) => setMyNewPassword(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Deixe em branco para manter"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono tracking-widest"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Confirmar Nova Senha</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={myConfirmPassword}
                  onChange={(e) => setMyConfirmPassword(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Repita os 8 números"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono tracking-widest"
                />
              </div>
              {passwordError && (
                <p className="col-span-full text-xs font-semibold text-rose-600">{passwordError}</p>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              {saveSuccess && (
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Salvo com sucesso!
                </span>
              )}
              <button
                onClick={handleSaveProfile}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </div>
        )}

        {/* GESTÃO DE USUÁRIOS DO SISTEMA (APENAS ADMIN) */}
        {activeTab === 'perfil' && userProfile.role === 'ADMIN' && (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-brand-50 text-brand-700">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Usuários do Sistema</h3>
                  <p className="text-xs text-slate-500">
                    Inclua, edite ou ative/desative operadores com acesso ao sistema
                  </p>
                </div>
              </div>
              <button
                onClick={openNewUserModal}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Incluir Usuário</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Usuário</th>
                    <th className="py-2.5 px-3">E-mail</th>
                    <th className="py-2.5 px-3">Cargo</th>
                    <th className="py-2.5 px-3">Unidade Padrão</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        Nenhum usuário cadastrado. Clique em "Incluir Usuário" para adicionar.
                      </td>
                    </tr>
                  ) : (
                    users.map(u => {
                      const isActive = u.ativo !== false;
                      const unitName = units.find(un => un.id === u.unidadePadraoId)?.nome || 'Não definida';
                      return (
                        <tr key={u.id || u.email} className={`hover:bg-slate-50/70 ${!isActive ? 'opacity-60' : ''}`}>
                          <td className="py-2.5 px-3 font-semibold text-slate-800 flex items-center gap-2">
                            {u.avatarUrl ? (
                              <img src={u.avatarUrl} alt={u.nome} className="w-7 h-7 rounded-full object-cover border border-slate-200" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-[10px]">
                                {u.nome.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span>{u.nome}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{u.email}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{unitName}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {isActive ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => openEditUserModal(u)}
                                title="Editar usuário"
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onToggleUserActive(u.id || u.email, !isActive)}
                                title={isActive ? 'Desativar usuário' : 'Ativar usuário'}
                                className={`p-1.5 rounded-lg border transition-colors ${
                                  isActive
                                    ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                                    : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SEÇÃO 2: EMPRESAS & LOJAS GERENCIADAS */}
        {activeTab === 'empresas' && (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {userProfile.role === 'ADMIN'
                    ? 'Associação de Empresas & Lojas por Usuário'
                    : 'Lojas & Unidades Autorizadas'}
                </h2>
                <p className="text-xs text-slate-500">
                  {userProfile.role === 'ADMIN'
                    ? 'Selecione um usuário para associar ou desassociar as lojas e unidades autorizadas'
                    : 'Visualize as filiais que seu perfil possui autorização para operar'}
                </p>
              </div>
              {userProfile.role === 'ADMIN' && (
                <div className="w-full sm:w-72">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Usuário Selecionado</label>
                  <select
                    value={selectedAssocUser ? (selectedAssocUser.id || selectedAssocUser.email) : ''}
                    onChange={(e) => setSelectedAssocUserId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    {users.map(u => (
                      <option key={u.id || u.email} value={u.id || u.email}>
                        {u.nome} ({u.role}) {u.ativo === false ? '— Inativo' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {units
                .filter(unit =>
                  userProfile.role === 'ADMIN' ||
                  !userProfile.unidadesPermitidas ||
                  userProfile.unidadesPermitidas.length === 0 ||
                  userProfile.unidadesPermitidas.includes(unit.id)
                )
                .map(unit => {
                  const isAdmin = userProfile.role === 'ADMIN';
                  const isAssociated = isAdmin
                    ? (selectedAssocUser?.unidadesPermitidas || []).includes(unit.id)
                    : true;
                  return (
                    <div
                      key={unit.id}
                      className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
                        isAssociated ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isAdmin && (
                          <input
                            type="checkbox"
                            checked={isAssociated}
                            disabled={!selectedAssocUser}
                            onChange={() => handleToggleUnitAssociation(unit.id)}
                            className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        )}
                        <div className={`p-2 rounded-lg ${
                          unit.tipo === 'CENTRAL' ? 'bg-amber-100 text-amber-800' : 'bg-brand-100 text-brand-800'
                        }`}>
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{unit.nome}</h4>
                          <p className="text-[11px] text-slate-500">{unit.endereco} • WhatsApp: {unit.telefone}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-white border border-slate-200 font-semibold text-slate-700">
                          {unit.tipo === 'CENTRAL' ? 'Matriz' : 'Filial'}
                        </span>
                        {isAdmin ? (
                          <button
                            type="button"
                            disabled={!selectedAssocUser}
                            onClick={() => handleToggleUnitAssociation(unit.id)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                              isAssociated
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                : 'text-slate-600 bg-white border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {isAssociated ? 'Associada' : 'Desassociada'}
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            Acesso Liberado
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* SEÇÃO 3: METAS DE FATURAMENTO */}
        {activeTab === 'metas' && (() => {
          const monthNames = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
          ];
          const activeUnits = units.filter(u => u.ativo);
          const isConsolidated = selectedGoalUnitId === 'all';
          const selectedUnit = activeUnits.find(u => u.id === selectedGoalUnitId);
          const currentYear = new Date().getFullYear();
          const yearOptions = Array.from({ length: 8 }, (_, i) => currentYear - 2 + i);

          const getMonthKey = (monthIndex: number) =>
            isConsolidated
              ? getMonthYearKey(selectedGoalYear, monthIndex)
              : getUnitMonthGoalKey(selectedGoalUnitId, selectedGoalYear, monthIndex);

          const realizedByMonth = new Array<number>(12).fill(0);
          orders.forEach(o => {
            if (o.status === 'CANCELADO') return;
            if (!isConsolidated && o.unidadeOrigemId !== selectedGoalUnitId) return;
            const d = new Date(o.dataHoraEntrega || o.dataPedido);
            if (d.getFullYear() === selectedGoalYear) {
              realizedByMonth[d.getMonth()] += o.valorTotal;
            }
          });

          const annualGoalTotal = getYearGoalForUnit(draftGoals, selectedGoalUnitId, selectedGoalYear, activeUnits);
          const annualRealizedTotal = realizedByMonth.reduce((sum, v) => sum + v, 0);
          const annualPct = annualGoalTotal > 0 ? Math.min(100, (annualRealizedTotal / annualGoalTotal) * 100) : 0;

          const handleApplyBulk = () => {
            if (isConsolidated) return;
            const val = parseFloat(bulkGoalValue.replace(',', '.'));
            if (isNaN(val) || val < 0) return;
            const updated = { ...draftGoals };
            for (let idx = 0; idx < 12; idx++) {
              updated[getMonthKey(idx)] = val;
            }
            setDraftGoals(updated);
            if (onSaveRevenueGoals) {
              onSaveRevenueGoals(updated);
            }
          };

          const handleSaveGoals = () => {
            if (onSaveRevenueGoals) {
              onSaveRevenueGoals(draftGoals);
            }
            setGoalsSavedSuccess(true);
            setTimeout(() => setGoalsSavedSuccess(false), 3000);
          };

          return (
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Target className="w-4 h-4 text-brand-600" />
                    <span>
                      Metas Mensais de Faturamento {selectedUnit ? `• ${selectedUnit.nome}` : '• Consolidado'}
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isConsolidated
                      ? 'Visão consolidada somando as metas de todas as unidades. Selecione uma unidade para editar.'
                      : 'Defina as metas mensais individuais desta unidade.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedGoalUnitId}
                    onChange={(e) => {
                      setSelectedGoalUnitId(e.target.value);
                      setFocusedGoalKey(null);
                    }}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 outline-none cursor-pointer"
                  >
                    <option value="all">Todas as Unidades (Consolidado)</option>
                    {activeUnits.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.tipo === 'CENTRAL' ? '🏭 ' : '🏪 '}{u.nome}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedGoalYear(y => y - 1)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                      title="Ano anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <select
                      value={selectedGoalYear}
                      onChange={(e) => setSelectedGoalYear(Number(e.target.value))}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 outline-none cursor-pointer"
                    >
                      {yearOptions.map(yr => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setSelectedGoalYear(y => y + 1)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                      title="Próximo ano"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Annual Summary + Quick Fill */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#f8f9ff] border border-slate-200">
                  <span className="text-[10px] font-mono font-semibold uppercase text-slate-500">
                    Meta Anual ({selectedGoalYear})
                  </span>
                  <div className="text-lg font-mono font-bold text-slate-900 mt-1">
                    R$ {annualGoalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <span className="text-[10px] font-mono font-semibold uppercase text-emerald-700">
                    Realizado em {selectedGoalYear}
                  </span>
                  <div className="text-lg font-mono font-bold text-emerald-900 mt-1">
                    R$ {annualRealizedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-emerald-700">
                    {annualGoalTotal > 0 ? `${annualPct.toFixed(1)}% da meta anual` : 'Defina metas abaixo'}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-2">
                  <span className="text-[10px] font-mono font-semibold uppercase text-slate-500">
                    Preenchimento Rápido ({selectedGoalYear})
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="Ex: 50000"
                      value={bulkGoalValue}
                      onChange={(e) => setBulkGoalValue(e.target.value)}
                      disabled={isConsolidated}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:border-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={handleApplyBulk}
                      disabled={isConsolidated}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg whitespace-nowrap transition-colors"
                    >
                      Aplicar p/ 12 meses
                    </button>
                  </div>
                </div>
              </div>

              {/* Per-Unit Annual Overview */}
              {activeUnits.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeUnits.map(u => {
                    const uGoal = getYearGoalForUnit(draftGoals, u.id, selectedGoalYear, activeUnits);
                    const uRealized = orders
                      .filter(o => o.status !== 'CANCELADO' && o.unidadeOrigemId === u.id && new Date(o.dataHoraEntrega || o.dataPedido).getFullYear() === selectedGoalYear)
                      .reduce((sum, o) => sum + o.valorTotal, 0);
                    const uPct = uGoal > 0 ? Math.min(100, (uRealized / uGoal) * 100) : 0;
                    const isSelected = selectedGoalUnitId === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedGoalUnitId(u.id);
                          setFocusedGoalKey(null);
                        }}
                        className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500/30'
                            : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {u.tipo === 'CENTRAL' ? '🏭 ' : '🏪 '}{u.nome}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-600">
                            {uGoal > 0 ? `${((uRealized / uGoal) * 100).toFixed(0)}%` : 'Sem meta'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-slate-600">
                          <span>Meta: R$ {uGoal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                          <span>Real: R$ {uRealized.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="mt-1.5 h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${uPct >= 100 ? 'bg-emerald-500' : 'bg-brand-600'}`}
                            style={{ width: `${uPct}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 12 Months Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {monthNames.map((name, idx) => {
                  const key = getMonthKey(idx);
                  const goalVal = getMonthGoalForUnit(draftGoals, selectedGoalUnitId, selectedGoalYear, idx, activeUnits);
                  const realized = realizedByMonth[idx];
                  const pct = goalVal > 0 ? Math.min(100, (realized / goalVal) * 100) : 0;

                  return (
                    <div key={key} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-400 transition-colors space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{name}</span>
                        <span className="text-[10px] font-mono text-slate-400">{getMonthYearKey(selectedGoalYear, idx)}</span>
                      </div>

                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                          R$
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          readOnly={isConsolidated}
                          value={
                            focusedGoalKey === key
                              ? focusedGoalText
                              : goalVal > 0
                              ? goalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : ''
                          }
                          placeholder="0,00"
                          onFocus={() => {
                            if (isConsolidated) return;
                            setFocusedGoalKey(key);
                            setFocusedGoalText(goalVal > 0 ? String(goalVal).replace('.', ',') : '');
                          }}
                          onChange={(e) => {
                            if (isConsolidated) return;
                            const raw = e.target.value.replace(/[^\d.,]/g, '');
                            setFocusedGoalText(raw);
                            const normalized = raw.includes(',')
                              ? raw.replace(/\./g, '').replace(',', '.')
                              : raw;
                            const val = parseFloat(normalized);
                            const nextVal = isNaN(val) ? 0 : Math.max(0, val);
                            const updated = { ...draftGoals, [key]: nextVal };
                            setDraftGoals(updated);
                            if (onSaveRevenueGoals) {
                              onSaveRevenueGoals(updated);
                            }
                          }}
                          onBlur={() => setFocusedGoalKey(null)}
                          className={`w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-right text-slate-900 outline-none ${
                            isConsolidated
                              ? 'bg-slate-100 text-slate-600 cursor-default'
                              : 'bg-slate-50 focus:bg-white focus:border-brand-500'
                          }`}
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-500">
                            Realizado: <strong className="text-slate-800">R$ {realized.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong>
                          </span>
                          <span className={pct >= 100 ? 'text-emerald-600 font-bold' : 'text-slate-600 font-semibold'}>
                            {goalVal > 0 ? `${((realized / goalVal) * 100).toFixed(0)}%` : '—'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-brand-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
                  {goalsSavedSuccess && (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Metas salvas com sucesso!</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSaveGoals}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Metas</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* SEÇÃO 4: BANCO DE DADOS BD & EXCEL */}
        {activeTab === 'banco' && (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-sm font-bold text-slate-900">Dados</h2>
            </div>

            {/* Connection Status Card */}
            <div className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isSupabaseOnline ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'
            }`}>
              <div className="flex items-center gap-3">
                <Database className={`w-7 h-7 ${isSupabaseOnline ? 'text-emerald-600' : 'text-amber-600'}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900">BD Cloud PostgreSQL</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isSupabaseOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {isSupabaseOnline ? '● Online & Conectado' : '● Modo Offline (LocalStorage)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                    {supabaseUrl || 'Conectado ao BD'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="https://supabase.com/dashboard/project/zfqpqhutklhvwoulflwc"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                  <span>Painel do BD</span>
                </a>
              </div>
            </div>

            {/* Mock Data Populate & Clean Card */}
            <div className="p-5 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-600" />
                  <h4 className="text-xs font-bold text-slate-900">Dados Mock para Testes (BD Cloud)</h4>
                </div>
                {mockMessage && (
                  <span className="text-xs text-indigo-900 font-semibold">{mockMessage}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Popule o banco de dados com registros fictícios realistas (até 50 registros por tabela) para testes ou limpe os dados operacionais. As tabelas de <strong>Usuários</strong> e <strong>Unidades</strong> não são populadas nem apagadas por estas ações.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handlePopulateMockData}
                  disabled={mockLoading !== null || !isSupabaseOnline}
                  className="flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${mockLoading === 'populate' ? 'animate-spin' : ''}`} />
                  <span>{mockLoading === 'populate' ? 'Populando BD...' : 'Popular Mock Data (até 50/tabela)'}</span>
                </button>
                <button
                  onClick={handleCleanMockData}
                  disabled={mockLoading !== null || !isSupabaseOnline}
                  className={`flex items-center justify-center gap-2 py-2 px-4 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors ${
                    confirmCleanMock
                      ? 'bg-rose-700 hover:bg-rose-800 ring-2 ring-rose-300'
                      : 'bg-rose-600 hover:bg-rose-700'
                  } disabled:bg-slate-300`}
                >
                  <Trash2 className={`w-3.5 h-3.5 ${mockLoading === 'clean' ? 'animate-pulse' : ''}`} />
                  <span>
                    {mockLoading === 'clean'
                      ? 'Limpando BD...'
                      : confirmCleanMock
                      ? 'Confirmar Limpeza do BD'
                      : 'Limpar Dados Mock'}
                  </span>
                </button>
                {confirmCleanMock && mockLoading === null && (
                  <button
                    type="button"
                    onClick={() => setConfirmCleanMock(false)}
                    className="py-2 px-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            {/* Excel Download / Upload Tools */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Card Download */}
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-brand-600" />
                  <h4 className="text-xs font-bold text-slate-900">Exportar Backup Completo (.xlsx)</h4>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Baixe todas as tabelas do BD em um único arquivo Excel contendo as abas formatadas:
                  <strong> Lojas, Categorias, Produtos, Clientes, Pedidos, Estoque, Ordens de Produção e Usuários</strong>.
                </p>
                <button
                  onClick={handleExportFullBackup}
                  disabled={exportingBackup}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-60 text-slate-800 text-xs font-bold rounded-lg transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>{exportingBackup ? 'Exportando BD Completo...' : 'Baixar Backup Geral (.xlsx)'}</span>
                </button>
              </div>

              {/* Card Upload */}
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-purple-600" />
                  <h4 className="text-xs font-bold text-slate-900">Restaurar / Carga em Lote (.xlsx)</h4>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Faça o upload de uma planilha de backup para atualizar ou restaurar os dados de todas as filiais e produtos com validação de esquema.
                </p>
                <input
                  type="file"
                  ref={backupFileRef}
                  onChange={handleBackupUpload}
                  accept=".xlsx"
                  className="hidden"
                />
                <button
                  onClick={() => backupFileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Selecionar Planilha (.xlsx)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SEÇÃO WHATSAPP & CARDÁPIO IA */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-6">
            {/* Card 1: Cardápio Digital Público & Assistente IA */}
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-600" />
                    <span>Cardápio Digital Público & Assistente IA de Encomendas</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Compartilhe o link abaixo com seus clientes no WhatsApp ou Instagram. O cliente monta o pedido (ou conversa com a IA), valida o CEP e o pedido já entra direto na fila de Pedidos!
                  </p>
                </div>
                {onOpenCardapioDigital && (
                  <button
                    type="button"
                    onClick={onOpenCardapioDigital}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir Cardápio Digital</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/?cardapio=1`}
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-mono text-slate-700"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/?cardapio=1`);
                    setCatalogLinkCopied(true);
                    setTimeout(() => setCatalogLinkCopied(false), 2000);
                  }}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  {catalogLinkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{catalogLinkCopied ? 'Link Copiado!' : 'Copiar Link'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/?cardapio=1`;
                    const msg = `🍰 *Cardápio Digital — Beju Caramelos*\nFaça sua encomenda online com nosso Assistente IA e cálculo automático de entrega:\n${url}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                  }}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Compartilhar no WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Card 2: Cálculo de Taxa de Entrega por Distância e Loja Mais Próxima */}
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-brand-600" />
                  <span>Regra de Taxa de Entrega por CEP & Loja Mais Próxima</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ao informar o CEP, o sistema seleciona automaticamente a loja ativa mais próxima (Horto ou Paralela) e calcula a taxa pela distância estimada.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Limite da Taxa Base (km)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={waSettings.baseFeeMaxKm}
                    onChange={e =>
                      setWaSettings({ ...waSettings, baseFeeMaxKm: Number(e.target.value) || 0 })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Taxa Base até {waSettings.baseFeeMaxKm} km (R$)
                  </label>
                  <CurrencyInput
                    value={waSettings.baseFeeAmount}
                    onChangeValue={val =>
                      setWaSettings({ ...waSettings, baseFeeAmount: val })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Adicional por km (&gt; {waSettings.baseFeeMaxKm} km)
                  </label>
                  <CurrencyInput
                    value={waSettings.extraFeePerKm}
                    onChangeValue={val =>
                      setWaSettings({ ...waSettings, extraFeePerKm: val })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Taxa Padrão sem CEP (R$)
                  </label>
                  <CurrencyInput
                    value={waSettings.defaultDeliveryFee}
                    onChangeValue={val =>
                      setWaSettings({ ...waSettings, defaultDeliveryFee: val })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Raio Máximo (km)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={waSettings.maxDeliveryRadiusKm}
                    onChange={e =>
                      setWaSettings({ ...waSettings, maxDeliveryRadiusKm: Number(e.target.value) || 25 })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Card 3: Notificações de Mudança de Status & Templates */}
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    <span>Notificações de Status no WhatsApp & Templates</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Variáveis disponíveis: <code className="bg-slate-100 px-1 rounded">{'{cliente}'}</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">{'{pedido}'}</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">{'{itens}'}</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">{'{total}'}</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">{'{modalidade}'}</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">{'{endereco}'}</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">{'{unidade}'}</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">{'{horario}'}</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setWaSettings({
                      ...waSettings,
                      templates: { ...DEFAULT_WHATSAPP_TEMPLATES }
                    })
                  }
                  className="text-xs font-semibold text-brand-700 hover:underline shrink-0 cursor-pointer"
                >
                  Restaurar Templates Padrão
                </button>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 cursor-pointer text-xs font-semibold text-emerald-950">
                <input
                  type="checkbox"
                  checked={waSettings.autoPromptOnStatusChange}
                  onChange={e =>
                    setWaSettings({ ...waSettings, autoPromptOnStatusChange: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-emerald-400 text-emerald-600"
                />
                <span>
                  Exibir aviso rápido &ldquo;Notificar cliente no WhatsApp?&rdquo; sempre que o status de um pedido for alterado (Confirmado, Em Produção, Pronto, Em Rota, Entregue)
                </span>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {(['CONFIRMADO', 'EM_PRODUCAO', 'PRONTO', 'EM_ROTA', 'ENTREGUE'] as const).map(st => (
                  <div key={st} className="space-y-1">
                    <label className="font-mono font-bold text-slate-700 block">
                      Status: {st}
                    </label>
                    <textarea
                      rows={4}
                      value={waSettings.templates[st] || ''}
                      onChange={e =>
                        setWaSettings({
                          ...waSettings,
                          templates: {
                            ...waSettings.templates,
                            [st]: e.target.value
                          }
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 font-mono text-[11px]"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Card 4: Integração Opcional via API / Webhook */}
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Integração Opcional com API de WhatsApp (Evolution API / Z-API / Webhook)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Quando desativado, o sistema usa o disparo 1-Clique abrindo o WhatsApp Web/App gratuitamente. Quando ativado, dispara via HTTP POST para seu endpoint.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waSettings.apiEnabled}
                    onChange={e => setWaSettings({ ...waSettings, apiEnabled: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600"
                  />
                  <span>Ativar Disparo via API</span>
                </label>
              </div>

              {waSettings.apiEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Provedor</label>
                    <select
                      value={waSettings.apiProvider}
                      onChange={e =>
                        setWaSettings({ ...waSettings, apiProvider: e.target.value as any })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5"
                    >
                      <option value="WEBHOOK">Webhook Customizado / n8n / Make</option>
                      <option value="EVOLUTION">Evolution API</option>
                      <option value="ZAPI">Z-API</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Endpoint URL (POST)</label>
                    <input
                      type="url"
                      placeholder="https://sua-api.com/message/sendText/..."
                      value={waSettings.apiEndpointUrl}
                      onChange={e => setWaSettings({ ...waSettings, apiEndpointUrl: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">API Key / Bearer Token</label>
                    <input
                      type="password"
                      placeholder="Token de autenticação"
                      value={waSettings.apiToken}
                      onChange={e => setWaSettings({ ...waSettings, apiToken: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                {waSavedSuccess && (
                  <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    <span>Configurações de Automação WhatsApp salvas!</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    saveWhatsAppAutomationSettings(waSettings);
                    setWaSavedSuccess(true);
                    setTimeout(() => setWaSavedSuccess(false), 3000);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Configurações de WhatsApp & Taxas</span>
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Modal Incluir / Editar Usuário */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {editingUser ? 'Editar Usuário' : 'Incluir Novo Usuário'}
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveUserModal} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={userForm.nome}
                  onChange={e => setUserForm({ ...userForm, nome: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">E-mail *</label>
                <input
                  type="email"
                  required
                  disabled={!!editingUser}
                  value={userForm.email}
                  onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Senha de Acesso (8 números) {editingUser ? '(deixe em branco para manter)' : '*'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  required={!editingUser}
                  placeholder="•••••••• (8 dígitos numéricos)"
                  value={userForm.senha || ''}
                  onChange={e => setUserForm({ ...userForm, senha: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 font-mono tracking-widest"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cargo (Role)</label>
                  <select
                    value={userForm.role}
                    onChange={e => setUserForm({ ...userForm, role: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-lg p-2.5"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="GERENTE">GERENTE</option>
                    <option value="ATENDIMENTO">ATENDIMENTO</option>
                    <option value="CONFEITEIRO">CONFEITEIRO</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unidade Padrão</label>
                  <select
                    value={userForm.unidadePadraoId}
                    onChange={e => setUserForm({ ...userForm, unidadePadraoId: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5"
                  >
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="user-ativo"
                  checked={userForm.ativo !== false}
                  onChange={e => setUserForm({ ...userForm, ativo: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600"
                />
                <label htmlFor="user-ativo" className="font-semibold text-slate-700 cursor-pointer">
                  Usuário Ativo no Sistema
                </label>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold"
                >
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
