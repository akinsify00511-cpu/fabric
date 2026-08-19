-- Grant the pre-auth rate-limiting + security-audit functions to anon so they
-- can be called BEFORE a session exists (login/signup flows). Least-privilege:
-- only these two functions, not the blanket. Idempotent.

-- Migration ordering note: this file (2026...) applies before
-- 999_security_fixes.sql in lexical sort order, so the target functions may
-- not exist yet. Guard each grant on the function's existence.
DO $$
BEGIN
  IF to_regprocedure('public.check_auth_rate_limit(text,text,integer,integer,integer)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO anon';
  END IF;
  IF to_regprocedure('public.log_security_event(text,uuid,text,text,text,uuid,jsonb,boolean)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, UUID, TEXT, TEXT, TEXT, UUID, JSONB, BOOLEAN) TO anon';
  END IF;
END $$;
