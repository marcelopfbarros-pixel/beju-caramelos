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
  ChevronRight
} from 'lucide-react';

import { UserProfile } from '../types';
import { canAccessScreen } from '../utils/permissions';

export type ScreenId = 'pedidos' | 'producao' | 'estoque' | 'entregas' | 'clientes' | 'produtos' | 'lojas' | 'configuracoes';

interface SidebarProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  userRole?: UserProfile['role'];
  pendingOrdersCount: number;
  itemsToProduceCount: number;
  lowStockCount: number;
  pendingDeliveriesCount: number;
  pendingCustomersCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  onNavigate,
  userRole = 'ADMIN',
  pendingOrdersCount,
  itemsToProduceCount,
  lowStockCount,
  pendingDeliveriesCount,
  pendingCustomersCount
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    {
      id: 'pedidos' as ScreenId,
      label: 'Pedidos',
      icon: ShoppingBag,
      badge: pendingOrdersCount,
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
      icon: CakeSlice
    },
    {
      id: 'lojas' as ScreenId,
      label: 'Unidades',
      icon: Building2
    },
    {
      id: 'configuracoes' as ScreenId,
      label: 'Configurações',
      icon: Settings
    }
  ].filter(item => canAccessScreen(userRole, item.id));

  return (
    <aside
      className={`hidden lg:flex ${
        isCollapsed ? 'w-16' : 'w-64'
      } bg-white border-r border-[#e2e8f0] flex-col justify-between shrink-0 h-[calc(100vh-4rem)] transition-all duration-200 relative print:hidden`}
    >
      {/* Navigation Items */}
      <div className="p-2.5 space-y-1 overflow-y-auto">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-2'} py-2`}>
          {!isCollapsed && (
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#64748b]">
              MENU
            </span>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
              } py-2.5 rounded-lg text-xs font-medium transition-all relative ${
                isActive
                  ? 'bg-brand-50 text-brand-900 border border-brand-200/80 font-semibold shadow-xs'
                  : 'text-[#475569] hover:bg-[#f8f9ff] hover:text-[#0f172a]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-brand-600' : 'text-[#64748b]'
                  }`}
                />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </div>

              {!isCollapsed && item.badge !== undefined && (
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${item.badgeColor} font-semibold`}
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
        <div className="p-3 border-t border-slate-100 text-[10px] text-slate-400 font-mono text-center">
          Beju Caramelos v1.0
        </div>
      )}
    </aside>
  );
};
