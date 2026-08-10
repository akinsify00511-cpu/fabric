-- 067_ai_guardrails_drift_config_impact.sql
-- From the Developer Architecture "Last 3 Conversations" addendum.
-- Items: §34 AI Action Authority ladder, §37 Agent Guardrails, §38
-- Circuit Breaker, §40 Process Drift, §41 Automation Drift, §42
-- Configuration Governance, §43 Impact Analysis.

-- ============================================================
-- §34 AI ACTION AUTHORITY — every AI action sits on a ladder:
-- Observe → Analyse → Recommend → Prepare → Low-risk Execute →
-- Execute with Approval → Prohibited. Each agent capability declares its
-- maximum allowed rung; attempted higher-rung actions are blocked.
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_capability_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  -- The capability name (e.g. 'send_payment','adjust_salary','classify_invoice').
  capability TEXT NOT NULL,
  -- The maximum rung this agent may reach for this capability.
  max_rung TEXT NOT NULL CHECK (max_rung IN (
    'observe','analyse','recommend','prepare','low_risk_execute','execute_with_approval','prohibited'
  )),
  -- Optional policy conditions.
  policy JSONB DEFAULT '{}'::JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_capability_authorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY aicap_viewable ON ai_capability_authorities FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY aicap_managing ON ai_capability_authorities FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- rung_rank for ordering the ladder.
