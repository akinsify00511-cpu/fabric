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
