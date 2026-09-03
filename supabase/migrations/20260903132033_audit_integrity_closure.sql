-- Close the direct-write path to audit evidence. Audit records must be append-only
-- and created by trusted SECURITY DEFINER functions/triggers, not client DML.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public','audit_logs'),
      ('public','financial_audit_events'),
      ('public','governance_audit_log'),
      ('public','platform_admin_audit_logs'),
      ('public','sso_audit_log'),
      ('public','webauthn_audit_log'),
      ('public','deal_stage_suggestion_audit'),
      ('public','self_audit_findings')
    ) AS x(schema_name, table_name)
  LOOP
    IF to_regclass(format('%I.%I', r.schema_name, r.table_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM PUBLIC, anon, authenticated', r.schema_name, r.table_name);
    END IF;
  END LOOP;
END $$;

DO $$ BEGIN IF to_regclass('public.financial_audit_events') IS NOT NULL THEN REVOKE SELECT ON TABLE public.financial_audit_events FROM anon; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.platform_admin_audit_logs') IS NOT NULL THEN REVOKE SELECT ON TABLE public.platform_admin_audit_logs FROM anon; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.sso_audit_log') IS NOT NULL THEN REVOKE SELECT ON TABLE public.sso_audit_log FROM anon; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.webauthn_audit_log') IS NOT NULL THEN REVOKE SELECT ON TABLE public.webauthn_audit_log FROM anon; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.self_audit_findings') IS NOT NULL THEN REVOKE SELECT ON TABLE public.self_audit_findings FROM anon; END IF; END $$;

ALTER TABLE IF EXISTS public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.governance_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_admin_audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sso_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webauthn_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deal_stage_suggestion_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.self_audit_findings FORCE ROW LEVEL SECURITY;

DO $$ BEGIN IF to_regclass('public.audit_logs') IS NOT NULL THEN COMMENT ON TABLE public.audit_logs IS 'Append-only audit evidence; client INSERT/UPDATE/DELETE is revoked. Use trusted audit functions/triggers.'; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.financial_audit_events') IS NOT NULL THEN COMMENT ON TABLE public.financial_audit_events IS 'Append-only financial audit evidence; client mutation is revoked.'; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.governance_audit_log') IS NOT NULL THEN COMMENT ON TABLE public.governance_audit_log IS 'Append-only governance audit evidence; client mutation is revoked.'; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.platform_admin_audit_logs') IS NOT NULL THEN COMMENT ON TABLE public.platform_admin_audit_logs IS 'Append-only platform-admin audit evidence; client mutation is revoked.'; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.sso_audit_log') IS NOT NULL THEN COMMENT ON TABLE public.sso_audit_log IS 'Append-only SSO audit evidence; client mutation is revoked.'; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.webauthn_audit_log') IS NOT NULL THEN COMMENT ON TABLE public.webauthn_audit_log IS 'Append-only WebAuthn audit evidence; client mutation is revoked.'; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.deal_stage_suggestion_audit') IS NOT NULL THEN COMMENT ON TABLE public.deal_stage_suggestion_audit IS 'Append-only deal-stage audit evidence; client mutation is revoked.'; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.self_audit_findings') IS NOT NULL THEN COMMENT ON TABLE public.self_audit_findings IS 'Append-only self-audit evidence; client mutation is revoked.'; END IF; END $$;
