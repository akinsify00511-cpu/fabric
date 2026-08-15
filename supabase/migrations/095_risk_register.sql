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

\set ON_ERROR_STOP on

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
    'by_category', COALESCE(
      (SELECT jsonb_object_agg(category, cat_data)
       FROM (
         SELECT category, jsonb_build_object(
           'total', count(*),
           'open', count(*) FILTER (WHERE status = 'open'),
           'avg_score', round(avg(risk_score)::numeric, 1)
         ) AS cat_data
         FROM business_risks
         WHERE business_id = p_business_id
         GROUP BY category
       ) sub),
      '{}'::jsonb
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
