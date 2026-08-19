-- ============================================================================
-- THE AVENIZE BUSINESS BRAIN — State + Diagnosis + Next Best Action + Value Ledger
--
-- The directive (top-20 #4,#5,#6,#7,#9): turn the many features already built
-- into ONE coherent intelligent organism. The gap is NOT "add more features" —
-- it is the layer that reasons ACROSS modules: What is happening? Why? What
-- matters? What should I do? Did it work? How much value did it create?
--
-- This migration adds the four genuinely-missing engines. They CONSUME the
-- existing infrastructure (do not duplicate it):
--   • business_health_scores (093) — the Pulse
--   • kpi_metrics (019/086) — current_value, previous_value, change_percent
--   • claims / recommendations (060/088/091) — the recommendation + outcome loop
--   • business_events (058/059/090) — the event bus
--   • business_risks (095) — the risk register
--
-- All DETERMINISTIC (no LLM, §22). Symptom = FACT (measured). Cause = INFERENCE
-- (correlation, labelled as such). Never fabricates a number. Best-effort,
-- non-blocking (§24) — every engine degrades to an honest empty state.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BUSINESS STATE ENGINE (#4)
--
-- Classifies the business into one state: growing | stable | scaling | stressed
-- | recovering | at_risk | cash_constrained | sales_constrained |
-- capacity_constrained | operationally_constrained | opportunity_rich.
--
-- Derived from: overall health score, per-dimension scores, metric-level
-- change_percent (MoM trend), cash position, growth signals. The state
-- INFLUENCES what Avenize shows the user (the directive D).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.classify_business_state(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_health JSONB;
  v_overall INT;
  v_dims JSONB;
  v_fin_score INT; v_sales_score INT; v_cust_score INT; v_ops_score INT;
  v_people_score INT; v_proj_score INT;
  v_insufficient TEXT[];
  v_metrics JSONB;
  v_revenue_change NUMERIC;
  v_cash_change NUMERIC;
  v_expense_change NUMERIC;
  v_pipeline_change NUMERIC;
  v_overdue_change NUMERIC;
  v_state TEXT;
  v_reasons JSONB;
  v_confidence TEXT;
  v_signals JSONB;
BEGIN
  -- The Pulse (093). Best-effort: if unavailable, state is 'insufficient_data'.
  BEGIN
    v_health := current_business_health(p_business_id);
    v_overall := (v_health->>'overall_score')::INT;
    v_dims := COALESCE(v_health->'dimension_scores', '{}'::jsonb);
    v_insufficient := COALESCE((v_health->>'insufficient_dimensions')::TEXT[], ARRAY[]::TEXT[]);
  EXCEPTION WHEN OTHERS THEN
    v_overall := NULL;
  END;

  -- Per-dimension scores (NULL if the dimension is insufficient).
  v_fin_score   := NULLIF((v_dims->'financial'->>'score')::TEXT, '')::INT;
  v_sales_score := NULLIF((v_dims->'sales'->>'score')::TEXT, '')::INT;
  v_cust_score  := NULLIF((v_dims->'customers'->>'score')::TEXT, '')::INT;
  v_ops_score   := NULLIF((v_dims->'operations'->>'score')::TEXT, '')::INT;
  v_people_score:= NULLIF((v_dims->'people'->>'score')::TEXT, '')::INT;
  v_proj_score  := NULLIF((v_dims->'projects'->>'score')::TEXT, '')::INT;

  -- Metric-level MoM deltas (086 refresh_business_metrics writes change_percent).
  -- These are the TREND signals — the difference between "healthy" and
  -- "healthy but declining" / "stressed but recovering".
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_metrics
      FROM current_metrics(p_business_id) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_metrics := '[]'::jsonb;
  END;
  SELECT (m->>'change_percent')::NUMERIC INTO v_revenue_change
    FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = 'revenue';
  SELECT (m->>'change_percent')::NUMERIC INTO v_cash_change
    FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = 'cash_balance';
  SELECT (m->>'change_percent')::NUMERIC INTO v_expense_change
    FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = 'total_expenses';
  SELECT (m->>'change_percent')::NUMERIC INTO v_pipeline_change
    FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = 'pipeline_value';
  SELECT (m->>'change_percent')::NUMERIC INTO v_overdue_change
    FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = 'overdue_invoices';

  v_signals := jsonb_build_object(
    'overall_score', v_overall,
    'financial_score', v_fin_score, 'sales_score', v_sales_score,
    'customer_score', v_cust_score, 'operations_score', v_ops_score,
    'people_score', v_people_score, 'projects_score', v_proj_score,
    'revenue_change_pct', v_revenue_change,
    'cash_change_pct', v_cash_change,
    'expense_change_pct', v_expense_change,
    'pipeline_change_pct', v_pipeline_change,
    'overdue_change_pct', v_overdue_change
  );

  v_reasons := '[]'::jsonb;

  -- ---- The classifier (deterministic, priority-ordered) ----
  -- AT RISK: overall < 40. The business is in trouble.
  IF v_overall IS NOT NULL AND v_overall < 40 THEN
    v_state := 'at_risk';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Overall health is ' || v_overall || '/100',
      'evidence', 'FACT', 'detail', 'Below the 40-point at-risk threshold'));

  -- CASH CONSTRAINED: financial dimension is the weakest AND cash is declining.
  ELSIF v_fin_score IS NOT NULL AND v_fin_score < 50
        AND (v_cash_change IS NOT NULL AND v_cash_change < 0) THEN
    v_state := 'cash_constrained';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Financial health is ' || v_fin_score || '/100 and cash is down ' || ROUND(v_cash_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Cash position is the binding constraint'));

  -- SALES CONSTRAINED: sales dimension is the weakest AND revenue/pipeline declining.
  ELSIF v_sales_score IS NOT NULL AND v_sales_score < 50
        AND ((v_revenue_change IS NOT NULL AND v_revenue_change < 0)
             OR (v_pipeline_change IS NOT NULL AND v_pipeline_change < 0)) THEN
    v_state := 'sales_constrained';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Sales health is ' || v_sales_score || '/100 with declining revenue/pipeline',
      'evidence', 'FACT', 'detail', 'Sales is the binding constraint'));

  -- CAPACITY CONSTRAINED: operations or people dimension weak + growing demand.
  ELSIF ((v_ops_score IS NOT NULL AND v_ops_score < 55) OR (v_people_score IS NOT NULL AND v_people_score < 55))
        AND v_revenue_change IS NOT NULL AND v_revenue_change > 10 THEN
    v_state := 'capacity_constrained';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Operations/people health lagging while revenue grows ' || ROUND(v_revenue_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Growth is outpacing capacity'));

  -- OPERATIONALLY CONSTRAINED: operations dimension is the weakest.
  ELSIF v_ops_score IS NOT NULL AND v_ops_score < 50
        AND (v_fin_score IS NULL OR v_fin_score >= 50) THEN
    v_state := 'operationally_constrained';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Operations health is ' || v_ops_score || '/100',
      'evidence', 'FACT', 'detail', 'Operational friction is the binding constraint'));

  -- STRESSED: overall 40-55 (below healthy, above at-risk).
  ELSIF v_overall IS NOT NULL AND v_overall < 56 THEN
    v_state := 'stressed';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Overall health is ' || v_overall || '/100',
      'evidence', 'FACT', 'detail', 'Below the 56-point healthy threshold'));

  -- RECOVERING: health >= 56 but a key metric was declining and is now improving,
  -- OR overall is mid-range but improving.
  ELSIF v_overall IS NOT NULL AND v_overall < 70
        AND v_revenue_change IS NOT NULL AND v_revenue_change > 0 THEN
    v_state := 'recovering';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Health ' || v_overall || '/100 and revenue up ' || ROUND(v_revenue_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Trending upward from a weaker position'));

  -- GROWING: health >= 70 AND revenue growing > 10% AND not scaling-fast.
  ELSIF v_overall IS NOT NULL AND v_overall >= 70
        AND v_revenue_change IS NOT NULL AND v_revenue_change > 10 THEN
    v_state := 'growing';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Health ' || v_overall || '/100 and revenue up ' || ROUND(v_revenue_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Strong and accelerating'));

  -- SCALING: health >= 75 AND revenue growing > 25% (rapid expansion).
  ELSIF v_overall IS NOT NULL AND v_overall >= 75
        AND v_revenue_change IS NOT NULL AND v_revenue_change > 25 THEN
    v_state := 'scaling';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Health ' || v_overall || '/100 and revenue up ' || ROUND(v_revenue_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Rapid expansion — watch capacity'));

  -- OPPORTUNITY-RICH: health >= 70 AND a strong pipeline is building.
  ELSIF v_overall IS NOT NULL AND v_overall >= 70
        AND v_pipeline_change IS NOT NULL AND v_pipeline_change > 15 THEN
    v_state := 'opportunity_rich';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Health ' || v_overall || '/100 and pipeline up ' || ROUND(v_pipeline_change::numeric,1) || '%',
      'evidence', 'FACT', 'detail', 'Healthy with a building pipeline'));

  -- STABLE: health >= 70, no strong growth or decline.
  ELSIF v_overall IS NOT NULL AND v_overall >= 70 THEN
    v_state := 'stable';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Health ' || v_overall || '/100',
      'evidence', 'FACT', 'detail', 'Healthy with steady metrics'));

  -- INSUFFICIENT DATA: no overall score (migration not deployed, or no targets set).
  ELSE
    v_state := 'insufficient_data';
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'label', 'Not enough data to classify the business state yet',
      'evidence', 'FACT', 'detail', 'Set metric targets and use Avenize for a few weeks'));
  END IF;

  -- Confidence: how many dimensions had data.
  v_confidence := CASE
    WHEN v_overall IS NULL THEN 'insufficient'
    WHEN array_length(v_insufficient, 1) IS NULL OR array_length(v_insufficient, 1) = 0 THEN 'high'
    WHEN array_length(v_insufficient, 1) <= 2 THEN 'medium'
    ELSE 'low'
  END;

  RETURN jsonb_build_object(
    'state', v_state,
    'confidence', v_confidence,
    'reasons', v_reasons,
    'signals', v_signals
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('state', 'insufficient_data', 'confidence', 'insufficient',
    'reasons', jsonb_build_array(jsonb_build_object('label', SQLERRM, 'evidence', 'FACT')), 'error', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.classify_business_state(UUID) TO authenticated;

COMMENT ON FUNCTION public.classify_business_state(UUID) IS
  'The Business State Engine. Classifies the business into one state (growing/stable/scaling/stressed/recovering/at_risk/cash_constrained/sales_constrained/capacity_constrained/operationally_constrained/opportunity_rich/insufficient_data) from health scores + metric MoM trends. Deterministic. The state influences what Avenize shows. Best-effort.';


-- ----------------------------------------------------------------------------
-- 2. DIAGNOSIS ENGINE (#6) — the differentiator
--
-- Instead of "Revenue is down 8%", Avenize reasons: "Revenue is down 8%,
-- primarily because conversion dropped 11% after response times increased 31%.
-- This is creating ~₦X monthly exposure."
--
-- Each diagnosis = SYMPTOM (a significant metric change — FACT) + CAUSE (a
-- correlated metric change — INFERENCE) + IMPACT (₦ exposure, computed from
-- real numbers) + CONFIDENCE. Causal relationships are declared as rules
-- (symptom_metric -> cause_metric -> impact_formula), NOT inferred by an LLM.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.diagnosis_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id TEXT UNIQUE NOT NULL,            -- e.g. 'DIAG-REV-001'
  symptom_metric TEXT NOT NULL,            -- the metric that's the symptom (e.g. 'revenue')
  symptom_direction TEXT NOT NULL CHECK (symptom_direction IN ('up','down')),
  cause_metric TEXT NOT NULL,              -- the correlated cause metric (e.g. 'conversion_rate')
  cause_direction TEXT NOT NULL CHECK (cause_direction IN ('up','down')),
  -- Minimum |change_percent| on the symptom to trigger (avoids noise).
  trigger_threshold_pct NUMERIC NOT NULL DEFAULT 10,
  -- How to describe the relationship (deterministic copy — tunable by Avenize).
  relationship TEXT NOT NULL,              -- e.g. 'Conversion dropping is a leading driver of revenue loss'
  -- How to estimate the ₦ impact: 'symptom_delta' (revenue drop * 1 month) or
  -- 'cause_correlated' (estimate from the cause metric's change).
  impact_method TEXT NOT NULL DEFAULT 'symptom_delta',
  impact_metric TEXT,                     -- the metric whose current_value drives the ₦ calc
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 100
);
ALTER TABLE public.diagnosis_rules ENABLE ROW LEVEL SECURITY;
-- Read-only to authenticated (Riverwayse tunes these server-side); nobody writes from the client.
DROP POLICY IF EXISTS diagnosis_rules_read ON public.diagnosis_rules;
CREATE POLICY diagnosis_rules_read ON public.diagnosis_rules FOR SELECT TO authenticated USING (true);

-- Seed the causal-chain rules (deterministic, documented, tunable).
-- Each rule mirrors a real business causal relationship — Avenize operators
-- decide the copy + the thresholds (the scope's "thresholds are a business
-- decision, not hardcoded without an obvious place to adjust").
INSERT INTO public.diagnosis_rules
  (rule_id, symptom_metric, symptom_direction, cause_metric, cause_direction, trigger_threshold_pct, relationship, impact_method, impact_metric, severity, display_order) VALUES
  ('DIAG-REV-001', 'revenue', 'down', 'conversion_rate', 'down', 8,
   'Revenue is dropping alongside a falling conversion rate — lost deals are a leading driver of the revenue decline.',
   'symptom_delta', 'revenue', 'warning', 10),
  ('DIAG-REV-002', 'revenue', 'down', 'pipeline_value', 'down', 8,
   'Revenue is dropping alongside a shrinking pipeline — fewer opportunities in the funnel are feeding the decline.',
   'symptom_delta', 'revenue', 'warning', 20),
  ('DIAG-CASH-001', 'cash_balance', 'down', 'overdue_invoices', 'up', 10,
   'Cash is falling while overdue invoices are rising — unpaid invoices are draining the cash position.',
   'symptom_delta', 'cash_balance', 'critical', 30),
  ('DIAG-CASH-002', 'cash_balance', 'down', 'total_expenses', 'up', 10,
   'Cash is falling while expenses are rising — spend growth is outpacing cash generation.',
   'symptom_delta', 'cash_balance', 'warning', 40),
  ('DIAG-PROFIT-001', 'revenue', 'up', 'total_expenses', 'up', 15,
   'Revenue is growing but expenses are growing faster — margin is eroding despite top-line growth.',
   'symptom_delta', 'revenue', 'warning', 50),
  ('DIAG-OPS-001', 'task_completion_rate', 'down', 'active_tasks', 'up', 10,
   'Task completion is dropping while the active task count is rising — the team is overloaded, which is slowing delivery.',
   'symptom_delta', 'active_tasks', 'warning', 60)
ON CONFLICT (rule_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.diagnose_business(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rule RECORD;
  v_metrics JSONB;
  v_symptom JSONB;
  v_cause JSONB;
  v_sym_change NUMERIC;
  v_cause_change NUMERIC;
  v_sym_val NUMERIC;
  v_cause_val NUMERIC;
  v_impact NUMERIC;
  v_impact_metric_val NUMERIC;
  v_diagnoses JSONB := '[]'::jsonb;
  v_diag JSONB;
BEGIN
  -- Load the governed metrics (086) once. Coerce the table-valued return to
  -- a JSONB array so we can iterate + read fields by key.
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_metrics
      FROM current_metrics(p_business_id) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_metrics := '[]'::jsonb;
  END;
  IF v_metrics = '[]'::jsonb THEN
    RETURN jsonb_build_object('diagnoses', '[]'::jsonb, 'note', 'Not enough metric history to diagnose yet. Use Avenize for a few weeks to build a baseline.');
  END IF;

  FOR v_rule IN
    SELECT * FROM diagnosis_rules WHERE enabled = true ORDER BY display_order
  LOOP
    BEGIN
      -- Find the symptom + cause metrics in the governed set.
      v_symptom := NULL; v_cause := NULL;
      SELECT m INTO v_symptom FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = v_rule.symptom_metric;
      SELECT m INTO v_cause FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = v_rule.cause_metric;
      -- Both metrics must exist and have a change_percent.
      CONTINUE WHEN v_symptom IS NULL OR v_cause IS NULL;
      v_sym_change := NULLIF((v_symptom->>'change_percent')::TEXT, '')::NUMERIC;
      v_cause_change := NULLIF((v_cause->>'change_percent')::TEXT, '')::NUMERIC;
      CONTINUE WHEN v_sym_change IS NULL OR v_cause_change IS NULL;
      v_sym_val := NULLIF((v_symptom->>'current_value')::TEXT, '')::NUMERIC;
      v_cause_val := NULLIF((v_cause->>'current_value')::TEXT, '')::NUMERIC;

      -- The symptom must have moved significantly in the declared direction.
      CONTINUE WHEN v_rule.symptom_direction = 'down' AND NOT (v_sym_change <= -v_rule.trigger_threshold_pct);
      CONTINUE WHEN v_rule.symptom_direction = 'up'   AND NOT (v_sym_change >=  v_rule.trigger_threshold_pct);
      -- The cause must have moved in the declared direction (the correlation).
      CONTINUE WHEN v_rule.cause_direction = 'down' AND NOT (v_cause_change < 0);
      CONTINUE WHEN v_rule.cause_direction = 'up'   AND NOT (v_cause_change > 0);

      -- Compute the ₦ impact (§22: from real numbers, never fabricated).
      -- symptom_delta: the monthly exposure = the absolute value of the
      -- symptom's MoM change. For revenue: current_value * |change%| = the
      -- revenue lost this month vs last month.
      v_impact := NULL;
      IF v_rule.impact_method = 'symptom_delta' AND v_sym_val IS NOT NULL THEN
        v_impact_metric_val := v_sym_val;
        IF v_rule.impact_metric IS NOT NULL AND v_rule.impact_metric <> v_rule.symptom_metric THEN
          SELECT (m->>'current_value')::NUMERIC INTO v_impact_metric_val
            FROM jsonb_array_elements(v_metrics) m WHERE m->>'metric_key' = v_rule.impact_metric;
        END IF;
        IF v_impact_metric_val IS NOT NULL THEN
          v_impact := ABS(v_impact_metric_val * v_sym_change / 100.0);
        END IF;
      END IF;

      v_diag := jsonb_build_object(
        'rule_id', v_rule.rule_id,
        'symptom_metric', v_rule.symptom_metric,
        'symptom_change_pct', ROUND(v_sym_change::numeric, 1),
        'cause_metric', v_rule.cause_metric,
        'cause_change_pct', ROUND(v_cause_change::numeric, 1),
        'relationship', v_rule.relationship,
        'impact_amount', CASE WHEN v_impact IS NOT NULL THEN ROUND(v_impact::numeric, 2) ELSE NULL END,
        'severity', v_rule.severity,
        -- The SYMPTOM is a FACT (measured). The CAUSAL LINK is an INFERENCE
        -- (correlation, not proven causation). Labelling per §20/§22.
        'evidence', jsonb_build_object(
          'symptom', 'FACT',
          'cause_link', 'INFERENCE'
        )
      );
      -- Build the headline safely (display_name may be null). The symptom
      -- change direction is a FACT; the causal link in the relationship is
      -- an INFERENCE — the headline states the fact, the relationship states
      -- the inferred cause.
      v_diag := jsonb_set(v_diag, '{headline}', to_jsonb(
        COALESCE(v_symptom->>'name', v_rule.symptom_metric) || ' is ' ||
        CASE WHEN v_sym_change >= 0 THEN 'up' ELSE 'down' END || ' ' ||
        ABS(ROUND(v_sym_change::numeric,1))::TEXT || '%'
      ));

      v_diagnoses := v_diagnoses || jsonb_build_array(v_diag);
    EXCEPTION WHEN OTHERS THEN
      CONTINUE; -- best-effort per rule (§24)
    END;
  END LOOP;

  RETURN jsonb_build_object('diagnoses', v_diagnoses);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('diagnoses', '[]'::jsonb, 'error', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.diagnose_business(UUID) TO authenticated;

COMMENT ON FUNCTION public.diagnose_business(UUID) IS
  'The Diagnosis Engine. Cross-module causal reasoning: symptom (FACT) + cause (INFERENCE) + ₦ impact. "Revenue is down 8% because conversion dropped 11%." Deterministic rules (diagnosis_rules), not an LLM. Best-effort.';


-- ----------------------------------------------------------------------------
-- 3. NEXT BEST ACTION ENGINE (#7)
--
-- Instead of overwhelming the user with a list of recommendations, surface the
-- SINGLE most valuable thing to do now. Scores open recommendations + diagnoses
-- by: financial_impact × urgency × probability_of_success / effort.
-- Returns the top action with owner, due date, role + business-state relevance.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.next_best_action(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_recs JSONB;
  v_state JSONB;
  v_business_state TEXT;
  v_best JSONB := NULL;
  v_best_score NUMERIC := -1;
  v_score NUMERIC;
  v_urgency NUMERIC;
  v_impact NUMERIC;
  v_prob NUMERIC;
  v_effort NUMERIC;
  v_severity_weight NUMERIC;
  v_state_bonus NUMERIC;
  v_rule TEXT;
  v_owner UUID;
  v_due TIMESTAMPTZ;
  v_action JSONB;
BEGIN
  -- Open recommendations (091 — the existing feed). Coerce the table-valued
  -- return to a JSONB array so we can iterate + read fields by key.
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_recs
      FROM open_recommendations(p_business_id) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_recs := '[]'::jsonb;
  END;

  -- Business state (this migration) — actions relevant to the current state
  -- get a relevance bonus.
  BEGIN
    v_state := classify_business_state(p_business_id);
    v_business_state := v_state->>'state';
  EXCEPTION WHEN OTHERS THEN
    v_business_state := NULL;
  END;

  -- Score each open recommendation.
  FOR v_action IN SELECT * FROM jsonb_array_elements(v_recs) LOOP
    BEGIN
      -- Severity → urgency weight (critical = urgent).
      v_severity_weight := CASE v_action->>'severity'
        WHEN 'critical' THEN 1.0
        WHEN 'warning' THEN 0.6
        ELSE 0.3
      END;
      -- Expected impact → impact weight (₦ amount, if present).
      v_impact := NULLIF((v_action->'expected_impact'->'amount')::TEXT, '')::NUMERIC;
      IF v_impact IS NULL THEN v_impact := 0; END IF;
      -- Normalize impact (log scale so a ₦10M action doesn't drown a ₦50k one).
      v_impact := CASE WHEN v_impact > 0 THEN LOG(10, v_impact + 10) ELSE 0 END;
      -- Probability of success (effectiveness loop, 088) — default 0.5.
      v_prob := 0.5;
      v_rule := v_action->>'rule_id';
      IF v_rule IS NOT NULL THEN
        BEGIN
          -- recommendation_effectiveness returns success_count /
          -- outcome_recorded per rule. Default 0.5 if no history yet.
          SELECT COALESCE(
            (SELECT 1.0 * e.success_count / NULLIF(e.outcome_recorded, 0)
               FROM recommendation_effectiveness(p_business_id) e
               WHERE e.rule_id = v_rule
               LIMIT 1),
            0.5) INTO v_prob;
        EXCEPTION WHEN OTHERS THEN v_prob := 0.5; END;
      END IF;
      -- Effort (heuristic from action_type; tunable).
      v_effort := CASE v_action->>'action_type'
        WHEN 'create_task' THEN 1.0
        WHEN 'create_po' THEN 2.0
        WHEN 'route_approval' THEN 1.5
        WHEN 'send_reminder' THEN 0.5
        ELSE 1.0
      END;
      -- State relevance bonus: if the recommendation's domain matches the
      -- business state's binding constraint, boost it.
      v_state_bonus := 0;
      IF v_business_state = 'cash_constrained' AND v_action->>'rule_id' ILIKE 'FIN-AR%' THEN v_state_bonus := 0.3; END IF;
      IF v_business_state = 'sales_constrained' AND v_action->>'rule_id' ILIKE 'SAL%' THEN v_state_bonus := 0.3; END IF;
      IF v_business_state = 'capacity_constrained' AND v_action->>'rule_id' ILIKE 'OPS%' THEN v_state_bonus := 0.3; END IF;

      -- The score: impact × urgency × probability / effort + state_bonus.
      v_score := (v_impact * v_severity_weight * v_prob / v_effort) + v_state_bonus;

      IF v_score > v_best_score THEN
        v_best_score := v_score;
        v_best := v_action;
        v_best := jsonb_set(v_best, '{_nba_score}', to_jsonb(ROUND(v_score::numeric, 3)));
        v_best := jsonb_set(v_best, '{_nba_reason}',
          to_jsonb(
            'Impact ' || ROUND(v_impact::numeric,2) || ' × urgency ' || ROUND(v_severity_weight::numeric,2) ||
            ' × probability ' || ROUND(v_prob::numeric,2) || ' ÷ effort ' || ROUND(v_effort::numeric,1) ||
            CASE WHEN v_state_bonus > 0 THEN ' + state relevance ' || ROUND(v_state_bonus::numeric,2) ELSE '' END
          ));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  IF v_best IS NULL THEN
    RETURN jsonb_build_object('action', NULL,
      'note', 'Nothing needs your attention right now. As your business data grows, Avenize will surface the single most valuable thing to do here.',
      'business_state', v_business_state);
  END IF;

  -- Attach an owner + a sensible due date (critical = 2 days, warning = 7).
  v_owner := NULLIF(v_best->>'owner_id', '')::UUID;
  v_due := CASE v_best->>'severity'
    WHEN 'critical' THEN NOW() + INTERVAL '2 days'
    WHEN 'warning' THEN NOW() + INTERVAL '7 days'
    ELSE NOW() + INTERVAL '14 days'
  END;
  v_best := jsonb_set(v_best, '{_nba_owner_id}', to_jsonb(v_owner));
  v_best := jsonb_set(v_best, '{_nba_due_at}', to_jsonb(v_due));

  RETURN jsonb_build_object('action', v_best, 'business_state', v_business_state);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('action', NULL, 'error', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_best_action(UUID) TO authenticated;

COMMENT ON FUNCTION public.next_best_action(UUID) IS
  'The Next Best Action engine. Scores open recommendations by financial_impact × urgency × probability_of_success / effort + business-state relevance. Returns the SINGLE top action (the directive: don''t overwhelm). Best-effort.';


-- ----------------------------------------------------------------------------
-- 4. BUSINESS VALUE LEDGER (#9)
--
-- Aggregates the existing recommendation → action → outcome loop (088/091)
-- into the value Avenize has created: "Avenize helped recover ₦X / identified
-- ₦X in potential savings / generated ₦X in opportunity." This is the
-- retention mechanism — it proves Avenize's own value from REAL outcomes.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_value_ledger(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rows JSONB;
  v_recovered NUMERIC := 0;
  v_saved NUMERIC := 0;
  v_generated NUMERIC := 0;
  v_identified NUMERIC := 0;
  v_acted INT := 0;
  v_outcomes INT := 0;
  v_successful INT := 0;
  v_item JSONB;
  v_amt NUMERIC;
  v_kind TEXT;
  v_rule TEXT;
BEGIN
  -- Aggregate claims with status='outcome_recorded' (088) that have an
  -- actual_impact amount. Best-effort — empty if the loop isn't deployed.
  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY (t->>'recorded_at')::timestamptz DESC), '[]'::jsonb) INTO v_rows
      FROM (
        SELECT
          c.id, c.rule_id, c.statement, c.severity,
          c.expected_impact, c.actual_impact,
          c.status, c.updated_at,
          COALESCE(c.actual_impact->>'description', c.expected_impact->>'description') AS description,
          COALESCE((c.actual_impact->>'amount')::NUMERIC, 0) AS actual_amount,
          COALESCE((c.expected_impact->>'amount')::NUMERIC, 0) AS expected_amount
        FROM claims c
        WHERE c.business_id = p_business_id
          AND c.claim_type = 'RECOMMENDATION'
          AND c.status = 'outcome_recorded'
      ) t;
  EXCEPTION WHEN OTHERS THEN
    v_rows := '[]'::jsonb;
  END;

  -- Categorize by the rule_id prefix (deterministic, tunable):
  --   FIN-AR (receivables) / FIN-CF (cash) → recovered/saved
  --   SAL / CUST → generated (revenue opportunity)
  --   INV / OPS → saved (cost/waste reduction)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_rows) LOOP
    BEGIN
      v_amt := (v_item->>'actual_amount')::NUMERIC;
      v_rule := v_item->>'rule_id';
      IF v_amt IS NULL OR v_amt <= 0 THEN CONTINUE; END IF;
      v_outcomes := v_outcomes + 1;
      v_kind := CASE
        WHEN v_rule ILIKE 'FIN-AR%' OR v_rule ILIKE 'FIN-CF%' THEN 'recovered'
        WHEN v_rule ILIKE 'SAL%' OR v_rule ILIKE 'CUST%' THEN 'generated'
        WHEN v_rule ILIKE 'INV%' OR v_rule ILIKE 'OPS%' OR v_rule ILIKE 'DQ%' THEN 'saved'
        ELSE 'generated'
      END;
      IF v_kind = 'recovered' THEN v_recovered := v_recovered + v_amt;
      ELSIF v_kind = 'saved' THEN v_saved := v_saved + v_amt;
      ELSE v_generated := v_generated + v_amt;
      END IF;
      v_successful := v_successful + 1;
    EXCEPTION WHEN OTHERS THEN CONTINUE; END;
  END LOOP;

  -- "Identified" = the sum of expected impacts across ALL acted-on
  -- recommendations (whether or not the outcome was measured yet).
  BEGIN
    SELECT COALESCE(SUM(COALESCE((c.expected_impact->>'amount')::NUMERIC, 0)), 0) INTO v_identified
      FROM claims c
      WHERE c.business_id = p_business_id
        AND c.claim_type = 'RECOMMENDATION'
        AND c.status IN ('accepted','acted','outcome_recorded');
    SELECT COUNT(*) INTO v_acted FROM claims c
      WHERE c.business_id = p_business_id AND c.claim_type = 'RECOMMENDATION'
        AND c.status IN ('accepted','acted','outcome_recorded');
  EXCEPTION WHEN OTHERS THEN
    v_identified := 0; v_acted := 0;
  END;

  RETURN jsonb_build_object(
    'total_value', ROUND((v_recovered + v_saved + v_generated)::numeric, 2),
    'recovered', ROUND(v_recovered::numeric, 2),
    'saved', ROUND(v_saved::numeric, 2),
    'generated', ROUND(v_generated::numeric, 2),
    'identified', ROUND(v_identified::numeric, 2),
    'recommendations_acted', v_acted,
    'outcomes_recorded', v_outcomes,
    'successful_outcomes', v_successful,
    'recent', v_rows,
    -- Honesty: if no outcomes recorded yet, say so (§22 — never fabricate value).
    'note', CASE WHEN v_outcomes = 0
      THEN 'No outcomes recorded yet. As you act on recommendations and record what happened, Avenize will total the value it has created here.'
      ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('total_value', 0, 'recovered',0,'saved',0,'generated',0,
    'identified',0,'recommendations_acted',0,'outcomes_recorded',0,'successful_outcomes',0,
    'recent','[]'::jsonb, 'error', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.business_value_ledger(UUID) TO authenticated;

COMMENT ON FUNCTION public.business_value_ledger(UUID) IS
  'The Business Value Ledger. Aggregates the recommendation→action→outcome loop into "Avenize helped recover ₦X / saved ₦X / generated ₦X." Retention mechanism — proves Avenize''s value from REAL outcomes (§22). Best-effort.';


-- ----------------------------------------------------------------------------
-- 5. THE BRAIN — one aggregator. Returns State + Pulse + Diagnoses + Next
-- Best Action + Value Ledger in ONE call so the intelligence-first dashboard
-- renders in a single round-trip.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_brain(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_authorized BOOLEAN := false;
BEGIN
  -- Membership guard (defense-in-depth; the per-engine RPCs also gate).
  SELECT EXISTS(SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = p_business_id) INTO v_authorized;
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'state', classify_business_state(p_business_id),
    'pulse', current_business_health(p_business_id),
    'diagnoses', diagnose_business(p_business_id),
    'next_best_action', next_best_action(p_business_id),
    'value_ledger', business_value_ledger(p_business_id)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('authorized', true, 'error', true, 'message', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.business_brain(UUID) TO authenticated;

COMMENT ON FUNCTION public.business_brain(UUID) IS
  'The Avenize Business Brain. ONE call returns State + Pulse + Diagnoses + Next Best Action + Value Ledger — the intelligence-first dashboard surface. Membership-guarded. Best-effort (per-engine RPCs degrade gracefully).';
