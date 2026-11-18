import React, { useState, useEffect } from 'react';
import { StoreUnit, UserProfile, ProductionShift } from '../types';
import { Store, Calendar, CheckCircle2, AlertCircle, Settings, Download, Sun, Moon } from 'lucide-react';
import { AuthModal } from './AuthModal';
import { getSeasonalDecoration } from '../utils/seasonalDecoration';

interface HeaderProps {
  units: StoreUnit[];
  activeUnitId: string;
  onSelectUnit: (unitId: string) => void;
  userProfile: UserProfile;
  users?: UserProfile[];
  onOpenSettings: () => void;
  isSupabaseOnline: boolean;
  isOperatorAuthenticated?: boolean;
  supabaseUser: any;
  onUpdateUserProfile: (profile: UserProfile) => void;
  onRegisterUser?: (user: UserProfile) => Promise<void> | void;
  onRefreshAuth: () => void;
  onLogout?: () => void;
  activeDate?: string;
  activeShift?: ProductionShift | 'TODOS';
  onChangeDate?: (date: string) => void;
  onChangeShift?: (shift: ProductionShift | 'TODOS') => void;
}

export const Header: React.FC<HeaderProps> = ({
  units,
  activeUnitId,
  onSelectUnit,
  userProfile,
  users = [],
  onOpenSettings,
  isSupabaseOnline,
  isOperatorAuthenticated = false,
  supabaseUser,
  onUpdateUserProfile,
  onRegisterUser,
  onRefreshAuth,
  onLogout
}) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [isHourlyBlink, setIsHourlyBlink] = useState(false);

  useEffect(() => {
    let blinkEndTimeout: ReturnType<typeof setTimeout> | undefined;
    let nextHourTimeout: ReturnType<typeof setTimeout> | undefined;

    const triggerBlink = () => {
      setIsHourlyBlink(true);
      if (blinkEndTimeout) clearTimeout(blinkEndTimeout);
      blinkEndTimeout = setTimeout(() => setIsHourlyBlink(false), 4000);
    };

    const scheduleNextHour = () => {
      const current = new Date();
      const msUntilNextHour =
        (60 - current.getMinutes()) * 60 * 1000 -
        current.getSeconds() * 1000 -
        current.getMilliseconds();

      nextHourTimeout = setTimeout(() => {
        setNow(new Date());
        triggerBlink();
        scheduleNextHour();
      }, Math.max(msUntilNextHour, 50));
    };

    // If mounted right on the hour (:00:00 - :00:02), trigger immediately
    const initial = new Date();
    if (initial.getMinutes() === 0 && initial.getSeconds() <= 2) {
      triggerBlink();
    }
    scheduleNextHour();

    return () => {
      if (nextHourTimeout) clearTimeout(nextHourTimeout);
      if (blinkEndTimeout) clearTimeout(blinkEndTimeout);
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const currentHour = now.getHours();
  const currentShiftLabel =
    currentHour < 12 ? 'Turno Manhã' : currentHour < 18 ? 'Turno Tarde' : 'Turno Noite';
  const currentDateText = `${now.toLocaleDateString('pt-BR')} | ${currentShiftLabel}`;
  const isConnected = Boolean(supabaseUser || isOperatorAuthenticated);
  const seasonal = getSeasonalDecoration(now);

  return (
    <header className="h-14 md:h-16 bg-white border-b border-[#e2e8f0] px-2.5 md:px-4 flex items-center justify-between gap-2 z-20 shrink-0 print:hidden">
      {/* Brand Identity & Logo */}
      <div
        className={`flex items-center gap-2 md:gap-3 min-w-0 ${isHourlyBlink ? 'animate-hourly-blink' : ''}`}
        title={`Beju Caramelos • ${seasonal.label}`}
      >
        <img
          src="/logo.jpg"
          alt="Beju Caramelos"
          className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover shadow-sm ring-2 ring-slate-200 shrink-0"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-sm sm:text-xl font-bold tracking-tight font-sans truncate ${seasonal.textGradientClass}`}>
              Beju Caramelos
            </span>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] sm:text-xs font-semibold shadow-xs shrink-0 ${seasonal.badgeClass}`}
              aria-label={`Decoração sazonal: ${seasonal.label}`}
            >
              <span aria-hidden="true">{seasonal.icons[0]}</span>
              <span className="hidden lg:inline">{seasonal.label}</span>
              <span aria-hidden="true">{seasonal.icons[1]}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Center Controls: N-Stores Selector & Shift Info */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {/* Dynamic N-Store Dropdown (overflow-safe) */}
        <div className="flex items-center gap-1.5 md:gap-2 bg-[#f8f9ff] border border-[#cbd5e1] rounded-lg px-2 md:px-3 py-1 md:py-1.5 shadow-sm hover:border-brand-500 transition-colors max-w-[155px] sm:max-w-[260px] min-w-0">
          <Store className="w-3.5 h-3.5 md:w-4 md:h-4 text-brand-600 shrink-0" />
          <span className="hidden sm:inline text-xs font-medium text-[#64748b] shrink-0">Unidade:</span>
          <select
            value={activeUnitId}
            onChange={(e) => onSelectUnit(e.target.value)}
            className="bg-transparent text-[11px] md:text-xs font-semibold text-[#0f172a] focus:outline-none cursor-pointer pr-1 min-w-0 flex-1 truncate"
          >
            {units.filter(u => u.ativo).length > 1 && (
              <option value="all">Todas as Unidades</option>
            )}
            {units.filter(u => u.ativo).map((u) => (
              <option key={u.id} value={u.id}>
                {u.tipo === 'CENTRAL' ? '🏭 ' : '🏪 '} {u.nome}
              </option>
            ))}
          </select>
        </div>

        {/* Date & Shift Text Box (Data e Turno atuais) */}
        <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
          <Calendar className="w-3.5 h-3.5 text-brand-600 shrink-0" />
          <input
            type="text"
            readOnly
            value={currentDateText}
            aria-label="Data e turno atuais"
            className="bg-transparent text-xs font-mono font-semibold text-slate-700 w-44 focus:outline-none cursor-default"
          />
          {currentHour < 12 ? (
            <span title="Turno Manhã" className="inline-flex items-center shrink-0">
              <Sun className="w-3.5 h-3.5 text-yellow-500 fill-yellow-400" aria-label="Turno Manhã" />
            </span>
          ) : currentHour < 18 ? (
            <span title="Turno Tarde" className="inline-flex items-center shrink-0">
              <Sun className="w-3.5 h-3.5 text-orange-500 fill-orange-400" aria-label="Turno Tarde" />
            </span>
          ) : (
            <span title="Turno Noite" className="inline-flex items-center shrink-0">
              <Moon className="w-3.5 h-3.5 text-indigo-600 fill-indigo-400" aria-label="Turno Noite" />
            </span>
          )}
        </div>

      </div>

      {/* User Profile & Auth Trigger */}
      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
        {deferredPrompt && (
          <button
            type="button"
            onClick={handleInstallPwa}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
            title="Instalar aplicativo na tela inicial"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Instalar App</span>
          </button>
        )}
        <button
          onClick={() => onRefreshAuth()}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
            isSupabaseOnline
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
              : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
          }`}
          title={
            isSupabaseOnline
              ? 'Conectado ao BD em nuvem com Realtime ativo — Clique para sincronizar'
              : 'Operando em cache local (localStorage) — Clique para conectar ao BD'
          }
        >
          {isSupabaseOnline ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              <span className="hidden sm:inline">BD Conectado</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden sm:inline">Modo Local (Entrar BD)</span>
            </>
          )}
        </button>

        <button
          onClick={() => setShowAuthModal(true)}
          className="flex items-center gap-2.5 p-1.5 pr-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all text-left"
          title="Login / Logout do Usuário (E-mail/Senha ou Google Auth)"
        >
          <img
            src={userProfile.avatarUrl || '/logo.jpg'}
            alt={userProfile.nome}
            className="w-8 h-8 rounded-full object-cover ring-2 ring-brand-500/20"
          />
          <div className="hidden sm:block">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-[#0f172a]">{userProfile.nome}</span>
            </div>
            <span className="text-[10px] text-[#64748b] font-mono">
              {isConnected ? `${userProfile.role} • Logado` : userProfile.role}
            </span>
          </div>
        </button>

        <button
          onClick={onOpenSettings}
          className="hidden md:inline-flex p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Abrir Configurações do Sistema"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        currentUser={userProfile}
        users={users}
        onUpdateUserProfile={onUpdateUserProfile}
        onRegisterUser={onRegisterUser}
        supabaseUser={supabaseUser}
        onSupabaseAuthChange={onRefreshAuth}
        onLogout={onLogout}
      />
    </header>
  );
};
