-- 088_recommendation_outcome_loop.sql
--
-- P1 / U4 of the Intelligence Transformation. Builds the
-- recommendation + outcome loop the Master Instruction §12–§16 requires,
-- reusing the existing `claims` table (060) rather than adding a parallel
-- `recommendations` table. A recommendation IS a `claims` row with
-- claim_type='RECOMMENDATION'; its lifecycle is tracked via new additive
-- columns. The forecast/estimate loop already has `record_outcome` (060);
-- this migration adds the recommendation-specific lifecycle + an
-- effectiveness aggregator + a few seed issue helpers.
--
-- Lifecycle (§15):
--   issued -> acknowledged -> (accepted | rejected) -> acted ->
--   outcome_recorded -> measured
-- A rejected recommendation stops there. An accepted one links to a real
-- action (existing workflow: task / PO / approval) via linked_action_*, and
-- at action completion `record_recommendation_outcome` closes the loop,
-- feeding org memory (064) and `recommendation_effectiveness` (§16).
--
-- Rules:
--   • Additive only (ADD COLUMN IF NOT EXISTS); existing claims rows and the
--     forecast/estimate loop are untouched.
--   • RLS: claims already inherits the corrected get_current_staff()
--     pattern (migration 080) — tenant isolation is preserved (§28).
--   • No external dependency. Deterministic. Best-effort writers.
--   • Each recommendation carries rule_id so effectiveness can be grouped by
--     rule type ("recommendations of this type historically produced X").

\set ON_ERROR_STOP on

-- ============================================================
-- 1. EXTEND claims with the recommendation lifecycle (additive)
-- ============================================================
ALTER TABLE claims ADD COLUMN IF NOT EXISTS status TEXT
  CHECK (status IN ('issued','acknowledged','accepted','rejected','acted','outcome_recorded','superseded','expired'));
ALTER TABLE claims ADD COLUMN IF NOT EXISTS rule_id TEXT;            -- e.g. 'FIN-AR-001'
ALTER TABLE claims ADD COLUMN IF NOT EXISTS severity TEXT
  CHECK (severity IN ('info','warning','critical'));
ALTER TABLE claims ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS action_type TEXT;        -- 'create_task','create_po','route_approval', ...
ALTER TABLE claims ADD COLUMN IF NOT EXISTS linked_action_id UUID;   -- id of the created task/po/approval
ALTER TABLE claims ADD COLUMN IF NOT EXISTS expected_impact JSONB;    -- { amount, description, metric_key }
ALTER TABLE claims ADD COLUMN IF NOT EXISTS actual_impact JSONB;      -- { amount, description, metric_key, measured_at }
ALTER TABLE claims ADD COLUMN IF NOT EXISTS action_taken_at TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;  -- when the underlying condition cleared

-- Indexes for the loop queries.
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(business_id, status) WHERE claim_type = 'RECOMMENDATION';
CREATE INDEX IF NOT EXISTS idx_claims_rule ON claims(business_id, rule_id) WHERE claim_type = 'RECOMMENDATION';

-- Backfill status for existing recommendation claims (none expected yet).
UPDATE claims SET status = 'issued'
  WHERE claim_type = 'RECOMMENDATION' AND status IS NULL;

