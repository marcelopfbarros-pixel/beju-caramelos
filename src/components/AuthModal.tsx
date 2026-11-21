import React, { useState, useEffect } from 'react';
import { SupabaseService } from '../services/supabaseService';
import { UserProfile } from '../types';
import { 
  X, 
  Mail, 
  Lock, 
  User, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  LogIn, 
  LogOut,
  Users
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  users?: UserProfile[];
  onUpdateUserProfile: (profile: UserProfile) => void;
  onRegisterUser?: (user: UserProfile) => Promise<void> | void;
  supabaseUser: any;
  onSupabaseAuthChange: () => void;
  onLogout?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  users = [],
  onUpdateUserProfile,
  onRegisterUser,
  supabaseUser,
  onSupabaseAuthChange,
  onLogout
}) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isSwitchingUser, setIsSwitchingUser] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsSwitchingUser(false);
      setErrorMsg(null);
      setSuccessMsg(null);
      setPassword('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
    const matchedLocal = users.find(u => u.email.toLowerCase() === normalizedEmail);

    try {
      if (!isSignUp && matchedLocal) {
        if (matchedLocal.ativo === false) {
          setErrorMsg('Este usuário está desativado. Contate um administrador.');
          setLoading(false);
          return;
        }
        if (matchedLocal.senha) {
          if (matchedLocal.senha !== password) {
            setErrorMsg('Senha numérica de 8 dígitos incorreta.');
            setLoading(false);
            return;
          }
          onUpdateUserProfile({
            ...matchedLocal,
            autenticadoGoogle: false
          });
          onSupabaseAuthChange();
          onClose();
          setLoading(false);
          return;
        }
      }

      if (isSignUp) {
        const newUser: UserProfile = {
          id: `usr-${Date.now()}`,
          nome: nome.trim() || normalizedEmail.split('@')[0],
          email: normalizedEmail,
          avatarUrl: currentUser.avatarUrl,
          role: 'ATENDIMENTO',
          unidadePadraoId: currentUser.unidadePadraoId,
          autenticadoGoogle: false,
          ativo: true,
          unidadesPermitidas: currentUser.unidadesPermitidas || [],
          senha: password
        };
        if (onRegisterUser) {
          await onRegisterUser(newUser);
        }
        onUpdateUserProfile(newUser);
        onSupabaseAuthChange();
        setSuccessMsg('Operador cadastrado e conectado com sucesso!');
        onClose();
      } else {
        const { user } = await SupabaseService.signInWithPassword(normalizedEmail, password);
        if (user) {
          onUpdateUserProfile({
            ...currentUser,
            email: user.email || normalizedEmail,
            nome: user.user_metadata?.full_name || user.user_metadata?.name || normalizedEmail.split('@')[0],
            avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || currentUser.avatarUrl,
            autenticadoGoogle: user.app_metadata?.provider === 'google'
          });
          onSupabaseAuthChange();
          onClose();
        }
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

  const handleSignOut = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await SupabaseService.signOut();
    } catch (err: any) {
      console.error('Erro ao sair:', err);
    } finally {
      if (onLogout) await onLogout();
      setIsSwitchingUser(false);
      setEmail('');
      setPassword('');
      setSuccessMsg('Sessão encerrada com sucesso.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[92dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.jpg"
              alt="Beju Caramelos"
              className="w-8 h-8 rounded-full object-cover border border-slate-600"
            />
            <div>
              <h3 className="font-bold text-sm">Login</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {(supabaseUser || currentUser.email) && !isSwitchingUser ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                <img
                  src={supabaseUser?.user_metadata?.avatar_url || supabaseUser?.user_metadata?.picture || currentUser.avatarUrl || '/logo.jpg'}
                  alt={currentUser.nome}
                  className="w-10 h-10 rounded-full object-cover border border-emerald-300 shrink-0"
                />
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-emerald-950">
                    {supabaseUser ? 'Sessão BD Ativa' : 'Operador Conectado'}
                  </p>
                  <p className="text-[11px] text-emerald-800 truncate">{supabaseUser?.email || currentUser.email}</p>
                </div>
              </div>

              <div className="text-xs text-slate-600 space-y-1">
                <p><strong>Nome do Operador:</strong> {currentUser.nome}</p>
                <p><strong>Nível (Role):</strong> {currentUser.role}</p>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSwitchingUser(true);
                    setIsSignUp(false);
                    setEmail('');
                    setPassword('');
                    setErrorMsg(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors shadow-xs"
                >
                  <Users className="w-4 h-4" />
                  <span>Trocar de Usuário</span>
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold border border-red-200 transition-colors cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  <span>Encerrar Sessão</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {isSwitchingUser && (
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs">
                  <span className="font-semibold text-slate-700">Trocar de Usuário</span>
                  <button
                    type="button"
                    onClick={() => setIsSwitchingUser(false)}
                    className="text-brand-600 hover:underline font-semibold"
                  >
                    Voltar
                  </button>
                </div>
              )}
              {!isSignUp && users.filter(u => u.ativo !== false).length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Selecionar operador cadastrado
                  </label>
                  <select
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-brand-500"
                  >
                    <option value="">-- Escolha um usuário ou digite o e-mail --</option>
                    {users
                      .filter(u => u.ativo !== false)
                      .map(u => (
                        <option key={u.id || u.email} value={u.email}>
                          {u.nome} ({u.role}) — {u.email}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                  {successMsg}
                </div>
              )}

              {/* Email / Password Form */}
              <form onSubmit={handleEmailAuth} className="space-y-3">
                {isSignUp && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">Nome Completo</label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        required
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Ex: Marcelo Barros"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-brand-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">E-mail Corporativo</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="operador@bejucaramelos.com.br"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">Senha Numérica (8 dígitos)</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="•••••••• (8 números)"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono tracking-widest focus:bg-white focus:outline-brand-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>{isSignUp ? 'Criar Conta no BD' : 'Acessar Sistema'}</span>
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(null); }}
                  className="text-xs text-brand-700 hover:underline font-semibold"
                >
                  {isSignUp ? 'Já tem uma conta? Fazer login' : 'Novo operador? Criar cadastro'}
                </button>
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => { onLogout(); onClose(); }}
                    className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline font-semibold"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
