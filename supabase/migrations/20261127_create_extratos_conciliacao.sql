-- ============================================================================
-- MIGRATION: Módulo de Conciliação Bancária & Cartões (Extratos, Vínculos, Períodos)
-- ============================================================================

-- 1. Seed do canal Rede em meios_pagamento_financeiro
INSERT INTO public.meios_pagamento_financeiro (nome, categoria, exige_nf_padrao, ordem)
VALUES ('Rede', 'CARTAO', TRUE, 7)
ON CONFLICT (nome) DO NOTHING;

-- 2. Lotes de extratos importados (auditoria de arquivos OFX / CSV / XLSX)
CREATE TABLE IF NOT EXISTS public.extratos_importados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canal_id UUID REFERENCES public.meios_pagamento_financeiro(id) ON DELETE SET NULL,
    canal_nome TEXT NOT NULL,
    arquivo_nome TEXT NOT NULL,
    formato TEXT NOT NULL CHECK (formato IN ('OFX', 'CSV', 'XLSX')),
    periodo_inicio DATE,
    periodo_fim DATE,
    total_linhas INT NOT NULL DEFAULT 0 CHECK (total_linhas >= 0),
    linhas_novas INT NOT NULL DEFAULT 0 CHECK (linhas_novas >= 0),
    linhas_duplicadas INT NOT NULL DEFAULT 0 CHECK (linhas_duplicadas >= 0),
    importado_por TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Lançamentos individuais de crédito importados dos extratos
CREATE TABLE IF NOT EXISTS public.extrato_lancamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lote_id UUID REFERENCES public.extratos_importados(id) ON DELETE SET NULL,
    competencia TEXT NOT NULL CHECK (competencia ~ '^\d{4}-\d{2}$'),
    canal_id UUID REFERENCES public.meios_pagamento_financeiro(id) ON DELETE SET NULL,
    canal_nome TEXT NOT NULL,
    data_extrato DATE NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    pagador_nome TEXT,
    referencia_nsu TEXT,
    valor_bruto NUMERIC(10,2) NOT NULL CHECK (valor_bruto > 0),
    valor_taxa NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (valor_taxa >= 0),
    valor_liquido NUMERIC(10,2) NOT NULL CHECK (valor_liquido >= 0),
    status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (status IN ('PENDENTE', 'CONCILIADO', 'PARCIAL', 'IGNORADO')),
    conciliado_por TEXT,
    conciliado_em TIMESTAMPTZ,
    ignorado_por TEXT,
    ignorado_em TIMESTAMPTZ,
    motivo_ignorado TEXT,
    fingerprint_hash TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabela pivô N:M suportando 1:1, 1:N, N:1 e conciliação parcial (Sinal)
CREATE TABLE IF NOT EXISTS public.extrato_conciliacao_vinculos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    extrato_lancamento_id UUID NOT NULL REFERENCES public.extrato_lancamentos(id) ON DELETE CASCADE,
    pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
    valor_alocado NUMERIC(10,2) NOT NULL CHECK (valor_alocado > 0),
    conciliado_por TEXT,
    conciliado_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT extrato_conciliacao_vinculos_unique UNIQUE (extrato_lancamento_id, pedido_id)
);

-- 5. Controle de Trava Mensal por Competência (YYYY-MM)
CREATE TABLE IF NOT EXISTS public.conciliacao_periodos_fechados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competencia TEXT UNIQUE NOT NULL CHECK (competencia ~ '^\d{4}-\d{2}$'),
    status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'FECHADO')),
    fechado_por TEXT,
    fechado_em TIMESTAMPTZ,
    reaberto_por TEXT,
    reaberto_em TIMESTAMPTZ,
    resumo_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para FKs e filtros frequentes
CREATE INDEX IF NOT EXISTS extratos_importados_canal_id_idx
  ON public.extratos_importados (canal_id);

CREATE INDEX IF NOT EXISTS extrato_lancamentos_lote_id_idx
  ON public.extrato_lancamentos (lote_id);

CREATE INDEX IF NOT EXISTS extrato_lancamentos_canal_id_idx
  ON public.extrato_lancamentos (canal_id);

CREATE INDEX IF NOT EXISTS extrato_lancamentos_competencia_status_idx
  ON public.extrato_lancamentos (competencia, status);

CREATE INDEX IF NOT EXISTS extrato_conciliacao_vinculos_lancamento_id_idx
  ON public.extrato_conciliacao_vinculos (extrato_lancamento_id);

CREATE INDEX IF NOT EXISTS extrato_conciliacao_vinculos_pedido_id_idx
  ON public.extrato_conciliacao_vinculos (pedido_id);

