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
  Customer,
  FinancialPaymentCategory,
  FinancialPaymentChannel,
  InvoiceStatus,
  OrderFinancialPaymentEntry,
  OrderFinancialRecord,
  ReconciliationStatus
} from '../types';
import { decodePaymentInstructions, encodePaymentInstructions } from '../utils/paymentStatus';

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

    return (data || []).map((o: any) => {
      const paymentMeta = decodePaymentInstructions(o.instrucoes_pagamento);
      return {
        id: o.id,
        numeroPedido: o.numero_pedido,
        status: o.status as OrderStatus,
        dataPedido: o.data_pedido,
        dataHoraEntrega: o.data_hora_entrega,
        dataHoraEntregaFim: o.data_hora_entrega_fim || undefined,
        turnoEntrega: o.turno_entrega || undefined,
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
        statusPagamento: paymentMeta.statusPagamento,
        valorPago: paymentMeta.valorPago,
        trocoPara: o.troco_para ? Number(o.troco_para) : undefined,
        instrucoesPagamento: paymentMeta.instrucoesPagamento,
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
      };
    });
  }

  static async saveOrder(order: Order): Promise<Order> {
    if (!this.isConfigured()) return order;

    const isUuid = (v?: string) =>
      Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));

    const hasValidId = isUuid(order.id);
    const normalizedDeliveryIso = order.dataHoraEntrega
      ? new Date(order.dataHoraEntrega).toISOString()
      : new Date().toISOString();

    const normalizedDeliveryEndIso = order.dataHoraEntregaFim
      ? new Date(order.dataHoraEntregaFim).toISOString()
      : null;

    const orderPayload: Record<string, any> = {
      numero_pedido: order.numeroPedido,
      status: order.status,
      data_pedido: order.dataPedido ? new Date(order.dataPedido).toISOString() : new Date().toISOString(),
      data_hora_entrega: normalizedDeliveryIso,
      ...(normalizedDeliveryEndIso ? { data_hora_entrega_fim: normalizedDeliveryEndIso } : {}),
      ...(order.tipoEntrega === 'DELIVERY' && order.turnoEntrega
        ? { turno_entrega: order.turnoEntrega }
        : {}),
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
      instrucoes_pagamento: encodePaymentInstructions(
        order.instrucoesPagamento,
        order.statusPagamento,
        order.valorPago
      ),
      observacoes: order.observacoes || null,
      detalhe_entrega: order.detalheEntrega || null,
      updated_at: new Date().toISOString()
    };

    const executeSave = async (payload: Record<string, any>) => {
      if (hasValidId) {
        return supabase!
          .from('pedidos')
          .update(payload)
          .eq('id', order.id)
          .select()
          .single();
      }
      return supabase!
        .from('pedidos')
        .upsert(payload, { onConflict: 'numero_pedido' })
        .select()
        .single();
    };

    let { data: savedOrder, error } = await executeSave(orderPayload);
    if (error && (error.message?.includes('data_hora_entrega_fim') || error.message?.includes('turno_entrega'))) {
      const { data_hora_entrega_fim: _omittedEnd, turno_entrega: _omittedTurno, ...fallbackPayload } = orderPayload;
      ({ data: savedOrder, error } = await executeSave(fallbackPayload));
    }
    if (error) throw error;

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

  static async deleteOrder(orderId: string): Promise<void> {
    if (!this.isConfigured() || orderId.startsWith('ord-')) return;
    await supabase!.from('itens_pedido').delete().eq('pedido_id', orderId);
    const { error } = await supabase!
      .from('pedidos')
      .delete()
      .eq('id', orderId)
      .eq('status', 'PENDENTE');
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

  static async deleteStockByUnitProduct(unidadeId: string, produtoId: string): Promise<void> {
    if (!this.isConfigured()) return;
    const { error } = await supabase!
      .from('estoque_unidades')
      .delete()
      .eq('unidade_id', unidadeId)
      .eq('produto_id', produtoId);
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
    if (!this.isConfigured() || mov.quantidade <= 0) return mov;
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
      .select('id, email, nome, avatar_url, role, unidade_padrao_id, ativo, unidades_permitidas')
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
      unidadesPermitidas: Array.isArray(u.unidades_permitidas) ? u.unidades_permitidas : []
    }));
  }

  static async saveUser(user: UserProfile): Promise<UserProfile> {
    if (!this.isConfigured()) return user;

    const pinTrimmed = user.senha?.trim();
    const hasValidPin = Boolean(pinTrimmed && /^\d{8}$/.test(pinTrimmed));

    // Prefer Edge Function when deployed (updates Auth + bcrypt credentials + profile atomically)
    try {
      const { data: fnData, error: fnErr } = await supabase!.functions.invoke('operator-auth', {
        body: {
          action: 'manage_user',
          user: {
            ...user,
            senha: hasValidPin ? pinTrimmed : undefined
          }
        }
      });

      if (!fnErr && fnData?.ok && fnData?.user) {
        const saved = fnData.user;
        return {
          id: saved.id,
          email: saved.email,
          nome: saved.nome,
          avatarUrl: saved.avatar_url || '',
          role: (saved.role || 'ATENDIMENTO') as UserProfile['role'],
          unidadePadraoId: saved.unidade_padrao_id || '',
          autenticadoGoogle: user.autenticadoGoogle,
          ativo: saved.ativo !== false,
          unidadesPermitidas: Array.isArray(saved.unidades_permitidas) ? saved.unidades_permitidas : []
        };
      }
      if (fnData && fnData.ok === false && fnData.message) {
        throw new Error(fnData.message);
      }
    } catch (fnCatchErr: any) {
      const msg = String(fnCatchErr?.message || '');
      if (
        msg &&
        !msg.includes('Failed to send') &&
        !msg.includes('FunctionsFetchError') &&
        !msg.includes('404')
      ) {
        throw fnCatchErr;
      }
    }

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
    if (!isClientGenerated && isUuid(user.id)) {
      payload.id = user.id;
    }

    const { data, error } = await supabase!
      .from('usuarios_perfis')
      .upsert(payload, { onConflict: 'email' })
      .select('id, email, nome, avatar_url, role, unidade_padrao_id, ativo, unidades_permitidas')
      .single();

    if (error) throw error;

    if (hasValidPin) {
      try {
        const { error: pinErr } = await supabase!.rpc('atualizar_pin_operador', {
          p_usuario_id: data.id,
          p_novo_pin: pinTrimmed
        });
        if (pinErr) {
          console.warn('Falha ao atualizar PIN via RPC:', pinErr);
        }
      } catch (pinCatch) {
        console.warn('Falha ao atualizar PIN via RPC:', pinCatch);
      }
    }

    return {
      id: data.id,
      email: data.email,
      nome: data.nome,
      avatarUrl: data.avatar_url || '',
      role: data.role as UserProfile['role'],
      unidadePadraoId: data.unidade_padrao_id || '',
      autenticadoGoogle: user.autenticadoGoogle,
      ativo: data.ativo !== false,
      unidadesPermitidas: Array.isArray(data.unidades_permitidas) ? data.unidades_permitidas : []
    };
  }

  static async toggleUserActive(userId: string, ativo: boolean): Promise<void> {
    if (!this.isConfigured() || userId.startsWith('usr-')) return;
    try {
      const { data: fnData, error: fnErr } = await supabase!.functions.invoke('operator-auth', {
        body: { action: 'toggle_active', userId, ativo }
      });
      if (!fnErr && fnData?.ok) return;
    } catch {
      // Fallback when operator-auth Edge Function is not yet deployed
    }

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
  // LIMPAR & POPULAR MOCK DATA (PRESERVANDO PRODUTOS, CATEGORIAS, USUÁRIOS E UNIDADES)
  // ==========================================
  static async cleanMockData(): Promise<void> {
    if (!this.isConfigured()) throw new Error('Supabase não configurado');

    // Remove apenas registros identificados com "MOCK".
    // Nunca altera empresas_unidades, produtos, categorias, usuarios_perfis nem registros reais.
    const { data: mockPOs, error: mockPoQueryErr } = await supabase!
      .from('ordens_producao')
      .select('id')
      .ilike('codigo_ordem', '%MOCK%');
    if (mockPoQueryErr) throw new Error(`Erro ao consultar ordens_producao mock: ${mockPoQueryErr.message}`);
    const mockPoIds = (mockPOs || []).map((r: any) => r.id);

    const { data: mockOrders, error: mockOrdQueryErr } = await supabase!
      .from('pedidos')
      .select('id')
      .ilike('numero_pedido', '%MOCK%');
    if (mockOrdQueryErr) throw new Error(`Erro ao consultar pedidos mock: ${mockOrdQueryErr.message}`);
    const mockOrderIds = (mockOrders || []).map((r: any) => r.id);

    if (mockPoIds.length > 0) {
      const { error } = await supabase!
        .from('itens_producao')
        .delete()
        .in('ordem_producao_id', mockPoIds);
      if (error) throw new Error(`Erro ao limpar itens_producao mock: ${error.message}`);
    }

    if (mockOrderIds.length > 0) {
      const { error: poRefErr } = await supabase!
        .from('itens_producao')
        .delete()
        .in('pedido_origem_id', mockOrderIds);
      if (poRefErr) throw new Error(`Erro ao limpar referências de pedido em itens_producao mock: ${poRefErr.message}`);

      const { error: itemOrdErr } = await supabase!
        .from('itens_pedido')
        .delete()
        .in('pedido_id', mockOrderIds);
      if (itemOrdErr) throw new Error(`Erro ao limpar itens_pedido mock: ${itemOrdErr.message}`);
    }

    const { error: itemObsErr } = await supabase!
      .from('itens_pedido')
      .delete()
      .ilike('observacoes_item', '%MOCK%');
    if (itemObsErr) throw new Error(`Erro ao limpar itens_pedido marcados com MOCK: ${itemObsErr.message}`);

    const { error: movErr } = await supabase!
      .from('movimentacoes_estoque')
      .delete()
      .ilike('motivo', '%MOCK%');
    if (movErr) throw new Error(`Erro ao limpar movimentacoes_estoque mock: ${movErr.message}`);

    const { error: poDelErr } = await supabase!
      .from('ordens_producao')
      .delete()
      .ilike('codigo_ordem', '%MOCK%');
    if (poDelErr) throw new Error(`Erro ao limpar ordens_producao mock: ${poDelErr.message}`);

    const { error: ordDelErr } = await supabase!
      .from('pedidos')
      .delete()
      .ilike('numero_pedido', '%MOCK%');
    if (ordDelErr) throw new Error(`Erro ao limpar pedidos mock: ${ordDelErr.message}`);

    const { error: custDelErr } = await supabase!
      .from('clientes')
      .delete()
      .ilike('observacoes', '%MOCK%');
    if (custDelErr) throw new Error(`Erro ao limpar clientes mock: ${custDelErr.message}`);
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

    // Garante base operacional limpa (preservando produtos, categorias, usuarios_perfis e empresas_unidades)
    await this.cleanMockData();

    const centralUnit = units.find(u => u.tipo === 'CENTRAL') || units[0];
    const lojaUnits = units.filter(u => u.tipo === 'LOJA');
    const unitPool = lojaUnits.length > 0 ? lojaUnits : units;
    const orderUnitPool = units;

    // 1. Categorias e 2. Produtos: apenas leitura (nunca insere mock em produtos, unidades ou usuários)
    const { data: existingCatRows } = await supabase!.from('categorias').select('*');
    const insertedCats = existingCatRows || [];

    const { data: existingProdRows, error: prodQueryErr } = await supabase!.from('produtos').select('*');
    if (prodQueryErr) throw new Error(`Erro ao consultar produtos: ${prodQueryErr.message}`);
    const insertedProds = existingProdRows || [];
    if (insertedProds.length === 0) {
      throw new Error('Nenhum produto cadastrado em produtos. Cadastre ao menos um produto antes de popular dados mock.');
    }

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
        observacoes: i % 4 === 0 ? '[MOCK] Cliente frequente - prefere entrega no período da tarde' : '[MOCK] Cliente gerado para testes',
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
      observacoes_item?: string;
    }> = [];
    insertedOrders.forEach((ord, idx) => {
      plannedItemsPerOrder[idx].forEach(it => {
        orderItemPayloads.push({
          pedido_id: ord.id,
          ...it,
          observacoes_item: '[MOCK]',
        });
      });
    });

    const { error: itemsErr } = await supabase!.from('itens_pedido').insert(orderItemPayloads);
    if (itemsErr) throw new Error(`Erro ao popular itens_pedido: ${itemsErr.message}`);

    // 6. Estoque por Unidade (preenche apenas combinações sem estoque existente, sem sobrescrever saldos reais)
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
    const { error: stockErr } = await supabase!
      .from('estoque_unidades')
      .upsert(stockPayloads, { onConflict: 'unidade_id,produto_id', ignoreDuplicates: true });
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
            ? '[MOCK] Reposição diária da produção'
            : tipo === 'TRANSFERENCIA'
            ? '[MOCK] Transferência entre unidades'
            : tipo === 'SAIDA_VENDA'
            ? '[MOCK] Baixa automática por venda'
            : tipo === 'PERDA'
            ? '[MOCK] Controle de validade vitrine'
            : '[MOCK] Ajuste de inventário semanal',
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
  // CONFIGURAÇÕES & CARDÁPIO PÚBLICO
  // ==========================================
  static async getAppConfig<T>(chave: string): Promise<T | null> {
    if (!this.isConfigured()) return null;
    const { data, error } = await supabase!
      .from('app_configuracoes')
      .select('valor')
      .eq('chave', chave)
      .maybeSingle();

    if (error) {
      console.warn(`Erro ao carregar configuração (${chave}):`, error);
      return null;
    }
    return (data?.valor as T) ?? null;
  }

  static async saveAppConfig(chave: string, valor: unknown): Promise<void> {
    if (!this.isConfigured()) return;
    const { error } = await supabase!
      .from('app_configuracoes')
      .upsert(
        {
          chave,
          valor,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'chave' }
      );
    if (error) throw error;
  }

  static async getPublicReservedStock(unidadeId?: string): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!this.isConfigured()) return map;
    const { data, error } = await supabase!.rpc('get_public_reserved_stock', {
      p_unidade_id: unidadeId || null
    });
    if (error) throw error;

    for (const row of data || []) {
      const uid = row.unidade_id;
      const pid = row.produto_id;
      const qty = Number(row.quantidade_reservada || 0);
      if (uid && pid && qty > 0) {
        map.set(`${uid}::${pid}`, qty);
      }
    }
    return map;
  }

  static async submitPublicMenuOrder(order: Order, customer: Customer): Promise<Order> {
    if (!this.isConfigured()) return order;

    const toIsoTimestamp = (value?: string): string | null => {
      if (!value) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d.toISOString();
    };

    const { data, error } = await supabase!.rpc('criar_pedido_cardapio', {
      p_unidade_origem_id: order.unidadeOrigemId,
      p_tipo_entrega: order.tipoEntrega,
      p_data_hora_entrega: toIsoTimestamp(order.dataHoraEntrega),
      p_data_hora_entrega_fim: toIsoTimestamp(order.dataHoraEntregaFim),
      p_turno_entrega: order.tipoEntrega === 'DELIVERY' ? (order.turnoEntrega || null) : null,
      p_cliente_nome: customer.nome.trim(),
      p_cliente_telefone: customer.telefone.trim(),
      p_cliente_cep: customer.cep?.trim() || null,
      p_endereco_entrega: (order.enderecoEntrega || customer.endereco || '').trim() || null,
      p_detalhe_entrega: (order.detalheEntrega || customer.detalheEntrega || '').trim() || null,
      p_unidade_retirada_id:
        order.tipoEntrega === 'RETIRADA' ? (order.unidadeRetiradaId || order.unidadeOrigemId) : null,
      p_taxa_entrega: order.tipoEntrega === 'DELIVERY' ? Number(order.taxaEntrega || 0) : 0,
      p_forma_pagamento: order.formaPagamento || 'pix',
      p_troco_para:
        order.formaPagamento === 'dinheiro' && order.trocoPara ? Number(order.trocoPara) : null,
      p_observacoes: order.observacoes?.trim() || null,
      p_itens: (order.itens || []).map(item => ({
        produtoId: item.produtoId,
        quantidade: item.quantidade,
        observacoes: item.observacoes || null
      }))
    });

    if (error) throw error;

    return {
      ...order,
      id: data.id,
      numeroPedido: data.numero_pedido,
      status: 'PENDENTE',
      valorSubtotal: Number(data.valor_subtotal),
      taxaEntrega: Number(data.taxa_entrega),
      valorTotal: Number(data.valor_total)
    };
  }

  // ==========================================
  // FINANCEIRO: MEIOS DE PAGAMENTO & CONCILIAÇÃO / NF
  // ==========================================
  static async getFinancialPaymentChannels(): Promise<FinancialPaymentChannel[]> {
    if (!this.isConfigured()) return [];
    const { data, error } = await supabase!
      .from('meios_pagamento_financeiro')
      .select('*')
      .order('ordem', { ascending: true })
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao buscar meios de pagamento financeiro:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      nome: row.nome,
      categoria: (row.categoria || 'OUTROS') as FinancialPaymentCategory,
      exigeNfPadrao: row.exige_nf_padrao !== false,
      ativo: row.ativo !== false,
      ordem: Number(row.ordem ?? 0)
    }));
  }

  static async saveFinancialPaymentChannel(
    channel: FinancialPaymentChannel
  ): Promise<FinancialPaymentChannel> {
    if (!this.isConfigured()) return channel;
    const isUuid = (v?: string) =>
      Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));

    const payload = {
      nome: channel.nome.trim(),
      categoria: channel.categoria || 'OUTROS',
      exige_nf_padrao: channel.exigeNfPadrao !== false,
      ativo: channel.ativo !== false,
      ordem: Number(channel.ordem ?? 0),
      updated_at: new Date().toISOString()
    };

    const { data, error } = isUuid(channel.id)
      ? await supabase!
          .from('meios_pagamento_financeiro')
          .update(payload)
          .eq('id', channel.id)
          .select()
          .single()
      : await supabase!
          .from('meios_pagamento_financeiro')
          .upsert(payload, { onConflict: 'nome' })
          .select()
          .single();

    if (error) throw error;

    return {
      id: data.id,
      nome: data.nome,
      categoria: (data.categoria || 'OUTROS') as FinancialPaymentCategory,
      exigeNfPadrao: data.exige_nf_padrao !== false,
      ativo: data.ativo !== false,
      ordem: Number(data.ordem ?? 0)
    };
  }

  static async deleteFinancialPaymentChannel(channelId: string): Promise<void> {
    if (!this.isConfigured()) return;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId);
    if (!isUuid) return;

    const { error } = await supabase!
      .from('meios_pagamento_financeiro')
      .delete()
      .eq('id', channelId);
    if (error) throw error;
  }

  static async getOrderFinancialRecords(): Promise<OrderFinancialRecord[]> {
    if (!this.isConfigured()) return [];
    const { data, error } = await supabase!
      .from('financeiro_pedidos')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar registros financeiros dos pedidos:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      pedidoId: row.pedido_id,
      conciliacaoStatus: (row.conciliacao_status || 'PENDENTE') as ReconciliationStatus,
      meioPagamentoId: row.meio_pagamento_id || undefined,
      meioPagamentoNome: row.meio_pagamento_nome || undefined,
      dataPagamento: row.data_pagamento || undefined,
      dataExtrato: row.data_extrato || undefined,
      valorConciliado: Number(row.valor_conciliado ?? 0),
      lancamentos: Array.isArray(row.lancamentos)
        ? (row.lancamentos as OrderFinancialPaymentEntry[])
        : [],
      referenciaExtrato: row.referencia_extrato || undefined,
      nfStatus: (row.nf_status || 'PENDENTE') as InvoiceStatus,
      nfDataEmissao: row.nf_data_emissao || undefined,
      nfObservacoes: row.nf_observacoes || undefined,
      observacoes: row.observacoes || undefined,
      atualizadoPor: row.atualizado_por || undefined,
      updatedAt: row.updated_at || undefined
    }));
  }

  static async saveOrderFinancialRecord(
    record: OrderFinancialRecord
  ): Promise<OrderFinancialRecord> {
    if (!this.isConfigured()) return record;
    const isUuid = (v?: string) =>
      Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));

    if (!isUuid(record.pedidoId)) {
      return record;
    }

    const payload = {
      pedido_id: record.pedidoId,
      conciliacao_status: record.conciliacaoStatus || 'PENDENTE',
      meio_pagamento_id: isUuid(record.meioPagamentoId) ? record.meioPagamentoId : null,
      meio_pagamento_nome: record.meioPagamentoNome?.trim() || null,
      data_pagamento: record.dataPagamento || null,
      data_extrato: record.dataExtrato || null,
      valor_conciliado: Number((record.valorConciliado || 0).toFixed(2)),
      lancamentos: Array.isArray(record.lancamentos) ? record.lancamentos : [],
      referencia_extrato: record.referenciaExtrato?.trim() || null,
      nf_status: record.nfStatus || 'PENDENTE',
      nf_data_emissao: record.nfDataEmissao || null,
      nf_observacoes: record.nfObservacoes?.trim() || null,
      observacoes: record.observacoes?.trim() || null,
      atualizado_por: record.atualizadoPor?.trim() || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase!
      .from('financeiro_pedidos')
      .upsert(payload, { onConflict: 'pedido_id' })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      pedidoId: data.pedido_id,
      conciliacaoStatus: (data.conciliacao_status || 'PENDENTE') as ReconciliationStatus,
      meioPagamentoId: data.meio_pagamento_id || undefined,
      meioPagamentoNome: data.meio_pagamento_nome || undefined,
      dataPagamento: data.data_pagamento || undefined,
      dataExtrato: data.data_extrato || undefined,
      valorConciliado: Number(data.valor_conciliado ?? 0),
      lancamentos: Array.isArray(data.lancamentos)
        ? (data.lancamentos as OrderFinancialPaymentEntry[])
        : [],
      referenciaExtrato: data.referencia_extrato || undefined,
      nfStatus: (data.nf_status || 'PENDENTE') as InvoiceStatus,
      nfDataEmissao: data.nf_data_emissao || undefined,
      nfObservacoes: data.nf_observacoes || undefined,
      observacoes: data.observacoes || undefined,
      atualizadoPor: data.atualizado_por || undefined,
      updatedAt: data.updated_at || undefined
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

  static async signInOperator(
    email: string,
    password: string
  ): Promise<{ authUser: any; profile: UserProfile | null }> {
    if (!this.isConfigured()) throw new Error('Supabase não configurado');
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Standard Supabase Auth password sign-in
    const { data: pwData, error: pwError } = await supabase!.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });
    if (!pwError && pwData?.user) {
      return { authUser: pwData.user, profile: null };
    }

    // 2. Deployed Edge Function path (provisions Auth + verifies bcrypt credential)
    try {
      const { data: fnData, error: fnErr } = await supabase!.functions.invoke('operator-auth', {
        body: { action: 'login', email: normalizedEmail, password }
      });

      if (!fnErr && fnData?.ok) {
        const signIn2 = await supabase!.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });
        if (!signIn2.error && signIn2.data?.user) {
          return { authUser: signIn2.data.user, profile: null };
        }
      }
      if (fnData && fnData.ok === false) {
        throw new Error(fnData.message || 'E-mail ou senha numérica de 8 dígitos incorretos.');
      }
    } catch (fnCatchErr: any) {
      const msg = String(fnCatchErr?.message || '');
      if (
        msg &&
        !msg.includes('Failed to send') &&
        !msg.includes('FunctionsFetchError') &&
        !msg.includes('404')
      ) {
        throw fnCatchErr;
      }
    }

    // 3. Fallback Postgres server-side bcrypt RPC when operator-auth is not yet deployed
    const { data: rows, error: rpcErr } = await supabase!.rpc('autenticar_operador', {
      p_email: normalizedEmail,
      p_pin: password
    });

    if (rpcErr || !Array.isArray(rows) || rows.length === 0) {
      throw new Error('E-mail ou senha numérica de 8 dígitos incorretos.');
    }

    const row = rows[0] as any;
    const profile: UserProfile = {
      id: row.id,
      email: row.email,
      nome: row.nome,
      avatarUrl: row.avatar_url || '/logo.jpg',
      role: (row.role || 'ATENDIMENTO') as UserProfile['role'],
      unidadePadraoId: row.unidade_padrao_id || '',
      autenticadoGoogle: false,
      ativo: row.ativo !== false,
      unidadesPermitidas: Array.isArray(row.unidades_permitidas) ? row.unidades_permitidas : []
    };

    let signUpUser: any = null;
    try {
      const { data: signUpData } = await supabase!.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: profile.nome }
        }
      });
      signUpUser = signUpData?.session?.user || null;
    } catch {
      // Ignore if email confirmation is required or Auth user already exists
    }

    return { authUser: signUpUser, profile };
  }

  static async verifyCurrentOperatorPin(email: string, pin: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const { data, error } = await supabase!.rpc('verificar_pin_operador', {
      p_email: email.trim().toLowerCase(),
      p_pin: pin.trim()
    });
    if (error) {
      console.error('Erro ao verificar PIN do operador:', error);
      return false;
    }
    return Boolean(data);
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

  static async signOut() {
    if (!this.isConfigured()) return;
    await supabase!.auth.signOut();
  }
}
