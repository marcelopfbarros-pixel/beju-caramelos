import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, StoreUnit, Category, Product, Order, StockItem, Customer, ProductionOrder, MonthlyRevenueGoals, CardapioIntroConfig, CardapioThankYouConfig, OrderFinancialRecord, FinancialPaymentChannel } from '../types';
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
  Power,
  X,
  Users,
  Target,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Copy,
  Check,
  Truck,
  Trash2,
  LayoutGrid,
  List
} from 'lucide-react';
import { ExcelService } from '../services/excelService';
import { CurrencyInput, formatCurrencyBR } from '../components/CurrencyInput';
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
  financialRecords?: OrderFinancialRecord[];
  financialChannels?: FinancialPaymentChannel[];
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
    financialRecords?: OrderFinancialRecord[];
    financialChannels?: FinancialPaymentChannel[];
  }) => void;
  isSupabaseOnline: boolean;
  onSyncSupabase?: () => Promise<void> | void;
  revenueGoals?: MonthlyRevenueGoals;
  onSaveRevenueGoals?: (goals: MonthlyRevenueGoals) => void;
  cardapioIntroConfig?: CardapioIntroConfig;
  onSaveCardapioIntroConfig?: (config: CardapioIntroConfig) => void;
  cardapioThankYouConfig?: CardapioThankYouConfig;
  onSaveCardapioThankYouConfig?: (config: CardapioThankYouConfig) => void;
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
  financialRecords = [],
  financialChannels = [],
  onSaveUserProfile,
  onSaveUser,
  onToggleUserActive,
  onRestoreFullBackup,
  isSupabaseOnline,
  onSyncSupabase,
  revenueGoals = {},
  onSaveRevenueGoals,
  cardapioIntroConfig = { imageUrl: '/logo.jpg', phrase: 'Beju Caramelos', durationSeconds: 5 },
  onSaveCardapioIntroConfig,
  cardapioThankYouConfig = { imageUrl: '/logo.jpg', phrase: 'Muito obrigado!', durationSeconds: 3 },
  onSaveCardapioThankYouConfig,
  onOpenCardapioDigital,
  activeUnitId
}) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'usuarios' | 'empresas' | 'metas' | 'whatsapp' | 'cardapio' | 'banco'>('perfil');
  const [usersViewMode, setUsersViewMode] = useState<'CARDS' | 'TABLE'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'CARDS' : 'TABLE'
  );
  const [waSettings, setWaSettings] = useState<WhatsAppAutomationSettings>(() =>
    getWhatsAppAutomationSettings()
  );
  const [waSavedSuccess, setWaSavedSuccess] = useState(false);
  const [catalogLinkCopied, setCatalogLinkCopied] = useState(false);
  const [draftIntroConfig, setDraftIntroConfig] = useState<CardapioIntroConfig>(cardapioIntroConfig);
  const [introSavedSuccess, setIntroSavedSuccess] = useState(false);
  const [draftThankYouConfig, setDraftThankYouConfig] = useState<CardapioThankYouConfig>(cardapioThankYouConfig);
  const [thankYouSavedSuccess, setThankYouSavedSuccess] = useState(false);

  useEffect(() => {
    setDraftIntroConfig(cardapioIntroConfig);
  }, [cardapioIntroConfig]);

  useEffect(() => {
    setDraftThankYouConfig(cardapioThankYouConfig);
  }, [cardapioThankYouConfig]);
  const [selectedGoalYear, setSelectedGoalYear] = useState<number>(new Date().getFullYear());
  const [selectedGoalUnitId, setSelectedGoalUnitId] = useState<string>(
    () => activeUnitId || units.find(u => u.ativo)?.id || 'all'
  );
  const [draftGoals, setDraftGoals] = useState<MonthlyRevenueGoals>(revenueGoals);

  useEffect(() => {
    if (activeUnitId) {
      setSelectedGoalUnitId(activeUnitId);
    }
  }, [activeUnitId]);
  const [goalsSavedSuccess, setGoalsSavedSuccess] = useState(false);
  const [bulkGoalValue, setBulkGoalValue] = useState<string>('');
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
        const [dbUnits, dbCats, dbProds, dbOrders, dbStock, dbCustomers, dbProdOrders, dbUsers, dbFinRecs, dbFinChs] = await Promise.all([
          SupabaseService.getUnits().catch(() => units),
          SupabaseService.getCategories().catch(() => categories),
          SupabaseService.getProducts().catch(() => products),
          SupabaseService.getOrders().catch(() => orders),
          SupabaseService.getStock().catch(() => stock),
          SupabaseService.getCustomers().catch(() => customers),
          SupabaseService.getProductionOrders().catch(() => productionOrders),
          SupabaseService.getUsers().catch(() => users),
          SupabaseService.getOrderFinancialRecords().catch(() => financialRecords),
          SupabaseService.getFinancialPaymentChannels().catch(() => financialChannels)
        ]);
        ExcelService.exportFullBackup(
          dbUnits.length ? dbUnits : units,
          dbCats.length ? dbCats : categories,
          dbProds.length ? dbProds : products,
          dbOrders.length ? dbOrders : orders,
          dbStock.length ? dbStock : stock,
          dbCustomers.length ? dbCustomers : customers,
          dbProdOrders.length ? dbProdOrders : productionOrders,
          dbUsers.length ? dbUsers : users,
          dbFinRecs.length ? dbFinRecs : financialRecords,
          dbFinChs.length ? dbFinChs : financialChannels
        );
      } else {
        ExcelService.exportFullBackup(units, categories, products, orders, stock, customers, productionOrders, users, financialRecords, financialChannels);
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
        `Mock data populado (identificado com "MOCK")! Clientes: ${counts.clientes}, Pedidos: ${counts.pedidos} (${counts.itensPedido} itens), Movimentações: ${counts.movimentacoes}, Produção: ${counts.ordensProducao} (${counts.itensProducao} itens). Unidades, Produtos e Usuários preservados.`
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
      setMockMessage('Registros identificados com "MOCK" limpos com sucesso! Dados reais e as tabelas de Unidades, Produtos e Usuários foram preservados.');
    } catch (err: any) {
      console.error('Erro ao limpar mock data:', err);
      setMockMessage(`Erro ao limpar mock data: ${err.message || 'Verifique as permissões do banco'}`);
    } finally {
      setMockLoading(null);
    }
  };

  type ConfigTabId = 'perfil' | 'usuarios' | 'empresas' | 'metas' | 'whatsapp' | 'cardapio' | 'banco';
  const configTabs: { id: ConfigTabId; label: string; mobileLabel?: string; icon: React.ReactNode }[] = [
    { id: 'perfil', label: 'Perfil', icon: <User className="w-3.5 h-3.5 shrink-0" /> },
    ...(userProfile.role === 'ADMIN'
      ? [{ id: 'usuarios' as ConfigTabId, label: 'Usuários', icon: <Users className="w-3.5 h-3.5 shrink-0" /> }]
      : []),
    { id: 'empresas', label: 'Unidades', icon: <Building2 className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'metas', label: 'Metas', icon: <Target className="w-3.5 h-3.5 shrink-0" /> },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
    },
    {
      id: 'cardapio',
      label: 'Cardápio',
      icon: <Sparkles className="w-3.5 h-3.5 text-brand-600 shrink-0" />
    },
    { id: 'banco', label: 'Dados', icon: <Database className="w-3.5 h-3.5 shrink-0" /> }
  ];

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Top Header */}
      <div className="bg-white border-b border-[#e2e8f0] md:px-6 md:py-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between md:gap-4">
          <div className="border-b border-[#e2e8f0] px-3 py-2.5 md:p-0 md:border-b-0">
            <h1 className="text-xl font-bold text-[#0f172a] font-sans flex flex-wrap items-center gap-2">
              <span>Configurações</span>
              <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {configTabs.find(t => t.id === activeTab)?.label || 'Perfil'}
              </span>
            </h1>
          </div>

          <div className="px-3 py-2 md:p-0">
            {/* Segmented Navigation Tabs */}
            <div className="grid grid-cols-3 md:inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-full md:w-auto">
              {configTabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                  aria-label={tab.label}
                  className={`flex items-center justify-center gap-1.5 h-8 px-2 md:px-2.5 lg:px-3 text-[11px] md:text-xs font-semibold rounded-lg transition-all min-w-0 ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.icon}
                  {tab.mobileLabel ? (
                    <>
                      <span className="truncate md:hidden">{tab.mobileLabel}</span>
                      <span className="hidden md:inline">{tab.label}</span>
                    </>
                  ) : (
                    <span className="truncate">{tab.label}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-6">
        {/* SEÇÃO 1: PERFIL DO USUÁRIO */}
        {activeTab === 'perfil' && (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 sm:p-6 shadow-xs space-y-5">
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
                <div className="relative flex items-center">
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-1 text-xs leading-normal font-medium cursor-pointer"
                  >
                    <option value="ADMIN">Administrador Geral</option>
                    <option value="GERENTE">Gerente de Loja</option>
                    <option value="ATENDIMENTO">Atendimento / Recepção WhatsApp</option>
                    <option value="CONFEITEIRO">Chef / Produção Central</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Unidade Padrão de Trabalho</label>
                <div className="relative flex items-center">
                  <select
                    value={formData.unidadePadraoId}
                    onChange={(e) => setFormData({ ...formData, unidadePadraoId: e.target.value })}
                    className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-1 text-xs leading-normal font-medium cursor-pointer"
                  >
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="col-span-full">
                <label className="font-semibold text-slate-700 block mb-1">Foto do Avatar</label>
                <div className="flex flex-wrap items-center gap-3">
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
                    className="flex-1 min-w-[160px] bg-white border border-slate-300 rounded-lg p-2.5 font-mono text-[11px]"
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
        {activeTab === 'usuarios' && userProfile.role === 'ADMIN' && (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-brand-50 text-brand-700 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900">Usuários do Sistema</h3>
                  <p className="text-xs text-slate-500">
                    Inclua, edite ou ative/desative operadores com acesso ao sistema
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs shrink-0"
                  role="group"
                  aria-label="Modo de visualização"
                >
                  <button
                    type="button"
                    onClick={() => setUsersViewMode('CARDS')}
                    title="Cards"
                    aria-label="Cards"
                    className={`h-full flex items-center justify-center px-2 rounded-md text-xs font-semibold transition-colors ${
                      usersViewMode === 'CARDS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setUsersViewMode('TABLE')}
                    title="Tabela"
                    aria-label="Tabela"
                    className={`h-full flex items-center justify-center px-2 rounded-md text-xs font-semibold transition-colors ${
                      usersViewMode === 'TABLE' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={openNewUserModal}
                  title="Incluir Usuário"
                  aria-label="Incluir Usuário"
                  className="flex items-center justify-center gap-1.5 h-8 w-8 md:w-auto px-0 md:px-3.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Incluir Usuário</span>
                </button>
              </div>
            </div>

            {usersViewMode === 'CARDS' ? (
              users.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Nenhum usuário cadastrado. Clique em "Incluir Usuário" para adicionar.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {users.map(u => {
                    const isActive = u.ativo !== false;
                    const unitName = units.find(un => un.id === u.unidadePadraoId)?.nome || 'Não definida';
                    const isEditingCard = showUserModal && Boolean(editingUser && (editingUser.id ? editingUser.id === u.id : editingUser.email === u.email));
                    return (
                      <div
                        key={u.id || u.email}
                        onClick={() => openEditUserModal(u)}
                        className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 min-w-0 overflow-hidden cursor-pointer transition-colors ${
                          isEditingCard
                            ? 'bg-brand-50/70 border-brand-400 ring-2 ring-brand-500 shadow-md'
                            : 'border-slate-200 bg-slate-50/40 hover:border-brand-400'
                        } ${!isActive ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {u.avatarUrl ? (
                              <img
                                src={u.avatarUrl}
                                alt={u.nome}
                                className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs shrink-0">
                                {u.nome.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate">{u.nome}</div>
                              <div className="text-[11px] font-mono text-slate-500 truncate">{u.email}</div>
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold shrink-0">
                              {u.role}
                            </span>
                            <span className="text-[11px] text-slate-600 truncate" title={unitName}>
                              {unitName}
                            </span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => onToggleUserActive(u.id || u.email, !isActive)}
                              title={isActive ? 'Desativar usuário' : 'Ativar usuário'}
                              aria-label={isActive ? 'Desativar usuário' : 'Ativar usuário'}
                              className={`p-1.5 rounded-lg border bg-white transition-colors ${
                                isActive
                                  ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
            <div className="overflow-x-auto max-w-full">
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
                      const isEditingRow = showUserModal && Boolean(editingUser && (editingUser.id ? editingUser.id === u.id : editingUser.email === u.email));
                      return (
                        <tr
                          key={u.id || u.email}
                          onClick={() => openEditUserModal(u)}
                          className={`cursor-pointer transition-colors ${
                            isEditingRow
                              ? 'bg-brand-50/70 ring-1 ring-inset ring-brand-400 border-l-4 border-l-brand-600'
                              : 'hover:bg-slate-50/70'
                          } ${!isActive ? 'opacity-60' : ''}`}
                        >
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
                          <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1.5">
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
            )}
          </div>
        )}

        {/* SEÇÃO 2: EMPRESAS & LOJAS GERENCIADAS */}
        {activeTab === 'empresas' && (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 sm:p-6 shadow-xs space-y-6">
            {userProfile.role === 'ADMIN' && (
              <div className="border-b border-slate-100 pb-4">
                <div className="w-full sm:w-72">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Usuário Selecionado</label>
                  <div className="relative flex items-center">
                    <select
                      value={selectedAssocUser ? (selectedAssocUser.id || selectedAssocUser.email) : ''}
                      onChange={(e) => setSelectedAssocUserId(e.target.value)}
                      className="w-full h-9 appearance-none bg-slate-50 border border-slate-300 rounded-lg pl-3 pr-8 py-1 text-xs leading-normal font-semibold text-slate-800 cursor-pointer"
                    >
                      {users.map(u => (
                        <option key={u.id || u.email} value={u.id || u.email}>
                          {u.nome} ({u.role}) {u.ativo === false ? '— Inativo' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>
            )}

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
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
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
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 sm:p-6 shadow-xs space-y-6">
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
                  <div className="relative flex items-center">
                    <select
                      value={selectedGoalUnitId}
                      onChange={(e) => {
                        setSelectedGoalUnitId(e.target.value);
                      }}
                      className="h-9 appearance-none pl-3 pr-8 py-1 bg-white border border-slate-300 rounded-lg text-xs leading-normal font-semibold text-slate-900 outline-none cursor-pointer"
                    >
                      <option value="all">Todas as Unidades (Consolidado)</option>
                      {activeUnits.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.tipo === 'CENTRAL' ? '🏭 ' : '🏪 '}{u.nome}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedGoalYear(y => y - 1)}
                      className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                      title="Ano anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="relative flex items-center">
                      <select
                        value={selectedGoalYear}
                        onChange={(e) => setSelectedGoalYear(Number(e.target.value))}
                        className="h-9 appearance-none pl-3 pr-7 py-1 bg-white border border-slate-300 rounded-lg text-xs leading-normal font-mono font-bold text-slate-900 outline-none cursor-pointer"
                      >
                        {yearOptions.map(yr => (
                          <option key={yr} value={yr}>{yr}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedGoalYear(y => y + 1)}
                      className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
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
                    R$ {formatCurrencyBR(annualGoalTotal)}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <span className="text-[10px] font-mono font-semibold uppercase text-emerald-700">
                    Realizado em {selectedGoalYear}
                  </span>
                  <div className="text-lg font-mono font-bold text-emerald-900 mt-1">
                    R$ {formatCurrencyBR(annualRealizedTotal)}
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
                    <CurrencyInput
                      allowEmpty
                      placeholder="Ex: 50.000,00"
                      value={parseFloat(bulkGoalValue) || 0}
                      onChangeValue={(val) => setBulkGoalValue(val > 0 ? String(val) : '')}
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
                          <span>Meta: R$ {formatCurrencyBR(uGoal)}</span>
                          <span>Real: R$ {formatCurrencyBR(uRealized)}</span>
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
                        <CurrencyInput
                          allowEmpty
                          placeholder="0,00"
                          disabled={isConsolidated}
                          value={goalVal}
                          onChangeValue={(nextVal) => {
                            if (isConsolidated) return;
                            const updated = { ...draftGoals, [key]: nextVal };
                            setDraftGoals(updated);
                            if (onSaveRevenueGoals) {
                              onSaveRevenueGoals(updated);
                            }
                          }}
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
                            Realizado: <strong className="text-slate-800">R$ {formatCurrencyBR(realized)}</strong>
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
                Popule o banco de dados com registros fictícios identificados com <strong>MOCK</strong> (até 50 registros por tabela) para testes ou remova apenas os registros marcados com <strong>MOCK</strong>. As tabelas de <strong>Unidades</strong>, <strong>Produtos</strong>, <strong>Usuários</strong> e registros reais nunca são alterados ou removidos.
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

        {/* SEÇÃO CARDÁPIO DIGITAL */}
        {activeTab === 'cardapio' && (
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
                    onClick={() => {
                      onSaveCardapioIntroConfig?.(draftIntroConfig);
                      onSaveCardapioThankYouConfig?.(draftThankYouConfig);
                      onOpenCardapioDigital();
                    }}
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

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    Animação de Abertura do Cardápio Digital
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Exibida toda vez que o cardápio é aberto: foto centralizada no terço do meio da tela e frase logo abaixo, com entrada suave e saída com fade-out.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-3 flex flex-col items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <img
                      src={draftIntroConfig.imageUrl || '/logo.jpg'}
                      alt="Prévia da abertura"
                      className="w-20 h-20 rounded-xl object-contain bg-white border border-slate-200 shadow-2xs"
                    />
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <label className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-700 cursor-pointer">
                        <span>Enviar Foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result !== 'string') return;
                              const rawDataUrl = reader.result;
                              const img = new Image();
                              img.onload = () => {
                                const maxDim = 480;
                                let { width, height } = img;
                                if (width > maxDim || height > maxDim) {
                                  const ratio = Math.min(maxDim / width, maxDim / height);
                                  width = Math.round(width * ratio);
                                  height = Math.round(height * ratio);
                                }
                                const canvas = document.createElement('canvas');
                                canvas.width = width;
                                canvas.height = height;
                                const ctx = canvas.getContext('2d');
                                const finalUrl = ctx
                                  ? (() => {
                                      ctx.drawImage(img, 0, 0, width, height);
                                      return canvas.toDataURL('image/jpeg', 0.75);
                                    })()
                                  : rawDataUrl;
                                setDraftIntroConfig(prev => {
                                  const next = { ...prev, imageUrl: finalUrl };
                                  onSaveCardapioIntroConfig?.(next);
                                  return next;
                                });
                              };
                              img.onerror = () => {
                                setDraftIntroConfig(prev => {
                                  const next = { ...prev, imageUrl: rawDataUrl };
                                  onSaveCardapioIntroConfig?.(next);
                                  return next;
                                });
                              };
                              img.src = rawDataUrl;
                            };
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...draftIntroConfig, imageUrl: '/logo.jpg' };
                          setDraftIntroConfig(next);
                          onSaveCardapioIntroConfig?.(next);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-600 cursor-pointer"
                      >
                        Restaurar Logo
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-9 space-y-3">
                    <div>
                      <label
                        htmlFor="cardapio-intro-image-url"
                        className="block text-[11px] font-bold text-slate-700 mb-1"
                      >
                        URL da Foto (padrão: /logo.jpg)
                      </label>
                      <input
                        id="cardapio-intro-image-url"
                        type="text"
                        value={draftIntroConfig.imageUrl}
                        onChange={e => {
                          const next = { ...draftIntroConfig, imageUrl: e.target.value };
                          setDraftIntroConfig(next);
                          onSaveCardapioIntroConfig?.(next);
                        }}
                        placeholder="/logo.jpg"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="cardapio-intro-phrase"
                          className="block text-[11px] font-bold text-slate-700 mb-1"
                        >
                          Frase abaixo da foto
                        </label>
                        <input
                          id="cardapio-intro-phrase"
                          type="text"
                          value={draftIntroConfig.phrase}
                          onChange={e => {
                            const next = { ...draftIntroConfig, phrase: e.target.value };
                            setDraftIntroConfig(next);
                            onSaveCardapioIntroConfig?.(next);
                          }}
                          placeholder="Beju Caramelos"
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cardapio-intro-duration"
                          className="block text-[11px] font-bold text-slate-700 mb-1"
                        >
                          Duração (segundos)
                        </label>
                        <input
                          id="cardapio-intro-duration"
                          type="number"
                          min={1}
                          max={30}
                          step={0.5}
                          value={draftIntroConfig.durationSeconds}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            const next = {
                              ...draftIntroConfig,
                              durationSeconds: Number.isFinite(val) && val > 0 ? val : 5
                            };
                            setDraftIntroConfig(next);
                            onSaveCardapioIntroConfig?.(next);
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          onSaveCardapioIntroConfig?.(draftIntroConfig);
                          setIntroSavedSuccess(true);
                          setTimeout(() => setIntroSavedSuccess(false), 2000);
                        }}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        {introSavedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                        <span>{introSavedSuccess ? 'Configuração Salva!' : 'Salvar Abertura'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900">
                    Animação ao Finalizar Pedido (Cardápio Digital)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Exibida ao clicar em &quot;Finalizar Pedido...&quot;: mostra a logo e a frase em várias cores pela duração definida.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-3 flex flex-col items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <img
                      src={draftThankYouConfig.imageUrl || '/logo.jpg'}
                      alt="Prévia do agradecimento"
                      className="w-20 h-20 rounded-xl object-contain bg-white border border-slate-200 shadow-2xs"
                    />
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <label className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-700 cursor-pointer">
                        <span>Enviar Logo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result !== 'string') return;
                              const rawDataUrl = reader.result;
                              const img = new Image();
                              img.onload = () => {
                                const maxDim = 480;
                                let { width, height } = img;
                                if (width > maxDim || height > maxDim) {
                                  const ratio = Math.min(maxDim / width, maxDim / height);
                                  width = Math.round(width * ratio);
                                  height = Math.round(height * ratio);
                                }
                                const canvas = document.createElement('canvas');
                                canvas.width = width;
                                canvas.height = height;
                                const ctx = canvas.getContext('2d');
                                const finalUrl = ctx
                                  ? (() => {
                                      ctx.drawImage(img, 0, 0, width, height);
                                      return canvas.toDataURL('image/jpeg', 0.75);
                                    })()
                                  : rawDataUrl;
                                setDraftThankYouConfig(prev => {
                                  const next = { ...prev, imageUrl: finalUrl };
                                  onSaveCardapioThankYouConfig?.(next);
                                  return next;
                                });
                              };
                              img.onerror = () => {
                                setDraftThankYouConfig(prev => {
                                  const next = { ...prev, imageUrl: rawDataUrl };
                                  onSaveCardapioThankYouConfig?.(next);
                                  return next;
                                });
                              };
                              img.src = rawDataUrl;
                            };
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...draftThankYouConfig, imageUrl: '/logo.jpg' };
                          setDraftThankYouConfig(next);
                          onSaveCardapioThankYouConfig?.(next);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-600 cursor-pointer"
                      >
                        Restaurar Logo
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-9 space-y-3">
                    <div>
                      <label
                        htmlFor="cardapio-thankyou-image-url"
                        className="block text-[11px] font-bold text-slate-700 mb-1"
                      >
                        URL da Logo (padrão: /logo.jpg)
                      </label>
                      <input
                        id="cardapio-thankyou-image-url"
                        type="text"
                        value={draftThankYouConfig.imageUrl}
                        onChange={e => {
                          const next = { ...draftThankYouConfig, imageUrl: e.target.value };
                          setDraftThankYouConfig(next);
                          onSaveCardapioThankYouConfig?.(next);
                        }}
                        placeholder="/logo.jpg"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="cardapio-thankyou-phrase"
                          className="block text-[11px] font-bold text-slate-700 mb-1"
                        >
                          Frase de agradecimento (colorida)
                        </label>
                        <input
                          id="cardapio-thankyou-phrase"
                          type="text"
                          value={draftThankYouConfig.phrase}
                          onChange={e => {
                            const next = { ...draftThankYouConfig, phrase: e.target.value };
                            setDraftThankYouConfig(next);
                            onSaveCardapioThankYouConfig?.(next);
                          }}
                          placeholder="Muito obrigado!"
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cardapio-thankyou-duration"
                          className="block text-[11px] font-bold text-slate-700 mb-1"
                        >
                          Duração (segundos)
                        </label>
                        <input
                          id="cardapio-thankyou-duration"
                          type="number"
                          min={1}
                          max={30}
                          step={0.5}
                          value={draftThankYouConfig.durationSeconds}
                          onChange={e => {
                            const val = parseFloat(e.target.value);
                            const next = {
                              ...draftThankYouConfig,
                              durationSeconds: Number.isFinite(val) && val > 0 ? val : 3
                            };
                            setDraftThankYouConfig(next);
                            onSaveCardapioThankYouConfig?.(next);
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          onSaveCardapioThankYouConfig?.(draftThankYouConfig);
                          setThankYouSavedSuccess(true);
                          setTimeout(() => setThankYouSavedSuccess(false), 2000);
                        }}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        {thankYouSavedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                        <span>{thankYouSavedSuccess ? 'Configuração Salva!' : 'Salvar Agradecimento'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SEÇÃO WHATSAPP */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-6">
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
                    <div className="relative flex items-center">
                      <select
                        value={waSettings.apiProvider}
                        onChange={e =>
                          setWaSettings({ ...waSettings, apiProvider: e.target.value as any })
                        }
                        className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-1 text-xs leading-normal cursor-pointer"
                      >
                        <option value="WEBHOOK">Webhook Customizado / n8n / Make</option>
                        <option value="EVOLUTION">Evolution API</option>
                        <option value="ZAPI">Z-API</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                    </div>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md max-h-[94dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-100 bg-slate-50 shrink-0">
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
            <form onSubmit={handleSaveUserModal} className="p-3 sm:p-5 space-y-2.5 sm:space-y-3 text-xs overflow-y-auto">
              <div>
                <label className="block font-semibold text-slate-700 mb-0.5 sm:mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={userForm.nome}
                  onChange={e => setUserForm({ ...userForm, nome: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-1.5 sm:p-2.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-0.5 sm:mb-1">E-mail *</label>
                <input
                  type="email"
                  required
                  disabled={!!editingUser}
                  value={userForm.email}
                  onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-1.5 sm:p-2.5 disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-0.5 sm:mb-1">
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
                  className="w-full border border-slate-300 rounded-lg p-1.5 sm:p-2.5 font-mono tracking-widest"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-0.5 sm:mb-1">Cargo (Role)</label>
                  <div className="relative flex items-center">
                    <select
                      value={userForm.role}
                      onChange={e => setUserForm({ ...userForm, role: e.target.value as any })}
                      className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-1 text-xs leading-normal cursor-pointer"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="GERENTE">GERENTE</option>
                      <option value="ATENDIMENTO">ATENDIMENTO</option>
                      <option value="CONFEITEIRO">CONFEITEIRO</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-0.5 sm:mb-1">Unidade Padrão</label>
                  <div className="relative flex items-center">
                    <select
                      value={userForm.unidadePadraoId}
                      onChange={e => setUserForm({ ...userForm, unidadePadraoId: e.target.value })}
                      className="w-full h-9 appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-1 text-xs leading-normal cursor-pointer"
                    >
                      {units.map(u => (
                        <option key={u.id} value={u.id}>{u.nome}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>
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
              <div className="pt-2.5 sm:pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-3.5 sm:px-4 py-1.5 sm:py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3.5 sm:px-4 py-1.5 sm:py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold"
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
