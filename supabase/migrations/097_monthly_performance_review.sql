-- 097_monthly_performance_review.sql
--
-- §26 Monthly Performance Review (MPR). A periodic executive review that
-- rolls up EVERYTHING the intelligence layer has produced into one reviewable
-- snapshot: Business Health (093) + OKR progress (094) + open Risks (095) +
-- open Recommendations (091/088) + governed metric movers (086) + data-quality
-- summary (089). This is the §17 "what needs my attention?" + §39 board-level
-- 5-questions artifact, materialized for a specific month.
--
-- §0/§6: NO new tables. This is a pure READ-ONLY aggregate over existing
-- tables/migrations — exactly the "understand the business" thesis. Every
-- number is FACT-level and traceable to a real table (§9/§19/§38).
--
-- §21: honest "insufficient data" — if a section has no data, it returns an
-- empty array / NULL score, never a fabricated number.
--
-- Pure internal SQL. Idempotent. No external dependency.

\set ON_ERROR_STOP on

-- ============================================================
-- monthly_review(business_id, period_start, period_end)
-- Returns a JSONB document: the full MPR snapshot for the window.
-- period_start/period_end bound the metric window; OKRs whose period overlaps
-- the window are included; health is the latest computed score; risks +
-- recommendations are the current open set (they're not historical yet).
-- ============================================================
CREATE OR REPLACE FUNCTION monthly_review(
  p_business_id UUID,
  p_period_start DATE DEFAULT date_trunc('month', NOW())::DATE,
  p_period_end DATE DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month - 1 day')::DATE
) RETURNS JSONB AS $$
DECLARE
  v_health JSONB;
  v_objectives JSONB;
  v_risks JSONB;
  v_recommendations JSONB;
  v_metrics JSONB;
  v_dq JSONB;
BEGIN
  -- 1. Business Health (latest computed score).
  SELECT to_jsonb(t) INTO v_health FROM (
    SELECT overall_score, dimension_scores, data_quality_penalty,
           insufficient_dimensions, computed_at
    FROM business_health_scores WHERE business_id = p_business_id
  ) t;

  -- 2. OKR progress — objectives whose period overlaps the window, with
  -- weighted KR progress via objective_progress().
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'title', o.title, 'scope', o.scope, 'status', o.status,
    'progress', objective_progress(o.id),
    'key_result_count', (SELECT count(*) FROM key_results WHERE objective_id = o.id),
    'owner_id', o.owner_id, 'period_end', o.period_end
  ) ORDER BY o.period_end NULLS LAST), '[]'::JSONB) INTO v_objectives
  FROM strategic_objectives o
  WHERE o.business_id = p_business_id
    AND o.level = 'objective'
    AND (o.period_end IS NULL OR o.period_end >= p_period_start)
    AND (o.period_start IS NULL OR o.period_start <= p_period_end);

  -- 3. Open risks — top by score.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'title', r.title, 'category', r.category,
    'risk_score', r.risk_score, 'status', r.status,
    'mitigation_status', r.mitigation_status, 'due_date', r.due_date
  ) ORDER BY r.risk_score DESC, r.due_date NULLS LAST), '[]'::JSONB) INTO v_risks
  FROM business_risks r
  WHERE r.business_id = p_business_id
    AND r.status NOT IN ('closed');

  -- 4. Open recommendations — top by severity.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'rule_id', c.rule_id, 'statement', c.statement,
    'severity', c.severity, 'status', c.status,
    'expected_impact', c.expected_impact, 'created_at', c.created_at
  ) ORDER BY
    CASE c.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2 ELSE 3 END,
    c.created_at DESC), '[]'::JSONB) INTO v_recommendations
  FROM claims c
  WHERE c.business_id = p_business_id
    AND c.claim_type = 'RECOMMENDATION'
    AND c.status NOT IN ('rejected','outcome_recorded','superseded','expired');

  -- 5. Governed metric movers — metrics in the window with change_percent.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metric_key', m.metric_key, 'name', m.name, 'category', m.category,
    'current_value', m.current_value, 'previous_value', m.previous_value,
    'change_percent', m.change_percent, 'confidence', m.confidence,
    'sample_size', m.sample_size, 'target_value', m.target_value,
    'period_end', m.period_end
  ) ORDER BY abs(COALESCE(m.change_percent, 0)) DESC), '[]'::JSONB) INTO v_metrics
  FROM kpi_metrics m
  WHERE m.business_id = p_business_id
    AND m.metric_key IS NOT NULL
    AND m.period_end >= p_period_start
    AND m.period_end <= p_period_end + INTERVAL '1 day';

  -- 6. Data-quality summary — counts by severity.
  SELECT to_jsonb(t) INTO v_dq FROM (
    SELECT
      count(*) FILTER (WHERE severity = 'critical' AND resolved = false) AS open_critical,
      count(*) FILTER (WHERE severity = 'warning' AND resolved = false) AS open_warning,
      count(*) FILTER (WHERE resolved = true) AS resolved_total
    FROM self_audit_findings
    WHERE business_id = p_business_id AND audit_dimension = 'data_quality'
  ) t;

  RETURN jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'generated_at', NOW(),
    'health', v_health,
    'objectives', v_objectives,
    'risks', v_risks,
    'recommendations', v_recommendations,
    'metrics', v_metrics,
    'data_quality', v_dq,
    -- Quick counts for the summary header.
    'summary', jsonb_build_object(
      'open_risks', jsonb_array_length(v_risks),
      'high_risks', count(*) FROM jsonb_array_elements(v_risks) x
        WHERE (x->>'risk_score')::int >= 15,
      'open_recommendations', jsonb_array_length(v_recommendations),
      'critical_recommendations', count(*) FROM jsonb_array_elements(v_recommendations) x
        WHERE x->>'severity' = 'critical',
      'objective_count', jsonb_array_length(v_objectives),
      'metric_count', jsonb_array_length(v_metrics)
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION monthly_review(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION monthly_review IS
  '§26 Monthly Performance Review — read-only roll-up of Business Health (093) + OKRs (094) + Risks (095) + Recommendations (091) + governed metrics (086) + data quality (089) for a month window. FACT-level, traceable, honest empty states. No new tables.';
