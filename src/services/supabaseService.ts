import { supabase, isSupabaseConfigured } from './supabaseClient';
import { 
  StoreUnit, 
  Category, 
  Product, 
  Order, 
  OrderItem, 
  StockItem, 
  StockMovement,
  UserProfile, 
  OrderStatus,
  ProductionOrder,
  ProductionShift,
  ProductionStatus,
  Customer
} from '../types';

export class SupabaseService {
  static isConfigured(): boolean {
    return isSupabaseConfigured && supabase !== null;
  }

  // ==========================================
  // UNIDADES / LOJAS
  // ==========================================
  static async getUnits(): Promise<StoreUnit[]> {
    if (!this.isConfigured()) return [];
    const { data, error } = await supabase!
      .from('empresas_unidades')
      .select('*')
      .order('codigo_unidade');

    if (error) {
      console.error('Erro ao buscar unidades do Supabase:', error);
      throw error;
    }

    return (data || []).map((u: any) => ({
      id: u.id,
      codigo: u.codigo_unidade,
      nome: u.nome,
      tipo: u.tipo,
      cep: u.cep || undefined,
      endereco: u.endereco,
      cidade: u.cidade,
      telefone: u.telefone_whatsapp,
      chavePix: u.chave_pix || '',
      ativo: u.ativo
    }));
  }

