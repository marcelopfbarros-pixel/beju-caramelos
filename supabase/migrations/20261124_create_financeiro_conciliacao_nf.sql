-- ============================================================================
-- MIGRATION: Módulo Financeiro — Meios de Pagamento, Conciliação & Controle de NF
-- ============================================================================

-- 1. Catálogo configurável de meios de pagamento financeiros
CREATE TABLE IF NOT EXISTS public.meios_pagamento_financeiro (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT UNIQUE NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'OUTROS'
        CHECK (categoria IN ('PIX', 'CARTAO', 'DINHEIRO', 'BOLETO', 'BONIFICADO', 'OUTROS')),
    exige_nf_padrao BOOLEAN NOT NULL DEFAULT TRUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    ordem INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed inicial dos 6 meios solicitados
INSERT INTO public.meios_pagamento_financeiro (nome, categoria, exige_nf_padrao, ordem) VALUES
  ('PixC6', 'PIX', TRUE, 1),
  ('C6pay', 'CARTAO', TRUE, 2),
  ('Sumup', 'CARTAO', TRUE, 3),
  ('Dinheiro', 'DINHEIRO', TRUE, 4),
  ('Bonificado', 'BONIFICADO', FALSE, 5),
  ('Boleto', 'BOLETO', TRUE, 6)
ON CONFLICT (nome) DO NOTHING;

-- 2. Conciliação bancária e emissão de NF por pedido (1:1 com public.pedidos)
CREATE TABLE IF NOT EXISTS public.financeiro_pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID NOT NULL UNIQUE REFERENCES public.pedidos(id) ON DELETE CASCADE,
    conciliacao_status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (conciliacao_status IN ('PENDENTE', 'PARCIAL', 'CONCILIADO')),
    meio_pagamento_id UUID REFERENCES public.meios_pagamento_financeiro(id) ON DELETE SET NULL,
    meio_pagamento_nome TEXT,
    data_pagamento DATE,
    data_extrato DATE,
    valor_conciliado NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (valor_conciliado >= 0),
    lancamentos JSONB NOT NULL DEFAULT '[]'::jsonb,
    referencia_extrato TEXT,
    nf_status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (nf_status IN ('PENDENTE', 'EMITIDA', 'DISPENSADA')),
    nf_data_emissao DATE,
    nf_observacoes TEXT,
    observacoes TEXT,
    atualizado_por TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para FKs, filtro por data do extrato e filas de pendência
CREATE INDEX IF NOT EXISTS financeiro_pedidos_meio_pagamento_id_idx
  ON public.financeiro_pedidos (meio_pagamento_id);
CREATE INDEX IF NOT EXISTS financeiro_pedidos_data_extrato_idx
  ON public.financeiro_pedidos (data_extrato);
CREATE INDEX IF NOT EXISTS financeiro_pedidos_conciliacao_pendente_idx
  ON public.financeiro_pedidos (conciliacao_status)
  WHERE conciliacao_status <> 'CONCILIADO';
CREATE INDEX IF NOT EXISTS financeiro_pedidos_nf_pendente_idx
  ON public.financeiro_pedidos (nf_status)
  WHERE nf_status = 'PENDENTE';

-- 3. Row-Level Security (RLS): ZERO acesso anon; somente ADMIN e GERENTE autenticados
ALTER TABLE public.meios_pagamento_financeiro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_pedidos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meios_pagamento_financeiro' AND policyname = 'fin_select_meios_pagamento'
  ) THEN
    CREATE POLICY "fin_select_meios_pagamento" ON public.meios_pagamento_financeiro
      FOR SELECT TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meios_pagamento_financeiro' AND policyname = 'fin_insert_meios_pagamento'
  ) THEN
    CREATE POLICY "fin_insert_meios_pagamento" ON public.meios_pagamento_financeiro
      FOR INSERT TO authenticated
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meios_pagamento_financeiro' AND policyname = 'fin_update_meios_pagamento'
  ) THEN
    CREATE POLICY "fin_update_meios_pagamento" ON public.meios_pagamento_financeiro
      FOR UPDATE TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'))
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meios_pagamento_financeiro' AND policyname = 'admin_delete_meios_pagamento'
  ) THEN
    CREATE POLICY "admin_delete_meios_pagamento" ON public.meios_pagamento_financeiro
      FOR DELETE TO authenticated
      USING ((SELECT private.is_admin()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financeiro_pedidos' AND policyname = 'fin_select_financeiro_pedidos'
  ) THEN
    CREATE POLICY "fin_select_financeiro_pedidos" ON public.financeiro_pedidos
      FOR SELECT TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financeiro_pedidos' AND policyname = 'fin_insert_financeiro_pedidos'
  ) THEN
    CREATE POLICY "fin_insert_financeiro_pedidos" ON public.financeiro_pedidos
      FOR INSERT TO authenticated
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financeiro_pedidos' AND policyname = 'fin_update_financeiro_pedidos'
  ) THEN
    CREATE POLICY "fin_update_financeiro_pedidos" ON public.financeiro_pedidos
      FOR UPDATE TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'))
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'financeiro_pedidos' AND policyname = 'admin_delete_financeiro_pedidos'
  ) THEN
    CREATE POLICY "admin_delete_financeiro_pedidos" ON public.financeiro_pedidos
      FOR DELETE TO authenticated
      USING ((SELECT private.is_admin()));
  END IF;
END $$;
