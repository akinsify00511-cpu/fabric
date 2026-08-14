
-- ############################################
-- FILE: 093_business_health_engine.sql
-- ############################################
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

-- ############################################
-- FILE: 094_okr_engine.sql
-- ############################################
-- 094_okr_engine.sql
--
-- §24-25 OKR Engine. The directive wants:
--   Company → Department → Team → Individual → Objective → Key Results → KPIs
--   → Actuals → Outcome
-- Each KPI/OKR must support definition, owner, frequency, formula, baseline,
-- target, actual, variance, weighting, threshold, status — and the user must
-- be able to answer "How did Avenize calculate this?" (§24).
--
-- §6/§0 principle: do NOT duplicate. A `strategic_objectives` table already
-- exists (063) with a level-based hierarchy (vision→strategy→objective→kpi→
-- initiative) and parent_id nesting. It is dormant (zero src/ references) and
-- its RLS uses the old cross-tenant pattern. This migration:
--   1. Extends strategic_objectives with OKR fields (owner, scope, period,
--      weight, confidence) so it becomes the OBJECTIVE table.
--   2. Adds a proper `key_results` child table — each KR is a measurable
--      outcome under an objective, with numeric start/current/target,
--      variance, auto-computed progress, scoring, and optional link to a
--      governed KPI (kpi_metrics, 086) so actuals flow from real data.
--   3. Hardens strategic_objectives + key_results RLS to the get_current_staff
--      pattern (080 may not have caught strategic_objectives; idempotent here).
--
-- Pure internal SQL. Idempotent. No external dependency. §21 small-data-safe:
-- a KR with no actual yet shows 0% progress, never a fabricated score.


-- ============================================================
-- 1. Extend strategic_objectives → the OBJECTIVE table.
-- ============================================================
ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS owner_id UUID
  REFERENCES staff(id) ON DELETE SET NULL;
-- Scope: who the objective belongs to (company / department / team / individual).
ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS scope TEXT
  DEFAULT 'company' CHECK (scope IN ('company','department','team','individual'));
ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS department_id UUID
  REFERENCES departments(id) ON DELETE SET NULL;
-- OKR period (quarter/period the objective is tracked over).
ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS period_end DATE;
-- Relative weighting within the parent (for weighted roll-up of key results).
ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS weight NUMERIC
  DEFAULT 1.0 CHECK (weight > 0);
ALTER TABLE strategic_objectives ADD COLUMN IF NOT EXISTS confidence TEXT
  DEFAULT 'medium' CHECK (confidence IN ('high','medium','low','insufficient'));

-- ============================================================
-- 2. key_results — measurable outcomes under an objective.
-- ============================================================
CREATE TABLE IF NOT EXISTS key_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  objective_id UUID NOT NULL REFERENCES strategic_objectives(id) ON DELETE CASCADE,
  -- The measurable outcome.
  title TEXT NOT NULL,
  description TEXT,
  -- Numeric measurement (§24: baseline, target, actual, variance).
  unit TEXT DEFAULT 'number',           -- 'number','currency','percent'
  start_value NUMERIC DEFAULT 0,        -- baseline at the start of the period
  target_value NUMERIC NOT NULL,        -- the goal
  current_value NUMERIC DEFAULT 0,      -- actual / latest measured
  -- Auto-derived.
  progress NUMERIC GENERATED ALWAYS AS (
    CASE WHEN target_value = start_value THEN 0
         ELSE LEAST(GREATEST(
           (current_value - start_value) / NULLIF(target_value - start_value, 0) * 100,
         0), 100) END
  ) STORED,
  -- Optional link to a governed KPI (kpi_metrics.metric_key) so the actual
  -- can flow from real data instead of manual entry. NULL = manual.
  metric_key TEXT,
  -- Relative weighting within the objective (for progress roll-up).
  weight NUMERIC DEFAULT 1.0 CHECK (weight > 0),
  -- Status.
  status TEXT DEFAULT 'on_track' CHECK (status IN (
    'not_started','on_track','at_risk','behind','achieved','missed'
  )),
  -- Owner of this specific KR (defaults to objective owner if NULL).
  owner_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kr_business ON key_results(business_id);
