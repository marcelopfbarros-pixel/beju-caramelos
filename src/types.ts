export type PaymentMethod = 'pix' | 'debito' | 'credito' | 'dinheiro';

export type PaymentStatus = 'PENDENTE' | 'SINAL' | 'PAGO';

export type OrderStatus = 
  | 'PENDENTE' 
  | 'CONFIRMADO' 
  | 'EM_PRODUCAO' 
  | 'PRONTO' 
  | 'EM_ROTA' 
  | 'ENTREGUE' 
  | 'CANCELADO';

export type DeliveryType = 'DELIVERY' | 'RETIRADA';

export type DeliveryShift = 'MANHA' | 'TARDE' | 'NOITE';

export type ProductUnit = 'UN' | 'KG' | 'G' | 'CENTO' | 'CX';

export interface StoreUnit {
  id: string;
  codigo: string;
  nome: string;
  tipo: 'CENTRAL' | 'LOJA';
  cep?: string;
  endereco: string;
  cidade: string;
  telefone: string;
  chavePix: string;
  ativo: boolean;
}

export interface Category {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

export interface Product {
  id: string;
  sku: string;
  descricao: string;
  fotoUrl: string;
  precoUnitario: number;
  unidade: ProductUnit;
  categoriaId: string;
  tempoProducaoMinutos: number;
  ativo: boolean;
}

export interface OrderItem {
  id: string;
  produtoId: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
  observacoes?: string;
}

export interface Order {
  id: string;
  numeroPedido: string;
  status: OrderStatus;
  dataPedido: string;
  dataHoraEntrega: string;
  dataHoraEntregaFim?: string;
  turnoEntrega?: DeliveryShift;
  tipoEntrega: DeliveryType;
  unidadeOrigemId: string;
  unidadeRetiradaId?: string;
  clienteNome: string;
  clienteTelefone: string;
  clienteEndereco?: string;
  enderecoEntrega?: string;
  valorSubtotal: number;
  taxaEntrega: number;
  desconto: number;
  valorTotal: number;
  formaPagamento: PaymentMethod;
  statusPagamento?: PaymentStatus;
  valorPago?: number;
  trocoPara?: number;
  instrucoesPagamento?: string;
  observacoes?: string;
  detalheEntrega?: string;
  itens: OrderItem[];
}

export interface StockItem {
  id: string;
  unidadeId: string;
  produtoId: string;
  quantidadeAtual: number;
  quantidadeMinima: number;
  dataAtualizacao: string;
}

export type StockMovementType = 'ENTRADA' | 'SAIDA' | 'AJUSTE';

export interface StockMovement {
  id: string;
  unidadeId: string;
  produtoId: string;
  tipo: StockMovementType;
  quantidade: number;
  motivo?: string;
  referenciaId?: string;
  dataMovimentacao: string;
}

export type ProductionShift = 'MANHA' | 'TARDE' | 'NOITE';
export type ProductionStatus = 'PLANEJADA' | 'EM_PREPARO' | 'CONCLUIDA';

export interface ProductionItem {
  produtoId: string;
  quantidadePlanejada: number;
  quantidadeProduzida: number;
  unidadeDestinoId?: string;
  pedidoOrigemNumero?: string;
}

export interface ProductionOrder {
  id: string;
  codigoOrdem: string;
  dataProducao: string;
  turno: ProductionShift;
  status: ProductionStatus;
  unidadeId: string;
  observacoes?: string;
  estoqueMovimentado?: boolean;
  itemStatuses?: Record<string, ProductionStatus>;
  itens: ProductionItem[];
}

export interface UserProfile {
  id?: string;
  email: string;
  nome: string;
  avatarUrl: string;
  role: 'ADMIN' | 'GERENTE' | 'ATENDIMENTO' | 'CONFEITEIRO';
  unidadePadraoId: string;
  autenticadoGoogle: boolean;
  ativo?: boolean;
  unidadesPermitidas?: string[];
  senha?: string;
}

export interface Customer {
  id: string;
  nome: string;
  telefone: string;
  cep?: string;
  endereco: string;
  detalheEntrega?: string;
  observacoes?: string;
  createdAt?: string;
}

// Key format: "YYYY-MM" (e.g. "2026-11"), value: target revenue in BRL
export type MonthlyRevenueGoals = Record<string, number>;

export interface CardapioIntroConfig {
  imageUrl: string;
  phrase: string;
  durationSeconds: number;
}

export interface CardapioThankYouConfig {
  imageUrl: string;
  phrase: string;
  durationSeconds: number;
}
