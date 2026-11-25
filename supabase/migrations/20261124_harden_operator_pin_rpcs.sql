-- Revoke unthrottled anonymous/public execution on legacy operator PIN RPCs.
-- Login and PIN verification are served by the rate-limited `operator-auth` Edge Function.
REVOKE EXECUTE ON FUNCTION public.autenticar_operador(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autenticar_operador(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.verificar_pin_operador(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_pin_operador(text, text) TO authenticated, service_role;

-- Harden verificar_pin_operador so it ONLY checks the authenticated JWT email
-- and never trusts a caller-supplied p_email argument.
CREATE OR REPLACE FUNCTION public.verificar_pin_operador(p_email text, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_email TEXT;
BEGIN
  v_email := lower(btrim(COALESCE((SELECT auth.jwt() ->> 'email'), '')));
  IF v_email = '' OR COALESCE(p_pin, '') !~ '^\d{8}$' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.usuarios_perfis up
    JOIN private.operador_credenciais oc ON oc.usuario_id = up.id
    WHERE lower(up.email) = v_email
      AND up.ativo = true
      AND oc.senha_hash = extensions.crypt(p_pin, oc.senha_hash)
  );
END;
$function$;
