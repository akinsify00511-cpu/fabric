-- 056_trigger_based_audit_logging.sql
-- Move audit logging from manual client instrumentation to database triggers
-- so changes to sensitive tables are captured even when the app forgets to
-- log, an RPC edits a row, or a background job mutates data (§11.4 item 11,
-- Architecture "trigger-based audit logging — manual instrumentation will
-- always have gaps").
--
-- Approach: a single reusable SECURITY DEFINER function logs the INSERT /
-- UPDATE / DELETE that just happened into audit_logs, capturing old/new
-- row JSON and the changed field list. Per-table triggers call it. This
-- complements (does not replace) the existing auditLogger client — client
-- logging covers actions with no row (login/logout/export) while triggers
-- guarantee row-level change capture.

-- Ensure audit_logs exists (created in 038_critical_infrastructure).
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reusable change-capture trigger. Derives the actor from the session
-- (current_setting('request.jwt.claims')) so audit rows record who did it
-- even when the change came through an RPC or service role.
CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS TRIGGER AS $$
DECLARE
  v_business_id UUID;
  v_user_id UUID;
  v_entity_id UUID;
  v_old JSONB;
  v_new JSONB;
  v_changed TEXT[];
  v_action TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_entity_id := (OLD).id;
    v_business_id := COALESCE((v_old ->> 'business_id')::UUID, NULL);
    v_action := 'delete';
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_entity_id := (NEW).id;
    v_business_id := COALESCE((v_new ->> 'business_id')::UUID, (v_old ->> 'business_id')::UUID);
    v_action := 'update';
    -- Field-level diff so reviewers can see exactly what changed.
    SELECT array_agg(key) INTO v_changed
    FROM jsonb_object_keys(v_new) AS key
    WHERE v_new -> key IS DISTINCT FROM v_old -> key;
  ELSE -- INSERT
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_entity_id := (NEW).id;
    v_business_id := COALESCE((v_new ->> 'business_id')::UUID, NULL);
    v_action := 'create';
  END IF;

  -- Best-effort actor resolution from the JWT claim PostgREST sets.
  BEGIN
    v_user_id := NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  INSERT INTO audit_logs
    (business_id, user_id, action, entity_type, entity_id,
     old_values, new_values, changed_fields, metadata)
  VALUES
    (v_business_id, v_user_id, v_action, TG_ARGV[0], v_entity_id,
     v_old, v_new, v_changed,
     jsonb_build_object('table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA));

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach triggers to the most sensitive tables. Triggers are AFTER so the
-- log only records committed changes; no row is audited for a rolled-back
-- transaction.
CREATE OR REPLACE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('invoice');

CREATE OR REPLACE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('payment');

CREATE OR REPLACE TRIGGER audit_journal_entries AFTER INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('journal_entry');

CREATE OR REPLACE TRIGGER audit_staff AFTER INSERT OR UPDATE OR DELETE ON staff
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('staff');

CREATE OR REPLACE TRIGGER audit_payroll_runs AFTER INSERT OR UPDATE OR DELETE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('payroll_run');

CREATE OR REPLACE TRIGGER audit_approvals AFTER INSERT OR UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('approval');

DO $$ BEGIN
  CREATE OR REPLACE TRIGGER audit_property_commissions AFTER INSERT OR UPDATE OR DELETE ON property_commissions
    FOR EACH ROW EXECUTE FUNCTION audit_row_change('property_commission');
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'property_commissions not found, skipping trigger'; END $$;

CREATE OR REPLACE TRIGGER audit_signature_requests AFTER INSERT OR UPDATE OR DELETE ON signature_requests
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('signature_request');

CREATE OR REPLACE TRIGGER audit_business_subscriptions AFTER INSERT OR UPDATE OR DELETE ON business_subscriptions
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('business_subscription');

COMMENT ON FUNCTION audit_row_change() IS
  'Reusable change-capture trigger writing to audit_logs (§11.4 item 11). Per-table triggers pass the entity_type label.';