CREATE INDEX IF NOT EXISTS idx_kr_objective ON key_results(objective_id);

-- updated_at trigger (uses the helper from 007).
CREATE TRIGGER key_results_updated_at
  BEFORE UPDATE ON key_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. RLS — harden to the get_current_staff pattern (§15-19 tenant isolation).
-- ============================================================
ALTER TABLE key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_objectives ENABLE ROW LEVEL SECURITY;

-- Drop old cross-tenant policies (idempotent).
DROP POLICY IF EXISTS objectives_viewable ON strategic_objectives;
DROP POLICY IF EXISTS objectives_managing ON strategic_objectives;
-- 080 may have created hardened policies; drop them too so we redefine cleanly.
DROP POLICY IF EXISTS strategic_objectives_select ON strategic_objectives;
DROP POLICY IF EXISTS strategic_objectives_insert ON strategic_objectives;
DROP POLICY IF EXISTS strategic_objectives_update ON strategic_objectives;
DROP POLICY IF EXISTS strategic_objectives_delete ON strategic_objectives;

CREATE POLICY strategic_objectives_select ON strategic_objectives
  FOR SELECT USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );
CREATE POLICY strategic_objectives_insert ON strategic_objectives
  FOR INSERT WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );
CREATE POLICY strategic_objectives_update ON strategic_objectives
  FOR UPDATE USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
  ) WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );
CREATE POLICY strategic_objectives_delete ON strategic_objectives
  FOR DELETE USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );

CREATE POLICY key_results_select ON key_results
  FOR SELECT USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );
CREATE POLICY key_results_insert ON key_results
  FOR INSERT WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );
CREATE POLICY key_results_update ON key_results
  FOR UPDATE USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
  ) WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );
CREATE POLICY key_results_delete ON key_results
  FOR DELETE USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );

-- ============================================================
-- 4. objective_progress(objective_id) — roll up KR progress (§24 weighting).
-- Returns the weighted average progress of an objective's key results, or
-- NULL if it has none (honest: not "0%", which would imply failure).
-- ============================================================
CREATE OR REPLACE FUNCTION objective_progress(p_objective_id UUID)
RETURNS NUMERIC AS $$
DECLARE v_prog NUMERIC;
BEGIN
  SELECT
    CASE WHEN SUM(weight) = 0 THEN NULL
         ELSE SUM(progress * weight) / SUM(weight)
    END
  INTO v_prog
  FROM key_results
  WHERE objective_id = p_objective_id;
  RETURN v_prog;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 5. sync_kr_from_metric(business_id) — pull actuals from governed KPIs.
