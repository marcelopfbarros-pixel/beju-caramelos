import { UserProfile } from '../types';
import { ScreenId } from '../components/Sidebar';

export type UserRole = UserProfile['role'];

const SCREEN_ACCESS: Record<UserRole, ScreenId[]> = {
  ADMIN: ['pedidos', 'producao', 'estoque', 'entregas', 'financeiro', 'clientes', 'produtos', 'lojas', 'configuracoes', 'painel'],
  GERENTE: ['pedidos', 'producao', 'estoque', 'entregas', 'financeiro', 'clientes', 'produtos', 'lojas', 'painel'],
  ATENDIMENTO: ['pedidos', 'producao', 'estoque', 'entregas', 'clientes', 'produtos', 'painel'],
  CONFEITEIRO: ['producao', 'estoque', 'produtos', 'painel'],
};

export function canAccessScreen(role: UserRole, screen: ScreenId): boolean {
  return (SCREEN_ACCESS[role] || SCREEN_ACCESS.ATENDIMENTO).includes(screen);
}

export function getDefaultScreenForRole(role: UserRole): ScreenId {
  return role === 'CONFEITEIRO' ? 'producao' : 'pedidos';
}

export function canEditProducts(role: UserRole): boolean {
  return role === 'ADMIN';
}

export function canEditProduction(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'CONFEITEIRO';
}

export function canEditStock(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'GERENTE' || role === 'CONFEITEIRO';
}

export function canManageUnits(role: UserRole): boolean {
  return role === 'ADMIN';
}

export function canOpenSettings(role: UserRole): boolean {
  return role === 'ADMIN';
}

export function canViewFinancials(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'GERENTE';
}

export function canEditRevenueGoals(role: UserRole): boolean {
  return role === 'ADMIN';
}
