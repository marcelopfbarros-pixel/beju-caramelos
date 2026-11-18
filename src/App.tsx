import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar, ScreenId } from './components/Sidebar';
import { RightBar } from './components/RightBar';
import { LandingScreen } from './components/LandingScreen';
import { TutorialOverlay } from './components/TutorialOverlay';
import { PedidosScreen } from './screens/PedidosScreen';
import { ProdutosScreen } from './screens/ProdutosScreen';
import { EntregasScreen } from './screens/EntregasScreen';
import { ProducaoScreen } from './screens/ProducaoScreen';
import { EstoqueScreen } from './screens/EstoqueScreen';
import { LojasScreen } from './screens/LojasScreen';
import { ClientesScreen } from './screens/ClientesScreen';
import { RelatoriosScreen } from './screens/RelatoriosScreen';
import { ConfiguracoesScreen } from './screens/ConfiguracoesScreen';
import { CardapioDigitalScreen } from './screens/CardapioDigitalScreen';
import { AppStorage } from './services/storage';
import { SupabaseService } from './services/supabaseService';
import { supabase } from './services/supabaseClient';
import {
  getWhatsAppAutomationSettings,
  formatStatusNotificationMessage,
  dispatchWhatsAppMessage
} from './services/whatsappAutomationService';
import { MessageSquare, Send, X, ShoppingBag, ChefHat, Package, Truck, Wrench } from 'lucide-react';
import { 
  StoreUnit, 
  Category, 
  Product, 
  Order, 
  OrderStatus,
  StockItem, 
  StockMovement,
  UserProfile,
  ProductionOrder,
  ProductionShift,
  ProductionStatus,
  Customer,
  MonthlyRevenueGoals
} from './types';

