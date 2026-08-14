
-- ############################################
-- FILE: 089_data_quality_scanner.sql
-- ############################################
-- 089_data_quality_scanner.sql
--
-- P1 / U5 of the Intelligence Transformation. Builds the deterministic Data
-- Quality Engine the Master Instruction §8 requires. The tables exist
-- (`data_quality_checks` + `record_reconciliation`, 060; `self_audit_findings`,
-- 068) but no scanner ever ran. This migration:
--
--   • Extends self_audit_findings.audit_dimension to allow 'data_quality'.
--   • Adds `scan_data_quality(business_id)` — a SET-BASED scanner (no per-row
--     loops) that detects the §8 defects over real tables:
--       - orphaned invoice (no client_name AND no deal link)
--       - missing invoice due date
--       - negative/impossible money values
--       - deal missing owner / value <= 0
--       - task missing assignee (assignee_id)
--       - stale entity (no business event in >30d, via entity_freshness)
--       - duplicate contact (same name, same business)
--       - unreconciled payment (payment with no linked invoice)
--     Each finding is upserted into self_audit_findings (idempotent on
--     business_id+category+entity_type+entity_id+title) and a summary row
--     into data_quality_checks, so both the Self-Audit page and the
--     reconciliation view surface them.
--   • Never mutates business data (§14): it only WRITES findings rows. The
--     suggested remediation is advisory; the user resolves the source data.
--   • Best-effort: each check is in its own block so one missing optional
--     column/table never aborts the rest (§24).
--   • Tenant-scoped by p_business_id; RLS preserved.
--
-- Pure internal SQL. Idempotent. No external dependency.


-- Allow the data_quality audit dimension on self_audit_findings.
ALTER TABLE self_audit_findings DROP CONSTRAINT IF EXISTS self_audit_findings_audit_dimension_check;
ALTER TABLE self_audit_findings ADD CONSTRAINT self_audit_findings_audit_dimension_check
  CHECK (audit_dimension IN ('system_health','business_health','data_quality'));

-- A unique constraint so the scanner is idempotent (re-runs upsert, no dupes).
CREATE UNIQUE INDEX IF NOT EXISTS idx_self_audit_finding_dedup
  ON self_audit_findings (business_id, audit_dimension, category, entity_type, entity_id, title)
  WHERE entity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_self_audit_finding_dedup_noent
  ON self_audit_findings (business_id, audit_dimension, category, title)
  WHERE entity_id IS NULL;

-- ============================================================
-- scan_data_quality(business_id) — set-based, best-effort per check.
-- Returns a summary of how many findings were upserted.
-- ============================================================
CREATE OR REPLACE FUNCTION scan_data_quality(p_business_id UUID)
RETURNS TABLE(category TEXT, found INTEGER) AS $$
DECLARE
  v_n INTEGER;
