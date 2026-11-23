-- ====================================================================
-- JuJu Delivery - Schema Relacional Supabase (PostgreSQL)
-- Confeitaria Artesanal: Central de Produção e Múltiplas Lojas (N-Lojas)
-- ====================================================================

-- Habilitar UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABELA DE UNIDADES / FILIAIS (Escalável para Central + N-Lojas)
CREATE TABLE IF NOT EXISTS public.empresas_unidades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_unidade VARCHAR(30) UNIQUE NOT NULL, -- Ex: 'CENTRAL', 'LOJA-01', 'LOJA-02'
    nome VARCHAR(100) NOT NULL,                -- Ex: 'Central de Produção', 'Loja Jardins'
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('CENTRAL', 'LOJA')),
    endereco TEXT NOT NULL,
    cidade VARCHAR(80) NOT NULL DEFAULT 'São Paulo',
    telefone_whatsapp VARCHAR(25) NOT NULL,
    chave_pix VARCHAR(100),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA DE CATEGORIAS DE PRODUTOS
CREATE TABLE IF NOT EXISTS public.categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(60) UNIQUE NOT NULL,
    ordem INT NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABELA DE PRODUTOS
CREATE TABLE IF NOT EXISTS public.produtos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_sku VARCHAR(30) UNIQUE NOT NULL,
    descricao VARCHAR(150) NOT NULL,
    foto_url TEXT,
    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario > 0),
    unidade_medida VARCHAR(10) NOT NULL DEFAULT 'UN' CHECK (unidade_medida IN ('UN', 'KG', 'G', 'CENTO', 'CX')),
    categoria_id UUID NOT NULL REFERENCES public.categorias(id) ON DELETE RESTRICT,
    tempo_producao_minutos INT NOT NULL DEFAULT 30,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABELA DE PEDIDOS
CREATE TABLE IF NOT EXISTS public.pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_pedido VARCHAR(30) UNIQUE NOT NULL, -- Ex: '#PED-2026-0042'
    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' 
        CHECK (status IN ('PENDENTE', 'CONFIRMADO', 'EM_PRODUCAO', 'PRONTO', 'EM_ROTA', 'ENTREGUE', 'CANCELADO')),
    data_pedido TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_hora_entrega TIMESTAMPTZ NOT NULL,
    data_hora_entrega_fim TIMESTAMPTZ,
    turno_entrega VARCHAR(10) CHECK (turno_entrega IN ('MANHA', 'TARDE', 'NOITE')),
    tipo_entrega VARCHAR(15) NOT NULL CHECK (tipo_entrega IN ('DELIVERY', 'RETIRADA')),
    unidade_origem_id UUID NOT NULL REFERENCES public.empresas_unidades(id) ON DELETE RESTRICT,
    unidade_retirada_id UUID REFERENCES public.empresas_unidades(id) ON DELETE RESTRICT,
    cliente_nome VARCHAR(100) NOT NULL,
    cliente_telefone VARCHAR(25) NOT NULL,
    cliente_endereco TEXT,
    endereco_entrega TEXT,
    valor_subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    taxa_entrega NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (taxa_entrega >= 0),
    desconto NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (desconto >= 0),
    valor_total NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (valor_total >= 0),
    forma_pagamento VARCHAR(20) NOT NULL CHECK (forma_pagamento IN ('pix', 'debito', 'credito', 'dinheiro')),
    troco_para NUMERIC(10,2),
    instrucoes_pagamento TEXT,
    observacoes TEXT,
    detalhe_entrega TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. ITENS DO PEDIDO
CREATE TABLE IF NOT EXISTS public.itens_pedido (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    observacoes_item TEXT
);

-- 6. CONTROLE DE ESTOQUE POR UNIDADE (Central e Filiais)
CREATE TABLE IF NOT EXISTS public.estoque_unidades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unidade_id UUID NOT NULL REFERENCES public.empresas_unidades(id) ON DELETE RESTRICT,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade_atual NUMERIC(10,3) NOT NULL DEFAULT 0.000,
    quantidade_minima NUMERIC(10,3) NOT NULL DEFAULT 5.000,
    data_atualizacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (unidade_id, produto_id)
);