  static async saveUnit(unit: StoreUnit): Promise<StoreUnit> {
    if (!this.isConfigured()) return unit;

    const payload = {
      id: unit.id.startsWith('u-') ? undefined : unit.id,
      codigo_unidade: unit.codigo,
      nome: unit.nome,
      tipo: unit.tipo,
      cep: unit.cep || null,
      endereco: unit.endereco,
      cidade: unit.cidade,
      telefone_whatsapp: unit.telefone,
      chave_pix: unit.chavePix,
      ativo: unit.ativo
    };

    const { data, error } = await supabase!
      .from('empresas_unidades')
      .upsert(payload, { onConflict: 'codigo_unidade' })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      codigo: data.codigo_unidade,
      nome: data.nome,
      tipo: data.tipo,
      cep: data.cep || undefined,
      endereco: data.endereco,
      cidade: data.cidade,
      telefone: data.telefone_whatsapp,
      chavePix: data.chave_pix || '',
      ativo: data.ativo
    };
  }

  static async deleteUnit(unitId: string): Promise<void> {
    if (!this.isConfigured()) return;
    const { error } = await supabase!
      .from('empresas_unidades')
      .delete()
      .eq('id', unitId);
    if (error) throw error;
  }

  // ==========================================
  // CATEGORIAS
  // ==========================================
  static async getCategories(): Promise<Category[]> {
    if (!this.isConfigured()) return [];
    const { data, error } = await supabase!
      .from('categorias')
      .select('*')
      .order('ordem');

    if (error) {
      console.error('Erro ao buscar categorias do Supabase:', error);
      throw error;
    }

    return (data || []).map((c: any) => ({
      id: c.id,
      nome: c.nome,
      ordem: c.ordem,
      ativo: c.ativo
    }));
  }

  static async saveCategory(cat: Category): Promise<Category> {
    if (!this.isConfigured()) return cat;

    const payload = {
      id: cat.id.startsWith('cat-') ? undefined : cat.id,
      nome: cat.nome,
      ordem: cat.ordem,
      ativo: cat.ativo
    };

    const { data, error } = await supabase!
      .from('categorias')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      nome: data.nome,
      ordem: data.ordem,
      ativo: data.ativo
    };
  }

  static async deleteCategory(catId: string): Promise<void> {
    if (!this.isConfigured()) return;
    const { error } = await supabase!
      .from('categorias')
      .delete()
      .eq('id', catId);
    if (error) throw error;
  }

  // ==========================================
  // PRODUTOS
  // ==========================================
  static async getProducts(): Promise<Product[]> {
    if (!this.isConfigured()) return [];
    const { data, error } = await supabase!
      .from('produtos')
      .select('*')
      .order('codigo_sku');

    if (error) {
      console.error('Erro ao buscar produtos do Supabase:', error);
      throw error;
    }

    return (data || []).map((p: any) => ({
      id: p.id,
      sku: p.codigo_sku,
      descricao: p.descricao,
      fotoUrl: p.foto_url || '',
      precoUnitario: Number(p.preco_unitario),
      unidade: p.unidade_medida,
      categoriaId: p.categoria_id,
      tempoProducaoMinutos: p.tempo_producao_minutos || 30,
      ativo: p.ativo
    }));
  }

  static async saveProduct(prod: Product): Promise<Product> {
    if (!this.isConfigured()) return prod;

    const payload = {
      id: prod.id.startsWith('p-') ? undefined : prod.id,
      codigo_sku: prod.sku,
      descricao: prod.descricao,
      foto_url: prod.fotoUrl,
      preco_unitario: prod.precoUnitario,
      unidade_medida: prod.unidade,
      categoria_id: prod.categoriaId,
      tempo_producao_minutos: prod.tempoProducaoMinutos,
      ativo: prod.ativo
    };

    const { data, error } = await supabase!
      .from('produtos')
      .upsert(payload, { onConflict: 'codigo_sku' })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      sku: data.codigo_sku,
      descricao: data.descricao,
      fotoUrl: data.foto_url || '',
      precoUnitario: Number(data.preco_unitario),
      unidade: data.unidade_medida,
      categoriaId: data.categoria_id,
      tempoProducaoMinutos: data.tempo_producao_minutos,
      ativo: data.ativo
    };
  }

  static async deleteProduct(productId: string): Promise<void> {
    if (!this.isConfigured()) return;
    const { error } = await supabase!
      .from('produtos')
      .delete()
      .eq('id', productId);
    if (error) throw error;
  }

  // ==========================================
  // PEDIDOS & ITENS
  // ==========================================
  static async getOrders(): Promise<Order[]> {
    if (!this.isConfigured()) return [];
    
    // Fetch orders and nested items
    const { data, error } = await supabase!
      .from('pedidos')
      .select(`
        *,
        itens:itens_pedido (
          id,
          produto_id,
          quantidade,
          preco_unitario,
          subtotal,
          observacoes_item
        )
      `)
      .order('data_pedido', { ascending: false });

    if (error) {
      console.error('Erro ao buscar pedidos do Supabase:', error);
      throw error;
    }

    return (data || []).map((o: any) => ({
      id: o.id,
      numeroPedido: o.numero_pedido,
      status: o.status as OrderStatus,
      dataPedido: o.data_pedido,
      dataHoraEntrega: o.data_hora_entrega,
      tipoEntrega: o.tipo_entrega,
      unidadeOrigemId: o.unidade_origem_id,
      unidadeRetiradaId: o.unidade_retirada_id || undefined,
      clienteNome: o.cliente_nome,
      clienteTelefone: o.cliente_telefone,
      clienteEndereco: o.cliente_endereco || '',
      enderecoEntrega: o.endereco_entrega || '',
      valorSubtotal: Number(o.valor_subtotal),
      taxaEntrega: Number(o.taxa_entrega),
      desconto: Number(o.desconto),
      valorTotal: Number(o.valor_total),
      formaPagamento: o.forma_pagamento,
      trocoPara: o.troco_para ? Number(o.troco_para) : undefined,
      instrucoesPagamento: o.instrucoes_pagamento || '',
      observacoes: o.observacoes || '',
      detalheEntrega: o.detalhe_entrega || '',
      itens: (o.itens || []).map((i: any) => ({
        id: i.id,
        produtoId: i.produto_id,
        quantidade: Number(i.quantidade),
        precoUnitario: Number(i.preco_unitario),
        subtotal: Number(i.subtotal),
        observacoes: i.observacoes_item || undefined
      }))
    }));
  }

  static async saveOrder(order: Order): Promise<Order> {
    if (!this.isConfigured()) return order;

    const isUuid = (v?: string) =>
      Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));

    const hasValidId = isUuid(order.id);
    const normalizedDeliveryIso = order.dataHoraEntrega
      ? new Date(order.dataHoraEntrega).toISOString()
      : new Date().toISOString();

    const orderPayload: Record<string, any> = {
      numero_pedido: order.numeroPedido,
      status: order.status,
      data_pedido: order.dataPedido ? new Date(order.dataPedido).toISOString() : new Date().toISOString(),
      data_hora_entrega: normalizedDeliveryIso,
      tipo_entrega: order.tipoEntrega,
      unidade_origem_id: order.unidadeOrigemId,
      unidade_retirada_id: isUuid(order.unidadeRetiradaId) ? order.unidadeRetiradaId : null,
      cliente_nome: order.clienteNome,
      cliente_telefone: order.clienteTelefone,
      cliente_endereco: order.clienteEndereco || null,
      endereco_entrega: order.enderecoEntrega || null,
      valor_subtotal: order.valorSubtotal,
      taxa_entrega: order.taxaEntrega,
      desconto: order.desconto,
      valor_total: order.valorTotal,
      forma_pagamento: order.formaPagamento,
      troco_para: order.trocoPara ?? null,
      instrucoes_pagamento: order.instrucoesPagamento || null,
      observacoes: order.observacoes || null,
      detalhe_entrega: order.detalheEntrega || null,
      updated_at: new Date().toISOString()
    };

    let savedOrder: any;
    if (hasValidId) {
      const { data, error } = await supabase!
        .from('pedidos')
        .update(orderPayload)
        .eq('id', order.id)
        .select()
        .single();
      if (error) throw error;
      savedOrder = data;
    } else {
      const { data, error } = await supabase!
        .from('pedidos')
        .upsert(orderPayload, { onConflict: 'numero_pedido' })
        .select()
        .single();
      if (error) throw error;
      savedOrder = data;
    }

    // Remove old items and re-insert
    await supabase!.from('itens_pedido').delete().eq('pedido_id', savedOrder.id);

    if (order.itens && order.itens.length > 0) {
      const itemsPayload = order.itens.map(item => ({
        pedido_id: savedOrder.id,
        produto_id: item.produtoId,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario,
        subtotal: item.subtotal,
        observacoes_item: item.observacoes || null
      }));

      const { data: savedItems, error: itemsError } = await supabase!
        .from('itens_pedido')
        .insert(itemsPayload)
        .select();

      if (itemsError) throw itemsError;

      return {
        ...order,
        id: savedOrder.id,
        itens: (savedItems || []).map((i: any) => ({
          id: i.id,
          produtoId: i.produto_id,
          quantidade: Number(i.quantidade),
          precoUnitario: Number(i.preco_unitario),
          subtotal: Number(i.subtotal),
          observacoes: i.observacoes_item || undefined
        }))
      };
    }

    return { ...order, id: savedOrder.id };
  }

  static async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    if (!this.isConfigured()) return;
    const { error } = await supabase!
      .from('pedidos')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) throw error;
  }

  // ==========================================
  // ESTOQUE
  // ==========================================
  static async getStock(): Promise<StockItem[]> {
    if (!this.isConfigured()) return [];
    const { data, error } = await supabase!
      .from('estoque_unidades')
      .select('*');

    if (error) {
      console.error('Erro ao buscar estoque:', error);
      throw error;
    }

    return (data || []).map((s: any) => ({
      id: s.id,
      unidadeId: s.unidade_id,
      produtoId: s.produto_id,
      quantidadeAtual: Number(s.quantidade_atual),
      quantidadeMinima: Number(s.quantidade_minima),
      dataAtualizacao: s.data_atualizacao
    }));
  }

  static async saveStock(stockItems: StockItem[]): Promise<void> {
    if (!this.isConfigured() || stockItems.length === 0) return;

    const payload = stockItems.map(s => ({
      id: s.id.startsWith('st-') ? undefined : s.id,
      unidade_id: s.unidadeId,
      produto_id: s.produtoId,
      quantidade_atual: s.quantidadeAtual,
      quantidade_minima: s.quantidadeMinima,
      data_atualizacao: new Date().toISOString()
    }));

    const { error } = await supabase!
      .from('estoque_unidades')
      .upsert(payload, { onConflict: 'unidade_id,produto_id' });

    if (error) throw error;
  }

  static async deleteStockItem(stockId: string): Promise<void> {
    if (!this.isConfigured() || stockId.startsWith('st-')) return;
    const { error } = await supabase!
      .from('estoque_unidades')
      .delete()
      .eq('id', stockId);
    if (error) throw error;
  }

  static async getStockMovements(): Promise<StockMovement[]> {
    if (!this.isConfigured()) return [];
    const { data, error } = await supabase!
      .from('movimentacoes_estoque')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar movimentações de estoque:', error);
      throw error;
    }

    return (data || []).map((m: any) => ({
      id: m.id,
      unidadeId: m.unidade_origem_id || m.unidade_id,
      produtoId: m.produto_id,
      tipo:
        m.tipo === 'SAIDA_VENDA' || m.tipo === 'PERDA'
          ? 'SAIDA'
          : m.tipo === 'AJUSTE_INVENTARIO' || m.tipo === 'TRANSFERENCIA'
          ? 'AJUSTE'
          : m.tipo,
      quantidade: Number(m.quantidade),
      motivo: m.motivo || undefined,
      referenciaId: m.referencia_id || undefined,
      dataMovimentacao: m.created_at || m.data_movimentacao
    }));
  }

  static async saveStockMovement(mov: StockMovement): Promise<StockMovement> {
    if (!this.isConfigured()) return mov;
    const isClientGenerated = mov.id.startsWith('mov-');
    const dbTipo =
      mov.tipo === 'SAIDA'
        ? 'SAIDA_VENDA'
        : mov.tipo === 'AJUSTE'
        ? 'AJUSTE_INVENTARIO'
        : mov.tipo;
    const payload: any = {
      unidade_origem_id: mov.unidadeId,
      produto_id: mov.produtoId,
      tipo: dbTipo,
      quantidade: mov.quantidade,
      motivo: mov.motivo || null,
      created_at: mov.dataMovimentacao || new Date().toISOString()
    };
    if (!isClientGenerated) {
      payload.id = mov.id;
    }

    const { data, error } = await supabase!
      .from('movimentacoes_estoque')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      unidadeId: data.unidade_origem_id || data.unidade_id,
      produtoId: data.produto_id,
      tipo: mov.tipo,
      quantidade: Number(data.quantidade),
      motivo: data.motivo || undefined,
      referenciaId: data.referencia_id || undefined,
      dataMovimentacao: data.created_at || data.data_movimentacao
    };
  }

  // ==========================================
  // CLIENTES
  // ==========================================
  static async getCustomers(): Promise<Customer[]> {
    if (!this.isConfigured()) return [];
    const { data, error } = await supabase!
      .from('clientes')
      .select('*')
      .order('nome');

    if (error) {
      console.error('Erro ao buscar clientes:', error);
      throw error;
    }

    return (data || []).map((c: any) => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      cep: c.cep || undefined,
      endereco: c.endereco || '',
      detalheEntrega: c.detalhe_entrega || undefined,
      observacoes: c.observacoes || undefined,
      createdAt: c.created_at
    }));
  }

  static async saveCustomer(customer: Customer): Promise<Customer> {
    if (!this.isConfigured()) return customer;

    const isClientGenerated = customer.id.startsWith('cli-');
    const payload = {
      id: isClientGenerated ? undefined : customer.id,
      nome: customer.nome,
      telefone: customer.telefone,
      cep: customer.cep || null,
      endereco: customer.endereco || null,
      detalhe_entrega: customer.detalheEntrega || null,
      observacoes: customer.observacoes || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase!
      .from('clientes')
      .upsert(payload)
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      nome: data.nome,
      telefone: data.telefone,
      cep: data.cep || undefined,
      endereco: data.endereco || '',
      detalheEntrega: data.detalhe_entrega || undefined,
      observacoes: data.observacoes || undefined,
      createdAt: data.created_at
    };
  }

  static async deleteCustomer(customerId: string): Promise<void> {
    if (!this.isConfigured() || customerId.startsWith('cli-')) return;
    const { error } = await supabase!
      .from('clientes')
      .delete()
      .eq('id', customerId);
    if (error) throw error;
  }

  // ==========================================
  // USUÁRIOS E PERFIS
  // ==========================================
  static async getUsers(): Promise<UserProfile[]> {
    if (!this.isConfigured()) return [];
    const { data, error } = await supabase!
      .from('usuarios_perfis')
      .select('*')
      .order('nome');

    if (error) {
      console.error('Erro ao buscar usuários:', error);
      throw error;
    }

    return (data || []).map((u: any) => ({
      id: u.id,
      email: u.email,
      nome: u.nome,
      avatarUrl: u.avatar_url || '',
      role: (u.role || 'ATENDIMENTO') as UserProfile['role'],
      unidadePadraoId: u.unidade_padrao_id || '',
      autenticadoGoogle: false,
      ativo: u.ativo !== false,
      unidadesPermitidas: Array.isArray(u.unidades_permitidas) ? u.unidades_permitidas : [],
      senha: u.senha_pin || undefined
    }));
  }

  static async saveUser(user: UserProfile): Promise<UserProfile> {
    if (!this.isConfigured()) return user;

    const isClientGenerated = !user.id || user.id.startsWith('usr-');
    const isUuid = (v?: string) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

    const payload: any = {
      email: user.email.trim().toLowerCase(),
      nome: user.nome.trim(),
      avatar_url: user.avatarUrl || null,
      role: user.role,
      unidade_padrao_id: isUuid(user.unidadePadraoId) ? user.unidadePadraoId : null,
      ativo: user.ativo !== false,
      unidades_permitidas: Array.isArray(user.unidadesPermitidas) ? user.unidadesPermitidas : []
    };
    if (user.senha !== undefined) {
      payload.senha_pin = user.senha || null;
    }
    if (!isClientGenerated && isUuid(user.id)) {
      payload.id = user.id;
    }

    const { data, error } = await supabase!
      .from('usuarios_perfis')
      .upsert(payload, { onConflict: 'email' })
      .select()
      .single();

    if (error) throw error;
    return {
      id: data.id,
      email: data.email,
      nome: data.nome,
      avatarUrl: data.avatar_url || '',
      role: data.role as UserProfile['role'],
      unidadePadraoId: data.unidade_padrao_id || '',
      autenticadoGoogle: user.autenticadoGoogle,
      ativo: data.ativo !== false,
      unidadesPermitidas: Array.isArray(data.unidades_permitidas) ? data.unidades_permitidas : [],
      senha: data.senha_pin || undefined
    };
  }

  static async toggleUserActive(userId: string, ativo: boolean): Promise<void> {
    if (!this.isConfigured() || userId.startsWith('usr-')) return;
    const { error } = await supabase!
      .from('usuarios_perfis')
      .update({ ativo })
      .eq('id', userId);
    if (error) throw error;
  }

  // ==========================================
  // PRODUÇÃO CENTRALIZADA
  // ==========================================
  static async getProductionOrders(): Promise<ProductionOrder[]> {
    if (!this.isConfigured()) return [];

    const { data, error } = await supabase!
      .from('ordens_producao')
      .select(`
        *,
        itens:itens_producao (
          id,
          produto_id,
          quantidade_planejada,
          quantidade_produzida,
          unidade_destino_id,
          pedido_origem_id
        )
      `)
      .order('data_producao', { ascending: false });

    if (error) {
      console.error('Erro ao buscar ordens de produção:', error);
      throw error;
    }

    return (data || []).map((op: any) => {
      let itemStatuses: Record<string, ProductionStatus> = {};
      let obsText = op.observacoes || '';
      if (obsText.startsWith('{')) {
        try {
          const parsed = JSON.parse(obsText);
          itemStatuses = parsed.itemStatuses || {};
          obsText = parsed.notes || '';
        } catch {
          // keep plain text
        }
      }

      return {
        id: op.id,
        codigoOrdem: op.codigo_ordem,
        dataProducao: op.data_producao,
        turno: op.turno as ProductionShift,
        status: op.status as ProductionStatus,
        unidadeId: op.unidade_id,
        observacoes: obsText,
        estoqueMovimentado: op.estoque_movimentado === true,
        itemStatuses,
        itens: (op.itens || []).map((i: any) => ({
          produtoId: i.produto_id,
          quantidadePlanejada: Number(i.quantidade_planejada),
          quantidadeProduzida: Number(i.quantidade_produzida),
          unidadeDestinoId: i.unidade_destino_id || undefined
        }))
      };
    });
  }

  static async saveProductionOrder(po: ProductionOrder): Promise<ProductionOrder> {
    if (!this.isConfigured()) return po;

    const isClientGenerated = po.id.startsWith('op-');
    const serializedObs = JSON.stringify({
      notes: po.observacoes || '',
      itemStatuses: po.itemStatuses || {}
    });

    const payload = {
      id: isClientGenerated ? undefined : po.id,
      codigo_ordem: po.codigoOrdem,
      data_producao: po.dataProducao,
      turno: po.turno,
      status: po.status,
      unidade_id: po.unidadeId,
      observacoes: serializedObs,
      estoque_movimentado: po.estoqueMovimentado === true
    };

    const { data: savedOp, error: opError } = await supabase!
      .from('ordens_producao')
      .upsert(payload, { onConflict: 'codigo_ordem' })
      .select()
      .single();

    if (opError) throw opError;

    await supabase!.from('itens_producao').delete().eq('ordem_producao_id', savedOp.id);

    if (po.itens && po.itens.length > 0) {
      const itemsPayload = po.itens.map(item => ({
        ordem_producao_id: savedOp.id,
        produto_id: item.produtoId,
        quantidade_planejada: item.quantidadePlanejada,
        quantidade_produzida: item.quantidadeProduzida,
        unidade_destino_id: item.unidadeDestinoId || null
      }));

      const { error: itemsError } = await supabase!
        .from('itens_producao')
        .insert(itemsPayload);

      if (itemsError) throw itemsError;
    }

    return { ...po, id: savedOp.id };
  }

  // ==========================================
  // REALTIME SUBSCRIPTIONS
  // ==========================================
  static subscribeToOrders(onUpdate: () => void) {
    if (!this.isConfigured()) return () => {};

    const channel = supabase!
      .channel('realtime_pedidos_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }

  static subscribeToProduction(onUpdate: () => void) {
    if (!this.isConfigured()) return () => {};

    const channel = supabase!
      .channel('realtime_producao_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordens_producao' },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }

  // ==========================================
  // SEMENTEIRA AUTOMÁTICA (SEED)
  // ==========================================
  static async seedInitialCatalog(
    fallbackUnits: StoreUnit[],
    fallbackCategories: Category[],
    fallbackProducts: Product[]
  ): Promise<{ units: StoreUnit[]; categories: Category[]; products: Product[] }> {
    if (!this.isConfigured()) {
      return { units: fallbackUnits, categories: fallbackCategories, products: fallbackProducts };
    }

    // 1. Verificar se unidades existem
    let existingUnits = await this.getUnits();
    if (existingUnits.length === 0) {
      for (const u of fallbackUnits) {
        await this.saveUnit(u);
      }
      existingUnits = await this.getUnits();
    }

    // 2. Verificar se categorias existem
    let existingCats = await this.getCategories();
    if (existingCats.length === 0) {
      for (const c of fallbackCategories) {
        await this.saveCategory(c);
      }
      existingCats = await this.getCategories();
    }

    // Mapeamento de categorias por nome para vincular produtos aos UUIDs reais
    const catMap = new Map(existingCats.map(c => [c.nome.toLowerCase(), c.id]));

    // 3. Verificar se produtos existem
    let existingProds = await this.getProducts();
    if (existingProds.length === 0) {
      for (const p of fallbackProducts) {
        // Encontrar categoria real correspondente
        const matchedCat = fallbackCategories.find(c => c.id === p.categoriaId);
        const realCatId = (matchedCat && catMap.get(matchedCat.nome.toLowerCase())) || existingCats[0]?.id;
        
        if (realCatId) {
          await this.saveProduct({
            ...p,
            categoriaId: realCatId
          });
        }
      }
      existingProds = await this.getProducts();
    }

    return {
      units: existingUnits,
      categories: existingCats,
      products: existingProds
    };
  }

  // ==========================================
  // LIMPAR & POPULAR MOCK DATA (EXCETO USUÁRIOS E UNIDADES)
  // ==========================================
  static async cleanMockData(): Promise<void> {
    if (!this.isConfigured()) throw new Error('Supabase não configurado');

    // Ordem segura respeitando chaves estrangeiras; nunca remove usuarios_perfis nem empresas_unidades
    const tablesToClean = [
      'itens_producao',
      'itens_pedido',
      'movimentacoes_estoque',
      'estoque_unidades',
      'ordens_producao',
      'pedidos',
      'produtos',
      'categorias',
      'clientes',
    ] as const;

    for (const table of tablesToClean) {
      const { error } = await supabase!
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) {
        throw new Error(`Erro ao limpar ${table}: ${error.message}`);
      }
    }
  }

  static async populateMockData(): Promise<{
    categorias: number;
    produtos: number;
    clientes: number;
    pedidos: number;
    itensPedido: number;
    estoque: number;
    movimentacoes: number;
    ordensProducao: number;
    itensProducao: number;
  }> {
    if (!this.isConfigured()) throw new Error('Supabase não configurado');

    const units = await this.getUnits();
    if (units.length === 0) {
      throw new Error('Nenhuma unidade cadastrada em empresas_unidades. Cadastre ao menos uma unidade antes de popular.');
    }

    // Garante base limpa (sem tocar em usuarios_perfis e empresas_unidades)
    await this.cleanMockData();

    const centralUnit = units.find(u => u.tipo === 'CENTRAL') || units[0];
    const lojaUnits = units.filter(u => u.tipo === 'LOJA');
    const unitPool = lojaUnits.length > 0 ? lojaUnits : units;
    const orderUnitPool = units;

    // 1. Categorias (10 registros <= 50)
    const categoryNames = [
      'Bolos Artesanais',
      'Tortas & Cheesecakes',
      'Sobremesas Individuais',
      'Doces Finos',
      'Salgados & Quiches',
      'Pães & Brioches',
      'Sazonal & Presentes',
      'Empório & Geleias',
      'Bebidas & Cafés',
      'Kits Festa',
    ];
    const { data: insertedCats, error: catErr } = await supabase!
      .from('categorias')
      .insert(categoryNames.map((nome, idx) => ({ nome, ordem: idx + 1, ativo: true })))
      .select();
    if (catErr || !insertedCats) throw new Error(`Erro ao popular categorias: ${catErr?.message}`);

    // 2. Produtos (30 registros <= 50)
    const productTemplates: Array<[string, string, number, 'UN' | 'KG' | 'G' | 'CENTO' | 'CX', number, number]> = [
      ['BOL-001', 'Bolo Red Velvet com Cream Cheese (1,5kg)', 168.00, 'UN', 0, 90],
      ['BOL-002', 'Bolo Belga de Chocolate 70% Callebaut', 185.00, 'UN', 0, 95],
      ['BOL-003', 'Bolo de Pistache com Framboesa', 210.00, 'UN', 0, 100],
      ['BOL-004', 'Bolo de Cenoura com Brigadeiro Belga', 115.00, 'UN', 0, 60],
      ['TRT-001', 'Torta Basca de Cream Cheese (San Sebastián)', 155.00, 'UN', 1, 75],
      ['TRT-002', 'Torta Limão Siciliano com Merengue Suíço', 142.00, 'UN', 1, 65],
      ['TRT-003', 'Banoffee Artesanal com Doce de Leite', 138.00, 'UN', 1, 55],
      ['TRT-004', 'Cheesecake de Frutas Vermelhas', 162.00, 'UN', 1, 80],
      ['SOB-001', 'Verrine de Tiramisù Clássico', 26.00, 'UN', 2, 20],
      ['SOB-002', 'Mousse Trio de Chocolates Belgas', 28.00, 'UN', 2, 25],
      ['SOB-003', 'Mil Folhas de Baunilha de Madagascar', 32.00, 'UN', 2, 35],
      ['SOB-004', 'Éclair de Caramelo Salgado', 22.00, 'UN', 2, 30],
      ['DOC-001', 'Caixa 12 Brigadeiros Gourmet Sortidos', 64.00, 'CX', 3, 40],
      ['DOC-002', 'Cento de Brigadeiro Tradicional Belga', 190.00, 'CENTO', 3, 90],
      ['DOC-003', 'Caixa 6 Macarons Parisienses', 58.00, 'CX', 3, 50],
      ['DOC-004', 'Caixa Presenteável Bombons de Pistache (8un)', 72.00, 'CX', 3, 45],
      ['SAL-001', 'Quiche Lorraine Artesanal (Inteira)', 118.00, 'UN', 4, 55],
      ['SAL-002', 'Quiche de Alho-Poró e Queijo Brie', 124.00, 'UN', 4, 55],
      ['SAL-003', 'Empadão Cremoso de Frango com Catupiry', 129.00, 'UN', 4, 65],
      ['SAL-004', 'Cento de Mini Coxinhas Artesanais', 165.00, 'CENTO', 4, 80],
      ['PAE-001', 'Brioche Francês Trançado (500g)', 34.00, 'UN', 5, 120],
      ['PAE-002', 'Croissant de Manteiga Francesa', 18.00, 'UN', 5, 90],
      ['PAE-003', 'Pão de Fermentação Natural Levain', 38.00, 'UN', 5, 180],
      ['SAZ-001', 'Cesta Café da Manhã Especial JuJu', 245.00, 'UN', 6, 45],
      ['SAZ-002', 'Caixa Degustação Especial da Chef', 135.00, 'CX', 6, 35],
      ['EMP-001', 'Geleia Artesanal de Morango com Baunilha (220g)', 36.00, 'UN', 7, 40],
      ['EMP-002', 'Creme de Avelã e Cacau da Casa (200g)', 44.00, 'UN', 7, 40],
      ['BEB-001', 'Cold Brew Artesanal JuJu (300ml)', 16.00, 'UN', 8, 15],
      ['BEB-002', 'Chocolate Quente Cremoso para Viagem', 19.00, 'UN', 8, 10],
      ['KIT-001', 'Kit Festa P (1 Bolo + 50 Doces + 50 Salgados)', 340.00, 'UN', 9, 120],
    ];
    const { data: insertedProds, error: prodErr } = await supabase!
      .from('produtos')
      .insert(
        productTemplates.map(([sku, desc, preco, um, catIdx, tempo]) => ({
          codigo_sku: sku,
          descricao: desc,
          preco_unitario: preco,
          unidade_medida: um,
          categoria_id: insertedCats[catIdx % insertedCats.length].id,
          tempo_producao_minutos: tempo,
          ativo: true,
        }))
      )
      .select();
    if (prodErr || !insertedProds) throw new Error(`Erro ao popular produtos: ${prodErr?.message}`);

    // 3. Clientes (45 registros <= 50)
    const firstNames = ['Ana', 'Beatriz', 'Camila', 'Daniela', 'Eduardo', 'Fernanda', 'Gabriel', 'Helena', 'Igor', 'Juliana', 'Lucas', 'Mariana', 'Natália', 'Pedro', 'Rafael'];
    const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins'];
    const neighborhoods: Array<[string, string, string]> = [
      ['Rua das Hortênsias, 142 - Horto Florestal, Salvador - BA', '40295-010', 'Portaria principal, interfone 402'],
      ['Av. Luís Viana Filho, 6430 - Paralela, Salvador - BA', '41730-101', 'Torre Empresarial, recepção térreo'],
      ['Alameda dos Sombreiros, 88 - Caminho das Árvores, Salvador - BA', '41820-420', 'Deixar com o porteiro Marcos'],
      ['Rua Arthur Neiva, 215 - Barra, Salvador - BA', '40140-410', 'Ed. Mar Azul, apto 801'],
      ['Rua Ceará, 310 - Pituba, Salvador - BA', '41830-450', 'Casa com portão branco'],
      ['Rua das Rosas, 520 - Pituba, Salvador - BA', '41810-070', 'Ligar ao chegar na portaria'],
      ['Rua Macapá, 190 - Ondina, Salvador - BA', '40170-150', 'Condomínio Residencial Ondina'],
      ['Av. Tancredo Neves, 1632 - Caminho das Árvores, Salvador - BA', '41820-020', 'Sala 1204, Torre Sul'],
      ['Rua Alagoinhas, 77 - Rio Vermelho, Salvador - BA', '41940-620', 'Apto 302, tocar campainha'],
      ['Rua Waldemar Falcão, 410 - Brotas, Salvador - BA', '40296-710', 'Bloco B, apartamento 504'],
    ];

    const customerPayloads = Array.from({ length: 45 }, (_, i) => {
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[(i * 3 + Math.floor(i / firstNames.length)) % lastNames.length];
      const [endereco, cep, detalhe] = neighborhoods[i % neighborhoods.length];
      const phoneSuffix = String(1000 + i * 73).slice(0, 4);
      return {
        nome: `${fn} ${ln}`,
        telefone: `(71) 99${String(100 + i).slice(-2)}-${phoneSuffix}`,
        endereco,
        cep,
        detalhe_entrega: detalhe,
        observacoes: i % 4 === 0 ? 'Cliente frequente - prefere entrega no período da tarde' : null,
      };
    });

    const { data: insertedCustomers, error: custErr } = await supabase!
      .from('clientes')
      .insert(customerPayloads)
      .select();
    if (custErr || !insertedCustomers) throw new Error(`Erro ao popular clientes: ${custErr?.message}`);

    // 4. Pedidos (30 registros <= 50) & 5. Itens do Pedido (48 registros <= 50)
    const now = new Date();
    const statuses: OrderStatus[] = [
      'PENDENTE', 'CONFIRMADO', 'EM_PRODUCAO', 'PRONTO', 'EM_ROTA', 'ENTREGUE', 'ENTREGUE', 'ENTREGUE', 'CANCELADO',
    ];
    const paymentMethods: Array<'pix' | 'debito' | 'credito' | 'dinheiro'> = ['pix', 'credito', 'debito', 'dinheiro'];

    const plannedItemsPerOrder = Array.from({ length: 30 }, (_, idx) => {
      const p1 = insertedProds[idx % insertedProds.length];
      const q1 = (idx % 3) + 1;
      const items = [
        {
          produto_id: p1.id,
          quantidade: q1,
          preco_unitario: Number(p1.preco_unitario),
          subtotal: Number((Number(p1.preco_unitario) * q1).toFixed(2)),
        },
      ];
      if (idx < 18) {
        const p2 = insertedProds[(idx + 7) % insertedProds.length];
        items.push({
          produto_id: p2.id,
          quantidade: 1,
          preco_unitario: Number(p2.preco_unitario),
          subtotal: Number(Number(p2.preco_unitario).toFixed(2)),
        });
      }
      return items;
    });

    const orderPayloads = Array.from({ length: 30 }, (_, i) => {
      const cust = insertedCustomers[i % insertedCustomers.length];
      const origem = orderUnitPool[i % orderUnitPool.length];
      const isDelivery = i % 3 !== 2; // 2/3 Delivery, 1/3 Retirada
      const status = statuses[i % statuses.length];
      const dayOffset = i < 10 ? 0 : -(i - 9); // 10 pedidos hoje, 20 nos últimos dias
      const orderDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const deliveryDate = new Date(orderDate.getTime() + (2 + (i % 5)) * 60 * 60 * 1000);
      const taxa = isDelivery ? (i % 2 === 0 ? 15 : 18) : 0;
      const desconto = i % 5 === 0 ? 10 : 0;
      const subtotal = Number(
        plannedItemsPerOrder[i].reduce((sum, it) => sum + it.subtotal, 0).toFixed(2)
      );
      const total = Number(Math.max(0, subtotal + taxa - desconto).toFixed(2));

      return {
        numero_pedido: `#PED-MOCK-${String(i + 1).padStart(3, '0')}`,
        status,
        data_pedido: orderDate.toISOString(),
        data_hora_entrega: deliveryDate.toISOString(),
        tipo_entrega: isDelivery ? 'DELIVERY' : 'RETIRADA',
        unidade_origem_id: origem.id,
        unidade_retirada_id: isDelivery ? null : orderUnitPool[(i + 1) % orderUnitPool.length].id,
        cliente_nome: cust.nome,
        cliente_telefone: cust.telefone,
        cliente_endereco: cust.endereco,
        endereco_entrega: isDelivery ? cust.endereco : null,
        detalhe_entrega: isDelivery ? cust.detalhe_entrega : 'Retirada no balcão',
        valor_subtotal: subtotal,
        taxa_entrega: taxa,
        desconto,
        valor_total: total,
        forma_pagamento: paymentMethods[i % paymentMethods.length],
        troco_para: paymentMethods[i % paymentMethods.length] === 'dinheiro' ? 200 : null,
        observacoes: i % 3 === 0 ? 'Enviar cartão com dedicatória especial' : null,
      };
    });

    const { data: insertedOrders, error: ordErr } = await supabase!
      .from('pedidos')
      .insert(orderPayloads)
      .select();
    if (ordErr || !insertedOrders) throw new Error(`Erro ao popular pedidos: ${ordErr?.message}`);

    // Até 48 itens_pedido (<= 50): 1 item para cada um dos 30 pedidos + 1 segundo item para os 18 primeiros
    const orderItemPayloads: Array<{
      pedido_id: string;
      produto_id: string;
      quantidade: number;
      preco_unitario: number;
      subtotal: number;
    }> = [];
    insertedOrders.forEach((ord, idx) => {
      plannedItemsPerOrder[idx].forEach(it => {
        orderItemPayloads.push({
          pedido_id: ord.id,
          ...it,
        });
      });
    });

    const { error: itemsErr } = await supabase!.from('itens_pedido').insert(orderItemPayloads);
    if (itemsErr) throw new Error(`Erro ao popular itens_pedido: ${itemsErr.message}`);

    // 6. Estoque por Unidade (até 48 registros <= 50, respeitando UNIQUE(unidade_id, produto_id))
    const stockPayloads: Array<{
      unidade_id: string;
      produto_id: string;
      quantidade_atual: number;
      quantidade_minima: number;
    }> = [];
    const maxProdsForStock = Math.min(insertedProds.length, Math.floor(50 / units.length));
    for (let uIdx = 0; uIdx < units.length; uIdx++) {
      for (let pIdx = 0; pIdx < maxProdsForStock; pIdx++) {
        const prod = insertedProds[pIdx];
        const isLow = (uIdx + pIdx) % 5 === 0;
        stockPayloads.push({
          unidade_id: units[uIdx].id,
          produto_id: prod.id,
          quantidade_atual: isLow ? 2 : 12 + ((uIdx * 3 + pIdx) % 18),
          quantidade_minima: 5,
        });
      }
    }
    const { error: stockErr } = await supabase!.from('estoque_unidades').insert(stockPayloads);
    if (stockErr) throw new Error(`Erro ao popular estoque_unidades: ${stockErr.message}`);

    // 7. Movimentações de Estoque (40 registros <= 50)
    const movTypes: Array<'ENTRADA' | 'SAIDA_VENDA' | 'TRANSFERENCIA' | 'PERDA' | 'AJUSTE_INVENTARIO'> = [
      'ENTRADA', 'SAIDA_VENDA', 'TRANSFERENCIA', 'AJUSTE_INVENTARIO', 'PERDA',
    ];
    const movPayloads = Array.from({ length: 40 }, (_, i) => {
      const tipo = movTypes[i % movTypes.length];
      const orig = units[i % units.length];
      const dest = tipo === 'TRANSFERENCIA' && units.length > 1 ? units[(i + 1) % units.length] : null;
      return {
        tipo,
        produto_id: insertedProds[i % insertedProds.length].id,
        unidade_origem_id: orig.id,
        unidade_destino_id: dest ? dest.id : null,
        quantidade: (i % 6) + 1,
        motivo:
          tipo === 'ENTRADA'
            ? 'Reposição diária da produção'
            : tipo === 'TRANSFERENCIA'
            ? 'Transferência entre unidades'
            : tipo === 'SAIDA_VENDA'
            ? 'Baixa automática por venda'
            : tipo === 'PERDA'
            ? 'Controle de validade vitrine'
            : 'Ajuste de inventário semanal',
      };
    });
    const { error: movErr } = await supabase!.from('movimentacoes_estoque').insert(movPayloads);
    if (movErr) throw new Error(`Erro ao popular movimentacoes_estoque: ${movErr.message}`);

    // 8. Ordens de Produção (20 registros <= 50) & 9. Itens de Produção (40 registros <= 50)
    const shifts: ProductionShift[] = ['MANHA', 'TARDE', 'NOITE'];
    const poStatuses: ProductionStatus[] = ['PLANEJADA', 'EM_PREPARO', 'CONCLUIDA'];
    const poPayloads = Array.from({ length: 20 }, (_, i) => {
      const d = new Date(now.getTime() - Math.floor(i / 2) * 24 * 60 * 60 * 1000);
      return {
        codigo_ordem: `OP-MOCK-${String(i + 1).padStart(3, '0')}`,
        data_producao: d.toISOString().split('T')[0],
        turno: shifts[i % shifts.length],
        status: poStatuses[i % poStatuses.length],
        unidade_id: centralUnit.id,
        observacoes: i % 3 === 0 ? 'Prioridade para entregas da manhã' : null,
        estoque_movimentado: poStatuses[i % poStatuses.length] === 'CONCLUIDA',
      };
    });
    const { data: insertedPOs, error: poErr } = await supabase!
      .from('ordens_producao')
      .insert(poPayloads)
      .select();
    if (poErr || !insertedPOs) throw new Error(`Erro ao popular ordens_producao: ${poErr?.message}`);

    const poItemPayloads: Array<{
      ordem_producao_id: string;
      produto_id: string;
      quantidade_planejada: number;
      quantidade_produzida: number;
      unidade_destino_id: string;
      pedido_origem_id: string | null;
    }> = [];
    insertedPOs.forEach((po, idx) => {
      for (let j = 0; j < 2; j++) {
        const prod = insertedProds[(idx * 2 + j) % insertedProds.length];
        const planned = 4 + ((idx + j) % 8);
        const produced = po.status === 'CONCLUIDA' ? planned : po.status === 'EM_PREPARO' ? Math.floor(planned / 2) : 0;
        poItemPayloads.push({
          ordem_producao_id: po.id,
          produto_id: prod.id,
          quantidade_planejada: planned,
          quantidade_produzida: produced,
          unidade_destino_id: unitPool[(idx + j) % unitPool.length].id,
          pedido_origem_id: insertedOrders[(idx + j) % insertedOrders.length]?.id || null,
        });
      }
    });
    const { error: poItemsErr } = await supabase!.from('itens_producao').insert(poItemPayloads);
    if (poItemsErr) throw new Error(`Erro ao popular itens_producao: ${poItemsErr.message}`);

    return {
      categorias: insertedCats.length,
      produtos: insertedProds.length,
      clientes: insertedCustomers.length,
      pedidos: insertedOrders.length,
      itensPedido: orderItemPayloads.length,
      estoque: stockPayloads.length,
      movimentacoes: movPayloads.length,
      ordensProducao: insertedPOs.length,
      itensProducao: poItemPayloads.length,
    };
  }

  // ==========================================
  // AUTENTICAÇÃO COM SUPABASE AUTH
  // ==========================================
  static async getCurrentUser() {
    if (!this.isConfigured()) return null;
    const { data: { user }, error } = await supabase!.auth.getUser();
    if (error) return null;
    return user;
  }

  static async signInWithPassword(email: string, password: string) {
    if (!this.isConfigured()) throw new Error('Supabase não configurado');
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  static async signUpWithPassword(email: string, password: string, nome?: string) {
    if (!this.isConfigured()) throw new Error('Supabase não configurado');
    const { data, error } = await supabase!.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: nome || email.split('@')[0] }
      }
    });
    if (error) throw error;
    return data;
  }

  static async signInWithGoogle() {
    if (!this.isConfigured()) throw new Error('Supabase não configurado');
    const { data, error } = await supabase!.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
    return data;
  }

  static async signOut() {
    if (!this.isConfigured()) return;
    await supabase!.auth.signOut();
  }
}
