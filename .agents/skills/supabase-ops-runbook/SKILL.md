---
name: supabase-ops-runbook
description: >-
  Operational runbook for JuJu Delivery Supabase deployments, migrations, Edge
  Function publishing on Docker-less Windows, clipboard helpers, and safe RLS
  lockdown ordering. Use when applying migrations, deploying Supabase Edge
  Functions, or auditing production auth and RLS policies.
---

# Supabase Operations Runbook (JuJu Delivery)

Project Reference: `zfqpqhutklhvwoulflwc`

## 1. Migrations & Destructive SQL via MCP vs. Dashboard

- **Additive DDL only via MCP (`apply_migration`)**: Statements containing `DROP`, `DELETE`, or `TRUNCATE` trigger an MCP elicitation prompt that auto-cancels in ~0.2s in this client.
- **Destructive / RLS Lockdown Scripts**: Write the SQL to a versioned file under `supabase/migrations/`, copy it cleanly to the Windows clipboard from disk, and guide the user to run it in the Supabase SQL Editor:
  ```powershell
  Get-Content -Raw -Encoding UTF8 "supabase/migrations/<file>.sql" | Set-Clipboard
  ```
  Dashboard SQL Editor: `https://supabase.com/dashboard/project/zfqpqhutklhvwoulflwc/sql/new`

## 2. Deploying Edge Functions (Docker-less Windows & MCP Workaround)

- **Do NOT use MCP `deploy_edge_function`**: `call_mcp_tool` serializes objects nested inside `files` arrays as `null` (`ZodError`).
- **Avoid chat copy-paste truncation**: Pasting large files (>6 KB) from chat/markdown blocks risks mid-file truncation (`Unexpected eof`). Always load directly from disk via PowerShell:
  ```powershell
  Get-Content -Raw -Encoding UTF8 "supabase/functions/<slug>/index.ts" | Set-Clipboard
  ```
  - **Method A (Supabase Dashboard Editor — No CLI / No Docker)**:
    1. Open `https://supabase.com/dashboard/project/zfqpqhutklhvwoulflwc/functions` (or `/functions/<slug>/code`).
    2. Keep the single `index.ts` tab, click inside the code area, press `Ctrl+A` → `Delete` → `Ctrl+V`, verify the last line ends cleanly (`});`), set the function name, and deploy.
    3. Open `/functions/<slug>/details` and set **Verify JWT with legacy secret / Enforce JWT Verification**:
       - `operator-auth`: **OFF** (`verify_jwt: false`, because `action: "login"` runs pre-JWT; other actions verify the JWT inside the function).
       - `parse-whatsapp-order`: **ON** (`verify_jwt: true`).
  - **Method B (Supabase CLI without Docker)**: If authenticated via `npx supabase login`, pass `--use-api` to bundle remotely without local Docker:
    ```powershell
    npx supabase functions deploy operator-auth --project-ref zfqpqhutklhvwoulflwc --no-verify-jwt --use-api
    npx supabase functions deploy parse-whatsapp-order --project-ref zfqpqhutklhvwoulflwc --use-api
    ```
- **Live Verification**: Always run MCP `list_edge_functions` afterward and verify `status: "ACTIVE"` and exact `verify_jwt` flags.

## 3. Safe Production Lockdown Sequence (A → B → C)

Never apply strict `authenticated`-only RLS lockdown before operators can receive Supabase Auth JWTs:
1. **Passo A — Deploy Edge Functions**: Confirm `operator-auth` (`verify_jwt: false`) and `parse-whatsapp-order` (`verify_jwt: true`) are `ACTIVE`.
2. **Passo B — Verify Live JWT Login**: Sign in on production (`https://juju-delivery-app.netlify.app`), confirm **"Sessão BD Ativa"** in the profile modal, and verify `auth.users` + `private.operador_credenciais.auth_user_id` linkage via `execute_sql`.
3. **Passo C — Execute Final RLS Lockdown SQL**: Run the migration dropping legacy permissive policies and plaintext columns only after Passos A & B succeed, then audit `pg_policies`, `get_advisors(type: "security")`, and `information_schema.columns`.
4. **RLS on `private.operador_credenciais`**: Keep `ENABLE ROW LEVEL SECURITY` enabled on `private.operador_credenciais` **with no policies** for `anon` or `authenticated` (blocking direct access while `SECURITY DEFINER` functions owned by `postgres` and `service_role` continue bypassing RLS). This prevents `rls_disabled` alerts in Supabase Security Advisor (`rls_enabled_no_policy` at `INFO` level is expected).

## 4. Syncing Postgres `CHECK` Constraints Before Adding Frontend Status/Enum Values

Before introducing or renaming any status/enum literal in `src/types.ts` (such as adding `'CANCELADA'` to `ProductionStatus`), always verify the live database constraint first:
1. Inspect existing `CHECK` constraints via MCP `execute_sql`:
   ```sql
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'public.<table_name>'::regclass AND contype = 'c';
   ```
2. Apply an explicit migration (`apply_migration` or Dashboard SQL Editor if MCP auto-cancels) updating the constraint to allow the new value, and re-run the `pg_constraint` query to confirm.
3. Keep `supabase/schema.sql` synchronized with the live constraint definition before modifying frontend screens.