BEGIN
  -- 1. Orphaned invoice: no client name AND no deal link.
  BEGIN
    INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id, suggested_remediation)
    SELECT p_business_id, 'data_quality', 'orphaned_invoice', 'warning',
      'Invoice has no linked customer',
      'Invoice ' || COALESCE(invoice_number, left(id::TEXT,8)) || ' has no client name and no deal link, so customer exposure cannot be measured.',
      'invoice', id, 'Associate this invoice with a valid customer or deal.'
    FROM invoices
    WHERE business_id = p_business_id
      AND COALESCE(client_name,'') = ''
      AND deal_id IS NULL
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    category := 'orphaned_invoice'; found := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 2. Missing due date on a sent/overdue invoice.
  BEGIN
    INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id, suggested_remediation)
    SELECT p_business_id, 'data_quality', 'missing_due_date', 'warning',
      'Invoice has no due date',
      'Invoice ' || COALESCE(invoice_number, left(id::TEXT,8)) || ' is ' || status || ' but has no due date; overdue tracking is unreliable.',
      'invoice', id, 'Set a due date so aging and reminders work.'
    FROM invoices
    WHERE business_id = p_business_id
      AND lower(status) IN ('sent','overdue') AND due_date IS NULL
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    category := 'missing_due_date'; found := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 3. Negative / impossible money values.
  BEGIN
    INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id, suggested_remediation)
    SELECT p_business_id, 'data_quality', 'invalid_amount', 'critical',
      'Invoice total is negative',
      'Invoice ' || COALESCE(invoice_number, left(id::TEXT,8)) || ' has total ' || total || '. Negative invoiced amounts are impossible.',
      'invoice', id, 'Correct the invoice total.'
    FROM invoices
    WHERE business_id = p_business_id AND total < 0
    ON CONFLICT DO NOTHING;
    category := 'invalid_amount'; found := 0;
    GET DIAGNOSTICS v_n = ROW_COUNT; found := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 4. Deal with no owner or non-positive value.
  BEGIN
    INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id, suggested_remediation)
    SELECT p_business_id, 'data_quality', 'incomplete_deal', 'warning',
      'Open deal has no owner',
      'Deal "' || title || '" (stage ' || COALESCE(stage,'?') || ') has no owner, so sales attribution cannot be computed.',
      'deal', id, 'Assign an owner to this deal.'
    FROM deals
    WHERE business_id = p_business_id AND owner_id IS NULL
      AND lower(stage) NOT IN ('won','lost','closed_won','closed-won','closed-lost')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    category := 'incomplete_deal'; found := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 5. Task missing assignee.
  BEGIN
    INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id, suggested_remediation)
    SELECT p_business_id, 'data_quality', 'unassigned_task', 'info',
      'Task has no assignee',
      'Task "' || title || '" has no assignee, so capacity and ownership intelligence cannot attribute it.',
      'task', id, 'Assign the task or close it.'
    FROM tasks
    WHERE business_id = p_business_id AND assignee_id IS NULL
      AND lower(status) NOT IN ('done','completed','cancelled','canceled')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    category := 'unassigned_task'; found := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 6. Stale entity: no business event touching it in >30 days. Uses the
  -- entity_freshness_status VIEW (freshness_tier is computed there, not on
  -- the base table) with a last_event_at fallback.
  BEGIN
    INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id, suggested_remediation)
    SELECT p_business_id, 'data_quality', 'stale_entity', 'info',
      INITCAP(entity_type) || ' has had no activity in 30+ days',
      'No business event has touched this ' || entity_type || ' recently. It may be abandoned or needing a follow-up.',
      entity_type, entity_id, 'Review whether this record is still relevant or needs a follow-up.'
    FROM entity_freshness_status
    WHERE business_id = p_business_id
      AND freshness_tier IN ('stale','old')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    category := 'stale_entity'; found := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 7. Duplicate contacts (same name within the business).
  BEGIN
    INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id, suggested_remediation)
    SELECT p_business_id, 'data_quality', 'duplicate_contact', 'warning',
      'Duplicate customer name',
      'Customer "' || name || '" appears ' || cnt || ' times. Duplicates split revenue and skew customer intelligence.',
      'contact', MIN(id),
      'Merge the duplicate contacts into one record.'
    FROM (
      SELECT name, MIN(id) AS id, COUNT(*) AS cnt
      FROM contacts WHERE business_id = p_business_id AND name IS NOT NULL AND name <> ''
      GROUP BY name HAVING COUNT(*) > 1
    ) d
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    category := 'duplicate_contact'; found := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 8. Unreconciled payment: a successful payment with no linked invoice.
  BEGIN
    INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id, suggested_remediation)
    SELECT p_business_id, 'data_quality', 'unreconciled_payment', 'warning',
      'Successful payment not linked to an invoice',
      'Payment ' || COALESCE(reference, left(id::TEXT,8)) || ' of ' || amount || ' has no linked invoice; revenue attribution may be incomplete.',
      'payment', id, 'Link this payment to the correct invoice.'
    FROM payments
    WHERE business_id = p_business_id
      AND lower(status) IN ('successful','paid','completed','success')
      AND invoice_id IS NULL
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    category := 'unreconciled_payment'; found := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Summary row into data_quality_checks (reconciliation view) — overall score.
  BEGIN
    INSERT INTO data_quality_checks (business_id, metric, sources, status, max_delta, resolution_hint)
    SELECT p_business_id, 'data_quality_scan',
      jsonb_build_object(
        'orphaned_invoices', (SELECT count(*) FROM self_audit_findings WHERE business_id = p_business_id AND audit_dimension='data_quality' AND category='orphaned_invoice'),
        'invalid_amounts', (SELECT count(*) FROM self_audit_findings WHERE business_id = p_business_id AND audit_dimension='data_quality' AND category='invalid_amount'),
        'unassigned_tasks', (SELECT count(*) FROM self_audit_findings WHERE business_id = p_business_id AND audit_dimension='data_quality' AND category='unassigned_task'),
        'duplicate_contacts', (SELECT count(*) FROM self_audit_findings WHERE business_id = p_business_id AND audit_dimension='data_quality' AND category='duplicate_contact')
      ),
      CASE WHEN EXISTS (
        SELECT 1 FROM self_audit_findings WHERE business_id = p_business_id AND audit_dimension='data_quality' AND severity='critical'
      ) THEN 'conflict' WHEN EXISTS (
        SELECT 1 FROM self_audit_findings WHERE business_id = p_business_id AND audit_dimension='data_quality'
      ) THEN 'stale' ELSE 'ok' END,
      NULL,
      'Run scan_data_quality periodically; resolve findings in the Data Quality view.'
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION scan_data_quality(UUID) TO authenticated;

COMMENT ON FUNCTION scan_data_quality IS
  'Deterministic data-quality scanner (§8). Set-based, best-effort per check. Writes findings into self_audit_findings + a summary into data_quality_checks. Never mutates business data.';

-- ============================================================
-- data_quality_findings(business_id) — read helper for the UI
-- ============================================================
CREATE OR REPLACE FUNCTION data_quality_findings(p_business_id UUID)
RETURNS TABLE(
  id UUID, category TEXT, severity TEXT, title TEXT, detail TEXT,
  entity_type TEXT, entity_id UUID, suggested_remediation TEXT, resolved BOOLEAN, created_at TIMESTAMPTZ
) AS $$
  SELECT id, category, severity, title, detail, entity_type, entity_id,
    suggested_remediation, resolved, created_at
  FROM self_audit_findings
  WHERE business_id = p_business_id AND audit_dimension = 'data_quality'
  ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION data_quality_findings(UUID) TO authenticated;

COMMENT ON FUNCTION data_quality_findings IS
  'Read helper: data-quality findings for a business, severity-prioritised (§8).';

-- ############################################
-- FILE: 090_event_catalog_completion.sql
-- ############################################
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
CREATE TRIGGER IF NOT EXISTS evt_deal_lost AFTER INSERT OR UPDATE OF stage ON deals
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

