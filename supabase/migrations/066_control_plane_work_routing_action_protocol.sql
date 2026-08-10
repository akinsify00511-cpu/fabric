-- 066_control_plane_work_routing_action_protocol.sql
-- From the Developer Architecture "Last 3 Conversations" addendum.
-- Items: §2 Control Plane, §12 Universal Action Protocol, §22 Separation
-- of Duties, §23 Work Routing, §24 Handoff, §25 Dependency, §26 SLA,
-- §27 Escalation, §29 Decision Evidence, §30 Decision Rights, §32
-- Counterfactual.

-- ============================================================
-- §2 CONTROL PLANE — separate the machinery that governs execution from
-- the business modules themselves. A registry of all control-plane
-- objects (policies, rules, state machines, automation, audit configs)
-- so no business module reinvents its own identity/permissions/audit/
-- workflow/rules.
-- ============================================================
CREATE TABLE IF NOT EXISTS control_plane_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- What kind of control-plane object this is.
  object_type TEXT NOT NULL CHECK (object_type IN (
    'policy','rule','state_machine','workflow','automation',
    'audit_config','permission','sla','escalation','integration_config'
  )),
  name TEXT NOT NULL,
  description TEXT,
  -- Which business plane area it governs.
  governs_domain TEXT, -- finance/hr/sales/operations/...
  -- The machine-readable definition (JSON: triggers, conditions, actions).
  definition JSONB DEFAULT '{}'::JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE control_plane_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY control_plane_viewable ON control_plane_objects FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY control_plane_managing ON control_plane_objects FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- §22 SEPARATION OF DUTIES — prevent dangerous combinations such as
-- creating AND approving the same vendor/payment. check_separation_of_duties
-- is consulted before an approval is accepted.
-- ============================================================
CREATE TABLE IF NOT EXISTS separation_of_duties_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The entity type the rule applies to (invoice, vendor, payroll, payment…).
  entity_type TEXT NOT NULL,
  -- The actions that must NOT be performed by the same person.
  -- e.g. ['create','approve'] or ['create_vendor','raise_po','approve_payment']
  incompatible_actions TEXT[] NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE separation_of_duties_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY sod_viewable ON separation_of_duties_rules FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY sod_managing ON separation_of_duties_rules FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- check_separation_of_duties: given a staff member and an entity they
-- already acted on, return whether they may perform the new action.
-- Uses the audit log (business_events) to detect prior actions.
CREATE OR REPLACE FUNCTION check_separation_of_duties(
  p_business_id UUID, p_staff_id UUID, p_entity_type TEXT,
  p_entity_id UUID, p_action TEXT
) RETURNS TABLE(allowed BOOLEAN, violated_rule TEXT) AS $$
DECLARE
  r RECORD;
  v_prior_actions TEXT[];
BEGIN
  -- Collect the actions this person already performed on this entity.
  SELECT COALESCE(array_agg(DISTINCT (e.payload->>'action')) FILTER (WHERE e.payload->>'action' IS NOT NULL), '{}'::TEXT[])
  INTO v_prior_actions
  FROM business_events e
  WHERE e.business_id = p_business_id
    AND e.entity_type = p_entity_type AND e.entity_id = p_entity_id
    AND e.payload->>'actor_id' = p_staff_id::TEXT;

  FOR r IN SELECT * FROM separation_of_duties_rules
    WHERE business_id = p_business_id AND entity_type = p_entity_type AND is_active
  LOOP
    IF p_action = ANY(r.incompatible_actions)
       AND array_length(ARRAY(
         SELECT unnest(v_prior_actions) INTERSECT SELECT unnest(r.incompatible_actions)
       ), 1) > 0 THEN
      RETURN QUERY SELECT FALSE, r.description;
      RETURN;
    END IF;
  END LOOP;
  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- §23 WORK ROUTING — every request resolves to type, owner, reviewer,
