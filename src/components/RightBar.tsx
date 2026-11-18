import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Order, Product, Category, StoreUnit, StockItem, MonthlyRevenueGoals, ProductionShift } from '../types';
import { ScreenId } from './Sidebar';
import { ProgramacaoProducaoModal, toLocalDateKey } from './ProgramacaoProducaoModal';
import { TutorialOverlay } from './TutorialOverlay';
import { 
  TrendingUp, 
  Clock, 
  Truck, 
  AlertTriangle, 
  Copy, 
  Check, 
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Target,
  Settings
} from 'lucide-react';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer } from '../types';
import { MapPin, Navigation, Share2, FileDown, ExternalLink, X, ChevronDown, ChevronUp, Wrench, Search, Loader2, UserCheck, Send, ChefHat, HelpCircle } from 'lucide-react';
import {
  formatCep,
  lookupByCep,
  searchCepByAddress,
  extractStreetAndNumber,
  buildFormattedAddressFromCep,
  CepAddressResult
} from '../services/cepService';
import {
  computeFastestDeliveryRoute,
  OptimizedRouteResult
} from '../services/routeOptimizerService';
import {
  formatStatusNotificationMessage,
  dispatchWhatsAppMessage
} from '../services/whatsappAutomationService';

interface RightBarProps {
  orders: Order[];
  products: Product[];
  categories?: Category[];
  units: StoreUnit[];
  customers?: Customer[];
  onSaveCustomer?: (customer: Customer) => void;
  stock?: StockItem[];
  activeUnitId?: string;
  selectedOrder?: Order;
  selectedDeliveryIds?: string[];
  onChangeSelectedDeliveryIds?: (ids: string[]) => void;
  lowStockCount: number;
  revenueGoals?: MonthlyRevenueGoals;
  currentScreen?: ScreenId;
  onNavigate?: (screen: ScreenId) => void;
  isMobileDrawer?: boolean;
  onCloseMobileDrawer?: () => void;
  focusRoteiroSignal?: number;
}

