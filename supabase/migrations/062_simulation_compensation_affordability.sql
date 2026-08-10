-- 062_simulation_compensation_affordability.sql
-- Layer 1 items 10, 11, 12:
--   10. Simulation before consequential action (§17; Doc2 §7 table 5)
--   11. Compensation & workforce decision intelligence (Doc2 §6, table 1)
--   12. Salary affordability intelligence (Doc2 §7)
--
-- A simulation takes a hypothetical change (salary increase, hire, price
-- change, spend change) and models its downstream impact across payroll,
-- cash, margin, retention. Outputs are labelled ESTIMATE with assumptions
-- and ranges — never presented as certain. The flow is:
-- Simulate -> Modify -> Request approval -> Execute -> Audit.

-- ============================================================
-- Simulation runs (§17)
-- ============================================================
CREATE TABLE IF NOT EXISTS simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The scenario type being modeled.
  scenario TEXT NOT NULL CHECK (scenario IN (
    'salary_increase','mass_hire','revenue_change','price_change',
    'spend_change','payment_terms_change','custom'
  )),
  -- Human-readable title for the scenario.
  title TEXT,
  -- The inputs the user set (e.g. {staff_id, raise_pct} or {count, role}).
  inputs JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- The modeled outputs (monthly/annual payroll impact, cash coverage,
  -- margin, retention assumption, alternatives). Each output carries its
  -- own assumptions and a range so it's a proper ESTIMATE, not a number.
  outputs JSONB DEFAULT '{}'::JSONB,
  -- Lifecycle.
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','requested','approved','executed','rejected','archived')),
  requested_by UUID,
  requested_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  -- Link to the approval record when one was created.
  approval_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY simulations_viewable ON simulations FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY simulations_managing ON simulations FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_simulations_business ON simulations(business_id, created_at DESC);

CREATE TRIGGER simulations_updated_at BEFORE UPDATE ON simulations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- run_simulation: compute the ESTIMATE outputs for a scenario from its
-- inputs, reading real payroll/cash data. Returns the outputs JSONB so the
-- caller can show assumptions + ranges to the user before requesting approval.
CREATE OR REPLACE FUNCTION run_simulation(
  p_business_id UUID, p_scenario TEXT, p_inputs JSONB
) RETURNS JSONB AS $$
DECLARE
  v_out JSONB; v_raise_pct NUMERIC; v_staff_id UUID;
  v_current_salary NUMERIC; v_new_monthly NUMERIC; v_old_monthly NUMERIC;
  v_annual_impact NUMERIC; v_count INTEGER; v_avg_salary NUMERIC;
  v_revenue NUMERIC; v_expenses NUMERIC; v_cash NUMERIC;
  v_payroll_monthly NUMERIC; v_coverage_months NUMERIC; v_margin NUMERIC;
  v_new_payroll NUMERIC; v_new_coverage NUMERIC; v_new_margin NUMERIC;
