-- 069_four_reality_persona_intelligence.sql
-- From the Developer Architecture "Last 3 Conversations" addendum.
-- Items: §6 Four-Reality Model (Intended/System/Behavioural/Outcome +
-- discrepancy surfacing), §7-§11 Persona & Needs Intelligence.

-- ============================================================
-- §6 FOUR-REALITY MODEL — Avenize must distinguish and compare four
-- realities: Intended (how the org says a process works), System (what
-- Avenize records), Behavioural (what employees actually do), Outcome
-- (what actually happens to business/customer/market). When they
-- diverge, surface the discrepancy instead of declaring success.
-- ============================================================
CREATE TABLE IF NOT EXISTS four_reality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The process/domain being assessed.
  domain TEXT NOT NULL, -- 'procurement','payroll','sales','inventory'...
  -- The four realities.
  intended_reality TEXT,
  system_reality TEXT,
  behavioural_reality TEXT,
  outcome_reality TEXT,
  -- Measured indicators per reality (so divergence is quantitative).
  indicators JSONB DEFAULT '{}'::JSONB, -- {intended:{compliance:0.98}, system:{...}, ...}
  -- Discrepancy analysis.
  discrepancy_detected BOOLEAN DEFAULT FALSE,
  discrepancy_summary TEXT,
  -- Recommended action given the gap.
  recommendation TEXT,
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE four_reality_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY four_reality_viewable ON four_reality_assessments FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY four_reality_managing ON four_reality_assessments FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- assess_four_reality_discrepancy: compare the indicators and flag divergence.
CREATE OR REPLACE FUNCTION assess_four_reality_discrepancy(p_assessment_id UUID)
RETURNS JSONB AS $$
DECLARE
  a RECORD; v_intended JSONB; v_system JSONB; v_behavioural JSONB; v_outcome JSONB;
  v_max_diff NUMERIC; v_discrep BOOLEAN := FALSE; v_summary TEXT;
BEGIN
  SELECT * INTO a FROM four_reality_assessments WHERE id = p_assessment_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not found'); END IF;
  v_intended := a.indicators->'intended';
  v_system := a.indicators->'system';
  v_behavioural := a.indicators->'behavioural';
  v_outcome := a.indicators->'outcome';

  -- Simple numeric divergence: max absolute difference across matching keys.
  SELECT COALESCE(max(abs((i.value::NUMERIC) - (o.value::NUMERIC))), 0)
  INTO v_max_diff
  FROM jsonb_each_text(COALESCE(v_intended,'{}'::JSONB)) i
  JOIN jsonb_each_text(COALESCE(v_outcome,'{}'::JSONB)) o ON i.key = o.key
  WHERE i.value ~ '^[0-9.]+$' AND o.value ~ '^[0-9.]+$';

  v_discrep := v_max_diff > 0.1 OR (v_behavioural IS NOT NULL AND v_behavioural <> v_system);
  v_summary := CASE WHEN v_discrep
    THEN CONCAT('Reality gap detected: intended vs outcome divergence of ', round(v_max_diff::numeric,2), '. Avenize must surface this instead of declaring success.')
    ELSE 'Realities align within tolerance.' END;

  UPDATE four_reality_assessments SET
    discrepancy_detected = v_discrep,
    discrepancy_summary = v_summary
  WHERE id = p_assessment_id;

  RETURN jsonb_build_object('discrepancy_detected', v_discrep, 'summary', v_summary, 'max_divergence', v_max_diff);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §7 PERSONA & NEEDS INTELLIGENCE — first-class platform capability.
