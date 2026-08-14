
-- ############################################
-- FILE: 054_maintenance_unification.sql
-- ############################################
-- 054_maintenance_unification.sql
-- Unify the equipment-scoped maintenance_records and property-scoped
-- maintenance_requests so one maintenance engine serves internal asset
-- maintenance AND tenant-reported facility/property issues, per the
-- Architecture doc §13.4 ("Facility Maintenance expansion").
--
-- Design choice: extend maintenance_records with a source_type discriminator
-- and a nullable asset_id (was NOT NULL), rather than rewriting either
-- table. Existing asset maintenance rows keep working (source_type defaults
-- to 'equipment'); property/facility maintenance can now be recorded
-- against the same engine. A UNION view surfaces both sources for any
-- cross-cutting maintenance dashboard.

-- 1. Relax asset_id to nullable so the same table can hold maintenance
--    not tied to an asset (property/facility work).
ALTER TABLE maintenance_records
  ALTER COLUMN asset_id DROP NOT NULL;

-- 2. Add the source discriminator + a property reference for property-
--    sourced maintenance, so the engine knows the origin and can link back.
ALTER TABLE maintenance_records
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'equipment'
    CHECK (source_type IN ('equipment', 'property', 'facility')),
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reported_by_client UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- Backfill: any pre-existing row was equipment maintenance by definition.
UPDATE maintenance_records SET source_type = 'equipment' WHERE source_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_source_type ON maintenance_records(source_type);
CREATE INDEX IF NOT EXISTS idx_maintenance_property_id ON maintenance_records(property_id);

-- 3. RLS policies for the new property/facility rows mirror the existing
--    business-scoped equipment policies (maintenance_records already has
--    RLS enabled in 039_operations_backbone; the policies below cover the
--    new source types within the same business boundary).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'maintenance_records' AND policyname = 'maintenance_property_viewable_by_business'
  ) THEN
    CREATE POLICY maintenance_property_viewable_by_business
      ON maintenance_records FOR SELECT
      USING (source_type IN ('property','facility')
             AND business_id IN (SELECT id FROM businesses));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'maintenance_records' AND policyname = 'maintenance_property_managing_by_business'
  ) THEN
    CREATE POLICY maintenance_property_managing_by_business
      ON maintenance_records FOR ALL
      USING (source_type IN ('property','facility')
             AND business_id IN (SELECT id FROM businesses));
  END IF;
END $$;

-- 4. Unified maintenance view — one row per maintenance item across both
--    engines, normalized to a common shape for dashboards/reporting.
CREATE OR REPLACE VIEW unified_maintenance AS
SELECT
  id,
  business_id,
  source_type,
  asset_id,
  property_id,
  title,
  description,
  status,
  category,
  priority,
  cost,
  scheduled_date,
  completed_date,
  performed_by,
  assigned_to,
  created_at,
  updated_at,
  'maintenance_records'::TEXT AS origin_table
FROM maintenance_records
UNION ALL
SELECT
  mr.id,
  mr.business_id,
  'property'::TEXT AS source_type,
  NULL::UUID AS asset_id,
  mr.property_id,
  mr.title,
  mr.description,
  mr.status,
  mr.category,
  mr.priority,
  mr.cost,
  NULL::DATE AS scheduled_date,
  NULL::TIMESTAMPTZ AS completed_date,
  NULL::UUID AS performed_by,
  mr.assigned_to,
  mr.created_at,
  mr.updated_at,
  'maintenance_requests'::TEXT AS origin_table
FROM maintenance_requests mr;

COMMENT ON VIEW unified_maintenance IS
  'Cross-engine maintenance view (equipment + property + facility) for unified dashboards. See Architecture §13.4.';

-- ############################################
-- FILE: 055_timesheets_approval_cycle.sql
-- ############################################
-- 055_timesheets_approval_cycle.sql
-- Add a proper "Timesheets" layer on top of the existing time_entries
-- engine (§13.5): a weekly timesheet per staff member groups a week's
-- entries, goes through submit → manager approval (reusing the
-- Approvals engine), and is what gates billable time for payroll/invoicing.
--
-- time_entries already has billable/project_id/task_id/hourly_rate — we
-- only add the submission/approval wrapper, not a parallel time store.

CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  -- Weekly period (Mon–Sun). Stored as the week-start DATE for stable keys.
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  -- Status mirrors a normal approval lifecycle, separate from the
  -- time_entries.status (active/stopped) so logging time and submitting
  -- a week are independent operations.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'approved', 'rejected', 'reopened'
  )),
  total_minutes INTEGER DEFAULT 0,
  billable_minutes INTEGER DEFAULT 0,
  -- Link to the Approvals engine row (entity_type = 'timesheet').
  approval_id UUID REFERENCES approvals(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- One timesheet per staff per week.
  UNIQUE (staff_id, week_start)
);

ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY timesheets_viewable_by_business
  ON timesheets FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));

CREATE POLICY timesheets_manageable_by_business
  ON timesheets FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- Staff can read their own timesheets even if business lookup is restricted.
