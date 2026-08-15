-- 109_event_catalog_completion_and_repairs.sql
--
-- Completes the Business Event Bus nerve map (§5 catalog) so the body's
-- limbs actually report to the brain. Audit of 059/090 found:
--
--   BROKEN (drifted against real schema, never fire):
--   • InventoryLow — emit_inventory_low reads reorder_level/reorder_point,
--     but `products` uses `low_stock_threshold` (001). v_reorder was always
--     0 → guard `v_reorder > 0` fails → event NEVER fires. Fixed: read the
--     real column with a fallback chain covering both stock models
--     (products.low_stock_threshold, inventory.reorder_level, reorder_point).
--   • EmployeeExited — only fires on a staff `status` column, which does
--     not exist (staff uses `active` BOOLEAN, 002). Fixed: fire on `active`
--     transitioning true→false (and keep a status-based fallback for any
--     table that later adds one).
--
--   MISSING (cataloged in 058 but no trigger, never fire):
--   • CampaignConverted — email_campaigns/sms_campaigns reaching a
--     terminal 'sent' state. Added: trigger on email_campaigns status→sent.
--   • ContractExpiring — legal_contracts approaching end_date. Added:
--     scheduled detector detect_contracts_expiring() (like CustomerInactive
--     in 090) for date-based expiry within 30 days, callable by pg_cron.
--   • PayrollDue — payroll_runs approaching period_end. Added: scheduled
--     detector detect_payroll_due() for runs whose period_end is within 7
--     days and not yet paid.
--
-- All AFTER + idempotent + best-effort (emit_business_event swallows handler
-- failures onto processing_error). Tenant isolation preserved (events carry
-- business_id). No external dependency. Matches the 090 pattern.

\set ON_ERROR_STOP on

-- ============================================================
-- 1. FIX InventoryLow (products uses low_stock_threshold)
-- ============================================================
-- Recreate the function reading the correct column, with a fallback chain
-- so both stock models (products.low_stock_threshold, inventory.reorder_level)
-- are covered. Drop+recreate the trigger so the new function body binds.
CREATE OR REPLACE FUNCTION emit_inventory_low() RETURNS TRIGGER AS $$
DECLARE
  v_business_id UUID; v_id UUID; v_stock NUMERIC; v_reorder NUMERIC;
BEGIN
  v_business_id := (NEW).business_id;
  v_id := (NEW).id;
  v_stock := COALESCE((NEW).stock, (NEW).quantity, 0);
  -- products.low_stock_threshold (001) is the real column; fall back to
  -- inventory.reorder_level (998) / reorder_point for the other stock model.
  v_reorder := COALESCE(
    (NEW).low_stock_threshold,
    (NEW).reorder_level,
    (NEW).reorder_point,
    0
  );
  IF v_reorder > 0 AND v_stock <= v_reorder THEN
    -- Guard against re-emitting on every stock-touch while already low: only
    -- emit when stock just crossed the threshold (OLD was above) or on INSERT.
    IF TG_OP = 'INSERT' OR COALESCE((OLD).stock, (OLD).quantity, 0) > v_reorder THEN
      PERFORM emit_business_event(
        p_business_id := v_business_id,
        p_event_type := 'InventoryLow',
        p_entity_type := 'product',
        p_entity_id := v_id,
        p_payload := jsonb_build_object(
          'stock', v_stock,
          'reorder_level', v_reorder,
          'name', COALESCE((NEW).name, NULL)
        ),
        p_source := 'system'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS evt_inventory_low ON products;
CREATE TRIGGER evt_inventory_low AFTER INSERT OR UPDATE OF stock, low_stock_threshold ON products
  FOR EACH ROW EXECUTE FUNCTION emit_inventory_low();
-- Also wire the inventory table if it exists (separate stock model).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='inventory') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS evt_inventory_low_inv ON inventory';
    EXECUTE 'CREATE TRIGGER evt_inventory_low_inv AFTER INSERT OR UPDATE OF quantity, reorder_level ON inventory
               FOR EACH ROW EXECUTE FUNCTION emit_inventory_low()';
  END IF;
END $$;

-- Register InventoryLow freshness handler if missing (it was in 058's seed
-- but only for the originally-listed event types).
INSERT INTO business_event_handlers (event_type, handler_fn, run_order, description)
VALUES ('InventoryLow','handler_update_entity_freshness',10,'Refresh product freshness')
ON CONFLICT (event_type, handler_fn) DO NOTHING;

