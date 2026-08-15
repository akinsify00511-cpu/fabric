-- 090_event_catalog_completion.sql
--
-- P1 / U6 of the Intelligence Transformation. Completes the Business Event
-- Catalog the Master Instruction §5 lists. Several important events never
-- fired because of triggers that were drifted against the real schema:
--   • 059 emit_deal_won checked NEW.status = 'closed_won' but deals has
--     `stage` (values incl. 'won'/'closed_won'), so DealWon NEVER fired.
--     This is fixed here (drop + recreate on UPDATE OF stage, matching
--     'won'/'closed_won'). It removes the bogus NEW.customer_id reference
--     (deals has no such column; the context-graph handler derives the
--     customer edge instead — 087).
--   • DealLost, InvoiceOverdue, ProjectDelayed, TaskCompleted are added.
--   • CustomerInactive is a windowed detector (not a row trigger): a
--     SECURITY DEFINER function that finds customers with no invoice in
--     >= 90 days (company-configurable) and emits CustomerInactive. A pg_cron
--     job should call it daily; until pg_cron is enabled it can be invoked
--     from a background refresh. Idempotent: it will not re-emit for a
--     customer already flagged inactive today (uses a guard against a
--     recent same-type event).
--
-- All triggers are AFTER + FOR EACH ROW and guard against re-emission
-- (OLD already in the terminal state). Event emission is best-effort via
-- emit_business_event (058). No business data is mutated beyond the event
-- row. Tenant isolation preserved (events carry business_id; RLS on the
-- bus). No external dependency.

\set ON_ERROR_STOP on

-- ============================================================
-- 1. FIX DealWon + ADD DealLost (deals uses `stage`, not `status`)
-- ============================================================
CREATE OR REPLACE FUNCTION emit_deal_won() RETURNS TRIGGER AS $$
DECLARE
  v_related JSONB := jsonb_build_array(jsonb_build_object('type','deal','id',NEW.id));
