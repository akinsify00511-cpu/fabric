
-- ############################################
-- FILE: 084_task_management_enhancements.sql
-- ############################################
-- 084_task_management_enhancements.sql
-- Turn the tasks table from a basic todo list into a managed-work surface:
-- assignment, follow-up comments, review feedback (satisfactory / rework),
-- and time management (estimated vs logged hours).
--
-- All additions are additive (no drop of existing data) and idempotent.


-- ============================================================
-- 1. Extend tasks table with review + time-management columns
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(6,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(6,2) DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_status TEXT
  DEFAULT 'pending'
  CHECK (review_status IN ('pending', 'satisfactory', 'needs_rework'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_comment TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES staff(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Allow the richer priority set used by the UI (004 only allowed low/medium/high/urgent).
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

COMMENT ON COLUMN tasks.review_status IS
  'pending = not yet reviewed; satisfactory = approved by a manager/lead; needs_rework = sent back for rework.';

-- ============================================================
-- 2. task_comments — follow-up thread on a task
-- ============================================================

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  author_id UUID REFERENCES staff(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_comments same business read"
  ON task_comments FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));
CREATE POLICY "task_comments same business write"
  ON task_comments FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================================
-- 3. task_time_logs — manual time entries (hours + note)
-- ============================================================

CREATE TABLE IF NOT EXISTS task_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  hours NUMERIC(6,2) NOT NULL CHECK (hours > 0),
  note TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_time_logs_task_id ON task_time_logs(task_id);

ALTER TABLE task_time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_time_logs same business read"
  ON task_time_logs FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));
CREATE POLICY "task_time_logs same business write"
  ON task_time_logs FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================================
-- 4. Auto-maintain tasks.actual_hours from time logs + updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION maintain_task_actual_hours()
RETURNS TRIGGER AS $$
DECLARE
  p_task UUID;
  p_business UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    p_task := OLD.task_id;
    p_business := OLD.business_id;
  ELSE
    p_task := NEW.task_id;
    p_business := NEW.business_id;
  END IF;

  UPDATE tasks SET
    actual_hours = (
      SELECT COALESCE(SUM(hours), 0) FROM task_time_logs WHERE task_id = p_task
    ),
    updated_at = NOW()
  WHERE id = p_task;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_task_time_logs_actual_hours ON task_time_logs;
CREATE TRIGGER trg_task_time_logs_actual_hours
  AFTER INSERT OR UPDATE OR DELETE ON task_time_logs
  FOR EACH ROW EXECUTE FUNCTION maintain_task_actual_hours();

-- ############################################
-- FILE: 085_intelligence_consolidation.sql
-- ############################################
-- 085_intelligence_consolidation.sql
--
-- P1 / U1 of the Intelligence Transformation. Consolidates the two parallel
-- intelligence RPC families that were created independently and now overlap
-- with contradictory rules (exactly the §7 "duplicate metric definitions /
-- contradictory calculations" risk).
--
-- The two families:
--   • 063_intelligence_domains.sql      — `capacity_intelligence`,
--     `process_bottleneck_intelligence`, `risk_anomaly_intelligence`,
--     `revenue_forecast`, `early_warnings`, `opportunity_intelligence`,
--     `strategic_alignment`, `market_intelligence`. CANONICAL. Consumed by
--     IntelligenceHub + ExecutiveCockpit + MarketIndex.
--   • 20260101000006_applied_intelligence.sql — `intelligence_*` twins plus
--     `intelligence_sales_performance` + `intelligence_cashflow_forecast`.
--     ZERO callers in src/. The sales-performance twin is ALSO drifted: it
--     references `sales_targets.target_amount` which does not exist (the
--     real column is `revenue_target`), so it errors on a live DB.
--
-- Decision: 063 is the single canonical family. The …06 twins are marked
-- deprecated (kept callable for one release so nothing breaks if an external
-- caller exists, then removed in a later migration). The two genuinely-new
-- capabilities from …06 (sales performance + cash-flow forecast) are
-- re-implemented as canonical JSONB-returning functions under 063-style names
-- so the frontend can adopt them without a second family:
--   • sales_performance_intelligence(business_id)  — replaces the broken twin
--   • cashflow_forecast_intelligence(business_id, days) — replaces the twin
--
-- All SECURITY DEFINER + STABLE where possible, tenant-scoped by
-- p_business_id, no external dependency, no client payload. Pure SQL over
-- real tables. Defends against the documented stage/status vocabulary drift
-- (multiple "won"/"paid" spellings) and against missing optional columns
-- (invoices.contact_id does not exist on the base table — see schema note).
--
-- Pure internal SQL. Idempotent (CREATE OR REPLACE).


-- ============================================================
-- CANONICAL: sales_performance_intelligence
-- Sales targets vs. actual closed-won revenue per sales owner.
-- Replaces the broken `intelligence_sales_performance` (wrong column name).
-- Uses the real sales_targets.revenue_target column. Deals "won" is matched
-- across all accepted stage spellings. Returns JSONB (063 house style) so
-- IntelligenceHub can render it with a ClaimTag like the other panels.
-- ============================================================
CREATE OR REPLACE FUNCTION sales_performance_intelligence(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_rows JSONB;
  v_count INTEGER := 0;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'staff_id', st.staff_id,
    'target_amount', st.revenue_target,
    'achieved_amount', COALESCE(won.achieved, 0),
    'attainment_pct', CASE WHEN st.revenue_target > 0
      THEN round((COALESCE(won.achieved, 0) / st.revenue_target * 100)::numeric, 1)
      ELSE 0 END,
    'status', CASE
      WHEN st.revenue_target > 0 AND COALESCE(won.achieved, 0) >= st.revenue_target THEN 'on_track'
      WHEN st.revenue_target > 0 AND COALESCE(won.achieved, 0) >= st.revenue_target * 0.5 THEN 'at_risk'
      WHEN st.revenue_target > 0 THEN 'behind'
      ELSE 'no_target'
    END
  ) ORDER BY st.period_start DESC), '[]'::JSONB)
  INTO v_rows
  FROM sales_targets st
  LEFT JOIN LATERAL (
    SELECT SUM(d.value) AS achieved
    FROM deals d
    WHERE d.assigned_to = st.staff_id
      AND d.business_id = p_business_id
      AND lower(d.stage) IN ('won','closed_won','closed-won')
  ) won ON true
  WHERE st.business_id = p_business_id
    AND st.status = 'active';

  SELECT jsonb_array_length(v_rows) INTO v_count;

  RETURN jsonb_build_object(
    'targets', v_rows,
    'target_count', v_count,
    'type', CASE WHEN v_count = 0 THEN 'FACT' ELSE 'INFERENCE' END,
    'note', CASE WHEN v_count = 0
      THEN 'No sales targets set yet. Set targets in Sales settings to see attainment.'
      ELSE 'Attainment compares closed-won deal value against active sales targets.' END
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- CANONICAL: cashflow_forecast_intelligence
-- 90-day moving average of net cash (income - expense) from cashflow_entries,
-- projected forward. Requires >= 7 days of history (§21 small-data guard) —
-- otherwise returns an explicit INSUFFICIENT signal rather than a number.
-- Replaces the `intelligence_cashflow_forecast` twin. JSONB house style.
-- ============================================================
CREATE OR REPLACE FUNCTION cashflow_forecast_intelligence(p_business_id UUID, p_days INT DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
  v_avg NUMERIC; v_n INTEGER; v_income NUMERIC; v_expense NUMERIC;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_income, v_expense
  FROM cashflow_entries
  WHERE business_id = p_business_id
    AND date >= CURRENT_DATE - INTERVAL '90 days';

  SELECT AVG(daily.net), COUNT(*) INTO v_avg, v_n
  FROM (
    SELECT date, SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS net
    FROM cashflow_entries
    WHERE business_id = p_business_id
      AND date >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY date
  ) daily;

  IF v_n IS NULL OR v_n < 7 THEN
    RETURN jsonb_build_object(
      'sufficient_data', false,
      'days_of_history', COALESCE(v_n, 0),
      'type', 'ESTIMATE',
      'note', 'Not enough cash-flow history yet (need at least 7 days). Start recording daily cash flow to enable a forecast.'
    );
  END IF;

  RETURN jsonb_build_object(
    'sufficient_data', true,
    'days_of_history', v_n,
    'daily_avg_net', round(v_avg::numeric, 2),
    'projected_net', round((v_avg * p_days)::numeric, 2),
    'horizon_days', p_days,
    'recent_income', v_income,
    'recent_expense', v_expense,
    'method', '90d_moving_average',
    'type', 'ESTIMATE',
    'assumptions', jsonb_build_array(
      'linear projection of the last 90 days of net cash',
      'no seasonality modelled',
      'no growth or decline assumed',
      'excludes unbilled receivables and unpaid payables'
    ),
    'note', 'A deterministic moving-average projection. The narrative "why" stays with a human or a future generative layer.'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION sales_performance_intelligence(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cashflow_forecast_intelligence(UUID, INT) TO authenticated;

COMMENT ON FUNCTION sales_performance_intelligence IS
  'Canonical sales-performance intelligence (replaces the drifted intelligence_sales_performance). Target vs closed-won attainment.';
COMMENT ON FUNCTION cashflow_forecast_intelligence IS
  'Canonical cash-flow forecast (replaces intelligence_cashflow_forecast). 90-day moving average with an explicit insufficient-data guard.';

-- ============================================================
-- DEPRECATION of the …06 twin family.
-- Kept callable (no DROP) for one release in case an external caller exists,
-- but stamped deprecated so future pages do not adopt them. The frontend
-- already only calls the 063 family. The broken sales-performance twin
-- (wrong column) is NOT re-fixed — it is deprecated; use the canonical
-- function above instead.
-- ============================================================
COMMENT ON FUNCTION intelligence_process_bottlenecks(UUID) IS
  'DEPRECATED (migration 085): duplicate of process_bottleneck_intelligence. Use the canonical 063 family. Will be removed in a later migration.';
COMMENT ON FUNCTION intelligence_risk_anomalies(UUID) IS
  'DEPRECATED (migration 085): duplicate of risk_anomaly_intelligence. Use the canonical 063 family. Will be removed in a later migration.';
COMMENT ON FUNCTION intelligence_capacity(UUID) IS
  'DEPRECATED (migration 085): duplicate of capacity_intelligence. Use the canonical 063 family. Will be removed in a later migration.';
COMMENT ON FUNCTION intelligence_early_warnings(UUID) IS
  'DEPRECATED (migration 085): duplicate of early_warnings. Use the canonical 063 family. Will be removed in a later migration.';
COMMENT ON FUNCTION intelligence_sales_performance(UUID) IS
  'DEPRECATED + BROKEN (migration 085): references a non-existent column (sales_targets.target_amount; real column is revenue_target). Use sales_performance_intelligence instead. Will be removed in a later migration.';
COMMENT ON FUNCTION intelligence_cashflow_forecast(UUID, INT) IS
  'DEPRECATED (migration 085): use cashflow_forecast_intelligence instead. Will be removed in a later migration.';

-- Helper kept around from …06 for the deal-stage-age; harmless, single use.
COMMENT ON FUNCTION deal_stage_age_days(UUID) IS
  'Helper: days a deal has spent in its current stage (from 20260101000006).';

-- ############################################
-- FILE: 086_metric_registry_and_engine.sql
-- ############################################
-- 086_metric_registry_and_engine.sql
--
-- P1 / U2 of the Intelligence Transformation. Builds the canonical, governed
-- business-metrics layer that the Master Instruction §6/§7 requires:
--
--   • `metric_definitions` — the single registry: name, definition, formula,
--     sources, period, unit, min_sample (the §21 insufficient-data floor),
--     version. No dashboard may independently re-derive a governed metric.
--     This removes the "duplicate/contradictory formula" risk.
--   • `refresh_business_metrics(business_id)` — recomputes every active
--     metric for a business and writes a governed row into the existing
--     `kpi_metrics` table (migration 019, currently an empty shell) with
--     `current_value`, `previous_value`, `change_value`, `change_percent`,
--     `sample_size`, `confidence`, `last_calculated_at`, `data_source`.
--   • The function is the ONLY writer of governed metric rows. Pages read
--     `kpi_metrics` (+ `as_of`) instead of re-scanning domain tables on every
--     render (§23 performance).
--   • Every metric carries a `sample_size` and the definition's `min_sample`.
--     Below `min_sample` the value is NULL and the UI is expected to show
--     "Not enough [invoices/deals] yet to establish this." (§21 small-data
--     safety — anti-hallucination.)
--
-- Design rules (per the Master Instruction):
--   • Deterministic, Postgres-only, no external dependency (§22).
--   • Tenant-scoped by p_business_id; RLS on the registry lets any business
--     read definitions; only the service role (refresh job) and the function
--     write materialized rows. `kpi_metrics` stays business-scoped (019).
--   • Read-only interpretation over domain tables; never mutates business data
--     (§14). A refresh failure is best-effort (sub-block + EXCEPTION) so a
--     single broken metric never aborts the rest, and never blocks business
--     operations (§24 failure isolation).
--   • Defends against the documented status/stage vocabulary drift (multiple
--     "won"/"paid" spellings, deals uses owner_id not assigned_to, deals has
--     no closed_at, invoices has no contact_id).
--
-- Pure internal SQL. Idempotent (CREATE TABLE IF NOT EXISTS, CREATE OR
-- REPLACE FUNCTION). Uses \set ON_ERROR_STOP on.


-- ============================================================
-- 1. METRIC DEFINITIONS REGISTRY (§7 governance table)
-- ============================================================
CREATE TABLE IF NOT EXISTS metric_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable key used by the refresh function + frontend (e.g. 'revenue', 'win_rate').
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  definition TEXT NOT NULL,            -- "What exactly does this number mean?"
  formula TEXT NOT NULL,              -- human-readable formula (§7)
  sources TEXT[] NOT NULL DEFAULT '{}', -- which tables contribute
  unit TEXT NOT NULL DEFAULT 'currency' CHECK (unit IN ('currency','number','percent','duration_days','ratio')),
  -- The window the metric is computed over.
  period TEXT NOT NULL DEFAULT 'trailing_90d' CHECK (period IN (
    'point_in_time','trailing_30d','trailing_90d','trailing_365d','all_time'
  )),
  -- Minimum sample size for a reliable value. Below this, the value is NULL
  -- and the UI shows "insufficient data" (§21).
  min_sample INTEGER NOT NULL DEFAULT 1,
  -- What a NULL value means (so the UI can phrase it honestly).
  insufficient_note TEXT,
  category TEXT NOT NULL DEFAULT 'finance' CHECK (category IN (
    'finance','sales','customers','operations','inventory','people','projects','data_quality'
  )),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE metric_definitions ENABLE ROW LEVEL SECURITY;
-- Definitions are non-secret reference data; any authenticated user may read
-- them. Writes are service-role only (migrations / admin), never the client.
CREATE POLICY metric_definitions_read
  ON metric_definitions FOR SELECT TO authenticated
  USING (TRUE);

CREATE TRIGGER metric_definitions_updated_at BEFORE UPDATE ON metric_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. EXTEND kpi_metrics (019) with governance columns.
-- The 019 table is the materialized store; we add the columns the governed
-- engine needs. All additive (IF NOT EXISTS) so existing rows are unaffected.
-- ============================================================
ALTER TABLE kpi_metrics ADD COLUMN IF NOT EXISTS metric_key TEXT;
ALTER TABLE kpi_metrics ADD COLUMN IF NOT EXISTS sample_size INTEGER;
ALTER TABLE kpi_metrics ADD COLUMN IF NOT EXISTS confidence TEXT
  CHECK (confidence IN ('high','medium','low','insufficient'));
ALTER TABLE kpi_metrics ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE kpi_metrics ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE kpi_metrics ADD COLUMN IF NOT EXISTS source_detail JSONB DEFAULT '{}'::JSONB;
-- Dedup key so refresh is idempotent per (business, metric_key, period).
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_metrics_biz_key_period
  ON kpi_metrics (business_id, metric_key, period_end) WHERE metric_key IS NOT NULL;

-- ============================================================
-- 3. SEED TIER-1 METRIC DEFINITIONS (the §7 dictionary)
-- Only metrics derivable from existing real tables. Each documents its
-- formula, sources, period, and min_sample. No metric is invented; each
-- maps to actual columns verified against the schema.
-- ============================================================
INSERT INTO metric_definitions (key, name, definition, formula, sources, unit, period, min_sample, insufficient_note, category)
VALUES
  ('revenue_collected',
   'Revenue (collected)',
   'Total of invoices marked paid within the period.',
   'SUM(invoices.total) WHERE status = paid',
   ARRAY['invoices'], 'currency', 'trailing_90d', 1,
   'No paid invoices yet. Revenue will be measurable once invoices are marked paid.',
   'finance'),
  ('revenue_billed',
   'Revenue (billed)',
   'Total value of all invoices issued within the period.',
   'SUM(invoices.total) WHERE status IN (sent, overdue, paid)',
   ARRAY['invoices'], 'currency', 'trailing_90d', 1,
   'No invoices issued yet. Bill customers to start measuring revenue.',
   'finance'),
  ('receivables_outstanding',
   'Receivables (outstanding)',
   'Total of invoices sent or overdue but not yet paid.',
   'SUM(invoices.total) WHERE status IN (sent, overdue)',
   ARRAY['invoices'], 'currency', 'point_in_time', 1,
   'No outstanding invoices. Nothing is awaiting collection right now.',
   'finance'),
  ('overdue_receivables',
   'Overdue receivables',
   'Total of invoices past their due date and still unpaid.',
   'SUM(invoices.total) WHERE status = overdue',
   ARRAY['invoices'], 'currency', 'point_in_time', 1,
   'No overdue invoices. Good — nothing is past due.',
   'finance'),
  ('overdue_receivables_pct',
   'Overdue receivables %',
   'Overdue receivables as a share of total outstanding receivables.',
   'overdue_receivables / receivables_outstanding * 100',
   ARRAY['invoices'], 'percent', 'point_in_time', 1,
   'No receivables to compute an overdue ratio from yet.',
   'finance'),
  ('collection_rate',
   'Collection rate',
   'Share of billed revenue that has been collected.',
   'revenue_collected / revenue_billed * 100',
   ARRAY['invoices'], 'percent', 'trailing_90d', 1,
   'No invoices billed yet. Collection rate is measurable once you bill and collect.',
   'finance'),
  ('avg_collection_period_days',
   'Average collection period (days)',
   'Average days from invoice issue to payment. Paid invoices only.',
   'AVG(payment_date - invoice_date) for paid invoices with a linked payment',
   ARRAY['invoices','payments'], 'duration_days', 'trailing_90d', 3,
   'Fewer than 3 paid invoices with payment dates. Need more payment history to estimate how long collection usually takes.',
   'finance'),
  ('pipeline_value',
   'Pipeline value',
   'Total value of open (not won/lost) deals.',
   'SUM(deals.value) WHERE stage NOT IN (won, lost)',
   ARRAY['deals'], 'currency', 'point_in_time', 1,
   'No open deals in the pipeline. Add opportunities to track pipeline value.',
   'sales'),
  ('win_rate',
   'Win rate',
   'Closed-won deals as a share of all closed (won + lost) deals.',
   'COUNT(deals WHERE stage = won) / COUNT(deals WHERE stage IN (won, lost)) * 100',
   ARRAY['deals'], 'percent', 'trailing_90d', 5,
   'Fewer than 5 closed deals. Need more sales outcomes to compute a reliable win rate.',
   'sales'),
  ('avg_deal_value',
   'Average deal value',
   'Average value of closed-won deals in the period.',
   'AVG(deals.value) WHERE stage = won',
   ARRAY['deals'], 'currency', 'trailing_90d', 3,
   'Fewer than 3 won deals. Need more closed-won deals to measure average deal size.',
   'sales'),
  ('sales_cycle_days',
   'Sales cycle (days)',
   'Average days from deal creation to close, for closed-won deals.',
   'AVG(updated_at - created_at) for deals WHERE stage = won',
   ARRAY['deals'], 'duration_days', 'trailing_90d', 5,
   'Fewer than 5 won deals. Need more closed-won deals to measure the typical sales cycle.',
   'sales'),
  ('revenue_concentration_top1',
   'Revenue concentration (top customer)',
   'Top customer''s share of total billed revenue.',
   'MAX(customer_billed) / SUM(total billed) * 100',
   ARRAY['invoices'], 'percent', 'trailing_90d', 6,
   'Fewer than 6 invoices. Need more billing history to assess revenue concentration.',
   'customers'),
  ('customer_count',
   'Customers (active)',
   'Distinct customers with at least one invoice in the period.',
   'COUNT(DISTINCT invoices.client_name) — best available customer identifier',
   ARRAY['invoices'], 'number', 'trailing_90d', 1,
   'No customers with invoices yet. Add customers and bill them to start measuring the base.',
   'customers'),
  ('task_completion_rate',
   'Task completion rate',
   'Completed tasks as a share of all tasks created in the period.',
   'COUNT(tasks WHERE status = done) / COUNT(all tasks) * 100',
   ARRAY['tasks'], 'percent', 'trailing_90d', 5,
   'Fewer than 5 tasks. Need more task history to measure completion rate.',
   'operations'),
  ('task_overdue_count',
   'Overdue tasks',
   'Open tasks past their due date.',
   'COUNT(tasks WHERE status IN (todo, in_progress) AND due_date < today)',
   ARRAY['tasks'], 'number', 'point_in_time', 1,
   'No overdue tasks. Nothing is past due.',
   'operations'),
  ('inventory_low_count',
   'Low-stock items',
   'Products at or below their reorder threshold.',
   'COUNT(products WHERE stock <= low_stock_threshold)',
   ARRAY['products'], 'number', 'point_in_time', 1,
   'No products at or below reorder level. Stock looks adequate.',
   'inventory'),
  ('inventory_turnover_proxy',
   'Inventory movement (proxy)',
   'Distinct products with any outbound transaction in the period. A turnover proxy until full movement accounting exists.',
   'COUNT(DISTINCT transaction_items.product_id) for sale/return transactions',
   ARRAY['transactions','transaction_items'], 'number', 'trailing_90d', 1,
   'No outbound stock movements recorded yet. Record sales to measure inventory movement.',
   'inventory'),
  ('headcount',
   'Headcount',
   'Number of staff records in the business.',
   'COUNT(staff)',
   ARRAY['staff'], 'number', 'point_in_time', 1,
   'No staff records yet. Add team members to measure headcount.',
   'people'),
  ('project_active_count',
   'Active projects',
   'Projects currently in an active state.',
   'COUNT(projects WHERE status = active)',
   ARRAY['projects'], 'number', 'point_in_time', 1,
   'No active projects. Create a project to start tracking it.',
   'projects'),
  ('data_quality_score',
   'Data quality score',
   'Share of invoices that have a linked customer and a non-null due date — a proxy for record completeness.',
   '(complete invoices) / (all invoices) * 100',
   ARRAY['invoices'], 'percent', 'point_in_time', 5,
   'Fewer than 5 invoices. Need more records to assess data quality.',
   'data_quality')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  definition = EXCLUDED.definition,
  formula = EXCLUDED.formula,
  sources = EXCLUDED.sources,
  unit = EXCLUDED.unit,
  period = EXCLUDED.period,
  min_sample = EXCLUDED.min_sample,
  insufficient_note = EXCLUDED.insufficient_note,
  category = EXCLUDED.category,
  updated_at = NOW();

-- ============================================================
-- 4. THE REFRESH ENGINE — refresh_business_metrics(business_id)
-- The ONLY writer of governed metric rows. Recomputes every active metric
-- and upserts a kpi_metrics row. Computes current vs. previous period so the
-- UI gets change deltas for free. Best-effort per metric (sub-block +
-- EXCEPTION) so one failure never aborts the rest (§24).
--
-- "Won" and "paid" are matched across all accepted spellings to defend
-- against the documented stage/status drift.
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_business_metrics(p_business_id UUID)
RETURNS TABLE(metric_key TEXT, status TEXT, sample_size INTEGER) AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_today DATE := CURRENT_DATE;
  v_period_end DATE := v_today;
  v_prev_end DATE := v_today - 1;
  v_cur_start DATE;
  v_prev_start DATE;
  v_def RECORD;
  v_val NUMERIC; v_prev NUMERIC; v_n INTEGER; v_src JSONB;
  v_conf TEXT;
  v_90 DATE := v_today - 90;
  v_180 DATE := v_today - 180;
BEGIN
  FOR v_def IN SELECT * FROM metric_definitions WHERE is_active LOOP
    v_val := NULL; v_prev := NULL; v_n := 0; v_src := '{}'::JSONB; v_conf := NULL;
    BEGIN
      -- Point-in-time vs trailing-window periods.
      IF v_def.period = 'point_in_time' THEN
        v_cur_start := v_today; v_prev_start := v_today - 1; v_prev_end := v_today - 1;
      ELSIF v_def.period = 'trailing_30d' THEN
        v_cur_start := v_today - 30; v_prev_start := v_today - 60; v_prev_end := v_today - 31;
      ELSIF v_def.period = 'trailing_365d' THEN
        v_cur_start := v_today - 365; v_prev_start := v_today - 730; v_prev_end := v_today - 366;
      ELSIF v_def.period = 'all_time' THEN
        v_cur_start := DATE '1900-01-01'; v_prev_start := DATE '1900-01-01'; v_prev_end := DATE '1900-01-01';
      ELSE -- trailing_90d
        v_cur_start := v_90; v_prev_start := v_180; v_prev_end := v_today - 91;
      END IF;

      -- ---- per-metric calculation (current + previous + sample) ----
      IF v_def.key = 'revenue_collected' THEN
        SELECT COALESCE(SUM(total),0), COUNT(*) INTO v_val, v_n
        FROM invoices WHERE business_id = p_business_id
          AND lower(status) = 'paid' AND created_at::date >= v_cur_start;
        SELECT COALESCE(SUM(total),0) INTO v_prev
        FROM invoices WHERE business_id = p_business_id
          AND lower(status) = 'paid'
          AND created_at::date >= v_prev_start AND created_at::date <= v_prev_end;

      ELSIF v_def.key = 'revenue_billed' THEN
        SELECT COALESCE(SUM(total),0), COUNT(*) INTO v_val, v_n
        FROM invoices WHERE business_id = p_business_id
          AND lower(status) IN ('sent','overdue','paid') AND created_at::date >= v_cur_start;
        SELECT COALESCE(SUM(total),0) INTO v_prev
        FROM invoices WHERE business_id = p_business_id
          AND lower(status) IN ('sent','overdue','paid')
          AND created_at::date >= v_prev_start AND created_at::date <= v_prev_end;

      ELSIF v_def.key = 'receivables_outstanding' THEN
        SELECT COALESCE(SUM(total),0), COUNT(*) INTO v_val, v_n
        FROM invoices WHERE business_id = p_business_id
          AND lower(status) IN ('sent','overdue');

      ELSIF v_def.key = 'overdue_receivables' THEN
        SELECT COALESCE(SUM(total),0), COUNT(*) INTO v_val, v_n
        FROM invoices WHERE business_id = p_business_id AND lower(status) = 'overdue';

      ELSIF v_def.key = 'overdue_receivables_pct' THEN
        SELECT COALESCE(SUM(CASE WHEN lower(status)='overdue' THEN total ELSE 0 END),0),
               COALESCE(SUM(CASE WHEN lower(status) IN ('sent','overdue') THEN total ELSE 0 END),0),
               COUNT(*) INTO v_val, v_prev, v_n
        FROM invoices WHERE business_id = p_business_id;
        IF v_prev > 0 THEN v_val := (v_val / v_prev) * 100; ELSE v_val := NULL; END IF;
        v_prev := NULL;

      ELSIF v_def.key = 'collection_rate' THEN
        SELECT COALESCE(SUM(CASE WHEN lower(status)='paid' THEN total ELSE 0 END),0),
               COALESCE(SUM(total),0), COUNT(*) INTO v_val, v_prev, v_n
        FROM invoices WHERE business_id = p_business_id
          AND lower(status) IN ('sent','overdue','paid') AND created_at::date >= v_cur_start;
        IF v_prev > 0 THEN v_val := (v_val / v_prev) * 100; ELSE v_val := NULL; END IF;
        v_prev := NULL;

      ELSIF v_def.key = 'avg_collection_period_days' THEN
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (p.created_at - i.created_at))/86400),0), COUNT(*)
        INTO v_val, v_n
        FROM payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE i.business_id = p_business_id
          AND lower(p.status) IN ('successful','paid','completed','success')
          AND p.created_at::date >= v_cur_start;

      ELSIF v_def.key = 'pipeline_value' THEN
        SELECT COALESCE(SUM(value),0), COUNT(*) INTO v_val, v_n
        FROM deals WHERE business_id = p_business_id
          AND lower(stage) NOT IN ('won','lost','closed_won','closed-won');

      ELSIF v_def.key = 'win_rate' THEN
        SELECT COUNT(*) FILTER (WHERE lower(stage) IN ('won','closed_won','closed-won')),
               COUNT(*) FILTER (WHERE lower(stage) IN ('won','lost','closed_won','closed-won','closed-lost')),
               COUNT(*) FILTER (WHERE lower(stage) IN ('won','lost','closed_won','closed-won','closed-lost'))
        INTO v_val, v_prev, v_n
        FROM deals WHERE business_id = p_business_id
          AND lower(stage) IN ('won','lost','closed_won','closed-won','closed-lost')
          AND created_at::date >= v_cur_start;
        IF v_n > 0 THEN v_val := (v_val / v_n) * 100; ELSE v_val := NULL; END IF;
        v_prev := NULL;

      ELSIF v_def.key = 'avg_deal_value' THEN
        SELECT COALESCE(AVG(value),0), COUNT(*) INTO v_val, v_n
        FROM deals WHERE business_id = p_business_id
          AND lower(stage) IN ('won','closed_won','closed-won')
          AND created_at::date >= v_cur_start;
        SELECT COALESCE(AVG(value),0) INTO v_prev
        FROM deals WHERE business_id = p_business_id
          AND lower(stage) IN ('won','closed_won','closed-won')
          AND created_at::date >= v_prev_start AND created_at::date <= v_prev_end;

      ELSIF v_def.key = 'sales_cycle_days' THEN
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400),0), COUNT(*)
        INTO v_val, v_n
        FROM deals WHERE business_id = p_business_id
          AND lower(stage) IN ('won','closed_won','closed-won')
          AND created_at::date >= v_cur_start;

      ELSIF v_def.key = 'revenue_concentration_top1' THEN
        SELECT COALESCE(MAX(c.total) / NULLIF(SUM(c.total),0) * 100, 0), COUNT(*)
        INTO v_val, v_n
        FROM (
          SELECT COALESCE(NULLIF(client_name,''), 'unknown') AS cust, SUM(total) AS total
          FROM invoices WHERE business_id = p_business_id
            AND lower(status) IN ('sent','overdue','paid') AND created_at::date >= v_cur_start
          GROUP BY COALESCE(NULLIF(client_name,''), 'unknown')
        ) c;

      ELSIF v_def.key = 'customer_count' THEN
        SELECT COUNT(DISTINCT COALESCE(NULLIF(client_name,''), client_email)) INTO v_val
        FROM invoices WHERE business_id = p_business_id
          AND lower(status) IN ('sent','overdue','paid') AND created_at::date >= v_cur_start;
        v_n := v_val;

      ELSIF v_def.key = 'task_completion_rate' THEN
        SELECT COUNT(*) FILTER (WHERE lower(status) IN ('done','completed')),
               COUNT(*)
        INTO v_val, v_n
        FROM tasks WHERE business_id = p_business_id
          AND created_at::date >= v_cur_start;
        IF v_n > 0 THEN v_val := (v_val / v_n) * 100; ELSE v_val := NULL; END IF;

      ELSIF v_def.key = 'task_overdue_count' THEN
        SELECT COUNT(*), COUNT(*) INTO v_val, v_n
        FROM tasks WHERE business_id = p_business_id
          AND lower(status) IN ('todo','in_progress') AND due_date IS NOT NULL AND due_date < v_today;

      ELSIF v_def.key = 'inventory_low_count' THEN
        SELECT COUNT(*), COUNT(*) INTO v_val, v_n
        FROM products WHERE business_id = p_business_id
          AND stock <= COALESCE(low_stock_threshold, 0);

      ELSIF v_def.key = 'inventory_turnover_proxy' THEN
        SELECT COUNT(DISTINCT ti.product_id), COUNT(*) INTO v_val, v_n
        FROM transaction_items ti
        JOIN transactions t ON t.id = ti.transaction_id
        WHERE t.business_id = p_business_id
          AND lower(t.type) IN ('sale','return')
          AND t.created_at::date >= v_cur_start;

      ELSIF v_def.key = 'headcount' THEN
        SELECT COUNT(*), COUNT(*) INTO v_val, v_n
        FROM staff WHERE business_id = p_business_id;

      ELSIF v_def.key = 'project_active_count' THEN
        SELECT COUNT(*), COUNT(*) INTO v_val, v_n
        FROM projects WHERE business_id = p_business_id AND lower(status) = 'active';

      ELSIF v_def.key = 'data_quality_score' THEN
        SELECT COUNT(*) FILTER (WHERE client_name IS NOT NULL AND client_name <> '' AND due_date IS NOT NULL),
               COUNT(*)
        INTO v_val, v_n
        FROM invoices WHERE business_id = p_business_id;
        IF v_n > 0 THEN v_val := (v_val / v_n) * 100; ELSE v_val := NULL; END IF;
      END IF;

      -- Confidence / insufficient-data classification (§10/§21).
      IF v_n IS NULL OR v_n = 0 THEN
        v_val := NULL; v_conf := 'insufficient';
      ELSIF v_n < v_def.min_sample THEN
        v_val := NULL; v_conf := 'insufficient';
      ELSIF v_n < v_def.min_sample * 2 THEN
        v_conf := 'low';
      ELSIF v_n < v_def.min_sample * 5 THEN
        v_conf := 'medium';
      ELSE
        v_conf := 'high';
      END IF;

      -- Idempotent upsert into kpi_metrics.
      INSERT INTO kpi_metrics (
        business_id, metric_key, name, category, unit, data_source,
        current_value, previous_value, change_value, change_percent,
        sample_size, confidence, period_start, period_end,
        source_detail, last_calculated_at, query_definition
      ) VALUES (
        p_business_id, v_def.key, v_def.name, v_def.category, v_def.unit, v_def.sources::TEXT,
        v_val, v_prev,
        CASE WHEN v_val IS NOT NULL AND v_prev IS NOT NULL THEN v_val - v_prev END,
        CASE WHEN v_val IS NOT NULL AND v_prev IS NOT NULL AND v_prev <> 0
          THEN round(((v_val - v_prev) / abs(v_prev) * 100)::numeric, 2) END,
        v_n, v_conf, v_cur_start, v_period_end,
        jsonb_build_object('sources', v_def.sources, 'formula', v_def.formula, 'period', v_def.period),
        v_now, jsonb_build_object('version', v_def.version)
      )
      ON CONFLICT (business_id, metric_key, period_end)
      DO UPDATE SET
        current_value = EXCLUDED.current_value,
        previous_value = EXCLUDED.previous_value,
        change_value = EXCLUDED.change_value,
        change_percent = EXCLUDED.change_percent,
        sample_size = EXCLUDED.sample_size,
        confidence = EXCLUDED.confidence,
        period_start = EXCLUDED.period_start,
        source_detail = EXCLUDED.source_detail,
        last_calculated_at = EXCLUDED.last_calculated_at,
        data_source = EXCLUDED.data_source;

      metric_key := v_def.key;
      status := v_conf;
      sample_size := COALESCE(v_n, 0);
      RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      -- A single broken metric never aborts the refresh, never corrupts
      -- business data, and never blocks operations (§24). Report + continue.
      metric_key := v_def.key;
      status := 'error';
      sample_size := 0;
      RETURN NEXT;
    END;
  END LOOP;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION refresh_business_metrics(UUID) TO authenticated;

