import React, { useState } from 'react';
import { 
  ShoppingBag, 
  ChefHat, 
  Boxes, 
  Truck, 
  CakeSlice, 
  Building2, 
  Settings,
  Users,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Receipt
} from 'lucide-react';

import { UserProfile } from '../types';
import { canAccessScreen } from '../utils/permissions';

export type ScreenId = 'pedidos' | 'producao' | 'estoque' | 'entregas' | 'financeiro' | 'clientes' | 'produtos' | 'lojas' | 'configuracoes' | 'painel';

interface SidebarProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  userRole?: UserProfile['role'];
  confirmedOrdersCount: number;
  itemsToProduceCount: number;
  lowStockCount: number;
  pendingDeliveriesCount: number;
  pendingFinancialCount?: number;
  pendingCustomersCount: number;
  activeProductsCount?: number;
  activeUnitsCount?: number;
  selectedDeliveriesCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  onNavigate,
  userRole = 'ADMIN',
  confirmedOrdersCount,
  itemsToProduceCount,
  lowStockCount,
  pendingDeliveriesCount,
  pendingFinancialCount = 0,
  pendingCustomersCount,
  activeProductsCount = 0,
  activeUnitsCount = 0,
  selectedDeliveriesCount = 0
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  );

  interface NavItem {
    id: ScreenId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeColor?: string;
    mobileOnly?: boolean;
    title?: string;
  }

  const navItems: NavItem[] = ([
    {
      id: 'pedidos' as ScreenId,
      label: 'Pedidos',
      icon: ShoppingBag,
      badge: confirmedOrdersCount,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200'
    },
    {
      id: 'producao' as ScreenId,
      label: 'Produção',
      icon: ChefHat,
      badge: itemsToProduceCount,
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200'
    },
    {
      id: 'estoque' as ScreenId,
      label: 'Estoque',
      icon: Boxes,
      badge: lowStockCount,
      badgeColor: lowStockCount > 0 ? 'bg-red-100 text-red-800 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200'
    },
    {
      id: 'entregas' as ScreenId,
      label: 'Entregas',
      icon: Truck,
      badge: pendingDeliveriesCount,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    },
    {
      id: 'clientes' as ScreenId,
      label: 'Clientes',
      icon: Users,
      badge: pendingCustomersCount,
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-200'
    },
    {
      id: 'produtos' as ScreenId,
      label: 'Produtos',
      icon: CakeSlice,
      badge: activeProductsCount,
      badgeColor: 'bg-pink-100 text-pink-800 border-pink-200'
    },
    {
      id: 'financeiro' as ScreenId,
      label: 'Financeiro',
      icon: Receipt,
      badge: pendingFinancialCount,
      badgeColor: pendingFinancialCount > 0 ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'
    },
    {
      id: 'lojas' as ScreenId,
      label: 'Unidades',
      icon: Building2,
      badge: activeUnitsCount,
      badgeColor: 'bg-sky-100 text-sky-800 border-sky-200'
    },
    {
      id: 'painel' as ScreenId,
      label: 'Painel',
      title: 'Indicadores & Ferramentas',
      icon: Wrench,
      badge: selectedDeliveriesCount > 0 ? selectedDeliveriesCount : undefined,
      badgeColor: 'bg-brand-100 text-brand-800 border-brand-200',
      mobileOnly: true
    },
    {
      id: 'configuracoes' as ScreenId,
      label: 'Configurações',
      icon: Settings
    }
  ] as NavItem[]).filter(item => canAccessScreen(userRole, item.id));

  return (
    <div
      className={`relative shrink-0 print:hidden ${
        isCollapsed ? 'w-11 sm:w-12' : 'w-11 sm:w-12 lg:w-36'
      } h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] transition-all duration-200`}
    >
      {!isCollapsed && (
        <div
          onClick={() => setIsCollapsed(true)}
          className="lg:hidden fixed inset-0 top-14 md:top-16 bg-slate-900/25 z-30"
          aria-hidden="true"
        />
      )}
      <aside
        className={`flex ${
          isCollapsed ? 'w-11 sm:w-12' : 'w-36 shadow-2xl lg:shadow-none'
        } bg-white border-r border-[#e2e8f0] flex-col justify-between h-full transition-all duration-200 absolute left-0 top-0 z-40 lg:relative`}
      >
      {/* Navigation Items */}
      <div className="px-1.5 py-2 space-y-1 overflow-y-auto">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-1 px-0.5'} py-1.5`}>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          {!isCollapsed && (
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#64748b]">
              MENU
            </span>
          )}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.id);
                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                  setIsCollapsed(true);
                }
              }}
              title={isCollapsed ? (item.title || item.label) : undefined}
              className={`${item.mobileOnly ? 'lg:hidden ' : ''}w-full flex items-center ${
                isCollapsed ? 'justify-center px-1' : 'justify-between gap-1 px-1.5'
              } py-2.5 rounded-lg text-xs font-medium transition-all relative ${
                isActive
                  ? 'bg-brand-50 text-brand-900 border border-brand-200/80 font-semibold shadow-xs'
                  : 'text-[#475569] hover:bg-[#f8f9ff] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-brand-600' : 'text-[#64748b]'
                  }`}
                />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </div>

              {!isCollapsed && item.badge !== undefined && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 leading-none rounded-full border ${item.badgeColor} font-semibold shrink-0`}
                >
                  {item.badge}
                </span>
              )}

              {isCollapsed && item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-brand-600"></span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Footer */}
      {!isCollapsed && (
        <div className="px-1.5 py-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono text-center truncate">
          Beju Caramelos v1.0
        </div>
      )}
    </aside>
    </div>
  );
};
