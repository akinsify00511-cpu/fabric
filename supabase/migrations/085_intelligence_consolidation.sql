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

\set ON_ERROR_STOP on

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