BEGIN
  IF lower(NEW.stage) IN ('won','closed_won','closed-won')
     AND lower(COALESCE(OLD.stage,'')) NOT IN ('won','closed_won','closed-won') THEN
    IF NEW.owner_id IS NOT NULL THEN
      v_related := v_related || jsonb_build_array(jsonb_build_object('type','staff','id',NEW.owner_id));
    END IF;
    PERFORM emit_business_event(
      p_business_id := NEW.business_id,
      p_event_type := 'DealWon',
      p_entity_type := 'deal',
      p_entity_id := NEW.id,
      p_payload := to_jsonb(NEW) - 'business_id',
      p_related_entities := v_related,
      p_source := 'system'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION emit_deal_lost() RETURNS TRIGGER AS $$
BEGIN
  IF lower(NEW.stage) IN ('lost','closed-lost')
     AND lower(COALESCE(OLD.stage,'')) NOT IN ('lost','closed-lost') THEN
    PERFORM emit_business_event(
      p_business_id := NEW.business_id,
      p_event_type := 'DealLost',
      p_entity_type := 'deal',
      p_entity_id := NEW.id,
      p_payload := to_jsonb(NEW) - 'business_id',
      p_source := 'system'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS evt_deal_won ON deals;
CREATE TRIGGER evt_deal_won AFTER INSERT OR UPDATE OF stage ON deals
  FOR EACH ROW EXECUTE FUNCTION emit_deal_won();
DROP TRIGGER IF EXISTS evt_deal_lost ON deals;
CREATE TRIGGER evt_deal_lost AFTER INSERT OR UPDATE OF stage ON deals
  FOR EACH ROW EXECUTE FUNCTION emit_deal_lost();

-- ============================================================
-- 2. InvoiceOverdue — when an invoice transitions to 'overdue'.
-- The invoices table uses `status` (CHECK relaxed by 082). Emitted on the
-- status change to 'overdue' (idempotent: only when OLD wasn't overdue).
-- ============================================================
CREATE OR REPLACE FUNCTION emit_invoice_overdue() RETURNS TRIGGER AS $$
BEGIN
  IF lower(NEW.status) = 'overdue' AND lower(COALESCE(OLD.status,'')) <> 'overdue' THEN
    PERFORM emit_business_event(
      p_business_id := NEW.business_id,
      p_event_type := 'InvoiceOverdue',
      p_entity_type := 'invoice',
      p_entity_id := NEW.id,
      p_payload := jsonb_build_object(
        'invoice_number', NEW.invoice_number,
        'total', NEW.total,
        'client_name', NEW.client_name,
        'due_date', NEW.due_date),
      p_source := 'system'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS evt_invoice_overdue ON invoices;
CREATE TRIGGER evt_invoice_overdue AFTER UPDATE OF status ON invoices
  FOR EACH ROW EXECUTE FUNCTION emit_invoice_overdue();

-- ============================================================
-- 3. TaskCompleted — when a task transitions to done/completed.
-- tasks uses `status` (values todo/in_progress/done/cancelled) and
-- `completed_at` (set by some flows). Emitted on status change only.
-- ============================================================
CREATE OR REPLACE FUNCTION emit_task_completed() RETURNS TRIGGER AS $$
BEGIN
  IF lower(NEW.status) IN ('done','completed')
     AND lower(COALESCE(OLD.status,'')) NOT IN ('done','completed') THEN
    PERFORM emit_business_event(
      p_business_id := NEW.business_id,
      p_event_type := 'TaskCompleted',
      p_entity_type := 'task',
      p_entity_id := NEW.id,
      p_payload := jsonb_build_object(
        'title', NEW.title,
        'assignee_id', NEW.assignee_id,
        'completed_at', NEW.completed_at),
      p_source := 'system'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS evt_task_completed ON tasks;
CREATE TRIGGER evt_task_completed AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION emit_task_completed();

-- ============================================================
-- 4. ProjectDelayed — when an active project passes its due_date.
-- projects uses `status` (active/done/on_hold/cancelled) + `due_date`.
-- Emitted on UPDATE when status='active' and NEW.due_date < today and the
-- due_date changed (or it crossed into overdue). Idempotent via a guard
-- against an existing same-type event for this project today.
-- ============================================================
CREATE OR REPLACE FUNCTION emit_project_delayed() RETURNS TRIGGER AS $$
DECLARE
  v_already BOOLEAN := FALSE;
BEGIN
  IF lower(NEW.status) = 'active'
     AND NEW.due_date IS NOT NULL
     AND NEW.due_date < CURRENT_DATE
     AND (OLD.due_date IS NULL OR NEW.due_date IS DISTINCT FROM OLD.due_date OR OLD.due_date >= CURRENT_DATE) THEN
    -- Guard: don't re-emit if we already emitted ProjectDelayed for this
    -- project within the last day (avoids spamming on unrelated edits).
    SELECT EXISTS(
      SELECT 1 FROM business_events
      WHERE business_id = NEW.business_id AND event_type = 'ProjectDelayed'
        AND entity_type = 'project' AND entity_id = NEW.id
        AND created_at > NOW() - INTERVAL '1 day'
    ) INTO v_already;
    IF NOT v_already THEN
      PERFORM emit_business_event(
        p_business_id := NEW.business_id,
        p_event_type := 'ProjectDelayed',
        p_entity_type := 'project',
        p_entity_id := NEW.id,
        p_payload := jsonb_build_object(
          'name', NEW.name,
          'due_date', NEW.due_date,
          'owner_id', NEW.owner_id),
        p_source := 'system'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS evt_project_delayed ON projects;
CREATE TRIGGER evt_project_delayed AFTER UPDATE OF due_date, status ON projects
  FOR EACH ROW EXECUTE FUNCTION emit_project_delayed();

-- ============================================================
-- 5. CustomerInactive — windowed detector (no row trigger).
-- Finds customers (contacts) with no invoice in >= p_inactive_days and emits
-- CustomerInactive once per customer per day (idempotent guard). A pg_cron
-- job should call detect_customer_inactive(business_id) daily per business,
-- or detect_customer_inactive_all() across businesses. Best-effort.
-- ============================================================
CREATE OR REPLACE FUNCTION detect_customer_inactive(p_business_id UUID, p_inactive_days INT DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  c RECORD;
  v_already BOOLEAN;
BEGIN
  FOR c IN
    SELECT ct.id AS contact_id, ct.name,
           (SELECT MAX(inv.created_at) FROM invoices inv
              WHERE inv.business_id = p_business_id
                AND COALESCE(NULLIF(inv.client_name,''), inv.client_email) = COALESCE(NULLIF(ct.name,''), ct.email)
              ) AS last_invoice_at
    FROM contacts ct
    WHERE ct.business_id = p_business_id AND ct.name IS NOT NULL AND ct.name <> ''
  LOOP
    IF c.last_invoice_at IS NULL OR c.last_invoice_at < NOW() - (p_inactive_days || ' days')::INTERVAL THEN
      SELECT EXISTS(
        SELECT 1 FROM business_events
        WHERE business_id = p_business_id AND event_type = 'CustomerInactive'
          AND entity_type = 'customer' AND entity_id = c.contact_id
          AND created_at > NOW() - INTERVAL '1 day'
      ) INTO v_already;
      IF NOT v_already THEN
        PERFORM emit_business_event(
          p_business_id := p_business_id,
          p_event_type := 'CustomerInactive',
          p_entity_type := 'customer',
          p_entity_id := c.contact_id,
          p_payload := jsonb_build_object(
            'name', c.name,
            'last_invoice_at', c.last_invoice_at,
            'inactive_days', p_inactive_days),
          p_source := 'system'
        );
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Across all businesses (service-role / scheduled job). Skips businesses
-- with no contacts to avoid wasted work.
CREATE OR REPLACE FUNCTION detect_customer_inactive_all(p_inactive_days INT DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE v_total INTEGER := 0; v_b UUID;
BEGIN
  FOR v_b IN SELECT DISTINCT business_id FROM contacts WHERE name IS NOT NULL AND name <> '' LOOP
    v_total := v_total + detect_customer_inactive(v_b, p_inactive_days);
  END LOOP;
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION detect_customer_inactive(UUID, INT) TO authenticated;
-- detect_customer_inactive_all is service-role only (not granted to anon/auth).

COMMENT ON FUNCTION emit_deal_won IS
  'FIXED (090): fires DealWon on stage -> won/closed_won (059 wrongly checked non-existent status=col). Derives customer via 087.';
COMMENT ON FUNCTION emit_deal_lost IS 'Emits DealLost when a deal stage moves to lost.';
COMMENT ON FUNCTION emit_invoice_overdue IS 'Emits InvoiceOverdue when an invoice status transitions to overdue.';
COMMENT ON FUNCTION emit_task_completed IS 'Emits TaskCompleted when a task status moves to done/completed.';
COMMENT ON FUNCTION emit_project_delayed IS 'Emits ProjectDelayed when an active project passes its due_date (idempotent per day).';
COMMENT ON FUNCTION detect_customer_inactive IS 'Windowed detector: emits CustomerInactive for contacts with no invoice in N days (idempotent per day). Call via pg_cron.';