-- §86 Dynamic Persona Profile: identity, role, authority, responsibilities,
-- objectives, KPIs, skills, experience, workload, interaction preferences,
-- common tasks, pain points, dependencies, constraints, behavior patterns,
-- information needs, decision needs, automation needs, accessibility needs.
-- ============================================================
CREATE TABLE IF NOT EXISTS persona_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  -- The persona archetype (CEO/Owner, CFO, HR Director, Sales Manager,
  -- Sales Rep, Manager, Junior Staff, Intern — from §9 table).
  persona_type TEXT,
  -- §86 structured profile.
  role TEXT,
  authority JSONB DEFAULT '{}'::JSONB, -- from authority_graph
  responsibilities TEXT,
  objectives TEXT,
  kpis JSONB DEFAULT '[]'::JSONB,
  skills JSONB DEFAULT '[]'::JSONB,
  experience TEXT,
  -- Workload + behavior.
  workload_score NUMERIC DEFAULT 0, -- 0..1 normalized
  interaction_preferences JSONB DEFAULT '{}'::JSONB, -- {channel, detail_level, time_of_day}
  common_tasks JSONB DEFAULT '[]'::JSONB,
  pain_points JSONB DEFAULT '[]'::JSONB,
  dependencies JSONB DEFAULT '[]'::JSONB,
  constraints JSONB DEFAULT '[]'::JSONB,
  behavior_patterns JSONB DEFAULT '[]'::JSONB,
  -- Needs (§89: five need types).
  information_needs JSONB DEFAULT '[]'::JSONB,
  decision_needs JSONB DEFAULT '[]'::JSONB,
  automation_needs JSONB DEFAULT '[]'::JSONB,
  functional_needs JSONB DEFAULT '[]'::JSONB,
  coordination_needs JSONB DEFAULT '[]'::JSONB,
  outcome_needs JSONB DEFAULT '[]'::JSONB,
  -- Accessibility + capability.
  accessibility_needs JSONB DEFAULT '[]'::JSONB,
  capability_level TEXT DEFAULT 'intermediate' CHECK (capability_level IN ('beginner','intermediate','advanced','expert')),
  -- §96 persona success metrics.
  success_metrics JSONB DEFAULT '[]'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, staff_id)
);

ALTER TABLE persona_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY persona_viewable ON persona_profiles FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY persona_managing ON persona_profiles FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE TRIGGER persona_profiles_updated_at BEFORE UPDATE ON persona_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- §87 NEEDS IDENTIFICATION — infer operational needs from repeated
-- questions, searches, errors, abandoned workflows, manual exports,
-- support requests and repeated navigation. A signal log the discovery
-- loop (§11) reads from.
-- ============================================================
CREATE TABLE IF NOT EXISTS persona_need_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'repeated_question','repeated_search','error','abandoned_workflow',
    'manual_export','support_request','repeated_navigation','friction','backtracking'
  )),
  -- What was observed.
  detail JSONB DEFAULT '{}'::JSONB,
  -- The inferred underlying need (filled by the discovery loop).
  inferred_need TEXT,
  -- §88 Job-to-be-Done: job→information→workflow→action→outcome.
  job_to_be_done JSONB DEFAULT '{}'::JSONB,
  -- Whether the need has been validated with the user (§124).
  validated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE persona_need_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY need_signals_viewable ON persona_need_signals FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY need_signals_managing ON persona_need_signals FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- §8 PERSONA JOURNEY MAP — for every major persona and workflow:
-- trigger, goal, information required, decision, action, dependencies,
-- expected outcome, possible failure, recovery path.
-- ============================================================
CREATE TABLE IF NOT EXISTS persona_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  persona_type TEXT NOT NULL,
  workflow TEXT NOT NULL,
  -- §8 fields.
  trigger TEXT,
  goal TEXT,
  information_required JSONB DEFAULT '[]'::JSONB,
  decision TEXT,
  action TEXT,
  dependencies JSONB DEFAULT '[]'::JSONB,
  expected_outcome TEXT,
  possible_failure TEXT,
  recovery_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE persona_journeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY journeys_viewable ON persona_journeys FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY journeys_managing ON persona_journeys FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE TRIGGER persona_journeys_updated_at BEFORE UPDATE ON persona_journeys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- §10 ADAPTIVE EXPERIENCE MODEL — role/context/goal/capability/authority/