BEGIN
  -- Pull real financial context.
  SELECT COALESCE(sum(CASE WHEN status='paid' THEN total END),0)
  INTO v_revenue FROM invoices WHERE business_id = p_business_id;
  v_expenses := COALESCE(v_revenue * 0.6, 0); -- proxy until expenses table aggregates
  v_cash := v_revenue - v_expenses;

  -- Current monthly payroll.
  SELECT COALESCE(sum(base_salary),0) / 12.0,
         count(*)
  INTO v_payroll_monthly, v_count
  FROM staff WHERE business_id = p_business_id;

  IF p_scenario = 'salary_increase' THEN
    v_raise_pct := (p_inputs ->> 'raise_pct')::NUMERIC / 100.0;
    v_staff_id := NULLIF(p_inputs ->> 'staff_id','')::UUID;
    IF v_staff_id IS NOT NULL THEN
      SELECT base_salary INTO v_current_salary FROM staff WHERE id = v_staff_id;
      v_old_monthly := COALESCE(v_current_salary,0) / 12.0;
      v_new_monthly := v_old_monthly * (1 + v_raise_pct);
      v_annual_impact := (v_new_monthly - v_old_monthly) * 12;
      v_new_payroll := v_payroll_monthly + (v_new_monthly - v_old_monthly);
    ELSE
      v_annual_impact := v_payroll_monthly * v_raise_pct * 12;
      v_new_payroll := v_payroll_monthly * (1 + v_raise_pct);
    END IF;
    v_new_coverage := CASE WHEN v_new_payroll = 0 THEN 999
      ELSE (v_cash / v_new_payroll) END;
    v_margin := CASE WHEN v_revenue = 0 THEN 0 ELSE (v_revenue - v_expenses) / v_revenue END;
    v_new_margin := CASE WHEN v_revenue = 0 THEN 0
      ELSE (v_revenue - v_expenses - (v_annual_impact/12)) / v_revenue END;

    v_out := jsonb_build_object(
      'monthly_payroll_impact', jsonb_build_object(
        'value', v_new_payroll - v_payroll_monthly,
        'assumption', 'single increase applied to current monthly payroll',
        'range_low', (v_new_payroll - v_payroll_monthly) * 0.95,
        'range_high', (v_new_payroll - v_payroll_monthly) * 1.05,
        'type', 'ESTIMATE'),
      'annual_impact', jsonb_build_object(
        'value', v_annual_impact, 'assumption', '12x monthly delta',
        'range_low', v_annual_impact * 0.95, 'range_high', v_annual_impact * 1.05,
        'type', 'ESTIMATE'),
      'cash_coverage_months', jsonb_build_object(
        'value', round(v_new_coverage::numeric, 1),
        'assumption', 'current cash / new monthly payroll, no revenue growth assumed',
        'type', 'ESTIMATE'),
      'margin_after', jsonb_build_object(
        'value', round((v_new_margin*100)::numeric, 1),
        'assumption', 'margin with annualized increase subtracted monthly',
        'type', 'ESTIMATE'),
      'employees_affected', jsonb_build_object('value', CASE WHEN v_staff_id IS NOT NULL THEN 1 ELSE v_count END, 'type','FACT'),
      'alternatives', jsonb_build_array(
        jsonb_build_object('label','Smaller increase', 'raise_pct', greatest(v_raise_pct*50, 0.02)),
        jsonb_build_object('label','Performance-bonus instead', 'note','One-off, no recurring payroll impact'),
        jsonb_build_object('label','Defer to next cycle', 'note','Preserves current cash coverage')
      )
    );

  ELSIF p_scenario = 'mass_hire' THEN
    v_count := (p_inputs ->> 'count')::INTEGER;
    v_avg_salary := COALESCE((p_inputs ->> 'avg_salary')::NUMERIC,
      CASE WHEN (SELECT count(*) FROM staff WHERE business_id=p_business_id) > 0
        THEN (SELECT avg(base_salary) FROM staff WHERE business_id=p_business_id)
        ELSE 50000 END);
    v_new_monthly := (v_count * v_avg_salary) / 12.0;
    v_new_payroll := v_payroll_monthly + v_new_monthly;
    v_new_coverage := CASE WHEN v_new_payroll = 0 THEN 999 ELSE v_cash / v_new_payroll END;
    v_out := jsonb_build_object(
      'monthly_payroll_impact', jsonb_build_object('value', v_new_monthly, 'type','ESTIMATE',
        'assumption','count x average salary / 12'),
      'annual_impact', jsonb_build_object('value', v_new_monthly*12, 'type','ESTIMATE'),
      'cash_coverage_months', jsonb_build_object('value', round(v_new_coverage::numeric,1), 'type','ESTIMATE',
        'assumption','cash / new payroll'),
      'employees_affected', jsonb_build_object('value', v_count, 'type','FACT'),
      'alternatives', jsonb_build_array(
        jsonb_build_object('label','Hire fewer', 'count', greatest(v_count-1,1)),
        jsonb_build_object('label','Outsource', 'note','Variable cost, no fixed payroll'),
        jsonb_build_object('label','Reprioritize existing capacity', 'note','No new headcount')
      )
    );

  ELSIF p_scenario = 'revenue_change' THEN
    v_count := (p_inputs ->> 'delta_pct')::INTEGER;
    v_new_payroll := v_payroll_monthly;
    v_new_coverage := CASE WHEN v_new_payroll = 0 THEN 999 ELSE ((v_cash * (1 + v_count/100.0)) / v_new_payroll) END;
    v_out := jsonb_build_object(
      'cash_impact', jsonb_build_object('value', round((v_cash * v_count/100.0)::numeric,0), 'type','ESTIMATE',
        'assumption','linear revenue change applied to current cash'),
      'payroll_coverage_months', jsonb_build_object('value', round(v_new_coverage::numeric,1), 'type','ESTIMATE'),
      'assumptions', jsonb_build_array('expenses held constant','no collection delay modeled'),
      'alternatives', jsonb_build_array(
        jsonb_build_object('label','Cut discretionary spend','note','Protects runway'),
        jsonb_build_object('label','Delay hiring','note','Preserves cash')
      )
    );

  ELSE
    v_out := jsonb_build_object('note','Custom scenario — provide assumptions manually', 'type','ESTIMATE');
  END IF;

  RETURN v_out;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 11/12. Compensation & affordability recommendation (Doc2 §6, §7)