-- 7. MOVIMENTAÇÕES DE ESTOQUE (Entrada, Venda, Transferência, Ajuste)
CREATE TABLE IF NOT EXISTS public.movimentacoes_estoque (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(25) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA_VENDA', 'TRANSFERENCIA', 'PERDA', 'AJUSTE_INVENTARIO')),
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    unidade_origem_id UUID NOT NULL REFERENCES public.empresas_unidades(id) ON DELETE RESTRICT,
    unidade_destino_id UUID REFERENCES public.empresas_unidades(id) ON DELETE RESTRICT,
    quantidade NUMERIC(10,3) NOT NULL CHECK (quantidade > 0),
    motivo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. CONTROLE DE PRODUÇÃO CENTRALIZADA (Baseada em Pedidos)
CREATE TABLE IF NOT EXISTS public.ordens_producao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo_ordem VARCHAR(30) UNIQUE NOT NULL, -- Ex: 'OP-20261114-M'
    data_producao DATE NOT NULL,
    turno VARCHAR(15) NOT NULL CHECK (turno IN ('MANHA', 'TARDE', 'NOITE')),
    status VARCHAR(20) NOT NULL DEFAULT 'PLANEJADA' CHECK (status IN ('PLANEJADA', 'EM_PREPARO', 'DECORACAO', 'CONCLUIDA')),
    unidade_id UUID NOT NULL REFERENCES public.empresas_unidades(id) ON DELETE RESTRICT,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.itens_producao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ordem_producao_id UUID NOT NULL REFERENCES public.ordens_producao(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade_planejada NUMERIC(10,3) NOT NULL CHECK (quantidade_planejada > 0),
    quantidade_produzida NUMERIC(10,3) NOT NULL DEFAULT 0.000,
    unidade_destino_id UUID REFERENCES public.empresas_unidades(id) ON DELETE RESTRICT,
    pedido_origem_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL
);

-- 9. PERFIS DE USUÁRIOS (Controle de Acesso — credenciais hash em private.operador_credenciais)
CREATE TABLE IF NOT EXISTS public.usuarios_perfis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(120) UNIQUE NOT NULL,
    nome VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'ATENDIMENTO' CHECK (role IN ('ADMIN', 'GERENTE', 'ATENDIMENTO', 'CONFEITEIRO')),
    unidade_padrao_id UUID REFERENCES public.empresas_unidades(id) ON DELETE SET NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    unidades_permitidas JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. CONFIGURAÇÕES GERAIS DA APLICAÇÃO (Metas por Unidade, Cardápio Digital, etc.)
CREATE TABLE IF NOT EXISTS public.app_configuracoes (
    chave TEXT PRIMARY KEY,
    valor JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- TRIGGERS DE INTEGRIDADE E TOTALIZAÇÃO AUTOMÁTICA
-- ====================================================================

-- Função para atualizar o valor total do pedido a partir dos itens
CREATE OR REPLACE FUNCTION public.fn_recalcular_total_pedido()
RETURNS TRIGGER AS $$
DECLARE
    v_pedido_id UUID;
    v_subtotal NUMERIC(10,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_pedido_id := OLD.pedido_id;
    ELSE
        v_pedido_id := NEW.pedido_id;
    END IF;

    SELECT COALESCE(SUM(subtotal), 0.00)
    INTO v_subtotal
    FROM public.itens_pedido
    WHERE pedido_id = v_pedido_id;

    UPDATE public.pedidos
    SET valor_subtotal = v_subtotal,
        valor_total = GREATEST(0.00, v_subtotal + taxa_entrega - desconto),
        updated_at = NOW()
    WHERE id = v_pedido_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalcular_total_pedido ON public.itens_pedido;
CREATE TRIGGER trg_recalcular_total_pedido
AFTER INSERT OR UPDATE OR DELETE ON public.itens_pedido
FOR EACH ROW
EXECUTE FUNCTION public.fn_recalcular_total_pedido();

-- ====================================================================
-- DADOS INICIAIS (SEED DATA)
-- ====================================================================

-- Inserir Filiais Iniciais (Central + 2 Lojas + 1 Adicional demonstrando N-Lojas)
INSERT INTO public.empresas_unidades (codigo_unidade, nome, tipo, endereco, telefone_whatsapp, chave_pix) VALUES
('CENTRAL', 'Ateliê de Produção', 'CENTRAL', 'Rua dos Padeiros, 500 - Galpão 3, Barra Funda', '+5511999990001', 'financeiro@jujudelivery.com.br'),
('LOJA-01', 'Loja 1 - Jardins', 'LOJA', 'Rua Oscar Freire, 1200, Jardins', '+5511999990002', 'jardins@jujudelivery.com.br'),
('LOJA-02', 'Loja 2 - Moema', 'LOJA', 'Av. Moema, 350, Moema', '+5511999990003', 'moema@jujudelivery.com.br'),
('LOJA-03', 'Loja 3 - Pinheiros', 'LOJA', 'Rua dos Pinheiros, 740, Pinheiros', '+5511999990004', 'pinheiros@jujudelivery.com.br')
ON CONFLICT (codigo_unidade) DO NOTHING;

-- Inserir Categorias Padrão
INSERT INTO public.categorias (nome, ordem) VALUES
('Sobremesas Individuais', 1),
('Encomendas', 2),
('Sazonal', 3),
('Salgados', 4),
('Empório', 5)
ON CONFLICT (nome) DO NOTHING;
