-- Objective Gap Analysis — the CEO constraint-check.
--
-- The directive's example: "The Board's 30% growth objective is currently
-- unlikely to be achieved. The primary constraint is enterprise pipeline,
-- which is 18% below the required level." This RPC computes that statement
-- deterministically from real deal data — no LLM, no fabricated thresholds
-- (§22). Every number is traceable:
--   * target         — from the objective's currency key_result (preferred,
--                      094) or target_value->>'revenue' (063). Without one,
--                      analysis is progress_only (honest, not guessed).
--   * won_in_period  — SUM(deals.value) stage='won' updated within the period.
--   * open_pipeline  — SUM(deals.value) in open stages (not won/lost).
--   * win_rate       — historical won/(won+lost), requires >= 5 closed deals
--                      (§21 small-data guard; NULL when insufficient).
--   * coverage       — open_pipeline / remaining_gap. Below 1 → the pipeline
--                      is the binding constraint BY CONSTRUCTION (not an
--                      arbitrary threshold).
--   * required_rate  — remaining_gap / open_pipeline: the conversion the
--                      pipeline must achieve. Above historical win_rate → the
--                      conversion is the binding constraint.
--   * projected      — won_in_period + open_pipeline × win_rate.
--
-- Status ladder: achieved / on_track / at_risk / unlikely / insufficient_data.

