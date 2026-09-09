-- Production security hardening.
-- 1) Pin SECURITY DEFINER function search_path to trusted schemas + pg_temp.
-- 2) Remove anonymous EXECUTE from non-public helper/metadata RPCs.
-- Intentionally public token/session, profile, SSO, auth-rate-limit and signing endpoints remain callable by anon.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, extensions, auth, storage, pg_temp',
      r.signature
    );
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_level(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_mime_category(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_plan_features(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.plan_price_cents(text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_feature_flag(text,uuid,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_plan_tier(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_custom_domain(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text,uuid,text,text,text,uuid,jsonb,boolean) FROM anon;

-- The following remain intentionally anonymous: portal/token flows, public profile,
-- SSO discovery, auth-rate limiting, and signature/token flows.