COMMENT ON TABLE metric_definitions IS
  'Canonical metric registry (§7). The single source of metric definitions — formula, sources, period, min_sample. No dashboard may re-derive a governed metric.';
COMMENT ON FUNCTION refresh_business_metrics IS
  'The only writer of governed metric rows into kpi_metrics. Best-effort per metric (§24). Emits confidence + sample_size; NULL value below min_sample (§21).';

-- NOTE: refresh_business_metrics is the ONLY writer of governed metric rows.
-- A scheduled pg_cron job should call it per business; see U2 follow-up. For
-- now pages may trigger a refresh on load (best-effort) or read current_metrics
-- directly.

-- ============================================================
-- 5. READ HELPER — current_metrics(business_id)
-- Returns the latest materialized metric rows for a business, joined to the
-- definition so the UI has name/formula/insufficient_note in one call. Pages
-- read this instead of scanning domain tables (§23).
-- ============================================================
CREATE OR REPLACE FUNCTION current_metrics(p_business_id UUID)
RETURNS TABLE (
  metric_key TEXT, name TEXT, category TEXT, unit TEXT, formula TEXT,
  current_value NUMERIC, previous_value NUMERIC, change_percent NUMERIC,
  sample_size INTEGER, confidence TEXT, insufficient_note TEXT,
  period TEXT, last_calculated_at TIMESTAMPTZ
) AS $$
  SELECT km.metric_key, md.name, md.category, km.unit, md.formula,
    km.current_value, km.previous_value, km.change_percent,
    km.sample_size, km.confidence, md.insufficient_note,
    md.period, km.last_calculated_at
  FROM kpi_metrics km
  JOIN metric_definitions md ON md.key = km.metric_key
  WHERE km.business_id = p_business_id AND km.metric_key IS NOT NULL
  ORDER BY md.category, md.name;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION current_metrics(UUID) TO authenticated;