-- approver, deadline, dependencies, next step. Routes can be computed
-- from the authority graph + workload, not just hardcoded.
-- ============================================================
CREATE TABLE IF NOT EXISTS work_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL, -- 'approval','review','task','decision'
  entity_type TEXT,
  entity_id UUID,
  -- The resolved routing.
  owner_id UUID REFERENCES staff(id),
  reviewer_id UUID REFERENCES staff(id),
  approver_id UUID REFERENCES staff(id),
  deadline TIMESTAMPTZ,
  -- Dependencies (other routes that must complete first).
  depends_on UUID[] DEFAULT '{}'::UUID[],
  next_step TEXT,
  -- Status of the route itself.
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','done','cancelled','escalated')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE work_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_routes_viewable ON work_routes FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY work_routes_managing ON work_routes FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE TRIGGER work_routes_updated_at BEFORE UPDATE ON work_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- route_work: resolve a request to an owner/approver using authority_graph
-- and detect blocked routes from open dependencies.
CREATE OR REPLACE FUNCTION route_work(
  p_business_id UUID, p_request_type TEXT, p_entity_type TEXT, p_entity_id UUID
) RETURNS UUID AS $$
DECLARE
  v_route_id UUID; v_approver UUID;
BEGIN
  -- Find the first active approver for this entity type in authority_graph.
  SELECT staff_id INTO v_approver FROM authority_graph
  WHERE business_id = p_business_id AND entity_type = p_entity_type
    AND authority_type = 'approve' AND is_active
  ORDER BY approval_limit DESC NULLS LAST LIMIT 1;

  INSERT INTO work_routes (business_id, request_type, entity_type, entity_id,
    owner_id, approver_id, status, created_at)
  VALUES (p_business_id, p_request_type, p_entity_type, p_entity_id,
    v_approver, v_approver, 'open', NOW())
  RETURNING id INTO v_route_id;

  RETURN v_route_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §24 HANDOFF — every handoff carries context, objective, status, owner,
-- next action, deadline, dependencies and evidence.
-- ============================================================
CREATE TABLE IF NOT EXISTS handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- From -> to.
  from_staff_id UUID REFERENCES staff(id),
  to_staff_id UUID REFERENCES staff(id),
  -- The handoff context.
  context TEXT NOT NULL,
  objective TEXT,
  status TEXT DEFAULT 'handed_off' CHECK (status IN ('handed_off','accepted','declined','completed')),
  next_action TEXT,
  deadline TIMESTAMPTZ,
  -- Dependencies + evidence.
  depends_on UUID[] DEFAULT '{}'::UUID[],
  evidence JSONB DEFAULT '[]'::JSONB,
  -- The business entity the handoff is about.
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY handoffs_viewable ON handoffs FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY handoffs_managing ON handoffs FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- §25 DEPENDENCY — represent blockers/prerequisites explicitly and
-- surface blocked work automatically. A generic dependency table usable
-- across tasks, work_routes, handoffs, projects.
-- ============================================================
CREATE TABLE IF NOT EXISTS work_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The dependent item.
  dependent_type TEXT NOT NULL, -- 'task','work_route','handoff','project'
  dependent_id UUID NOT NULL,
  -- The prerequisite item.
  prerequisite_type TEXT NOT NULL,
  prerequisite_id UUID NOT NULL,
  -- Whether the prerequisite is satisfied.
  satisfied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dependent_type, dependent_id, prerequisite_type, prerequisite_id)
);