-- risk/workload/outcome-aware flags drive what a person sees.
-- §91 Cognitive Load Control / progressive disclosure.
-- §92 Capability Adaptation — beginner/intermediate/advanced/expert.
-- §95 Persona Conflict Detection — e.g. control vs speed.
-- §98 Explainability — "Why am I seeing this?"
-- ============================================================
CREATE TABLE IF NOT EXISTS adaptive_experience_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  -- Which surface this override applies to (page/component key).
  surface TEXT NOT NULL,
  -- The adaptive dimensions (§10). NULL = use defaults from persona profile.
  role_aware BOOLEAN DEFAULT TRUE,
  context_aware BOOLEAN DEFAULT TRUE,
  goal_aware BOOLEAN DEFAULT TRUE,
  capability_level TEXT, -- beginner/intermediate/advanced/expert override
  authority_aware BOOLEAN DEFAULT TRUE,
  risk_aware BOOLEAN DEFAULT TRUE,
  workload_aware BOOLEAN DEFAULT TRUE,
  -- §91 progressive disclosure depth (0=minimal, 3=full).
  disclosure_depth INTEGER DEFAULT 1,
  -- §98 explainability: the operational reason this person sees this.
  why_seen TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE adaptive_experience_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY adaptive_viewable ON adaptive_experience_overrides FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY adaptive_managing ON adaptive_experience_overrides FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- §11 PERSONA NEEDS DISCOVERY LOOP — observe→identify→infer→validate→
-- adapt→measure→learn. Records each iteration so the persona model
-- improves over time.
-- ============================================================
CREATE TABLE IF NOT EXISTS persona_discovery_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  -- The observation.
  observed_behavior TEXT,
  -- The identified friction/need.
  identified_need TEXT,
  -- The inferred underlying need.
  inferred_need TEXT,
  -- Whether validated with the user.
  validated BOOLEAN DEFAULT FALSE,
  validation_result TEXT,
  -- The adaptation made.
  adaptation_made TEXT,
  -- §96 measured outcome.
  outcome_measured TEXT,
  -- The learning fed back into the persona model.
  learning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE persona_discovery_iterations ENABLE ROW LEVEL SECURITY;
CREATE POLICY discovery_viewable ON persona_discovery_iterations FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY discovery_managing ON persona_discovery_iterations FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- §95 persona_conflict_detection: surface legitimate conflicts
-- (control vs speed) for a persona and recommend risk-based process design.
CREATE OR REPLACE FUNCTION persona_conflict_detection(p_business_id UUID, p_staff_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_profile RECORD; v_conflicts JSONB := '[]'::JSONB;
BEGIN
  SELECT * INTO v_profile FROM persona_profiles WHERE business_id = p_business_id AND staff_id = p_staff_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('conflicts','[]'::JSONB); END IF;

  -- Heuristic: authority + risk-aversion (control) vs interaction preference for speed.
  IF v_profile.interaction_preferences ? 'speed_priority' AND (v_profile.interaction_preferences->>'speed_priority') = 'high'
     AND v_profile.authority IS NOT NULL AND jsonb_array_length(v_profile.authority) > 0 THEN
    v_conflicts := v_conflicts || jsonb_build_object(
      'type','control_vs_speed',
      'description','Persona values speed but holds approval authority — risk-based process design recommended',
      'recommendation','Set tiered approval thresholds so low-risk actions bypass approval'
    );
  END IF;

  RETURN jsonb_build_object('conflicts', v_conflicts, 'count', jsonb_array_length(v_conflicts), 'type','INFERENCE');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- §96 persona_success_metrics_summary: aggregate persona effectiveness.
CREATE OR REPLACE FUNCTION persona_success_metrics_summary(p_business_id UUID)
RETURNS TABLE(staff_id UUID, persona_type TEXT, success_metrics JSONB) AS $$
BEGIN
  RETURN QUERY
  SELECT staff_id, persona_type, success_metrics
  FROM persona_profiles WHERE business_id = p_business_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON TABLE four_reality_assessments IS 'Four-reality model: intended/system/behavioural/outcome + discrepancy surfacing (§6).';
COMMENT ON TABLE persona_profiles IS 'Dynamic persona profile (§86) with five need types (§89).';
COMMENT ON TABLE persona_need_signals IS 'Needs identification signals (§87) + job-to-be-done (§88).';
COMMENT ON TABLE persona_journeys IS 'Persona journey map (§8).';
COMMENT ON TABLE adaptive_experience_overrides IS 'Adaptive experience model + progressive disclosure + explainability (§10/§91/§98).';
COMMENT ON TABLE persona_discovery_iterations IS 'Persona needs discovery loop (§11).';
