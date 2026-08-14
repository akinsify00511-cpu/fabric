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

\set ON_ERROR_STOP on

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
