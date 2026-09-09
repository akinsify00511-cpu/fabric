-- Production security surface follow-up.
-- Keep internal/platform operational SECURITY DEFINER RPCs out of the public API role surface.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (
        p.proname IN (
          '_governance_guard',
          'emit_payment_received',
          'evaluate_platform_alerts',
          'log_governance_event',
          'log_platform_error',
          'page_platform_oncall',
          'queue_payment_lifecycle_email',
          'trigger_webhook',
          'update_subscription_from_webhook',
          'platform_ops',
          'riverways_platform_analytics',
          'riverways_payment_investigation'
        )
        OR p.proname LIKE 'platform_admin_%'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', r.fn);
  END LOOP;
END $$;
