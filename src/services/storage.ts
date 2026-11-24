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

const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-101',
    numeroPedido: '#PED-2026-0042',
    status: 'CONFIRMADO',
    dataPedido: '2026-11-14T10:15:00',
    dataHoraEntrega: '2026-11-14T17:00:00',
    tipoEntrega: 'DELIVERY',
    unidadeOrigemId: 'u-loja1',
    clienteNome: 'Mariana Guimarães',
    clienteTelefone: '+55 11 98765-4321',
    clienteEndereco: 'Rua Bela Cintra, 890, Apto 51 - Consolação',
    enderecoEntrega: 'Rua Bela Cintra, 890, Apto 51 - Consolação',
    valorSubtotal: 193.00,
    taxaEntrega: 15.00,
    desconto: 0.00,
    valorTotal: 208.00,
    formaPagamento: 'pix',
    instrucoesPagamento: 'Chave PIX (E-mail): jardins@jujudelivery.com.br',
    observacoes: 'Tocar o interfone e deixar com a portaria.',
    itens: [
      { id: 'item-1', produtoId: 'p-1', quantidade: 1, precoUnitario: 145.00, subtotal: 145.00, observacoes: 'Vela decorativa inclusa' },
      { id: 'item-2', produtoId: 'p-2', quantidade: 1, precoUnitario: 48.00, subtotal: 48.00 }
    ]
  },
  {
    id: 'ord-102',
    numeroPedido: '#PED-2026-0043',
    status: 'PENDENTE',
    dataPedido: '2026-11-14T11:30:00',
    dataHoraEntrega: '2026-11-14T18:30:00',
    tipoEntrega: 'RETIRADA',
    unidadeOrigemId: 'u-loja2',
    unidadeRetiradaId: 'u-loja2',
    clienteNome: 'Rodrigo Antunes',
    clienteTelefone: '+55 11 99123-8877',
    clienteEndereco: 'Av. Ibirapuera, 1400',
    valorSubtotal: 135.50,
    taxaEntrega: 0.00,
    desconto: 5.50,
    valorTotal: 130.00,
    formaPagamento: 'credito',
    instrucoesPagamento: 'Pagamento presencial no balcão no ato da retirada',
    observacoes: 'Cliente retirará pessoalmente às 18h30.',
    itens: [
      { id: 'item-3', produtoId: 'p-3', quantidade: 2, precoUnitario: 24.00, subtotal: 48.00 },
      { id: 'item-4', produtoId: 'p-5', quantidade: 1, precoUnitario: 89.00, subtotal: 89.00 }
    ]
  },
  {
    id: 'ord-103',
    numeroPedido: '#PED-2026-0044',
    status: 'EM_ROTA',
    dataPedido: '2026-11-14T09:00:00',
    dataHoraEntrega: '2026-11-14T15:45:00',
    tipoEntrega: 'DELIVERY',
    unidadeOrigemId: 'u-loja1',
    clienteNome: 'Carla Vasconcellos',
    clienteTelefone: '+55 11 97654-1122',
    enderecoEntrega: 'Alameda Lorena, 1420 - Cerqueira César',
    valorSubtotal: 168.00,
    taxaEntrega: 12.00,
    desconto: 0.00,
    valorTotal: 180.00,
    formaPagamento: 'dinheiro',
    trocoPara: 200.00,
    instrucoesPagamento: 'Levar R$ 20,00 de troco para nota de R$ 200,00',
    observacoes: 'Entregador João a caminho.',
    itens: [
      { id: 'item-5', produtoId: 'p-6', quantidade: 1, precoUnitario: 120.00, subtotal: 120.00 },
      { id: 'item-6', produtoId: 'p-2', quantidade: 1, precoUnitario: 48.00, subtotal: 48.00 }
    ]
  }
];

const INITIAL_STOCK: StockItem[] = [
  { id: 'st-1', unidadeId: 'u-central', produtoId: 'p-1', quantidadeAtual: 18, quantidadeMinima: 10, dataAtualizacao: '2026-11-14T08:00:00' },
  { id: 'st-2', unidadeId: 'u-loja1', produtoId: 'p-1', quantidadeAtual: 4, quantidadeMinima: 3, dataAtualizacao: '2026-11-14T08:00:00' },
  { id: 'st-3', unidadeId: 'u-loja2', produtoId: 'p-1', quantidadeAtual: 2, quantidadeMinima: 3, dataAtualizacao: '2026-11-14T08:00:00' },
  { id: 'st-4', unidadeId: 'u-central', produtoId: 'p-2', quantidadeAtual: 50, quantidadeMinima: 20, dataAtualizacao: '2026-11-14T08:00:00' },
  { id: 'st-5', unidadeId: 'u-loja1', produtoId: 'p-2', quantidadeAtual: 8, quantidadeMinima: 5, dataAtualizacao: '2026-11-14T08:00:00' },
  { id: 'st-6', unidadeId: 'u-loja2', produtoId: 'p-2', quantidadeAtual: 3, quantidadeMinima: 5, dataAtualizacao: '2026-11-14T08:00:00' },
  { id: 'st-7', unidadeId: 'u-central', produtoId: 'p-5', quantidadeAtual: 25, quantidadeMinima: 10, dataAtualizacao: '2026-11-14T08:00:00' },
  { id: 'st-8', unidadeId: 'u-loja1', produtoId: 'p-5', quantidadeAtual: 1, quantidadeMinima: 4, dataAtualizacao: '2026-11-14T08:00:00' }
];

const INITIAL_USER: UserProfile = {
  email: 'marcelo.pf.barros@gmail.com',
  nome: 'Marcelo Barros',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
  role: 'ADMIN',
  unidadePadraoId: 'u-central',
  autenticadoGoogle: true,
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

  static getUserProfile(): UserProfile {
    return this.load('user', INITIAL_USER);
  }

  static saveUserProfile(user: UserProfile): void {
    const { senha: _omitPin, ...safeUser } = user;
    this.save('user', safeUser);
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
    return this.load('users', [
      {
        ...INITIAL_USER,
        id: 'usr-1',
        ativo: true,
        unidadesPermitidas: ['u-central', 'u-loja1', 'u-loja2']
      }
    ]);
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
