import * as XLSX from 'xlsx';
import { Order, Product, Category, StoreUnit, StockItem, StockMovement, Customer, ProductionOrder, UserProfile, OrderFinancialRecord, FinancialPaymentChannel } from '../types';
import { formatDeliveryTimeRange } from '../utils/deliveryTimeRange';
import { formatCurrencyBR } from '../components/CurrencyInput';
import { isLowStockItem } from '../utils/stockAvailability';

export interface FullBackupPayload {
  units?: StoreUnit[];
  categories?: Category[];
  products?: Product[];
  orders?: Order[];
  stock?: StockItem[];
  stockMovements?: StockMovement[];
  customers?: Customer[];
  productionOrders?: ProductionOrder[];
  users?: UserProfile[];
  financialChannels?: FinancialPaymentChannel[];
  financialRecords?: OrderFinancialRecord[];
  appConfigs?: Record<string, unknown>;
  deliveryFeeZones?: Array<Record<string, unknown>>;
}

export interface LastBackupMeta {
  exportedAt: string;
  exportedBy: string;
  format: 'XLSX' | 'JSON';
  totalRecords: number;
}

function sanitizeUsersForBackup(users: UserProfile[] = []): UserProfile[] {
  return users.map(u => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    role: u.role,
    unidadePadraoId: u.unidadePadraoId,
    unidadesPermitidas: Array.isArray(u.unidadesPermitidas) ? u.unidadesPermitidas : [],
    ativo: u.ativo !== false,
    avatarUrl: u.avatarUrl || '',
    autenticadoGoogle: false
  }));
}

function countBackupRecords(payload: FullBackupPayload): number {
  return (
    (payload.units?.length || 0) +
    (payload.categories?.length || 0) +
    (payload.products?.length || 0) +
    (payload.orders?.length || 0) +
    (payload.stock?.length || 0) +
    (payload.stockMovements?.length || 0) +
    (payload.customers?.length || 0) +
    (payload.productionOrders?.length || 0) +
    (payload.users?.length || 0) +
    (payload.financialChannels?.length || 0) +
    (payload.financialRecords?.length || 0) +
    Object.keys(payload.appConfigs || {}).length +
    (payload.deliveryFeeZones?.length || 0)
  );
}