CREATE OR REPLACE FUNCTION public.objective_gap_analysis(p_objective_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_objective public.strategic_objectives;
  v_target NUMERIC;
  v_period_start DATE;
  v_period_end DATE;
  v_won NUMERIC;
  v_open NUMERIC;
  v_won_count INT;
  v_lost_count INT;
  v_closed_count INT;
  v_win_rate NUMERIC;
  v_remaining NUMERIC;
  v_coverage NUMERIC;
  v_required_rate NUMERIC;
  v_projected NUMERIC;
  v_elapsed NUMERIC;
  v_status TEXT;
  v_constraint TEXT;
  v_headline TEXT;
  v_target_source TEXT;
BEGIN
  SELECT * INTO v_objective FROM public.strategic_objectives WHERE id = p_objective_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'objective_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.get_current_staff() cs
    WHERE cs.business_id = v_objective.business_id
  ) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- Resolve the revenue target: currency key_result first (the 094 canonical
  -- measurement), then the legacy target_value JSONB (063).
  SELECT kr.target_value INTO v_target
  FROM public.key_results kr
  WHERE kr.objective_id = p_objective_id
    AND kr.unit = 'currency'
    AND kr.target_value > 0
  ORDER BY kr.target_value DESC
  LIMIT 1;

  v_target_source := CASE WHEN v_target IS NOT NULL THEN 'key_result' ELSE NULL END;

  IF v_target IS NULL
     AND v_objective.target_value IS NOT NULL
     AND (v_objective.target_value->>'revenue') IS NOT NULL
     AND (v_objective.target_value->>'revenue') ~ '^\d+(\.\d+)?$' THEN
    v_target := (v_objective.target_value->>'revenue')::NUMERIC;
    v_target_source := 'target_value';
  END IF;

  -- Non-revenue objective: honest progress-only analysis (no pipeline math
  -- against a target that isn't money).
  IF v_target IS NULL OR v_target <= 0 THEN
    RETURN jsonb_build_object(
      'authorized', true,
      'analysis_type', 'progress_only',
      'objective_id', v_objective.id,
      'title', v_objective.title,
      'progress', public.objective_progress(p_objective_id),
      'note', 'No revenue target on this objective — add a currency key result to unlock pipeline gap analysis.'
    );
  END IF;

  -- Period: explicit period wins, else due_date as the end with a 12-month
  -- lookback as the start. If neither exists, elapsed pacing is unknown
  -- (honest) but the pipeline math still runs against the target.
  v_period_start := v_objective.period_start;
  v_period_end := COALESCE(v_objective.period_end, v_objective.due_date);
  IF v_period_start IS NULL AND v_period_end IS NOT NULL THEN
    v_period_start := v_period_end - INTERVAL '12 months';
  END IF;

  SELECT COALESCE(SUM(d.value), 0), COUNT(*) INTO v_won, v_won_count
  FROM public.deals d
  WHERE d.business_id = v_objective.business_id
    AND d.stage = 'won'
    AND (v_period_start IS NULL OR d.updated_at::DATE >= v_period_start)
    AND (v_period_end IS NULL OR d.updated_at::DATE <= v_period_end);

  SELECT COALESCE(SUM(d.value), 0) INTO v_open
  FROM public.deals d
  WHERE d.business_id = v_objective.business_id
    AND d.stage NOT IN ('won', 'lost');

  SELECT COUNT(*) INTO v_lost_count
  FROM public.deals d
  WHERE d.business_id = v_objective.business_id
    AND d.stage = 'lost';

  v_closed_count := v_won_count + v_lost_count;
  -- §21 small-data guard: fewer than 5 closed deals → win rate unknown.
  v_win_rate := CASE WHEN v_closed_count >= 5
    THEN v_won_count::NUMERIC / v_closed_count
    ELSE NULL END;

  v_remaining := GREATEST(v_target - v_won, 0);
  v_coverage := CASE WHEN v_remaining > 0 THEN v_open / v_remaining ELSE NULL END;
  v_required_rate := CASE WHEN v_open > 0 THEN v_remaining / v_open ELSE NULL END;
  v_projected := CASE WHEN v_win_rate IS NOT NULL
    THEN v_won + v_open * v_win_rate
    ELSE NULL END;
  v_elapsed := CASE
    WHEN v_period_start IS NULL OR v_period_end IS NULL OR v_period_end <= v_period_start THEN NULL
    ELSE LEAST(1, GREATEST(0, (now()::DATE - v_period_start)::NUMERIC / (v_period_end - v_period_start)))
  END;

  -- Status ladder.
  v_status := CASE
    WHEN v_won >= v_target THEN 'achieved'
    WHEN v_win_rate IS NULL THEN 'insufficient_data'
    WHEN v_projected >= v_target THEN 'on_track'
    WHEN v_projected >= v_target * 0.8 THEN 'at_risk'
    ELSE 'unlikely'
  END;

  -- Binding constraint — derived, not threshold-judged:
  --   coverage < 1  → pipeline (there literally isn't enough to close the gap).
  --   required_rate > win_rate → conversion (enough pipeline, wrong rate).
  v_constraint := CASE
    WHEN v_status IN ('achieved') THEN NULL
    WHEN v_coverage IS NOT NULL AND v_coverage < 1 THEN 'pipeline'
    WHEN v_required_rate IS NOT NULL AND v_win_rate IS NOT NULL AND v_required_rate > v_win_rate THEN 'conversion'
    WHEN v_win_rate IS NULL THEN 'data'
    ELSE 'pacing'
  END;

  -- The deterministic headline — the directive's CEO sentence, composed from
  -- the real numbers only.
  v_headline := CASE
    WHEN v_status = 'achieved' THEN
      'Objective achieved — the target has been reached.'
    WHEN v_status = 'insufficient_data' THEN
      'Not enough deal history yet to project this objective (' || v_closed_count || ' closed deals, need 5). Keep closing deals and the projection will appear here.'
    WHEN v_status = 'on_track' THEN
      'This objective is on track — projected outcome meets the target.'
    WHEN v_constraint = 'pipeline' THEN
      'This objective is ' || v_status || ' to be achieved. The primary constraint is pipeline, which is '
      || ROUND((1 - v_coverage) * 100) || '% below the required level.'
    WHEN v_constraint = 'conversion' THEN
      'This objective is ' || v_status || ' to be achieved. The primary constraint is conversion: the pipeline must convert at '
      || ROUND(v_required_rate * 100) || '%, but the historical rate is ' || ROUND(v_win_rate * 100) || '%.'
    ELSE
      'This objective is ' || v_status || ' to be achieved on current pacing.'
  END;

  RETURN jsonb_build_object(
    'authorized', true,
    'analysis_type', 'revenue_gap',
    'objective_id', v_objective.id,
    'title', v_objective.title,
    'target', v_target,
    'target_source', v_target_source,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'elapsed_pct', CASE WHEN v_elapsed IS NULL THEN NULL ELSE ROUND(v_elapsed * 100) END,
    'won_in_period', v_won,
    'remaining_gap', v_remaining,
    'open_pipeline', v_open,
    'pipeline_coverage', CASE WHEN v_coverage IS NULL THEN NULL ELSE ROUND(v_coverage, 2) END,
    'closed_deals', v_closed_count,
    'win_rate', CASE WHEN v_win_rate IS NULL THEN NULL ELSE ROUND(v_win_rate, 3) END,
    'required_win_rate', CASE WHEN v_required_rate IS NULL THEN NULL ELSE ROUND(v_required_rate, 3) END,
    'projected_outcome', CASE WHEN v_projected IS NULL THEN NULL ELSE ROUND(v_projected, 2) END,
    'status', v_status,
    'binding_constraint', v_constraint,
    'headline', v_headline
  );
END
$$;

REVOKE EXECUTE ON FUNCTION public.objective_gap_analysis(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.objective_gap_analysis(UUID) TO authenticated;

COMMENT ON FUNCTION public.objective_gap_analysis(UUID) IS
  'CEO constraint-check on an objective: target vs won vs open pipeline, historical win rate (>=5 closed deals, §21), projected outcome, binding constraint (pipeline/conversion), and a deterministic headline. Revenue targets only; progress_only otherwise. Members only. §22 — no fabricated numbers.';