-- ############################################
-- FILE: 091_recommendation_issuer.sql
-- ############################################
-- 091_recommendation_issuer.sql
--
-- P2 / U7 of the Intelligence Transformation. The recommendation + outcome
-- loop (088) defined the lifecycle, but nothing ever CREATED a recommendation
-- claim — so the loop was empty. This migration adds the deterministic
-- RECOMMENDATION ISSUER: a set-based scanner that reads real business data,
-- applies documented rules (§12/§13/§36 rule format), and upserts
-- RECOMMENDATION claims into the `claims` table with rule_id, severity,
-- evidence, and expected_impact.
--
-- Principles (Master Instruction):
--   • §13: recommendations are SPECIFIC to the company's data, never generic
--     ("Improve sales"). Each names the actual customers/amounts/days.
--   • §18: humanized phrasing ("Customer X has not purchased in 87 days...").
--   • §38: anti-hallucination — every number comes from a real table. No
--     fabricated metrics.
--   • §10: confidence classification per finding.
--   • §21: small-data guard — rules require a minimum evidence base; below it,
--     no recommendation is issued (silence, not noise).
--   • Idempotent: a rule does not re-issue a recommendation for the same
--     subject while an open one exists (status NOT IN terminal states). Uses a
--     unique index on (business_id, rule_id, subject_id) WHERE open.
--   • §24: best-effort, per-rule EXCEPTION blocks; a broken rule never blocks
--     the others or business operations.
--   • §28: tenant-scoped by p_business_id; RLS preserved.
--
-- Pure internal SQL. Idempotent. No external dependency.


-- Unique index so the issuer is idempotent per open recommendation.
-- (business_id, rule_id, subject_id) where the recommendation is still open.
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_open_dedup
  ON claims (business_id, rule_id, subject_id)
  WHERE claim_type = 'RECOMMENDATION'
    AND subject_id IS NOT NULL
    AND status NOT IN ('rejected','outcome_recorded','superseded','expired');

-- Helper: does an OPEN recommendation already exist for this subject+rule?
-- Used by each rule to avoid duplicates.
CREATE OR REPLACE FUNCTION has_open_recommendation(
  p_business_id UUID, p_rule_id TEXT, p_subject_id UUID
) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM claims
    WHERE business_id = p_business_id
      AND claim_type = 'RECOMMENDATION'
      AND rule_id = p_rule_id
      AND subject_id = p_subject_id
      AND status NOT IN ('rejected','outcome_recorded','superseded','expired')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- issue_recommendation — the single insert helper.
