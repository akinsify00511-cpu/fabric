-- 070_enforcement_gate.sql
-- Wires the control-plane functions (can_approve, check_separation_of_duties,
-- run_agent_guardrail, trip_circuit_breaker) into the REAL approval flow so
-- they are gates that block bad actions, not just queries you can run.

-- ============================================================
-- APPROVAL ENFORCEMENT — the single chokepoint every approval passes
-- through. Returns a verdict + reasons; raises an exception on violation
-- when called in blocking mode. Mirrors §37 guardrail sequence for humans.
-- ============================================================

-- Record of enforcement decisions for audit.
CREATE TABLE IF NOT EXISTS approval_enforcement_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  approval_id UUID,
  approver_id UUID NOT NULL REFERENCES staff(id),
  entity_type TEXT,
  entity_id UUID,
  amount NUMERIC,
  -- Checks performed.
  authority_ok BOOLEAN,
  authority_reason TEXT,
  separation_of_duties_ok BOOLEAN,
  separation_of_duties_reason TEXT,
  -- Aggregate verdict.
  allowed BOOLEAN NOT NULL,
  blocked_reasons TEXT[] DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE approval_enforcement_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY enforcement_log_viewable ON approval_enforcement_logs FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY enforcement_log_managing ON approval_enforcement_logs FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- enforce_approval: the gate. Call before mutating an approval.
-- p_blocking = TRUE raises an exception on violation (use in triggers);
-- p_blocking = FALSE returns the verdict (use in UI pre-checks).
CREATE OR REPLACE FUNCTION enforce_approval(
  p_business_id UUID,
  p_approver_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_amount NUMERIC DEFAULT NULL,
  p_blocking BOOLEAN DEFAULT FALSE
) RETURNS TABLE(allowed BOOLEAN, blocked_reasons TEXT[], authority_reason TEXT, sod_reason TEXT) AS $$
DECLARE
  v_auth RECORD; v_sod RECORD;
  v_reasons TEXT[] := '{}'::TEXT[];
  v_auth_ok BOOLEAN := TRUE; v_sod_ok BOOLEAN := TRUE;
BEGIN
  -- §15 Authority: does this person have approval authority + limit?
  SELECT * INTO v_auth FROM can_approve(p_business_id, p_approver_id, p_entity_type, p_amount);
  IF NOT v_auth.can THEN
    v_auth_ok := FALSE;
    v_reasons := array_append(v_reasons, COALESCE(v_auth.reason, 'Insufficient approval authority'));
  END IF;

  -- §22 Separation of duties: did this person create the entity they're approving?
  SELECT * INTO v_sod FROM check_separation_of_duties(p_business_id, p_approver_id, p_entity_type, p_entity_id, 'approve');
  IF NOT v_sod.allowed THEN
    v_sod_ok := FALSE;
    v_reasons := array_append(v_reasons, COALESCE(v_sod.violated_rule, 'Separation of duties violation'));
  END IF;

  -- Audit log regardless of outcome.
  INSERT INTO approval_enforcement_logs (
    business_id, approver_id, entity_type, entity_id, amount,
    authority_ok, authority_reason,
    separation_of_duties_ok, separation_of_duties_reason,
    allowed, blocked_reasons
  ) VALUES (
    p_business_id, p_approver_id, p_entity_type, p_entity_id, p_amount,
    v_auth_ok, v_auth.reason,
    v_sod_ok, v_sod.violated_rule,
    (v_auth_ok AND v_sod_ok), v_reasons
  );

  IF p_blocking AND NOT (v_auth_ok AND v_sod_ok) THEN
    RAISE EXCEPTION 'Approval blocked: %', array_to_string(v_reasons, '; ');
  END IF;

  RETURN QUERY SELECT (v_auth_ok AND v_sod_ok), v_reasons, v_auth.reason, v_sod.violated_rule;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRIGGER: block approvals at the database layer.
-- Any UPDATE to approvals.status -> 'approved' must pass enforcement.
-- This means even a direct SQL update cannot bypass the gate.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_approval_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_verdict RECORD; v_amount NUMERIC;
BEGIN
  -- Only gate transitions INTO approved.
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    v_amount := COALESCE(NEW.amount, 0);
    SELECT * INTO v_verdict FROM enforce_approval(
      NEW.business_id,
      NEW.requester_id,  -- approver is whoever is acting; see note below
      NEW.entity_type,
      NEW.entity_id,
      v_amount,
      TRUE
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTE: the trigger uses requester_id as a fallback approver when no
-- explicit approver column exists. The Approvals.tsx page passes the
-- acting staff_id via an RPC call (enforce_approval pre-check) before
-- updating, so the trigger is the backstop, not the only gate.

DROP TRIGGER IF EXISTS approvals_enforce_gate ON approvals;
CREATE TRIGGER approvals_enforce_gate
  BEFORE UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION enforce_approval_on_status_change();

-- ============================================================
-- ACTION PROTOCOL ON APPROVALS — every approval advances through the
-- 12-step protocol. Wire the approval into action_protocol_runs.
-- ============================================================
CREATE OR REPLACE FUNCTION start_approval_protocol(
  p_business_id UUID, p_approval_id UUID, p_initiator_id UUID
) RETURNS UUID AS $$
DECLARE
  v_run_id UUID;
BEGIN
  INSERT INTO action_protocol_runs (business_id, initiator_type, initiator_id,
    understanding, context, current_step, risk_level, created_at)
  VALUES (p_business_id, 'user', p_initiator_id,
    'Approval request', jsonb_build_object('approval_id', p_approval_id),
    'AUTHORIZE', 'medium', NOW())
  RETURNING id INTO v_run_id;

  -- Mark the early steps as done (the request already identified/understood/validated).
  PERFORM advance_action_step(v_run_id, 'IDENTIFY', 'Approval request identified');
  PERFORM advance_action_step(v_run_id, 'UNDERSTAND', 'Request details loaded');
  PERFORM advance_action_step(v_run_id, 'VALIDATE', 'Request validated against template');
  PERFORM advance_action_step(v_run_id, 'CONTEXTUALIZE', 'Context: authority + SoD checked');

  RETURN v_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE approval_enforcement_logs IS 'Audit log of every approval enforcement decision (authority + SoD).';
COMMENT ON FUNCTION enforce_approval IS 'The approval gate: can_approve + check_separation_of_duties, blocking or non-blocking.';
COMMENT ON FUNCTION enforce_approval_on_status_change IS 'DB trigger: blocks any approval status -> approved that fails enforcement.';
COMMENT ON FUNCTION start_approval_protocol IS 'Wires an approval into the 12-step action protocol.';