-- For key_results that link to a metric_key, copy the latest current_value
-- from kpi_metrics so OKR actuals stay in sync with real data (§24, §27).
-- Best-effort; no-op for manual KRs.
-- ============================================================
CREATE OR REPLACE FUNCTION sync_kr_from_metric(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE v_n INTEGER := 0;
BEGIN
  UPDATE key_results kr
  SET current_value = km.current_value,
      updated_at = NOW()
  FROM kpi_metrics km
  WHERE kr.business_id = p_business_id
    AND kr.metric_key = km.metric_key
    AND km.business_id = p_business_id
    AND km.metric_key IS NOT NULL
    AND km.current_value IS NOT NULL
    -- Only the latest period per metric_key.
    AND km.period_end = (
      SELECT MAX(k2.period_end) FROM kpi_metrics k2
      WHERE k2.business_id = km.business_id AND k2.metric_key = km.metric_key
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION objective_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_kr_from_metric(UUID) TO authenticated;

COMMENT ON TABLE key_results IS
  '§24-25 OKR key results: measurable outcomes under an objective (strategic_objectives). Numeric start/target/current with auto progress, optional governed-KPI link, weighting, status.';
COMMENT ON FUNCTION objective_progress IS
  'Weighted average progress of an objective key results. NULL if none (honest, not 0%). §24.';
COMMENT ON FUNCTION sync_kr_from_metric IS
  'Pull governed-KPI actuals (086) into linked key results so OKR progress reflects real data. §24/§27.';

-- ############################################
-- FILE: 095_risk_register.sql
-- ############################################
-- 095_risk_register.sql
--
-- §48 Risk Management. A first-class, general risk register. The existing
-- customer_risk_scores (031) is narrow (per-customer payment risk only);
-- this adds a general risk system per the directive:
--   Risk → Probability → Impact → Owner → Mitigation → Deadline → Status → Evidence
-- Categories: financial, customer, operational, project, people, strategic,
-- compliance. Each risk is explainable (evidence JSONB) and has a computed
-- risk score = probability × impact (1-5 each → 1-25 scale).
--
-- §22: no external dependency. §15-19: tenant isolation via get_current_staff.
-- Idempotent. Pure SQL.


CREATE TABLE IF NOT EXISTS business_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Identification
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'financial','customer','operational','project','people','strategic','compliance'
  )),
  -- Assessment (1-5 scale each; §48 probability + impact).
  probability INTEGER NOT NULL DEFAULT 3 CHECK (probability BETWEEN 1 AND 5),
  impact INTEGER NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
  -- Computed risk score (1-25). Stored for sorting/filtering; updated via trigger.
  risk_score INTEGER DEFAULT 9,
  -- Ownership + response.
  owner_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  mitigation TEXT,                       -- planned/active mitigation
  mitigation_status TEXT DEFAULT 'planned' CHECK (mitigation_status IN (
    'none','planned','in_progress','mitigated','accepted'
  )),
  due_date DATE,                         -- mitigation deadline
  -- Lifecycle.
  status TEXT DEFAULT 'open' CHECK (status IN (
    'open','monitoring','mitigated','closed','materialized'
  )),
  -- Evidence (§48 evidence; §19 explainability).
  evidence JSONB DEFAULT '[]'::JSONB,    -- [{source, detail, date}]
  -- Optional link to a specific entity (a project, a customer, an invoice…).
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_br_business ON business_risks(business_id);
CREATE INDEX IF NOT EXISTS idx_br_category ON business_risks(business_id, category);
CREATE INDEX IF NOT EXISTS idx_br_status ON business_risks(business_id, status);
CREATE INDEX IF NOT EXISTS idx_br_score ON business_risks(business_id, risk_score DESC);

-- updated_at + risk_score auto-compute trigger.
CREATE OR REPLACE FUNCTION br_set_risk_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.risk_score := NEW.probability * NEW.impact;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER business_risks_before_insert
  BEFORE INSERT ON business_risks
  FOR EACH ROW EXECUTE FUNCTION br_set_risk_score();
CREATE TRIGGER business_risks_before_update
  BEFORE UPDATE ON business_risks
  FOR EACH ROW EXECUTE FUNCTION br_set_risk_score();

-- RLS — get_current_staff tenant isolation (§15-19).
ALTER TABLE business_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_risks_select ON business_risks
  FOR SELECT USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );
CREATE POLICY business_risks_insert ON business_risks
  FOR INSERT WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );
CREATE POLICY business_risks_update ON business_risks
  FOR UPDATE USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
  ) WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );
CREATE POLICY business_risks_delete ON business_risks
  FOR DELETE USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
  );

-- risk_summary(business_id) — counts by category + severity tier (§48).
CREATE OR REPLACE FUNCTION risk_summary(p_business_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'open', count(*) FILTER (WHERE status = 'open'),
    'high', count(*) FILTER (WHERE risk_score >= 15),
    'by_category', jsonb_object_agg(
      category, jsonb_build_object(
        'total', count(*),
        'open', count(*) FILTER (WHERE status = 'open'),
        'avg_score', round(avg(risk_score)::numeric, 1)
      )
    )
  )
  FROM business_risks
  WHERE business_id = p_business_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION risk_summary(UUID) TO authenticated;

COMMENT ON TABLE business_risks IS
  '§48 general risk register. probability×impact score (1-25), categories (financial/customer/operational/project/people/strategic/compliance), owner, mitigation, status, evidence. Tenant-isolated.';
COMMENT ON FUNCTION risk_summary IS
  'Counts + average score by category for the risk dashboard. §48.';