export const RightBar: React.FC<RightBarProps> = ({
  orders,
  products,
  categories = [],
  units,
  customers = [],
  onSaveCustomer,
  stock = [],
  activeUnitId = 'all',
  selectedOrder,
  selectedDeliveryIds = [],
  onChangeSelectedDeliveryIds,
  lowStockCount,
  revenueGoals = {},
  currentScreen = 'pedidos',
  onNavigate,
  isMobileDrawer = false,
  onCloseMobileDrawer,
  focusRoteiroSignal = 0
}) => {
  const [copied, setCopied] = useState(false);
  const [waPreviewMode, setWaPreviewMode] = useState<'RESUMO' | 'STATUS'>('RESUMO');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [goalScope, setGoalScope] = useState<'MENSAL' | 'ANUAL'>('MENSAL');
  const [activeTab, setActiveTab] = useState<'INDICADORES' | 'FERRAMENTAS'>(() =>
    focusRoteiroSignal > 0 ? 'FERRAMENTAS' : 'INDICADORES'
  );
  const [expandedTool, setExpandedTool] = useState<'WHATSAPP' | 'ROTEIRIZADOR' | 'BUSCA_CEP' | 'PLANEJAMENTO_PRODUCAO' | 'TUTORIAL'>(() =>
    focusRoteiroSignal > 0 ? 'ROTEIRIZADOR' : 'WHATSAPP'
  );
  const [isProgramacaoModalOpen, setIsProgramacaoModalOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [progStartDate, setProgStartDate] = useState<string>(() => toLocalDateKey(new Date().toISOString()));
  const [progEndDate, setProgEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toLocalDateKey(d.toISOString());
  });
  const [progSelectedShifts, setProgSelectedShifts] = useState<ProductionShift[]>(['MANHA', 'TARDE', 'NOITE']);

  useEffect(() => {
    if (focusRoteiroSignal > 0) {
      setIsCollapsed(false);
      setActiveTab('FERRAMENTAS');
      setExpandedTool('ROTEIRIZADOR');
    }
  }, [focusRoteiroSignal]);

  // Dynamic Computations (filtered by activeUnitId when a specific unit is selected)
  const scopedOrders = activeUnitId === 'all'
    ? orders
    : orders.filter(
        o => o.unidadeOrigemId === activeUnitId || o.unidadeRetiradaId === activeUnitId
      );

  const validOrders = scopedOrders.filter(o => o.status !== 'CANCELADO');
  const totalRevenue = validOrders.reduce((acc, o) => acc + o.valorTotal, 0);
  const avgTicket = validOrders.length > 0 ? totalRevenue / validOrders.length : 0;
  const pendingOrders = scopedOrders.filter(o => o.status === 'PENDENTE').length;
  const activeOrders = scopedOrders.filter(o => o.status !== 'ENTREGUE' && o.status !== 'CANCELADO').length;

  const pendingDeliveries = scopedOrders.filter(
    o => o.tipoEntrega === 'DELIVERY' && o.status !== 'ENTREGUE' && o.status !== 'CANCELADO'
  );
  const deliveriesToday = pendingDeliveries.length;
  const inRouteCount = pendingDeliveries.filter(o => o.status === 'EM_ROTA').length;

  const scopedLowStockCount = stock.length > 0
    ? stock.filter(
        s => (activeUnitId === 'all' || s.unidadeId === activeUnitId) && s.quantidadeAtual <= s.quantidadeMinima
      ).length
    : lowStockCount;

  const goalAnalytics = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthLabel = now.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayOfMonth = now.getDate();

    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);
    const totalDaysInYear = Math.round((endOfYear.getTime() - startOfYear.getTime()) / 86400000);
    const dayOfYear = Math.max(1, Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1);

    let monthRealized = 0;
    let yearRealized = 0;
    validOrders.forEach(o => {
      const d = new Date(o.dataHoraEntrega || o.dataPedido);
      if (d.getFullYear() === year) {
        yearRealized += o.valorTotal;
        if (d.getMonth() === month) {
          monthRealized += o.valorTotal;
        }
      }
    });

    const monthGoal = Number(revenueGoals[monthKey]) || 0;
    let yearGoal = 0;
    for (let m = 1; m <= 12; m++) {
      yearGoal += Number(revenueGoals[`${year}-${String(m).padStart(2, '0')}`]) || 0;
    }

    const isMonthly = goalScope === 'MENSAL';
    const realized = isMonthly ? monthRealized : yearRealized;
    const goal = isMonthly ? monthGoal : yearGoal;
    const elapsedDays = isMonthly ? dayOfMonth : dayOfYear;
    const totalDays = isMonthly ? daysInMonth : totalDaysInYear;
    const remainingDays = Math.max(0, totalDays - elapsedDays);

    const actualPct = goal > 0 ? (realized / goal) * 100 : 0;
    const expectedPct = (elapsedDays / totalDays) * 100;
    const paceDelta = actualPct - expectedPct;

    const dailyRunRate = elapsedDays > 0 ? realized / elapsedDays : 0;
    const projectedTotal = dailyRunRate * totalDays;
    const remainingGap = Math.max(0, goal - realized);
    const requiredDaily = remainingDays > 0 ? remainingGap / remainingDays : remainingGap;

    let statusLabel = 'Sem meta';
    let statusTone: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' = 'slate';
    if (goal > 0) {
      if (actualPct >= 100) {
        statusLabel = 'Meta batida!';
        statusTone = 'emerald';
      } else if (paceDelta >= 2) {
        statusLabel = 'Acima do ritmo';
        statusTone = 'emerald';
      } else if (paceDelta >= -8) {
        statusLabel = 'No ritmo';
        statusTone = 'blue';
      } else if (paceDelta >= -20) {
        statusLabel = 'Atenção ao ritmo';
        statusTone = 'amber';
      } else {
        statusLabel = 'Abaixo do ritmo';
        statusTone = 'rose';
      }
    }

    return {
      periodLabel: isMonthly ? monthLabel : String(year),
      realized,
      goal,
      actualPct,
      expectedPct,
      projectedTotal,
      remainingGap,
      requiredDaily,
      remainingDays,
      dailyRunRate,
      statusLabel,
      statusTone
    };
  }, [validOrders, revenueGoals, goalScope]);

  const targetOrder = selectedOrder || orders[0];
  const prodMap = new Map(products.map(p => [p.id, p]));
  const unit = units.find(u => u.id === targetOrder?.unidadeOrigemId) || units[0];

  const generateWhatsAppText = (order?: Order): string => {
    if (!order) return 'Nenhum pedido selecionado.';

    const itensList = order.itens
      .map(i => {
        const prod = prodMap.get(i.produtoId);
        return `• ${i.quantidade}x ${prod?.descricao || 'Produto'} (R$ ${i.subtotal.toFixed(2)})`;
      })
      .join('\n');

    const paymentLabel = {
      pix: 'PIX',
      debito: 'Cartão de Débito',
      credito: 'Cartão de Crédito',
      dinheiro: 'Dinheiro'
    }[order.formaPagamento];

    return `🍰 *Beju Caramelos*
Olá, *${order.clienteNome}*! Confirmamos o seu pedido:

*Pedido:* ${order.numeroPedido}
*Data/Horário:* ${new Date(order.dataHoraEntrega).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
*Modalidade:* ${order.tipoEntrega === 'DELIVERY' ? `Entrega (${order.enderecoEntrega || 'Endereço informado'})` : `Retirada no Balcão (${unit?.nome || 'Loja'})`}

*Itens Solicitados:*
${itensList}

*Subtotal:* R$ ${order.valorSubtotal.toFixed(2)}
*Taxa de Entrega:* R$ ${order.taxaEntrega.toFixed(2)}
${order.desconto > 0 ? `*Desconto:* -R$ ${order.desconto.toFixed(2)}\n` : ''}*TOTAL A PAGAR:* R$ ${order.valorTotal.toFixed(2)}

*Forma de Pagamento:* ${paymentLabel}${order.trocoPara ? ` (Troco para R$ ${order.trocoPara.toFixed(2)})` : ''}
${order.formaPagamento === 'pix' ? `*Chave PIX:* ${unit?.chavePix || 'financeiro@bejucaramelos.com.br'}\n_Favor enviar o comprovante por aqui para finalizarmos o preparo!_` : ''}
${order.observacoes ? `\n*Obs:* ${order.observacoes}` : ''}
Obrigado por escolher a Beju Caramelos! ✨`;
  };

  const whatsappMessage =
    targetOrder && waPreviewMode === 'STATUS'
      ? formatStatusNotificationMessage(targetOrder, targetOrder.status, products, units)
      : generateWhatsAppText(targetOrder);

  const handleCopy = () => {
    navigator.clipboard.writeText(whatsappMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (isCollapsed && !isMobileDrawer) {
    return (
      <aside className="hidden lg:flex w-12 bg-white border-l border-[#e2e8f0] flex-col items-center py-3 gap-4 shrink-0 h-[calc(100vh-4rem)] transition-all duration-200 print:hidden">
        <button
          onClick={() => setIsCollapsed(false)}
          title="Expandir Painel Lateral"
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <button
            type="button"
            onClick={() => {
              setActiveTab('INDICADORES');
              setIsCollapsed(false);
            }}
            title="Aba Indicadores"
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <TrendingUp className="w-4 h-4 text-brand-600" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('FERRAMENTAS');
              setIsCollapsed(false);
            }}
            title="Aba Ferramentas"
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Wrench className="w-4 h-4 text-emerald-600" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={
        isMobileDrawer
          ? 'w-full h-full bg-white flex flex-col justify-between overflow-y-auto print:hidden'
          : 'hidden lg:flex w-80 bg-white border-l border-[#e2e8f0] flex-col justify-between shrink-0 h-[calc(100vh-4rem)] overflow-y-auto transition-all duration-200 print:hidden'
      }
    >
      <div className="p-4 space-y-4">
        {/* Top Header with Tabs: Indicadores | Ferramentas */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <div className="grid grid-cols-2 flex-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('INDICADORES')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'INDICADORES'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <TrendingUp className={`w-3.5 h-3.5 ${activeTab === 'INDICADORES' ? 'text-brand-600' : 'text-slate-400'}`} />
              <span>Indicadores</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('FERRAMENTAS')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'FERRAMENTAS'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Wrench className={`w-3.5 h-3.5 ${activeTab === 'FERRAMENTAS' ? 'text-brand-600' : 'text-slate-400'}`} />
              <span>Ferramentas</span>
              {selectedDeliveryIds.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-brand-600 text-white">
                  {selectedDeliveryIds.length}
                </span>
              )}
            </button>
          </div>

          {isMobileDrawer ? (
            <button
              onClick={onCloseMobileDrawer}
              title="Fechar Painel"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setIsCollapsed(true)}
              title="Recolher Painel Lateral"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ABA 1: INDICADORES */}
        {activeTab === 'INDICADORES' && (
          <div>
            <div className="grid grid-cols-2 gap-2">
            {/* KPI 1: Faturamento */}
            <button
              type="button"
              onClick={() => onNavigate?.('relatorios')}
              className="text-left bg-[#f8f9ff] hover:bg-indigo-50/70 border border-slate-200/90 rounded-lg p-2 transition-colors cursor-pointer"
              title="Ver relatórios financeiros"
            >
              <span className="text-[9px] font-medium text-slate-500 uppercase block leading-tight">Faturamento</span>
              <div className="text-xs font-bold font-mono text-slate-900 mt-0.5 leading-tight">
                R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[9px] text-emerald-600 font-semibold mt-0.5 block leading-tight">
                {validOrders.length} ped. • TM R$ {avgTicket.toFixed(0)}
              </span>
            </button>

            {/* KPI 2: Pedidos Pendentes */}
            <button
              type="button"
              onClick={() => onNavigate?.('pedidos')}
              className="text-left bg-amber-50/60 hover:bg-amber-100/70 border border-amber-200/80 rounded-lg p-2 transition-colors cursor-pointer"
              title="Ir para Gestão de Pedidos"
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-medium text-amber-800 uppercase leading-tight">Pendentes</span>
                <Clock className="w-2.5 h-2.5 text-amber-600" />
              </div>
              <div className="text-xs font-bold font-mono text-amber-900 mt-0.5 leading-tight">
                {pendingOrders}
              </div>
              <span className="text-[9px] text-amber-700 font-medium block leading-tight mt-0.5">
                {activeOrders} em aberto
              </span>
            </button>

            {/* KPI 3: Entregas Agendadas */}
            <button
              type="button"
              onClick={() => onNavigate?.('entregas')}
              className="text-left bg-blue-50/60 hover:bg-blue-100/70 border border-blue-200/80 rounded-lg p-2 transition-colors cursor-pointer"
              title="Ir para Entregas & Expedição"
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-medium text-blue-800 uppercase leading-tight">Entregas</span>
                <Truck className="w-2.5 h-2.5 text-blue-600" />
              </div>
              <div className="text-xs font-bold font-mono text-blue-900 mt-0.5 leading-tight">
                {deliveriesToday}
              </div>
              <span className="text-[9px] text-blue-700 font-medium block leading-tight mt-0.5">
                {inRouteCount > 0 ? `${inRouteCount} em rota` : 'Na fila'}
              </span>
            </button>

            {/* KPI 4: Alerta de Estoque Mínimo */}
            <button
              type="button"
              onClick={() => onNavigate?.('estoque')}
              className={`text-left border rounded-lg p-2 transition-colors cursor-pointer ${
                scopedLowStockCount > 0
                  ? 'bg-rose-50/70 hover:bg-rose-100/70 border-rose-200/80'
                  : 'bg-emerald-50/60 hover:bg-emerald-100/70 border-emerald-200/80'
              }`}
              title="Ir para Controle de Estoque"
            >
              <div className="flex items-center justify-between">
                <span className={`text-[9px] font-medium uppercase leading-tight ${
                  scopedLowStockCount > 0 ? 'text-rose-800' : 'text-emerald-800'
                }`}>Estoque Mín.</span>
                <AlertTriangle className={`w-2.5 h-2.5 ${scopedLowStockCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`} />
              </div>
              <div className={`text-xs font-bold font-mono mt-0.5 leading-tight ${
                scopedLowStockCount > 0 ? 'text-rose-900' : 'text-emerald-900'
              }`}>
                {scopedLowStockCount}
              </div>
              <span className={`text-[9px] font-medium block leading-tight mt-0.5 ${
                scopedLowStockCount > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}>
                {scopedLowStockCount > 0 ? 'Crítico' : 'Normal'}
              </span>
            </button>
          </div>

          {/* Intelligent Revenue Goal Tracking Card */}
          <div className="mt-3 rounded-xl border border-slate-200 bg-gradient-to-br from-[#f8f9ff] to-white p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-brand-600" />
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                  Meta {goalAnalytics.periodLabel}
                </span>
              </div>

              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setGoalScope('MENSAL')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                    goalScope === 'MENSAL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Mensal
                </button>
                <button
                  type="button"
                  onClick={() => setGoalScope('ANUAL')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                    goalScope === 'ANUAL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Anual
                </button>
              </div>
            </div>

            {goalAnalytics.goal <= 0 ? (
              <div className="py-2 text-center space-y-2">
                <p className="text-[11px] text-slate-500">
                  Nenhuma meta definida para {goalAnalytics.periodLabel}.
                </p>
                {!isMobileDrawer && (
                  <button
                    type="button"
                    onClick={() => onNavigate?.('configuracoes')}
                    className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[11px] font-bold transition-colors"
                  >
                    <Settings className="w-3 h-3" />
                    <span>Cadastrar Meta</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-sm font-mono font-bold text-slate-900">
                      R$ {goalAnalytics.realized.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      de R$ {goalAnalytics.goal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                      goalAnalytics.statusTone === 'emerald'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : goalAnalytics.statusTone === 'blue'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : goalAnalytics.statusTone === 'amber'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {goalAnalytics.statusLabel}
                  </span>
                </div>

                {/* Progress Bar with Expected Pace Marker */}
                <div className="space-y-1">
                  <div className="relative h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/70">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        goalAnalytics.statusTone === 'emerald'
                          ? 'bg-emerald-500'
                          : goalAnalytics.statusTone === 'blue'
                          ? 'bg-brand-600'
                          : goalAnalytics.statusTone === 'amber'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(100, goalAnalytics.actualPct)}%` }}
                    />
                    {/* Expected Pace Marker */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-slate-900/70"
                      style={{ left: `${Math.min(99, goalAnalytics.expectedPct)}%` }}
                      title={`Ritmo esperado hoje: ${goalAnalytics.expectedPct.toFixed(0)}%`}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>
                      Real: <strong className="text-slate-800">{goalAnalytics.actualPct.toFixed(1)}%</strong>
                    </span>
                    <span>
                      Esperado hoje: <strong className="text-slate-700">{goalAnalytics.expectedPct.toFixed(0)}%</strong>
                    </span>
                  </div>
                </div>

                {/* Smart Forecast & Daily Required */}
                <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100 text-[10px]">
                  <div className="bg-slate-50 rounded-lg p-2 border border-slate-200/60">
                    <span className="text-slate-500 block font-medium">Projeção</span>
                    <span className={`font-mono font-bold ${
                      goalAnalytics.projectedTotal >= goalAnalytics.goal ? 'text-emerald-700' : 'text-amber-700'
                    }`}>
                      R$ {goalAnalytics.projectedTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 border border-slate-200/60">
                    {goalAnalytics.remainingGap <= 0 ? (
                      <>
                        <span className="text-emerald-700 block font-medium">Superávit</span>
                        <span className="font-mono font-bold text-emerald-700">
                          +R$ {(goalAnalytics.realized - goalAnalytics.goal).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-500 block font-medium">
                          Necessário/dia ({goalAnalytics.remainingDays}d)
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          R$ {goalAnalytics.requiredDaily.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/dia
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {/* ABA 2: FERRAMENTAS (Accordion - only one expanded at a time, default WHATSAPP) */}
        {activeTab === 'FERRAMENTAS' && (
          <div className="space-y-3">
            {/* Card 1: Resumo do WhatsApp */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-2xs overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExpandedTool(prev => (prev === 'WHATSAPP' ? 'ROTEIRIZADOR' : 'WHATSAPP'))
                }
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900">Resumo do WhatsApp</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {targetOrder && (
                    <span className="text-[10px] font-mono bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-semibold">
                      {targetOrder.numeroPedido}
                    </span>
                  )}
                  {expandedTool === 'WHATSAPP' ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </div>
              </button>

              {expandedTool === 'WHATSAPP' && (
                <div className="p-3 border-t border-[#e2e8f0] space-y-2.5">
                  <div className="grid grid-cols-2 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setWaPreviewMode('RESUMO')}
                      className={`py-1 px-2 rounded-md font-bold transition-all cursor-pointer ${
                        waPreviewMode === 'RESUMO'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Resumo Completo
                    </button>
                    <button
                      type="button"
                      onClick={() => setWaPreviewMode('STATUS')}
                      className={`py-1 px-2 rounded-md font-bold transition-all cursor-pointer truncate ${
                        waPreviewMode === 'STATUS'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Status ({targetOrder?.status || 'PENDENTE'})
                    </button>
                  </div>

                  <div className="bg-[#f8f9ff] border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto shadow-inner select-text">
                    {whatsappMessage}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[11px] font-bold transition-all shadow-2xs cursor-pointer ${
                        copied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-brand-600 hover:bg-brand-700 text-white'
                      }`}
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Texto</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={!targetOrder}
                      onClick={() => {
                        if (!targetOrder) return;
                        dispatchWhatsAppMessage(targetOrder.clienteTelefone, whatsappMessage);
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white transition-all shadow-2xs cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar WhatsApp</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Card 2: Roteirizador Google Maps & PDF */}
            <RoutePlannerTool
              orders={orders}
              products={products}
              units={units}
              customers={customers}
              activeUnitId={activeUnitId}
              selectedDeliveryIds={selectedDeliveryIds}
              onChangeSelectedDeliveryIds={onChangeSelectedDeliveryIds}
              onNavigate={onNavigate}
              isExpanded={expandedTool === 'ROTEIRIZADOR'}
              onToggleExpand={() =>
                setExpandedTool(prev => (prev === 'ROTEIRIZADOR' ? 'WHATSAPP' : 'ROTEIRIZADOR'))
              }
            />

            {/* Card 3: Buscador de CEP & Endereço */}
            <CepFinderTool
              customers={customers}
              onSaveCustomer={onSaveCustomer}
              isExpanded={expandedTool === 'BUSCA_CEP'}
              onToggleExpand={() =>
                setExpandedTool(prev => (prev === 'BUSCA_CEP' ? 'WHATSAPP' : 'BUSCA_CEP'))
              }
            />

            {/* Card 4: Planejamento de Produção (Tabela Dinâmica) */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExpandedTool(prev =>
                    prev === 'PLANEJAMENTO_PRODUCAO' ? 'WHATSAPP' : 'PLANEJAMENTO_PRODUCAO'
                  )
                }
                className="w-full px-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChefHat className="w-4 h-4 text-brand-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900 truncate">
                    Planejamento de Produção
                  </span>
                </div>
                {expandedTool === 'PLANEJAMENTO_PRODUCAO' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {expandedTool === 'PLANEJAMENTO_PRODUCAO' && (
                <div className="p-3.5 space-y-2.5 border-t border-slate-100 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">De:</label>
                      <input
                        type="date"
                        value={progStartDate}
                        onChange={(e) => setProgStartDate(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Até:</label>
                      <input
                        type="date"
                        value={progEndDate}
                        onChange={(e) => setProgEndDate(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-800"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Data/Turno:</label>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setProgSelectedShifts(['MANHA', 'TARDE', 'NOITE'])}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors cursor-pointer ${
                          progSelectedShifts.length === 3
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Todos
                      </button>
                      {([
                        { id: 'MANHA', label: 'Manhã' },
                        { id: 'TARDE', label: 'Tarde' },
                        { id: 'NOITE', label: 'Noite' },
                      ] as const).map(sh => {
                        const active = progSelectedShifts.includes(sh.id);
                        return (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() =>
                              setProgSelectedShifts(prev => {
                                if (prev.includes(sh.id)) {
                                  return prev.length > 1 ? prev.filter(s => s !== sh.id) : prev;
                                }
                                return [...prev, sh.id];
                              })
                            }
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors cursor-pointer ${
                              active && progSelectedShifts.length < 3
                                ? 'bg-brand-600 text-white border-brand-600'
                                : active
                                ? 'bg-brand-50 text-brand-700 border-brand-200'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {sh.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsProgramacaoModalOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    <ChefHat className="w-3.5 h-3.5" />
                    <span>Abrir Programação de Produção</span>
                  </button>
                </div>
              )}
            </div>

            {/* Card 5: Tutorial Interativo da Tela Atual */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExpandedTool(prev => (prev === 'TUTORIAL' ? 'WHATSAPP' : 'TUTORIAL'))
                }
                className="w-full px-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <HelpCircle className="w-4 h-4 text-brand-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900 truncate">
                    Tutorial da Tela
                  </span>
                </div>
                {expandedTool === 'TUTORIAL' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {expandedTool === 'TUTORIAL' && (
                <div className="p-3.5 space-y-2.5 border-t border-slate-100 text-xs">
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Veja o passo a passo guiado dos recursos da tela aberta no momento.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (isMobileDrawer && onCloseMobileDrawer) {
                        onCloseMobileDrawer();
                      }
                      setIsTutorialOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Iniciar Tutorial</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ProgramacaoProducaoModal
        isOpen={isProgramacaoModalOpen}
        onClose={() => setIsProgramacaoModalOpen(false)}
        orders={orders}
        products={products}
        categories={categories}
        units={units}
        activeUnitId={activeUnitId}
        startDate={progStartDate}
        endDate={progEndDate}
        selectedShifts={progSelectedShifts}
        onChangeStartDate={setProgStartDate}
        onChangeEndDate={setProgEndDate}
        onChangeSelectedShifts={setProgSelectedShifts}
      />

      <TutorialOverlay
        isOpen={isTutorialOpen}
        currentScreen={currentScreen}
        onClose={() => setIsTutorialOpen(false)}
      />
    </aside>
  );
};

interface CepFinderToolProps {
  customers: Customer[];
  onSaveCustomer?: (customer: Customer) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const CepFinderTool: React.FC<CepFinderToolProps> = ({
  customers,
  onSaveCustomer,
  isExpanded,
  onToggleExpand
}) => {
  const [searchMode, setSearchMode] = useState<'POR_ENDERECO' | 'POR_CEP'>('POR_ENDERECO');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cepInput, setCepInput] = useState<string>('');
  const [ufInput, setUfInput] = useState<string>('BA');
  const [cityInput, setCityInput] = useState<string>('Salvador');
  const [streetInput, setStreetInput] = useState<string>('');
  const [numberInput, setNumberInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [results, setResults] = useState<CepAddressResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<CepAddressResult | null>(null);
  const [copiedAddr, setCopiedAddr] = useState<boolean>(false);
  const [savedCustomerSuccess, setSavedCustomerSuccess] = useState<boolean>(false);

  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setSavedCustomerSuccess(false);
    const cust = customers.find(c => c.id === customerId);
    if (!cust) return;

    if (cust.cep) {
      setCepInput(formatCep(cust.cep));
    }
    const { street, numberPart } = extractStreetAndNumber(cust.endereco || '');
    if (street) setStreetInput(street);
    if (numberPart) setNumberInput(numberPart);
  };

  const handleSearch = async () => {
    setStatusMessage(null);
    setSavedCustomerSuccess(false);

    if (searchMode === 'POR_CEP') {
      const digits = cepInput.replace(/\D/g, '');
      if (digits.length !== 8) {
        setStatusMessage('Informe um CEP válido com 8 dígitos.');
        return;
      }
      setLoading(true);
      const res = await lookupByCep(digits);
      setLoading(false);
      if (!res) {
        setResults([]);
        setSelectedResult(null);
        setStatusMessage('CEP não encontrado na base dos Correios.');
        return;
      }
      setResults([res]);
      setSelectedResult(res);
      setCityInput(res.localidade || cityInput);
      setUfInput(res.uf || ufInput);
      setStreetInput(res.logradouro || streetInput);
    } else {
      if (streetInput.trim().length < 3) {
        setStatusMessage('Digite pelo menos 3 letras da rua ou avenida.');
        return;
      }
      setLoading(true);
      const list = await searchCepByAddress(ufInput, cityInput, streetInput);
      setLoading(false);
      if (list.length === 0) {
        setResults([]);
        setSelectedResult(null);
        setStatusMessage('Nenhum CEP localizado para este endereço.');
        return;
      }
      setResults(list);
      setSelectedResult(list[0]);
      setCepInput(list[0].cep);
    }
  };

  const finalFormattedAddress = useMemo(() => {
    if (!selectedResult) return '';
    return buildFormattedAddressFromCep({
      logradouro: selectedResult.logradouro,
      bairro: selectedResult.bairro,
      localidade: selectedResult.localidade,
      uf: selectedResult.uf,
      existingNumberOrComplement: numberInput
    });
  }, [selectedResult, numberInput]);

  const handleCopyFoundAddress = () => {
    if (!selectedResult) return;
    const text = `${finalFormattedAddress} - CEP: ${selectedResult.cep}`;
    navigator.clipboard.writeText(text);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const handleApplyToCustomer = () => {
    if (!selectedCustomer || !selectedResult || !onSaveCustomer) return;
    onSaveCustomer({
      ...selectedCustomer,
      cep: selectedResult.cep,
      endereco: finalFormattedAddress || selectedCustomer.endereco
    });
    setSavedCustomerSuccess(true);
    setTimeout(() => setSavedCustomerSuccess(false), 2500);
  };

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-2xs overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-xs font-bold text-slate-900">Buscador de CEP</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
            ViaCEP
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-3 border-t border-[#e2e8f0] space-y-2.5 text-xs">
          {/* Mode Toggle */}
          <div className="grid grid-cols-2 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setSearchMode('POR_ENDERECO');
                setStatusMessage(null);
              }}
              className={`py-1 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                searchMode === 'POR_ENDERECO'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Por Endereço
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchMode('POR_CEP');
                setStatusMessage(null);
              }}
              className={`py-1 px-2 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                searchMode === 'POR_CEP'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Por CEP
            </button>
          </div>

          {/* Optional Client Selector to auto-fill or update client address */}
          {customers.length > 0 && (
            <div>
              <label className="text-[10px] font-mono font-bold uppercase text-slate-500 block mb-1">
                Vincular a Cliente (Opcional):
              </label>
              <select
                value={selectedCustomerId}
                onChange={e => handleSelectCustomer(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-800 focus:outline-none focus:border-brand-500"
              >
                <option value="">— Selecionar cliente para corrigir endereço —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nome} {c.cep ? `(${c.cep})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {searchMode === 'POR_CEP' ? (
            <div className="grid grid-cols-3 gap-1.5">
              <div className="col-span-2">
                <label className="text-[10px] font-mono font-bold uppercase text-slate-500 block mb-0.5">
                  CEP (8 dígitos)
                </label>
                <input
                  type="text"
                  maxLength={9}
                  placeholder="40000-000"
                  value={cepInput}
                  onChange={e => setCepInput(formatCep(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono font-bold uppercase text-slate-500 block mb-0.5">
                  Número
                </label>
                <input
                  type="text"
                  placeholder="Ex: 120"
                  value={numberInput}
                  onChange={e => setNumberInput(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="text-[10px] font-mono font-bold uppercase text-slate-500 block mb-0.5">
                    UF
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={ufInput}
                    onChange={e => setUfInput(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-xs uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-mono font-bold uppercase text-slate-500 block mb-0.5">
                    Cidade
                  </label>
                  <input
                    type="text"
                    value={cityInput}
                    onChange={e => setCityInput(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <div className="col-span-2">
                  <label className="text-[10px] font-mono font-bold uppercase text-slate-500 block mb-0.5">
                    Rua / Avenida
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Waldemar Falcão"
                    value={streetInput}
                    onChange={e => setStreetInput(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono font-bold uppercase text-slate-500 block mb-0.5">
                    Número
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 781"
                    value={numberInput}
                    onChange={e => setNumberInput(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={handleSearch}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            <span>{searchMode === 'POR_CEP' ? 'Consultar CEP' : 'Descobrir CEP e Endereço'}</span>
          </button>

          {statusMessage && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              {statusMessage}
            </p>
          )}

          {results.length > 1 && (
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase text-slate-500 block">
                {results.length} trechos encontrados (clique p/ selecionar):
              </span>
              <div className="max-h-28 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50">
                {results.map((r, i) => (
                  <button
                    key={`${r.cep}-${i}`}
                    type="button"
                    onClick={() => {
                      setSelectedResult(r);
                      setCepInput(r.cep);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2 transition-colors ${
                      selectedResult?.cep === r.cep
                        ? 'bg-indigo-50 text-indigo-950 font-semibold'
                        : 'hover:bg-white text-slate-700'
                    }`}
                  >
                    <div className="truncate">
                      <span>{r.logradouro}</span>
                      {r.complemento && <span className="text-slate-500"> ({r.complemento})</span>}
                      <span className="block text-[10px] text-slate-500">{r.bairro}</span>
                    </div>
                    <span className="font-mono font-bold text-indigo-700 shrink-0">{r.cep}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedResult && (
            <div className="bg-[#f8f9ff] border border-indigo-200 rounded-xl p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase text-indigo-700">
                  Endereço Oficial Localizado
                </span>
                <span className="text-xs font-mono font-bold bg-indigo-600 text-white px-2 py-0.5 rounded">
                  CEP {selectedResult.cep}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-900 leading-snug">
                {finalFormattedAddress}
              </p>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleCopyFoundAddress}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    copiedAddr
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  {copiedAddr ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedAddr ? 'Copiado!' : 'Copiar Endereço'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${finalFormattedAddress}, ${selectedResult.cep}, Brasil`
                      )}`,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-brand-600" />
                  <span>Ver no Maps</span>
                </button>
              </div>

              {selectedCustomer && onSaveCustomer && (
                <button
                  type="button"
                  onClick={handleApplyToCustomer}
                  className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    savedCustomerSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-brand-600 hover:bg-brand-700 text-white'
                  }`}
                >
                  {savedCustomerSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Endereço de {selectedCustomer.nome} atualizado!</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Salvar em {selectedCustomer.nome}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface RoutePlannerToolProps {
  orders: Order[];
  products: Product[];
  units: StoreUnit[];
  customers: Customer[];
  activeUnitId?: string;
  selectedDeliveryIds: string[];
  onChangeSelectedDeliveryIds?: (ids: string[]) => void;
  onNavigate?: (screen: ScreenId) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const RoutePlannerTool: React.FC<RoutePlannerToolProps> = ({
  orders,
  products,
  units,
  customers,
  activeUnitId = 'all',
  selectedDeliveryIds,
  onChangeSelectedDeliveryIds,
  onNavigate,
  isExpanded,
  onToggleExpand
}) => {
  const [customOriginUnitId, setCustomOriginUnitId] = useState<string>('');
  const [routeLinkCopied, setRouteLinkCopied] = useState(false);
  const [isMapWindowOpen, setIsMapWindowOpen] = useState(false);
  const [isOptimizingRoute, setIsOptimizingRoute] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRouteResult | null>(null);

  const pendingDeliveries = useMemo(
    () =>
      orders.filter(
        o =>
          o.tipoEntrega === 'DELIVERY' &&
          o.status === 'PRONTO'
      ),
    [orders]
  );

  const rawSelectedDeliveries = useMemo(
    () => orders.filter(o => selectedDeliveryIds.includes(o.id)),
    [orders, selectedDeliveryIds]
  );

  const originUnit = useMemo(() => {
    if (customOriginUnitId) {
      const found = units.find(u => u.id === customOriginUnitId);
      if (found) return found;
    }
    if (activeUnitId && activeUnitId !== 'all') {
      const found = units.find(u => u.id === activeUnitId);
      if (found) return found;
    }
    if (rawSelectedDeliveries.length > 0) {
      const firstUnit = units.find(u => u.id === rawSelectedDeliveries[0].unidadeOrigemId);
      if (firstUnit) return firstUnit;
    }
    return units[0];
  }, [customOriginUnitId, activeUnitId, rawSelectedDeliveries, units]);

  const resolveUnitCityState = (unit?: StoreUnit, rawAddr = ''): { city: string; state: string } => {
    const phoneDigits = (unit?.telefone || '').replace(/\D/g, '');
    const lowerAddr = rawAddr.toLowerCase();
    const lowerCity = (unit?.cidade || '').trim().toLowerCase();

    const isBahiaPhone =
      phoneDigits.startsWith('5571') ||
      (phoneDigits.length >= 10 && phoneDigits.slice(0, 2) === '71');

    const isSalvadorHint =
      isBahiaPhone ||
      lowerCity === 'salvador' ||
      lowerAddr.includes('salvador') ||
      lowerAddr.includes('horto florestal') ||
      lowerAddr.includes('barro vermelho') ||
      lowerAddr.includes('shopping paralela') ||
      lowerAddr.includes('luís viana') ||
      lowerAddr.includes('luis viana') ||
      lowerAddr.includes('waldemar falcão') ||
      lowerAddr.includes('waldemar falcao');

    if (isSalvadorHint) {
      return { city: 'Salvador', state: 'BA' };
    }
    if (lowerCity === 'lauro de freitas' || lowerAddr.includes('lauro de freitas')) {
      return { city: 'Lauro de Freitas', state: 'BA' };
    }
    if (lowerCity && lowerCity !== 'são paulo' && lowerCity !== 'sao paulo') {
      return { city: unit!.cidade.trim(), state: 'BA' };
    }
    return { city: unit?.cidade?.trim() || 'Salvador', state: lowerCity.includes('paulo') ? 'SP' : 'BA' };
  };

  // Formats an address so Google Maps geocoder reliably locates the street & number
  const formatGeocodableAddress = (rawAddress: string, unit?: StoreUnit, explicitCep?: string): string => {
    const { city, state } = resolveUnitCityState(unit, rawAddress);
    if (!rawAddress || !rawAddress.trim()) {
      return explicitCep ? `${explicitCep}, ${city}, ${state}, Brasil` : `${city}, ${state}, Brasil`;
    }

    // Replace fictional mock street if still present in localStorage
    let cleaned = rawAddress.replace(/Rua dos Padeiros,\s*500\s*-\s*Galp[aã]o\s*3/i, 'Av. Marquês de São Vicente, 500');

    // Strip inline hyphenated complements like "- Loja A", "- Sala 01", "- Galpão 3", "- Apto 51"
    cleaned = cleaned.replace(
      /\s*-\s*(loja|sala|apto\.?|apartamento|ap\.?|bloco|bl\.?|galp[aã]o|andar|conjunto|cj\.?|box|quiosque)\s+[a-z0-9-]+\b/gi,
      ''
    );

    // Split by comma and filter out pure internal unit/room/store segments
    const complementRegex =
      /^\s*(loja|sala|apto\.?|apartamento|ap\.?|bloco|bl\.?|galp[aã]o|andar|conjunto|cj\.?|casa|lote|quadra|box|quiosque|edif[ií]cio|ed\.?|condom[ií]nio|cond\.?)\b/i;

    const parts = cleaned
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0 && !complementRegex.test(p));

    const baseAddress = parts.join(', ');
    const lowerBase = baseAddress.toLowerCase();
    const cepSuffix = explicitCep?.trim() ? `, ${explicitCep.trim()}` : '';

    if (lowerBase.includes(city.toLowerCase())) {
      return `${baseAddress}, ${state}${cepSuffix}, Brasil`;
    }
    return `${baseAddress}, ${city} - ${state}${cepSuffix}, Brasil`;
  };

  const originAddress = useMemo(() => {
    if (!originUnit) return 'Salvador - BA, Brasil';
    return formatGeocodableAddress(originUnit.endereco, originUnit, originUnit.cep);
  }, [originUnit]);

  const originDisplayAddress = useMemo(() => {
    if (!originUnit) return 'Salvador - BA';
    const { city, state } = resolveUnitCityState(originUnit, originUnit.endereco);
    const cepLabel = originUnit.cep ? ` (CEP: ${originUnit.cep})` : '';
    if (originUnit.endereco.toLowerCase().includes(city.toLowerCase())) {
      return `${originUnit.endereco} - ${state}${cepLabel}`;
    }
    return `${originUnit.endereco}, ${city} - ${state}${cepLabel}`;
  }, [originUnit]);

  // Automatically compute the fastest driving sequence (TSP / OSRM road duration matrix) whenever origin or selected deliveries change
  useEffect(() => {
    let cancelled = false;
    if (rawSelectedDeliveries.length === 0) {
      setOptimizedRoute(null);
      setIsOptimizingRoute(false);
      return;
    }
    const { city, state } = resolveUnitCityState(originUnit, originUnit?.endereco || '');
    setIsOptimizingRoute(true);
    computeFastestDeliveryRoute(originUnit, rawSelectedDeliveries, customers, city, state)
      .then(res => {
        if (!cancelled) {
          setOptimizedRoute(res);
          setIsOptimizingRoute(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsOptimizingRoute(false);
      });
    return () => {
      cancelled = true;
    };
  }, [originUnit, rawSelectedDeliveries, customers]);

  // Ordered deliveries according to the fastest driving route from the Unidade
  const selectedDeliveries = useMemo(() => {
    if (
      optimizedRoute &&
      optimizedRoute.stops.length === rawSelectedDeliveries.length &&
      optimizedRoute.stops.length > 0
    ) {
      return optimizedRoute.stops.map(s => s.order);
    }
    return rawSelectedDeliveries;
  }, [optimizedRoute, rawSelectedDeliveries]);

  const getOrderDeliveryDetail = (order: Order): string => {
    if (order.detalheEntrega && order.detalheEntrega.trim().length > 0) {
      return order.detalheEntrega.trim();
    }
    const normalizedPhone = order.clienteTelefone.replace(/\D/g, '');
    const matchedCustomer = customers.find(
      c =>
        c.telefone.replace(/\D/g, '') === normalizedPhone ||
        c.nome.trim().toLowerCase() === order.clienteNome.trim().toLowerCase()
    );
    return matchedCustomer?.detalheEntrega?.trim() || '-';
  };

  const getOrderProductsSummary = (order: Order): string => {
    const summary = (order.itens || [])
      .map(item => {
        const prod = products.find(p => p.id === item.produtoId);
        return `${item.quantidade}x ${prod?.descricao || 'Produto'}`;
      })
      .join(', ');
    return summary || 'Itens não especificados';
  };

  // Build Google Maps Directions URL with origin = Unidade coordinates/address, waypoints, and destination (forced driving/car mode on Web & Mobile)
  const googleMapsRouteUrl = useMemo(() => {
    if (selectedDeliveries.length === 0) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(originAddress)}`;
    }
    const originParam = optimizedRoute?.originCoords
      ? `${optimizedRoute.originCoords.lat.toFixed(6)},${optimizedRoute.originCoords.lng.toFixed(6)}`
      : originAddress;

    const addresses = selectedDeliveries.map(o =>
      formatGeocodableAddress(o.enderecoEntrega || o.clienteEndereco || '', originUnit)
    );
    const destination = addresses[addresses.length - 1];
    const waypoints = addresses.slice(0, -1);
    const waypointsParam =
      waypoints.length > 0
        ? `&waypoints=${waypoints.map(w => encodeURIComponent(w)).join('|')}`
        : '';
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      originParam
    )}&destination=${encodeURIComponent(
      destination
    )}${waypointsParam}&travelmode=driving&dirflg=d`;
  }, [selectedDeliveries, originAddress, originUnit, optimizedRoute]);

  // Embedded Google Maps View URL for the in-app Map Window (dirflg=d forces car/driving mode)
  const googleMapsEmbedUrl = useMemo(() => {
    if (selectedDeliveries.length === 0) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(originAddress)}&z=14&output=embed`;
    }
    const stops = selectedDeliveries.map(o =>
      formatGeocodableAddress(o.enderecoEntrega || o.clienteEndereco || '', originUnit)
    );
    const daddrQuery = stops.join(' to:');
    return `https://maps.google.com/maps?saddr=${encodeURIComponent(
      originAddress
    )}&daddr=${encodeURIComponent(daddrQuery)}&dirflg=d&travelmode=driving&output=embed`;
  }, [selectedDeliveries, originAddress, originUnit]);

  const buildWhatsappRouteMessage = () => {
    const lines = [
      `🚚 *ROTA DE ENTREGAS - BEJU CARAMELOS*`,
      `📍 *Partida (${originUnit?.nome || 'Unidade'}):* ${originAddress}`,
      `📦 *Paradas (${selectedDeliveries.length}):*`,
      ...selectedDeliveries.map((o, idx) => {
        const detail = getOrderDeliveryDetail(o);
        return `${idx + 1}. *${o.clienteNome}* (${o.clienteTelefone})\n   📌 ${o.enderecoEntrega || '-'}${
          detail !== '-' ? ` | Compl: ${detail}` : ''
        }`;
      }),
      ``,
      `🗺️ *Link da Rota Mais Rápida (Google Maps):*`,
      googleMapsRouteUrl
    ];
    return lines.join('\n');
  };

  const handleCopyRouteLink = () => {
    navigator.clipboard.writeText(googleMapsRouteUrl);
    setRouteLinkCopied(true);
    setTimeout(() => setRouteLinkCopied(false), 2000);
  };

  const handleShareRouteWhatsapp = () => {
    const msg = buildWhatsappRouteMessage();
    navigator.clipboard.writeText(msg);
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenGoogleMapsPopup = () => {
    window.open(
      googleMapsRouteUrl,
      'juju_google_maps_route',
      'width=1100,height=800,menubar=no,toolbar=no,location=yes,status=yes,resizable=yes,scrollbars=yes'
    );
  };

  const handleGenerateAndSharePdf = async () => {
    const deliveriesToExport =
      selectedDeliveries.length > 0 ? selectedDeliveries : pendingDeliveries;
    if (deliveriesToExport.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('ROMANEIO E ROTA DE ENTREGAS - BEJU CARAMELOS', 14, 14);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Ponto de Partida (${originUnit?.nome || 'Unidade'}): ${originAddress}`,
      14,
      20
    );
    doc.text(
      `Gerado em: ${new Date().toLocaleString('pt-BR')} | Total de Entregas: ${deliveriesToExport.length}`,
      14,
      25
    );

    const tableRows = deliveriesToExport.map((order, idx) => [
      `${idx + 1} (${order.numeroPedido})`,
      order.clienteNome,
      order.clienteTelefone,
      order.enderecoEntrega || '-',
      getOrderProductsSummary(order),
      getOrderDeliveryDetail(order)
    ]);

    autoTable(doc, {
      startY: 30,
      head: [
        [
          '# / Pedido',
          'Cliente',
          'Telefone',
          'Endereço',
          'Produtos',
          'Detalhe do Endereço'
        ]
      ],
      body: tableRows,
      styles: {
        fontSize: 8.5,
        cellPadding: 2.5,
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [219, 39, 119],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 42 },
        2: { cellWidth: 32 },
        3: { cellWidth: 72 },
        4: { cellWidth: 55 },
        5: { cellWidth: 44 }
      }
    });

    const fileName = `romaneio-entregas-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);

    const pdfBlob = doc.output('blob');
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };

    if (typeof nav.share === 'function' && typeof nav.canShare === 'function') {
      try {
        if (nav.canShare({ files: [pdfFile] })) {
          await nav.share({
            title: 'Romaneio de Entregas - Beju Caramelos',
            text: buildWhatsappRouteMessage(),
            files: [pdfFile]
          });
          return;
        }
      } catch {
        // Fallback to WhatsApp web link below
      }
    }

    const msg = `${buildWhatsappRouteMessage()}\n\n📄 *O PDF com a tabela de entregas (${fileName}) foi baixado para envio ao entregador!*`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-2xs overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-brand-600 shrink-0" />
          <span className="text-xs font-bold text-slate-900">Roteiro</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
            {selectedDeliveries.length} selecionada(s)
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-3 border-t border-[#e2e8f0] space-y-2.5">
          {/* Unidade Starting Point Selector */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono font-bold uppercase text-slate-500">
            Partida (Unidade):
          </span>
          <select
            value={originUnit?.id || ''}
            onChange={e => setCustomOriginUnitId(e.target.value)}
            className="text-[11px] font-semibold text-slate-800 bg-white border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-brand-500"
          >
            {units.map(u => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-start gap-1 text-[10px] text-slate-600 leading-tight">
          <MapPin className="w-3 h-3 text-brand-600 shrink-0 mt-0.5" />
          <span>{originAddress}</span>
        </div>
      </div>

      {/* Selected Deliveries List or Quick Selection */}
      {selectedDeliveries.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-2.5 text-center space-y-2">
          <p className="text-[11px] text-slate-500 leading-snug">
            Selecione as entregas com status <strong>Pronto</strong> na tela <strong>Entregas</strong> ou abaixo para traçar a rota mais rápida.
          </p>
          <div className="flex items-center justify-center gap-1.5">
            {pendingDeliveries.length > 0 && onChangeSelectedDeliveryIds && (
              <button
                type="button"
                onClick={() => onChangeSelectedDeliveryIds(pendingDeliveries.map(o => o.id))}
                className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-md text-[11px] font-bold transition-colors"
              >
                Selecionar Prontas ({pendingDeliveries.length})
              </button>
            )}
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('entregas')}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md text-[11px] font-semibold transition-colors"
              >
                Abrir Entregas
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>
              SEQUÊNCIA MAIS RÁPIDA ({selectedDeliveries.length})
            </span>
            {onChangeSelectedDeliveryIds && (
              <button
                type="button"
                onClick={() => onChangeSelectedDeliveryIds([])}
                className="text-red-600 hover:underline font-semibold"
              >
                Limpar
              </button>
            )}
          </div>
          {isOptimizingRoute ? (
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-brand-700 bg-brand-50 border border-brand-200 rounded px-2 py-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Calculando rota mais rápida...</span>
            </div>
          ) : optimizedRoute && optimizedRoute.stops.length > 0 ? (
            <div className="flex items-center justify-between text-[10px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
              <span>Rota Otimizada (Menor Tempo)</span>
              <span className="font-bold">
                ~{optimizedRoute.totalDistanceKm} km • ~{optimizedRoute.totalDurationMin} min
              </span>
            </div>
          ) : null}
          <div className="max-h-32 overflow-y-auto space-y-1 pr-0.5">
            {selectedDeliveries.map((order, idx) => {
              const stopMeta = optimizedRoute?.stops[idx];
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-1.5 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px]"
                >
                  <div className="truncate">
                    <span className="font-mono font-bold text-brand-700 mr-1">{idx + 1}.</span>
                    <span className="font-semibold text-slate-800">{order.clienteNome}</span>
                    {stopMeta && (
                      <span className="ml-1 text-[9px] font-mono text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                        +{stopMeta.distanceFromPrevKm}km (~{stopMeta.durationFromPrevMin}m)
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 block truncate">
                      {order.enderecoEntrega || '-'}
                    </span>
                  </div>
                  {onChangeSelectedDeliveryIds && (
                    <button
                      type="button"
                      onClick={() =>
                        onChangeSelectedDeliveryIds(
                          selectedDeliveryIds.filter(id => id !== order.id)
                        )
                      }
                      className="text-slate-400 hover:text-red-600 p-0.5 shrink-0"
                      title="Remover da rota"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={selectedDeliveries.length === 0}
            onClick={() => setIsMapWindowOpen(true)}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            title="Abrir janela com visualização da rota no Google Maps"
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>Ver Mapa da Rota</span>
          </button>

          <button
            type="button"
            disabled={selectedDeliveries.length === 0}
            onClick={handleShareRouteWhatsapp}
            className="flex items-center justify-center gap-1.5 py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            title="Compartilhar link da rota mais rápida via WhatsApp"
          >
            <Share2 className="w-3.5 h-3.5 shrink-0" />
            <span>Link via WhatsApp</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={selectedDeliveries.length === 0}
            onClick={handleCopyRouteLink}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 font-semibold text-[11px] rounded-lg border transition-colors cursor-pointer disabled:cursor-not-allowed ${
              routeLinkCopied
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700 disabled:bg-slate-100 disabled:text-slate-400'
            }`}
          >
            {routeLinkCopied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Link Maps</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={selectedDeliveries.length === 0 && pendingDeliveries.length === 0}
            onClick={handleGenerateAndSharePdf}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            title="Gerar PDF com tabela de entregas (Cliente, telefone, endereço, produtos e detalhe) para enviar no WhatsApp"
          >
            <FileDown className="w-3.5 h-3.5 shrink-0" />
            <span>PDF Entregas (WA)</span>
          </button>
        </div>
      </div>
        </div>
      )}

      {/* Interactive Route Window Modal (Rendered via Portal to document.body so Mobile Drawer never clips it) */}
      {isMapWindowOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92dvh]">
              <div className="px-3.5 sm:px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50 shrink-0">
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5 truncate">
                    <Navigation className="w-4 h-4 text-brand-600 shrink-0" />
                    <span className="truncate">Rota Mais Rápida (Carro) — Partida: {originUnit?.nome}</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    {selectedDeliveries.length} parada(s)
                    {optimizedRoute ? ` • ~${optimizedRoute.totalDistanceKm} km • ~${optimizedRoute.totalDurationMin} min` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={handleOpenGoogleMapsPopup}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[11px] sm:text-xs font-bold transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>Abrir no Google Maps</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareRouteWhatsapp}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] sm:text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Compartilhar no WhatsApp</span>
                    <span className="sm:hidden">WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMapWindowOpen(false)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col lg:grid lg:grid-cols-3 flex-1 overflow-y-auto lg:overflow-hidden">
                {/* Map View (Shown at the top on mobile, right 2 cols on desktop) */}
                <div className="order-1 lg:order-2 lg:col-span-2 bg-slate-100 relative h-[280px] sm:h-[340px] lg:h-full lg:min-h-[460px] shrink-0">
                  <InteractiveRouteMapView
                    originUnit={originUnit}
                    originAddress={originDisplayAddress}
                    optimizedRoute={optimizedRoute}
                  />
                </div>

                {/* Stops & Details List (Scrollable below map on mobile, left col on desktop) */}
                <div className="order-2 lg:order-1 p-3.5 sm:p-4 border-t lg:border-t-0 lg:border-r border-slate-200 lg:overflow-y-auto space-y-3 bg-slate-50/60">
                  <div className="bg-white p-3 rounded-xl border border-brand-200 shadow-2xs">
                    <span className="text-[10px] font-mono font-bold uppercase text-brand-700 block">
                      Ponto de Partida (Unidade)
                    </span>
                    <p className="text-xs font-bold text-slate-900 mt-0.5">{originUnit?.nome}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">{originDisplayAddress}</p>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-500 block">
                      Sequência de Entregas ({selectedDeliveries.length})
                    </span>
                    {selectedDeliveries.map((order, index) => {
                      const stopMeta = optimizedRoute?.stops[index];
                      return (
                        <div
                          key={order.id}
                          className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-brand-700">
                              Parada #{index + 1} • {order.numeroPedido}
                            </span>
                            {stopMeta && (
                              <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                +{stopMeta.distanceFromPrevKm} km (~{stopMeta.durationFromPrevMin} min)
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-900">{order.clienteNome}</p>
                          <p className="text-[11px] font-mono text-slate-600">{order.clienteTelefone}</p>
                          <p className="text-[11px] text-slate-700">{order.enderecoEntrega || '-'}</p>
                          <p className="text-[10px] text-slate-500">
                            <strong>Detalhe:</strong> {getOrderDeliveryDetail(order)}
                          </p>
                          <p className="text-[10px] text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            <strong>Produtos:</strong> {getOrderProductsSummary(order)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

interface InteractiveRouteMapViewProps {
  originUnit?: StoreUnit;
  originAddress: string;
  optimizedRoute: OptimizedRouteResult | null;
}

const InteractiveRouteMapView: React.FC<InteractiveRouteMapViewProps> = ({
  originUnit,
  originAddress,
  optimizedRoute
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    let cancelled = false;

    const renderMap = async () => {
      if (!optimizedRoute || !mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const origin = optimizedRoute.originCoords;
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true
      }).setView([origin.lat, origin.lng], 13);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      const allLatLngs: [number, number][] = [[origin.lat, origin.lng]];

      // Origin Marker (Unidade)
      const originIcon = L.divIcon({
        className: '',
        html: `<div style="background:#059669;color:#fff;font-weight:800;font-family:monospace;font-size:13px;width:28px;height:28px;border-radius:9999px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">🏪</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      L.marker([origin.lat, origin.lng], { icon: originIcon })
        .addTo(map)
        .bindPopup(`<b>Partida: ${originUnit?.nome || 'Unidade'}</b><br/>${originAddress}`);

      // Stop Markers
      optimizedRoute.stops.forEach((stop, idx) => {
        allLatLngs.push([stop.coords.lat, stop.coords.lng]);
        const stopIcon = L.divIcon({
          className: '',
          html: `<div style="background:#db2777;color:#fff;font-weight:800;font-family:monospace;font-size:12px;width:26px;height:26px;border-radius:9999px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${
            idx + 1
          }</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });
        L.marker([stop.coords.lat, stop.coords.lng], { icon: stopIcon })
          .addTo(map)
          .bindPopup(
            `<b>Parada #${idx + 1}: ${stop.order.clienteNome}</b><br/>${stop.order.enderecoEntrega || ''}`
          );
      });

      if (allLatLngs.length >= 2) {
        const initialBounds = L.latLngBounds(allLatLngs);
        map.fitBounds(initialBounds, { padding: [30, 30] });
      }

      // Draw immediate preview route line so user sees the route instantly even on slow mobile networks
      const previewLine =
        allLatLngs.length >= 2
          ? L.polyline(allLatLngs, {
              color: '#db2777',
              weight: 3.5,
              opacity: 0.7,
              dashArray: '6, 6'
            }).addTo(map)
          : null;

      setTimeout(() => {
        if (!cancelled && mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 80);

      // Fetch real road geometry from OSRM Driving Route API and upgrade the preview line
      const allCoords = [origin, ...optimizedRoute.stops.map(s => s.coords)];
      if (allCoords.length >= 2) {
        try {
          const coordsStr = allCoords
            .map(c => `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`)
            .join(';');
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`,
            { signal: controller.signal }
          ).finally(() => clearTimeout(timer));

          if (res.ok) {
            const data = await res.json();
            const coordsGeo = data?.routes?.[0]?.geometry?.coordinates;
            if (Array.isArray(coordsGeo) && coordsGeo.length > 0 && !cancelled) {
              if (previewLine) {
                previewLine.remove();
              }
              const polyLatLngs: [number, number][] = coordsGeo.map((pt: [number, number]) => [pt[1], pt[0]]);
              const poly = L.polyline(polyLatLngs, {
                color: '#2563eb',
                weight: 5,
                opacity: 0.92
              }).addTo(map);
              map.fitBounds(poly.getBounds(), { padding: [30, 30] });
            }
          }
        } catch {
          // keep previewLine on network failure
        }
      }

      setTimeout(() => {
        if (!cancelled && mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 300);
    };

    renderMap();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [optimizedRoute, originUnit, originAddress]);

  if (!optimizedRoute) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
        <span>Carregando traçado da rota...</span>
      </div>
    );
  }

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: '280px' }} className="z-10" />;
};
