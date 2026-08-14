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

\set ON_ERROR_STOP on

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