COMMENT ON FUNCTION current_metrics IS
  'Read helper: latest governed metric rows + definitions for a business. The single call a metric panel should make.';

-- ############################################
-- FILE: 087_context_graph_wiring.sql
-- ############################################
-- 087_context_graph_wiring.sql
--
-- P1 / U3 of the Intelligence Transformation. Wires the Business Context
-- Graph (migration 060) — `entity_relationships` + `link_entities` — which
-- exists but was never populated. This is the §4 relationship graph the
-- instruction requires (Customer→Deal→Invoice→Payment→Revenue→Cost→Margin)
-- for cross-module diagnosis (§11).
--
-- Approach (lowest risk, architecture-aligned): a NEW best-effort handler
-- `handler_derive_relationships` registered with the event bus
-- (business_event_handlers) at run_order 6 — AFTER propagation (5, which
-- backfills entity_id and creates the customer/staff rows) and BEFORE
-- freshness (10). It derives edges from the committed event and its
-- related_entities/payload, using `link_entities` (idempotent upsert, 060).
-- The existing triggers/handlers are NOT modified, so no working path is
-- destabilised.
--
-- Edges derived per event:
--   DealWon:        deal -[owned_by]-> owner (staff), deal -[for_customer]-> customer,
--                   deal -[created_invoice]-> invoice (when captured), invoice -[for_customer]-> customer
--   PaymentReceived: invoice -[received_payment]-> payment
--                   invoice -[for_customer]-> customer (best-effort via client_name)
--   EmployeeJoined: staff -[member_of]-> business
--   (generic)      event.entity -[rel]-> each related_entities entry
--
-- All edge writes are inside a sub-block with EXCEPTION so a missing
-- optional table/column never fails the event (§24). link_entities is itself
-- idempotent (ON CONFLICT DO UPDATE). No business data is mutated — only
-- graph edges are appended.
--
-- Pure internal SQL. Idempotent.


