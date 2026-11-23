-- ============================================================================
-- FINAL SECURITY LOCKDOWN MIGRATION
-- ============================================================================
-- IMPORTANT: Execute this script in the Supabase Dashboard SQL Editor ONLY AFTER
-- deploying the updated frontend (with operator-auth JWT flow) to Netlify, so
-- currently active users on the old bundle are not locked out prematurely.
--
-- What this does:
-- 1. Removes plaintext column public.usuarios_perfis.senha_pin (credentials
--    are already copied and bcrypt-hashed inside private.operador_credenciais).
-- 2. Replaces all legacy wide-open "Permitir acesso completo a ..." policies
--    (FOR ALL TO public USING (true)) with role-scoped policies for anon
--    (read-only active catalog/stock/public menu config) and authenticated
--    active operators (private.is_active_operator() / private.is_admin()).
-- ============================================================================

-- 1. Drop legacy plaintext PIN column (already hashed in private.operador_credenciais)
ALTER TABLE public.usuarios_perfis
  DROP COLUMN IF EXISTS senha_pin;

-- 2. Drop all legacy permissive "public" policies
DROP POLICY IF EXISTS "Permitir acesso completo a empresas_unidades" ON public.empresas_unidades;
DROP POLICY IF EXISTS "Permitir acesso completo a categorias" ON public.categorias;
DROP POLICY IF EXISTS "Permitir acesso completo a produtos" ON public.produtos;
DROP POLICY IF EXISTS "Permitir acesso completo a estoque_unidades" ON public.estoque_unidades;
DROP POLICY IF EXISTS "Permitir acesso completo a movimentacoes_estoque" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "Permitir acesso completo a pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Permitir acesso completo a itens_pedido" ON public.itens_pedido;
DROP POLICY IF EXISTS "Permitir acesso completo a ordens_producao" ON public.ordens_producao;
DROP POLICY IF EXISTS "Permitir acesso completo a itens_producao" ON public.itens_producao;
DROP POLICY IF EXISTS "Permitir acesso completo a clientes" ON public.clientes;
DROP POLICY IF EXISTS "Permitir acesso completo a usuarios_perfis" ON public.usuarios_perfis;

-- 3. Public catalog tables: anon SELECT active rows only; active operators SELECT all;
--    ADMIN writes catalog; active operators write estoque_unidades.
CREATE POLICY "anon_select_active_unidades" ON public.empresas_unidades
  FOR SELECT TO anon USING (ativo = true);
CREATE POLICY "auth_select_unidades" ON public.empresas_unidades
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "admin_insert_unidades" ON public.empresas_unidades
  FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "admin_update_unidades" ON public.empresas_unidades
  FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin_delete_unidades" ON public.empresas_unidades
  FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "anon_select_active_categorias" ON public.categorias
  FOR SELECT TO anon USING (ativo = true);
CREATE POLICY "auth_select_categorias" ON public.categorias
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "admin_insert_categorias" ON public.categorias
  FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "admin_update_categorias" ON public.categorias
  FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin_delete_categorias" ON public.categorias
  FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "anon_select_active_produtos" ON public.produtos
  FOR SELECT TO anon USING (ativo = true);
CREATE POLICY "auth_select_produtos" ON public.produtos
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "admin_insert_produtos" ON public.produtos
  FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "admin_update_produtos" ON public.produtos
  FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin_delete_produtos" ON public.produtos
  FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "anon_select_estoque" ON public.estoque_unidades
  FOR SELECT TO anon USING (true);
CREATE POLICY "auth_select_estoque" ON public.estoque_unidades
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "auth_insert_estoque" ON public.estoque_unidades
  FOR INSERT TO authenticated WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_update_estoque" ON public.estoque_unidades
  FOR UPDATE TO authenticated USING (private.is_active_operator()) WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_delete_estoque" ON public.estoque_unidades
  FOR DELETE TO authenticated USING (private.is_active_operator());

-- 4. Operational & PII tables: authenticated active operators ONLY (ZERO anon access)
CREATE POLICY "auth_select_pedidos" ON public.pedidos
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "auth_insert_pedidos" ON public.pedidos
  FOR INSERT TO authenticated WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_update_pedidos" ON public.pedidos
  FOR UPDATE TO authenticated USING (private.is_active_operator()) WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_delete_pedidos" ON public.pedidos
  FOR DELETE TO authenticated USING (private.is_active_operator() AND (status = 'PENDENTE' OR numero_pedido ILIKE '%MOCK%'));

CREATE POLICY "auth_select_itens_pedido" ON public.itens_pedido
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "auth_insert_itens_pedido" ON public.itens_pedido
  FOR INSERT TO authenticated WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_update_itens_pedido" ON public.itens_pedido
  FOR UPDATE TO authenticated USING (private.is_active_operator()) WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_delete_itens_pedido" ON public.itens_pedido
  FOR DELETE TO authenticated USING (private.is_active_operator());

CREATE POLICY "auth_select_clientes" ON public.clientes
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "auth_insert_clientes" ON public.clientes
  FOR INSERT TO authenticated WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_update_clientes" ON public.clientes
  FOR UPDATE TO authenticated USING (private.is_active_operator()) WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_delete_clientes" ON public.clientes
  FOR DELETE TO authenticated USING (private.is_active_operator());

CREATE POLICY "auth_select_movimentacoes" ON public.movimentacoes_estoque
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "auth_insert_movimentacoes" ON public.movimentacoes_estoque
  FOR INSERT TO authenticated WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_delete_movimentacoes" ON public.movimentacoes_estoque
  FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "auth_select_ordens_producao" ON public.ordens_producao
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "auth_insert_ordens_producao" ON public.ordens_producao
  FOR INSERT TO authenticated WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_update_ordens_producao" ON public.ordens_producao
  FOR UPDATE TO authenticated USING (private.is_active_operator()) WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_delete_ordens_producao" ON public.ordens_producao
  FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "auth_select_itens_producao" ON public.itens_producao
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "auth_insert_itens_producao" ON public.itens_producao
  FOR INSERT TO authenticated WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_update_itens_producao" ON public.itens_producao
  FOR UPDATE TO authenticated USING (private.is_active_operator()) WITH CHECK (private.is_active_operator());
CREATE POLICY "auth_delete_itens_producao" ON public.itens_producao
  FOR DELETE TO authenticated USING (private.is_active_operator());

-- 5. Users table: ZERO anon access; authenticated active operators can SELECT; only ADMIN writes
CREATE POLICY "auth_select_usuarios" ON public.usuarios_perfis
  FOR SELECT TO authenticated USING (private.is_active_operator());
CREATE POLICY "admin_insert_usuarios" ON public.usuarios_perfis
  FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "admin_update_usuarios" ON public.usuarios_perfis
  FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin_delete_usuarios" ON public.usuarios_perfis
  FOR DELETE TO authenticated USING (private.is_admin());
