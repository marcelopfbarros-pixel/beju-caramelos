import * as XLSX from 'xlsx';
import { Order, Product, Category, StoreUnit, StockItem, Customer, ProductionOrder, UserProfile } from '../types';

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
        .map(i => `${i.quantidade}x ${prodMap.get(i.produtoId) || 'Item'} (R$ ${i.subtotal.toFixed(2)})`)
        .join(' | ');

      return {
        'Nº Pedido': o.numeroPedido,
        'Status': o.status,
        'Data do Registro': new Date(o.dataPedido).toLocaleString('pt-BR'),
        'Data/Hora Entrega': new Date(o.dataHoraEntrega).toLocaleString('pt-BR'),
        'Modalidade': o.tipoEntrega === 'DELIVERY' ? 'Entrega' : 'Retirada',
        'Unidade': unitMap.get(o.unidadeOrigemId) || 'Não especificada',
        'Cliente': o.clienteNome,
        'Telefone WhatsApp': o.clienteTelefone,
        'Endereço de Entrega': o.enderecoEntrega || o.clienteEndereco || '-',
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
        'Status do Estoque': s.quantidadeAtual <= s.quantidadeMinima ? 'ALERTA MÍNIMO' : 'NORMAL',
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
    users: UserProfile[] = []
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
      'Tipo de Entrega': o.tipoEntrega,
      'Unidade ID': o.unidadeOrigemId,
      'Cliente': o.clienteNome,
      'Telefone': o.clienteTelefone,
      'Endereço': o.enderecoEntrega || o.clienteEndereco || '',
      'Subtotal': o.valorSubtotal,
      'Taxa Entrega': o.taxaEntrega,
      'Desconto': o.desconto,
      'Total': o.valorTotal,
      'Forma Pagamento': o.formaPagamento,
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
      'Endereço': c.endereco,
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

    XLSX.writeFile(wb, `Beju_Caramelos_Backup_Completo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /**
   * Importa e restaura o banco de dados a partir de um backup .xlsx
   */
  static async importFullBackup(file: File): Promise<{
    units?: StoreUnit[];
    categories?: Category[];
    products?: Product[];
    orders?: Order[];
    stock?: StockItem[];
    customers?: Customer[];
    productionOrders?: ProductionOrder[];
    users?: UserProfile[];
  }> {
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
          tipoEntrega: (r['Tipo de Entrega'] || 'DELIVERY') as any,
          unidadeOrigemId: String(r['Unidade ID'] || 'u-central'),
          clienteNome: String(r['Cliente'] || 'Cliente'),
          clienteTelefone: String(r['Telefone'] || ''),
          enderecoEntrega: String(r['Endereço'] || ''),
          valorSubtotal: Number(r['Subtotal'] || 0),
          taxaEntrega: Number(r['Taxa Entrega'] || 0),
          desconto: Number(r['Desconto'] || 0),
          valorTotal: Number(r['Total'] || 0),
          formaPagamento: (r['Forma Pagamento'] || 'pix') as any,
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
        endereco: String(r['Endereço'] || ''),
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

    return result;
  }
}