-- ############################################
-- FILE: 096_trust_dr_audit_extension.sql
-- ############################################
-- 096_trust_dr_audit_extension.sql
--
-- §50-51 Trust & Disaster Recovery. The trigger-based audit logger (056)
-- audits 9 sensitive financial/HR tables but NONE of the intelligence/
-- decision tables added in 088-095. For trust, decision-relevant mutations
-- MUST be auditable: a recommendation being accepted/rejected, a risk being
-- closed, an OKR key result being updated, a metric target being changed
-- (governance). Without these, the outcome loop (§15) has no tamper-evident
-- trail — a user could silently change a target to make a score look better.
--
-- This migration:
--   1. Extends audit_row_change() triggers to: claims, business_risks,
--      key_results, kpi_metrics (target/actual governance writes).
--   2. Adds trust_health(business_id) — an honest audit-trail health check:
--      latest audit log, coverage (which audited tables have recent activity),
--      and gap detection (tables with writes but no audit rows = trigger may
--      be broken). Returns FACT-level evidence only (§9).
--
-- §22: no external dependency. §15-19: tenant isolation. Idempotent.


-- ============================================================
-- 1. Extend audit triggers to intelligence/decision tables.
--    audit_row_change() is defined in 056; idempotent CREATE TRIGGER.
-- ============================================================
DROP TRIGGER IF EXISTS audit_claims ON claims;
CREATE TRIGGER audit_claims AFTER INSERT OR UPDATE OR DELETE ON claims
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('claim');

DROP TRIGGER IF EXISTS audit_business_risks ON business_risks;
CREATE TRIGGER audit_business_risks AFTER INSERT OR UPDATE OR DELETE ON business_risks
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('business_risk');

DROP TRIGGER IF EXISTS audit_key_results ON key_results;
CREATE TRIGGER audit_key_results AFTER INSERT OR UPDATE OR DELETE ON key_results
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('key_result');

DROP TRIGGER IF EXISTS audit_kpi_metrics ON kpi_metrics;
CREATE TRIGGER audit_kpi_metrics AFTER INSERT OR UPDATE OR DELETE ON kpi_metrics
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('kpi_metric');

