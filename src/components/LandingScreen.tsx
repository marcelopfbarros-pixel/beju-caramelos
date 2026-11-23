import React, { useState } from 'react';
import {
  Mail,
  Lock,
  LogIn,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { StoreUnit, UserProfile } from '../types';
import { SupabaseService } from '../services/supabaseService';
import { getSeasonalDecoration } from '../utils/seasonalDecoration';

interface LandingScreenProps {
  users: UserProfile[];
  units: StoreUnit[];
  isSupabaseOnline: boolean;
  onUpdateUserProfile: (profile: UserProfile) => void;
  onRegisterUser?: (user: UserProfile) => Promise<void> | void;
  onSupabaseAuthChange: () => Promise<void> | void;
  onOpenCardapioDigital: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  users,
  units,
  isSupabaseOnline,
  onUpdateUserProfile,
  onSupabaseAuthChange,
  onOpenCardapioDigital,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const seasonal = getSeasonalDecoration();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!/^\d{8}$/.test(password)) {
      setErrorMsg('A senha deve conter exatamente 8 números.');
      return;
    }

    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const defaultUnitId = units.find(u => u.ativo)?.id || 'u-central';

    try {
      if (SupabaseService.isConfigured()) {
        const { authUser, profile } = await SupabaseService.signInOperator(normalizedEmail, password);
        if (profile) {
          onUpdateUserProfile(profile);
        } else if (authUser) {
          const existingByEmail = users.find(u => u.email.toLowerCase() === normalizedEmail);
          onUpdateUserProfile(
            existingByEmail
              ? { ...existingByEmail, autenticadoGoogle: false }
              : {
                  id: authUser.id,
                  nome:
                    authUser.user_metadata?.full_name ||
                    authUser.user_metadata?.name ||
                    normalizedEmail.split('@')[0],
                  email: authUser.email || normalizedEmail,
                  avatarUrl: '/logo.jpg',
                  role: 'ATENDIMENTO',
                  unidadePadraoId: defaultUnitId,
                  autenticadoGoogle: false,
                  ativo: true,
                  unidadesPermitidas: [],
                }
          );
        }
        await onSupabaseAuthChange();
      } else {
        const matchedLocal = users.find(u => u.email.toLowerCase() === normalizedEmail);
        if (!matchedLocal || matchedLocal.senha !== password) {
          setErrorMsg('E-mail ou senha numérica de 8 dígitos incorretos.');
          return;
        }
        if (matchedLocal.ativo === false) {
          setErrorMsg('Este usuário está desativado. Contate um administrador.');
          return;
        }
        onUpdateUserProfile({
          ...matchedLocal,
          autenticadoGoogle: false,
        });
        await onSupabaseAuthChange();
      }
    } catch (err: any) {
      console.error('Erro na autenticação:', err);
      const msg = String(err?.message || '');
      if (msg.includes('Invalid login credentials')) {
        setErrorMsg('E-mail ou senha numérica de 8 dígitos incorretos.');
      } else {
        setErrorMsg(msg || 'Falha ao autenticar no BD.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#f8f9ff] via-white to-emerald-50/40 text-[#0f172a] flex flex-col justify-between p-4 sm:p-6 lg:p-10 font-sans overflow-y-auto">
      {/* Top Status Bar */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-end gap-3">
        <div
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
            isSupabaseOnline
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-amber-700 bg-amber-50 border-amber-200'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isSupabaseOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span>{isSupabaseOnline ? 'BD Nuvem Online' : 'Modo Local'}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Brand Hero & Quick Actions */}
        <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
          <div className="inline-flex lg:flex items-center gap-4">
            <img
              src="/logo.jpg"
              alt="Beju Caramelos"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover shadow-md ring-4 ring-white"
            />
            <div className="text-left space-y-1.5">
              <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${seasonal.textGradientClass}`}>
                Beju Caramelos
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${seasonal.badgeClass}`}
              >
                <span aria-hidden="true">{seasonal.icons[0]}</span>
                <span>{seasonal.label}</span>
                <span aria-hidden="true">{seasonal.icons[1]}</span>
              </span>
            </div>
          </div>

          <div className="pt-1 flex justify-center lg:justify-start">
            <button
              type="button"
              onClick={onOpenCardapioDigital}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 shadow-xs text-xs font-bold transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-brand-600" />
              <span>Abrir Cardápio Digital (Clientes)</span>
            </button>
          </div>
        </div>

        {/* Right: Operator Login Card */}
        <div className="lg:col-span-6">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden max-w-md mx-auto">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-sm">
                  LogIn
                </h2>
                <p className="text-[11px] text-slate-400">
                  Entre com seu e-mail e senha numérica de 8 dígitos
                </p>
              </div>
              <LogIn className="w-5 h-5 text-slate-400" />
            </div>

            <div className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-xs text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">E-mail</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="operador@bejucaramelos.com"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Senha (8 números)</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="\d{8}"
                      maxLength={8}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="•••••••• (8 dígitos)"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500 font-mono tracking-widest"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  <span>Entrar no Sistema</span>
                </button>
              </form>

              <p className="text-center pt-1 text-[11px] text-slate-500 font-medium">
                Não possui acesso? Solicite o cadastro ao administrador.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-5xl w-full mx-auto text-center text-[11px] text-slate-400">
        Beju Caramelos © {new Date().getFullYear()} • Gestão Operacional e Delivery
      </div>
    </div>
  );
};