-- ============================================================
-- 2. FIX EmployeeExited (staff uses `active` BOOLEAN, not `status`)
-- ============================================================
-- staff (001) has no status column; 002 adds `active BOOLEAN DEFAULT TRUE`.
-- Recreate emit_staff_event to fire EmployeeExited on active true→false,
-- keeping the INSERT→EmployeeJoined path and a status-based fallback.
CREATE OR REPLACE FUNCTION emit_staff_event() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM emit_business_event(
      p_business_id := (NEW).business_id,
      p_event_type := 'EmployeeJoined',
      p_entity_type := 'staff',
      p_entity_id := (NEW).id,
      p_payload := jsonb_build_object('name', COALESCE((NEW).full_name,(NEW).name)),
      p_source := 'system'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Exit via `active` flag flipping to false (the real schema's path).
    IF COALESCE((OLD).active, TRUE) = TRUE AND COALESCE((NEW).active, TRUE) = FALSE THEN
      PERFORM emit_business_event(
        p_business_id := (NEW).business_id,
        p_event_type := 'EmployeeExited',
        p_entity_type := 'staff',
        p_entity_id := (NEW).id,
        p_payload := jsonb_build_object(
          'name', COALESCE((NEW).full_name,(NEW).name),
          'reason', 'deactivated'
        ),
        p_source := 'system'
      );
    END IF;
    -- Fallback: exit via a status column, if one exists (future-proof).
    BEGIN
      IF (OLD).status IS DISTINCT FROM (NEW).status
         AND (NEW).status IN ('exited','inactive','terminated') THEN
        PERFORM emit_business_event(
          p_business_id := (NEW).business_id,
          p_event_type := 'EmployeeExited',
          p_entity_type := 'staff',
          p_entity_id := (NEW).id,
          p_payload := jsonb_build_object(
            'name', COALESCE((NEW).full_name,(NEW).name),
            'new_status', (NEW).status
          ),
          p_source := 'system'
        );
      END IF;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rebind triggers: INSERT for joined, UPDATE OF active (and status if present)
-- for exited. Drop the old 059 triggers first so the new function body binds.
DROP TRIGGER IF EXISTS evt_staff_joined ON staff;
DROP TRIGGER IF EXISTS evt_staff_exited ON staff;
CREATE TRIGGER evt_staff_joined AFTER INSERT ON staff
  FOR EACH ROW EXECUTE FUNCTION emit_staff_event();
CREATE TRIGGER evt_staff_exited AFTER UPDATE OF active ON staff
  FOR EACH ROW EXECUTE FUNCTION emit_staff_event();
-- Also bind to status column if it exists (future-proof; no-op if absent).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='staff' AND column_name='status') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS evt_staff_exited_status ON staff';
    EXECUTE 'CREATE TRIGGER evt_staff_exited_status AFTER UPDATE OF status ON staff
               FOR EACH ROW EXECUTE FUNCTION emit_staff_event()';
  END IF;
END $$;

-- ============================================================
-- 3. ADD CampaignConverted (email_campaigns → sent)
-- ============================================================
-- A campaign "converts" when it completes sending (terminal 'sent' state).
-- Idempotent: only fires on the transition into 'sent', not re-emits.
CREATE OR REPLACE FUNCTION emit_campaign_converted() RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE((OLD).status,'') <> 'sent' AND (NEW).status = 'sent' THEN
    PERFORM emit_business_event(
      p_business_id := (NEW).business_id,
      p_event_type := 'CampaignConverted',
      p_entity_type := 'campaign',
      p_entity_id := (NEW).id,
      p_payload := jsonb_build_object(
        'name', (NEW).name,
        'sent_count', COALESCE((NEW).sent_count, 0),
        'opened_count', COALESCE((NEW).opened_count, 0),
        'clicked_count', COALESCE((NEW).clicked_count, 0)
      ),
      p_related_entities := jsonb_build_array(
        jsonb_build_object('type','campaign','id',(NEW).id)),
      p_source := 'system'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='email_campaigns') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS evt_campaign_converted ON email_campaigns';
    EXECUTE 'CREATE TRIGGER evt_campaign_converted AFTER UPDATE OF status ON email_campaigns
               FOR EACH ROW WHEN (NEW.status = ''sent'')
               EXECUTE FUNCTION emit_campaign_converted()';
  END IF;
END $$;

INSERT INTO business_event_handlers (event_type, handler_fn, run_order, description)
VALUES ('CampaignConverted','handler_update_entity_freshness',10,'Refresh campaign freshness')
ON CONFLICT (event_type, handler_fn) DO NOTHING;

-- ============================================================
-- 4. ADD ContractExpiring (scheduled detector, like CustomerInactive)
-- ============================================================
-- legal_contracts (gap-fill) with end_date within 30 days and status active.
-- Idempotent: will not re-emit for a contract already flagged expiring today.
CREATE OR REPLACE FUNCTION detect_contracts_expiring(p_window_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
  v_existing UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='legal_contracts') THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, business_id, title, end_date
    FROM legal_contracts
    WHERE end_date IS NOT NULL
      AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_window_days
      AND status IN ('active','expiring')
  LOOP
    -- Idempotency: skip if already flagged expiring today.
    SELECT id INTO v_existing FROM business_events
    WHERE business_id = r.business_id
      AND event_type = 'ContractExpiring'
      AND entity_id = r.id
      AND occurred_at::date = CURRENT_DATE
    LIMIT 1;
    IF v_existing IS NULL THEN
      PERFORM emit_business_event(
        p_business_id := r.business_id,
        p_event_type := 'ContractExpiring',
        p_entity_type := 'contract',
        p_entity_id := r.id,
        p_payload := jsonb_build_object(
          'title', r.title,
          'end_date', r.end_date,
          'days_until_expiry', r.end_date - CURRENT_DATE
        ),
        p_source := 'system'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fan-out across all businesses (for pg_cron).
CREATE OR REPLACE FUNCTION detect_contracts_expiring_all(p_window_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE v_total INTEGER := 0; r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT business_id FROM legal_contracts WHERE end_date IS NOT NULL LOOP
    v_total := v_total + detect_contracts_expiring(p_window_days);
  END LOOP;
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION detect_contracts_expiring(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_contracts_expiring_all(INTEGER) TO authenticated;

INSERT INTO business_event_handlers (event_type, handler_fn, run_order, description)
VALUES ('ContractExpiring','handler_update_entity_freshness',10,'Refresh contract freshness')
ON CONFLICT (event_type, handler_fn) DO NOTHING;

-- ============================================================
-- 5. ADD PayrollDue (scheduled detector)
-- ============================================================
-- payroll_runs whose period_end is within 7 days and not yet paid.
-- Idempotent per day per run.
CREATE OR REPLACE FUNCTION detect_payroll_due(p_window_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
  v_existing UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='payroll_runs') THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, business_id, period_start, period_end, status
    FROM payroll_runs
    WHERE period_end IS NOT NULL
      AND period_end BETWEEN CURRENT_DATE AND CURRENT_DATE + p_window_days
      AND status NOT IN ('paid','cancelled')
  LOOP
    SELECT id INTO v_existing FROM business_events
    WHERE business_id = r.business_id
      AND event_type = 'PayrollDue'
      AND entity_id = r.id
      AND occurred_at::date = CURRENT_DATE
    LIMIT 1;
    IF v_existing IS NULL THEN
      PERFORM emit_business_event(
        p_business_id := r.business_id,
        p_event_type := 'PayrollDue',
        p_entity_type := 'payroll',
        p_entity_id := r.id,
        p_payload := jsonb_build_object(
          'period_start', r.period_start,
          'period_end', r.period_end,
          'status', r.status,
          'days_until_due', r.period_end - CURRENT_DATE
        ),
        p_source := 'system'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION detect_payroll_due_all(p_window_days INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE v_total INTEGER := 0; r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT business_id FROM payroll_runs WHERE period_end IS NOT NULL LOOP
    v_total := v_total + detect_payroll_due(p_window_days);
  END LOOP;
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION detect_payroll_due(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_payroll_due_all(INTEGER) TO authenticated;

INSERT INTO business_event_handlers (event_type, handler_fn, run_order, description)
VALUES ('PayrollDue','handler_update_entity_freshness',10,'Refresh payroll freshness')
ON CONFLICT (event_type, handler_fn) DO NOTHING;

-- ============================================================
-- 6. pg_cron schedules for the detectors (best-effort if pg_cron absent)
-- ============================================================
-- Runs daily at 02:15 (after detect_customer_inactive at 02:00 from 090).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'avenize-detect-contracts-expiring',
      '15 2 * * *',
      $$SELECT detect_contracts_expiring_all(30);$$
    );
    PERFORM cron.schedule(
      'avenize-detect-payroll-due',
      '30 2 * * *',
      $$SELECT detect_payroll_due_all(7);$$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