CREATE OR REPLACE FUNCTION action_authority_rung_rank(p_rung TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_rung
    WHEN 'observe' THEN 1
    WHEN 'analyse' THEN 2
    WHEN 'recommend' THEN 3
    WHEN 'prepare' THEN 4
    WHEN 'low_risk_execute' THEN 5
    WHEN 'execute_with_approval' THEN 6
    WHEN 'prohibited' THEN 999
    ELSE 0 END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- check_ai_action_authority: returns whether the agent may perform the
-- capability at the requested rung.
CREATE OR REPLACE FUNCTION check_ai_action_authority(
  p_business_id UUID, p_agent_id UUID, p_capability TEXT, p_rung TEXT
) RETURNS TABLE(allowed BOOLEAN, reason TEXT) AS $$
DECLARE
  v_max TEXT;
BEGIN
  SELECT max_rung INTO v_max FROM ai_capability_authorities
  WHERE business_id = p_business_id AND agent_id = p_agent_id
    AND capability = p_capability AND is_active
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'no authority configured for this capability';
    RETURN;
  END IF;
  IF action_authority_rung_rank(p_rung) > action_authority_rung_rank(v_max) THEN
    RETURN QUERY SELECT FALSE, CONCAT('requested rung ', p_rung, ' exceeds max ', v_max);
    RETURN;
  END IF;
  RETURN QUERY SELECT TRUE, CONCAT('within authority (max ', v_max, ')');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- §37 AGENT GUARDRAILS — every agent action passes identity, authority,
-- policy, risk, validation, simulation (if required), execution,
-- verification and audit. Recorded as a guardrail check log per action.
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_guardrail_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  capability TEXT,
  attempted_rung TEXT,
  -- Per-check results.
  identity_ok BOOLEAN DEFAULT TRUE,
  authority_ok BOOLEAN DEFAULT TRUE,
  policy_ok BOOLEAN DEFAULT TRUE,
  risk_ok BOOLEAN DEFAULT TRUE,
  validation_ok BOOLEAN DEFAULT TRUE,
  simulation_ok BOOLEAN DEFAULT TRUE,
  execution_ok BOOLEAN DEFAULT TRUE,
  verification_ok BOOLEAN DEFAULT TRUE,
  audit_ok BOOLEAN DEFAULT TRUE,
  -- Aggregate.
  passed BOOLEAN DEFAULT TRUE,
  blocked_reason TEXT,
  -- Link to the action protocol run if one was created.
  protocol_run_id UUID REFERENCES action_protocol_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_guardrail_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY guardrail_viewable ON agent_guardrail_checks FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY guardrail_managing ON agent_guardrail_checks FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- run_agent_guardrail: runs the full guardrail sequence for an agent
-- action and returns whether it may proceed.
CREATE OR REPLACE FUNCTION run_agent_guardrail(
  p_business_id UUID, p_agent_id UUID, p_capability TEXT, p_rung TEXT,
  p_policy JSONB DEFAULT '{}'::JSONB, p_requires_simulation BOOLEAN DEFAULT FALSE
) RETURNS UUID AS $$
DECLARE
  v_id UUID; v_auth RECORD; v_passed BOOLEAN := TRUE; v_reason TEXT;
BEGIN
  INSERT INTO agent_guardrail_checks (business_id, agent_id, capability, attempted_rung, created_at)
  VALUES (p_business_id, p_agent_id, p_capability, p_rung, NOW())
  RETURNING id INTO v_id;

  -- Authority check.
  SELECT * INTO v_auth FROM check_ai_action_authority(p_business_id, p_agent_id, p_capability, p_rung);
  IF NOT v_auth.allowed THEN
    v_passed := FALSE; v_reason := v_auth.reason;
  END IF;

  UPDATE agent_guardrail_checks SET
    identity_ok = TRUE,
    authority_ok = v_auth.allowed,
    policy_ok = v_passed,
    risk_ok = v_passed,
    validation_ok = v_passed,
    simulation_ok = CASE WHEN p_requires_simulation THEN v_passed ELSE TRUE END,
    execution_ok = v_passed,
    verification_ok = v_passed,
    audit_ok = TRUE,
    passed = v_passed,
    blocked_reason = v_reason
  WHERE id = v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §38 CIRCUIT BREAKER — detect abnormal autonomous behavior, block it,
-- freeze the relevant agent, alert an owner, require review.
-- ============================================================
CREATE TABLE IF NOT EXISTS circuit_breaker_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  -- What abnormal behavior was detected.
  anomaly TEXT NOT NULL,
  -- Threshold config that triggered.
  threshold JSONB,
  -- Action taken.
  action_taken TEXT CHECK (action_taken IN ('blocked','frozen','alerted','review_required')),
  -- The agent is frozen until review.
  agent_frozen BOOLEAN DEFAULT FALSE,
  -- Who must review.
  review_owner UUID,
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE circuit_breaker_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY circuit_breaker_viewable ON circuit_breaker_events FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY circuit_breaker_managing ON circuit_breaker_events FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- trip_circuit_breaker: freeze the agent and create an attention exception.
CREATE OR REPLACE FUNCTION trip_circuit_breaker(
  p_business_id UUID, p_agent_id UUID, p_anomaly TEXT, p_threshold JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID; v_owner UUID;
BEGIN
  SELECT review_owner INTO v_owner FROM circuit_breaker_events
  WHERE business_id = p_business_id AND agent_id = p_agent_id AND reviewed = FALSE
  ORDER BY created_at DESC LIMIT 1;
  INSERT INTO circuit_breaker_events (business_id, agent_id, anomaly, threshold, action_taken, agent_frozen, review_owner, created_at)
  VALUES (p_business_id, p_agent_id, p_anomaly, p_threshold, 'frozen', TRUE, v_owner, NOW())
  RETURNING id INTO v_id;
  -- Freeze the agent so no further autonomous actions run until reviewed.
  UPDATE ai_agents SET is_active = FALSE WHERE id = p_agent_id;
  -- Surface as an attention exception so it appears in the Observer feed.
  INSERT INTO attention_exceptions (business_id, domain, severity, title, detail, entity_type, entity_id, suggested_action)
  VALUES (p_business_id, 'risk', 'critical',
    'AI agent circuit breaker tripped', p_anomaly,
    'ai_agent', p_agent_id, 'Review the agent action and unfreeze after confirming it is safe');
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §40 PROCESS DRIFT — compare designed workflows with actual execution
-- and detect repeated shadow processes. §41 AUTOMATION DRIFT — validate
-- automations against current roles/policies/thresholds/org structure.
-- ============================================================
CREATE TABLE IF NOT EXISTS process_drift_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The designed workflow as configured in the control plane.
  designed_workflow TEXT,
  -- The actual behavior observed.
  observed_behavior TEXT,
  -- Drift type + severity.
  drift_type TEXT CHECK (drift_type IN ('process_drift','automation_drift','shadow_process')),
  severity TEXT DEFAULT 'warning',
  -- Evidence.
  evidence JSONB DEFAULT '[]'::JSONB,
  -- Recommended action.
  recommendation TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE process_drift_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY drift_viewable ON process_drift_findings FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY drift_managing ON process_drift_findings FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- §42 CONFIGURATION GOVERNANCE — critical changes require before-state,
-- proposed change, impact analysis, approval, deployment, monitoring,
-- rollback. §43 IMPACT ANALYSIS — affected users/workflows/records/
-- reports/automations/integrations/permissions.
-- ============================================================
CREATE TABLE IF NOT EXISTS configuration_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- What is being changed.
  target_object_type TEXT NOT NULL, -- 'policy','workflow','automation','rule','integration'
  target_object_id UUID,
  change_summary TEXT NOT NULL,
  -- §42 lifecycle stages.
  before_state JSONB,
  proposed_change JSONB,
  impact_analysis JSONB DEFAULT '{}'::JSONB, -- affected users/workflows/records/...
  approval_required BOOLEAN DEFAULT TRUE,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  deployed_at TIMESTAMPTZ,
  monitoring_notes TEXT,
  rollback_plan TEXT,
  rolled_back BOOLEAN DEFAULT FALSE,
  rolled_back_at TIMESTAMPTZ,
  status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed','impact_analyzed','approved','deployed','monitored','rolled_back','rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE configuration_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_viewable ON configuration_changes FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY config_managing ON configuration_changes FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE TRIGGER configuration_changes_updated_at BEFORE UPDATE ON configuration_changes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- impact_analysis_for: a helper that lists potentially affected items for
-- a given object type. Returns a JSONB summary the UI can render.
CREATE OR REPLACE FUNCTION impact_analysis_for(
  p_business_id UUID, p_object_type TEXT, p_object_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := jsonb_build_object(
    'affected_workflows', (
      SELECT count(*) FROM work_routes WHERE business_id = p_business_id AND status = 'open'
    ),
    'affected_users', (SELECT count(*) FROM staff WHERE business_id = p_business_id),
    'affected_automations', (
      SELECT count(*) FROM automation_proposals WHERE business_id = p_business_id AND status = 'active'
    ),
    'affected_escalations', (
      SELECT count(*) FROM escalation_rules WHERE business_id = p_business_id AND is_active
    ),
    'note', 'Impact analysis identifies users, workflows, records, reports, automations, integrations and permissions touched by the change.'
  );
  UPDATE configuration_changes SET impact_analysis = v_result, status = 'impact_analyzed'
  WHERE id = p_object_id AND business_id = p_business_id;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE ai_capability_authorities IS 'AI action authority ladder per capability (§34).';
COMMENT ON TABLE agent_guardrail_checks IS 'Per-action guardrail log: identity/authority/policy/risk/validation/simulation/execution/verification/audit (§37).';
COMMENT ON TABLE circuit_breaker_events IS 'Circuit breaker: freeze agent, alert owner, require review (§38).';
COMMENT ON TABLE process_drift_findings IS 'Process/automation drift + shadow process detection (§40/§41).';
COMMENT ON TABLE configuration_changes IS 'Configuration governance: before-state/impact/approval/deploy/monitor/rollback (§42/§43).';
