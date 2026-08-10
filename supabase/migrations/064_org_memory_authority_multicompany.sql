-- 064_org_memory_authority_multicompany.sql
-- Layer 2 items 20, 21, 22:
--   20. Organizational memory + institutional learning loop (Doc1 §31; Doc2 §15, §20)
--   21. Authority graph — ownership/limits/delegation (Doc1 §15, table 6)
--   22. Multi-company / branch / country hierarchy (Doc1 §25)

-- ============================================================
-- 20. ORGANIZATIONAL MEMORY + INSTITUTIONAL LEARNING LOOP
-- Hypothesis -> Decision -> Action -> Result -> Comparison -> Learning
-- -> Future decision. Links decisions to outcomes and surfaces historical
-- decisions when similar situations recur. Detects knowledge trapped in
-- individuals (decisions owned by one person, not communicated).
-- ============================================================

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The decision's context.
  title TEXT NOT NULL,
  context TEXT,
  -- The hypothesis / expected outcome the decision was based on.
  hypothesis TEXT NOT NULL,
  assumptions JSONB DEFAULT '[]'::JSONB,
  -- Links to canonical entities it affects (projects, people, customers…).
  affected_entities JSONB DEFAULT '[]'::JSONB,
  -- The DECISION claim it produces (authoritative, recorded).
  authority TEXT,
  rationale TEXT,
  decided_by UUID,
  decided_at TIMESTAMPTZ DEFAULT NOW(),
  -- Whether affected teams were communicated to.
  communicated BOOLEAN DEFAULT FALSE,
  communicated_to JSONB DEFAULT '[]'::JSONB,
  -- Review date to close the learning loop.
  review_date DATE,
  -- Actual outcome + learning (filled at review).
  actual_outcome TEXT,
  what_worked TEXT,
  what_learned TEXT,
  learning_tags TEXT[] DEFAULT '{}'::TEXT[],
  -- Lifecycle.
  status TEXT DEFAULT 'made' CHECK (status IN ('made','reviewed','superseded','archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY decisions_viewable ON decisions FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY decisions_managing ON decisions FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_decisions_review ON decisions(business_id, review_date) WHERE status = 'made';
CREATE INDEX IF NOT EXISTS idx_decisions_tags ON decisions USING GIN (learning_tags);

CREATE TRIGGER decisions_updated_at BEFORE UPDATE ON decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- record_decision_learning: close the loop at review time. Stores the
-- actual outcome, what worked, and the reusable learning + tags so it
-- surfaces for similar future situations.
CREATE OR REPLACE FUNCTION record_decision_learning(
  p_decision_id UUID, p_actual_outcome TEXT, p_what_worked TEXT,
  p_what_learned TEXT, p_tags TEXT[] DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
  UPDATE decisions SET
    actual_outcome = p_actual_outcome,
    what_worked = p_what_worked,
    what_learned = p_what_learned,
    learning_tags = p_tags,
    status = 'reviewed',
    updated_at = NOW()
  WHERE id = p_decision_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- similar_decisions: retrieve past decisions whose context or tags overlap,
-- so users see "we decided something like this before" (organizational memory).
CREATE OR REPLACE FUNCTION similar_decisions(
  p_business_id UUID, p_query TEXT DEFAULT NULL, p_tags TEXT[] DEFAULT '{}'
) RETURNS TABLE(id UUID, title TEXT, context TEXT, what_learned TEXT, learning_tags TEXT[], decided_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT id, title, context, what_learned, learning_tags, decided_at
  FROM decisions
  WHERE business_id = p_business_id AND status = 'reviewed'
    AND (
      (p_query IS NULL OR context ILIKE '%' || p_query || '%' OR title ILIKE '%' || p_query || '%')
      OR (p_tags <> '{}'::TEXT[] AND learning_tags && p_tags)
    )
  ORDER BY decided_at DESC LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- knowledge_concentration: detect decisions/authority concentrated in one
-- person (knowledge trapped in individuals) — a continuity risk.
CREATE OR REPLACE FUNCTION knowledge_concentration(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_rows JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('decided_by', decided_by, 'decision_count', cnt)), '[]'::JSONB)
  INTO v_rows FROM (
    SELECT decided_by, count(*) AS cnt
    FROM decisions WHERE business_id = p_business_id AND decided_by IS NOT NULL
    GROUP BY decided_by HAVING count(*) > 3
    ORDER BY cnt DESC
  ) t;
  RETURN jsonb_build_object('concentrated_owners', v_rows, 'risk',
    CASE WHEN jsonb_array_length(v_rows) > 0 THEN 'knowledge concentrated in few people — capture and delegate' ELSE 'balanced' END,
    'type','INFERENCE');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 21. AUTHORITY GRAPH (Doc1 §15, table 6)
-- An organogram shows reporting; an authority graph shows who can own,
-- approve (with limits), delegate, and access what, under which policy.
-- The approvals engine should consult this.
-- ============================================================
CREATE TABLE IF NOT EXISTS authority_graph (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Who holds the authority.
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  -- What domain/entity type the authority applies to.
  entity_type TEXT NOT NULL, -- 'invoice','purchase_order','payroll','contract'…
  -- Scope: which company/branch/team/records (NULL = whole business).
  scope_type TEXT CHECK (scope_type IN ('business','branch','department','team','record')),
  scope_id UUID,
  -- The authority: approve up to a limit, own, delegate, access.
  authority_type TEXT NOT NULL CHECK (authority_type IN ('approve','own','delegate','access')),
  -- Monetary approval limit (NULL = unlimited within scope).
  approval_limit NUMERIC(18,2),
  currency TEXT DEFAULT 'USD',
  -- Policy conditions (JSON, e.g. { "max_monthly": 500000 }).
  policy JSONB DEFAULT '{}'::JSONB,
  -- Delegation: who acts if this person is unavailable.
  delegate_to UUID REFERENCES staff(id),
  delegation_active BOOLEAN DEFAULT FALSE,
  -- Effective period.
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE authority_graph ENABLE ROW LEVEL SECURITY;
CREATE POLICY authority_viewable ON authority_graph FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY authority_managing ON authority_graph FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_authority_staff ON authority_graph(business_id, staff_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_authority_scope ON authority_graph(business_id, scope_type, scope_id);

CREATE TRIGGER authority_graph_updated_at BEFORE UPDATE ON authority_graph
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- can_approve: the function the approvals engine consults. Given a staff
-- member, an entity type and an amount, returns whether they are within
-- authority (considering active delegation).
CREATE OR REPLACE FUNCTION can_approve(
  p_business_id UUID, p_staff_id UUID, p_entity_type TEXT, p_amount NUMERIC DEFAULT 0
) RETURNS TABLE(can BOOLEAN, via UUID, limit NUMERIC, reason TEXT) AS $$
DECLARE
  a RECORD; v_limit NUMERIC;
BEGIN
  -- Direct authority.
  SELECT * INTO a FROM authority_graph
  WHERE business_id = p_business_id AND staff_id = p_staff_id
    AND entity_type = p_entity_type AND authority_type = 'approve' AND is_active
    AND (valid_until IS NULL OR valid_until > NOW())
  ORDER BY approval_limit DESC NULLS LAST LIMIT 1;

  IF a.id IS NOT NULL THEN
    v_limit := COALESCE(a.approval_limit, p_amount); -- NULL limit = unlimited
    IF p_amount <= v_limit THEN
      RETURN QUERY SELECT TRUE, a.staff_id, a.approval_limit, 'within direct authority';
      RETURN;
    END IF;
  END IF;

  -- Delegation: someone delegated their authority to this staff member.
  SELECT * INTO a FROM authority_graph
  WHERE business_id = p_business_id AND delegate_to = p_staff_id
    AND entity_type = p_entity_type AND authority_type = 'approve'
    AND delegation_active AND is_active
    AND (valid_until IS NULL OR valid_until > NOW())
  ORDER BY approval_limit DESC NULLS LAST LIMIT 1;

  IF a.id IS NOT NULL THEN
    v_limit := COALESCE(a.approval_limit, p_amount);
    IF p_amount <= v_limit THEN
      RETURN QUERY SELECT TRUE, a.staff_id, a.approval_limit, CONCAT('via delegation from ', a.staff_id);
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT FALSE, NULL::UUID, NULL::NUMERIC, 'no matching authority';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 22. MULTI-COMPANY / BRANCH / COUNTRY (Doc1 §25)
-- Holding -> subsidiary -> branch -> department -> team -> individual.
-- Multiple currencies, fiscal periods, country tax/payroll, intercompany
-- transactions and consolidation.
-- ============================================================

-- company_entities: a business can belong to a holding/subsidiary tree.
CREATE TABLE IF NOT EXISTS company_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The entity this business represents in a group.
  entity_type TEXT NOT NULL CHECK (entity_type IN ('holding','subsidiary','branch','division','standalone')),
  name TEXT NOT NULL,
  -- Parent in the group tree.
  parent_entity_id UUID REFERENCES company_entities(id) ON DELETE CASCADE,
  -- Country + fiscal period config.
  country TEXT,
  base_currency TEXT DEFAULT 'USD',
  fiscal_year_start_month INTEGER DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  -- Tax/payroll compliance profile (country-specific rules reference this).
  tax_regime TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE company_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_entities_viewable ON company_entities FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY company_entities_managing ON company_entities FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_company_entities_parent ON company_entities(parent_entity_id);

-- Intercompany transactions between entities in a group.
CREATE TABLE IF NOT EXISTS intercompany_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  from_entity_id UUID NOT NULL REFERENCES company_entities(id) ON DELETE CASCADE,
  to_entity_id UUID NOT NULL REFERENCES company_entities(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  -- Whether it's been eliminated in consolidation.
  eliminated_in_consolidation BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE intercompany_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY intercompany_viewable ON intercompany_transactions FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY intercompany_managing ON intercompany_transactions FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- company_tree: recursive CTE returning the entity hierarchy.
CREATE OR REPLACE FUNCTION company_tree(p_business_id UUID, p_root_id UUID DEFAULT NULL)
RETURNS TABLE(entity_id UUID, name TEXT, entity_type TEXT, parent_entity_id UUID, depth INTEGER, path TEXT) AS $$
WITH RECURSIVE walk AS (
  SELECT id, name, entity_type, parent_entity_id, 0 AS depth,
         name::TEXT AS path
  FROM company_entities
  WHERE business_id = p_business_id
    AND (p_root_id IS NULL OR id = p_root_id)
  UNION ALL
  SELECT ce.id, ce.name, ce.entity_type, ce.parent_entity_id, w.depth + 1,
         w.path || ' > ' || ce.name
  FROM company_entities ce JOIN walk w ON ce.parent_entity_id = w.id
  WHERE ce.business_id = p_business_id
)
SELECT * FROM walk ORDER BY depth, name;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON TABLE decisions IS 'Organizational memory + learning loop (Doc1 §31; Doc2 §15, §20).';
COMMENT ON TABLE authority_graph IS 'Authority graph: ownership/approval-limits/delegation/access (Doc1 §15).';
COMMENT ON TABLE company_entities IS 'Multi-company group hierarchy (holding/subsidiary/branch) (Doc1 §25).';