-- Row-Level Security (RLS): ZERO acesso anon; apenas ADMIN e GERENTE autenticados
ALTER TABLE public.extratos_importados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extrato_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extrato_conciliacao_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conciliacao_periodos_fechados ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- extratos_importados
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extratos_importados' AND policyname = 'conc_select_extratos_importados') THEN
    CREATE POLICY "conc_select_extratos_importados" ON public.extratos_importados
      FOR SELECT TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extratos_importados' AND policyname = 'conc_insert_extratos_importados') THEN
    CREATE POLICY "conc_insert_extratos_importados" ON public.extratos_importados
      FOR INSERT TO authenticated
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extratos_importados' AND policyname = 'conc_update_extratos_importados') THEN
    CREATE POLICY "conc_update_extratos_importados" ON public.extratos_importados
      FOR UPDATE TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'))
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extratos_importados' AND policyname = 'admin_delete_extratos_importados') THEN
    CREATE POLICY "admin_delete_extratos_importados" ON public.extratos_importados
      FOR DELETE TO authenticated
      USING ((SELECT private.is_admin()));
  END IF;

  -- extrato_lancamentos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extrato_lancamentos' AND policyname = 'conc_select_extrato_lancamentos') THEN
    CREATE POLICY "conc_select_extrato_lancamentos" ON public.extrato_lancamentos
      FOR SELECT TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extrato_lancamentos' AND policyname = 'conc_insert_extrato_lancamentos') THEN
    CREATE POLICY "conc_insert_extrato_lancamentos" ON public.extrato_lancamentos
      FOR INSERT TO authenticated
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extrato_lancamentos' AND policyname = 'conc_update_extrato_lancamentos') THEN
    CREATE POLICY "conc_update_extrato_lancamentos" ON public.extrato_lancamentos
      FOR UPDATE TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'))
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extrato_lancamentos' AND policyname = 'admin_delete_extrato_lancamentos') THEN
    CREATE POLICY "admin_delete_extrato_lancamentos" ON public.extrato_lancamentos
      FOR DELETE TO authenticated
      USING ((SELECT private.is_admin()));
  END IF;

  -- extrato_conciliacao_vinculos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extrato_conciliacao_vinculos' AND policyname = 'conc_select_extrato_conciliacao_vinculos') THEN
    CREATE POLICY "conc_select_extrato_conciliacao_vinculos" ON public.extrato_conciliacao_vinculos
      FOR SELECT TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extrato_conciliacao_vinculos' AND policyname = 'conc_insert_extrato_conciliacao_vinculos') THEN
    CREATE POLICY "conc_insert_extrato_conciliacao_vinculos" ON public.extrato_conciliacao_vinculos
      FOR INSERT TO authenticated
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extrato_conciliacao_vinculos' AND policyname = 'conc_update_extrato_conciliacao_vinculos') THEN
    CREATE POLICY "conc_update_extrato_conciliacao_vinculos" ON public.extrato_conciliacao_vinculos
      FOR UPDATE TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'))
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'extrato_conciliacao_vinculos' AND policyname = 'conc_delete_extrato_conciliacao_vinculos') THEN
    CREATE POLICY "conc_delete_extrato_conciliacao_vinculos" ON public.extrato_conciliacao_vinculos
      FOR DELETE TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;

  -- conciliacao_periodos_fechados (reabertura para ABERTO exclusiva de ADMIN)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conciliacao_periodos_fechados' AND policyname = 'conc_select_conciliacao_periodos') THEN
    CREATE POLICY "conc_select_conciliacao_periodos" ON public.conciliacao_periodos_fechados
      FOR SELECT TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conciliacao_periodos_fechados' AND policyname = 'conc_insert_conciliacao_periodos') THEN
    CREATE POLICY "conc_insert_conciliacao_periodos" ON public.conciliacao_periodos_fechados
      FOR INSERT TO authenticated
      WITH CHECK ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conciliacao_periodos_fechados' AND policyname = 'conc_update_conciliacao_periodos') THEN
    CREATE POLICY "conc_update_conciliacao_periodos" ON public.conciliacao_periodos_fechados
      FOR UPDATE TO authenticated
      USING ((SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE'))
      WITH CHECK (
        (SELECT private.current_operator_role()) IN ('ADMIN', 'GERENTE')
        AND (status = 'FECHADO' OR (SELECT private.is_admin()))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conciliacao_periodos_fechados' AND policyname = 'admin_delete_conciliacao_periodos') THEN
    CREATE POLICY "admin_delete_conciliacao_periodos" ON public.conciliacao_periodos_fechados
      FOR DELETE TO authenticated
      USING ((SELECT private.is_admin()));
  END IF;
END $$;