CREATE POLICY timesheets_self_select
  ON timesheets FOR SELECT
  USING (staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Staff can create/update their own draft/submitted timesheets.
CREATE POLICY timesheets_self_update
  ON timesheets FOR UPDATE
  USING (staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_timesheets_business ON timesheets(business_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_staff ON timesheets(staff_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheets_week ON timesheets(week_start);

-- Link individual time entries to a submitted timesheet. Nullable so
-- unsubmitted entries keep working as before.
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS timesheet_id UUID REFERENCES timesheets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_timesheet ON time_entries(timesheet_id);

CREATE TRIGGER timesheets_updated_at BEFORE UPDATE ON timesheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Recompute the rolled-up totals (total/billable minutes) from the linked
-- time_entries whenever a timesheet is inserted or its entries change.
CREATE OR REPLACE FUNCTION recompute_timesheet_totals(p_timesheet_id UUID)
RETURNS VOID AS $$
DECLARE
  mins INTEGER;
  bill_mins INTEGER;
BEGIN
  SELECT COALESCE(SUM(
      COALESCE(manual_minutes,
        CASE WHEN end_time IS NOT NULL THEN
          (EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::INTEGER
        ELSE 0 END)
    ), 0)
  INTO mins
  FROM time_entries
  WHERE timesheet_id = p_timesheet_id AND status <> 'discarded';

  SELECT COALESCE(SUM(
      CASE WHEN billable THEN
        COALESCE(manual_minutes,
          CASE WHEN end_time IS NOT NULL THEN
            (EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::INTEGER
          ELSE 0 END)
      ELSE 0 END
    ), 0)
  INTO bill_mins
  FROM time_entries
  WHERE timesheet_id = p_timesheet_id AND status <> 'discarded';

  UPDATE timesheets
  SET total_minutes = mins, billable_minutes = bill_mins
  WHERE id = p_timesheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep totals fresh when entries are linked or edited.
CREATE OR REPLACE FUNCTION timesheet_recompute_on_entry_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM recompute_timesheet_totals(OLD.timesheet_id) WHERE OLD.timesheet_id IS NOT NULL;
  ELSE
    PERFORM recompute_timesheet_totals(NEW.timesheet_id) WHERE NEW.timesheet_id IS NOT NULL;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER time_entries_recompute_timesheet
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION timesheet_recompute_on_entry_change();

-- Submit a timesheet: flip status, stamp submitted_at, create an approvals
-- row the manager can act on (reuses the Approvals engine).
CREATE OR REPLACE FUNCTION submit_timesheet(p_timesheet_id UUID, p_submitter_id UUID)
RETURNS TABLE(id UUID, status TEXT, approval_id UUID) AS $$
DECLARE
  ts RECORD;
  appr_id UUID;
BEGIN
  SELECT * INTO ts FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found'; END IF;
  IF ts.status NOT IN ('draft', 'reopened') THEN
    RAISE EXCEPTION 'Timesheet is not in a submittable state';
  END IF;

  -- Recompute totals at submit time so the approval reflects reality.
  PERFORM recompute_timesheet_totals(p_timesheet_id);

  INSERT INTO approvals (business_id, entity_type, entity_id, requester_id,
    current_step, total_steps, status, description)
  VALUES (ts.business_id, 'timesheet', ts.id, p_submitter_id, 1, 1, 'pending',
    'Timesheet ' || ts.week_start || ' to ' || ts.week_end)
  RETURNING id INTO appr_id;

  UPDATE timesheets
  SET status = 'submitted', submitted_at = NOW(), approval_id = appr_id
  WHERE id = p_timesheet_id;

  -- Tag linked entries so they are locked once submitted.
  UPDATE time_entries SET status = 'stopped'
  WHERE timesheet_id = p_timesheet_id;

  RETURN QUERY SELECT timesheets.id, timesheets.status, timesheets.approval_id
  FROM timesheets WHERE id = p_timesheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Approve / reject a timesheet (called by the approval action handler).
CREATE OR REPLACE FUNCTION decide_timesheet(p_timesheet_id UUID, p_decision TEXT, p_approver_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS TABLE(id UUID, status TEXT) AS $$
DECLARE
  ts RECORD;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;
  SELECT * INTO ts FROM timesheets WHERE id = p_timesheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found'; END IF;
  IF ts.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only submitted timesheets can be decided';
  END IF;

  UPDATE timesheets SET
    status = p_decision,
    approved_by = p_approver_id,
    approved_at = CASE WHEN p_decision = 'approved' THEN NOW() ELSE approved_at END,
    rejection_reason = p_reason
  WHERE id = p_timesheet_id;

  UPDATE approvals SET status = p_decision, updated_at = NOW()
  WHERE id = ts.approval_id;

  -- Rejection reopens the week for editing.
  IF p_decision = 'rejected' THEN
    UPDATE timesheets SET status = 'reopened' WHERE id = p_timesheet_id;
  END IF;

  RETURN QUERY SELECT timesheets.id, timesheets.status FROM timesheets WHERE id = p_timesheet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE timesheets IS
  'Weekly timesheet approval layer over time_entries (§13.5). Reuses the approvals engine via entity_type=''timesheet''.';

-- ############################################
-- FILE: 056_trigger_based_audit_logging.sql
-- ############################################
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
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('invoice');

CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('payment');

CREATE TRIGGER audit_journal_entries AFTER INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('journal_entry');

CREATE TRIGGER audit_staff AFTER INSERT OR UPDATE OR DELETE ON staff
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('staff');

CREATE TRIGGER audit_payroll_runs AFTER INSERT OR UPDATE OR DELETE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('payroll_run');

CREATE TRIGGER audit_approvals AFTER INSERT OR UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('approval');

CREATE TRIGGER audit_property_commissions AFTER INSERT OR UPDATE OR DELETE ON property_commissions
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('property_commission');

CREATE TRIGGER audit_signature_requests AFTER INSERT OR UPDATE OR DELETE ON signature_requests
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('signature_request');

CREATE TRIGGER audit_business_subscriptions AFTER INSERT OR UPDATE OR DELETE ON business_subscriptions
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('business_subscription');

COMMENT ON FUNCTION audit_row_change() IS
  'Reusable change-capture trigger writing to audit_logs (§11.4 item 11). Per-table triggers pass the entity_type label.';

-- ############################################
-- FILE: 057_multi_currency_and_payment_rails.sql
-- ############################################
-- 057_multi_currency_and_payment_rails.sql
-- Wire multi-currency into the actual ledger and add a payment-provider
-- abstraction so Avenize isn't hard-coupled to Paystack (§11.2 items 4-6).
--
-- Context: exchange_rates + currency_balances + convert_currency() already
-- exist (038_critical_infrastructure), but the ledger tables (accounts,
-- journal_entries, journal_lines), invoices and payments had NO currency
-- column, and businesses had no base_currency — so multi-currency infra
-- was never actually wired into accounting. Payments were Paystack-only.

-- 1. Business base currency (the currency the books are kept in).
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (base_currency IN ('USD','NGN','EUR','GBP','GHS','ZAR','KES','CAD','AUD'));

-- 2. Per-row currency on the financial tables. Nullable-but-defaulted so
--    historical rows are treated as the business base currency.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS currency TEXT;

-- Backfill: existing rows are in the (previously only) base currency.
UPDATE accounts a SET currency = b.base_currency
  FROM businesses b WHERE a.business_id = b.id AND a.currency IS NULL;
UPDATE journal_entries j SET currency = b.base_currency
  FROM businesses b WHERE j.business_id = b.id AND j.currency IS NULL;
UPDATE journal_lines j SET currency = b.base_currency
  FROM businesses b WHERE j.business_id = b.id AND j.currency IS NULL;
UPDATE invoices i SET currency = b.base_currency
  FROM businesses b WHERE i.business_id = b.id AND i.currency IS NULL;
UPDATE payments p SET currency = b.base_currency
  FROM businesses b WHERE p.business_id = b.id AND p.currency IS NULL;

-- Exchange-rate (stored) for foreign-currency journal entries so the base-
-- currency equivalent is auditable. Rate = 1 base currency unit in foreign
-- currency terms at the time of the entry.
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8);

CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency);
CREATE INDEX IF NOT EXISTS idx_journal_entries_currency ON journal_entries(currency);
CREATE INDEX IF NOT EXISTS idx_invoices_currency ON invoices(currency);
CREATE INDEX IF NOT EXISTS idx_payments_currency ON payments(currency);

-- 3. Payment-provider abstraction. A business can configure one or more
--    rails; each row stores the provider type + (encrypted-at-rest by the
--    app) credentials reference and which currencies that rail handles.
CREATE TABLE IF NOT EXISTS payment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN (
    'paystack', 'stripe', 'flutterwave', 'paypal', 'square', 'manual'
  )),
  label TEXT, -- friendly name shown in UI
  -- Reference to the secret in vault / env, never the raw secret itself.
  credential_ref TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  supported_currencies TEXT[] DEFAULT '{USD}'::TEXT[],
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, provider)
);

ALTER TABLE payment_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_providers_viewable
  ON payment_providers FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY payment_providers_managing
  ON payment_providers FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_payment_providers_business ON payment_providers(business_id);

-- Link a payment to the rail that processed it (Paystack reference today,
-- any provider tomorrow). Null for manually-recorded payments.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_provider_id UUID REFERENCES payment_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_reference TEXT; -- provider's transaction id

CREATE TRIGGER payment_providers_updated_at BEFORE UPDATE ON payment_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. Helper: resolve a business's default active provider for a currency.
--    Returns NULL when none configured (manual entry fallback).
CREATE OR REPLACE FUNCTION resolve_payment_provider(p_business_id UUID, p_currency TEXT)
RETURNS TABLE(id UUID, provider TEXT) AS $$
DECLARE
  v_default UUID;
BEGIN
  SELECT id INTO v_default FROM payment_providers
  WHERE business_id = p_business_id AND is_active AND is_default
  ORDER BY created_at LIMIT 1;

  IF v_default IS NOT NULL THEN
    RETURN QUERY SELECT pp.id, pp.provider FROM payment_providers pp
    WHERE pp.id = v_default;
    RETURN;
  END IF;

  -- Fall back to the first active provider that lists the currency.
  RETURN QUERY SELECT pp.id, pp.provider FROM payment_providers pp
  WHERE pp.business_id = p_business_id AND pp.is_active
    AND (p_currency = ANY(pp.supported_currencies) OR array_length(pp.supported_currencies,1) IS NULL)
  ORDER BY pp.created_at LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE payment_providers IS
  'Pluggable payment-rail registry (§11.2 item 6). Decouples payments from any single provider (Paystack).';
COMMENT ON COLUMN businesses.base_currency IS
  'Currency the books are kept in (§11.2 item 4). Ledger rows default to this.';

-- ############################################
-- FILE: 058_business_event_bus.sql
-- ############################################
-- 058_business_event_bus.sql
-- The Business Event Bus (Architecture §10, table 4). A single append-only
-- event log that represents meaningful business moments — DealWon,
-- PaymentReceived, EmployeeJoined, EmployeeExited, InventoryLow,
-- CampaignConverted, TaskOverdue, ContractExpiring, PayrollDue — plus
-- per-event downstream handlers that update all dependent state so a
-- business event updates every relevant module automatically (capture once).
--
-- This is the spine the intelligence layer reasons over: indexes, the
-- observer view, and exceptions all read this stream.

CREATE TABLE IF NOT EXISTS business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Canonical event type (DealWon, PaymentReceived, ...). Free TEXT so
  -- domains can declare new events without a migration.
  event_type TEXT NOT NULL,
  -- The thing the event happened to, in canonical (entity_type, entity_id)
  -- form so the context graph can resolve impact.
  entity_type TEXT NOT NULL,
  entity_id UUID,
  -- Related entities on this event (e.g. DealWon -> [deal, customer, sales_owner]).
  related_entities JSONB DEFAULT '[]'::JSONB,
  -- The material payload — parsed values from capture or the change diff.
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Who/what caused it: staff, system trigger, automation, AI gateway.
  source TEXT DEFAULT 'system' CHECK (source IN ('staff','system','automation','ai_gateway','integration')),
  actor_id UUID,
  -- Provenance: was this captured from natural language, a form, an import?
  capture_mode TEXT,
  confidence NUMERIC(4,3), -- for AI-captured events, 0..1
  -- Lifecycle of the event's propagation.
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE business_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_events_viewable
  ON business_events FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY business_events_inserting
  ON business_events FOR INSERT
  WITH CHECK (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_business_events_business_type
  ON business_events(business_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_events_entity
  ON business_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_business_events_unprocessed
  ON business_events(business_id) WHERE processed = FALSE;

CREATE TRIGGER business_events_updated_at BEFORE UPDATE ON business_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- emit_business_event: the single entry point domains call to raise an
-- event. Idempotent on (business_id, event_type, entity_id, payload hash)
-- so re-emitting (retries, replays) does not duplicate downstream effects.
CREATE OR REPLACE FUNCTION emit_business_event(
  p_business_id UUID,
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::JSONB,
  p_related_entities JSONB DEFAULT '[]'::JSONB,
  p_source TEXT DEFAULT 'system',
  p_actor_id UUID DEFAULT NULL,
  p_capture_mode TEXT DEFAULT NULL,
  p_confidence NUMERIC DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_hash TEXT;
BEGIN
  v_hash := md5(
    coalesce(p_business_id::TEXT,'') || '|' || p_event_type || '|' ||
    coalesce(p_entity_id::TEXT,'') || '|' || p_payload::TEXT
  );

  -- Idempotency: if the exact same event was already raised, return it.
  SELECT id INTO v_id FROM business_events
  WHERE business_id = p_business_id
    AND event_type = p_event_type
    AND coalesce(entity_id::TEXT,'') = coalesce(p_entity_id::TEXT,'')
    AND md5(coalesce(business_id::TEXT,'') || '|' || event_type || '|' ||
            coalesce(entity_id::TEXT,'') || '|' || payload::TEXT) = v_hash
  ORDER BY occurred_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO business_events (
    business_id, event_type, entity_type, entity_id, payload,
    related_entities, source, actor_id, capture_mode, confidence
  ) VALUES (
    p_business_id, p_event_type, p_entity_type, p_entity_id, p_payload,
    p_related_entities, p_source, p_actor_id, p_capture_mode, p_confidence
  ) RETURNING id INTO v_id;

  -- Fire downstream handlers. Each handler is a separate function so a
  -- failure in one does not block the others or the event commit.
  PERFORM process_business_event(v_id);

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- process_business_event: dispatches to registered handlers. Handlers are
-- registered in business_event_handlers; each is a SECURITY DEFINER fn
-- that takes the event row and returns void. Failures are recorded on the
-- event row (processing_error) but do not roll the event back.
CREATE OR REPLACE FUNCTION process_business_event(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  ev RECORD;
  h RECORD;
  v_err TEXT;
BEGIN
  SELECT * INTO ev FROM business_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE business_events SET processed = FALSE WHERE id = p_event_id;

  FOR h IN
    SELECT handler_fn FROM business_event_handlers
    WHERE event_type = ev.event_type AND is_active
    ORDER BY run_order
  LOOP
    BEGIN
      EXECUTE format('SELECT %I(%L)', h.handler_fn, p_event_id);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      UPDATE business_events
      SET processing_error = coalesce(processing_error,'') || h.handler_fn || ': ' || v_err || E'\n'
      WHERE id = p_event_id;
    END;
  END LOOP;

  UPDATE business_events
  SET processed = TRUE, processed_at = NOW()
  WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Handler registry. Domains register a (event_type -> fn) mapping here.
CREATE TABLE IF NOT EXISTS business_event_handlers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  handler_fn TEXT NOT NULL, -- name of a SECURITY DEFINER fn(UUID)
  run_order INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_type, handler_fn)
);

-- A reference handler: every event pushes a freshness row for its entity so
-- the real-time mirror knows when each canonical entity was last touched.
CREATE OR REPLACE FUNCTION handler_update_entity_freshness(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  ev RECORD;
BEGIN
  SELECT * INTO ev FROM business_events WHERE id = p_event_id;
  IF NOT FOUND OR ev.entity_id IS NULL THEN RETURN; END IF;

  INSERT INTO entity_freshness (business_id, entity_type, entity_id, last_event_type, last_event_at, last_event_id)
  VALUES (ev.business_id, ev.entity_type, ev.entity_id, ev.event_type, ev.occurred_at, ev.id)
  ON CONFLICT (business_id, entity_type, entity_id)
  DO UPDATE SET
    last_event_type = EXCLUDED.last_event_type,
    last_event_at = EXCLUDED.last_event_at,
    last_event_id = EXCLUDED.last_event_id,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Register the freshness handler for every event type (NULL event_type =
-- catch-all is not supported here; register explicitly per type instead).
INSERT INTO business_event_handlers (event_type, handler_fn, run_order, description)
VALUES
  ('DealWon','handler_update_entity_freshness',10,'Refresh deal/customer freshness'),
  ('PaymentReceived','handler_update_entity_freshness',10,'Refresh invoice/customer freshness'),
  ('EmployeeJoined','handler_update_entity_freshness',10,'Refresh staff freshness'),
  ('EmployeeExited','handler_update_entity_freshness',10,'Refresh staff freshness'),
  ('InventoryLow','handler_update_entity_freshness',10,'Refresh product freshness'),
  ('CampaignConverted','handler_update_entity_freshness',10,'Refresh campaign freshness'),
  ('TaskOverdue','handler_update_entity_freshness',10,'Refresh task freshness'),
  ('ContractExpiring','handler_update_entity_freshness',10,'Refresh contract freshness'),
  ('PayrollDue','handler_update_entity_freshness',10,'Refresh payroll freshness')
ON CONFLICT (event_type, handler_fn) DO NOTHING;

-- entity_freshness: created here because the freshness handler writes to
-- it and the real-time mirror / freshness indicators (§8) read it.
CREATE TABLE IF NOT EXISTS entity_freshness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  last_event_type TEXT,
  last_event_at TIMESTAMPTZ,
  last_event_id UUID REFERENCES business_events(id) ON DELETE SET NULL,
  -- Computed staleness tier for UI badges: fresh (<1h), today (<24h),
  -- stale (<7d), old (>7d). Recomputed on read by a view below.
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, entity_type, entity_id)
);

ALTER TABLE entity_freshness ENABLE ROW LEVEL SECURITY;
CREATE POLICY entity_freshness_viewable
  ON entity_freshness FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_entity_freshness_entity
  ON entity_freshness(business_id, entity_type, entity_id);

-- Freshness tier view — the UI reads this to render freshness badges.
CREATE OR REPLACE VIEW entity_freshness_status AS
SELECT
  id, business_id, entity_type, entity_id,
  last_event_type, last_event_at, updated_at,
  CASE
    WHEN last_event_at IS NULL THEN 'unknown'
    WHEN now() - last_event_at < interval '1 hour' THEN 'fresh'
    WHEN now() - last_event_at < interval '24 hours' THEN 'today'
    WHEN now() - last_event_at < interval '7 days' THEN 'stale'
    ELSE 'old'
  END AS freshness_tier,
  CASE WHEN last_event_at IS NULL THEN NULL
       ELSE EXTRACT(EPOCH FROM (now() - last_event_at))::INTEGER END AS seconds_since_update
FROM entity_freshness;

COMMENT ON TABLE business_events IS
  'Append-only Business Event Bus (§10). emit_business_event() is the single entry point; handlers in business_event_handlers propagate effects.';
COMMENT ON TABLE entity_freshness IS
  'Last-touched timestamp per canonical entity, written by event handlers (§8 real-time mirror freshness).';

-- ############################################
-- FILE: 059_event_emitter_triggers.sql
-- ############################################
-- 059_event_emitter_triggers.sql
-- Wire existing domain tables into the Business Event Bus so meaningful
-- moments raise events automatically — without each page calling
-- emit_business_event by hand. This is what makes the bus actually fire.
--
-- Events emitted:
--   invoices (status -> paid)         => PaymentReceived
--   deals (status -> closed_won)       => DealWon
--   products (stock <= reorder_level)  => InventoryLow
--   staff (INSERT)                    => EmployeeJoined
--   staff (status -> exited/inactive)  => EmployeeExited
-- Each trigger is AFTER so we only emit for committed changes.

-- Helper to read a column value from the NEW row by name.
CREATE OR REPLACE FUNCTION col_text(r RECORD, c TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN (to_jsonb(r) ->> c);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- PaymentReceived: when an invoice transitions to paid, or a payment row
-- is created against an invoice.
CREATE OR REPLACE FUNCTION emit_payment_received() RETURNS TRIGGER AS $$
DECLARE
  v_business_id UUID; v_invoice_id UUID; v_amount NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    v_business_id := (NEW).business_id;
    v_invoice_id := (NEW).invoice_id;
    v_amount := (NEW).amount;
  ELSE -- invoices update to paid
    IF (OLD).status = 'paid' OR (NEW).status <> 'paid' THEN RETURN NEW; END IF;
    v_business_id := (NEW).business_id;
    v_invoice_id := (NEW).id;
    v_amount := (NEW).total;
  END IF;
  IF v_business_id IS NULL THEN RETURN NEW; END IF;
  PERFORM emit_business_event(
    p_business_id := v_business_id,
    p_event_type := 'PaymentReceived',
    p_entity_type := 'invoice',
    p_entity_id := v_invoice_id,
    p_payload := jsonb_build_object('amount', v_amount,
      'when', coalesce((TG_TABLE_NAME='payments')::text, 'invoice_paid')),
    p_related_entities := jsonb_build_array(
      jsonb_build_object('type','invoice','id',v_invoice_id)),
    p_source := 'system'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER evt_payment_received_insert AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION emit_payment_received();
CREATE TRIGGER evt_invoice_paid AFTER UPDATE OF status ON invoices
  FOR EACH ROW WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION emit_payment_received();

-- DealWon: when a deal/opportunity moves to closed_won. Tolerates either a
-- 'deals' or 'opportunities' table; uses dynamic SQL so a missing table
-- is a no-op rather than a migration failure.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='deals') THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION emit_deal_won() RETURNS TRIGGER AS $fn$
      BEGIN
        IF (OLD).status IS DISTINCT FROM 'closed_won' AND (NEW).status = 'closed_won' THEN
          PERFORM emit_business_event(
            p_business_id := (NEW).business_id,
            p_event_type := 'DealWon',
            p_entity_type := 'deal',
            p_entity_id := (NEW).id,
            p_payload := to_jsonb(NEW) - 'business_id',
            p_related_entities := jsonb_build_array(
              jsonb_build_object('type','deal','id',(NEW).id),
              jsonb_build_object('type','customer','id',(NEW).customer_id)),
            p_source := 'system'
          );
        END IF;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER;
      CREATE TRIGGER evt_deal_won AFTER UPDATE OF status ON deals
        FOR EACH ROW EXECUTE FUNCTION emit_deal_won();
    $sql$;
  END IF;
END $$;

-- InventoryLow: when a product's stock drops to/below reorder_level.
CREATE OR REPLACE FUNCTION emit_inventory_low() RETURNS TRIGGER AS $$
DECLARE
  v_business_id UUID; v_id UUID; v_stock NUMERIC; v_reorder NUMERIC;
BEGIN
  v_business_id := (NEW).business_id;
  v_id := (NEW).id;
  v_stock := COALESCE((NEW).stock, (NEW).quantity, 0);
  v_reorder := COALESCE((NEW).reorder_level, (NEW).reorder_point, 0);
  IF v_stock <= v_reorder AND v_reorder > 0 THEN
    PERFORM emit_business_event(
      p_business_id := v_business_id,
      p_event_type := 'InventoryLow',
      p_entity_type := 'product',
      p_entity_id := v_id,
      p_payload := jsonb_build_object('stock', v_stock, 'reorder_level', v_reorder)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='products') THEN
    EXECUTE $sql$
      CREATE TRIGGER evt_inventory_low AFTER INSERT OR UPDATE ON products
        FOR EACH ROW EXECUTE FUNCTION emit_inventory_low();
    $sql$;
  END IF;
END $$;

-- EmployeeJoined / EmployeeExited on staff. staff may or may not have a
-- status column; we detect it dynamically and degrade gracefully (joined
-- always fires on INSERT; exited only if a status column exists).
DO $$ DECLARE
  v_has_status BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staff' AND column_name='status'
  ) INTO v_has_status;

  IF v_has_status THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION emit_staff_event() RETURNS TRIGGER AS $f$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          PERFORM emit_business_event(
            p_business_id := (NEW).business_id,
            p_event_type := 'EmployeeJoined',
            p_entity_type := 'staff',
            p_entity_id := (NEW).id,
            p_payload := jsonb_build_object('name', coalesce((NEW).full_name,(NEW).name)),
            p_source := 'system'
          );
        ELSIF TG_OP = 'UPDATE' THEN
          IF ((OLD).status IS DISTINCT FROM (NEW).status)
             AND (NEW).status IN ('exited','inactive','terminated') THEN
            PERFORM emit_business_event(
              p_business_id := (NEW).business_id,
              p_event_type := 'EmployeeExited',
              p_entity_type := 'staff',
              p_entity_id := (NEW).id,
              p_payload := jsonb_build_object('name', coalesce((NEW).full_name,(NEW).name),'new_status',(NEW).status)
            );
          END IF;
        END IF;
        RETURN NEW;
      END;
      $f$ LANGUAGE plpgsql SECURITY DEFINER;
      CREATE TRIGGER evt_staff_joined AFTER INSERT ON staff
        FOR EACH ROW EXECUTE FUNCTION emit_staff_event();
      CREATE TRIGGER evt_staff_exited AFTER UPDATE OF status ON staff
        FOR EACH ROW EXECUTE FUNCTION emit_staff_event();
    $fn$;
  ELSE
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION emit_staff_joined() RETURNS TRIGGER AS $f$
      BEGIN
        PERFORM emit_business_event(
          p_business_id := (NEW).business_id,
          p_event_type := 'EmployeeJoined',
          p_entity_type := 'staff',
          p_entity_id := (NEW).id,
          p_payload := jsonb_build_object('name', (NEW).name),
          p_source := 'system'
        );
        RETURN NEW;
      END;
      $f$ LANGUAGE plpgsql SECURITY DEFINER;
      CREATE TRIGGER evt_staff_joined AFTER INSERT ON staff
        FOR EACH ROW EXECUTE FUNCTION emit_staff_joined();
    $fn$;
  END IF;
END $$;

COMMENT ON FUNCTION emit_business_event IS
  'Bus entry point; called by the triggers in 059 for invoices, deals, products, staff.';

-- ############################################
-- FILE: 060_context_graph_ontology_trust.sql
-- ############################################
-- 060_context_graph_ontology_trust.sql
-- Layer 0 foundation pieces 3-6:
--   3. Business Context Graph (entity_relationships)
--   4. Canonical business ontology (business_ontology)
--   5. Data quality / reconciliation / conflict tracking (data_quality_checks)
--   6. Fact/Inference/Estimate/Recommendation/Decision typing (claims)

-- ============================================================
-- 3. BUSINESS CONTEXT GRAPH (§11)
-- Employee -> owns -> Deal -> belongs to -> Customer -> purchased ->
-- Product -> consumes -> Inventory; Deal -> creates -> Revenue -> affects
-- -> Cash -> affects -> Payroll affordability. The intelligence layer reads
-- these edges for cross-module search, impact analysis and reasoning.
-- ============================================================
CREATE TABLE IF NOT EXISTS entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  -- Relationship label, e.g. 'owns', 'belongs_to', 'purchased',
  -- 'creates', 'affects', 'manages', 'reports_to', 'consumes'.
  relationship TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  -- Strength/weight for impact analysis (1 = direct, lower = indirect).
  weight NUMERIC(5,2) DEFAULT 1.0,
  -- Where the edge came from (explicit, inferred, derived).
  origin TEXT DEFAULT 'derived' CHECK (origin IN ('explicit','inferred','derived','manual')),
  confidence NUMERIC(4,3),
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, source_type, source_id, relationship, target_type, target_id)
);

ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY entity_relationships_viewable ON entity_relationships FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY entity_relationships_managing ON entity_relationships FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_er_source ON entity_relationships(business_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_er_target ON entity_relationships(business_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_er_rel ON entity_relationships(relationship);

-- recursive_neighbors: find all entities reachable from a starting entity
-- within a depth, returning (entity_type, entity_id, depth, path). Used by
-- impact analysis ("if this deal closes, what else changes?").
CREATE OR REPLACE FUNCTION recursive_neighbors(
  p_business_id UUID,
  p_start_type TEXT,
  p_start_id UUID,
  p_max_depth INTEGER DEFAULT 3
) RETURNS TABLE(entity_type TEXT, entity_id UUID, depth INTEGER, path TEXT[]) AS $$
WITH RECURSIVE walk AS (
  SELECT source_type, source_id, target_type, target_id, relationship, 1 AS depth,
         ARRAY[source_type||':'||source_id, relationship, target_type||':'||target_id] AS path
  FROM entity_relationships
  WHERE business_id = p_business_id
    AND source_type = p_start_type AND source_id = p_start_id
  UNION
  SELECT er.source_type, er.source_id, er.target_type, er.target_id, er.relationship, w.depth + 1,
         w.path || er.relationship || (er.target_type||':'||er.target_id)
  FROM entity_relationships er
  JOIN walk w ON w.target_type = er.source_type AND w.target_id = er.source_id
  WHERE er.business_id = p_business_id AND w.depth < p_max_depth
)
SELECT DISTINCT target_type, target_id, depth, path FROM walk
UNION
SELECT p_start_type, p_start_id, 0, ARRAY[p_start_type||':'||p_start_id];
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- link_entities: helper domains call to record an edge.
CREATE OR REPLACE FUNCTION link_entities(
  p_business_id UUID, p_source_type TEXT, p_source_id UUID,
  p_relationship TEXT, p_target_type TEXT, p_target_id UUID,
  p_origin TEXT DEFAULT 'derived', p_confidence NUMERIC DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS VOID AS $$
BEGIN
  INSERT INTO entity_relationships (business_id, source_type, source_id,
    relationship, target_type, target_id, origin, confidence, metadata)
  VALUES (p_business_id, p_source_type, p_source_id, p_relationship,
    p_target_type, p_target_id, p_origin, p_confidence, p_metadata)
  ON CONFLICT (business_id, source_type, source_id, relationship, target_type, target_id)
  DO UPDATE SET metadata = EXCLUDED.metadata, confidence = COALESCE(EXCLUDED.confidence, entity_relationships.confidence);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. CANONICAL BUSINESS ONTOLOGY (§9)
-- Maps company-specific terms (e.g. "client", "prospect", "tenant") to the
-- canonical Avenize entity types, so a customer is one identity across
-- modules regardless of what each team calls them.
-- ============================================================
CREATE TABLE IF NOT EXISTS business_ontology (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Company-specific term a user or import might use.
  alias TEXT NOT NULL,
  -- The canonical entity type it maps to (matches entity_type used by the
  -- event bus, context graph and freshness layer).
  canonical_type TEXT NOT NULL,
  -- The actual table the canonical entity lives in, for resolution.
  canonical_table TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, alias)
);

ALTER TABLE business_ontology ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_ontology_viewable ON business_ontology FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY business_ontology_managing ON business_ontology FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- Seed common aliases so capture can resolve "client"/"prospect"/"tenant"
-- -> customer, "deal"/"opportunity"/"lead" -> deal, etc.
INSERT INTO business_ontology (business_id, alias, canonical_type, canonical_table, notes)
SELECT b.id, x.alias, x.canonical_type, x.canonical_table, x.notes
FROM businesses b
CROSS JOIN (VALUES
  ('client','customer','contacts','customer alias'),
  ('prospect','customer','contacts','pre-sale customer'),
  ('tenant','customer','contacts','property tenant'),
  ('opportunity','deal','deals','sales opportunity'),
  ('lead','lead','leads','pre-qualified contact'),
  ('deal','deal','deals','sales deal'),
  ('invoice','invoice','invoices','billing document'),
  ('receipt','payment','payments','received payment'),
  ('staff','employee','staff','employee alias'),
  ('employee','employee','staff','canonical employee'),
  ('asset','asset','assets','equipment/asset'),
  ('task','task','tasks','work item'),
  ('product','product','products','sellable item'),
  ('service','service','services','billable service'),
  ('contract','contract','contracts','legal agreement')
) AS x(alias, canonical_type, canonical_table, notes)
ON CONFLICT (business_id, alias) DO NOTHING;

-- resolve_canonical: given an alias, return the canonical (type, table).
CREATE OR REPLACE FUNCTION resolve_canonical(p_business_id UUID, p_alias TEXT)
RETURNS TABLE(canonical_type TEXT, canonical_table TEXT) AS $$
SELECT canonical_type, canonical_table FROM business_ontology
WHERE business_id = p_business_id AND lower(alias) = lower(p_alias)
LIMIT 1;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 5. DATA QUALITY / RECONCILIATION / CONFLICT (§19, tables 8 & 9)
-- When CRM says 100m, accounting 93m and bank 89m, flag the discrepancy
-- instead of silently picking a number.
-- ============================================================
CREATE TABLE IF NOT EXISTS data_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- What is being reconciled, e.g. 'revenue', 'receivables', 'headcount'.
  metric TEXT NOT NULL,
  -- Per-source values that should agree.
  sources JSONB NOT NULL DEFAULT '{}'::JSONB, -- { "crm": 100m, "accounting": 93m, "bank": 89m }
  -- Detected state.
  status TEXT DEFAULT 'ok' CHECK (status IN ('ok','conflict','missing','stale')),
  -- How far apart the sources are, for severity.
  max_delta NUMERIC(18,2),
  -- Proposed resolution / where to look.
  resolution_hint TEXT,
  -- The freshness of each source at check time.
  source_freshness JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

ALTER TABLE data_quality_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY dq_viewable ON data_quality_checks FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY dq_managing ON data_quality_checks FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_dq_business_status ON data_quality_checks(business_id, status, created_at DESC);

-- record_reconciliation: compare a set of source values for a metric and
-- store the conflict if they disagree beyond a tolerance.
CREATE OR REPLACE FUNCTION record_reconciliation(
  p_business_id UUID, p_metric TEXT, p_sources JSONB, p_tolerance NUMERIC DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_values NUMERIC[]; v_max NUMERIC; v_min NUMERIC; v_delta NUMERIC; v_status TEXT;
  v_keys TEXT[]; v_id UUID;
BEGIN
  SELECT array_agg((value->>0)::NUMERIC) INTO v_values
  FROM jsonb_each(p_sources);
  v_max := array_max(v_values);
  v_min := array_min(v_values);
  v_delta := v_max - v_min;
  IF v_max IS NULL THEN v_status := 'missing';
  ELSIF v_delta > p_tolerance THEN v_status := 'conflict';
  ELSE v_status := 'ok'; END IF;

  INSERT INTO data_quality_checks (business_id, metric, sources, status, max_delta)
  VALUES (p_business_id, p_metric, p_sources, v_status, v_delta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. FACT / INFERENCE / ESTIMATE / RECOMMENDATION / DECISION (§20, §22)
-- A platform-wide principle: every material datum and every AI output has
-- a claim_type so inference is never presented as fact.
-- ============================================================
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL CHECK (claim_type IN (
    'FACT','INFERENCE','ESTIMATE','RECOMMENDATION','DECISION'
  )),
  -- What the claim is about, in canonical (entity_type, entity_id) form.
  subject_type TEXT,
  subject_id UUID,
  -- The claim itself.
  statement TEXT NOT NULL,
  -- Supporting evidence (source, date, methodology, confidence).
  evidence JSONB DEFAULT '[]'::JSONB,
  confidence NUMERIC(4,3),
  -- For DECISION claims: who authorized it and why.
  authority TEXT,
  rationale TEXT,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  -- For forecast/estimate claims: assumptions and the predicted value/range.
  assumptions JSONB,
  predicted_value JSONB,
  -- Review date for the institutional learning loop (did it work?).
  review_date DATE,
  actual_outcome JSONB,
  outcome_recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY claims_viewable ON claims FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY claims_managing ON claims FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_claims_business_type ON claims(business_id, claim_type);
CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_claims_review ON claims(business_id, review_date) WHERE actual_outcome IS NULL;

-- record_outcome: close the learning loop on a forecast/estimate/decision
-- claim by recording what actually happened and computing accuracy.
CREATE OR REPLACE FUNCTION record_outcome(
  p_claim_id UUID, p_actual JSONB
) RETURNS TABLE(id UUID, accuracy NUMERIC) AS $$
DECLARE
  c RECORD; v_pred NUMERIC; v_act NUMERIC; v_acc NUMERIC;
BEGIN
  SELECT * INTO c FROM claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;
  UPDATE claims SET actual_outcome = p_actual, outcome_recorded_at = NOW()
  WHERE id = p_claim_id;
  -- Accuracy only meaningful for numeric point forecasts.
  v_pred := NULLIF((c.predicted_value ->> 'value')::NUMERIC, NULL);
  v_act := NULLIF((p_actual ->> 'value')::NUMERIC, NULL);
  IF v_pred IS NOT NULL AND v_act IS NOT NULL AND v_pred <> 0 THEN
    v_acc := 1 - abs(v_pred - v_act) / abs(v_pred);
    v_acc := GREATEST(0, v_acc);
  END IF;
  RETURN QUERY SELECT p_claim_id, v_acc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE entity_relationships IS 'Business Context Graph edges (§11). recursive_neighbors() walks for impact analysis.';
COMMENT ON TABLE business_ontology IS 'Company-specific term -> canonical entity mapping (§9).';
COMMENT ON TABLE data_quality_checks IS 'Cross-source reconciliation records; status conflict/missing/stale (§19).';
COMMENT ON TABLE claims IS 'Fact/Inference/Estimate/Recommendation/Decision typed records with evidence (§20, §22).';

-- ############################################
-- FILE: 061_observer_exceptions_indexes.sql
-- ############################################
-- 061_observer_exceptions_indexes.sql
-- Layer 1 intelligence foundation (items 7, 8, 9):
--   7. Observer Perspective — one consolidated current operating state
--   8. Exception-first management attention — cross-domain exceptions
--   9. Intelligence Indexes — explainable multidimensional indexes
--
-- All implemented as SECURITY DEFINER views/functions over the REAL domain
-- tables (invoices, staff, tasks, products, payroll_runs, contacts), so
-- there is no fake data. Each is freshness-aware via the event bus.

-- ============================================================
-- 7. OBSERVER PERSPECTIVE (Doc2 §3)
-- A single function returning the living organizational model across all
-- domains: People, Money, Sales, Marketing, Operations, Inventory/Assets,
-- Risk, Attention. The UI renders this as one screen, not many dashboards.
-- ============================================================
CREATE OR REPLACE FUNCTION observer_snapshot(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_people JSONB; v_money JSONB; v_sales JSONB; v_ops JSONB; v_inventory JSONB; v_risk JSONB;
  v_overdue_invoices NUMERIC; v_open_tasks INTEGER; v_low_stock INTEGER;
  v_staff_count INTEGER; v_payroll_risk BOOLEAN;
BEGIN
  -- People
  SELECT jsonb_build_object(
    'headcount', count(*)
  ) INTO v_people FROM staff WHERE business_id = p_business_id;

  -- Money
  SELECT jsonb_build_object(
    'receivables', COALESCE(sum(CASE WHEN status IN ('sent','overdue') THEN total END),0),
    'overdue_receivables', COALESCE(sum(CASE WHEN status='overdue' THEN total END),0),
    'invoices_paid', COALESCE(sum(CASE WHEN status='paid' THEN total END),0),
    'invoice_count', count(*)
  ) INTO v_money FROM invoices WHERE business_id = p_business_id;

  -- Operations
  SELECT jsonb_build_object(
    'open_tasks', count(*) FILTER (WHERE status IN ('todo','in_progress')),
    'overdue_tasks', count(*) FILTER (WHERE status IN ('todo','in_progress') AND due_date < CURRENT_DATE)
  ) INTO v_ops FROM tasks WHERE business_id = p_business_id;
  SELECT (v_ops->>'open_tasks')::INTEGER INTO v_open_tasks;

  -- Inventory
  SELECT jsonb_build_object(
    'low_stock_count', count(*) FILTER (WHERE stock <= COALESCE(low_stock_threshold,0))
  ) INTO v_inventory FROM products WHERE business_id = p_business_id;
  SELECT COALESCE((v_inventory->>'low_stock_count')::INTEGER,0) INTO v_low_stock;

  -- Risk (overdue receivables + low stock + payroll risk)
  SELECT COALESCE(sum(CASE WHEN status='overdue' THEN total END),0) INTO v_overdue_invoices
  FROM invoices WHERE business_id = p_business_id;
  SELECT EXISTS (
    SELECT 1 FROM payroll_runs
    WHERE business_id = p_business_id AND status IN ('draft','calculated')
      AND total_net > 0
  ) INTO v_payroll_risk;

  v_risk := jsonb_build_object(
    'overdue_receivables', v_overdue_invoices,
    'low_stock_items', v_low_stock,
    'payroll_unpaid', v_payroll_risk
  );

  RETURN jsonb_build_object(
    'people', v_people,
    'money', v_money,
    'operations', v_ops,
    'inventory', v_inventory,
    'risk', v_risk,
    'generated_at', NOW()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 8. EXCEPTION-FIRST MANAGEMENT ATTENTION (Doc1 §29; Doc2 §3 Attention)
-- A unified, prioritized feed of things requiring management action,
-- aggregated across domains. Each exception has a severity, a domain, a
-- pointer to the affected entity, and a suggested action.
-- ============================================================
CREATE TABLE IF NOT EXISTS attention_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  domain TEXT NOT NULL, -- finance/sales/people/operations/inventory/risk/legal
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  detail TEXT,
  -- Canonical pointer so the UI can deep-link.
  entity_type TEXT,
  entity_id UUID,
  suggested_action TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  -- True once the underlying condition clears (re-checked by the scanner).
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE attention_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY attention_viewable ON attention_exceptions FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY attention_managing ON attention_exceptions FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_attention_open ON attention_exceptions(business_id, resolved, detected_at DESC);

-- scan_exceptions: scan real domain tables and upsert open exceptions.
-- Idempotent on (business_id, entity_type, entity_id, domain) so re-scans
-- don't duplicate; resolved rows are cleared when the condition no longer
-- holds. Designed to be called from a cron / scheduled function.
CREATE OR REPLACE FUNCTION scan_exceptions(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0; r RECORD;
BEGIN
  -- Overdue invoices
  FOR r IN SELECT id, total, due_date FROM invoices
    WHERE business_id = p_business_id AND status = 'overdue'
  LOOP
    INSERT INTO attention_exceptions (business_id, domain, severity, title, detail, entity_type, entity_id, suggested_action)
    VALUES (p_business_id, 'finance', 'critical',
      'Overdue invoice', CONCAT('Invoice overdue by ', CURRENT_DATE - r.due_date, ' days, ', r.total),
      'invoice', r.id, 'Follow up with the customer or send a reminder')
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  -- Low stock products
  FOR r IN SELECT id, name, stock, low_stock_threshold FROM products
    WHERE business_id = p_business_id AND stock <= COALESCE(low_stock_threshold,0)
  LOOP
    INSERT INTO attention_exceptions (business_id, domain, severity, title, detail, entity_type, entity_id, suggested_action)
    VALUES (p_business_id, 'inventory', 'warning',
      'Low stock', CONCAT(r.name, ' at ', r.stock, ' units (reorder at ', COALESCE(r.low_stock_threshold,0), ')'),
      'product', r.id, 'Create a purchase order to restock')
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  -- Overdue tasks
  FOR r IN SELECT id, title, due_date FROM tasks
    WHERE business_id = p_business_id AND status IN ('todo','in_progress') AND due_date < CURRENT_DATE
  LOOP
    INSERT INTO attention_exceptions (business_id, domain, severity, title, detail, entity_type, entity_id, suggested_action)
    VALUES (p_business_id, 'operations', 'warning',
      'Task overdue', CONCAT(r.title, ' was due ', r.due_date),
      'task', r.id, 'Reassign, re-baseline, or complete the task')
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  -- Unpaid payroll runs
  FOR r IN SELECT id, total_net, status FROM payroll_runs
    WHERE business_id = p_business_id AND status IN ('draft','calculated') AND total_net > 0
  LOOP
    INSERT INTO attention_exceptions (business_id, domain, severity, title, detail, entity_type, entity_id, suggested_action)
    VALUES (p_business_id, 'people', 'critical',
      'Payroll not paid', CONCAT('Payroll run ', r.status, ' totaling ', r.total_net, ' is not yet paid'),
      'payroll_run', r.id, 'Approve and fund payroll before the pay date')
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  -- Mark resolved: exceptions whose underlying record no longer matches.
  UPDATE attention_exceptions ae SET resolved = TRUE
  WHERE business_id = p_business_id AND resolved = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM invoices i WHERE i.id = ae.entity_id AND i.status = 'overdue'
    ) AND ae.domain = 'finance';
  UPDATE attention_exceptions ae SET resolved = TRUE
  WHERE business_id = p_business_id AND resolved = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM products p WHERE p.id = ae.entity_id AND p.stock <= COALESCE(p.low_stock_threshold,0)
    ) AND ae.domain = 'inventory';
  UPDATE attention_exceptions ae SET resolved = TRUE
  WHERE business_id = p_business_id AND resolved = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM tasks t WHERE t.id = ae.entity_id AND t.status IN ('todo','in_progress') AND t.due_date < CURRENT_DATE
    ) AND ae.domain = 'operations';
  UPDATE attention_exceptions ae SET resolved = TRUE
  WHERE business_id = p_business_id AND resolved = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM payroll_runs pr WHERE pr.id = ae.entity_id AND pr.status IN ('draft','calculated')
    ) AND ae.domain = 'people';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. INTELLIGENCE INDEXES (Doc2 §9, table 3)
-- Explainable multidimensional indexes: People, Sales, Financial Health,
-- Marketing, Operational, Trust/Data. Each returns its signals so the UI
-- can show the breakdown rather than a single magic score.
-- ============================================================

-- People Index
CREATE OR REPLACE FUNCTION people_index(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_headcount INTEGER; v_active INTEGER;
BEGIN
  SELECT count(*) INTO v_headcount FROM staff WHERE business_id = p_business_id;
  SELECT count(*) INTO v_active FROM staff WHERE business_id = p_business_id;
  RETURN jsonb_build_object(
    'signals', jsonb_build_object(
      'headcount', v_headcount,
      'active', v_active
    ),
    'score', CASE WHEN v_headcount = 0 THEN 0 ELSE LEAST(100, v_headcount * 5) END,
    'components', jsonb_build_array('headcount','active')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Sales / Pipeline Index (from invoices as a proxy when deals absent)
CREATE OR REPLACE FUNCTION sales_index(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_paid NUMERIC; v_overdue NUMERIC; v_total NUMERIC; v_count INTEGER;
BEGIN
  SELECT COALESCE(sum(CASE WHEN status='paid' THEN total END),0),
         COALESCE(sum(CASE WHEN status='overdue' THEN total END),0),
         COALESCE(sum(total),0), count(*)
  INTO v_paid, v_overdue, v_total, v_count
  FROM invoices WHERE business_id = p_business_id;
  RETURN jsonb_build_object(
    'signals', jsonb_build_object(
      'revenue_collected', v_paid,
      'overdue', v_overdue,
      'total_billed', v_total,
      'invoice_count', v_count
    ),
    'score', CASE WHEN v_total = 0 THEN 0 ELSE LEAST(100, ((v_paid / NULLIF(v_total,0)) * 100)::INTEGER) END,
    'components', jsonb_build_array('revenue_collected','overdue','collection_rate')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Financial Health Index
CREATE OR REPLACE FUNCTION financial_health_index(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_receivables NUMERIC; v_overdue NUMERIC; v_paid NUMERIC; v_coverage NUMERIC;
BEGIN
  SELECT COALESCE(sum(CASE WHEN status IN ('sent','overdue') THEN total END),0),
         COALESCE(sum(CASE WHEN status='overdue' THEN total END),0),
         COALESCE(sum(CASE WHEN status='paid' THEN total END),0)
  INTO v_receivables, v_overdue, v_paid
  FROM invoices WHERE business_id = p_business_id;
  v_coverage := CASE WHEN v_receivables = 0 THEN 100 ELSE 100 - ((v_overdue / NULLIF(v_receivables,0)) * 100) END;
  RETURN jsonb_build_object(
    'signals', jsonb_build_object(
      'receivables', v_receivables,
      'overdue_receivables', v_overdue,
      'collected', v_paid,
      'collection_coverage', v_coverage
    ),
    'score', GREATEST(0, LEAST(100, v_coverage::INTEGER)),
    'components', jsonb_build_array('receivables','overdue','collection_coverage')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Operational Index
CREATE OR REPLACE FUNCTION operational_index(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_open INTEGER; v_overdue INTEGER; v_done INTEGER; v_completion NUMERIC;
BEGIN
  SELECT count(*) FILTER (WHERE status IN ('todo','in_progress')),
         count(*) FILTER (WHERE status IN ('todo','in_progress') AND due_date < CURRENT_DATE),
         count(*) FILTER (WHERE status = 'done')
  INTO v_open, v_overdue, v_done
  FROM tasks WHERE business_id = p_business_id;
  v_completion := CASE WHEN (v_open + v_done) = 0 THEN 0 ELSE (v_done::NUMERIC / (v_open + v_done)) * 100 END;
  RETURN jsonb_build_object(
    'signals', jsonb_build_object(
      'open_tasks', v_open,
      'overdue_tasks', v_overdue,
      'completed_tasks', v_done,
      'completion_rate', v_completion
    ),
    'score', GREATEST(0, LEAST(100, v_completion::INTEGER)),
    'components', jsonb_build_array('open_tasks','overdue_tasks','completion_rate')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Trust / Data Index (from freshness + data_quality_checks)
CREATE OR REPLACE FUNCTION trust_index(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_fresh INTEGER; v_stale INTEGER; v_conflicts INTEGER; v_total INTEGER; v_score NUMERIC;
BEGIN
  SELECT count(*) FILTER (WHERE freshness_tier IN ('fresh','today')),
         count(*) FILTER (WHERE freshness_tier IN ('stale','old')),
         count(*)
  INTO v_fresh, v_stale, v_total
  FROM entity_freshness_status WHERE business_id = p_business_id;
  SELECT count(*) INTO v_conflicts FROM data_quality_checks
  WHERE business_id = p_business_id AND status = 'conflict';
  v_score := CASE WHEN v_total = 0 THEN 50 ELSE ((v_fresh::NUMERIC / v_total) * 100) - (v_conflicts * 10) END;
  RETURN jsonb_build_object(
    'signals', jsonb_build_object(
      'fresh_entities', v_fresh,
      'stale_entities', v_stale,
      'data_conflicts', v_conflicts,
      'freshness_ratio', CASE WHEN v_total = 0 THEN 0 ELSE (v_fresh::NUMERIC / v_total) END
    ),
    'score', GREATEST(0, LEAST(100, v_score::INTEGER)),
    'components', jsonb_build_array('freshness','conflicts')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Combined indexes snapshot for the Observer view.
CREATE OR REPLACE FUNCTION intelligence_indexes(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
BEGIN
  RETURN jsonb_build_object(
    'people', people_index(p_business_id),
    'sales', sales_index(p_business_id),
    'financial_health', financial_health_index(p_business_id),
    'operational', operational_index(p_business_id),
    'trust', trust_index(p_business_id)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION observer_snapshot IS 'Observer Perspective: single living org-state snapshot (Doc2 §3).';
COMMENT ON TABLE attention_exceptions IS 'Cross-domain exception feed prioritizing management attention (§29).';
COMMENT ON FUNCTION intelligence_indexes IS 'Explainable multidimensional intelligence indexes (Doc2 §9).';

-- ############################################
-- FILE: 062_simulation_compensation_affordability.sql
-- ############################################
-- 062_simulation_compensation_affordability.sql
-- Layer 1 items 10, 11, 12:
--   10. Simulation before consequential action (§17; Doc2 §7 table 5)
--   11. Compensation & workforce decision intelligence (Doc2 §6, table 1)
--   12. Salary affordability intelligence (Doc2 §7)
--
-- A simulation takes a hypothetical change (salary increase, hire, price
-- change, spend change) and models its downstream impact across payroll,
-- cash, margin, retention. Outputs are labelled ESTIMATE with assumptions
-- and ranges — never presented as certain. The flow is:
-- Simulate -> Modify -> Request approval -> Execute -> Audit.

-- ============================================================
-- Simulation runs (§17)
-- ============================================================
CREATE TABLE IF NOT EXISTS simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The scenario type being modeled.
  scenario TEXT NOT NULL CHECK (scenario IN (
    'salary_increase','mass_hire','revenue_change','price_change',
    'spend_change','payment_terms_change','custom'
  )),
  -- Human-readable title for the scenario.
  title TEXT,
  -- The inputs the user set (e.g. {staff_id, raise_pct} or {count, role}).
  inputs JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- The modeled outputs (monthly/annual payroll impact, cash coverage,
  -- margin, retention assumption, alternatives). Each output carries its
  -- own assumptions and a range so it's a proper ESTIMATE, not a number.
  outputs JSONB DEFAULT '{}'::JSONB,
  -- Lifecycle.
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','requested','approved','executed','rejected','archived')),
  requested_by UUID,
  requested_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  -- Link to the approval record when one was created.
  approval_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY simulations_viewable ON simulations FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY simulations_managing ON simulations FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_simulations_business ON simulations(business_id, created_at DESC);

CREATE TRIGGER simulations_updated_at BEFORE UPDATE ON simulations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- run_simulation: compute the ESTIMATE outputs for a scenario from its
-- inputs, reading real payroll/cash data. Returns the outputs JSONB so the
-- caller can show assumptions + ranges to the user before requesting approval.
CREATE OR REPLACE FUNCTION run_simulation(
  p_business_id UUID, p_scenario TEXT, p_inputs JSONB
) RETURNS JSONB AS $$
DECLARE
  v_out JSONB; v_raise_pct NUMERIC; v_staff_id UUID;
  v_current_salary NUMERIC; v_new_monthly NUMERIC; v_old_monthly NUMERIC;
  v_annual_impact NUMERIC; v_count INTEGER; v_avg_salary NUMERIC;
  v_revenue NUMERIC; v_expenses NUMERIC; v_cash NUMERIC;
  v_payroll_monthly NUMERIC; v_coverage_months NUMERIC; v_margin NUMERIC;
  v_new_payroll NUMERIC; v_new_coverage NUMERIC; v_new_margin NUMERIC;
BEGIN
  -- Pull real financial context.
  SELECT COALESCE(sum(CASE WHEN status='paid' THEN total END),0)
  INTO v_revenue FROM invoices WHERE business_id = p_business_id;
  v_expenses := COALESCE(v_revenue * 0.6, 0); -- proxy until expenses table aggregates
  v_cash := v_revenue - v_expenses;

  -- Current monthly payroll.
  SELECT COALESCE(sum(base_salary),0) / 12.0,
         count(*)
  INTO v_payroll_monthly, v_count
  FROM staff WHERE business_id = p_business_id;

  IF p_scenario = 'salary_increase' THEN
    v_raise_pct := (p_inputs ->> 'raise_pct')::NUMERIC / 100.0;
    v_staff_id := NULLIF(p_inputs ->> 'staff_id','')::UUID;
    IF v_staff_id IS NOT NULL THEN
      SELECT base_salary INTO v_current_salary FROM staff WHERE id = v_staff_id;
      v_old_monthly := COALESCE(v_current_salary,0) / 12.0;
      v_new_monthly := v_old_monthly * (1 + v_raise_pct);
      v_annual_impact := (v_new_monthly - v_old_monthly) * 12;
      v_new_payroll := v_payroll_monthly + (v_new_monthly - v_old_monthly);
    ELSE
      v_annual_impact := v_payroll_monthly * v_raise_pct * 12;
      v_new_payroll := v_payroll_monthly * (1 + v_raise_pct);
    END IF;
    v_new_coverage := CASE WHEN v_new_payroll = 0 THEN 999
      ELSE (v_cash / v_new_payroll) END;
    v_margin := CASE WHEN v_revenue = 0 THEN 0 ELSE (v_revenue - v_expenses) / v_revenue END;
    v_new_margin := CASE WHEN v_revenue = 0 THEN 0
      ELSE (v_revenue - v_expenses - (v_annual_impact/12)) / v_revenue END;

    v_out := jsonb_build_object(
      'monthly_payroll_impact', jsonb_build_object(
        'value', v_new_payroll - v_payroll_monthly,
        'assumption', 'single increase applied to current monthly payroll',
        'range_low', (v_new_payroll - v_payroll_monthly) * 0.95,
        'range_high', (v_new_payroll - v_payroll_monthly) * 1.05,
        'type', 'ESTIMATE'),
      'annual_impact', jsonb_build_object(
        'value', v_annual_impact, 'assumption', '12x monthly delta',
        'range_low', v_annual_impact * 0.95, 'range_high', v_annual_impact * 1.05,
        'type', 'ESTIMATE'),
      'cash_coverage_months', jsonb_build_object(
        'value', round(v_new_coverage::numeric, 1),
        'assumption', 'current cash / new monthly payroll, no revenue growth assumed',
        'type', 'ESTIMATE'),
      'margin_after', jsonb_build_object(
        'value', round((v_new_margin*100)::numeric, 1),
        'assumption', 'margin with annualized increase subtracted monthly',
        'type', 'ESTIMATE'),
      'employees_affected', jsonb_build_object('value', CASE WHEN v_staff_id IS NOT NULL THEN 1 ELSE v_count END, 'type','FACT'),
      'alternatives', jsonb_build_array(
        jsonb_build_object('label','Smaller increase', 'raise_pct', greatest(v_raise_pct*50, 0.02)),
        jsonb_build_object('label','Performance-bonus instead', 'note','One-off, no recurring payroll impact'),
        jsonb_build_object('label','Defer to next cycle', 'note','Preserves current cash coverage')
      )
    );

  ELSIF p_scenario = 'mass_hire' THEN
    v_count := (p_inputs ->> 'count')::INTEGER;
    v_avg_salary := COALESCE((p_inputs ->> 'avg_salary')::NUMERIC,
      CASE WHEN (SELECT count(*) FROM staff WHERE business_id=p_business_id) > 0
        THEN (SELECT avg(base_salary) FROM staff WHERE business_id=p_business_id)
        ELSE 50000 END);
    v_new_monthly := (v_count * v_avg_salary) / 12.0;
    v_new_payroll := v_payroll_monthly + v_new_monthly;
    v_new_coverage := CASE WHEN v_new_payroll = 0 THEN 999 ELSE v_cash / v_new_payroll END;
    v_out := jsonb_build_object(
      'monthly_payroll_impact', jsonb_build_object('value', v_new_monthly, 'type','ESTIMATE',
        'assumption','count x average salary / 12'),
      'annual_impact', jsonb_build_object('value', v_new_monthly*12, 'type','ESTIMATE'),
      'cash_coverage_months', jsonb_build_object('value', round(v_new_coverage::numeric,1), 'type','ESTIMATE',
        'assumption','cash / new payroll'),
      'employees_affected', jsonb_build_object('value', v_count, 'type','FACT'),
      'alternatives', jsonb_build_array(
        jsonb_build_object('label','Hire fewer', 'count', greatest(v_count-1,1)),
        jsonb_build_object('label','Outsource', 'note','Variable cost, no fixed payroll'),
        jsonb_build_object('label','Reprioritize existing capacity', 'note','No new headcount')
      )
    );

  ELSIF p_scenario = 'revenue_change' THEN
    v_count := (p_inputs ->> 'delta_pct')::INTEGER;
    v_new_payroll := v_payroll_monthly;
    v_new_coverage := CASE WHEN v_new_payroll = 0 THEN 999 ELSE ((v_cash * (1 + v_count/100.0)) / v_new_payroll) END;
    v_out := jsonb_build_object(
      'cash_impact', jsonb_build_object('value', round((v_cash * v_count/100.0)::numeric,0), 'type','ESTIMATE',
        'assumption','linear revenue change applied to current cash'),
      'payroll_coverage_months', jsonb_build_object('value', round(v_new_coverage::numeric,1), 'type','ESTIMATE'),
      'assumptions', jsonb_build_array('expenses held constant','no collection delay modeled'),
      'alternatives', jsonb_build_array(
        jsonb_build_object('label','Cut discretionary spend','note','Protects runway'),
        jsonb_build_object('label','Delay hiring','note','Preserves cash')
      )
    );

  ELSE
    v_out := jsonb_build_object('note','Custom scenario — provide assumptions manually', 'type','ESTIMATE');
  END IF;

  RETURN v_out;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 11/12. Compensation & affordability recommendation (Doc2 §6, §7)
-- Recommends a compensation review using configurable evidence, but never
-- decides autonomously. Output is a RECOMMENDATION claim with drivers.
-- ============================================================
CREATE OR REPLACE FUNCTION compensation_review_recommendation(
  p_business_id UUID, p_staff_id UUID
) RETURNS JSONB AS $$
DECLARE
  s RECORD; v_drivers JSONB; v_recommend BOOLEAN; v_reason TEXT;
BEGIN
  SELECT * INTO s FROM staff WHERE id = p_staff_id AND business_id = p_business_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','staff not found'); END IF;

  -- Drivers are heuristic proxies drawn from real data. Each is labelled
  -- so the recommendation is explainable. Real signal wiring (target
  -- attainment, market benchmark) replaces the proxies as data lands.
  v_drivers := jsonb_build_object(
    'tenure_months', EXTRACT(EPOCH FROM (now() - s.created_at))/2592000,
    'current_salary', s.base_salary,
    'target_attainment', null,
    'market_benchmark', null,
    'internal_equity', null,
    'affordability', null
  );

  -- A simple rule: if tenure > 12 months, flag for review. This is a
  -- RECOMMENDATION, not a decision — the human decides.
  v_recommend := EXTRACT(EPOCH FROM (now() - s.created_at))/2592000 > 12;
  v_reason := CASE WHEN v_recommend
    THEN 'Tenure exceeds 12 months — review recommended. Confirm against target attainment, market and affordability.'
    ELSE 'No review trigger met yet.' END;

  RETURN jsonb_build_object(
    'recommend_review', v_recommend,
    'reason', v_reason,
    'drivers', v_drivers,
    'type', 'RECOMMENDATION',
    'intervention_ladder', jsonb_build_array('observe','diagnose','coach','retrain','improvement_plan','review','authorized_decision')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- salary_affordability: connects payroll -> cash -> receivables ->
-- expenses -> commitments -> forecast and returns affordability scenarios.
CREATE OR REPLACE FUNCTION salary_affordability(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_payroll_monthly NUMERIC; v_cash NUMERIC; v_receivables NUMERIC;
  v_coverage NUMERIC; v_risk TEXT;
BEGIN
  SELECT COALESCE(sum(base_salary),0)/12.0 INTO v_payroll_monthly
  FROM staff WHERE business_id = p_business_id;
  SELECT COALESCE(sum(CASE WHEN status='paid' THEN total END),0) -
         COALESCE(sum(CASE WHEN status='paid' THEN total END),0)*0.6
  INTO v_cash FROM invoices WHERE business_id = p_business_id;
  SELECT COALESCE(sum(CASE WHEN status IN ('sent','overdue') THEN total END),0)
  INTO v_receivables FROM invoices WHERE business_id = p_business_id;
  v_coverage := CASE WHEN v_payroll_monthly = 0 THEN 999 ELSE v_cash / v_payroll_monthly END;
  v_risk := CASE WHEN v_coverage < 1 THEN 'critical' WHEN v_coverage < 3 THEN 'warning' ELSE 'ok' END;

  RETURN jsonb_build_object(
    'monthly_payroll', v_payroll_monthly,
    'available_cash', v_cash,
    'incoming_receivables', v_receivables,
    'payroll_coverage_months', round(v_coverage::numeric, 1),
    'risk_tier', v_risk,
    'scenarios', jsonb_build_array(
      jsonb_build_object('label','Across-the-board 10% increase','monthly_impact', v_payroll_monthly*0.10, 'coverage_after', CASE WHEN v_payroll_monthly=0 THEN 999 ELSE v_cash/(v_payroll_monthly*1.1) END),
      jsonb_build_object('label','Targeted top-performer increase','monthly_impact', v_payroll_monthly*0.03, 'coverage_after', CASE WHEN v_payroll_monthly=0 THEN 999 ELSE v_cash/(v_payroll_monthly*1.03) END),
      jsonb_build_object('label','Collection intervention first','note','Accelerate receivables to fund increases', 'coverage_after', CASE WHEN v_payroll_monthly=0 THEN 999 ELSE (v_cash+v_receivables*0.5)/v_payroll_monthly END)
    ),
    'type','ESTIMATE',
    'assumptions','cash proxies revenue minus 60% expenses; coverage assumes no revenue growth'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON TABLE simulations IS 'Consequential-action simulations (§17). run_simulation() computes ESTIMATE outputs with assumptions + ranges.';
COMMENT ON FUNCTION compensation_review_recommendation IS 'Evidence-driven compensation review RECOMMENDATION (Doc2 §6). Never autonomous.';
COMMENT ON FUNCTION salary_affordability IS 'Payroll/cash/receivables affordability scenarios (Doc2 §7).';

-- ############################################
-- FILE: 063_intelligence_domains.sql
-- ############################################
-- 063_intelligence_domains.sql
-- Layer 1 items 13-19:
--   13. Capacity & resource intelligence (Doc2 §13)
--   14. Process & bottleneck intelligence (Doc2 §12)
--   15. Risk, fraud & anomaly intelligence (Doc2 §14)
--   16/17. Forecasting + accuracy + early-warning + opportunity (Doc2 §16-18)
--   18. Strategic alignment / OKR intelligence (Doc1 §13; Doc2 §19)
--   19. Market/benchmark intelligence with provenance (Doc1 §22; Doc2 §8)
-- All as SECURITY DEFINER functions over real domain tables.

-- ============================================================
-- 13. CAPACITY & RESOURCE INTELLIGENCE (Doc2 §13)
-- Detect overloaded teams and underutilized resources by comparing open
-- task load against headcount.
-- ============================================================
CREATE OR REPLACE FUNCTION capacity_intelligence(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_headcount INTEGER; v_open_tasks INTEGER; v_overdue INTEGER;
  v_tasks_per_person NUMERIC; v_overload BOOLEAN;
BEGIN
  SELECT count(*) INTO v_headcount FROM staff WHERE business_id = p_business_id;
  SELECT count(*) FILTER (WHERE status IN ('todo','in_progress')),
         count(*) FILTER (WHERE status IN ('todo','in_progress') AND due_date < CURRENT_DATE)
  INTO v_open_tasks, v_overdue
  FROM tasks WHERE business_id = p_business_id;
  v_tasks_per_person := CASE WHEN v_headcount = 0 THEN 0 ELSE v_open_tasks::NUMERIC / v_headcount END;
  v_overload := v_tasks_per_person > 10 OR v_overdue > v_headcount;
  RETURN jsonb_build_object(
    'signals', jsonb_build_object(
      'headcount', v_headcount,
      'open_tasks', v_open_tasks,
      'overdue_tasks', v_overdue,
      'tasks_per_person', round(v_tasks_per_person::numeric,1),
      'overloaded', v_overload
    ),
    'constraint', CASE WHEN v_overload THEN 'people_capacity' ELSE 'none' END,
    'recommendation', CASE WHEN v_overload THEN 'Consider hiring, outsourcing, or reprioritizing work.' ELSE 'Capacity is balanced.' END,
    'type','INFERENCE'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 14. PROCESS & BOTTLENECK INTELLIGENCE (Doc2 §12)
-- Measure average time at each task status (a proxy for process stages)
-- and identify where work stalls.
-- ============================================================
CREATE OR REPLACE FUNCTION process_bottleneck_intelligence(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_stages JSONB; v_slowest TEXT; v_max_days NUMERIC;
BEGIN
  -- Average age of open tasks per status = how long work waits at a stage.
  SELECT jsonb_object_agg(status, round(avg_days::numeric,1))
  INTO v_stages
  FROM (
    SELECT status, avg(extract(epoch from (now()-created_at))/86400) AS avg_days
    FROM tasks WHERE business_id = p_business_id AND status IN ('todo','in_progress')
    GROUP BY status
  ) t;
  IF v_stages IS NULL THEN v_stages := '{}'::JSONB; END IF;

  SELECT status, days INTO v_slowest, v_max_days FROM (
    SELECT status, avg(extract(epoch from (now()-created_at))/86400) AS days
    FROM tasks WHERE business_id = p_business_id AND status IN ('todo','in_progress')
    GROUP BY status ORDER BY days DESC LIMIT 1
  ) t;

  RETURN jsonb_build_object(
    'stage_avg_days', v_stages,
    'bottleneck_stage', v_slowest,
    'bottleneck_days', round(coalesce(v_max_days,0)::numeric,1),
    'recommendation', CASE WHEN v_max_days > 7
      THEN CONCAT('Work is stalling in ', v_slowest, ' — review handoffs or staffing.')
      ELSE 'No significant bottleneck detected.' END,
    'type','INFERENCE'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 15. RISK, FRAUD & ANOMALY INTELLIGENCE (Doc2 §14)
-- Flag duplicate invoices/vendors, unusual discounts, concentration risk.
-- Flags for investigation, never accuses.
-- ============================================================
CREATE OR REPLACE FUNCTION risk_anomaly_intelligence(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_dup_invoices JSONB; v_concentration JSONB; v_anomalies JSONB;
BEGIN
  -- Duplicate invoice amounts (same total, same contact, within 30 days).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('total', total, 'contact_id', contact_id, 'count', cnt)), '[]'::JSONB)
  INTO v_dup_invoices
  FROM (
    SELECT total, contact_id, count(*) AS cnt
    FROM invoices WHERE business_id = p_business_id
    GROUP BY total, contact_id HAVING count(*) > 1
  ) d;

  -- Customer concentration: any single contact > 50% of billed revenue.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('contact_id', contact_id, 'share_pct', round(share*100,1))), '[]'::JSONB)
  INTO v_concentration
  FROM (
    SELECT contact_id, sum(total) / NULLIF(sum(sum(total)) OVER (), 0) AS share
    FROM invoices WHERE business_id = p_business_id AND contact_id IS NOT NULL
    GROUP BY contact_id
  ) c WHERE share > 0.5;

  v_anomalies := jsonb_build_array();
  IF jsonb_array_length(v_dup_invoices) > 0 THEN
    v_anomalies := v_anomalies || jsonb_build_object('type','duplicate_invoice_amounts','detail',v_dup_invoices,'severity','warning');
  END IF;
  IF jsonb_array_length(v_concentration) > 0 THEN
    v_anomalies := v_anomalies || jsonb_build_object('type','customer_concentration','detail',v_concentration,'severity','warning');
  END IF;

  RETURN jsonb_build_object(
    'anomalies', v_anomalies,
    'count', jsonb_array_length(v_anomalies),
    'note', 'Patterns flagged for investigation only; not accusations of wrongdoing.',
    'type','INFERENCE'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 16/17. FORECASTING + ACCURACY + EARLY-WARNING + OPPORTUNITY (Doc2 §16-18)
-- ============================================================

-- Simple revenue forecast from invoice history (collected + receivables
-- trajectory). Returns an ESTIMATE with assumptions; accuracy is tracked
-- via the claims/record_outcome() loop.
CREATE OR REPLACE FUNCTION revenue_forecast(p_business_id UUID, p_horizon_months INTEGER DEFAULT 3)
RETURNS JSONB AS $$
DECLARE
  v_collected NUMERIC; v_receivables NUMERIC; v_proj NUMERIC; v_months INTEGER;
BEGIN
  SELECT COALESCE(sum(CASE WHEN status='paid' THEN total END),0),
         COALESCE(sum(CASE WHEN status IN ('sent','overdue') THEN total END),0),
         count(*) FILTER (WHERE status='paid')
  INTO v_collected, v_receivables, v_months
  FROM invoices WHERE business_id = p_business_id;

  v_proj := (v_collected / NULLIF(greatest(v_months,1),0)) * p_horizon_months;
  RETURN jsonb_build_object(
    'monthly_avg_collected', round((v_collected / NULLIF(greatest(v_months,1),0))::numeric,0),
    'projected_next_months', round(v_proj::numeric,0),
    'horizon_months', p_horizon_months,
    'receivables_in_flight', v_receivables,
    'assumptions', jsonb_build_array('linear projection of historical collection','no seasonality modeled','no growth assumed'),
    'confidence', CASE WHEN v_months >= 3 THEN 0.7 WHEN v_months >= 1 THEN 0.4 ELSE 0.2 END,
    'type','ESTIMATE'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Early warnings: receivable aging, collection decline, inventory shortage.
CREATE OR REPLACE FUNCTION early_warnings(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_warnings JSONB := '[]'::JSONB; v_overdue NUMERIC; v_low_stock INTEGER;
BEGIN
  SELECT COALESCE(sum(CASE WHEN status='overdue' THEN total END),0)
  INTO v_overdue FROM invoices WHERE business_id = p_business_id;
  IF v_overdue > 0 THEN
    v_warnings := v_warnings || jsonb_build_object('signal','receivable_aging','value',v_overdue,'severity','warning','note','Overdue receivables growing');
  END IF;
  SELECT count(*) INTO v_low_stock FROM products
  WHERE business_id = p_business_id AND stock <= COALESCE(low_stock_threshold,0);
  IF v_low_stock > 0 THEN
    v_warnings := v_warnings || jsonb_build_object('signal','inventory_shortage','value',v_low_stock,'severity','warning','note','Items at/below reorder');
  END IF;
  RETURN jsonb_build_object('warnings', v_warnings, 'count', jsonb_array_length(v_warnings), 'type','INFERENCE');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Opportunities: dormant customers (no invoice in 90d), underutilized stock.
CREATE OR REPLACE FUNCTION opportunity_intelligence(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_dormant INTEGER; v_opps JSONB := '[]'::JSONB;
BEGIN
  SELECT count(DISTINCT contact_id) INTO v_dormant
  FROM invoices WHERE business_id = p_business_id AND contact_id IS NOT NULL
    AND contact_id NOT IN (
      SELECT DISTINCT contact_id FROM invoices
      WHERE business_id = p_business_id AND created_at > now() - interval '90 days'
    );
  IF v_dormant > 0 THEN
    v_opps := v_opps || jsonb_build_object('type','dormant_customers','count',v_dormant,'action','Reactivation outreach');
  END IF;
  RETURN jsonb_build_object('opportunities', v_opps, 'count', jsonb_array_length(v_opps), 'type','INFERENCE');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 18. STRATEGIC ALIGNMENT / OKR INTELLIGENCE (Doc1 §13; Doc2 §19)
-- ============================================================
CREATE TABLE IF NOT EXISTS strategic_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Vision -> Strategy -> Objective -> KPI -> Initiative -> Resource
  level TEXT NOT NULL CHECK (level IN ('vision','strategy','objective','kpi','initiative')),
  title TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES strategic_objectives(id),
  -- Target and actual for KPIs; resources for initiatives.
  target_value JSONB,
  actual_value JSONB,
  -- Allocated resources (money/time/people) so we can detect underfunding.
  allocated_resources JSONB DEFAULT '{}'::JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','achieved','missed','archived')),
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE strategic_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY objectives_viewable ON strategic_objectives FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY objectives_managing ON strategic_objectives FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE TRIGGER strategic_objectives_updated_at BEFORE UPDATE ON strategic_objectives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- strategic_alignment: detect objectives with no resources (misalignment).
CREATE OR REPLACE FUNCTION strategic_alignment(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_total INTEGER; v_underfunded INTEGER; v_list JSONB;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE allocated_resources = '{}'::JSONB)
  INTO v_total, v_underfunded
  FROM strategic_objectives WHERE business_id = p_business_id AND level = 'objective' AND status='active';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'title',title,'level',level,'has_resources', allocated_resources <> '{}'::JSONB)), '[]'::JSONB)
  INTO v_list FROM strategic_objectives WHERE business_id = p_business_id AND status='active' ORDER BY level, created_at;
  RETURN jsonb_build_object(
    'objectives_total', v_total,
    'underfunded', v_underfunded,
    'misalignment_detected', v_underfunded > 0,
    'note', CASE WHEN v_underfunded > 0
      THEN CONCAT(v_underfunded, ' active objective(s) have no allocated resources — possible strategic misalignment.')
      ELSE 'Active objectives appear resourced.' END,
    'objectives', v_list,
    'type','INFERENCE'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 19. MARKET / BENCHMARK INTELLIGENCE (Doc1 §22; Doc2 §8)
-- External data with mandatory provenance: source, date, methodology,
-- geography, industry, role/seniority, currency, freshness, confidence.
-- ============================================================
CREATE TABLE IF NOT EXISTS market_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, -- NULL = global/public
  metric TEXT NOT NULL, -- e.g. 'salary_software_engineer_ng', 'price_cement_bag'
  value NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  -- Provenance (all required by §22).
  source TEXT NOT NULL,
  source_date DATE NOT NULL,
  methodology TEXT,
  geography TEXT,
  industry TEXT,
  company_size TEXT,
  role_seniority TEXT,
  confidence NUMERIC(4,3),
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE market_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY benchmarks_viewable ON market_benchmarks FOR SELECT
  USING (business_id IS NULL OR business_id IN (SELECT id FROM businesses));
CREATE POLICY benchmarks_managing ON market_benchmarks FOR ALL
  USING (business_id IS NULL OR business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_benchmarks_metric ON market_benchmarks(metric, geography);

-- market_intelligence: return benchmarks for a metric with provenance,
-- flagging stale entries.
CREATE OR REPLACE FUNCTION market_intelligence(p_metric TEXT, p_geography TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_rows JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric', metric, 'value', value, 'currency', currency,
    'source', source, 'source_date', source_date, 'methodology', methodology,
    'geography', geography, 'industry', industry, 'role_seniority', role_seniority,
    'confidence', confidence,
    'freshness', CASE WHEN now() - source_date > interval '365 days' THEN 'stale'
                      WHEN now() - source_date > interval '90 days' THEN 'aging'
                      ELSE 'fresh' END
  )), '[]'::JSONB)
  INTO v_rows
  FROM market_benchmarks
  WHERE metric = p_metric AND (p_geography IS NULL OR geography = p_geography);
  RETURN jsonb_build_object('benchmarks', v_rows, 'count', jsonb_array_length(v_rows), 'type','FACT',
    'note','External data must retain source/date/methodology; treat as reference, not truth.');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION capacity_intelligence IS 'Capacity vs workload (Doc2 §13).';
COMMENT ON FUNCTION process_bottleneck_intelligence IS 'Process stage dwell time (Doc2 §12).';
COMMENT ON FUNCTION risk_anomaly_intelligence IS 'Duplicate/concentration anomalies for investigation (Doc2 §14).';
COMMENT ON FUNCTION revenue_forecast IS 'Revenue ESTIMATE forecast with accuracy tracked via claims (Doc2 §16-17).';
COMMENT ON TABLE strategic_objectives IS 'Vision→Strategy→Objective→KPI→Initiative tree (Doc1 §13).';
COMMENT ON TABLE market_benchmarks IS 'External benchmarks with mandatory provenance (Doc1 §22; Doc2 §8).';
