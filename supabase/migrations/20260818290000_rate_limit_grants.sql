-- Grant the pre-auth rate-limiting + security-audit functions to anon so they
-- can be called BEFORE a session exists (login/signup flows). Least-privilege:
-- only these two functions, not the blanket. Idempotent.

GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, UUID, TEXT, TEXT, TEXT, UUID, JSONB, BOOLEAN) TO anon;
