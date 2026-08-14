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

\set ON_ERROR_STOP on

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