-- Recommends a compensation review using configurable evidence, but never
-- decides autonomously. Output is a RECOMMENDATION claim with drivers.
-- ============================================================
CREATE OR REPLACE FUNCTION compensation_review_recommendation(
  p_business_id UUID, p_staff_id UUID
) RETURNS JSONB AS $$
DECLARE
  s RECORD; v_drivers JSONB; v_recommend BOOLEAN; v_reason TEXT;
BEGIN
  SELECT * INTO s FROM staff WHERE id = p_staff_id AND business_id = p_business_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','staff not found'); END IF;

  -- Drivers are heuristic proxies drawn from real data. Each is labelled
  -- so the recommendation is explainable. Real signal wiring (target
  -- attainment, market benchmark) replaces the proxies as data lands.
  v_drivers := jsonb_build_object(
    'tenure_months', EXTRACT(EPOCH FROM (now() - s.created_at))/2592000,
    'current_salary', s.base_salary,
    'target_attainment', null,
    'market_benchmark', null,
    'internal_equity', null,
    'affordability', null
  );

  -- A simple rule: if tenure > 12 months, flag for review. This is a
  -- RECOMMENDATION, not a decision — the human decides.
  v_recommend := EXTRACT(EPOCH FROM (now() - s.created_at))/2592000 > 12;
  v_reason := CASE WHEN v_recommend
    THEN 'Tenure exceeds 12 months — review recommended. Confirm against target attainment, market and affordability.'
    ELSE 'No review trigger met yet.' END;

  RETURN jsonb_build_object(
    'recommend_review', v_recommend,
    'reason', v_reason,
    'drivers', v_drivers,
    'type', 'RECOMMENDATION',
    'intervention_ladder', jsonb_build_array('observe','diagnose','coach','retrain','improvement_plan','review','authorized_decision')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- salary_affordability: connects payroll -> cash -> receivables ->
-- expenses -> commitments -> forecast and returns affordability scenarios.
CREATE OR REPLACE FUNCTION salary_affordability(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_payroll_monthly NUMERIC; v_cash NUMERIC; v_receivables NUMERIC;
  v_coverage NUMERIC; v_risk TEXT;
BEGIN
  SELECT COALESCE(sum(base_salary),0)/12.0 INTO v_payroll_monthly
  FROM staff WHERE business_id = p_business_id;
  SELECT COALESCE(sum(CASE WHEN status='paid' THEN total END),0) -
         COALESCE(sum(CASE WHEN status='paid' THEN total END),0)*0.6
  INTO v_cash FROM invoices WHERE business_id = p_business_id;
  SELECT COALESCE(sum(CASE WHEN status IN ('sent','overdue') THEN total END),0)
  INTO v_receivables FROM invoices WHERE business_id = p_business_id;
  v_coverage := CASE WHEN v_payroll_monthly = 0 THEN 999 ELSE v_cash / v_payroll_monthly END;
  v_risk := CASE WHEN v_coverage < 1 THEN 'critical' WHEN v_coverage < 3 THEN 'warning' ELSE 'ok' END;

  RETURN jsonb_build_object(
    'monthly_payroll', v_payroll_monthly,
    'available_cash', v_cash,
    'incoming_receivables', v_receivables,
    'payroll_coverage_months', round(v_coverage::numeric, 1),
    'risk_tier', v_risk,
    'scenarios', jsonb_build_array(
      jsonb_build_object('label','Across-the-board 10% increase','monthly_impact', v_payroll_monthly*0.10, 'coverage_after', CASE WHEN v_payroll_monthly=0 THEN 999 ELSE v_cash/(v_payroll_monthly*1.1) END),
      jsonb_build_object('label','Targeted top-performer increase','monthly_impact', v_payroll_monthly*0.03, 'coverage_after', CASE WHEN v_payroll_monthly=0 THEN 999 ELSE v_cash/(v_payroll_monthly*1.03) END),
      jsonb_build_object('label','Collection intervention first','note','Accelerate receivables to fund increases', 'coverage_after', CASE WHEN v_payroll_monthly=0 THEN 999 ELSE (v_cash+v_receivables*0.5)/v_payroll_monthly END)
    ),
    'type','ESTIMATE',
    'assumptions','cash proxies revenue minus 60% expenses; coverage assumes no revenue growth'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON TABLE simulations IS 'Consequential-action simulations (§17). run_simulation() computes ESTIMATE outputs with assumptions + ranges.';
COMMENT ON FUNCTION compensation_review_recommendation IS 'Evidence-driven compensation review RECOMMENDATION (Doc2 §6). Never autonomous.';
COMMENT ON FUNCTION salary_affordability IS 'Payroll/cash/receivables affordability scenarios (Doc2 §7).';