ALTER TABLE work_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_deps_viewable ON work_dependencies FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY work_deps_managing ON work_dependencies FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- blocked_work: list items whose dependencies are not yet satisfied.
CREATE OR REPLACE FUNCTION blocked_work(p_business_id UUID)
RETURNS TABLE(dependent_type TEXT, dependent_id UUID, unsatisfied_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT dependent_type, dependent_id, count(*) AS unsatisfied_count
  FROM work_dependencies
  WHERE business_id = p_business_id AND satisfied = FALSE
  GROUP BY dependent_type, dependent_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- §26 SLA — track created → assigned → acknowledged → started →
-- completed against targets, warnings and breaches.
-- ============================================================
CREATE TABLE IF NOT EXISTS sla_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  -- Target durations (hours) for each stage transition.
  target_assign_hours NUMERIC,
  target_ack_hours NUMERIC,
  target_start_hours NUMERIC,
  target_complete_hours NUMERIC,
  -- Warning at this % of target before breach.
  warning_threshold_pct NUMERIC DEFAULT 80,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sla_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sla_viewable ON sla_definitions FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY sla_managing ON sla_definitions FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE TABLE IF NOT EXISTS sla_trackers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Computed status.
  sla_status TEXT DEFAULT 'on_track' CHECK (sla_status IN ('on_track','warning','breached','completed')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sla_trackers ENABLE ROW LEVEL SECURITY;
CREATE POLICY sla_track_viewable ON sla_trackers FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY sla_track_managing ON sla_trackers FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- sla_breaches: list SLA trackers that are warning or breached.
CREATE OR REPLACE FUNCTION sla_breaches(p_business_id UUID)
RETURNS TABLE(entity_type TEXT, entity_id UUID, sla_status TEXT, age_hours NUMERIC, target_hours NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT t.entity_type, t.entity_id, t.sla_status,
    round(extract(epoch from (now() - t.created_at))/3600, 1),
    d.target_complete_hours
  FROM sla_trackers t
  LEFT JOIN sla_definitions d ON d.business_id = t.business_id AND d.entity_type = t.entity_type AND d.is_active
  WHERE t.business_id = p_business_id AND t.sla_status IN ('warning','breached');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- §27 ESCALATION — escalate by time, severity, financial impact,
-- customer impact, strategic importance. Rules drive who/when.
-- ============================================================
CREATE TABLE IF NOT EXISTS escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  -- Trigger condition (JSON): {hours_open, severity_min, amount_min, ...}.
  trigger_condition JSONB DEFAULT '{}'::JSONB,
  -- Escalate to.
  escalate_to_staff_id UUID REFERENCES staff(id),
  escalate_to_role TEXT, -- 'manager','cfo','ceo' fallback if no staff
  severity TEXT DEFAULT 'warning',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY escalation_viewable ON escalation_rules FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY escalation_managing ON escalation_rules FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- §29 DECISION EVIDENCE — material recommendations show question,
-- evidence, data quality, conflicting evidence, assumptions, options,
-- recommendation, risk and expected outcome.
-- §30 DECISION RIGHTS — record owner, contributors, reviewer, approver,
-- affected parties, escalation authority.
-- §32 COUNTERFACTUAL — what if nothing/more/less/other.
-- ============================================================
CREATE TABLE IF NOT EXISTS decision_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  -- §29 structured evidence.
  evidence JSONB DEFAULT '[]'::JSONB,
  data_quality_assessment JSONB,
  conflicting_evidence JSONB DEFAULT '[]'::JSONB,
  assumptions JSONB DEFAULT '[]'::JSONB,
  options JSONB DEFAULT '[]'::JSONB, -- each option with pros/cons/expected outcome
  recommendation TEXT,
  recommendation_type TEXT CHECK (recommendation_type IN ('FACT','INFERENCE','ESTIMATE','RECOMMENDATION','DECISION')),
  risk TEXT,
  expected_outcome JSONB,
  -- §32 counterfactuals.
  counterfactuals JSONB DEFAULT '{}'::JSONB, -- {nothing, more, less, alternative}
  -- §30 decision rights.
  decision_owner UUID REFERENCES staff(id),
  contributors UUID[] DEFAULT '{}'::UUID[],
  reviewer_id UUID REFERENCES staff(id),
  approver_id UUID REFERENCES staff(id),
  affected_parties UUID[] DEFAULT '{}'::UUID[],
  escalation_authority UUID REFERENCES staff(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','proposed','reviewed','approved','rejected','executed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE decision_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_records_viewable ON decision_records FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY decision_records_managing ON decision_records FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE TRIGGER decision_records_updated_at BEFORE UPDATE ON decision_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- §12 UNIVERSAL AVENIZE ACTION PROTOCOL — 12-step lifecycle.
-- IDENTIFY→UNDERSTAND→VALIDATE→CONTEXTUALIZE→AUTHORIZE→ASSESS→
-- SIMULATE→EXECUTE→VERIFY→AUDIT→MEASURE→LEARN. Every material action
-- records its progress through these steps.
-- ============================================================
CREATE TABLE IF NOT EXISTS action_protocol_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- What initiated the action.
  initiator_type TEXT, -- 'user','agent','automation','system'
  initiator_id UUID,
  -- What is being requested/happened.
  understanding TEXT,
  -- Which entities/policies/objectives are involved.
  context JSONB DEFAULT '{}'::JSONB,
  -- Per-step state with timestamps + results.
  steps JSONB DEFAULT '[]'::JSONB, -- [{step:'IDENTIFY', status:'done', at:..., note:...}, ...]
  current_step TEXT DEFAULT 'IDENTIFY',
  -- Outcomes.
  verification_result TEXT,
  measurement JSONB,
  lesson TEXT,
  -- The action's risk classification.
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE action_protocol_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY action_runs_viewable ON action_protocol_runs FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY action_runs_managing ON action_protocol_runs FOR ALL
  USING (business_id in (SELECT id FROM businesses));

CREATE TRIGGER action_protocol_updated_at BEFORE UPDATE ON action_protocol_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- The ordered steps of the protocol.
CREATE OR REPLACE FUNCTION action_protocol_steps()
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY['IDENTIFY','UNDERSTAND','VALIDATE','CONTEXTUALIZE','AUTHORIZE','ASSESS','SIMULATE','EXECUTE','VERIFY','AUDIT','MEASURE','LEARN'];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- advance_action_step: move a run to the next step, appending to steps[].
CREATE OR REPLACE FUNCTION advance_action_step(
  p_run_id UUID, p_step TEXT, p_note TEXT DEFAULT NULL, p_result JSONB DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_all TEXT[]; v_idx INTEGER; v_current TEXT;
BEGIN
  v_all := action_protocol_steps();
  SELECT current_step INTO v_current FROM action_protocol_runs WHERE id = p_run_id;
  v_idx := array_position(v_all, p_step);
  UPDATE action_protocol_runs SET
    steps = steps || jsonb_build_object('step', p_step, 'status', 'done', 'at', NOW(), 'note', p_note, 'result', p_result),
    current_step = CASE WHEN v_idx < array_length(v_all, 1) THEN v_all[v_idx+1] ELSE 'COMPLETE' END,
    updated_at = NOW()
  WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE control_plane_objects IS 'Control plane registry: no business module reinvents identity/permissions/audit/workflow/rules (§2).';
COMMENT ON TABLE separation_of_duties_rules IS 'Prevent create+approve same entity (§22).';
COMMENT ON TABLE work_routes IS 'Every request resolves to owner/reviewer/approver/deadline/dependencies/next step (§23).';
COMMENT ON TABLE handoffs IS 'Handoff carries context/objective/status/owner/next action/deadline/dependencies/evidence (§24).';
COMMENT ON TABLE work_dependencies IS 'Blocked work surfaced automatically (§25).';
COMMENT ON TABLE sla_trackers IS 'SLA stage tracking + breach detection (§26).';
COMMENT ON TABLE escalation_rules IS 'Escalate by time/severity/financial/customer impact (§27).';
COMMENT ON TABLE decision_records IS 'Decision evidence + rights + counterfactuals (§29/§30/§32).';
COMMENT ON TABLE action_protocol_runs IS '12-step Universal Action Protocol lifecycle (§12).';