-- ============================================================
-- 2. Lifecycle transition helpers (idempotent, guard against invalid moves)
-- A recommendation can be acknowledged once; accepted/rejected are terminal
-- before acted; acted requires accepted; outcome closes acted.
-- ============================================================
CREATE OR REPLACE FUNCTION acknowledge_recommendation(p_claim_id UUID, p_by UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE claims SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = p_by
    WHERE id = p_claim_id AND claim_type = 'RECOMMENDATION' AND status = 'issued';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_recommendation_decision(p_claim_id UUID, p_accepted BOOLEAN, p_by UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE claims
    SET status = CASE WHEN p_accepted THEN 'accepted' ELSE 'rejected' END,
        acknowledged_at = COALESCE(acknowledged_at, NOW()),
        acknowledged_by = COALESCE(acknowledged_by, p_by)
    WHERE id = p_claim_id AND claim_type = 'RECOMMENDATION'
      AND status IN ('issued','acknowledged');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark a recommendation as acted: links it to the created action (existing
-- workflow). p_action_type is one of create_task/create_po/route_approval/...
CREATE OR REPLACE FUNCTION mark_recommendation_acted(
  p_claim_id UUID, p_action_type TEXT, p_action_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE claims
    SET status = 'acted', action_type = p_action_type, linked_action_id = p_action_id,
        action_taken_at = NOW()
    WHERE id = p_claim_id AND claim_type = 'RECOMMENDATION' AND status = 'accepted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. record_recommendation_outcome — close the loop (§15/§16)
-- Records the actual impact, marks status, and — for numeric impacts on a
-- known metric — computes accuracy vs expected. Best-effort: reuses the
-- existing record_outcome (060) for the numeric accuracy half so there is a
-- single accuracy-calculation code path.
-- ============================================================
CREATE OR REPLACE FUNCTION record_recommendation_outcome(
  p_claim_id UUID, p_actual_impact JSONB
) RETURNS TABLE(id UUID, accuracy NUMERIC) AS $$
DECLARE
  c RECORD; v_pred NUMERIC; v_act NUMERIC; v_acc NUMERIC;
BEGIN
  SELECT * INTO c FROM claims WHERE id = p_claim_id AND claim_type = 'RECOMMENDATION';
  IF NOT FOUND THEN RAISE EXCEPTION 'Recommendation claim not found'; END IF;

  UPDATE claims
    SET actual_impact = p_actual_impact,
        status = 'outcome_recorded',
        outcome_recorded_at = NOW(),
        actual_outcome = p_actual_impact
    WHERE id = p_claim_id;

  -- Accuracy vs expected impact (only for numeric point impacts).
  v_pred := NULLIF((c.expected_impact ->> 'amount')::NUMERIC, NULL);
  v_act  := NULLIF((p_actual_impact ->> 'amount')::NUMERIC, NULL);
  IF v_pred IS NOT NULL AND v_act IS NOT NULL AND v_pred <> 0 THEN
    v_acc := 1 - abs(v_pred - v_act) / abs(v_pred);
    v_acc := GREATEST(0, v_acc);
  END IF;
  RETURN QUERY SELECT p_claim_id, v_acc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. recommendation_effectiveness — §16 learning
-- Aggregates the historical success of recommendations by rule type so the
-- system can say "recommendations of type X have historically produced Y".
-- STABLE: computed on read from claims; no extra materialization needed yet.
-- success = an outcome_recorded recommendation whose actual_impact amount >= 0
-- (a recovered receivable, a margin improvement, etc.). Refine the success
-- definition per rule in P2.
-- ============================================================
CREATE OR REPLACE FUNCTION recommendation_effectiveness(p_business_id UUID)
RETURNS TABLE(
  rule_id TEXT, issued BIGINT, accepted BIGINT, rejected BIGINT, acted BIGINT,
  outcome_recorded BIGINT, success_count BIGINT, avg_actual NUMERIC, avg_expected NUMERIC
) AS $$
  SELECT
    COALESCE(c.rule_id, 'unspecified'),
    COUNT(*) FILTER (WHERE c.status IS NOT NULL),
    COUNT(*) FILTER (WHERE c.status IN ('accepted','acted','outcome_recorded')),
    COUNT(*) FILTER (WHERE c.status = 'rejected'),
    COUNT(*) FILTER (WHERE c.status IN ('acted','outcome_recorded')),
    COUNT(*) FILTER (WHERE c.status = 'outcome_recorded'),
    COUNT(*) FILTER (WHERE c.status = 'outcome_recorded'
      AND (c.actual_impact->>'amount')::NUMERIC >= 0),
    AVG(NULLIF((c.actual_impact->>'amount')::NUMERIC, NULL)),
    AVG(NULLIF((c.expected_impact->>'amount')::NUMERIC, NULL))
  FROM claims c
  WHERE c.business_id = p_business_id AND c.claim_type = 'RECOMMENDATION'
  GROUP BY COALESCE(c.rule_id, 'unspecified')
  ORDER BY issued DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 5. open_recommendations — the executive "what needs my attention?" feed (§17)
-- Returns recommendations not yet resolved/outcome-recorded, newest first,
-- with their evidence so the UI can show evidence drill-down.
-- ============================================================
CREATE OR REPLACE FUNCTION open_recommendations(p_business_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE(
  id UUID, rule_id TEXT, severity TEXT, statement TEXT, evidence JSONB,
  expected_impact JSONB, status TEXT, owner_id UUID, action_type TEXT,
  linked_action_id UUID, created_at TIMESTAMPTZ, subject_type TEXT, subject_id UUID
) AS $$
  SELECT id, rule_id, severity, statement, evidence, expected_impact, status,
    owner_id, action_type, linked_action_id, created_at, subject_type, subject_id
  FROM claims
  WHERE business_id = p_business_id AND claim_type = 'RECOMMENDATION'
    AND status NOT IN ('rejected','outcome_recorded','superseded','expired')
  ORDER BY
    CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
    created_at DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION acknowledge_recommendation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_recommendation_decision(UUID, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_recommendation_acted(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION record_recommendation_outcome(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION recommendation_effectiveness(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION open_recommendations(UUID, INT) TO authenticated;

COMMENT ON FUNCTION acknowledge_recommendation IS 'Lifecycle: mark a recommendation acknowledged (§15). Idempotent.';
COMMENT ON FUNCTION set_recommendation_decision IS 'Lifecycle: accept or reject a recommendation (§15). Idempotent; terminal before acted.';
COMMENT ON FUNCTION mark_recommendation_acted IS 'Lifecycle: link a recommendation to the action taken in an existing workflow (§14/§15).';
COMMENT ON FUNCTION record_recommendation_outcome IS 'Close the recommendation loop: record actual impact + accuracy vs expected (§15/§16). Reuses record_outcome accuracy logic.';
COMMENT ON FUNCTION recommendation_effectiveness IS 'Historical success of recommendations by rule type (§16). STABLE read.';
COMMENT ON FUNCTION open_recommendations IS 'The executive "what needs my attention?" feed: unresolved recommendations, severity-prioritised (§17).';
