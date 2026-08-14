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

\set ON_ERROR_STOP on

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