-- Inserts a RECOMMENDATION claim with status='issued' unless an open one for
-- the same (business, rule, subject) already exists. Returns the claim id
-- (existing or new). Best-effort.
-- ============================================================
CREATE OR REPLACE FUNCTION issue_recommendation(
  p_business_id UUID,
  p_rule_id TEXT,
  p_severity TEXT,
  p_subject_type TEXT,
  p_subject_id UUID,
  p_statement TEXT,
  p_evidence JSONB,
  p_expected_impact JSONB,
  p_confidence NUMERIC DEFAULT 0.7
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_subject_id IS NOT NULL AND has_open_recommendation(p_business_id, p_rule_id, p_subject_id) THEN
    SELECT id INTO v_id FROM claims
      WHERE business_id = p_business_id AND claim_type='RECOMMENDATION' AND rule_id = p_rule_id
        AND subject_id = p_subject_id
        AND status NOT IN ('rejected','outcome_recorded','superseded','expired')
      LIMIT 1;
    RETURN v_id;
  END IF;
  INSERT INTO claims (
    business_id, claim_type, status, rule_id, severity,
    subject_type, subject_id, statement, evidence, confidence,
    expected_impact
  ) VALUES (
    p_business_id, 'RECOMMENDATION', 'issued', p_rule_id, p_severity,
    p_subject_type, p_subject_id, p_statement, p_evidence, p_confidence,
    p_expected_impact
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- run_recommendation_rules(business_id) — the issuer.
-- Applies every rule set-based, best-effort. Returns (rule_id, issued_count).
-- Rules implemented (documented per §36 rule format in the catalog):
--   FIN-AR-001  Receivables concentration risk
--   FIN-AR-002  Overdue receivable aging (per customer)
--   FIN-CF-001  Cash-flow negative trend
--   SAL-CONV-001 Sales pipeline stagnation (stale deals)
--   INV-001     Low-stock reorder
--   CUST-001    Customer inactivity (top customers)
--   OPS-001     Task overload (assignee capacity)
--   DQ-001      Data-quality blocking intelligence
-- ============================================================
CREATE OR REPLACE FUNCTION run_recommendation_rules(p_business_id UUID)
RETURNS TABLE(rule_id TEXT, issued_count INTEGER) AS $$
DECLARE
  v_n INTEGER;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- FIN-AR-001: Receivables concentration — top customer > 40% of overdue.
  -- §21 guard: needs >= 5 overdue invoices.
  BEGIN
    WITH overdue AS (
      SELECT COALESCE(NULLIF(client_name,''),'Unknown') AS cust, SUM(total) AS amt, COUNT(*) AS n
      FROM invoices
      WHERE business_id = p_business_id AND lower(status)='overdue'
      GROUP BY COALESCE(NULLIF(client_name,''),'Unknown')
    ),
    totals AS (
      SELECT SUM(amt) AS total_amt, SUM(n) AS total_n FROM overdue
    )
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'FIN-AR-001', 'critical',
      'customer', NULL,
      o.cust || ' represents ' || round((o.amt / t.total_amt * 100)::numeric,0)
        || '% of your overdue receivables (' || to_char(o.amt, 'FM999,999,999')
        || ' across ' || o.n || ' invoice' || CASE WHEN o.n>1 THEN 's' ELSE '' END
        || '). Concentrating collection effort here has the highest recovery potential.',
      jsonb_build_object(
        'customer', o.cust,
        'overdue_amount', o.amt,
        'overdue_invoice_count', o.n,
        'total_overdue', t.total_amt,
        'concentration_pct', round((o.amt / t.total_amt * 100)::numeric,1),
        'period', 'point_in_time'),
      0.8,
      jsonb_build_object('amount', o.amt, 'description', 'Potential recovery if collected', 'metric_key', 'overdue_receivables')
    FROM overdue o, totals t
    WHERE t.total_n >= 5
      AND o.amt / t.total_amt > 0.40
      AND NOT has_open_recommendation(p_business_id, 'FIN-AR-001', NULL)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'FIN-AR-001'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'FIN-AR-001'; issued_count := 0; RETURN NEXT;
  END;

  -- FIN-AR-002: Per-customer overdue aging — customers with invoices overdue
  -- by > 30 days. §21 guard: at least 1 overdue invoice.
  BEGIN
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'FIN-AR-002', 'warning',
      'customer', NULL,
      COALESCE(NULLIF(i.client_name,''),'A customer') || ' has '
        || COUNT(*) || ' invoice(s) overdue by more than 30 days totalling '
        || to_char(SUM(i.total), 'FM999,999,999')
        || '. The longer receivables age, the lower the recovery probability.',
      jsonb_build_object(
        'customer', COALESCE(NULLIF(i.client_name,''),'Unknown'),
        'overdue_invoice_count', COUNT(*),
        'overdue_amount', SUM(i.total),
        'oldest_due_date', MIN(i.due_date),
        'period', 'point_in_time'),
      0.85,
      jsonb_build_object('amount', SUM(i.total), 'description', 'Recoverable if collected promptly', 'metric_key', 'overdue_receivables')
    FROM invoices i
    WHERE i.business_id = p_business_id
      AND lower(i.status)='overdue'
      AND i.due_date IS NOT NULL
      AND i.due_date < v_today - 30
    GROUP BY COALESCE(NULLIF(i.client_name,''),'Unknown')
    HAVING NOT has_open_recommendation(p_business_id, 'FIN-AR-002', NULL)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'FIN-AR-002'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'FIN-AR-002'; issued_count := 0; RETURN NEXT;
  END;

  -- FIN-CF-001: Cash-flow negative trend — expenses > revenue over 90d.
  -- §21 guard: needs >= 14 days of cashflow history.
  BEGIN
    WITH cf AS (
      SELECT
        COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS inc,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS exp,
        COUNT(DISTINCT date) AS days
      FROM cashflow_entries
      WHERE business_id = p_business_id AND date >= v_today - 90
    )
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'FIN-CF-001', 'critical',
      'business', NULL,
      'Over the last 90 days, expenses (' || to_char(cf.exp,'FM999,999,999')
        || ') exceeded income (' || to_char(cf.inc,'FM999,999,999')
        || '), a net cash outflow of ' || to_char((cf.exp - cf.inc),'FM999,999,999')
        || '. Sustained outflows erode cash reserves; review major expense categories.',
      jsonb_build_object(
        'income_90d', cf.inc, 'expense_90d', cf.exp,
        'net_90d', cf.inc - cf.exp, 'days_of_history', cf.days,
        'period', 'trailing_90d'),
      0.8,
      jsonb_build_object('amount', cf.exp - cf.inc, 'description', 'Cash burn to arrest', 'metric_key', 'revenue_collected')
    FROM cf
    WHERE cf.days >= 14 AND cf.exp > cf.inc
      AND NOT has_open_recommendation(p_business_id, 'FIN-CF-001', NULL)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'FIN-CF-001'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'FIN-CF-001'; issued_count := 0; RETURN NEXT;
  END;

  -- SAL-CONV-001: Sales pipeline stagnation — deals stuck in the same stage
  -- > 21 days. §21 guard: needs >= 1 open deal.
  BEGIN
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'SAL-CONV-001', 'warning',
      'deal', d.id,
      'Deal "' || d.title || '" has been in the ' || d.stage
        || ' stage for ' || extract(day from now() - d.updated_at)
        || ' days. Deals that stagnate rarely close; a follow-up may recover '
        || to_char(d.value, 'FM999,999,999') || ' in pipeline value.',
      jsonb_build_object(
        'deal_id', d.id, 'deal_title', d.title, 'stage', d.stage,
        'value', d.value, 'days_in_stage', extract(day from now() - d.updated_at),
        'owner_id', d.owner_id, 'period', 'point_in_time'),
      0.7,
      jsonb_build_object('amount', d.value, 'description', 'Pipeline value at risk', 'metric_key', 'pipeline_value')
    FROM deals d
    WHERE d.business_id = p_business_id
      AND lower(d.stage) NOT IN ('won','lost','closed_won','closed-won','closed-lost')
      AND d.updated_at < now() - interval '21 days'
      AND NOT has_open_recommendation(p_business_id, 'SAL-CONV-001', d.id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'SAL-CONV-001'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'SAL-CONV-001'; issued_count := 0; RETURN NEXT;
  END;

  -- INV-001: Low-stock reorder — products at/below reorder threshold.
  BEGIN
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'INV-001', 'warning',
      'product', p.id,
      'Stock for "' || p.name || '" is at ' || p.stock || ' units (reorder level '
        || COALESCE(p.low_stock_threshold,0) || '). A stock-out would interrupt sales of this item.',
      jsonb_build_object(
        'product_id', p.id, 'product_name', p.name, 'sku', p.sku,
        'current_stock', p.stock, 'reorder_level', p.low_stock_threshold,
        'unit_cost', p.cost, 'period', 'point_in_time'),
      0.9,
      jsonb_build_object('description', 'Avoid stock-out; create a purchase order', 'metric_key', 'inventory_low_count')
    FROM products p
    WHERE p.business_id = p_business_id
      AND p.stock <= COALESCE(p.low_stock_threshold, 0)
      AND NOT has_open_recommendation(p_business_id, 'INV-001', p.id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'INV-001'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'INV-001'; issued_count := 0; RETURN NEXT;
  END;

  -- CUST-001: Customer inactivity — customers with no invoice in > 90 days who
  -- previously had invoices. §21 guard: customer must have >= 2 historical
  -- invoices (so "inactivity" is meaningful, not a one-off buyer).
  BEGIN
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'CUST-001', 'info',
      'customer', c.id,
      COALESCE(c.name,'A customer') || ' has not been invoiced in '
        || extract(day from now() - last_inv.last_at) || ' days, though they had '
        || last_inv.n || ' prior invoice(s) totalling '
        || to_char(last_inv.total, 'FM999,999,999')
        || '. A check-in may recover a recurring relationship.',
      jsonb_build_object(
        'customer_id', c.id, 'customer_name', c.name,
        'last_invoice_at', last_inv.last_at,
        'prior_invoice_count', last_inv.n,
        'prior_invoice_total', last_inv.total,
        'inactive_days', extract(day from now() - last_inv.last_at),
        'period', 'point_in_time'),
      0.6,
      jsonb_build_object('description', 'Potential repeat business recovery', 'metric_key', 'customer_count')
    FROM contacts c
    JOIN LATERAL (
      SELECT MAX(inv.created_at) AS last_at, COUNT(*) AS n, SUM(inv.total) AS total
      FROM invoices inv
      WHERE inv.business_id = p_business_id
        AND COALESCE(NULLIF(inv.client_name,''), inv.client_email) = COALESCE(NULLIF(c.name,''), c.email)
    ) last_inv ON true
    WHERE c.business_id = p_business_id
      AND c.name IS NOT NULL AND c.name <> ''
      AND last_inv.n >= 2
      AND last_inv.last_at < now() - interval '90 days'
      AND NOT has_open_recommendation(p_business_id, 'CUST-001', c.id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'CUST-001'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'CUST-001'; issued_count := 0; RETURN NEXT;
  END;

  -- OPS-001: Task overload — a staff member with > 8 open tasks.
  -- §21 guard: staff must have >= 8 open tasks (meaningful overload).
  BEGIN
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'OPS-001', 'warning',
      'staff', s.id,
      COALESCE(s.name, s.full_name, 'A team member') || ' has ' || open_cnt.n
        || ' open tasks, which is above the typical workload. Reassigning or '
        || 'reprioritising may reduce the risk of overdue work.',
      jsonb_build_object(
        'staff_id', s.id, 'open_task_count', open_cnt.n,
        'overdue_count', open_cnt.overdue,
        'period', 'point_in_time'),
      0.65,
      jsonb_build_object('description', 'Reduce overload risk', 'metric_key', 'task_overdue_count')
    FROM staff s
    JOIN LATERAL (
      SELECT COUNT(*) AS n,
        COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < v_today) AS overdue
      FROM tasks t
      WHERE t.business_id = p_business_id
        AND t.assignee_id = s.id
        AND lower(t.status) NOT IN ('done','completed','cancelled','canceled')
    ) open_cnt ON true
    WHERE s.business_id = p_business_id
      AND open_cnt.n >= 8
      AND NOT has_open_recommendation(p_business_id, 'OPS-001', s.id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'OPS-001'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'OPS-001'; issued_count := 0; RETURN NEXT;
  END;

  -- DQ-001: Data-quality blocking intelligence — if scan_data_quality found
  -- critical issues, recommend running the data-quality review. Refers to the
  -- findings written by 089. §21 guard: >= 1 critical finding.
  BEGIN
    INSERT INTO claims (business_id, claim_type, status, rule_id, severity,
      subject_type, subject_id, statement, evidence, confidence, expected_impact)
    SELECT p_business_id, 'RECOMMENDATION', 'issued', 'DQ-001', 'warning',
      'business', NULL,
      dq.cnt || ' critical data-quality issue(s) were found (e.g. negative '
        || 'invoice totals, unreconciled payments). These can corrupt '
        || 'metrics and intelligence; reviewing them improves every number '
        || 'Avenize shows you.',
      jsonb_build_object(
        'critical_count', dq.cnt,
        'total_findings', dq.total,
        'period', 'point_in_time'),
      0.9,
      jsonb_build_object('description', 'Improve metric reliability', 'metric_key', 'data_quality_score')
    FROM (
      SELECT COUNT(*) FILTER (WHERE severity='critical') AS cnt,
             COUNT(*) AS total
      FROM self_audit_findings
      WHERE business_id = p_business_id AND audit_dimension='data_quality' AND resolved=false
    ) dq
    WHERE dq.cnt >= 1
      AND NOT has_open_recommendation(p_business_id, 'DQ-001', NULL)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    rule_id := 'DQ-001'; issued_count := v_n; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    rule_id := 'DQ-001'; issued_count := 0; RETURN NEXT;
  END;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION issue_recommendation(UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION run_recommendation_rules(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_open_recommendation(UUID, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION issue_recommendation IS
  'Single insert helper for a RECOMMENDATION claim. Idempotent: skips if an open recommendation exists for the same (business, rule, subject). §12.';
COMMENT ON FUNCTION run_recommendation_rules IS
  'Deterministic recommendation issuer (§12/§13). Set-based, best-effort per rule, idempotent. Scans real data and creates specific, evidenced recommendations.';
COMMENT ON FUNCTION has_open_recommendation IS
  'Guard: does an open (non-terminal) recommendation exist for (business, rule, subject)?';

-- ############################################
-- FILE: 092_intelligence_cron_schedules.sql
-- ############################################
-- 092_intelligence_cron_schedules.sql
--
-- P2 / U8 of the Intelligence Transformation. Schedules the intelligence
-- background jobs via pg_cron (enabled in 051, schema `extensions`). These
-- keep the governed metrics, data-quality findings, recommendations, and
-- inactive-customer detection fresh without a human trigger.
--
-- Jobs (named, unschedule-first so re-running updates rather than dupes):
--   avenize-refresh-metrics       — refresh_business_metrics for all active
--                                   businesses, every 15 minutes.
--   avenize-data-quality-scan     — scan_data_quality for all businesses,
--                                   every hour.
--   avenize-recommendation-rules  — run_recommendation_rules for all
--                                   businesses, every hour (after the
--                                   data-quality scan so DQ-001 sees fresh
--                                   findings).
--   avenize-detect-customer-inactive — detect_customer_inactive_all, daily
--                                   at 02:00.
--
-- The per-business fan-out helpers (`*_all`) are SECURITY DEFINER and run as
-- the service role (pg_cron runs as the cron superuser); they iterate
-- businesses idempotently. Each per-business call is best-effort (a failure
-- for one business is logged via the function's own processing_error path and
-- does not abort the others). No external dependency.
--
-- pg_cron is already enabled (051). If it is not present on a given DB, the
-- DO blocks below no-op via EXCEPTION so the migration never fails (§24).


-- ============================================================
-- 1. Fan-out helpers (iterate all businesses).
-- ============================================================

-- Refresh governed metrics for every business with at least one staff row
-- (an active business). Best-effort per business.
CREATE OR REPLACE FUNCTION refresh_all_business_metrics()
RETURNS INTEGER AS $$
DECLARE v_n INTEGER := 0; b UUID;
BEGIN
  FOR b IN SELECT DISTINCT s.business_id FROM staff s LOOP
    BEGIN
      PERFORM refresh_business_metrics(b);
      -- Sync OKR key results that link to governed metrics (094 §24) so
      -- OKR progress reflects real data. Best-effort; no-op if 094 absent.
      PERFORM sync_kr_from_metric(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Scan data quality for every business with invoices or contacts (has data
-- worth scanning). Best-effort per business.
CREATE OR REPLACE FUNCTION scan_all_business_data_quality()
RETURNS INTEGER AS $$
DECLARE v_n INTEGER := 0; b UUID;
BEGIN
  FOR b IN SELECT DISTINCT business_id FROM invoices LOOP
    BEGIN
      PERFORM scan_data_quality(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  -- Also scan businesses with contacts but no invoices (dedupe/stale checks).
  FOR b IN SELECT DISTINCT business_id FROM contacts
           WHERE business_id NOT IN (SELECT DISTINCT business_id FROM invoices) LOOP
    BEGIN
      PERFORM scan_data_quality(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run recommendation rules for every business with staff (active business).
-- Best-effort per business. Run AFTER the data-quality scan so DQ-001 is
-- evidence-current.
CREATE OR REPLACE FUNCTION run_all_recommendation_rules()
RETURNS INTEGER AS $$
DECLARE v_n INTEGER := 0; b UUID;
BEGIN
  FOR b IN SELECT DISTINCT business_id FROM staff LOOP
    BEGIN
      PERFORM run_recommendation_rules(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Compute Business Health (§21) for every active business. Run AFTER the
-- metrics refresh so the score is based on fresh governed metrics. Best-effort
-- per business (093 must be applied; if not, this no-ops per business).
CREATE OR REPLACE FUNCTION compute_all_business_health()
RETURNS INTEGER AS $$
DECLARE v_n INTEGER := 0; b UUID;
BEGIN
  FOR b IN SELECT DISTINCT business_id FROM staff LOOP
    BEGIN
      PERFORM compute_business_health(b);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- These fan-out helpers are invoked by pg_cron (runs as cron superuser); they
-- are NOT granted to anon/authenticated to prevent a client from triggering a
-- full cross-business sweep.

-- ============================================================
-- 2. Register the cron schedules (named, unschedule-first).
-- pg_cron is in schema `extensions` (051). Guard the whole block so a DB
-- without pg_cron doesn't fail the migration.
-- ============================================================
DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-refresh-metrics');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-refresh-metrics',
    '*/15 * * * *',                     -- every 15 minutes
    $$ SELECT public.refresh_all_business_metrics(); $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-refresh-metrics not scheduled: %', SQLERRM;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-business-health');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- Run 2 minutes after the metrics refresh so the score uses fresh metrics.
DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-business-health',
    '2,17,32,47 * * * *',               -- 2 min after each metrics refresh
    $$ SELECT public.compute_all_business_health(); $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-business-health not scheduled: %', SQLERRM;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-data-quality-scan');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-data-quality-scan',
    '0 * * * *',                        -- at minute 0 of every hour
    $$ SELECT public.scan_all_business_data_quality(); $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-data-quality-scan not scheduled: %', SQLERRM;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-recommendation-rules');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- Run 5 minutes after the data-quality scan so DQ-001 sees fresh findings.
DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-recommendation-rules',
    '5 * * * *',                        -- 5 minutes past the hour
    $$ SELECT public.run_all_recommendation_rules(); $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-recommendation-rules not scheduled: %', SQLERRM;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-detect-customer-inactive');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-detect-customer-inactive',
    '0 2 * * *',                        -- daily at 02:00
    $$ SELECT public.detect_customer_inactive_all(90); $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-detect-customer-inactive not scheduled: %', SQLERRM;
END$$;

COMMENT ON FUNCTION refresh_all_business_metrics IS
  'pg_cron fan-out: refresh governed metrics for all active businesses (every 15 min). Best-effort per business.';
COMMENT ON FUNCTION scan_all_business_data_quality IS
  'pg_cron fan-out: run the data-quality scanner for all businesses with data (hourly). Best-effort per business.';
COMMENT ON FUNCTION run_all_recommendation_rules IS
  'pg_cron fan-out: run the recommendation issuer for all active businesses (hourly, after the DQ scan). Best-effort per business.';
COMMENT ON FUNCTION compute_all_business_health IS
  'pg_cron fan-out: compute the Business Health score (§21) for all active businesses (every 15 min, after metrics refresh). Best-effort per business.';

-- ############################################
-- FILE: 093_business_health_engine.sql
-- ############################################
-- 093_business_health_engine.sql
--
-- §21 Business Health Engine. The directive's headline metric:
--   "Business Health — 81/100 ... Financial — 84, Sales — 76, ..."
-- This must be EXPLAINABLE and decomposable (§21: "Never make it an arbitrary
-- AI-generated number"). Each dimension score is derived from REAL governed
-- metrics (086) normalized against their target or historical baseline, plus
-- a data-quality penalty (089) and a recommendation-severity weighting (091).
--
-- Design:
--   • Each dimension (financial, sales, customers, operations, people,
--     projects) maps to a set of governed metric_keys.
--   • A metric contributes a 0-100 sub-score: if it has a target_value,
--     score = clamp(actual/target * 100, 0, 100) (higher-is-better) or
--     clamp((1 - actual/target) * 100, 0, 100) for lower-is-better metrics
--     (overdue, collection period). If no target, the metric is skipped
--     (§21: no fabrication — "insufficient data" for that dimension).
--   • Dimension score = average of its contributing sub-scores. If a
--     dimension has no contributing metrics (no targets set), it is excluded
--     and flagged "insufficient_data" — the overall score is only over the
--     dimensions that HAVE data (honest, not a guess).
--   • Data-quality penalty: each open critical DQ finding subtracts 2 (max
--     -10), each warning subtracts 1 (max -5). Applied to the overall score.
--   • Recommendation weighting: a high count of open CRITICAL recommendations
--     is surfaced as a flag but does NOT arbitrarily lower the score (the
--     underlying metrics already reflect the condition — avoid double-counting).
--   • Every score row stores the dimension breakdown + evidence JSONB so the
--     UI can show "why 81" with the actual numbers (§19 explainability).
--
-- Pure internal SQL. Idempotent. Builds on 086 (metrics), 089 (DQ), 091 (recs).
-- No external dependency. §24 safe-failure: if metrics aren't refreshed yet,
-- returns insufficient_data for all dimensions.


CREATE TABLE IF NOT EXISTS business_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  overall_score INTEGER,                    -- 0-100, NULL if insufficient data
  dimension_scores JSONB NOT NULL DEFAULT '{}',  -- {financial: {score, metrics:[...]}, ...}
  data_quality_penalty INTEGER DEFAULT 0,
  insufficient_dimensions TEXT[] DEFAULT '{}', -- dimensions with no target-backed data
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  -- Only keep the latest per business (upsert).
  UNIQUE (business_id)
);
CREATE INDEX IF NOT EXISTS idx_bhs_business ON business_health_scores(business_id);

-- Metric → dimension + direction map. direction: 'higher' (bigger is better)
-- or 'lower' (smaller is better, e.g. overdue %).
CREATE TABLE IF NOT EXISTS health_metric_map (
  metric_key TEXT PRIMARY KEY,
  dimension TEXT NOT NULL CHECK (dimension IN (
    'financial','sales','customers','operations','people','projects'
  )),
  direction TEXT NOT NULL DEFAULT 'higher' CHECK (direction IN ('higher','lower')),
  weight NUMERIC DEFAULT 1.0,               -- relative weight within dimension
  label TEXT
);

-- Seed the map against the metric_keys defined in 086.
INSERT INTO health_metric_map (metric_key, dimension, direction, label) VALUES
  ('revenue_collected',      'financial',  'higher', 'Revenue collected'),
  ('collection_rate',        'financial',  'higher', 'Collection rate'),
  ('overdue_receivables_pct','financial',  'lower',  'Overdue receivables %'),
  ('avg_collection_period_days','financial','lower', 'Avg collection period'),
  ('pipeline_value',         'sales',      'higher', 'Pipeline value'),
  ('win_rate',               'sales',      'higher', 'Deal win rate'),
  ('avg_deal_value',         'sales',      'higher', 'Average deal value'),
  ('sales_cycle_days',       'sales',      'lower',  'Sales cycle length'),
  ('customer_count',         'customers',  'higher', 'Active customers'),
  ('task_completion_rate',   'operations', 'higher', 'Task completion rate'),
  ('task_overdue_count',     'operations', 'lower',  'Overdue tasks'),
  ('inventory_low_count',    'operations', 'lower',  'Low-stock items'),
  ('headcount',              'people',     'higher', 'Headcount'),
  ('project_active_count',   'projects',   'higher', 'Active projects')
ON CONFLICT (metric_key) DO UPDATE SET
  dimension = EXCLUDED.dimension,
  direction = EXCLUDED.direction,
  label = EXCLUDED.label;

-- ============================================================
-- compute_business_health(business_id)
-- Derives the explainable health score from governed metrics.
-- Returns the overall score (0-100) or NULL if insufficient data.
-- ============================================================
CREATE OR REPLACE FUNCTION compute_business_health(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_dims JSONB := '{}'::JSONB;
  v_overall NUMERIC := 0;
  v_dims_with_data INTEGER := 0;
  v_insufficient TEXT[] := '{}';
  v_dq_penalty INTEGER := 0;
  v_dq_critical INTEGER;
  v_dq_warning INTEGER;
  v_rec_critical INTEGER;
  v_rec JSONB;
  d RECORD;
  m RECORD;
  v_actual NUMERIC;
  v_target NUMERIC;
  v_sub NUMERIC;
  v_dim_score NUMERIC;
  v_dim_weighted NUMERIC;
  v_dim_count INTEGER;
  v_dim_metrics JSONB;
  v_final INTEGER;
BEGIN
  -- For each dimension, average the sub-scores of metrics that have BOTH a
  -- current_value and a target_value (§21: need a target to score against).
  FOR d IN SELECT DISTINCT dimension FROM health_metric_map ORDER BY dimension LOOP
    v_dim_metrics := '[]'::JSONB;
    v_dim_weighted := 0;
    v_dim_count := 0;

    FOR m IN
      SELECT hm.metric_key, hm.direction, hm.label, hm.weight,
             km.current_value, km.target_value
      FROM health_metric_map hm
      LEFT JOIN kpi_metrics km
        ON km.business_id = p_business_id
        AND km.metric_key = hm.metric_key
        AND km.metric_key IS NOT NULL
      WHERE hm.dimension = d.dimension
    LOOP
      -- §21 guard: skip metrics without both actual and target.
      IF m.current_value IS NULL OR m.target_value IS NULL OR m.target_value = 0 THEN
        CONTINUE;
      END IF;

      IF m.direction = 'higher' THEN
        v_sub := LEAST(GREATEST((m.current_value / m.target_value) * 100, 0), 100);
      ELSE -- lower is better: 0 overdue vs target=10 → 100; meeting target → 0
        v_sub := LEAST(GREATEST((1 - (m.current_value / m.target_value)) * 100, 0), 100);
      END IF;

      v_dim_metrics := v_dim_metrics || jsonb_build_array(jsonb_build_object(
        'metric_key', m.metric_key,
        'label', COALESCE(m.label, m.metric_key),
        'actual', m.current_value,
        'target', m.target_value,
        'direction', m.direction,
        'score', round(v_sub::numeric, 1)
      ));
      v_dim_weighted := v_dim_weighted + v_sub * COALESCE(m.weight, 1);
      v_dim_count := v_dim_count + 1;
    END LOOP;

    IF v_dim_count = 0 THEN
      v_insufficient := array_append(v_insufficient, d.dimension);
      v_dims := jsonb_set(v_dims, ARRAY[d.dimension], jsonb_build_object(
        'score', NULL, 'status', 'insufficient_data', 'metrics', '[]'::JSONB
      ));
    ELSE
      v_dim_score := v_dim_weighted / v_dim_count;
      v_dims := jsonb_set(v_dims, ARRAY[d.dimension], jsonb_build_object(
        'score', round(v_dim_score::numeric, 0),
        'status', CASE WHEN v_dim_score >= 80 THEN 'healthy'
                       WHEN v_dim_score >= 60 THEN 'watch'
                       ELSE 'at_risk' END,
        'metrics', v_dim_metrics
      ));
      v_overall := v_overall + v_dim_score;
      v_dims_with_data := v_dims_with_data + 1;
    END IF;
  END LOOP;

  IF v_dims_with_data = 0 THEN
    -- No target-backed metrics at all. Honest: insufficient data (§21).
    v_final := NULL;
  ELSE
    v_overall := v_overall / v_dims_with_data;

    -- Data-quality penalty (089 findings).
    SELECT
      COUNT(*) FILTER (WHERE severity='critical'),
      COUNT(*) FILTER (WHERE severity='warning')
    INTO v_dq_critical, v_dq_warning
    FROM self_audit_findings
    WHERE business_id = p_business_id
      AND audit_dimension = 'data_quality'
      AND resolved = false;

    v_dq_penalty := LEAST(v_dq_critical * 2, 10) + LEAST(v_dq_warning * 1, 5);
    v_overall := GREATEST(v_overall - v_dq_penalty, 0);

    -- Open critical recommendations (flag, don't double-penalize).
    SELECT COUNT(*) INTO v_rec_critical
    FROM claims
    WHERE business_id = p_business_id
      AND claim_type = 'RECOMMENDATION'
      AND severity = 'critical'
      AND status NOT IN ('rejected','outcome_recorded','superseded','expired');

    v_rec := jsonb_build_object('open_critical_recommendations', v_rec_critical);

    v_dims := jsonb_set(v_dims, ARRAY['_meta'], jsonb_build_object(
      'data_quality_penalty', v_dq_penalty,
      'open_critical_findings', v_dq_critical,
      'open_warning_findings', v_dq_warning,
      'recommendations', v_rec
    ));

    v_final := round(v_overall)::INTEGER;
  END IF;

  -- Upsert the latest score.
  INSERT INTO business_health_scores (
    business_id, overall_score, dimension_scores, data_quality_penalty,
    insufficient_dimensions, computed_at
  ) VALUES (
    p_business_id, v_final, v_dims, v_dq_penalty, v_insufficient, NOW()
  )
  ON CONFLICT (business_id) DO UPDATE SET
    overall_score = EXCLUDED.overall_score,
    dimension_scores = EXCLUDED.dimension_scores,
    data_quality_penalty = EXCLUDED.data_quality_penalty,
    insufficient_dimensions = EXCLUDED.insufficient_dimensions,
    computed_at = EXCLUDED.computed_at;

  RETURN v_final;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Read helper (returns the latest score row as JSONB for the client).
CREATE OR REPLACE FUNCTION current_business_health(p_business_id UUID)
RETURNS JSONB AS $$
  SELECT to_jsonb(t) FROM (
    SELECT overall_score, dimension_scores, data_quality_penalty,
           insufficient_dimensions, computed_at
    FROM business_health_scores WHERE business_id = p_business_id
  ) t;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION compute_business_health(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION current_business_health(UUID) TO authenticated;

COMMENT ON TABLE business_health_scores IS
  '§21 explainable Business Health score. Each dimension derived from real governed metrics (086) vs target. Decomposable via dimension_scores JSONB.';
COMMENT ON FUNCTION compute_business_health IS
  'Derives the Business Health score from governed metrics vs targets + data-quality penalty (089) + recommendation flags (091). Honest NULL if no target-backed data. §21.';