-- ============================================================
-- 2. trust_health(business_id) — audit-trail integrity + DR posture.
--    Honest: returns real counts + timestamps. Does NOT fabricate a "backup
--    status" it cannot verify (Supabase manages backups); instead reports
--    what the app CAN verify — is the audit trail receiving entries, and is
--    every audited table's activity being captured.
-- ============================================================
CREATE OR REPLACE FUNCTION trust_health(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_latest TIMESTAMPTZ;
  v_total_24h INTEGER;
  v_total_30d INTEGER;
  v_coverage JSONB;
  v_tables TEXT[] := ARRAY[
    'invoices','payments','journal_entries','staff','payroll_runs',
    'approvals','property_commissions','signature_requests','business_subscriptions',
    'claims','business_risks','key_results','kpi_metrics'
  ];
  v_t TEXT;
  v_recent_writes INTEGER;
  v_audit_rows INTEGER;
  v_gaps TEXT[] := '{}';
  v_covered TEXT[] := '{}';
BEGIN
  -- Latest audit entry + volumes.
  SELECT max(created_at), count(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),
         count(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')
  INTO v_latest, v_total_24h, v_total_30d
  FROM audit_logs WHERE business_id = p_business_id;

  -- Per-table coverage: does the table have recent writes AND are those
  -- reflected in audit_logs? A table with writes but zero audit rows = the
  -- trigger may be broken (a trust gap). This is the integrity signal.
  FOREACH v_t IN ARRAY v_tables LOOP
    BEGIN
      EXECUTE format(
        'SELECT count(*) FROM %I WHERE business_id = $1 AND created_at > NOW() - INTERVAL ''7 days''',
        v_t
      ) INTO v_recent_writes USING p_business_id;

      SELECT count(*) INTO v_audit_rows FROM audit_logs
      WHERE business_id = p_business_id
        AND entity_type = v_t
        AND created_at > NOW() - INTERVAL '7 days';

      IF v_recent_writes > 0 THEN
        IF v_audit_rows = 0 THEN
          v_gaps := array_append(v_gaps, v_t);
        ELSE
          v_covered := array_append(v_covered, v_t);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Table may not exist on this DB (migration not applied) — skip.
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'latest_audit_at', v_latest,
    'audit_entries_24h', COALESCE(v_total_24h, 0),
    'audit_entries_30d', COALESCE(v_total_30d, 0),
    'audited_tables_with_recent_activity', v_covered,
    'audit_gaps', v_gaps,                          -- tables with writes but no audit rows
    'audit_healthy', array_length(v_gaps, 1) IS NULL OR array_length(v_gaps, 1) = 0,
    'checked_at', NOW()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION trust_health(UUID) TO authenticated;

COMMENT ON FUNCTION trust_health IS
  '§50-51 trust/audit health: latest audit entry, volumes, per-table coverage, and gap detection (tables with writes but no audit rows = trigger may be broken). Honest FACT-level evidence; does not fabricate backup status.';

-- ############################################
-- FILE: 097_monthly_performance_review.sql
-- ############################################
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
    'evidence', c.evidence,
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

-- ############################################
-- FILE: 098_golden_test_datasets.sql
-- ############################################
-- 098_golden_test_datasets.sql
-- §30 Golden Test Datasets — controlled synthetic businesses for validating the
-- intelligence engine. These are NOT real customer data. Each profile produces
-- a PREDICTABLE intelligence output so the rules can be asserted against a
-- known expected scenario (§29/§30).
--
-- Profiles (see INTELLIGENCE_TEST_MATRIX.md):
--   A_healthy        — steady revenue, low overdue, good data quality → health 80+, few recs
--   B_cashflow       — expenses > income over 90d → FIN-CF-001 fires
--   C_sales_decline  — stale deals in pipeline → SAL-CONV-001 fires
--   D_high_growth    — many customers, won deals, full stock → no negative recs
--   E_inventory      — products at/below reorder point → INV-001 fires
--   F_project        — active project overdue → ProjectDelayed event (+ project dim)
--   G_empty          — < 3 of everything → all rules NO-OP (§21 small-data safety)
--
-- Idempotent + self-contained. Creates dedicated TEST auth users (clearly named
-- golden-test-*) so the seed does not depend on any real account. Use
-- cleanup_golden_datasets() to remove everything (CASCADE handles children).
--
-- Run order to validate:  seed → refresh_business_metrics → run_recommendation_rules
--   → compute_business_health → assert expected claims/health. See test matrix.


-- Test users are created via SECURITY DEFINER so the seed can run as a service
-- role without needing the anon/auth flow. They are clearly prefixed
-- 'golden-test-' to avoid collision with real accounts and make cleanup safe.
CREATE OR REPLACE FUNCTION _ensure_test_auth_user(p_email TEXT)
RETURNS UUID AS $$
DECLARE v_uid UUID;
BEGIN
  -- auth.users is a Supabase internal table; insert only if the caller is
  -- service role. Idempotent on email.
  SELECT id INTO v_uid FROM auth.users WHERE email = p_email;
  IF v_uid IS NULL THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email,
                            encrypted_password, email_confirmed_at,
                            created_at, updated_at)
    VALUES ('00000000-0000-0000-0000-000000000000',
            gen_random_uuid(), 'authenticated', 'authenticated', p_email,
            crypt('golden-test-no-login', gen_salt('bf')),
            now(), now(), now())
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_uid;
  END IF;
  RETURN v_uid;
EXCEPTION WHEN insufficient_privilege THEN
  -- If auth.users isn't writable in this context, fall back to a deterministic
  -- fake UUID per email so the seed still works for schema/data testing.
  RETURN md5(p_email)::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed one golden business. Returns the new business_id. Idempotent per
-- (profile): re-seeding the same profile deletes the prior test business first.
CREATE OR REPLACE FUNCTION seed_golden_dataset(p_profile TEXT)
RETURNS UUID AS $$
DECLARE
  v_bid UUID;
  v_uid UUID;
  v_staff UUID;
  v_owner UUID;
  v_c UUID;        -- contact
  v_d UUID;        -- deal
  v_inv UUID;      -- invoice
  v_pay UUID;      -- payment
  v_p UUID;        -- product
  v_proj UUID;     -- project
  v_t UUID;        -- task
  v_today DATE := CURRENT_DATE;
  v_email TEXT;
  v_name TEXT;
BEGIN
  -- Clean any prior seed for this profile (idempotent re-run).
  DELETE FROM businesses WHERE name = 'GOLDEN-' || p_profile;

  INSERT INTO businesses (id, name, industry)
  VALUES (gen_random_uuid(), 'GOLDEN-' || p_profile, 'consulting')
  RETURNING id INTO v_bid;

  v_email := 'golden-test-' || p_profile || '@avenize.test';
  v_uid := _ensure_test_auth_user(v_email);

  INSERT INTO staff (business_id, user_id, name, email, role)
  VALUES (v_bid, v_uid, 'Golden Owner ' || p_profile, v_email, 'owner')
  RETURNING id INTO v_owner;

  v_name := p_profile;

  IF p_profile = 'A_healthy' THEN
    -- Steady revenue, low overdue, good data quality. 6 won deals + 6 paid
    -- invoices over 90d. No negatives expected.
    FOR i IN 1..6 LOOP
      INSERT INTO contacts (business_id, name, email, company)
      VALUES (v_bid, 'Healthy Cust ' || i, 'hc'||i||'@t.test', 'HealthyCo')
      RETURNING id INTO v_c;
      INSERT INTO deals (business_id, contact_id, title, value, stage, expected_close, created_at, updated_at)
      VALUES (v_bid, v_c, 'Healthy Deal '||i, 5000000, 'won', v_today - (i*10), v_today - (i*15), v_today - (i*10))
      RETURNING id INTO v_d;
      INSERT INTO invoices (business_id, client_name, subtotal, total, status, due_date, deal_id, created_at)
      VALUES (v_bid, 'Healthy Cust '||i, 5000000, 5000000, 'paid', v_today - (i*5), v_d, v_today - (i*15))
      RETURNING id INTO v_inv;
      INSERT INTO payments (business_id, invoice_id, customer_id, amount, currency, provider, reference, status, created_at)
      VALUES (v_bid, v_inv, v_c, 5000000, 'NGN', 'cash', 'GOLDEN-A-'||i, 'successful', v_today - (i*10));
      INSERT INTO cashflow_entries (business_id, type, category, amount, date)
      VALUES (v_bid, 'income', 'sales', 5000000, v_today - (i*10));
    END LOOP;
    -- A little normal expense (well below income).
    FOR i IN 1..3 LOOP
      INSERT INTO cashflow_entries (business_id, type, category, amount, date)
      VALUES (v_bid, 'expense', 'operations', 500000, v_today - (i*20));
    END LOOP;

  ELSIF p_profile = 'B_cashflow' THEN
    -- Expenses > income over 90d, ≥14 days of history → FIN-CF-001 must fire.
    FOR i IN 1..5 LOOP
      INSERT INTO cashflow_entries (business_id, type, category, amount, date)
      VALUES (v_bid, 'income', 'sales', 1000000, v_today - (i*15));
      INSERT INTO cashflow_entries (business_id, type, category, amount, date)
      VALUES (v_bid, 'expense', 'operations', 3000000, v_today - (i*15));
    END LOOP;
    -- Plus overdue invoices for FIN-AR-002.
    FOR i IN 1..4 LOOP
      INSERT INTO invoices (business_id, client_name, subtotal, total, status, due_date, created_at)
      VALUES (v_bid, 'Stressed Cust '||i, 2000000, 2000000, 'overdue', v_today - 45, v_today - 60);
    END LOOP;

  ELSIF p_profile = 'C_sales_decline' THEN
    -- Stale deals stuck in 'proposal' > 14 days → SAL-CONV-001 must fire.
    FOR i IN 1..3 LOOP
      INSERT INTO contacts (business_id, name, email)
      VALUES (v_bid, 'Decline Cust '||i, 'dc'||i||'@t.test')
      RETURNING id INTO v_c;
      INSERT INTO deals (business_id, contact_id, title, value, stage, created_at, updated_at)
      VALUES (v_bid, v_c, 'Stale Deal '||i, 3000000, 'proposal', v_today - 30, v_today - 20)
      RETURNING id INTO v_d;
    END LOOP;

  ELSIF p_profile = 'D_high_growth' THEN
    -- Many new customers, won deals, full stock → no negative recs expected.
    FOR i IN 1..8 LOOP
      INSERT INTO contacts (business_id, name, email, company)
      VALUES (v_bid, 'Growth Cust '||i, 'gc'||i||'@t.test', 'GrowthCo')
      RETURNING id INTO v_c;
      INSERT INTO deals (business_id, contact_id, title, value, stage, created_at, updated_at)
      VALUES (v_bid, v_c, 'Won Deal '||i, 7000000, 'won', v_today - (i*5), v_today - (i*5))
      RETURNING id INTO v_d;
      INSERT INTO invoices (business_id, client_name, subtotal, total, status, due_date, deal_id, created_at)
      VALUES (v_bid, 'Growth Cust '||i, 7000000, 7000000, 'paid', v_today - (i*3), v_d, v_today - (i*5))
      RETURNING id INTO v_inv;
      INSERT INTO payments (business_id, invoice_id, customer_id, amount, currency, provider, reference, status, created_at)
      VALUES (v_bid, v_inv, v_c, 7000000, 'NGN', 'cash', 'GOLDEN-D-'||i, 'successful', v_today - (i*3));
      INSERT INTO cashflow_entries (business_id, type, category, amount, date)
      VALUES (v_bid, 'income', 'sales', 7000000, v_today - (i*3));
    END LOOP;
    -- Full stock (no INV-001).
    INSERT INTO products (business_id, name, sku, price, cost, stock, low_stock_threshold)
    VALUES (v_bid, 'Growth Widget', 'GW-1', 1000, 400, 500, 50);

  ELSIF p_profile = 'E_inventory' THEN
    -- Products at/below reorder point → INV-001 must fire.
    FOR i IN 1..4 LOOP
      INSERT INTO products (business_id, name, sku, price, cost, stock, low_stock_threshold)
      VALUES (v_bid, 'Low Stock Product '||i, 'LS-'||i, 2000, 800, 3, 20);
    END LOOP;

  ELSIF p_profile = 'F_project' THEN
    -- Active project overdue → ProjectDelayed event fires.
    INSERT INTO projects (business_id, name, status, due_date, owner_id, created_at)
    VALUES (v_bid, 'Overdue Project', 'active', v_today - 10, v_owner, v_today - 40)
    RETURNING id INTO v_proj;
    INSERT INTO tasks (business_id, project_id, title, status, assignee_id, created_at)
    VALUES (v_bid, v_proj, 'Overdue Project Task', 'active', v_owner, v_today - 35);

  ELSIF p_profile = 'G_empty' THEN
    -- < 3 of everything → every rule NO-OPs (§21). Nothing seeded except the
    -- business + owner. Health should report insufficient_data across the board.
    NULL;
  END IF;

  RETURN v_bid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove all golden test datasets + their test auth users.
CREATE OR REPLACE FUNCTION cleanup_golden_datasets()
RETURNS VOID AS $$
BEGIN
  DELETE FROM businesses WHERE name LIKE 'GOLDEN-%';
  DELETE FROM auth.users WHERE email LIKE 'golden-test-%@avenize.test';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION seed_golden_dataset(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_golden_datasets() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION _ensure_test_auth_user(TEXT) TO service_role;

COMMENT ON FUNCTION seed_golden_dataset IS
'§30 golden test datasets. Seeds a synthetic business with controlled data for a named profile. Idempotent. NOT real customer data. Use cleanup_golden_datasets() to remove.';

-- ############################################
-- FILE: 099_intelligence_notifications.sql
-- ############################################
-- 099_intelligence_notifications.sql
-- §25 Notification integration. Intelligence must surface material findings to
-- the people who can act — but NOT spam. This trigger creates ONE notification
-- per CRITICAL recommendation at the moment it is issued, targeted at the
-- business owner. Non-critical recommendations surface in the Cockpit/MPR only
-- (no notification) per the §25 anti-spam rule.
--
-- Why a trigger (not a frontend call):
--   - Recommendations are issued by the scheduled pg_cron job (092), so no user
--     is "in the app" when one fires. A trigger guarantees the notification is
--     created server-side regardless of who/what issued the claim.
--   - It is best-effort (EXCEPTION): a notification failure never breaks the
--     recommendation itself (§24 intelligence failure isolation).
--
-- Anti-spam (§25):
--   - Only severity = 'critical' creates a notification (warnings/info surface
--     in the Cockpit/MPR).
--   - The claims dedup (partial unique index on open recommendations per
--     rule+entity, 091) means a rule does not re-issue while open — so the
--     same condition notifies once, not on every hourly refresh.
--   - Targeted at the business owner only (the accountable party), not every
--     staff member.


-- Idempotency guard: don't notify twice for the same claim.
CREATE TABLE IF NOT EXISTS intelligence_notification_log (
  claim_id UUID PRIMARY KEY REFERENCES claims(id) ON DELETE CASCADE,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION notify_critical_recommendation()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_staff UUID;
  v_business UUID;
  v_rule_id TEXT;
  v_title TEXT;
  v_msg TEXT;
  v_link TEXT;
BEGIN
  -- Only for newly-issued critical recommendations.
  IF NEW.claim_type <> 'RECOMMENDATION' THEN RETURN NEW; END IF;
  IF NEW.status <> 'issued' THEN RETURN NEW; END IF;
  IF NEW.severity <> 'critical' THEN RETURN NEW; END IF;
  IF OLD.status = 'issued' THEN RETURN NEW; END IF;  -- not a fresh issue

  -- Don't notify twice for the same claim.
  IF EXISTS (SELECT 1 FROM intelligence_notification_log WHERE claim_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_business := NEW.business_id;
  v_rule_id := COALESCE(NEW.rule_id, 'intelligence');

  -- Target the business owner (the accountable party). Fall back to no-one if
  -- there is no owner row — the recommendation still surfaces in the Cockpit.
  SELECT id INTO v_owner_staff
  FROM staff
  WHERE business_id = v_business AND role = 'owner'
  ORDER BY created_at LIMIT 1;

  IF v_owner_staff IS NULL THEN
    RETURN NEW;  -- no owner to notify; recommendation remains in the Cockpit
  END IF;

  -- Humanized, specific message (§13/§18). The claim's statement already is
  -- humanized by the issuer; we keep the notification concise + actionable.
  v_title := 'Action needed: ' || v_rule_id;
  v_msg  := LEFT(COALESCE(NEW.statement, 'A critical recommendation was issued.'), 280);

  -- Deep-link to the Cockpit where the recommendation can be accepted/acted on.
  v_link := '/app/cockpit';

  BEGIN
    INSERT INTO notifications (business_id, staff_id, type, priority, title,
      message, link, source_type, related_id, is_read, created_at)
    VALUES (v_business, v_owner_staff, 'intelligence', 'urgent',
      v_title, v_msg, v_link, 'recommendation', NEW.id, false, NOW());

    INSERT INTO intelligence_notification_log (claim_id) VALUES (NEW.id)
    ON CONFLICT (claim_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Notification is best-effort: never break the recommendation (§24).
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_critical_recommendation ON claims;
CREATE TRIGGER trg_notify_critical_recommendation
  AFTER INSERT OR UPDATE OF status ON claims
  FOR EACH ROW
  EXECUTE FUNCTION notify_critical_recommendation();

-- The trigger writes notifications; grant matches the existing notifications
-- RLS pattern (service role / owner). The SECURITY DEFINER function runs as
-- the table owner so it can insert regardless of the caller's role.
COMMENT ON FUNCTION notify_critical_recommendation IS
'§25 — creates ONE notification for a newly-issued CRITICAL recommendation, targeted at the business owner. Best-effort (§24). Anti-spam: only critical severity, claims dedup prevents repeats, owner-only targeting.';
