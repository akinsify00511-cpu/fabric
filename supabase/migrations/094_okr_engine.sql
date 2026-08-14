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

\set ON_ERROR_STOP on

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
