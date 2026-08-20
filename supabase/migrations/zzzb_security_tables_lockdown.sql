-- Supabase Security Advisor flagged public.auth_rate_limits as RLS-disabled.
-- zzz_auth_protocol_repair already ENABLEs RLS on it, but 998's blanket
-- GRANT SELECT/INSERT/UPDATE/DELETE ON ALL TABLES TO authenticated leaves the
-- table directly readable/writable if RLS is ever off. This migration closes
-- both layers explicitly and idempotently.

-- The only legitimate access is through the SECURITY DEFINER functions
-- (check_auth_rate_limit, record_auth_failure, reset_auth_rate_limit,
-- log_security_event), which execute as the postgres owner and bypass RLS.
-- An empty policy set therefore means clients are denied.

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.auth_rate_limits FROM anon, authenticated;
REVOKE ALL ON public.security_audit_log FROM anon, authenticated;

-- EXECUTE grants on the four RPCs (set in zzz_auth_protocol_repair) remain,
-- so the pre-auth login rate-limit protocol keeps working.
