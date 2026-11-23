import React, { useState, useEffect } from 'react';
import { StoreUnit, UserProfile, ProductionShift } from '../types';
import { Store, Settings, Download, ChevronDown } from 'lucide-react';
import { AuthModal } from './AuthModal';
import { getSeasonalDecoration } from '../utils/seasonalDecoration';
import { canOpenSettings } from '../utils/permissions';

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
  const [isSpecialBlink, setIsSpecialBlink] = useState(false);
  const [showSeasonalDecoration, setShowSeasonalDecoration] = useState<boolean>(() => {
    try {
      return localStorage.getItem('juju_seasonal_decoration') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleSeasonalDecoration = () => {
    setShowSeasonalDecoration(prev => {
      const next = !prev;
      try {
        localStorage.setItem('juju_seasonal_decoration', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

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

  const isConnected = Boolean(supabaseUser || isOperatorAuthenticated);
  const seasonal = getSeasonalDecoration(now, userProfile?.nome);

  useEffect(() => {
    if (!seasonal.blinkEvery10Min || !showSeasonalDecoration) {
      setIsSpecialBlink(false);
      return;
    }

    let blinkOffTimeout: ReturnType<typeof setTimeout> | undefined;
    const triggerSpecialBlink = () => {
      setIsSpecialBlink(true);
      if (blinkOffTimeout) clearTimeout(blinkOffTimeout);
      blinkOffTimeout = setTimeout(() => setIsSpecialBlink(false), 10000);
    };

    triggerSpecialBlink();
    const interval = setInterval(triggerSpecialBlink, 10 * 60 * 1000);

    return () => {
      clearInterval(interval);
      if (blinkOffTimeout) clearTimeout(blinkOffTimeout);
    };
  }, [seasonal.blinkEvery10Min, seasonal.id, showSeasonalDecoration]);

  return (
    <>
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
            <span
              className={`text-sm sm:text-xl font-bold tracking-tight font-sans truncate ${
                showSeasonalDecoration ? seasonal.textGradientClass : 'text-[#0f172a]'
              }`}
            >
              Beju Caramelos
            </span>
            <button
              type="button"
              onClick={toggleSeasonalDecoration}
              title={
                showSeasonalDecoration
                  ? `Decoração sazonal: ${seasonal.label} (clique para desativar)`
                  : `Ativar decoração sazonal (${seasonal.label})`
              }
              aria-label={
                showSeasonalDecoration
                  ? `Desativar decoração sazonal: ${seasonal.label}`
                  : `Ativar decoração sazonal: ${seasonal.label}`
              }
              aria-pressed={showSeasonalDecoration}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] sm:text-xs font-semibold shadow-xs shrink-0 transition-all cursor-pointer ${
                showSeasonalDecoration
                  ? `${seasonal.badgeClass}${isSpecialBlink ? ' animate-pulse ring-2 ring-offset-1 ring-current' : ''}`
                  : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 hover:opacity-100 hover:text-slate-600'
              }`}
            >
              <span aria-hidden="true" className={showSeasonalDecoration ? '' : 'grayscale'}>
                {seasonal.icons[0]}
              </span>
              {showSeasonalDecoration && (
                <>
                  <span className="hidden lg:inline">{seasonal.label}</span>
                  <span aria-hidden="true" className="hidden sm:inline">{seasonal.icons[1]}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Center Controls: N-Stores Selector */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {/* Dynamic N-Store Dropdown (overflow-safe) */}
        <div className="relative flex items-center gap-1.5 md:gap-2 h-9 bg-[#f8f9ff] border border-[#cbd5e1] rounded-lg pl-2.5 md:pl-3 pr-6 md:pr-7 shadow-xs hover:border-brand-500 transition-colors max-w-[185px] sm:max-w-[270px] min-w-0">
          <Store className="w-4 h-4 text-brand-600 shrink-0" />
          <span className="hidden sm:inline text-xs leading-normal font-medium text-[#64748b] shrink-0">Unidade:</span>
          <select
            value={activeUnitId}
            onChange={(e) => onSelectUnit(e.target.value)}
            aria-label="Unidade"
            className="appearance-none bg-transparent py-1 pr-5 -mr-5 text-[11px] md:text-xs leading-normal font-semibold text-[#0f172a] focus:outline-none cursor-pointer min-w-0 flex-1 truncate"
          >
            {units.filter(u => u.ativo).length > 1 && (
              <option value="all">Todas as Unidades</option>
            )}
            {units.filter(u => u.ativo).map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 md:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
            aria-label="Instalar aplicativo na tela inicial"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Instalar App</span>
          </button>
        )}

        <button
          onClick={() => setShowAuthModal(true)}
          className="flex items-center gap-2.5 p-1.5 pr-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all text-left"
          title="Login / Logout do Usuário (E-mail e Senha)"
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

        {canOpenSettings(userProfile.role) && (
          <button
            onClick={onOpenSettings}
            className="hidden md:inline-flex p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Abrir Configurações do Sistema"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>

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
    </>
  );
};