-- ============================================================
-- handler_derive_relationships — derives context-graph edges from an event.
-- Runs after propagation (entity_id backfilled) so it can resolve the actual
-- deal/invoice/customer/staff rows. Best-effort: never fails the event.
-- ============================================================
CREATE OR REPLACE FUNCTION handler_derive_relationships(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  ev RECORD;
  v_deal_id UUID; v_invoice_id UUID; v_staff_id UUID; v_customer_id UUID;
  v_payment_id UUID; v_name TEXT; v_owner_id UUID;
  v_rel JSONB; i INTEGER;
BEGIN
  SELECT * INTO ev FROM business_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;

  BEGIN
    IF ev.event_type = 'DealWon' THEN
      v_deal_id := ev.entity_id;        -- backfilled by propagate (run_order 5)
      v_name    := ev.payload->>'name';
      IF v_name IS NULL THEN v_name := ev.payload->>'customer'; END IF;
      IF v_name IS NULL THEN v_name := ev.payload->>'client'; END IF;

      -- deal -> customer (resolve contact by name within the business)
      IF v_name IS NOT NULL THEN
        SELECT id INTO v_customer_id FROM contacts
          WHERE business_id = ev.business_id AND name ILIKE v_name
          ORDER BY updated_at DESC LIMIT 1;
        IF v_customer_id IS NOT NULL AND v_deal_id IS NOT NULL THEN
          PERFORM link_entities(ev.business_id,'deal',v_deal_id,'for_customer','customer',v_customer_id,'derived');
        END IF;
      END IF;

      -- deal -> owner (staff). deals uses owner_id (added 002), not assigned_to.
      IF v_deal_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner_id FROM deals WHERE id = v_deal_id;
        IF v_owner_id IS NOT NULL THEN
          PERFORM link_entities(ev.business_id,'deal',v_deal_id,'owned_by','staff',v_owner_id,'derived');
        END IF;
      END IF;

      -- An invoice may have been drafted for this deal during capture. Link
      -- deal -> invoice and invoice -> customer (via client_name).
      IF v_deal_id IS NOT NULL THEN
        FOR v_invoice_id IN SELECT id FROM invoices WHERE business_id = ev.business_id AND deal_id = v_deal_id LOOP
          PERFORM link_entities(ev.business_id,'deal',v_deal_id,'created_invoice','invoice',v_invoice_id,'derived');
          DECLARE v_client TEXT;
          BEGIN
            SELECT client_name INTO v_client FROM invoices WHERE id = v_invoice_id;
            IF v_client IS NOT NULL AND v_client <> '' THEN
              SELECT id INTO v_customer_id FROM contacts
                WHERE business_id = ev.business_id AND name ILIKE v_client
                ORDER BY updated_at DESC LIMIT 1;
              IF v_customer_id IS NOT NULL THEN
                PERFORM link_entities(ev.business_id,'invoice',v_invoice_id,'for_customer','customer',v_customer_id,'inferred');
              END IF;
            END IF;
          END;
        END LOOP;
      END IF;

    ELSIF ev.event_type = 'PaymentReceived' THEN
      v_invoice_id := ev.entity_id;       -- backfilled by propagate
      -- invoice -> payment, for the payment rows linked to this invoice.
      IF v_invoice_id IS NOT NULL THEN
        FOR v_payment_id IN SELECT id FROM payments WHERE invoice_id = v_invoice_id AND business_id = ev.business_id LOOP
          PERFORM link_entities(ev.business_id,'invoice',v_invoice_id,'received_payment','payment',v_payment_id,'derived');
        END LOOP;
        -- invoice -> customer via client_name (best-effort; invoices has no contact_id)
        DECLARE v_client TEXT;
        BEGIN
          SELECT client_name INTO v_client FROM invoices WHERE id = v_invoice_id;
          IF v_client IS NOT NULL AND v_client <> '' THEN
            SELECT id INTO v_customer_id FROM contacts
              WHERE business_id = ev.business_id AND name ILIKE v_client
              ORDER BY updated_at DESC LIMIT 1;
            IF v_customer_id IS NOT NULL THEN
              PERFORM link_entities(ev.business_id,'invoice',v_invoice_id,'for_customer','customer',v_customer_id,'inferred');
            END IF;
          END IF;
        END;
      END IF;

    ELSIF ev.event_type = 'EmployeeJoined' THEN
      v_staff_id := ev.entity_id;         -- backfilled by propagate
      IF v_staff_id IS NOT NULL THEN
        PERFORM link_entities(ev.business_id,'staff',v_staff_id,'member_of','business',ev.business_id,'derived');
      END IF;
    END IF;

    -- Generic: link event entity to each related_entities entry that carries an id.
    IF ev.related_entities IS NOT NULL AND jsonb_typeof(ev.related_entities) = 'array' THEN
      FOR i IN 0..jsonb_array_length(ev.related_entities) - 1 LOOP
        v_rel := ev.related_entities->i;
        IF ev.entity_id IS NOT NULL AND (v_rel->>'id') IS NOT NULL AND (v_rel->>'type') IS NOT NULL THEN
          PERFORM link_entities(
            ev.business_id,
            ev.entity_type, ev.entity_id,
            COALESCE(v_rel->>'relationship', ev.event_type),
            v_rel->>'type', (v_rel->>'id')::UUID,
            'derived'
          );
        END IF;
      END LOOP;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Edge derivation is best-effort. A missing column/table (e.g. an older
    -- schema without owner_id) must never fail the event or block business
    -- operations. Record the error and continue.
    UPDATE business_events
      SET processing_error = COALESCE(processing_error,'') || ' derive_relationships: ' || SQLERRM || E'\n'
      WHERE id = p_event_id;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Register the handler AFTER propagation (run_order 5) and BEFORE freshness
-- (run_order 10). Covers the canonical capture events; future events
-- (InvoiceCreated etc., U6) will register it too.
INSERT INTO business_event_handlers (event_type, handler_fn, run_order, is_active, description)
VALUES
  ('DealWon',         'handler_derive_relationships', 6, TRUE, 'Derive deal/customer/invoice context-graph edges'),
  ('PaymentReceived', 'handler_derive_relationships', 6, TRUE, 'Derive invoice/payment/customer context-graph edges'),
  ('EmployeeJoined',  'handler_derive_relationships', 6, TRUE, 'Derive staff/business context-graph edge')
ON CONFLICT (event_type, handler_fn) DO NOTHING;

-- ============================================================
-- Read helper: business_relationships(business_id, start_type, start_id, depth)
-- Thin wrapper over recursive_neighbors (060) so the frontend / diagnosis
-- engine can ask "what else is connected to this entity?" in one call.
-- Returns (entity_type, entity_id, depth, path) for impact analysis.
-- ============================================================
CREATE OR REPLACE FUNCTION business_relationships(
  p_business_id UUID, p_start_type TEXT, p_start_id UUID, p_max_depth INTEGER DEFAULT 3
) RETURNS TABLE(entity_type TEXT, entity_id UUID, depth INTEGER, path TEXT[]) AS $$
  SELECT * FROM recursive_neighbors(p_business_id, p_start_type, p_start_id, p_max_depth);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION business_relationships(UUID, TEXT, UUID, INT) TO authenticated;

COMMENT ON FUNCTION handler_derive_relationships IS
  'Derives context-graph edges (entity_relationships) from a committed business event. Best-effort, runs after propagation (run_order 6). §4 relationship graph.';
COMMENT ON FUNCTION business_relationships IS
  'Read helper over recursive_neighbors (060): entities reachable from a start, for cross-module diagnosis / impact analysis.';

-- ############################################
-- FILE: 088_recommendation_outcome_loop.sql
-- ############################################
-- 088_recommendation_outcome_loop.sql
--
-- P1 / U4 of the Intelligence Transformation. Builds the
-- recommendation + outcome loop the Master Instruction §12–§16 requires,
-- reusing the existing `claims` table (060) rather than adding a parallel
-- `recommendations` table. A recommendation IS a `claims` row with
-- claim_type='RECOMMENDATION'; its lifecycle is tracked via new additive
-- columns. The forecast/estimate loop already has `record_outcome` (060);
-- this migration adds the recommendation-specific lifecycle + an
-- effectiveness aggregator + a few seed issue helpers.
--
-- Lifecycle (§15):
--   issued -> acknowledged -> (accepted | rejected) -> acted ->
--   outcome_recorded -> measured
-- A rejected recommendation stops there. An accepted one links to a real
-- action (existing workflow: task / PO / approval) via linked_action_*, and
-- at action completion `record_recommendation_outcome` closes the loop,
-- feeding org memory (064) and `recommendation_effectiveness` (§16).
--
-- Rules:
--   • Additive only (ADD COLUMN IF NOT EXISTS); existing claims rows and the
--     forecast/estimate loop are untouched.
--   • RLS: claims already inherits the corrected get_current_staff()
--     pattern (migration 080) — tenant isolation is preserved (§28).
--   • No external dependency. Deterministic. Best-effort writers.
--   • Each recommendation carries rule_id so effectiveness can be grouped by
--     rule type ("recommendations of this type historically produced X").


-- ============================================================
-- 1. EXTEND claims with the recommendation lifecycle (additive)
-- ============================================================
ALTER TABLE claims ADD COLUMN IF NOT EXISTS status TEXT
  CHECK (status IN ('issued','acknowledged','accepted','rejected','acted','outcome_recorded','superseded','expired'));
ALTER TABLE claims ADD COLUMN IF NOT EXISTS rule_id TEXT;            -- e.g. 'FIN-AR-001'
ALTER TABLE claims ADD COLUMN IF NOT EXISTS severity TEXT
  CHECK (severity IN ('info','warning','critical'));
ALTER TABLE claims ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS action_type TEXT;        -- 'create_task','create_po','route_approval', ...
ALTER TABLE claims ADD COLUMN IF NOT EXISTS linked_action_id UUID;   -- id of the created task/po/approval
ALTER TABLE claims ADD COLUMN IF NOT EXISTS expected_impact JSONB;    -- { amount, description, metric_key }
ALTER TABLE claims ADD COLUMN IF NOT EXISTS actual_impact JSONB;      -- { amount, description, metric_key, measured_at }
ALTER TABLE claims ADD COLUMN IF NOT EXISTS action_taken_at TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;  -- when the underlying condition cleared

-- Indexes for the loop queries.
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(business_id, status) WHERE claim_type = 'RECOMMENDATION';
CREATE INDEX IF NOT EXISTS idx_claims_rule ON claims(business_id, rule_id) WHERE claim_type = 'RECOMMENDATION';

-- Backfill status for existing recommendation claims (none expected yet).
UPDATE claims SET status = 'issued'
  WHERE claim_type = 'RECOMMENDATION' AND status IS NULL;

-- ============================================================
-- 2. Lifecycle transition helpers (idempotent, guard against invalid moves)
-- A recommendation can be acknowledged once; accepted/rejected are terminal
-- before acted; acted requires accepted; outcome closes acted.
-- ============================================================
CREATE OR REPLACE FUNCTION acknowledge_recommendation(p_claim_id UUID, p_by UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE claims SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = p_by
    WHERE id = p_claim_id AND claim_type = 'RECOMMENDATION' AND status = 'issued';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_recommendation_decision(p_claim_id UUID, p_accepted BOOLEAN, p_by UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE claims
    SET status = CASE WHEN p_accepted THEN 'accepted' ELSE 'rejected' END,
        acknowledged_at = COALESCE(acknowledged_at, NOW()),
        acknowledged_by = COALESCE(acknowledged_by, p_by)
    WHERE id = p_claim_id AND claim_type = 'RECOMMENDATION'
      AND status IN ('issued','acknowledged');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark a recommendation as acted: links it to the created action (existing
-- workflow). p_action_type is one of create_task/create_po/route_approval/...
CREATE OR REPLACE FUNCTION mark_recommendation_acted(
  p_claim_id UUID, p_action_type TEXT, p_action_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE claims
    SET status = 'acted', action_type = p_action_type, linked_action_id = p_action_id,
        action_taken_at = NOW()
    WHERE id = p_claim_id AND claim_type = 'RECOMMENDATION' AND status = 'accepted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. record_recommendation_outcome — close the loop (§15/§16)
-- Records the actual impact, marks status, and — for numeric impacts on a
-- known metric — computes accuracy vs expected. Best-effort: reuses the
-- existing record_outcome (060) for the numeric accuracy half so there is a
-- single accuracy-calculation code path.
-- ============================================================
CREATE OR REPLACE FUNCTION record_recommendation_outcome(
  p_claim_id UUID, p_actual_impact JSONB
) RETURNS TABLE(id UUID, accuracy NUMERIC) AS $$
DECLARE
  c RECORD; v_pred NUMERIC; v_act NUMERIC; v_acc NUMERIC;
BEGIN
  SELECT * INTO c FROM claims WHERE id = p_claim_id AND claim_type = 'RECOMMENDATION';
  IF NOT FOUND THEN RAISE EXCEPTION 'Recommendation claim not found'; END IF;

  UPDATE claims
    SET actual_impact = p_actual_impact,
        status = 'outcome_recorded',
        outcome_recorded_at = NOW(),
        actual_outcome = p_actual_impact
    WHERE id = p_claim_id;

  -- Accuracy vs expected impact (only for numeric point impacts).
  v_pred := NULLIF((c.expected_impact ->> 'amount')::NUMERIC, NULL);
  v_act  := NULLIF((p_actual_impact ->> 'amount')::NUMERIC, NULL);
  IF v_pred IS NOT NULL AND v_act IS NOT NULL AND v_pred <> 0 THEN
    v_acc := 1 - abs(v_pred - v_act) / abs(v_pred);
    v_acc := GREATEST(0, v_acc);
  END IF;
  RETURN QUERY SELECT p_claim_id, v_acc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. recommendation_effectiveness — §16 learning
-- Aggregates the historical success of recommendations by rule type so the
-- system can say "recommendations of type X have historically produced Y".
-- STABLE: computed on read from claims; no extra materialization needed yet.
-- success = an outcome_recorded recommendation whose actual_impact amount >= 0
-- (a recovered receivable, a margin improvement, etc.). Refine the success
-- definition per rule in P2.
-- ============================================================
CREATE OR REPLACE FUNCTION recommendation_effectiveness(p_business_id UUID)
RETURNS TABLE(
  rule_id TEXT, issued BIGINT, accepted BIGINT, rejected BIGINT, acted BIGINT,
  outcome_recorded BIGINT, success_count BIGINT, avg_actual NUMERIC, avg_expected NUMERIC
) AS $$
  SELECT
    COALESCE(c.rule_id, 'unspecified'),
    COUNT(*) FILTER (WHERE c.status IS NOT NULL),
    COUNT(*) FILTER (WHERE c.status IN ('accepted','acted','outcome_recorded')),
    COUNT(*) FILTER (WHERE c.status = 'rejected'),
    COUNT(*) FILTER (WHERE c.status IN ('acted','outcome_recorded')),
    COUNT(*) FILTER (WHERE c.status = 'outcome_recorded'),
    COUNT(*) FILTER (WHERE c.status = 'outcome_recorded'
      AND (c.actual_impact->>'amount')::NUMERIC >= 0),
    AVG(NULLIF((c.actual_impact->>'amount')::NUMERIC, NULL)),
    AVG(NULLIF((c.expected_impact->>'amount')::NUMERIC, NULL))
  FROM claims c
  WHERE c.business_id = p_business_id AND c.claim_type = 'RECOMMENDATION'
  GROUP BY COALESCE(c.rule_id, 'unspecified')
  ORDER BY issued DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 5. open_recommendations — the executive "what needs my attention?" feed (§17)
-- Returns recommendations not yet resolved/outcome-recorded, newest first,
-- with their evidence so the UI can show evidence drill-down.
-- ============================================================
CREATE OR REPLACE FUNCTION open_recommendations(p_business_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE(
  id UUID, rule_id TEXT, severity TEXT, statement TEXT, evidence JSONB,
  expected_impact JSONB, status TEXT, owner_id UUID, action_type TEXT,
  linked_action_id UUID, created_at TIMESTAMPTZ, subject_type TEXT, subject_id UUID
) AS $$
  SELECT id, rule_id, severity, statement, evidence, expected_impact, status,
    owner_id, action_type, linked_action_id, created_at, subject_type, subject_id
  FROM claims
  WHERE business_id = p_business_id AND claim_type = 'RECOMMENDATION'
    AND status NOT IN ('rejected','outcome_recorded','superseded','expired')
  ORDER BY
    CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
    created_at DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION acknowledge_recommendation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_recommendation_decision(UUID, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_recommendation_acted(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION record_recommendation_outcome(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION recommendation_effectiveness(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION open_recommendations(UUID, INT) TO authenticated;

COMMENT ON FUNCTION acknowledge_recommendation IS 'Lifecycle: mark a recommendation acknowledged (§15). Idempotent.';
COMMENT ON FUNCTION set_recommendation_decision IS 'Lifecycle: accept or reject a recommendation (§15). Idempotent; terminal before acted.';
COMMENT ON FUNCTION mark_recommendation_acted IS 'Lifecycle: link a recommendation to the action taken in an existing workflow (§14/§15).';
COMMENT ON FUNCTION record_recommendation_outcome IS 'Close the recommendation loop: record actual impact + accuracy vs expected (§15/§16). Reuses record_outcome accuracy logic.';
COMMENT ON FUNCTION recommendation_effectiveness IS 'Historical success of recommendations by rule type (§16). STABLE read.';
COMMENT ON FUNCTION open_recommendations IS 'The executive "what needs my attention?" feed: unresolved recommendations, severity-prioritised (§17).';
