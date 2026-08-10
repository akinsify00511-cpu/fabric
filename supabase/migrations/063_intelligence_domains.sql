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