export const App: React.FC = () => {
  // State from Local Storage / Database
  const [units, setUnits] = useState<StoreUnit[]>(() => AppStorage.getUnits());
  const [categories, setCategories] = useState<Category[]>(() => AppStorage.getCategories());
  const [products, setProducts] = useState<Product[]>(() => AppStorage.getProducts());
  const [orders, setOrders] = useState<Order[]>(() => AppStorage.getOrders());
  const [stock, setStock] = useState<StockItem[]>(() => AppStorage.getStock());
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => AppStorage.getStockMovements());
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>(() => AppStorage.getProductionOrders());
  const [customers, setCustomers] = useState<Customer[]>(() => AppStorage.getCustomers());
  const [users, setUsers] = useState<UserProfile[]>(() => AppStorage.getUsers());
  const [userProfile, setUserProfile] = useState<UserProfile>(() => AppStorage.getUserProfile());
  const [revenueGoals, setRevenueGoals] = useState<MonthlyRevenueGoals>(() => {
    try {
      const saved = localStorage.getItem('juju_revenue_goals');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleSaveRevenueGoals = useCallback((goals: MonthlyRevenueGoals) => {
    setRevenueGoals(goals);
    try {
      localStorage.setItem('juju_revenue_goals', JSON.stringify(goals));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const [activeUnitId, setActiveUnitId] = useState<string>(() => AppStorage.getActiveUnitId());
  const [activeDate, setActiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [activeShift, setActiveShift] = useState<ProductionShift | 'TODOS'>('TODOS');
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('pedidos');
  const [selectedOrder, setSelectedOrder] = useState<Order | undefined>(() => orders[0]);
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<string[]>([]);
  const [isMobileRightDrawerOpen, setIsMobileRightDrawerOpen] = useState<boolean>(false);
  const [focusRoteiroSignal, setFocusRoteiroSignal] = useState<number>(0);
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(false);

  const handleOpenRoteiroTool = useCallback(() => {
    setFocusRoteiroSignal(s => s + 1);
    if (window.innerWidth < 1024) {
      setIsMobileRightDrawerOpen(true);
    }
  }, []);
  const [isCardapioDigitalOpen, setIsCardapioDigitalOpen] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get('cardapio') === '1'
  );
  const [statusNotificationPrompt, setStatusNotificationPrompt] = useState<{
    order: Order;
    status: OrderStatus;
  } | null>(null);

  // Enforce mobile operational screen scope (Pedidos, Produção, Estoque, Entregas)
  useEffect(() => {
    const enforceMobileScope = () => {
      if (window.innerWidth < 1024) {
        const allowedMobileScreens: ScreenId[] = ['pedidos', 'producao', 'estoque', 'entregas'];
        if (!allowedMobileScreens.includes(currentScreen)) {
          setCurrentScreen('pedidos');
        }
      }
    };
    enforceMobileScope();
    window.addEventListener('resize', enforceMobileScope);
    return () => window.removeEventListener('resize', enforceMobileScope);
  }, [currentScreen]);

  // Supabase Online Status & User Session
  const [isSupabaseOnline, setIsSupabaseOnline] = useState<boolean>(SupabaseService.isConfigured());
  const [supabaseUser, setSupabaseUser] = useState<any>(null);
  const [isOperatorAuthenticated, setIsOperatorAuthenticated] = useState<boolean>(false);

  // Load data from Supabase Cloud
  const loadDataFromSupabase = useCallback(async () => {
    if (!SupabaseService.isConfigured()) return;

    try {
      // 1. Fetch Units
      const fetchedUnits = await SupabaseService.getUnits();
      if (fetchedUnits.length > 0) {
        setUnits(fetchedUnits);
      }

      // 2. Fetch Categories
      const fetchedCats = await SupabaseService.getCategories();
      setCategories(fetchedCats);

      // 3. Fetch Products
      const fetchedProds = await SupabaseService.getProducts();
      setProducts(fetchedProds);

      // 4. Fetch Orders
      const fetchedOrders = await SupabaseService.getOrders();
      setOrders(fetchedOrders);
      setSelectedOrder(prev =>
        fetchedOrders.find(o => o.id === prev?.id) || fetchedOrders[0] || null
      );

      // 5. Fetch Stock
      const fetchedStock = await SupabaseService.getStock();
      setStock(fetchedStock);

      // 6. Fetch Production Orders
      const fetchedPOs = await SupabaseService.getProductionOrders();
      setProductionOrders(fetchedPOs);

      // 7. Fetch Customers
      const fetchedCustomers = await SupabaseService.getCustomers();
      setCustomers(fetchedCustomers);

      // 8. Fetch Users
      const fetchedUsers = await SupabaseService.getUsers();
      if (fetchedUsers.length > 0) {
        setUsers(fetchedUsers);
      }

      // 9. Fetch Stock Movements
      const fetchedMovements = await SupabaseService.getStockMovements();
      setStockMovements(fetchedMovements);

      setIsSupabaseOnline(true);
    } catch (err) {
      console.warn('Falha ao sincronizar com Supabase Cloud, mantendo cache local:', err);
      setIsSupabaseOnline(false);
    }
  }, []);

  // Initial Load & Auth check
  useEffect(() => {
    const init = async () => {
      if (SupabaseService.isConfigured()) {
        try {
          const user = await SupabaseService.getCurrentUser();
          setSupabaseUser(user);
          if (user) {
            setUserProfile(prev => ({
              ...prev,
              email: user.email || prev.email,
              nome: prev.nome || user.user_metadata?.full_name || user.user_metadata?.name || '',
              avatarUrl: prev.avatarUrl || user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
              autenticadoGoogle: user.app_metadata?.provider === 'google'
            }));
          }
          await loadDataFromSupabase();
        } catch (e) {
          console.error(e);
        }
      }
    };
    init();

    // BD Auth listener
    if (supabase) {
      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        setSupabaseUser(session?.user || null);
        if (session?.user) {
          setUserProfile(prev => ({
            ...prev,
            email: session.user.email || prev.email,
            nome: prev.nome || session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
            avatarUrl: prev.avatarUrl || session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '',
            autenticadoGoogle: session.user.app_metadata?.provider === 'google'
          }));
        }
      });

      return () => {
        authListener.subscription.unsubscribe();
      };
    }
  }, [loadDataFromSupabase]);

  const savingOrderLockRef = useRef(false);

  // Realtime subscription for Orders & Production
  useEffect(() => {
    if (!SupabaseService.isConfigured()) return;

    const unsubOrders = SupabaseService.subscribeToOrders(() => {
      if (savingOrderLockRef.current) return;
      SupabaseService.getOrders().then(updatedOrders => {
        if (savingOrderLockRef.current) return;
        if (updatedOrders.length > 0) {
          setOrders(updatedOrders);
        }
      }).catch(console.error);
    });

    const unsubProduction = SupabaseService.subscribeToProduction(() => {
      SupabaseService.getProductionOrders().then(updatedPOs => {
        if (updatedPOs.length > 0) {
          setProductionOrders(updatedPOs);
        }
      }).catch(console.error);
    });

    return () => {
      unsubOrders();
      unsubProduction();
    };
  }, []);

  // Persist state updates to LocalStorage as resilient cache
  useEffect(() => { AppStorage.saveUnits(units); }, [units]);
  useEffect(() => { AppStorage.saveCategories(categories); }, [categories]);
  useEffect(() => { AppStorage.saveProducts(products); }, [products]);
  useEffect(() => { AppStorage.saveOrders(orders); }, [orders]);
  useEffect(() => { AppStorage.saveStock(stock); }, [stock]);
  useEffect(() => { AppStorage.saveProductionOrders(productionOrders); }, [productionOrders]);
  useEffect(() => { AppStorage.saveCustomers(customers); }, [customers]);
  useEffect(() => { AppStorage.saveUserProfile(userProfile); }, [userProfile]);
  useEffect(() => { AppStorage.setActiveUnitId(activeUnitId); }, [activeUnitId]);

  // Suppress browser default page title ("JuJu Delivery - Gestão de Pedidos") on all print outputs
  useEffect(() => {
    const originalTitle = document.title;
    const handleBeforePrint = () => {
      document.title = '\u200B';
    };
    const handleAfterPrint = () => {
      document.title = originalTitle;
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  // Counts for badges (moved below scopedOrders/scopedStock so they update dynamically by unit & status)

  // Handlers for Orders
  const adjustStockBatch = (
    baseStock: StockItem[],
    unidadeId: string,
    produtoId: string,
    delta: number
  ): StockItem[] => {
    const idx = baseStock.findIndex(s => s.unidadeId === unidadeId && s.produtoId === produtoId);
    const nowIso = new Date().toISOString();
    if (idx >= 0) {
      const nextQty = Math.max(0, Number((baseStock[idx].quantidadeAtual + delta).toFixed(3)));
      return baseStock.map((s, i) =>
        i === idx ? { ...s, quantidadeAtual: nextQty, dataAtualizacao: nowIso } : s
      );
    }
    return [
      ...baseStock,
      {
        id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        unidadeId,
        produtoId,
        quantidadeAtual: Math.max(0, Number(delta.toFixed(3))),
        quantidadeMinima: 5,
        dataAtualizacao: nowIso
      }
    ];
  };

  const syncOrderDeliveryStock = async (
    order: Order,
    previousStatus: OrderStatus | undefined,
    nextStatus: OrderStatus
  ) => {
    const isNowDelivered = previousStatus !== 'ENTREGUE' && nextStatus === 'ENTREGUE';
    const isRevertedFromDelivered = previousStatus === 'ENTREGUE' && nextStatus !== 'ENTREGUE';
    if (!isNowDelivered && !isRevertedFromDelivered) return;
    if (!order.itens || order.itens.length === 0 || !order.unidadeOrigemId) return;

    const deltaSign = isNowDelivered ? -1 : 1;
    let updatedStock = [...stock];
    const newMovements: StockMovement[] = [];
    const nowIso = new Date().toISOString();

    order.itens.forEach(item => {
      if (item.quantidade <= 0) return;
      updatedStock = adjustStockBatch(
        updatedStock,
        order.unidadeOrigemId,
        item.produtoId,
        deltaSign * item.quantidade
      );
      newMovements.push({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        unidadeId: order.unidadeOrigemId,
        produtoId: item.produtoId,
        tipo: isNowDelivered ? 'SAIDA' : 'AJUSTE',
        quantidade: item.quantidade,
        motivo: isNowDelivered
          ? `Pedido Entregue (${order.numeroPedido})`
          : `Estorno de entrega (${order.numeroPedido})`,
        referenciaId: order.numeroPedido,
        dataMovimentacao: nowIso
      });
    });

    if (newMovements.length === 0) return;

    setStock(updatedStock);
    AppStorage.saveStock(updatedStock);
    setStockMovements(prev => {
      const next = [...newMovements, ...prev];
      AppStorage.saveStockMovements(next);
      return next;
    });

    if (isSupabaseOnline) {
      try {
        await SupabaseService.saveStock(updatedStock);
        for (const mov of newMovements) {
          await SupabaseService.saveStockMovement(mov);
        }
      } catch (err) {
        console.error('Erro ao baixar/estornar estoque do pedido:', err);
      }
    }
  };

  const handleSaveOrder = async (newOrder: Order) => {
    const previousOrder = orders.find(o => o.id === newOrder.id);
    const statusChanged = !previousOrder || previousOrder.status !== newOrder.status;

    // 1. Optimistic local update
    setOrders(prev => {
      const exists = prev.some(o => o.id === newOrder.id);
      if (exists) {
        return prev.map(o => o.id === newOrder.id ? newOrder : o);
      }
      return [newOrder, ...prev];
    });
    setSelectedOrder(newOrder);

    await syncOrderDeliveryStock(newOrder, previousOrder?.status, newOrder.status);

    if (statusChanged && !isCardapioDigitalOpen) {
      const waCfg = getWhatsAppAutomationSettings();
      if (waCfg.apiEnabled && waCfg.apiEndpointUrl.trim()) {
        const msg = formatStatusNotificationMessage(newOrder, newOrder.status, products, units, waCfg);
        dispatchWhatsAppMessage(newOrder.clienteTelefone, msg, waCfg);
      } else if (waCfg.autoPromptOnStatusChange) {
        setStatusNotificationPrompt({ order: newOrder, status: newOrder.status });
      }
    }

    // 2. Persist to Supabase
    if (isSupabaseOnline) {
      savingOrderLockRef.current = true;
      try {
        const saved = await SupabaseService.saveOrder(newOrder);
        setOrders(prev =>
          prev.map(o =>
            o.id === newOrder.id || o.numeroPedido === saved.numeroPedido ? saved : o
          )
        );
        setSelectedOrder(saved);
      } catch (err) {
        console.error('Erro ao salvar pedido no Supabase:', err);
      } finally {
        setTimeout(() => {
          savingOrderLockRef.current = false;
        }, 600);
      }
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const targetOrder = orders.find(o => o.id === orderId);
    const updatedOrder = targetOrder ? { ...targetOrder, status } : undefined;

    // 1. Optimistic local update
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));

    if (targetOrder) {
      await syncOrderDeliveryStock(targetOrder, targetOrder.status, status);
    }

    // 2. Trigger WhatsApp status notification prompt or background API dispatch
    if (updatedOrder) {
      const waCfg = getWhatsAppAutomationSettings();
      if (waCfg.apiEnabled && waCfg.apiEndpointUrl.trim()) {
        const msg = formatStatusNotificationMessage(updatedOrder, status, products, units, waCfg);
        dispatchWhatsAppMessage(updatedOrder.clienteTelefone, msg, waCfg);
      } else if (waCfg.autoPromptOnStatusChange) {
        setStatusNotificationPrompt({ order: updatedOrder, status });
      }
    }

    // 3. Persist to Supabase
    if (isSupabaseOnline) {
      try {
        await SupabaseService.updateOrderStatus(orderId, status);
      } catch (err) {
        console.error('Erro ao atualizar status do pedido no Supabase:', err);
      }
    }
  };

  // Handlers for Products
  const handleSaveProduct = async (prod: Product) => {
    setProducts(prev => {
      const exists = prev.some(p => p.id === prod.id);
      if (exists) {
        return prev.map(p => p.id === prod.id ? prod : p);
      }
      return [...prev, prod];
    });

    if (isSupabaseOnline) {
      try {
        const saved = await SupabaseService.saveProduct(prod);
        setProducts(prev => prev.map(p => p.sku === saved.sku ? saved : p));
      } catch (err) {
        console.error('Erro ao salvar produto no Supabase:', err);
      }
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    setProducts(prev => prev.filter(p => p.id !== productId));
    if (isSupabaseOnline) {
      try {
        await SupabaseService.deleteProduct(productId);
      } catch (err) {
        console.error('Erro ao excluir produto no Supabase:', err);
      }
    }
  };

  const handleBatchImportProducts = async (newProducts: Product[]) => {
    setProducts(prev => {
      const existingSkus = new Set(prev.map(p => p.sku));
      const filteredNew = newProducts.filter(p => !existingSkus.has(p.sku));
      return [...prev, ...filteredNew];
    });

    if (isSupabaseOnline) {
      for (const p of newProducts) {
        try {
          await SupabaseService.saveProduct(p);
        } catch (e) {
          console.error(e);
        }
      }
      loadDataFromSupabase();
    }
  };

  // Handlers for Categories
  const handleSaveCategory = async (cat: Category) => {
    setCategories(prev => [...prev, cat]);
    if (isSupabaseOnline) {
      try {
        const saved = await SupabaseService.saveCategory(cat);
        setCategories(prev => prev.map(c => c.nome === saved.nome ? saved : c));
      } catch (err) {
        console.error('Erro ao salvar categoria no Supabase:', err);
      }
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    setCategories(prev => prev.filter(c => c.id !== catId));
    if (isSupabaseOnline) {
      try {
        await SupabaseService.deleteCategory(catId);
      } catch (err) {
        console.error('Erro ao deletar categoria no Supabase:', err);
      }
    }
  };

  // Handlers for Units (N-Lojas)
  const handleSaveUnit = async (unit: StoreUnit) => {
    setUnits(prev => {
      const exists = prev.some(u => u.id === unit.id);
      if (exists) {
        return prev.map(u => u.id === unit.id ? unit : u);
      }
      return [...prev, unit];
    });

    if (isSupabaseOnline) {
      try {
        const saved = await SupabaseService.saveUnit(unit);
        setUnits(prev => prev.map(u => u.codigo === saved.codigo ? saved : u));
      } catch (err) {
        console.error('Erro ao salvar unidade no Supabase:', err);
      }
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    setUnits(prev => prev.filter(u => u.id !== unitId));
    if (isSupabaseOnline) {
      try {
        await SupabaseService.deleteUnit(unitId);
      } catch (err) {
        console.error('Erro ao deletar unidade no Supabase:', err);
      }
    }
  };

  // Handlers for Full Backup Restore
  const handleRestoreFullBackup = (data: {
    units?: StoreUnit[];
    categories?: Category[];
    products?: Product[];
    orders?: Order[];
    stock?: StockItem[];
    customers?: Customer[];
    productionOrders?: ProductionOrder[];
    users?: UserProfile[];
  }) => {
    if (data.units && data.units.length > 0) setUnits(data.units);
    if (data.categories && data.categories.length > 0) setCategories(data.categories);
    if (data.products && data.products.length > 0) setProducts(data.products);
    if (data.orders && data.orders.length > 0) setOrders(data.orders);
    if (data.stock && data.stock.length > 0) setStock(data.stock);
    if (data.customers && data.customers.length > 0) setCustomers(data.customers);
    if (data.productionOrders && data.productionOrders.length > 0) setProductionOrders(data.productionOrders);
    if (data.users && data.users.length > 0) setUsers(data.users);
  };

  const handleSaveUserProfile = async (profile: UserProfile) => {
    setUserProfile(profile);
    AppStorage.saveUserProfile(profile);
    await handleSaveUser(profile);
  };

  // Handlers for Users Management
  const handleSaveUser = async (user: UserProfile) => {
    const normalizedEmail = user.email.trim().toLowerCase();
    setUsers(prev => {
      const exists = prev.some(u => (user.id && u.id === user.id) || u.email.toLowerCase() === normalizedEmail);
      const next = exists
        ? prev.map(u => ((user.id && u.id === user.id) || u.email.toLowerCase() === normalizedEmail ? user : u))
        : [user, ...prev];
      AppStorage.saveUsers(next);
      return next;
    });

    if (isSupabaseOnline) {
      try {
        const saved = await SupabaseService.saveUser(user);
        setUsers(prev => {
          const next = prev.map(u => ((u.id === user.id || u.email.toLowerCase() === normalizedEmail) ? saved : u));
          AppStorage.saveUsers(next);
          return next;
        });
      } catch (err) {
        console.error('Erro ao salvar usuário no BD:', err);
      }
    }
  };

  const handleToggleUserActive = async (userIdOrEmail: string, ativo: boolean) => {
    setUsers(prev => {
      const next = prev.map(u => (u.id === userIdOrEmail || u.email === userIdOrEmail ? { ...u, ativo } : u));
      AppStorage.saveUsers(next);
      return next;
    });

    if (isSupabaseOnline) {
      try {
        await SupabaseService.toggleUserActive(userIdOrEmail, ativo);
      } catch (err) {
        console.error('Erro ao alterar status do usuário no BD:', err);
      }
    }
  };

  const handleRefreshAuth = async () => {
    setIsOperatorAuthenticated(true);
    if (SupabaseService.isConfigured()) {
      const user = await SupabaseService.getCurrentUser();
      setSupabaseUser(user);
      await loadDataFromSupabase();
    }
  };

  // Handler for Production Orders + Per-Item Automatic Stock Movement & Central -> Store Transfer
  const handleSaveProductionOrder = async (po: ProductionOrder) => {
    const previousPO = productionOrders.find(p => p.codigoOrdem === po.codigoOrdem);
    const centralUnitId = units.find(u => u.tipo === 'CENTRAL')?.id || po.unidadeId;
    const isManual = po.codigoOrdem.startsWith('OP-MANUAL-');
    const targetMovements: StockMovement[] = [];
    let updatedStock = [...stock];
    let movedAny = false;
    const nowIso = new Date().toISOString();

    const getOrderDestinationsForItem = (produtoId: string, totalQty: number, fallbackUnitId?: string) => {
      if (isManual || fallbackUnitId) {
        return [{ unitId: fallbackUnitId || po.unidadeId, qty: totalQty }];
      }
      const getLocalDate = (iso: string) => {
        const d = new Date(iso);
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
      };
      const getShift = (iso: string): 'MANHA' | 'TARDE' | 'NOITE' => {
        const h = new Date(iso).getHours();
        return h < 12 ? 'MANHA' : h < 18 ? 'TARDE' : 'NOITE';
      };

      const byUnit = new Map<string, number>();
      orders
        .filter(
          o =>
            o.status !== 'PENDENTE' &&
            o.status !== 'CANCELADO' &&
            o.status !== 'ENTREGUE' &&
            getLocalDate(o.dataHoraEntrega) === po.dataProducao &&
            getShift(o.dataHoraEntrega) === po.turno
        )
        .forEach(o => {
          const itemQty = o.itens
            .filter(i => i.produtoId === produtoId)
            .reduce((s, i) => s + i.quantidade, 0);
          if (itemQty > 0) {
            byUnit.set(o.unidadeOrigemId, (byUnit.get(o.unidadeOrigemId) || 0) + itemQty);
          }
        });

      if (byUnit.size === 0) {
        return [{ unitId: centralUnitId, qty: totalQty }];
      }
      return Array.from(byUnit.entries()).map(([unitId, qty]) => ({ unitId, qty }));
    };

    po.itens.forEach(item => {
      const prevSt: ProductionStatus =
        previousPO?.itemStatuses?.[item.produtoId] || previousPO?.status || 'PLANEJADA';
      const nextSt: ProductionStatus =
        po.itemStatuses?.[item.produtoId] || po.status;
      const prevQty = previousPO?.itens.find(i => i.produtoId === item.produtoId)?.quantidadeProduzida || 0;
      const nextQty = item.quantidadeProduzida || item.quantidadePlanejada || 0;

      const becameConcluded = prevSt !== 'CONCLUIDA' && nextSt === 'CONCLUIDA';
      const revertedFromConcluded = prevSt === 'CONCLUIDA' && nextSt !== 'CONCLUIDA';
      const deltaWhileConcluded = prevSt === 'CONCLUIDA' && nextSt === 'CONCLUIDA' ? nextQty - prevQty : 0;

      if (becameConcluded && nextQty > 0 && centralUnitId) {
        movedAny = true;
        updatedStock = adjustStockBatch(updatedStock, centralUnitId, item.produtoId, nextQty);
        targetMovements.push({
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          unidadeId: centralUnitId,
          produtoId: item.produtoId,
          tipo: 'ENTRADA',
          quantidade: nextQty,
          motivo: `Conclusão de Produção (${po.codigoOrdem})`,
          referenciaId: po.codigoOrdem,
          dataMovimentacao: nowIso
        });

        const destinations = getOrderDestinationsForItem(item.produtoId, nextQty, item.unidadeDestinoId);
        let remainingToTransfer = nextQty;
        destinations.forEach(({ unitId, qty: destQty }) => {
          if (unitId && unitId !== centralUnitId && remainingToTransfer > 0) {
            const transferQty = Math.min(remainingToTransfer, destQty);
            remainingToTransfer -= transferQty;
            const destUnitName = units.find(u => u.id === unitId)?.nome || unitId;
            updatedStock = adjustStockBatch(updatedStock, centralUnitId, item.produtoId, -transferQty);
            updatedStock = adjustStockBatch(updatedStock, unitId, item.produtoId, transferQty);
            targetMovements.push({
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              unidadeId: centralUnitId,
              produtoId: item.produtoId,
              tipo: 'SAIDA',
              quantidade: transferQty,
              motivo: `Transferência para ${destUnitName} (${po.codigoOrdem})`,
              referenciaId: po.codigoOrdem,
              dataMovimentacao: nowIso
            });
            targetMovements.push({
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              unidadeId: unitId,
              produtoId: item.produtoId,
              tipo: 'ENTRADA',
              quantidade: transferQty,
              motivo: `Recebimento da Produção (${po.codigoOrdem})`,
              referenciaId: po.codigoOrdem,
              dataMovimentacao: nowIso
            });
          }
        });
      } else if (revertedFromConcluded && prevQty > 0 && centralUnitId) {
        movedAny = true;
        const destinations = getOrderDestinationsForItem(item.produtoId, prevQty, item.unidadeDestinoId);
        let remainingToRevert = prevQty;
        destinations.forEach(({ unitId, qty: destQty }) => {
          if (unitId && unitId !== centralUnitId && remainingToRevert > 0) {
            const revertQty = Math.min(remainingToRevert, destQty);
            remainingToRevert -= revertQty;
            updatedStock = adjustStockBatch(updatedStock, unitId, item.produtoId, -revertQty);
            updatedStock = adjustStockBatch(updatedStock, centralUnitId, item.produtoId, revertQty);
            targetMovements.push({
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              unidadeId: unitId,
              produtoId: item.produtoId,
              tipo: 'AJUSTE',
              quantidade: revertQty,
              motivo: `Estorno transferência produção (${po.codigoOrdem})`,
              referenciaId: po.codigoOrdem,
              dataMovimentacao: nowIso
            });
          }
        });
        updatedStock = adjustStockBatch(updatedStock, centralUnitId, item.produtoId, -prevQty);
        targetMovements.push({
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          unidadeId: centralUnitId,
          produtoId: item.produtoId,
          tipo: 'AJUSTE',
          quantidade: prevQty,
          motivo: `Estorno conclusão produção (${po.codigoOrdem})`,
          referenciaId: po.codigoOrdem,
          dataMovimentacao: nowIso
        });
      } else if (deltaWhileConcluded > 0 && centralUnitId) {
        movedAny = true;
        updatedStock = adjustStockBatch(updatedStock, centralUnitId, item.produtoId, deltaWhileConcluded);
        targetMovements.push({
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          unidadeId: centralUnitId,
          produtoId: item.produtoId,
          tipo: 'ENTRADA',
          quantidade: deltaWhileConcluded,
          motivo: `Acréscimo de Produção (${po.codigoOrdem})`,
          referenciaId: po.codigoOrdem,
          dataMovimentacao: nowIso
        });
      }
    });

    const finalPo: ProductionOrder = {
      ...po,
      estoqueMovimentado: po.status === 'CONCLUIDA'
    };

    if (movedAny) {
      setStock(updatedStock);
      AppStorage.saveStock(updatedStock);
      setStockMovements(prev => {
        const next = [...targetMovements, ...prev];
        AppStorage.saveStockMovements(next);
        return next;
      });

      if (isSupabaseOnline) {
        try {
          await SupabaseService.saveStock(updatedStock);
          for (const mov of targetMovements) {
            await SupabaseService.saveStockMovement(mov);
          }
        } catch (err) {
          console.error('Erro ao registrar movimentação automática de estoque:', err);
        }
      }
    }

    setProductionOrders(prev => {
      const exists = prev.some(p => p.codigoOrdem === finalPo.codigoOrdem);
      if (exists) {
        return prev.map(p => (p.codigoOrdem === finalPo.codigoOrdem ? finalPo : p));
      }
      return [finalPo, ...prev];
    });

    if (isSupabaseOnline) {
      try {
        const saved = await SupabaseService.saveProductionOrder(finalPo);
        setProductionOrders(prev => prev.map(p => (p.codigoOrdem === saved.codigoOrdem ? saved : p)));
      } catch (err) {
        console.error('Erro ao salvar ordem de produção no Supabase:', err);
      }
    }
  };

  // Handlers for Customers
  const handleSaveCustomer = async (customer: Customer) => {
    setCustomers(prev => {
      const exists = prev.some(c => c.id === customer.id);
      if (exists) {
        return prev.map(c => (c.id === customer.id ? customer : c));
      }
      return [...prev, customer];
    });

    if (isSupabaseOnline) {
      try {
        const saved = await SupabaseService.saveCustomer(customer);
        setCustomers(prev => prev.map(c => (c.id === customer.id || c.telefone === saved.telefone ? saved : c)));
      } catch (err) {
        console.error('Erro ao salvar cliente no Supabase:', err);
      }
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    setCustomers(prev => prev.filter(c => c.id !== customerId));
    if (isSupabaseOnline) {
      try {
        await SupabaseService.deleteCustomer(customerId);
      } catch (err) {
        console.error('Erro ao deletar cliente no Supabase:', err);
      }
    }
  };

  // Controle de Acesso por Usuário (ativo + unidadesPermitidas)
  const activeEmail = (supabaseUser?.email || userProfile.email || '').toLowerCase();
  const matchedUserRecord = users.find(u => u.email.toLowerCase() === activeEmail);

  const effectiveUserProfile: UserProfile = matchedUserRecord
    ? {
        ...userProfile,
        id: matchedUserRecord.id || userProfile.id,
        nome: matchedUserRecord.nome || userProfile.nome,
        avatarUrl: matchedUserRecord.avatarUrl || userProfile.avatarUrl,
        role: matchedUserRecord.role,
        ativo: matchedUserRecord.ativo !== false,
        senha: matchedUserRecord.senha || userProfile.senha,
        unidadePadraoId: matchedUserRecord.unidadePadraoId || userProfile.unidadePadraoId,
        unidadesPermitidas: matchedUserRecord.unidadesPermitidas
      }
    : userProfile;

  const allowedUnits = React.useMemo(() => {
    if (
      effectiveUserProfile.role === 'ADMIN' &&
      (!effectiveUserProfile.unidadesPermitidas || effectiveUserProfile.unidadesPermitidas.length === 0)
    ) {
      return units;
    }
    if (matchedUserRecord) {
      const permitted = new Set(effectiveUserProfile.unidadesPermitidas || []);
      return units.filter(u => permitted.has(u.id));
    }
    return units;
  }, [units, effectiveUserProfile.role, effectiveUserProfile.unidadesPermitidas, matchedUserRecord]);

  const allowedUnitIds = React.useMemo(() => new Set(allowedUnits.map(u => u.id)), [allowedUnits]);

  const allowedOrders = React.useMemo(
    () => orders.filter(o => allowedUnitIds.has(o.unidadeOrigemId)),
    [orders, allowedUnitIds]
  );

  const allowedStock = React.useMemo(
    () => stock.filter(s => allowedUnitIds.has(s.unidadeId)),
    [stock, allowedUnitIds]
  );

  // Lojas no filtro da top bar: apenas lojas associadas a pelo menos um pedido/cliente (fallback para allowedUnits se nenhuma)
  const headerFilterUnits = React.useMemo(() => {
    const withOrders = allowedUnits.filter(u =>
      orders.some(o => o.unidadeOrigemId === u.id || o.unidadeRetiradaId === u.id)
    );
    return withOrders.length > 0 ? withOrders : allowedUnits;
  }, [allowedUnits, orders]);

  const scopedOrders = React.useMemo(
    () =>
      activeUnitId === 'all'
        ? allowedOrders
        : allowedOrders.filter(
            o => o.unidadeOrigemId === activeUnitId || o.unidadeRetiradaId === activeUnitId
          ),
    [allowedOrders, activeUnitId]
  );

  const scopedStock = React.useMemo(
    () =>
      activeUnitId === 'all'
        ? allowedStock
        : allowedStock.filter(s => s.unidadeId === activeUnitId),
    [allowedStock, activeUnitId]
  );

  // Dynamic navigation badges synced with activeUnitId and live order/stock statuses
  const pendingOrdersCount = React.useMemo(
    () => scopedOrders.filter(o => o.status === 'PENDENTE').length,
    [scopedOrders]
  );

  const itemsToProduceCount = React.useMemo(() => {
    const getLocalDate = (iso: string) => {
      const d = new Date(iso);
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };
    const getShift = (iso: string) => {
      const h = new Date(iso).getHours();
      return h < 12 ? 'MANHA' : h < 18 ? 'TARDE' : 'NOITE';
    };

    const concludedKeys = new Set<string>();
    let manualPendingQty = 0;

    productionOrders.forEach(po => {
      const isManual = po.codigoOrdem.startsWith('OP-MANUAL-');
      po.itens.forEach(it => {
        const st = po.itemStatuses?.[it.produtoId] || po.status;
        if (st === 'CONCLUIDA') {
          concludedKeys.add(`${po.dataProducao}|${po.turno}|${it.produtoId}`);
        } else if (isManual && (activeUnitId === 'all' || po.unidadeId === activeUnitId)) {
          manualPendingQty += Math.max(0, it.quantidadePlanejada - it.quantidadeProduzida);
        }
      });
    });

    const orderItemsQty = scopedOrders
      .filter(
        o =>
          o.status === 'CONFIRMADO' ||
          o.status === 'EM_PRODUCAO'
      )
      .reduce((acc, o) => {
        const ordDate = getLocalDate(o.dataHoraEntrega);
        const ordShift = getShift(o.dataHoraEntrega);
        return (
          acc +
          o.itens.reduce((iAcc, item) => {
            if (concludedKeys.has(`${ordDate}|${ordShift}|${item.produtoId}`)) {
              return iAcc;
            }
            return iAcc + item.quantidade;
          }, 0)
        );
      }, 0);

    return orderItemsQty + manualPendingQty;
  }, [scopedOrders, productionOrders, activeUnitId]);

  const lowStockCount = React.useMemo(
    () => scopedStock.filter(s => s.quantidadeAtual <= s.quantidadeMinima).length,
    [scopedStock]
  );

  const pendingDeliveriesCount = React.useMemo(
    () =>
      scopedOrders.filter(
        o =>
          o.tipoEntrega === 'DELIVERY' &&
          (o.status === 'PRONTO' || o.status === 'EM_ROTA')
      ).length,
    [scopedOrders]
  );

  const pendingCustomersCount = React.useMemo(
    () => customers.length,
    [customers]
  );

  useEffect(() => {
    if (allowedUnits.length === 1 && activeUnitId !== allowedUnits[0].id) {
      setActiveUnitId(allowedUnits[0].id);
      return;
    }
    if (activeUnitId !== 'all' && allowedUnits.length > 0 && !allowedUnitIds.has(activeUnitId)) {
      setActiveUnitId(allowedUnits[0].id);
    }
  }, [activeUnitId, allowedUnits, allowedUnitIds]);

  const handleSignOutBlockedUser = async () => {
    try {
      if (SupabaseService.isConfigured()) {
        await SupabaseService.signOut();
      }
    } catch (err) {
      console.error('Erro ao encerrar sessão no BD:', err);
    }
    setSupabaseUser(null);
    setIsOperatorAuthenticated(false);
    const loggedOutProfile: UserProfile = {
      ...userProfile,
      id: 'guest',
      nome: 'Visitante',
      email: '',
      avatarUrl: '/logo.jpg',
      autenticadoGoogle: false,
      ativo: true
    };
    setUserProfile(loggedOutProfile);
    AppStorage.saveUserProfile(loggedOutProfile);
  };

  if (effectiveUserProfile.ativo === false) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#f8f9ff] p-6 font-sans">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-xl p-8 text-center space-y-4">
          <img
            src="/logo.jpg"
            alt="Beju Caramelos"
            className="w-16 h-16 mx-auto rounded-full object-cover ring-4 ring-rose-100"
          />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
            Acesso Desativado
          </div>
          <h1 className="text-lg font-bold text-slate-900">Conta sem permissão ativa</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            O usuário <strong>{effectiveUserProfile.nome}</strong> ({effectiveUserProfile.email}) está com o acesso desativado no sistema. Entre em contato com um administrador ou troque de conta.
          </p>
          <button
            onClick={handleSignOutBlockedUser}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
          >
            Sair / Trocar Conta
          </button>
        </div>
      </div>
    );
  }

  if (isCardapioDigitalOpen) {
    const isFromUrlOnly = new URLSearchParams(window.location.search).get('cardapio') === '1';
    return (
      <CardapioDigitalScreen
        products={products}
        categories={categories}
        units={units}
        stock={stock}
        customers={customers}
        onSubmitOrder={async (newOrder, customerRecord) => {
          await handleSaveOrder(newOrder);
          const normPhone = customerRecord.telefone.replace(/\D/g, '');
          const existingCust = customers.find(
            c =>
              c.telefone.replace(/\D/g, '') === normPhone ||
              c.nome.trim().toLowerCase() === customerRecord.nome.trim().toLowerCase()
          );
          await handleSaveCustomer(
            existingCust ? { ...existingCust, ...customerRecord, id: existingCust.id } : customerRecord
          );
        }}
        onBackToAdmin={
          isFromUrlOnly
            ? () => {
                window.history.replaceState({}, '', window.location.pathname);
                setIsCardapioDigitalOpen(false);
              }
            : () => setIsCardapioDigitalOpen(false)
        }
      />
    );
  }

  if (!supabaseUser && !isOperatorAuthenticated) {
    return (
      <LandingScreen
        users={users}
        units={units}
        isSupabaseOnline={isSupabaseOnline}
        onUpdateUserProfile={(profile) => {
          setUserProfile(profile);
          AppStorage.saveUserProfile(profile);
          setIsOperatorAuthenticated(true);
        }}
        onRegisterUser={handleSaveUser}
        onSupabaseAuthChange={handleRefreshAuth}
        onOpenCardapioDigital={() => setIsCardapioDigitalOpen(true)}
      />
    );
  }

  return (
    <div
      className="w-screen flex flex-col bg-[#f8f9ff] text-[#0f172a] select-none overflow-hidden font-sans"
      style={{ height: '100dvh' }}
    >
      {/* 1. Top Title Bar */}
      <Header
        units={allowedUnits}
        activeUnitId={activeUnitId}
        onSelectUnit={setActiveUnitId}
        userProfile={effectiveUserProfile}
        users={users}
        onOpenSettings={() => setCurrentScreen('configuracoes')}
        isSupabaseOnline={isSupabaseOnline}
        isOperatorAuthenticated={isOperatorAuthenticated}
        supabaseUser={supabaseUser}
        onUpdateUserProfile={(profile) => {
          setUserProfile(profile);
          setIsOperatorAuthenticated(true);
        }}
        onRegisterUser={handleSaveUser}
        onRefreshAuth={handleRefreshAuth}
        onLogout={handleSignOutBlockedUser}
        activeDate={activeDate}
        activeShift={activeShift}
        onChangeDate={setActiveDate}
        onChangeShift={setActiveShift}
      />

      {/* 2. Main Workspace Layout with 3 Columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Left Navigation Rail */}
        <Sidebar
          currentScreen={currentScreen}
          onNavigate={setCurrentScreen}
          pendingOrdersCount={pendingOrdersCount}
          itemsToProduceCount={itemsToProduceCount}
          lowStockCount={lowStockCount}
          pendingDeliveriesCount={pendingDeliveriesCount}
          pendingCustomersCount={pendingCustomersCount}
        />

        {/* Column 2: Center Main Content Screen */}
        <main className="flex-1 flex flex-col overflow-hidden pb-20 lg:pb-0">
          {currentScreen === 'pedidos' && (
            <PedidosScreen
              orders={allowedOrders}
              products={products}
              units={allowedUnits}
              categories={categories}
              customers={customers}
              activeUnitId={activeUnitId}
              userPassword={effectiveUserProfile.senha || '12345678'}
              onSaveOrder={handleSaveOrder}
              onSelectOrder={setSelectedOrder}
              onSaveCustomer={handleSaveCustomer}
            />
          )}

          {currentScreen === 'producao' && (
            <ProducaoScreen
              orders={orders}
              products={products}
              units={units}
              categories={categories}
              productionOrders={productionOrders}
              onSaveProductionOrder={handleSaveProductionOrder}
              onUpdateOrderStatus={handleUpdateOrderStatus}
            />
          )}

          {currentScreen === 'estoque' && (
            <EstoqueScreen
              stock={allowedStock}
              products={products}
              units={allowedUnits}
              activeUnitId={activeUnitId}
              onUpdateStock={async (newStock) => {
                setStock(newStock);
                AppStorage.saveStock(newStock);
                if (isSupabaseOnline) {
                  try {
                    await SupabaseService.saveStock(newStock);
                    const freshStock = await SupabaseService.getStock();
                    setStock(freshStock);
                    AppStorage.saveStock(freshStock);
                  } catch (e) {
                    console.error(e);
                  }
                }
              }}
              onDeleteStockItem={async (stockId) => {
                if (isSupabaseOnline) {
                  try {
                    await SupabaseService.deleteStockItem(stockId);
                  } catch (e) {
                    console.error(e);
                  }
                }
              }}
            />
          )}

          {currentScreen === 'entregas' && (
            <EntregasScreen
              orders={scopedOrders}
              products={products}
              units={allowedUnits}
              customers={customers}
              selectedDeliveryIds={selectedDeliveryIds}
              onChangeSelectedDeliveryIds={setSelectedDeliveryIds}
              onOpenRouteTool={handleOpenRoteiroTool}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              stock={allowedStock}
            />
          )}

          {currentScreen === 'clientes' && (
            <ClientesScreen
              customers={customers}
              orders={orders}
              onSaveCustomer={handleSaveCustomer}
              onDeleteCustomer={handleDeleteCustomer}
            />
          )}

          {currentScreen === 'relatorios' && (
            <RelatoriosScreen
              orders={allowedOrders}
              products={products}
              units={allowedUnits}
              stock={allowedStock}
              stockMovements={stockMovements}
              productionOrders={productionOrders}
              customers={customers}
            />
          )}

          {currentScreen === 'produtos' && (
            <ProdutosScreen
              products={products}
              categories={categories}
              onSaveProduct={handleSaveProduct}
              onDeleteProduct={handleDeleteProduct}
              onSaveCategory={handleSaveCategory}
              onDeleteCategory={handleDeleteCategory}
              onBatchImportProducts={handleBatchImportProducts}
            />
          )}

          {currentScreen === 'lojas' && (
            <LojasScreen
              units={units}
              products={products}
              categories={categories}
              stock={stock}
              onSaveUnit={handleSaveUnit}
              onDeleteUnit={handleDeleteUnit}
              onSaveOrder={handleSaveOrder}
              onUpdateStock={async (newStock) => {
                setStock(newStock);
                AppStorage.saveStock(newStock);
                if (isSupabaseOnline) {
                  try {
                    await SupabaseService.saveStock(newStock);
                    const freshStock = await SupabaseService.getStock();
                    setStock(freshStock);
                    AppStorage.saveStock(freshStock);
                  } catch (e) {
                    console.error(e);
                  }
                }
              }}
              onDeleteStockItem={async (stockId) => {
                if (isSupabaseOnline) {
                  try {
                    await SupabaseService.deleteStockItem(stockId);
                  } catch (e) {
                    console.error(e);
                  }
                }
              }}
            />
          )}

          {currentScreen === 'configuracoes' && (
            <ConfiguracoesScreen
              userProfile={effectiveUserProfile}
              units={units}
              categories={categories}
              products={products}
              orders={orders}
              stock={stock}
              customers={customers}
              productionOrders={productionOrders}
              users={users}
              onSaveUserProfile={handleSaveUserProfile}
              onSaveUser={handleSaveUser}
              onToggleUserActive={handleToggleUserActive}
              onRestoreFullBackup={handleRestoreFullBackup}
              isSupabaseOnline={isSupabaseOnline}
              onSyncSupabase={loadDataFromSupabase}
              revenueGoals={revenueGoals}
              onSaveRevenueGoals={handleSaveRevenueGoals}
              activeUnitId={activeUnitId}
              onOpenCardapioDigital={() => setIsCardapioDigitalOpen(true)}
            />
          )}
        </main>

        {/* Column 3: Right Side KPI & Tools Bar (Desktop) */}
        <RightBar
          orders={orders}
          products={products}
          categories={categories}
          units={units}
          customers={customers}
          onSaveCustomer={handleSaveCustomer}
          stock={stock}
          activeUnitId={activeUnitId}
          selectedOrder={selectedOrder}
          selectedDeliveryIds={selectedDeliveryIds}
          onChangeSelectedDeliveryIds={setSelectedDeliveryIds}
          lowStockCount={lowStockCount}
          revenueGoals={revenueGoals}
          currentScreen={currentScreen}
          onNavigate={setCurrentScreen}
          focusRoteiroSignal={focusRoteiroSignal}
          onOpenTutorial={() => setIsTutorialOpen(true)}
        />
      </div>

      {/* Mobile Bottom Operational Navigation Bar (Pedidos, Produção, Estoque, Entregas + Painel/Ferramentas) */}
      <nav
        aria-label="Navegação Mobile"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e2e8f0] px-1.5 py-1.5 grid grid-cols-5 gap-1 z-40 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] print:hidden"
      >
        {[
          { id: 'pedidos' as ScreenId, label: 'Pedidos', icon: ShoppingBag, badge: pendingOrdersCount },
          { id: 'producao' as ScreenId, label: 'Produção', icon: ChefHat, badge: itemsToProduceCount },
          { id: 'estoque' as ScreenId, label: 'Estoque', icon: Package, badge: lowStockCount, alert: lowStockCount > 0 },
          { id: 'entregas' as ScreenId, label: 'Entregas', icon: Truck, badge: pendingDeliveriesCount }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = currentScreen === tab.id && !isMobileRightDrawerOpen;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setCurrentScreen(tab.id);
                setIsMobileRightDrawerOpen(false);
              }}
              className={`relative flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all ${
                isActive
                  ? 'bg-brand-600 text-white font-bold shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 font-medium'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] mt-0.5 leading-tight truncate">{tab.label}</span>
              {tab.badge > 0 && (
                <span
                  className={`absolute top-0.5 right-1.5 px-1 min-w-[15px] h-[15px] rounded-full text-[9px] font-mono font-bold flex items-center justify-center ${
                    isActive
                      ? 'bg-white text-brand-700'
                      : tab.alert
                      ? 'bg-red-600 text-white'
                      : 'bg-brand-100 text-brand-800'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setIsMobileRightDrawerOpen(prev => !prev)}
          className={`relative flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all ${
            isMobileRightDrawerOpen
              ? 'bg-slate-900 text-white font-bold shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100 font-medium'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span className="text-[10px] mt-0.5 leading-tight truncate">Painel</span>
          {selectedDeliveryIds.length > 0 && (
            <span className="absolute top-0.5 right-1.5 px-1 min-w-[15px] h-[15px] rounded-full text-[9px] font-mono font-bold bg-brand-600 text-white flex items-center justify-center">
              {selectedDeliveryIds.length}
            </span>
          )}
        </button>
      </nav>

      {/* Mobile Slide-Over Drawer for Indicadores & Ferramentas (RightBar) */}
      {isMobileRightDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end pb-16 print:hidden">
          <div className="w-full max-w-sm h-full bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            <RightBar
              orders={orders}
              products={products}
              categories={categories}
              units={units}
              customers={customers}
              onSaveCustomer={handleSaveCustomer}
              stock={stock}
              activeUnitId={activeUnitId}
              selectedOrder={selectedOrder}
              selectedDeliveryIds={selectedDeliveryIds}
              onChangeSelectedDeliveryIds={setSelectedDeliveryIds}
              lowStockCount={lowStockCount}
              revenueGoals={revenueGoals}
              currentScreen={currentScreen}
              onNavigate={(scr) => {
                const allowedMobile: ScreenId[] = ['pedidos', 'producao', 'estoque', 'entregas'];
                if (allowedMobile.includes(scr)) {
                  setCurrentScreen(scr);
                  setIsMobileRightDrawerOpen(false);
                }
              }}
              isMobileDrawer={true}
              onCloseMobileDrawer={() => setIsMobileRightDrawerOpen(false)}
              focusRoteiroSignal={focusRoteiroSignal}
              onOpenTutorial={() => setIsTutorialOpen(true)}
            />
          </div>
        </div>
      )}

      <TutorialOverlay
        isOpen={isTutorialOpen}
        currentScreen={currentScreen}
        onClose={() => setIsTutorialOpen(false)}
      />

      {/* Floating WhatsApp Status Notification Prompt */}
      {statusNotificationPrompt && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-white border border-emerald-300 rounded-2xl shadow-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-4 print:hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Notificar {statusNotificationPrompt.order.clienteNome} no WhatsApp?
                </h4>
                <p className="text-[11px] text-slate-500 font-mono">
                  {statusNotificationPrompt.order.numeroPedido} • Status: {statusNotificationPrompt.status}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStatusNotificationPrompt(null)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const msg = formatStatusNotificationMessage(
                  statusNotificationPrompt.order,
                  statusNotificationPrompt.status,
                  products,
                  units
                );
                dispatchWhatsAppMessage(statusNotificationPrompt.order.clienteTelefone, msg);
                setStatusNotificationPrompt(null);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar no WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusNotificationPrompt(null)}
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Agora não
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;