export class ExcelService {
  /**
   * Exporta catálogo de produtos para .xlsx
   */
  static exportProducts(products: Product[], categories: Category[]): void {
    const catMap = new Map(categories.map(c => [c.id, c.nome]));
    const data = products.map(p => ({
      'Código SKU': p.sku,
      'Descrição do Produto': p.descricao,
      'Categoria': catMap.get(p.categoriaId) || 'Outros',
      'Preço Unitário (R$)': p.precoUnitario,
      'Unidade': p.unidade,
      'Tempo de Produção (Min)': p.tempoProducaoMinutos,
      'Ativo (SIM/NAO)': p.ativo ? 'SIM' : 'NÃO',
      'URL da Imagem': p.fotoUrl
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    XLSX.writeFile(wb, `Beju_Caramelos_Cardapio_Produtos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Importa catálogo de produtos a partir de um arquivo .xlsx
   */
  static async importProducts(file: File, categories: Category[]): Promise<Product[]> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rawData: any[] = XLSX.utils.sheet_to_json(ws);

    const catNameMap = new Map(categories.map(c => [c.nome.toLowerCase().trim(), c.id]));
    const fallbackCatId = categories[0]?.id || 'cat-1';

    return rawData.map((row, index) => {
      const catName = String(row['Categoria'] || '').toLowerCase().trim();
      const categoriaId = catNameMap.get(catName) || fallbackCatId;

      return {
        id: `p-imp-${Date.now()}-${index}`,
        sku: String(row['Código SKU'] || row['SKU'] || `SKU-${index + 1}`),
        descricao: String(row['Descrição do Produto'] || row['Descricao'] || row['Produto'] || 'Produto Sem Nome'),
        fotoUrl: String(row['URL da Imagem'] || row['Foto'] || 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=400&q=80'),
        precoUnitario: Number(row['Preço Unitário (R$)'] || row['Preco'] || 0),
        unidade: (row['Unidade'] || 'UN') as any,
        categoriaId,
        tempoProducaoMinutos: Number(row['Tempo de Produção (Min)'] || 30),
        ativo: String(row['Ativo (SIM/NAO)'] || 'SIM').toUpperCase() !== 'NÃO'
      };
    });
  }

  /**
   * Exporta pedidos para .xlsx
   */
  static exportOrders(orders: Order[], products: Product[], units: StoreUnit[]): void {
    const unitMap = new Map(units.map(u => [u.id, u.nome]));
    const prodMap = new Map(products.map(p => [p.id, p.descricao]));

    const data = orders.map(o => {
      const itensDesc = o.itens
        .map(i => `${i.quantidade}x ${prodMap.get(i.produtoId) || 'Item'} (R$ ${formatCurrencyBR(i.subtotal)})`)
        .join(' | ');

      return {
        'Nº Pedido': o.numeroPedido,
        'Status': o.status,
        'Data do Registro': new Date(o.dataPedido).toLocaleString('pt-BR'),
        'Data/Hora Entrega': formatDeliveryTimeRange(o.dataHoraEntrega, o.dataHoraEntregaFim, {
          tipoEntrega: o.tipoEntrega,
          turnoEntrega: o.tipoEntrega === 'DELIVERY' ? o.turnoEntrega : undefined
        }),
        'Turno Entrega': o.tipoEntrega === 'DELIVERY' ? (o.turnoEntrega || '-') : '-',
        'Modalidade': o.tipoEntrega === 'DELIVERY' ? 'Entrega' : 'Retirada',
        'Unidade': unitMap.get(o.unidadeOrigemId) || 'Não especificada',
        'Cliente': o.clienteNome,
        'Telefone WhatsApp': o.clienteTelefone,
        'Endereço de Entrega': o.enderecoEntrega || o.clienteEndereco || '-',
        'Detalhe de Entrega': o.detalheEntrega || '-',
        'Itens do Pedido': itensDesc,
        'Subtotal (R$)': o.valorSubtotal,
        'Taxa de Entrega (R$)': o.taxaEntrega,
        'Desconto (R$)': o.desconto,
        'Total (R$)': o.valorTotal,
        'Forma de Pagamento': o.formaPagamento.toUpperCase(),
        'Troco Para (R$)': o.trocoPara || '-',
        'Observações': o.observacoes || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
    XLSX.writeFile(wb, `Beju_Caramelos_Pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Exporta controle de estoque consolidado por loja para .xlsx
   */
  static exportStock(stock: StockItem[], products: Product[], units: StoreUnit[]): void {
    const prodMap = new Map(products.map(p => [p.id, p]));
    const unitMap = new Map(units.map(u => [u.id, u.nome]));

    const data = stock.map(s => {
      const prod = prodMap.get(s.produtoId);
      return {
        'Loja / Unidade': unitMap.get(s.unidadeId) || s.unidadeId,
        'SKU': prod?.sku || '-',
        'Produto': prod?.descricao || 'Produto não encontrado',
        'Quantidade Atual': s.quantidadeAtual,
        'Unidade de Medida': prod?.unidade || 'UN',
        'Quantidade Mínima': s.quantidadeMinima,
        'Status do Estoque': isLowStockItem(s) ? 'ALERTA MÍNIMO' : 'NORMAL',
        'Última Atualização': new Date(s.dataAtualizacao).toLocaleString('pt-BR')
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    XLSX.writeFile(wb, `Beju_Caramelos_Estoque_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Exporta Backup Completo do Banco de Dados em .xlsx (Múltiplas Abas)
   */
  static exportFullBackup(
    units: StoreUnit[],
    categories: Category[],
    products: Product[],
    orders: Order[],
    stock: StockItem[],
    customers: Customer[] = [],
    productionOrders: ProductionOrder[] = [],
    users: UserProfile[] = [],
    financialRecords: OrderFinancialRecord[] = [],
    financialChannels: FinancialPaymentChannel[] = [],
    stockMovements: StockMovement[] = [],
    appConfigs: Record<string, unknown> = {},
    deliveryFeeZones: Array<Record<string, unknown>> = []
  ): void {
    const wb = XLSX.utils.book_new();

    // 1. Aba Unidades
    const wsUnits = XLSX.utils.json_to_sheet(units.map(u => ({
      'ID': u.id,
      'Código': u.codigo,
      'Nome da Loja': u.nome,
      'Tipo': u.tipo,
      'Endereço': u.endereco,
      'Cidade': u.cidade,
      'Telefone': u.telefone,
      'Chave PIX': u.chavePix,
      'Ativo': u.ativo ? 'SIM' : 'NÃO'
    })));
    XLSX.utils.book_append_sheet(wb, wsUnits, 'Lojas_Unidades');

    // 2. Aba Categorias
    const wsCats = XLSX.utils.json_to_sheet(categories.map(c => ({
      'ID': c.id,
      'Nome': c.nome,
      'Ordem': c.ordem,
      'Ativo': c.ativo ? 'SIM' : 'NÃO'
    })));
    XLSX.utils.book_append_sheet(wb, wsCats, 'Categorias');

    // 3. Aba Produtos
    const wsProds = XLSX.utils.json_to_sheet(products.map(p => ({
      'ID': p.id,
      'SKU': p.sku,
      'Descrição': p.descricao,
      'Categoria ID': p.categoriaId,
      'Preço Unitário (R$)': p.precoUnitario,
      'Unidade': p.unidade,
      'Tempo Produção (min)': p.tempoProducaoMinutos,
      'Foto URL': p.fotoUrl,
      'Ativo': p.ativo ? 'SIM' : 'NÃO'
    })));
    XLSX.utils.book_append_sheet(wb, wsProds, 'Produtos');

    // 4. Aba Pedidos
    const wsOrders = XLSX.utils.json_to_sheet(orders.map(o => ({
      'ID': o.id,
      'Nº Pedido': o.numeroPedido,
      'Status': o.status,
      'Data do Pedido': o.dataPedido,
      'Data/Hora Entrega': o.dataHoraEntrega,
      'Data/Hora Entrega Fim': o.dataHoraEntregaFim || '',
      'Turno Entrega': o.turnoEntrega || '',
      'Tipo de Entrega': o.tipoEntrega,
      'Unidade ID': o.unidadeOrigemId,
      'Unidade Retirada ID': o.unidadeRetiradaId || '',
      'Cliente': o.clienteNome,
      'Telefone': o.clienteTelefone,
      'Endereço': o.enderecoEntrega || o.clienteEndereco || '',
      'Detalhe Entrega': o.detalheEntrega || '',
      'Subtotal': o.valorSubtotal,
      'Taxa Entrega': o.taxaEntrega,
      'Desconto': o.desconto,
      'Total': o.valorTotal,
      'Forma Pagamento': o.formaPagamento,
      'Status Pagamento': o.statusPagamento || 'PENDENTE',
      'Valor Pago': o.valorPago ?? '',
      'Troco': o.trocoPara || '',
      'Observações': o.observacoes || '',
      'Itens JSON': JSON.stringify(o.itens)
    })));
    XLSX.utils.book_append_sheet(wb, wsOrders, 'Pedidos');

    // 5. Aba Estoque
    const wsStock = XLSX.utils.json_to_sheet(stock.map(s => ({
      'ID': s.id,
      'Unidade ID': s.unidadeId,
      'Produto ID': s.produtoId,
      'Quantidade Atual': s.quantidadeAtual,
      'Quantidade Mínima': s.quantidadeMinima,
      'Data Atualização': s.dataAtualizacao
    })));
    XLSX.utils.book_append_sheet(wb, wsStock, 'Estoque');

    // 6. Aba Clientes
    const wsCustomers = XLSX.utils.json_to_sheet(customers.map(c => ({
      'ID': c.id,
      'Nome': c.nome,
      'Telefone': c.telefone,
      'CEP': c.cep || '',
      'Endereço': c.endereco,
      'Detalhe Entrega': c.detalheEntrega || '',
      'Observações': c.observacoes || '',
      'Criado Em': c.createdAt || ''
    })));
    XLSX.utils.book_append_sheet(wb, wsCustomers, 'Clientes');

    // 7. Aba Ordens de Produção
    const wsProdOrders = XLSX.utils.json_to_sheet(productionOrders.map(po => ({
      'ID': po.id,
      'Código OP': po.codigoOrdem,
      'Unidade ID': po.unidadeId,
      'Data Produção': po.dataProducao,
      'Turno': po.turno,
      'Status': po.status,
      'Observações': po.observacoes || '',
      'Itens JSON': JSON.stringify(po.itens || []),
      'Status Itens JSON': JSON.stringify(po.itemStatuses || {})
    })));
    XLSX.utils.book_append_sheet(wb, wsProdOrders, 'Ordens_Producao');

    // 8. Aba Usuários
    const wsUsers = XLSX.utils.json_to_sheet(users.map(u => ({
      'ID': u.id || '',
      'Nome': u.nome,
      'E-mail': u.email,
      'Cargo': u.role,
      'Unidade Padrão ID': u.unidadePadraoId || '',
      'Unidades Permitidas JSON': JSON.stringify(u.unidadesPermitidas || []),
      'Ativo': u.ativo !== false ? 'SIM' : 'NÃO',
      'Avatar URL': u.avatarUrl || ''
    })));
    XLSX.utils.book_append_sheet(wb, wsUsers, 'Usuarios');

    // 9. Aba Meios de Pagamento Financeiro
    const wsFinChannels = XLSX.utils.json_to_sheet(financialChannels.map(ch => ({
      'ID': ch.id,
      'Nome': ch.nome,
      'Categoria': ch.categoria,
      'Exige NF Padrão': ch.exigeNfPadrao ? 'SIM' : 'NÃO',
      'Ativo': ch.ativo ? 'SIM' : 'NÃO',
      'Ordem': ch.ordem
    })));
    XLSX.utils.book_append_sheet(wb, wsFinChannels, 'Meios_Pagamento_Financeiro');

    // 10. Aba Financeiro Pedidos (Conciliação & NF)
    const wsFinRecords = XLSX.utils.json_to_sheet(financialRecords.map(rec => ({
      'ID': rec.id,
      'Pedido ID': rec.pedidoId,
      'Status Conciliação': rec.conciliacaoStatus,
      'Meio Pagamento ID': rec.meioPagamentoId || '',
      'Meio Pagamento': rec.meioPagamentoNome || '',
      'Data Pagamento': rec.dataPagamento || '',
      'Data Extrato': rec.dataExtrato || '',
      'Valor Conciliado': rec.valorConciliado,
      'Lançamentos JSON': JSON.stringify(rec.lancamentos || []),
      'Ref. Extrato': rec.referenciaExtrato || '',
      'Status NF': rec.nfStatus,
      'Data Emissão NF': rec.nfDataEmissao || '',
      'Obs. NF': rec.nfObservacoes || '',
      'Observações': rec.observacoes || ''
    })));
    XLSX.utils.book_append_sheet(wb, wsFinRecords, 'Financeiro_Pedidos');

    // 11. Aba Movimentações de Estoque
    const wsMovs = XLSX.utils.json_to_sheet(stockMovements.map(m => ({
      'ID': m.id,
      'Unidade ID': m.unidadeId,
      'Produto ID': m.produtoId,
      'Tipo': m.tipo,
      'Quantidade': m.quantidade,
      'Motivo': m.motivo || '',
      'Referência ID': m.referenciaId || '',
      'Data': m.dataMovimentacao
    })));
    XLSX.utils.book_append_sheet(wb, wsMovs, 'Movimentacoes_Estoque');

    // 12. Aba Configurações do App (Metas & Cardápio)
    const wsAppCfg = XLSX.utils.json_to_sheet(
      Object.entries(appConfigs || {}).map(([chave, valor]) => ({
        'Chave': chave,
        'Valor JSON': JSON.stringify(valor ?? null)
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsAppCfg, 'App_Configuracoes');

    // 13. Aba Taxas de Entrega por Bairro
    const wsDeliveryZones = XLSX.utils.json_to_sheet(
      deliveryFeeZones.map(z => ({
        'ID': z.id ? String(z.id) : '',
        'Bairro': z.bairro ? String(z.bairro) : '',
        'Bairro Normalizado': z.bairro_normalizado ? String(z.bairro_normalizado) : '',
        'CEP Prefixo': z.cep_prefixo ? String(z.cep_prefixo) : '',
        'Unidade Atendimento ID': z.unidade_atendimento_id ? String(z.unidade_atendimento_id) : '',
        'Taxa Entrega': Number(z.taxa_entrega || 0),
        'Tempo Estimado (min)': z.tempo_estimado_minutos ?? '',
        'Ativo': z.ativo !== false ? 'SIM' : 'NÃO',
        'Criado Em': z.created_at ? String(z.created_at) : ''
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsDeliveryZones, 'Taxas_Entrega_Bairros');

    XLSX.writeFile(wb, `Beju_Caramelos_Backup_Completo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Exporta Snapshot Completo sem perdas em .json (imune ao limite de 32k caracteres do Excel)
   */
  static exportFullBackupJson(payload: FullBackupPayload, exportedBy = 'Operador'): LastBackupMeta {
    const exportedAt = new Date().toISOString();
    const sanitizedPayload: FullBackupPayload = {
      ...payload,
      users: payload.users ? sanitizeUsersForBackup(payload.users) : []
    };
    const meta: LastBackupMeta = {
      exportedAt,
      exportedBy,
      format: 'JSON',
      totalRecords: countBackupRecords(sanitizedPayload)
    };
    const documentObj = {
      schemaVersion: 2,
      app: 'Beju Caramelos (JuJu Delivery)',
      exportedAt,
      exportedBy,
      data: sanitizedPayload
    };
    const jsonText = JSON.stringify(documentObj, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Beju_Caramelos_Backup_Completo_${exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return meta;
  }

  /**
   * Importa Snapshot Completo a partir de arquivo .json
   */
  static async importFullBackupJson(file: File): Promise<FullBackupPayload> {
    const rawText = await file.text();
    const parsed = JSON.parse(rawText);
    const dataObj = parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object'
      ? parsed.data
      : parsed;

    if (!dataObj || typeof dataObj !== 'object') {
      throw new Error('Estrutura de snapshot JSON inválida.');
    }

    const expectedKeys: Array<keyof FullBackupPayload> = [
      'units',
      'categories',
      'products',
      'orders',
      'stock',
      'stockMovements',
      'customers',
      'productionOrders',
      'users',
      'financialChannels',
      'financialRecords',
      'appConfigs',
      'deliveryFeeZones'
    ];
    const hasKnownKey = expectedKeys.some(k => k in dataObj);
    if (!hasKnownKey) {
      throw new Error('Arquivo JSON não corresponde a um backup do Beju Caramelos.');
    }

    const result: FullBackupPayload = {
      units: Array.isArray(dataObj.units) ? dataObj.units : undefined,
      categories: Array.isArray(dataObj.categories) ? dataObj.categories : undefined,
      products: Array.isArray(dataObj.products) ? dataObj.products : undefined,
      orders: Array.isArray(dataObj.orders) ? dataObj.orders : undefined,
      stock: Array.isArray(dataObj.stock) ? dataObj.stock : undefined,
      stockMovements: Array.isArray(dataObj.stockMovements) ? dataObj.stockMovements : undefined,
      customers: Array.isArray(dataObj.customers) ? dataObj.customers : undefined,
      productionOrders: Array.isArray(dataObj.productionOrders) ? dataObj.productionOrders : undefined,
      users: Array.isArray(dataObj.users) ? sanitizeUsersForBackup(dataObj.users) : undefined,
      financialChannels: Array.isArray(dataObj.financialChannels) ? dataObj.financialChannels : undefined,
      financialRecords: Array.isArray(dataObj.financialRecords) ? dataObj.financialRecords : undefined,
      appConfigs: dataObj.appConfigs && typeof dataObj.appConfigs === 'object' ? dataObj.appConfigs : undefined,
      deliveryFeeZones: Array.isArray(dataObj.deliveryFeeZones) ? dataObj.deliveryFeeZones : undefined
    };
    return result;
  }

  /**
   * Importa e restaura o banco de dados a partir de um backup .xlsx
   */
  static async importFullBackup(file: File): Promise<FullBackupPayload> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const result: any = {};

    if (wb.SheetNames.includes('Lojas_Unidades')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Lojas_Unidades']) as any[];
      result.units = raw.map(r => ({
        id: String(r['ID'] || `u-${Date.now()}`),
        codigo: String(r['Código'] || 'LOJA'),
        nome: String(r['Nome da Loja'] || 'Filial'),
        tipo: (r['Tipo'] || 'LOJA') as any,
        endereco: String(r['Endereço'] || ''),
        cidade: String(r['Cidade'] || 'São Paulo'),
        telefone: String(r['Telefone'] || ''),
        chavePix: String(r['Chave PIX'] || ''),
        ativo: String(r['Ativo'] || 'SIM').toUpperCase() === 'SIM'
      }));
    }

    if (wb.SheetNames.includes('Categorias')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Categorias']) as any[];
      result.categories = raw.map(r => ({
        id: String(r['ID'] || `cat-${Date.now()}`),
        nome: String(r['Nome'] || 'Categoria'),
        ordem: Number(r['Ordem'] || 0),
        ativo: String(r['Ativo'] || 'SIM').toUpperCase() === 'SIM'
      }));
    }

    if (wb.SheetNames.includes('Produtos')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Produtos']) as any[];
      result.products = raw.map(r => ({
        id: String(r['ID'] || `p-${Date.now()}`),
        sku: String(r['SKU'] || ''),
        descricao: String(r['Descrição'] || ''),
        categoriaId: String(r['Categoria ID'] || 'cat-1'),
        precoUnitario: Number(r['Preço Unitário (R$)'] || 0),
        unidade: (r['Unidade'] || 'UN') as any,
        tempoProducaoMinutos: Number(r['Tempo Produção (min)'] || 30),
        fotoUrl: String(r['Foto URL'] || ''),
        ativo: String(r['Ativo'] || 'SIM').toUpperCase() === 'SIM'
      }));
    }

    if (wb.SheetNames.includes('Pedidos')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Pedidos']) as any[];
      result.orders = raw.map(r => {
        let itens = [];
        try {
          itens = JSON.parse(r['Itens JSON'] || '[]');
        } catch {
          itens = [];
        }
        return {
          id: String(r['ID'] || `ord-${Date.now()}`),
          numeroPedido: String(r['Nº Pedido'] || '#PED-0000'),
          status: (r['Status'] || 'PENDENTE') as any,
          dataPedido: String(r['Data do Pedido'] || new Date().toISOString()),
          dataHoraEntrega: String(r['Data/Hora Entrega'] || new Date().toISOString()),
          dataHoraEntregaFim: r['Data/Hora Entrega Fim'] ? String(r['Data/Hora Entrega Fim']) : undefined,
          turnoEntrega: r['Turno Entrega'] ? (String(r['Turno Entrega']) as any) : undefined,
          tipoEntrega: (r['Tipo de Entrega'] || 'DELIVERY') as any,
          unidadeOrigemId: String(r['Unidade ID'] || 'u-central'),
          unidadeRetiradaId: r['Unidade Retirada ID'] ? String(r['Unidade Retirada ID']) : undefined,
          clienteNome: String(r['Cliente'] || 'Cliente'),
          clienteTelefone: String(r['Telefone'] || ''),
          enderecoEntrega: String(r['Endereço'] || ''),
          detalheEntrega: r['Detalhe Entrega'] ? String(r['Detalhe Entrega']) : undefined,
          valorSubtotal: Number(r['Subtotal'] || 0),
          taxaEntrega: Number(r['Taxa Entrega'] || 0),
          desconto: Number(r['Desconto'] || 0),
          valorTotal: Number(r['Total'] || 0),
          formaPagamento: (r['Forma Pagamento'] || 'pix') as any,
          statusPagamento: r['Status Pagamento'] ? (String(r['Status Pagamento']) as any) : undefined,
          valorPago: r['Valor Pago'] !== '' && r['Valor Pago'] !== undefined ? Number(r['Valor Pago']) : undefined,
          trocoPara: r['Troco'] ? Number(r['Troco']) : undefined,
          observacoes: String(r['Observações'] || ''),
          itens
        };
      });
    }

    if (wb.SheetNames.includes('Estoque')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Estoque']) as any[];
      result.stock = raw.map(r => ({
        id: String(r['ID'] || `st-${Date.now()}`),
        unidadeId: String(r['Unidade ID'] || 'u-central'),
        produtoId: String(r['Produto ID'] || ''),
        quantidadeAtual: Number(r['Quantidade Atual'] || 0),
        quantidadeMinima: Number(r['Quantidade Mínima'] || 5),
        dataAtualizacao: String(r['Data Atualização'] || new Date().toISOString())
      }));
    }

    if (wb.SheetNames.includes('Clientes')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Clientes']) as any[];
      result.customers = raw.map(r => ({
        id: String(r['ID'] || `cli-${Date.now()}`),
        nome: String(r['Nome'] || ''),
        telefone: String(r['Telefone'] || ''),
        cep: String(r['CEP'] || '') || undefined,
        endereco: String(r['Endereço'] || ''),
        detalheEntrega: String(r['Detalhe Entrega'] || '') || undefined,
        observacoes: String(r['Observações'] || '') || undefined,
        createdAt: String(r['Criado Em'] || '') || undefined
      }));
    }

    if (wb.SheetNames.includes('Ordens_Producao')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Ordens_Producao']) as any[];
      result.productionOrders = raw.map(r => {
        let itens = [];
        let itemStatuses = {};
        try { itens = JSON.parse(r['Itens JSON'] || '[]'); } catch { itens = []; }
        try { itemStatuses = JSON.parse(r['Status Itens JSON'] || '{}'); } catch { itemStatuses = {}; }
        return {
          id: String(r['ID'] || `op-${Date.now()}`),
          codigoOrdem: String(r['Código OP'] || ''),
          unidadeId: String(r['Unidade ID'] || 'u-central'),
          dataProducao: String(r['Data Produção'] || new Date().toISOString().slice(0, 10)),
          turno: (r['Turno'] || 'MANHA') as any,
          status: (r['Status'] || 'PLANEJADA') as any,
          observacoes: String(r['Observações'] || '') || undefined,
          itens,
          itemStatuses
        };
      });
    }

    if (wb.SheetNames.includes('Usuarios')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Usuarios']) as any[];
      result.users = raw.map(r => {
        let unidadesPermitidas: string[] = [];
        try { unidadesPermitidas = JSON.parse(r['Unidades Permitidas JSON'] || '[]'); } catch { unidadesPermitidas = []; }
        return {
          id: String(r['ID'] || `usr-${Date.now()}`),
          nome: String(r['Nome'] || ''),
          email: String(r['E-mail'] || ''),
          role: (r['Cargo'] || 'ATENDIMENTO') as any,
          unidadePadraoId: String(r['Unidade Padrão ID'] || ''),
          unidadesPermitidas,
          ativo: String(r['Ativo'] || 'SIM').toUpperCase() === 'SIM',
          avatarUrl: String(r['Avatar URL'] || ''),
          autenticadoGoogle: false
        };
      });
    }

    if (wb.SheetNames.includes('Meios_Pagamento_Financeiro')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Meios_Pagamento_Financeiro']) as any[];
      result.financialChannels = raw.map(r => ({
        id: String(r['ID'] || `fin-ch-${Date.now()}`),
        nome: String(r['Nome'] || ''),
        categoria: (r['Categoria'] || 'OUTROS') as any,
        exigeNfPadrao: String(r['Exige NF Padrão'] || 'SIM').toUpperCase() === 'SIM',
        ativo: String(r['Ativo'] || 'SIM').toUpperCase() === 'SIM',
        ordem: Number(r['Ordem'] || 0)
      }));
    }

    if (wb.SheetNames.includes('Financeiro_Pedidos')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Financeiro_Pedidos']) as any[];
      result.financialRecords = raw.map(r => {
        let lancamentos = [];
        try { lancamentos = JSON.parse(r['Lançamentos JSON'] || '[]'); } catch { lancamentos = []; }
        return {
          id: String(r['ID'] || `fin-${Date.now()}`),
          pedidoId: String(r['Pedido ID'] || ''),
          conciliacaoStatus: (r['Status Conciliação'] || 'PENDENTE') as any,
          meioPagamentoId: r['Meio Pagamento ID'] ? String(r['Meio Pagamento ID']) : undefined,
          meioPagamentoNome: r['Meio Pagamento'] ? String(r['Meio Pagamento']) : undefined,
          dataPagamento: r['Data Pagamento'] ? String(r['Data Pagamento']) : undefined,
          dataExtrato: r['Data Extrato'] ? String(r['Data Extrato']) : undefined,
          valorConciliado: Number(r['Valor Conciliado'] || 0),
          lancamentos,
          referenciaExtrato: r['Ref. Extrato'] ? String(r['Ref. Extrato']) : undefined,
          nfStatus: (r['Status NF'] || 'PENDENTE') as any,
          nfDataEmissao: r['Data Emissão NF'] ? String(r['Data Emissão NF']) : undefined,
          nfObservacoes: r['Obs. NF'] ? String(r['Obs. NF']) : undefined,
          observacoes: r['Observações'] ? String(r['Observações']) : undefined
        };
      });
    }

    if (wb.SheetNames.includes('Movimentacoes_Estoque')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Movimentacoes_Estoque']) as any[];
      result.stockMovements = raw.map(r => ({
        id: String(r['ID'] || `mov-${Date.now()}`),
        unidadeId: String(r['Unidade ID'] || r['Unidade Origem ID'] || ''),
        produtoId: String(r['Produto ID'] || ''),
        tipo: (r['Tipo'] || 'ENTRADA') as any,
        quantidade: Number(r['Quantidade'] || 0),
        motivo: r['Motivo'] ? String(r['Motivo']) : undefined,
        referenciaId: r['Referência ID'] ? String(r['Referência ID']) : undefined,
        dataMovimentacao: String(r['Data'] || new Date().toISOString())
      }));
    }

    if (wb.SheetNames.includes('App_Configuracoes')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['App_Configuracoes']) as any[];
      const cfgMap: Record<string, unknown> = {};
      raw.forEach(r => {
        const key = String(r['Chave'] || '').trim();
        if (!key) return;
        try {
          cfgMap[key] = JSON.parse(String(r['Valor JSON'] || 'null'));
        } catch {
          cfgMap[key] = r['Valor JSON'];
        }
      });
      result.appConfigs = cfgMap;
    }

    if (wb.SheetNames.includes('Taxas_Entrega_Bairros')) {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Taxas_Entrega_Bairros']) as any[];
      result.deliveryFeeZones = raw.map(r => ({
        id: r['ID'] ? String(r['ID']) : undefined,
        bairro: String(r['Bairro'] || ''),
        bairro_normalizado: String(r['Bairro Normalizado'] || ''),
        cep_prefixo: r['CEP Prefixo'] ? String(r['CEP Prefixo']) : null,
        unidade_atendimento_id: r['Unidade Atendimento ID'] ? String(r['Unidade Atendimento ID']) : null,
        taxa_entrega: Number(r['Taxa Entrega'] || 0),
        tempo_estimado_minutos: r['Tempo Estimado (min)'] !== '' && r['Tempo Estimado (min)'] !== undefined
          ? Number(r['Tempo Estimado (min)'])
          : null,
        ativo: String(r['Ativo'] || 'SIM').toUpperCase() === 'SIM',
        created_at: r['Criado Em'] ? String(r['Criado Em']) : undefined
      }));
    }

    return result;
  }
}
