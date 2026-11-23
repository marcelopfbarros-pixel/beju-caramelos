import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EXACT_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://juju-delivery-app.netlify.app",
  "http://juju-delivery-app.netlify.app",
]);
const PREVIEW_RE = /^https:\/\/[a-z0-9-]+--juju-delivery-app\.netlify\.app$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(req: Request) {
  const o = req.headers.get("Origin") || "";
  const allow = EXACT_ORIGINS.has(o) || PREVIEW_RE.test(o) ? o : "https://juju-delivery-app.netlify.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

async function syncAuthUser(
  admin: ReturnType<typeof createClient>,
  p: { usuarioId: string; authUserId?: string | null; email: string; nome: string; role: string; password?: string; ativo: boolean }
): Promise<string | null> {
  const upd: Record<string, unknown> = {
    email: p.email,
    email_confirm: true,
    ban_duration: p.ativo ? "none" : "876000h",
    app_metadata: { role: p.role, profile_id: p.usuarioId },
    user_metadata: { full_name: p.nome },
    ...(p.password ? { password: p.password } : {}),
  };
  if (p.authUserId) {
    const { data, error } = await admin.auth.admin.updateUserById(p.authUserId, upd);
    if (!error && data?.user?.id) return data.user.id;
  }
  if (p.password) {
    const { data, error } = await admin.auth.admin.createUser({
      email: p.email, password: p.password, email_confirm: true,
      app_metadata: { role: p.role, profile_id: p.usuarioId },
      user_metadata: { full_name: p.nome },
    });
    if (!error && data?.user?.id) {
      if (!p.ativo) await admin.auth.admin.updateUserById(data.user.id, { ban_duration: "876000h" });
      return data.user.id;
    }
  }
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = listed?.users?.find((u) => (u.email || "").toLowerCase() === p.email.toLowerCase());
  if (existing?.id) {
    await admin.auth.admin.updateUserById(existing.id, upd);
    return existing.id;
  }
  return p.authUserId || null;
}

Deno.serve(async (req: Request) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !key) return json({ ok: false, message: "Serviço indisponível." }, 500, h);
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "login") {
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body?.password === "string" ? body.password.trim() : "";
      if (!email || !/^\d{8}$/.test(password)) {
        await delay();
        return json({ ok: false, message: "E-mail ou senha numérica de 8 dígitos incorretos." }, 401, h);
      }
      const { data: rows, error } = await admin.rpc("internal_verify_operator_pin", { p_email: email, p_pin: password });
      if (error || !Array.isArray(rows) || rows.length === 0) {
        await delay();
        return json({ ok: false, message: "E-mail ou senha numérica de 8 dígitos incorretos." }, 401, h);
      }
      const r = rows[0] as any;
      const authId = await syncAuthUser(admin, {
        usuarioId: r.usuario_id, authUserId: r.auth_user_id, email: r.email,
        nome: r.nome, role: r.role, password, ativo: r.ativo !== false,
      });
      if (authId && authId !== r.auth_user_id) {
        await admin.rpc("internal_link_operator_auth_user", { p_usuario_id: r.usuario_id, p_auth_user_id: authId });
      }
      return json({ ok: true }, 200, h);
    }

    const authHdr = req.headers.get("Authorization") || "";
    const jwt = authHdr.startsWith("Bearer ") ? authHdr.slice(7).trim() : "";
    if (!jwt) return json({ ok: false, message: "Autenticação necessária." }, 401, h);
    const { data: uRes, error: uErr } = await admin.auth.getUser(jwt);
    const callerEmail = (uRes?.user?.email || "").toLowerCase();
    if (uErr || !callerEmail) return json({ ok: false, message: "Sessão inválida." }, 401, h);

    const { data: caller, error: cErr } = await admin
      .from("usuarios_perfis").select("id, email, nome, role, ativo").ilike("email", callerEmail).maybeSingle();
    if (cErr || !caller || caller.ativo === false) return json({ ok: false, message: "Sem permissão." }, 403, h);

    if (action === "verify_pin") {
      const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
      if (!/^\d{8}$/.test(pin)) { await delay(); return json({ valid: false }, 200, h); }
      const { data: rows } = await admin.rpc("internal_verify_operator_pin", { p_email: caller.email, p_pin: pin });
      if (!Array.isArray(rows) || rows.length === 0) { await delay(); return json({ valid: false }, 200, h); }
      return json({ valid: true }, 200, h);
    }

    if (action === "manage_user") {
      const u = body?.user || {};
      const email = typeof u.email === "string" ? u.email.trim().toLowerCase() : "";
      const nome = typeof u.nome === "string" ? u.nome.trim() : "";
      const senha = typeof u.senha === "string" ? u.senha.trim() : "";
      if (!email || !nome) return json({ ok: false, message: "Nome e e-mail obrigatórios." }, 400, h);
      if (senha && !/^\d{8}$/.test(senha)) return json({ ok: false, message: "Senha deve ter 8 números." }, 400, h);
      const isAdmin = caller.role === "ADMIN";
      const isSelf = email === callerEmail && (!u.id || u.id === caller.id);
      if (!isAdmin && !isSelf) return json({ ok: false, message: "Permissão negada." }, 403, h);

      const roles = new Set(["ADMIN", "GERENTE", "ATENDIMENTO", "CONFEITEIRO"]);
      const payload = isAdmin ? {
        email, nome: nome.slice(0, 100), avatar_url: u.avatarUrl || null,
        role: roles.has(u.role) ? u.role : "ATENDIMENTO",
        unidade_padrao_id: UUID_RE.test(u.unidadePadraoId || "") ? u.unidadePadraoId : null,
        ativo: u.ativo !== false,
        unidades_permitidas: Array.isArray(u.unidadesPermitidas) ? u.unidadesPermitidas : [],
      } : { email: caller.email, nome: nome.slice(0, 100), avatar_url: u.avatarUrl || null };

      const { data: saved, error: sErr } = await admin
        .from("usuarios_perfis").upsert(payload, { onConflict: "email" })
        .select("id, email, nome, avatar_url, role, unidade_padrao_id, ativo, unidades_permitidas").single();
      if (sErr || !saved) return json({ ok: false, message: "Falha ao salvar usuário." }, 400, h);

      const { data: existingAuthId } = await admin.rpc("internal_get_operator_auth_user_id", { p_usuario_id: saved.id });
      if (senha) {
        const authId = await syncAuthUser(admin, {
          usuarioId: saved.id, authUserId: (existingAuthId as string | null) || null,
          email: saved.email, nome: saved.nome, role: saved.role, password: senha, ativo: saved.ativo !== false,
        });
        await admin.rpc("internal_upsert_operator_credential", { p_usuario_id: saved.id, p_pin: senha, p_auth_user_id: authId });
      } else if (existingAuthId && isAdmin) {
        await syncAuthUser(admin, {
          usuarioId: saved.id, authUserId: existingAuthId as string,
          email: saved.email, nome: saved.nome, role: saved.role, ativo: saved.ativo !== false,
        });
      }
      return json({ ok: true, user: saved }, 200, h);
    }

    if (action === "toggle_active") {
      if (caller.role !== "ADMIN") return json({ ok: false, message: "Apenas ADMIN." }, 403, h);
      const userId = typeof body?.userId === "string" ? body.userId : "";
      const ativo = Boolean(body?.ativo);
      if (!UUID_RE.test(userId)) return json({ ok: false, message: "ID inválido." }, 400, h);
      const { error: uErr2 } = await admin.from("usuarios_perfis").update({ ativo }).eq("id", userId);
      if (uErr2) return json({ ok: false, message: "Falha ao atualizar status." }, 400, h);
      const { data: authId } = await admin.rpc("internal_get_operator_auth_user_id", { p_usuario_id: userId });
      if (authId) {
        await admin.auth.admin.updateUserById(authId as string, { ban_duration: ativo ? "none" : "876000h" });
        if (!ativo) await admin.auth.admin.signOut(authId as string).catch(() => {});
      }
      return json({ ok: true }, 200, h);
    }

    return json({ ok: false, message: "Ação inválida." }, 400, h);
  } catch (err) {
    console.error("operator-auth error:", err);
    return json({ ok: false, message: "Erro interno de autenticação." }, 500, h);
  }
});