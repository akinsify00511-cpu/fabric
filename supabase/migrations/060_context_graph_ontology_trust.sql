-- 060_context_graph_ontology_trust.sql
-- Layer 0 foundation pieces 3-6:
--   3. Business Context Graph (entity_relationships)
--   4. Canonical business ontology (business_ontology)
--   5. Data quality / reconciliation / conflict tracking (data_quality_checks)
--   6. Fact/Inference/Estimate/Recommendation/Decision typing (claims)

-- ============================================================
-- 3. BUSINESS CONTEXT GRAPH (§11)
-- Employee -> owns -> Deal -> belongs to -> Customer -> purchased ->
-- Product -> consumes -> Inventory; Deal -> creates -> Revenue -> affects
-- -> Cash -> affects -> Payroll affordability. The intelligence layer reads
-- these edges for cross-module search, impact analysis and reasoning.
-- ============================================================
CREATE TABLE IF NOT EXISTS entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  -- Relationship label, e.g. 'owns', 'belongs_to', 'purchased',
  -- 'creates', 'affects', 'manages', 'reports_to', 'consumes'.
  relationship TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  -- Strength/weight for impact analysis (1 = direct, lower = indirect).
  weight NUMERIC(5,2) DEFAULT 1.0,
  -- Where the edge came from (explicit, inferred, derived).
  origin TEXT DEFAULT 'derived' CHECK (origin IN ('explicit','inferred','derived','manual')),
  confidence NUMERIC(4,3),
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, source_type, source_id, relationship, target_type, target_id)
);

ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY entity_relationships_viewable ON entity_relationships FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY entity_relationships_managing ON entity_relationships FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_er_source ON entity_relationships(business_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_er_target ON entity_relationships(business_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_er_rel ON entity_relationships(relationship);

-- recursive_neighbors: find all entities reachable from a starting entity
-- within a depth, returning (entity_type, entity_id, depth, path). Used by
-- impact analysis ("if this deal closes, what else changes?").
CREATE OR REPLACE FUNCTION recursive_neighbors(
  p_business_id UUID,
  p_start_type TEXT,
  p_start_id UUID,
  p_max_depth INTEGER DEFAULT 3
) RETURNS TABLE(entity_type TEXT, entity_id UUID, depth INTEGER, path TEXT[]) AS $$
WITH RECURSIVE walk AS (
  SELECT source_type, source_id, target_type, target_id, relationship, 1 AS depth,
         ARRAY[source_type||':'||source_id, relationship, target_type||':'||target_id] AS path
  FROM entity_relationships
  WHERE business_id = p_business_id
    AND source_type = p_start_type AND source_id = p_start_id
  UNION
  SELECT er.source_type, er.source_id, er.target_type, er.target_id, er.relationship, w.depth + 1,
         w.path || er.relationship || (er.target_type||':'||er.target_id)
  FROM entity_relationships er
  JOIN walk w ON w.target_type = er.source_type AND w.target_id = er.source_id
  WHERE er.business_id = p_business_id AND w.depth < p_max_depth
)
SELECT DISTINCT target_type, target_id, depth, path FROM walk
UNION
SELECT p_start_type, p_start_id, 0, ARRAY[p_start_type||':'||p_start_id];
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- link_entities: helper domains call to record an edge.
CREATE OR REPLACE FUNCTION link_entities(
  p_business_id UUID, p_source_type TEXT, p_source_id UUID,
  p_relationship TEXT, p_target_type TEXT, p_target_id UUID,
  p_origin TEXT DEFAULT 'derived', p_confidence NUMERIC DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS VOID AS $$
BEGIN
  INSERT INTO entity_relationships (business_id, source_type, source_id,
    relationship, target_type, target_id, origin, confidence, metadata)
  VALUES (p_business_id, p_source_type, p_source_id, p_relationship,
    p_target_type, p_target_id, p_origin, p_confidence, p_metadata)
  ON CONFLICT (business_id, source_type, source_id, relationship, target_type, target_id)
  DO UPDATE SET metadata = EXCLUDED.metadata, confidence = COALESCE(EXCLUDED.confidence, entity_relationships.confidence);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. CANONICAL BUSINESS ONTOLOGY (§9)
-- Maps company-specific terms (e.g. "client", "prospect", "tenant") to the
-- canonical Avenize entity types, so a customer is one identity across
-- modules regardless of what each team calls them.
-- ============================================================
CREATE TABLE IF NOT EXISTS business_ontology (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Company-specific term a user or import might use.
  alias TEXT NOT NULL,
  -- The canonical entity type it maps to (matches entity_type used by the
  -- event bus, context graph and freshness layer).
  canonical_type TEXT NOT NULL,
  -- The actual table the canonical entity lives in, for resolution.
  canonical_table TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, alias)
);

ALTER TABLE business_ontology ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_ontology_viewable ON business_ontology FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY business_ontology_managing ON business_ontology FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- Seed common aliases so capture can resolve "client"/"prospect"/"tenant"
-- -> customer, "deal"/"opportunity"/"lead" -> deal, etc.
INSERT INTO business_ontology (business_id, alias, canonical_type, canonical_table, notes)
SELECT b.id, x.alias, x.canonical_type, x.canonical_table, x.notes
FROM businesses b
CROSS JOIN (VALUES
  ('client','customer','contacts','customer alias'),
  ('prospect','customer','contacts','pre-sale customer'),
  ('tenant','customer','contacts','property tenant'),
  ('opportunity','deal','deals','sales opportunity'),
  ('lead','lead','leads','pre-qualified contact'),
  ('deal','deal','deals','sales deal'),
  ('invoice','invoice','invoices','billing document'),
  ('receipt','payment','payments','received payment'),
  ('staff','employee','staff','employee alias'),
  ('employee','employee','staff','canonical employee'),
  ('asset','asset','assets','equipment/asset'),
  ('task','task','tasks','work item'),
  ('product','product','products','sellable item'),
  ('service','service','services','billable service'),
  ('contract','contract','contracts','legal agreement')
) AS x(alias, canonical_type, canonical_table, notes)
ON CONFLICT (business_id, alias) DO NOTHING;

-- resolve_canonical: given an alias, return the canonical (type, table).
CREATE OR REPLACE FUNCTION resolve_canonical(p_business_id UUID, p_alias TEXT)
RETURNS TABLE(canonical_type TEXT, canonical_table TEXT) AS $$
SELECT canonical_type, canonical_table FROM business_ontology
WHERE business_id = p_business_id AND lower(alias) = lower(p_alias)
LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 5. DATA QUALITY / RECONCILIATION / CONFLICT (§19, tables 8 & 9)
-- When CRM says 100m, accounting 93m and bank 89m, flag the discrepancy
-- instead of silently picking a number.
-- ============================================================
CREATE TABLE IF NOT EXISTS data_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- What is being reconciled, e.g. 'revenue', 'receivables', 'headcount'.
  metric TEXT NOT NULL,
  -- Per-source values that should agree.
  sources JSONB NOT NULL DEFAULT '{}'::JSONB, -- { "crm": 100m, "accounting": 93m, "bank": 89m }
  -- Detected state.
  status TEXT DEFAULT 'ok' CHECK (status IN ('ok','conflict','missing','stale')),
  -- How far apart the sources are, for severity.
  max_delta NUMERIC(18,2),
  -- Proposed resolution / where to look.
  resolution_hint TEXT,
  -- The freshness of each source at check time.
  source_freshness JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

ALTER TABLE data_quality_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY dq_viewable ON data_quality_checks FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY dq_managing ON data_quality_checks FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_dq_business_status ON data_quality_checks(business_id, status, created_at DESC);

-- record_reconciliation: compare a set of source values for a metric and
-- store the conflict if they disagree beyond a tolerance.
CREATE OR REPLACE FUNCTION record_reconciliation(
  p_business_id UUID, p_metric TEXT, p_sources JSONB, p_tolerance NUMERIC DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_values NUMERIC[]; v_max NUMERIC; v_min NUMERIC; v_delta NUMERIC; v_status TEXT;
  v_keys TEXT[]; v_id UUID;
BEGIN
  SELECT array_agg((value->>0)::NUMERIC) INTO v_values
  FROM jsonb_each(p_sources);
  v_max := array_max(v_values);
  v_min := array_min(v_values);
  v_delta := v_max - v_min;
  IF v_max IS NULL THEN v_status := 'missing';
  ELSIF v_delta > p_tolerance THEN v_status := 'conflict';
  ELSE v_status := 'ok'; END IF;

  INSERT INTO data_quality_checks (business_id, metric, sources, status, max_delta)
  VALUES (p_business_id, p_metric, p_sources, v_status, v_delta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. FACT / INFERENCE / ESTIMATE / RECOMMENDATION / DECISION (§20, §22)
-- A platform-wide principle: every material datum and every AI output has
-- a claim_type so inference is never presented as fact.
-- ============================================================
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL CHECK (claim_type IN (
    'FACT','INFERENCE','ESTIMATE','RECOMMENDATION','DECISION'
  )),
  -- What the claim is about, in canonical (entity_type, entity_id) form.
  subject_type TEXT,
  subject_id UUID,
  -- The claim itself.
  statement TEXT NOT NULL,
  -- Supporting evidence (source, date, methodology, confidence).
  evidence JSONB DEFAULT '[]'::JSONB,
  confidence NUMERIC(4,3),
  -- For DECISION claims: who authorized it and why.
  authority TEXT,
  rationale TEXT,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  -- For forecast/estimate claims: assumptions and the predicted value/range.
  assumptions JSONB,
  predicted_value JSONB,
  -- Review date for the institutional learning loop (did it work?).
  review_date DATE,
  actual_outcome JSONB,
  outcome_recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY claims_viewable ON claims FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY claims_managing ON claims FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_claims_business_type ON claims(business_id, claim_type);
CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_claims_review ON claims(business_id, review_date) WHERE actual_outcome IS NULL;

-- record_outcome: close the learning loop on a forecast/estimate/decision
-- claim by recording what actually happened and computing accuracy.
CREATE OR REPLACE FUNCTION record_outcome(
  p_claim_id UUID, p_actual JSONB
) RETURNS TABLE(id UUID, accuracy NUMERIC) AS $$
DECLARE
  c RECORD; v_pred NUMERIC; v_act NUMERIC; v_acc NUMERIC;
BEGIN
  SELECT * INTO c FROM claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;
  UPDATE claims SET actual_outcome = p_actual, outcome_recorded_at = NOW()
  WHERE id = p_claim_id;
  -- Accuracy only meaningful for numeric point forecasts.
  v_pred := NULLIF((c.predicted_value ->> 'value')::NUMERIC, NULL);
  v_act := NULLIF((p_actual ->> 'value')::NUMERIC, NULL);
  IF v_pred IS NOT NULL AND v_act IS NOT NULL AND v_pred <> 0 THEN
    v_acc := 1 - abs(v_pred - v_act) / abs(v_pred);
    v_acc := GREATEST(0, v_acc);
  END IF;
  RETURN QUERY SELECT p_claim_id, v_acc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE entity_relationships IS 'Business Context Graph edges (§11). recursive_neighbors() walks for impact analysis.';
COMMENT ON TABLE business_ontology IS 'Company-specific term -> canonical entity mapping (§9).';
COMMENT ON TABLE data_quality_checks IS 'Cross-source reconciliation records; status conflict/missing/stale (§19).';
COMMENT ON TABLE claims IS 'Fact/Inference/Estimate/Recommendation/Decision typed records with evidence (§20, §22).';
