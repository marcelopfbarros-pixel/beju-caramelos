import { StoreUnit, Category, Product, Order, StockItem, StockMovement, ProductionOrder, UserProfile, Customer, FinancialPaymentChannel, OrderFinancialRecord } from '../types';
import { DEFAULT_FINANCIAL_PAYMENT_CHANNELS } from '../utils/financialReconciliation';

const INITIAL_UNITS: StoreUnit[] = [
  {
    id: 'u-central',
    codigo: 'CENTRAL',
    nome: 'Ateliê de Produção',
    tipo: 'CENTRAL',
    endereco: 'Rua dos Padeiros, 500 - Galpão 3, Barra Funda',
    cidade: 'São Paulo',
    telefone: '+55 11 99999-0001',
    chavePix: 'financeiro@jujudelivery.com.br',
    ativo: true
  },
  {
    id: 'u-loja1',
    codigo: 'LOJA-01',
    nome: 'Loja 1 - Jardins',
    tipo: 'LOJA',
    endereco: 'Rua Oscar Freire, 1200, Jardins',
    cidade: 'São Paulo',
    telefone: '+55 11 99999-0002',
    chavePix: 'jardins@jujudelivery.com.br',
    ativo: true
  },
  {
    id: 'u-loja2',
    codigo: 'LOJA-02',
    nome: 'Loja 2 - Moema',
    tipo: 'LOJA',
    endereco: 'Av. Moema, 350, Moema',
    cidade: 'São Paulo',
    telefone: '+55 11 99999-0003',
    chavePix: 'moema@jujudelivery.com.br',
    ativo: true
  },
  {
    id: 'u-loja3',
    codigo: 'LOJA-03',
    nome: 'Loja 3 - Pinheiros',
    tipo: 'LOJA',
    endereco: 'Rua dos Pinheiros, 740, Pinheiros',
    cidade: 'São Paulo',
    telefone: '+55 11 99999-0004',
    chavePix: 'pinheiros@jujudelivery.com.br',
    ativo: true
  }
];

const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-1', nome: 'Sobremesas Individuais', ordem: 1, ativo: true },
  { id: 'cat-2', nome: 'Encomendas', ordem: 2, ativo: true },
  { id: 'cat-3', nome: 'Sazonal', ordem: 3, ativo: true },
  { id: 'cat-4', nome: 'Salgados', ordem: 4, ativo: true },
  { id: 'cat-5', nome: 'Empório', ordem: 5, ativo: true }
];

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'p-1',
    sku: 'DOC-RV-01',
    descricao: 'Bolo Red Velvet Tradicional c/ Cream Cheese (1.5kg)',
    fotoUrl: 'https://images.unsplash.com/photo-1586788680434-30d324b2d46f?auto=format&fit=crop&w=400&q=80',
    precoUnitario: 145.00,
    unidade: 'UN',
    categoriaId: 'cat-2',
    tempoProducaoMinutos: 90,
    ativo: true
  },
  {
    id: 'p-2',
    sku: 'DOC-MC-06',
    descricao: 'Caixa c/ 6 Macarons Franceses Sortidos',
    fotoUrl: 'https://images.unsplash.com/photo-1569864358642-9d1684040f43?auto=format&fit=crop&w=400&q=80',
    precoUnitario: 48.00,
    unidade: 'CX',
    categoriaId: 'cat-1',
    tempoProducaoMinutos: 40,
    ativo: true
  },
  {
    id: 'p-3',
    sku: 'DOC-TL-01',
    descricao: 'Tartelette de Limão Siciliano com Merengue Tostado',
    fotoUrl: 'https://images.unsplash.com/photo-1519915028121-7d3463d20b13?auto=format&fit=crop&w=400&q=80',
    precoUnitario: 24.00,
    unidade: 'UN',
    categoriaId: 'cat-1',
    tempoProducaoMinutos: 30,
    ativo: true
  },
  {
    id: 'p-4',
    sku: 'DOC-EC-02',
    descricao: 'Eclair de Baunilha Bourbon de Madagascar',
    fotoUrl: 'https://images.unsplash.com/photo-1525059696034-4967a8e1dca2?auto=format&fit=crop&w=400&q=80',
    precoUnitario: 22.50,
    unidade: 'UN',
    categoriaId: 'cat-1',
    tempoProducaoMinutos: 35,
    ativo: true
  },
  {
    id: 'p-5',
    sku: 'SAL-QL-01',
    descricao: 'Quiche Lorraine Clássica c/ Bacon Defumado e Alho-poró',
    fotoUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281691?auto=format&fit=crop&w=400&q=80',
    precoUnitario: 89.00,
    unidade: 'UN',
    categoriaId: 'cat-4',
    tempoProducaoMinutos: 60,
    ativo: true
  },
  {
    id: 'p-6',
    sku: 'SAL-CX-100',
    descricao: 'Cento de Coxinhas Gourmet de Frango c/ Catupiry',
    fotoUrl: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=400&q=80',
    precoUnitario: 120.00,
    unidade: 'CENTO',
    categoriaId: 'cat-4',
    tempoProducaoMinutos: 45,
    ativo: true
  },
  {
    id: 'p-7',
    sku: 'EMP-GE-01',
    descricao: 'Geleia Artesanal de Frutas Vermelhas e Vinho do Porto (280g)',
    fotoUrl: 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=400&q=80',
    precoUnitario: 38.00,
    unidade: 'UN',
    categoriaId: 'cat-5',
    tempoProducaoMinutos: 15,
    ativo: true
  }
];

