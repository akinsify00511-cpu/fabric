-- 096_trust_dr_audit_extension.sql
--
-- §50-51 Trust & Disaster Recovery. The trigger-based audit logger (056)
-- audits 9 sensitive financial/HR tables but NONE of the intelligence/
-- decision tables added in 088-095. For trust, decision-relevant mutations
-- MUST be auditable: a recommendation being accepted/rejected, a risk being
-- closed, an OKR key result being updated, a metric target being changed
-- (governance). Without these, the outcome loop (§15) has no tamper-evident
-- trail — a user could silently change a target to make a score look better.
--
-- This migration:
--   1. Extends audit_row_change() triggers to: claims, business_risks,
--      key_results, kpi_metrics (target/actual governance writes).
--   2. Adds trust_health(business_id) — an honest audit-trail health check:
--      latest audit log, coverage (which audited tables have recent activity),
--      and gap detection (tables with writes but no audit rows = trigger may
--      be broken). Returns FACT-level evidence only (§9).
--
-- §22: no external dependency. §15-19: tenant isolation. Idempotent.

\set ON_ERROR_STOP on

-- ============================================================
-- 1. Extend audit triggers to intelligence/decision tables.
--    audit_row_change() is defined in 056; idempotent CREATE TRIGGER.
-- ============================================================
DROP TRIGGER IF EXISTS audit_claims ON claims;
CREATE TRIGGER audit_claims AFTER INSERT OR UPDATE OR DELETE ON claims
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('claim');

DROP TRIGGER IF EXISTS audit_business_risks ON business_risks;
CREATE TRIGGER audit_business_risks AFTER INSERT OR UPDATE OR DELETE ON business_risks
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('business_risk');

DROP TRIGGER IF EXISTS audit_key_results ON key_results;
CREATE TRIGGER audit_key_results AFTER INSERT OR UPDATE OR DELETE ON key_results
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('key_result');

DROP TRIGGER IF EXISTS audit_kpi_metrics ON kpi_metrics;
CREATE TRIGGER audit_kpi_metrics AFTER INSERT OR UPDATE OR DELETE ON kpi_metrics
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('kpi_metric');

-- ============================================================
-- 2. trust_health(business_id) — audit-trail integrity + DR posture.
--    Honest: returns real counts + timestamps. Does NOT fabricate a "backup
--    status" it cannot verify (Supabase manages backups); instead reports
--    what the app CAN verify — is the audit trail receiving entries, and is
--    every audited table's activity being captured.
-- ============================================================
CREATE OR REPLACE FUNCTION trust_health(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_latest TIMESTAMPTZ;
  v_total_24h INTEGER;
  v_total_30d INTEGER;
  v_coverage JSONB;
  v_tables TEXT[] := ARRAY[
    'invoices','payments','journal_entries','staff','payroll_runs',
    'approvals','property_commissions','signature_requests','business_subscriptions',
    'claims','business_risks','key_results','kpi_metrics'
  ];
  v_t TEXT;
  v_recent_writes INTEGER;
  v_audit_rows INTEGER;
  v_gaps TEXT[] := '{}';
  v_covered TEXT[] := '{}';
BEGIN
  -- Latest audit entry + volumes.
  SELECT max(created_at), count(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),
         count(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')
  INTO v_latest, v_total_24h, v_total_30d
  FROM audit_logs WHERE business_id = p_business_id;

  -- Per-table coverage: does the table have recent writes AND are those
  -- reflected in audit_logs? A table with writes but zero audit rows = the
  -- trigger may be broken (a trust gap). This is the integrity signal.
  FOREACH v_t IN ARRAY v_tables LOOP
    BEGIN
      EXECUTE format(
        'SELECT count(*) FROM %I WHERE business_id = $1 AND created_at > NOW() - INTERVAL ''7 days''',
        v_t
      ) INTO v_recent_writes USING p_business_id;

      SELECT count(*) INTO v_audit_rows FROM audit_logs
      WHERE business_id = p_business_id
        AND entity_type = v_t
        AND created_at > NOW() - INTERVAL '7 days';

      IF v_recent_writes > 0 THEN
        IF v_audit_rows = 0 THEN
          v_gaps := array_append(v_gaps, v_t);
        ELSE
          v_covered := array_append(v_covered, v_t);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Table may not exist on this DB (migration not applied) — skip.
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'latest_audit_at', v_latest,
    'audit_entries_24h', COALESCE(v_total_24h, 0),
    'audit_entries_30d', COALESCE(v_total_30d, 0),
    'audited_tables_with_recent_activity', v_covered,
    'audit_gaps', v_gaps,                          -- tables with writes but no audit rows
    'audit_healthy', array_length(v_gaps, 1) IS NULL OR array_length(v_gaps, 1) = 0,
    'checked_at', NOW()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION trust_health(UUID) TO authenticated;

COMMENT ON FUNCTION trust_health IS
  '§50-51 trust/audit health: latest audit entry, volumes, per-table coverage, and gap detection (tables with writes but no audit rows = trigger may be broken). Honest FACT-level evidence; does not fabricate backup status.';