export const GUEST_USER_PROFILE: UserProfile = {
  id: 'guest',
  email: '',
  nome: 'Visitante',
  avatarUrl: '/logo.jpg',
  role: 'ATENDIMENTO',
  unidadePadraoId: 'u-central',
  autenticadoGoogle: false,
  ativo: true
};

export class AppStorage {
  private static load<T>(key: string, fallback: T): T {
    try {
      const data = localStorage.getItem(`juju_${key}`);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  private static save<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`juju_${key}`, JSON.stringify(value));
    } catch (e) {
      console.error(`Falha ao salvar no storage: ${key}`, e);
    }
  }

  static getUnits(): StoreUnit[] {
    return this.load('units', INITIAL_UNITS);
  }

  static saveUnits(units: StoreUnit[]): void {
    this.save('units', units);
  }

  static getCategories(): Category[] {
    return this.load('categories', INITIAL_CATEGORIES);
  }

  static saveCategories(cats: Category[]): void {
    this.save('categories', cats);
  }

  static getProducts(): Product[] {
    return this.load('products', INITIAL_PRODUCTS);
  }

  static saveProducts(prods: Product[]): void {
    this.save('products', prods);
  }

  static getOrders(): Order[] {
    return this.load('orders', []);
  }

  static saveOrders(orders: Order[]): void {
    this.save('orders', orders);
  }

  static getStock(): StockItem[] {
    return this.load('stock', []);
  }

  static saveStock(stock: StockItem[]): void {
    this.save('stock', stock);
  }

  static getGuestUserProfile(): UserProfile {
    return { ...GUEST_USER_PROFILE };
  }

  static getUserProfile(): UserProfile {
    return this.load('user', GUEST_USER_PROFILE);
  }

  static saveUserProfile(user: UserProfile): void {
    const { senha: _omitPin, ...safeUser } = user;
    this.save('user', safeUser);
  }

  static clearUserProfile(): void {
    try {
      localStorage.removeItem('juju_user');
    } catch {
      // ignore storage errors
    }
  }

  static clearOperationalPii(): void {
    const keys = [
      'juju_orders',
      'juju_customers',
      'juju_users',
      'juju_financial_records',
      'juju_production_orders',
      'juju_stock_movements',
      'juju_user',
      'juju_revenue_goals',
    ];
    for (const key of keys) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore storage errors
      }
    }
  }

  static getActiveUnitId(): string {
    return localStorage.getItem('juju_active_unit') || 'u-central';
  }

  static setActiveUnitId(id: string): void {
    localStorage.setItem('juju_active_unit', id);
  }

  static getProductionOrders(): ProductionOrder[] {
    return this.load('production_orders', []);
  }

  static saveProductionOrders(orders: ProductionOrder[]): void {
    this.save('production_orders', orders);
  }

  static getCustomers(): Customer[] {
    return this.load('customers', []);
  }

  static saveCustomers(customers: Customer[]): void {
    this.save('customers', customers);
  }

  static getUsers(): UserProfile[] {
    return this.load('users', []);
  }

  static saveUsers(users: UserProfile[]): void {
    const safeUsers = users.map(({ senha: _omitPin, ...rest }) => rest);
    this.save('users', safeUsers);
  }

  static getStockMovements(): StockMovement[] {
    return this.load('stock_movements', []);
  }

  static saveStockMovements(movements: StockMovement[]): void {
    this.save('stock_movements', movements);
  }

  static getFinancialPaymentChannels(): FinancialPaymentChannel[] {
    return this.load('financial_channels', DEFAULT_FINANCIAL_PAYMENT_CHANNELS);
  }

  static saveFinancialPaymentChannels(channels: FinancialPaymentChannel[]): void {
    this.save('financial_channels', channels);
  }

  static getOrderFinancialRecords(): OrderFinancialRecord[] {
    return this.load('financial_records', []);
  }

  static saveOrderFinancialRecords(records: OrderFinancialRecord[]): void {
    this.save('financial_records', records);
  }
}
