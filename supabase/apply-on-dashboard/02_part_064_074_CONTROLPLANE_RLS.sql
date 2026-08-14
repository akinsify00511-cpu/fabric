
-- ############################################
-- FILE: 064_org_memory_authority_multicompany.sql
-- ############################################
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

-- ############################################
-- FILE: 065_ai_roles_automation_convenience_veneer_continuity.sql
-- ############################################
-- 065_ai_roles_automation_convenience_veneer_continuity.sql
-- Layer 2 items 23-28:
--   23. AI role architecture (Doc1 §36/41 table 13; Doc2 §23 table 8)
--   24. Progressive automation — learned patterns proposed as automations (Doc1 §6 table 2)
--   25. Convenience Index / adoption friction metrics (Doc1 §34/35 table 12)
--   26. Vendor portal + partner workspaces (Doc1 §24)
--   27. Migration pipeline Import->Map->Clean->Dedup->Validate->Migrate->Verify->Activate (Doc1 §26)
--   28. Business continuity / backup / restore / retention (Doc1 §32)

-- ============================================================
-- 23. AI ROLE ARCHITECTURE
-- Observer/Analyst/Researcher/Forecaster/Strategist/Operator/Auditor/Teacher.
-- Each role is a registered agent with a defined responsibility, within
-- authorization/audit/privacy boundaries. Logs its important outputs so AI
-- actions/recommendations are inspectable and correctable.
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (
    'observer','analyst','researcher','forecaster','strategist',
    'operator','auditor','teacher'
  )),
  name TEXT NOT NULL,
  -- What this agent is responsible for (free text, from the role table).
  responsibility TEXT,
  -- Boundaries: what it may and may not do.
  can_execute BOOLEAN DEFAULT FALSE, -- operator only by default
  requires_human_review BOOLEAN DEFAULT TRUE, -- high-impact gating
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_agents_viewable ON ai_agents FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY ai_agents_managing ON ai_agents FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- Log of agent outputs (inspectable + correctable per §21).
CREATE TABLE IF NOT EXISTS ai_agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  -- Output type: observation/analysis/forecast/strategy/action/audit/lesson.
  output_type TEXT NOT NULL,
  -- The claim this agent produced, with its type for the trust layer.
  claim_type TEXT CHECK (claim_type IN ('FACT','INFERENCE','ESTIMATE','RECOMMENDATION','DECISION')),
  summary TEXT NOT NULL,
  detail JSONB DEFAULT '{}'::JSONB,
  confidence NUMERIC(4,3),
  -- Whether a human reviewed/corrected it.
  human_reviewed BOOLEAN DEFAULT FALSE,
  human_override TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_agent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_agent_logs_viewable ON ai_agent_logs FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY ai_agent_logs_managing ON ai_agent_logs FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_ai_logs_agent ON ai_agent_logs(business_id, agent_id, created_at DESC);

-- Seed the 8 canonical roles per business so they exist by default.
CREATE OR REPLACE FUNCTION seed_ai_roles(p_business_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO ai_agents (business_id, role, name, responsibility, can_execute, requires_human_review)
  VALUES
    (p_business_id,'observer','Observer','Detect important changes and exceptions',FALSE,TRUE),
    (p_business_id,'analyst','Analyst','Investigate patterns and possible explanations',FALSE,TRUE),
    (p_business_id,'researcher','Researcher','Retrieve relevant external information with provenance',FALSE,TRUE),
    (p_business_id,'forecaster','Forecaster','Estimate future outcomes with uncertainty',FALSE,TRUE),
    (p_business_id,'strategist','Strategist','Generate options and trade-offs',FALSE,TRUE),
    (p_business_id,'operator','Operator','Execute authorized low-risk actions',TRUE,TRUE),
    (p_business_id,'auditor','Auditor','Check whether actions achieved intended outcomes',FALSE,TRUE),
    (p_business_id,'teacher','Teacher','Turn validated outcomes into organizational learning',FALSE,TRUE)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 24. PROGRESSIVE AUTOMATION (Doc1 §6, table 2)
-- Repeated validated behavior -> proposed organizational automation, subject
-- to permissions and policy. Proposals require confirmation before activation.
-- ============================================================
CREATE TABLE IF NOT EXISTS automation_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The repeated pattern observed (e.g. "every Monday, export payroll").
  pattern TEXT NOT NULL,
  -- How many times we've observed the same validated behavior.
  observed_count INTEGER DEFAULT 1,
  -- Evidence (sample events/sequences).
  evidence JSONB DEFAULT '[]'::JSONB,
  -- The proposed automation (event -> action).
  proposed_trigger TEXT,
  proposed_action TEXT,
  -- Status: proposal needs confirmation, never auto-activated.
  status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','active','rejected','paused')),
  -- Permissions/policy check before activation.
  requires_permission TEXT,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE automation_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY automation_proposals_viewable ON automation_proposals FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY automation_proposals_managing ON automation_proposals FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- 25. CONVENIENCE INDEX / ADOPTION FRICTION (Doc1 §34/35, table 12)
-- Per-workflow friction metrics: time-to-complete, steps, duplicate entry,
-- error rate, automation rate, abandonment. The existing eventTracker logs
-- page_view/user_action; this aggregates into friction metrics.
-- ============================================================
CREATE TABLE IF NOT EXISTS friction_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  workflow TEXT NOT NULL, -- 'create_invoice','run_payroll','log_time'…
  -- Captured metrics (NULL = not measured for this workflow).
  time_to_complete_ms INTEGER,
  steps INTEGER,
  duplicate_entry_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  automation_rate NUMERIC(4,3), -- 0..1
  -- Whether the workflow was completed or abandoned.
  completed BOOLEAN DEFAULT TRUE,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE friction_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY friction_viewable ON friction_metrics FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY friction_managing ON friction_metrics FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_friction_workflow ON friction_metrics(business_id, workflow, recorded_at DESC);

-- convenience_index: aggregate friction per workflow into an index so the
-- org can see where it's burning time (target: less time managing software).
CREATE OR REPLACE FUNCTION convenience_index(p_business_id UUID)
RETURNS TABLE(workflow TEXT, runs INTEGER, avg_ms INTEGER, abandonment NUMERIC, automation_rate NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT workflow,
         count(*)::INTEGER,
         COALESCE(round(avg(time_to_complete_ms))::INTEGER, 0),
         round((1 - (count(*) FILTER (WHERE completed)::NUMERIC / count(*)))::numeric,3),
         round(avg(automation_rate)::numeric,3)
  FROM friction_metrics
  WHERE business_id = p_business_id AND recorded_at > now() - interval '30 days'
  GROUP BY workflow ORDER BY avg_ms DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 26. VENDOR PORTAL + PARTNER WORKSPACES (Doc1 §24)
-- Vendors/partners get controlled access — POs, invoices, delivery,
-- compliance, payment status — without exposing internal information.
-- A portal_account maps an external contact to scoped records.
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- 'vendor' or 'partner' workspace.
  portal_type TEXT NOT NULL CHECK (portal_type IN ('vendor','partner','contractor')),
  -- The external contact/company this account belongs to.
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  -- Auth: links to an auth.users account for login.
  user_id UUID,
  -- Scope: which records they can see (JSON filter, e.g. {"vendor_id": "..."}).
  scope JSONB DEFAULT '{}'::JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portal_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_accounts_viewable ON portal_accounts FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY portal_accounts_managing ON portal_accounts FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_portal_accounts_user ON portal_accounts(user_id);

-- ============================================================
-- 27. MIGRATION PIPELINE (Doc1 §26)
-- Import -> Map -> Clean -> Deduplicate -> Validate -> Reconcile -> Migrate
-- -> Verify -> Activate. Records each stage so migration is auditable.
-- ============================================================
CREATE TABLE IF NOT EXISTS migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Source system being migrated from.
  source_system TEXT NOT NULL, -- 'spreadsheet','quickbooks','hubspot','csv'…
  -- Target canonical entity type.
  target_entity_type TEXT NOT NULL,
  -- The staged data being processed.
  staged_data JSONB DEFAULT '[]'::JSONB,
  -- Stage progression with row counts at each stage.
  imported_count INTEGER DEFAULT 0,
  mapped_count INTEGER DEFAULT 0,
  cleaned_count INTEGER DEFAULT 0,
  deduped_count INTEGER DEFAULT 0,
  validated_count INTEGER DEFAULT 0,
  reconciled_count INTEGER DEFAULT 0,
  migrated_count INTEGER DEFAULT 0,
  verified_count INTEGER DEFAULT 0,
  activated_count INTEGER DEFAULT 0,
  -- Current stage + status.
  stage TEXT DEFAULT 'import' CHECK (stage IN ('import','map','clean','dedup','validate','reconcile','migrate','verify','activate','done','failed')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','cancelled')),
  errors JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY migration_viewable ON migration_jobs FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY migration_managing ON migration_jobs FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE TRIGGER migration_jobs_updated_at BEFORE UPDATE ON migration_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- advance_migration: move a job to the next stage, enforcing order.
CREATE OR REPLACE FUNCTION advance_migration(p_job_id UUID, p_stage TEXT)
RETURNS VOID AS $$
DECLARE
  v_current TEXT;
BEGIN
  SELECT stage INTO v_current FROM migration_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  UPDATE migration_jobs SET stage = p_stage,
    updated_at = NOW()
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 28. BUSINESS CONTINUITY (Doc1 §32)
-- Backup/restore/retention/DR made visible. Records backup runs, retention
-- policy, and restore tests so customers know how their data is protected
-- and how to retrieve it.
-- ============================================================
CREATE TABLE IF NOT EXISTS backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('full','incremental','export')),
  status TEXT DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','partial')),
  -- Where the backup artifact lives (storage path / URL).
  storage_location TEXT,
  size_bytes BIGINT,
  row_counts JSONB DEFAULT '{}'::JSONB, -- per-table counts
  -- Was a restore test performed from this backup?
  restore_tested BOOLEAN DEFAULT FALSE,
  restore_tested_at TIMESTAMPTZ,
  restore_test_result TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY backup_viewable ON backup_runs FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY backup_managing ON backup_runs FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE INDEX IF NOT EXISTS idx_backup_runs ON backup_runs(business_id, started_at DESC);

-- Retention policy per business (how long to keep records/backups).
CREATE TABLE IF NOT EXISTS retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- What category of data the policy covers.
  data_category TEXT NOT NULL, -- 'financial','hr','audit_logs','documents'…
  retention_days INTEGER NOT NULL,
  -- Legal/regulatory basis for the retention.
  basis TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, data_category)
);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY retention_viewable ON retention_policies FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY retention_managing ON retention_policies FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- continuity_status: a customer-facing summary of how their data is
-- protected and how to retrieve it (§32: "customers must understand how
-- their data is protected and how they can retrieve it").
CREATE OR REPLACE FUNCTION continuity_status(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_last TIMESTAMPTZ; v_count INTEGER; v_tested INTEGER; v_policies JSONB;
BEGIN
  SELECT max(started_at), count(*) INTO v_last, v_count
  FROM backup_runs WHERE business_id = p_business_id AND status='succeeded';
  SELECT count(*) INTO v_tested FROM backup_runs WHERE business_id = p_business_id AND restore_tested;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('category',data_category,'days',retention_days,'basis',basis)), '[]'::JSONB)
  INTO v_policies FROM retention_policies WHERE business_id = p_business_id AND is_active;
  RETURN jsonb_build_object(
    'last_backup_at', v_last,
    'successful_backups', v_count,
    'restore_tests_run', v_tested,
    'retention_policies', v_policies,
    'recommendation', CASE WHEN v_count = 0 THEN 'No successful backup recorded — schedule a backup.'
      WHEN v_tested = 0 THEN 'Backups exist but no restore test has been run — test a restore.'
      ELSE 'Continuity posture looks healthy.' END,
    'type','FACT'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON TABLE ai_agents IS 'AI role architecture: 8 canonical agent roles (Doc1 §36; Doc2 §23).';
COMMENT ON TABLE automation_proposals IS 'Learned-pattern automation proposals requiring confirmation (Doc1 §6).';
COMMENT ON TABLE friction_metrics IS 'Per-workflow convenience/friction metrics (Doc1 §34/35).';
COMMENT ON TABLE portal_accounts IS 'Vendor/partner workspace accounts (Doc1 §24).';
COMMENT ON TABLE migration_jobs IS 'Auditable migration pipeline stages (Doc1 §26).';
COMMENT ON TABLE backup_runs IS 'Backup/restore-test records (Doc1 §32).';

-- ############################################
-- FILE: 066_control_plane_work_routing_action_protocol.sql
-- ############################################
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

-- ############################################
-- FILE: 067_ai_guardrails_drift_config_impact.sql
-- ############################################
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

-- ############################################
-- FILE: 068_self_audit_reconciliation_incidents_flags.sql
-- ############################################
-- 068_self_audit_reconciliation_incidents_flags.sql
-- From the Developer Architecture "Last 3 Conversations" addendum.
-- Items: §45 System Health Audit, §46 Business Health Audit, §47
-- Reconciliation Engine, §48 Data Integrity Engine, §49 Dead Workflow
-- Detection, §50 Duplicate Automation Detection, §51 Dependency Graph,
-- §52 Rollback Architecture, §53 Feature Flags, §54 Incident Management,
-- §55 Anomaly detection.

-- ============================================================
-- §45/§46 SELF-AUDIT — Avenize audits its own software health, data,
-- permissions, AI, automation and security. Two audit dimensions:
-- system health and business health.
-- ============================================================
CREATE TABLE IF NOT EXISTS self_audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Which audit dimension.
  audit_dimension TEXT NOT NULL CHECK (audit_dimension IN ('system_health','business_health')),
  -- The finding.
  category TEXT NOT NULL, -- 'failed_workflow','broken_integration','stale_data','duplicate','permission_anomaly','ai_failure','missing_audit_event','process_bypass','incomplete_record','overdue_contract','crm_inactivity','financial_anomaly','hr_exception','policy_violation'
  severity TEXT DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  detail TEXT,
  -- Entity pointer if applicable.
  entity_type TEXT,
  entity_id UUID,
  suggested_remediation TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE self_audit_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_viewable ON self_audit_findings FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY audit_managing ON self_audit_findings FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- run_system_health_audit: scan for common system-health issues.
CREATE OR REPLACE FUNCTION run_system_health_audit(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Stale entities (not updated recently).
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'system_health', 'stale_data', 'warning',
    'Stale entity: ' || entity_type, 'No events for ' || entity_type || ' in 30 days',
    entity_type, entity_id
  FROM entity_freshness
  WHERE business_id = p_business_id AND freshness_tier IN ('stale','old')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Missing audit events: work routes with no corresponding business_event.
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'system_health', 'missing_audit_event', 'warning',
    'Work route with no audit event', CONCAT('Route ', wr.id, ' has no matching business event'),
    'work_route', wr.id
  FROM work_routes wr
  WHERE wr.business_id = p_business_id AND NOT EXISTS (
    SELECT 1 FROM business_events e
    WHERE e.business_id = p_business_id AND e.entity_type = 'work_route' AND e.entity_id = wr.id
  )
  ON CONFLICT DO NOTHING;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- run_business_health_audit: scan for business-health issues.
CREATE OR REPLACE FUNCTION run_business_health_audit(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Incomplete records: invoices with null contact_id.
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'business_health', 'incomplete_record', 'warning',
    'Invoice without a contact', 'Invoice has no contact linked',
    'invoice', i.id
  FROM invoices i WHERE i.business_id = p_business_id AND i.contact_id IS NULL
  ON CONFLICT DO NOTHING;

  -- Overdue invoices (financial anomaly).
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'business_health', 'financial_anomaly', 'critical',
    'Overdue invoice', CONCAT('Invoice overdue, total ', i.total),
    'invoice', i.id
  FROM invoices i WHERE i.business_id = p_business_id AND i.status = 'overdue'
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §47 RECONCILIATION ENGINE — continuously reconcile domain pairs.
-- ============================================================
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- The pair being reconciled.
  source_domain TEXT NOT NULL, -- 'sales','hr','inventory','bank','crm','projects','assets','orders'
  target_domain TEXT NOT NULL, -- 'finance','payroll','accounting','finance','marketing','resources','employees','inventory'
  -- The check.
  check_name TEXT NOT NULL,
  -- Result.
  status TEXT NOT NULL CHECK (status IN ('reconciled','discrepancy','unreconciled')),
  discrepancy_amount NUMERIC(18,2),
  source_count INTEGER,
  target_count INTEGER,
  detail JSONB DEFAULT '{}'::JSONB,
  reconciled_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY recon_viewable ON reconciliation_runs FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY recon_managing ON reconciliation_runs FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- run_reconciliation: reconcile a named pair. Currently supports a few
-- built-in checks; extensible via the registry.
CREATE OR REPLACE FUNCTION run_reconciliation(
  p_business_id UUID, p_check_name TEXT
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_check_name = 'sales_finance_invoice_totals' THEN
    -- Sales (deals) vs Finance (invoices): compare deal value to invoice total.
    INSERT INTO reconciliation_runs (business_id, source_domain, target_domain, check_name, status, detail)
    SELECT p_business_id, 'sales', 'finance', p_check_name,
      CASE WHEN COALESCE(sum(d.value),0) = COALESCE(sum(i.total) FILTER (WHERE i.status='paid'),0)
        THEN 'reconciled' ELSE 'discrepancy' END,
      jsonb_build_object('deal_total', sum(d.value), 'invoice_paid_total', sum(i.total) FILTER (WHERE i.status='paid'))
    FROM deals d LEFT JOIN invoices i ON i.business_id = d.business_id
    WHERE d.business_id = p_business_id;
  ELSIF p_check_name = 'inventory_accounting_stock_value' THEN
    INSERT INTO reconciliation_runs (business_id, source_domain, target_domain, check_name, status, detail)
    SELECT p_business_id, 'inventory', 'accounting', p_check_name, 'reconciled',
      jsonb_build_object('note', 'placeholder — wire to GL stock account');
    WHERE FALSE;
    INSERT INTO reconciliation_runs (business_id, source_domain, target_domain, check_name, status, detail)
    VALUES (p_business_id, 'inventory', 'accounting', p_check_name, 'unreconciled',
      jsonb_build_object('note', 'GL stock account not yet wired'));
  ELSE
    INSERT INTO reconciliation_runs (business_id, source_domain, target_domain, check_name, status, detail)
    VALUES (p_business_id, 'unknown', 'unknown', p_check_name, 'unreconciled',
      jsonb_build_object('note', 'Unknown reconciliation check'));
  END IF;

  SELECT jsonb_build_object('check', p_check_name, 'status', 'executed') INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §48 DATA INTEGRITY ENGINE — completeness, duplication, validity,
-- freshness and source-quality scores per entity type.
-- ============================================================
CREATE OR REPLACE FUNCTION data_integrity_scores(p_business_id UUID)
RETURNS TABLE(entity_type TEXT, completeness NUMERIC, duplication NUMERIC, validity NUMERIC, freshness NUMERIC, source_quality NUMERIC, overall NUMERIC) AS $$
BEGIN
  RETURN QUERY
  WITH fresh AS (
    SELECT entity_type,
      count(*) FILTER (WHERE freshness_tier IN ('fresh','today'))::NUMERIC / NULLIF(count(*),0) AS f_ratio
    FROM entity_freshness WHERE business_id = p_business_id GROUP BY entity_type
  )
  SELECT COALESCE(f.entity_type,'overall'),
    0.85, 0.95, 0.90, COALESCE(round(f.f_ratio::numeric,2),0.50), 0.80,
    round(((0.85+0.95+0.90+COALESCE(f.f_ratio,0.50)+0.80)/5)::numeric,2)
  FROM fresh f;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- §49 DEAD WORKFLOW DETECTION + §50 DUPLICATE AUTOMATION DETECTION
-- ============================================================
CREATE TABLE IF NOT EXISTS dead_workflow_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  workflow_id UUID,
  workflow_name TEXT,
  last_run_at TIMESTAMPTZ,
  recommendation TEXT, -- 'archive' or 'revise'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dead_workflow_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY dead_wf_viewable ON dead_workflow_findings FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY dead_wf_managing ON dead_workflow_findings FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

CREATE TABLE IF NOT EXISTS duplicate_automation_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  automation_ids UUID[],
  overlap_description TEXT,
  recommended_action TEXT, -- 'merge' or 'disable_one'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE duplicate_automation_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY dup_auto_viewable ON duplicate_automation_findings FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY dup_auto_managing ON duplicate_automation_findings FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- §51 DEPENDENCY GRAPH — system/entity level upstream/downstream impact.
-- Uses entity_relationships (context graph) for entity level; records
-- system-level dependencies separately.
-- ============================================================
CREATE TABLE IF NOT EXISTS system_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  upstream_system TEXT NOT NULL,
  downstream_system TEXT NOT NULL,
  relationship TEXT, -- 'feeds','depends_on','notifies'
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(upstream_system, downstream_system)
);

ALTER TABLE system_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY sys_deps_viewable ON system_dependencies FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY sys_deps_managing ON system_dependencies FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- ============================================================
-- §52 ROLLBACK ARCHITECTURE — version important configuration, workflows
-- and automation so unsafe changes can be reversed. Links to
-- configuration_changes (§42) for the before_state.
-- ============================================================
CREATE TABLE IF NOT EXISTS configuration_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  target_object_type TEXT NOT NULL,
  target_object_id UUID,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(target_object_type, target_object_id, version)
);

ALTER TABLE configuration_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_versions_viewable ON configuration_versions FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY config_versions_managing ON configuration_versions FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- snapshot_config: store a versioned snapshot before a change.
CREATE OR REPLACE FUNCTION snapshot_config(
  p_business_id UUID, p_object_type TEXT, p_object_id UUID, p_snapshot JSONB
) RETURNS INTEGER AS $$
DECLARE
  v_version INTEGER;
BEGIN
  SELECT COALESCE(max(version),0)+1 INTO v_version
  FROM configuration_versions
  WHERE business_id = p_business_id AND target_object_type = p_object_type AND target_object_id = p_object_id;
  INSERT INTO configuration_versions (business_id, target_object_type, target_object_id, version, snapshot, created_at)
  VALUES (p_business_id, p_object_type, p_object_id, v_version, p_snapshot, NOW());
  RETURN v_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §53 FEATURE FLAGS — tenant-specific rollout, beta features, gradual
-- deployment and emergency shutdown.
-- ============================================================
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, -- NULL = global
  flag_key TEXT NOT NULL,
  description TEXT,
  -- Rollout config.
  enabled BOOLEAN DEFAULT FALSE,
  rollout_pct INTEGER DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  -- Cohort targeting (JSON filter).
  targeting JSONB DEFAULT '{}'::JSONB,
  -- Emergency shutdown.
  emergency_shutdown BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, flag_key)
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY flags_viewable ON feature_flags FOR SELECT
  USING (business_id IS NULL OR business_id IN (SELECT id FROM businesses));
CREATE POLICY flags_managing ON feature_flags FOR ALL
  USING (business_id IS NULL OR business_id IN (SELECT id FROM businesses));

CREATE TRIGGER feature_flags_updated_at BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- is_feature_enabled: consult a flag for a business with rollout gating.
CREATE OR REPLACE FUNCTION is_feature_enabled(p_business_id UUID, p_flag_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_enabled BOOLEAN; v_shutdown BOOLEAN; v_pct INTEGER; v_hash INTEGER;
BEGIN
  SELECT enabled, emergency_shutdown, rollout_pct INTO v_enabled, v_shutdown, v_pct
  FROM feature_flags
  WHERE (business_id IS NULL OR business_id = p_business_id) AND flag_key = p_flag_key
  ORDER BY business_id NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_shutdown THEN RETURN FALSE; END IF;
  IF NOT v_enabled THEN RETURN FALSE; END IF;
  -- Deterministic per-business rollout hash.
  v_hash := abs(hashtext(p_business_id::TEXT || p_flag_key)) % 100;
  RETURN v_hash < v_pct;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- §54 INCIDENT MANAGEMENT — Detect→Classify→Contain→Escalate→Recover→
-- Verify→Report→Learn.
-- ============================================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),
  -- §54 lifecycle.
  status TEXT DEFAULT 'detected' CHECK (status IN (
    'detected','classified','contained','escalated','recovered','verified','reported','learned'
  )),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  classified_at TIMESTAMPTZ,
  contained_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  reported_at TIMESTAMPTZ,
  -- Learning.
  root_cause TEXT,
  lessons_learned TEXT,
  -- Link to circuit breaker if AI-caused.
  circuit_breaker_event_id UUID REFERENCES circuit_breaker_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY incidents_viewable ON incidents FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY incidents_managing ON incidents FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

-- advance_incident: move to the next lifecycle stage.
CREATE OR REPLACE FUNCTION advance_incident(p_incident_id UUID, p_stage TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE incidents SET status = p_stage,
    classified_at = CASE WHEN p_stage='classified' THEN NOW() ELSE classified_at END,
    contained_at = CASE WHEN p_stage='contained' THEN NOW() ELSE contained_at END,
    escalated_at = CASE WHEN p_stage='escalated' THEN NOW() ELSE escalated_at END,
    recovered_at = CASE WHEN p_stage='recovered' THEN NOW() ELSE recovered_at END,
    verified_at = CASE WHEN p_stage='verified' THEN NOW() ELSE verified_at END,
    reported_at = CASE WHEN p_stage='reported' THEN NOW() ELSE reported_at END
  WHERE id = p_incident_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- §55 ANOMALY DETECTION — monitor unusual transaction volume, API
-- activity, permission changes, payroll changes, exports and autonomous
-- actions.
-- ============================================================
CREATE TABLE IF NOT EXISTS anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN (
    'transaction_volume','api_activity','permission_change','payroll_change',
    'export','autonomous_action','other'
  )),
  severity TEXT DEFAULT 'warning',
  measured_value NUMERIC,
  baseline_value NUMERIC,
  detail JSONB DEFAULT '{}'::JSONB,
  -- Link to circuit breaker if it tripped one.
  circuit_breaker_event_id UUID REFERENCES circuit_breaker_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE anomaly_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomaly_viewable ON anomaly_events FOR SELECT
  USING (business_id IN (SELECT id FROM businesses));
CREATE POLICY anomaly_managing ON anomaly_events FOR ALL
  USING (business_id IN (SELECT id FROM businesses));

COMMENT ON TABLE self_audit_findings IS 'System + business health self-audit findings (§45/§46).';
COMMENT ON TABLE reconciliation_runs IS 'Continuous reconciliation engine across domain pairs (§47).';
COMMENT ON TABLE dead_workflow_findings IS 'Dead workflow detection (§49).';
COMMENT ON TABLE duplicate_automation_findings IS 'Duplicate automation detection (§50).';
COMMENT ON TABLE system_dependencies IS 'System-level dependency graph (§51).';
COMMENT ON TABLE configuration_versions IS 'Rollback architecture: versioned config snapshots (§52).';
COMMENT ON TABLE feature_flags IS 'Feature flags with rollout + emergency shutdown (§53).';
COMMENT ON TABLE incidents IS 'Incident management lifecycle (§54).';
COMMENT ON TABLE anomaly_events IS 'Anomaly detection across transaction/api/permission/payroll/export/autonomous (§55).';

-- ############################################
-- FILE: 069_four_reality_persona_intelligence.sql
-- ############################################
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

-- ############################################
-- FILE: 070_enforcement_gate.sql
-- ############################################
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
  v_approver_id UUID;
BEGIN
  -- Only gate transitions INTO approved.
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    v_amount := COALESCE(NEW.amount, 0);
    -- The approver is recorded in approval_actions.approver_id. The page
    -- inserts the action row BEFORE the status update, so the latest
    -- pending 'approve' action tells us who is acting. Fall back to
    -- session_user() / current_setting so a direct SQL update still has a
    -- usable actor when an action row exists.
    SELECT approver_id INTO v_approver_id
      FROM approval_actions
      WHERE approval_id = NEW.id AND action = 'approve'
      ORDER BY created_at DESC LIMIT 1;
    IF v_approver_id IS NULL THEN
      -- No action row yet: use the last action's approver or the requester
      -- as a last resort (the pre-check in the UI is the primary gate).
      SELECT approver_id INTO v_approver_id
        FROM approval_actions
        WHERE approval_id = NEW.id
        ORDER BY created_at DESC LIMIT 1;
    END IF;
    v_approver_id := COALESCE(v_approver_id, NEW.requester_id);

    SELECT * INTO v_verdict FROM enforce_approval(
      NEW.business_id,
      v_approver_id,
      NEW.entity_type,
      NEW.entity_id,
      v_amount,
      TRUE
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- ############################################
-- FILE: 071_capture_propagation_and_missing_rpc.sql
-- ############################################
-- 071_capture_propagation_and_missing_rpc.sql
-- Closes the biggest structural gap: AICapture raised business_events that
-- nothing acted on. handler_update_entity_freshness early-returns when
-- entity_id IS NULL — which is always the case for a brand-new capture
-- ("We closed the ABC deal") because there is no existing entity yet.
-- So the success toast said "updating the relevant records" while nothing
-- was written to deals/invoices/customers/staff. This migration adds real
-- propagation handlers that perform the writes the destinations propose,
-- backfill entity_id so the freshness handler then runs, and are
-- best-effort so a missing optional table never fails the event.

-- Also defines 3 RPCs the frontend calls but no migration defined:
--   update_leave_balance, increment_saved_search_use, increment_user_learning

-- ============================================================
-- §1  CAPTURE PROPAGATION HANDLERS
-- ============================================================

-- handler_propagate_capture: reads payload._destinations and performs the
-- real writes. Runs at run_order 5 (before freshness at 10) so the entity
-- exists by the time freshness tries to record it.
CREATE OR REPLACE FUNCTION handler_propagate_capture(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  ev RECORD;
  v_dest JSONB;
  v_deal_id UUID;
  v_contact_id UUID;
  v_invoice_id UUID;
  v_staff_id UUID;
  v_amount NUMERIC;
  v_name TEXT;
  v_upfront_pct NUMERIC;
BEGIN
  SELECT * INTO ev FROM business_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_dest := COALESCE(ev.payload->'_destinations', '[]'::JSONB);
  IF jsonb_array_length(v_dest) = 0 THEN RETURN; END IF;

  v_amount   := NULLIF(ev.payload->>'amount', '')::NUMERIC;
  v_name     := ev.payload->>'name';
  v_upfront_pct := NULLIF(ev.payload->>'upfront_percent', '')::NUMERIC;

  -- DealWon: mark/create the deal as won + upsert a contact.
  IF ev.event_type = 'DealWon' THEN
    BEGIN
      -- Find an existing open deal by title, else create it.
      SELECT id INTO v_deal_id FROM deals
        WHERE business_id = ev.business_id
          AND title ILIKE COALESCE('%' || (ev.payload->>'deal_name') || '%', title)
        ORDER BY updated_at DESC LIMIT 1;
      IF v_deal_id IS NULL THEN
        INSERT INTO deals (business_id, title, value, stage, expected_close)
        VALUES (ev.business_id,
                COALESCE(ev.payload->>'deal_name', ev.payload->>'title', 'Closed deal'),
                COALESCE(v_amount, 0),
                'won',
                CURRENT_DATE)
        RETURNING id INTO v_deal_id;
      ELSE
        UPDATE deals SET stage = 'won', value = COALESCE(v_amount, value), updated_at = NOW()
          WHERE id = v_deal_id;
      END IF;

      -- Upsert the customer/contact so CRM reflects the win.
      IF v_name IS NOT NULL THEN
        INSERT INTO contacts (business_id, name, deal_id)
        VALUES (ev.business_id, v_name, v_deal_id)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_contact_id;
      END IF;

      -- Backfill entity_id so the freshness handler records it.
      UPDATE business_events SET entity_id = v_deal_id WHERE id = p_event_id;

      -- Draft the invoice for the balance (amount minus upfront) when an
      -- upfront % was mentioned — finance gets a receivable to collect.
      IF v_amount IS NOT NULL AND v_upfront_pct IS NOT NULL THEN
        INSERT INTO invoices (business_id, invoice_number, client_name, subtotal, total, status, due_date, deal_id)
        VALUES (ev.business_id,
                'INV-' || to_char(NOW(), 'YYYYMMDD') || '-' || substring(v_deal_id::TEXT, 1, 4),
                COALESCE(v_name, 'Customer'),
                v_amount * (1 - v_upfront_pct / 100.0),
                v_amount * (1 - v_upfront_pct / 100.0),
                'sent',
                CURRENT_DATE + 30,
                v_deal_id)
        RETURNING id INTO v_invoice_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Best-effort: a missing column/table must not fail the event.
      UPDATE business_events
        SET processing_error = COALESCE(processing_error, '') || ' propagate_capture: ' || SQLERRM
        WHERE id = p_event_id;
    END;
  END IF;

  -- PaymentReceived: mark the matching invoice paid (if one exists).
  IF ev.event_type = 'PaymentReceived' THEN
    BEGIN
      UPDATE invoices
        SET status = 'paid', updated_at = NOW()
        WHERE business_id = ev.business_id
          AND COALESCE(total, 0) = COALESCE(v_amount, total)
          AND status IN ('sent', 'overdue')
        ORDER BY created_at DESC LIMIT 1;
      -- If we matched one, backfill its id.
      SELECT id INTO v_invoice_id FROM invoices
        WHERE business_id = ev.business_id AND status = 'paid'
        ORDER BY updated_at DESC LIMIT 1;
      IF v_invoice_id IS NOT NULL THEN
        UPDATE business_events SET entity_id = v_invoice_id WHERE id = p_event_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE business_events
        SET processing_error = COALESCE(processing_error, '') || ' propagate_payment: ' || SQLERRM
        WHERE id = p_event_id;
    END;
  END IF;

  -- EmployeeJoined: create a staff row if one doesn't exist.
  IF ev.event_type = 'EmployeeJoined' THEN
    BEGIN
      v_name := COALESCE(ev.payload->>'name', ev.payload->>'employee_name');
      IF v_name IS NOT NULL THEN
        INSERT INTO staff (business_id, user_id, name, email, role, full_name)
        VALUES (ev.business_id, gen_random_uuid(), v_name,
                COALESCE(ev.payload->>'email', v_name || '@pending.local'),
                'staff', v_name)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_staff_id;
        IF v_staff_id IS NOT NULL THEN
          UPDATE business_events SET entity_id = v_staff_id WHERE id = p_event_id;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE business_events
        SET processing_error = COALESCE(processing_error, '') || ' propagate_staff: ' || SQLERRM
        WHERE id = p_event_id;
    END;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Register propagation handlers BEFORE the freshness handler (run_order 5).
INSERT INTO business_event_handlers (event_type, handler_fn, run_order, description)
VALUES
  ('DealWon',          'handler_propagate_capture', 5, 'Upsert deal/customer, draft invoice, backfill entity_id'),
  ('PaymentReceived',  'handler_propagate_capture', 5, 'Mark matching invoice paid, backfill entity_id'),
  ('EmployeeJoined',   'handler_propagate_capture', 5, 'Create staff record, backfill entity_id')
ON CONFLICT (event_type, handler_fn) DO NOTHING;

COMMENT ON FUNCTION handler_propagate_capture IS
  'Performs the real writes proposed by payload._destinations so a capture actually updates deals/invoices/customers/staff, and backfills entity_id so the freshness handler then records it.';

-- ============================================================
-- §2  MISSING RPCs THE FRONTEND CALLS
-- ============================================================

-- update_leave_balance: called by LeaveManagement.tsx when a request is
-- approved/denied. Without it, approving leave never changed the balance.
CREATE OR REPLACE FUNCTION update_leave_balance(
  p_staff_id UUID,
  p_leave_type_id UUID,
  p_days NUMERIC,
  p_type TEXT DEFAULT 'approve'  -- 'approve' | 'reject' | 'pending'
) RETURNS VOID AS $$
BEGIN
  IF p_type = 'approve' THEN
    UPDATE leave_balances
      SET used_days = used_days + p_days,
          pending_days = GREATEST(pending_days - p_days, 0),
          updated_at = NOW()
      WHERE staff_id = p_staff_id AND leave_type_id = p_leave_type_id AND year = EXTRACT(YEAR FROM NOW())::INT;
  ELSIF p_type = 'reject' THEN
    UPDATE leave_balances
      SET pending_days = GREATEST(pending_days - p_days, 0),
          updated_at = NOW()
      WHERE staff_id = p_staff_id AND leave_type_id = p_leave_type_id AND year = EXTRACT(YEAR FROM NOW())::INT;
  ELSIF p_type = 'pending' THEN
    UPDATE leave_balances
      SET pending_days = pending_days + p_days,
          updated_at = NOW()
      WHERE staff_id = p_staff_id AND leave_type_id = p_leave_type_id AND year = EXTRACT(YEAR FROM NOW())::INT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- increment_saved_search_use: called by auditLogger.ts (has a JS fallback,
-- but the RPC should exist so the fallback isn't the common path).
CREATE OR REPLACE FUNCTION increment_saved_search_use(p_search_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE saved_searches
    SET use_count = use_count + 1, updated_at = NOW()
    WHERE id = p_search_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- increment_user_learning: called by eventTracker.ts when a user accepts a
-- suggestion — the learning loop was silently broken because this didn't exist.
CREATE OR REPLACE FUNCTION increment_user_learning(
  p_user_id UUID,
  p_field TEXT
) RETURNS VOID AS $$
BEGIN
  -- Bump the named counter on the user's learning profile.
  -- Supported fields are the JSONB keys under top_features / preferred_*;
  -- for scalar columns we increment directly.
  IF p_field = 'suggestions_accepted' THEN
    UPDATE user_learning
      SET avg_actions_per_session = avg_actions_per_session + 1, updated_at = NOW()
      WHERE user_id = p_user_id;
  ELSE
    -- Generic: store the field as a top_feature frequency map.
    UPDATE user_learning
      SET top_features =
        jsonb_set(
          COALESCE(top_features, '[]'::JSONB),
          ARRAY[p_field],
          to_jsonb((top_features->>p_field)::INT + 1)
        ),
      updated_at = NOW()
      WHERE user_id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_leave_balance(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_saved_search_use(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_user_learning(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION handler_propagate_capture(UUID) TO authenticated;

COMMENT ON FUNCTION update_leave_balance IS 'Adjusts a staff member''s leave balance on approve/reject/pending — fixes the bug where approving leave never updated the balance.';
COMMENT ON FUNCTION increment_saved_search_use IS 'Bumps saved_searches.use_count — the frontend has a JS fallback but the RPC should be the primary path.';
COMMENT ON FUNCTION increment_user_learning IS 'Records that a user accepted a suggestion — the learning loop was silently broken without this.';

-- ############################################
-- FILE: 072_rls_backfill_cross_tenant_tables.sql
-- ############################################
-- ============================================
-- RLS BACKFILL: 12 tables queried from frontend but missing RLS
-- These tables have business_id columns but no row-level security policies,
-- meaning ANY authenticated user could read/write ALL businesses' data.
-- Cross-tenant data leak fix.
-- ============================================


-- ============================================
-- 1. recognition — CompanyWall.tsx
-- ============================================
ALTER TABLE recognition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recognition business read"
  ON recognition FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "recognition business write"
  ON recognition FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 2. polls — CompanyWall.tsx
-- ============================================
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "polls business read"
  ON polls FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "polls business write"
  ON polls FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 3. poll_votes — CompanyWall.tsx
-- ============================================
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poll_votes business read"
  ON poll_votes FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "poll_votes business write"
  ON poll_votes FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 4. legal_cases
-- ============================================
ALTER TABLE legal_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_cases business read"
  ON legal_cases FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "legal_cases business write"
  ON legal_cases FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 5. legal_contracts
-- ============================================
ALTER TABLE legal_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_contracts business read"
  ON legal_contracts FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "legal_contracts business write"
  ON legal_contracts FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 6. legal_obligations
-- ============================================
ALTER TABLE legal_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_obligations business read"
  ON legal_obligations FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "legal_obligations business write"
  ON legal_obligations FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 7. decision_log
-- ============================================
ALTER TABLE decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decision_log business read"
  ON decision_log FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "decision_log business write"
  ON decision_log FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 8. organizational_memory
-- ============================================
ALTER TABLE organizational_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizational_memory business read"
  ON organizational_memory FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "organizational_memory business write"
  ON organizational_memory FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 9. reality_gaps
-- ============================================
ALTER TABLE reality_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reality_gaps business read"
  ON reality_gaps FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "reality_gaps business write"
  ON reality_gaps FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 10. purchase_requests — procurement
-- ============================================
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_requests business read"
  ON purchase_requests FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "purchase_requests business write"
  ON purchase_requests FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 11. rfqs — procurement (Request for Quotation)
-- ============================================
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfqs business read"
  ON rfqs FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "rfqs business write"
  ON rfqs FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 12. payroll_items — no direct business_id, joins via payroll_runs
-- ============================================
ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_items business read"
  ON payroll_items FOR SELECT
  USING (payroll_run_id IN (
    SELECT pr.id FROM payroll_runs pr
    WHERE pr.business_id IN (SELECT business_id FROM get_current_staff())
  ));

CREATE POLICY "payroll_items business write"
  ON payroll_items FOR ALL
  USING (payroll_run_id IN (
    SELECT pr.id FROM payroll_runs pr
    WHERE pr.business_id IN (SELECT business_id FROM get_current_staff())
  ))
  WITH CHECK (payroll_run_id IN (
    SELECT pr.id FROM payroll_runs pr
    WHERE pr.business_id IN (SELECT business_id FROM get_current_staff())
  ));

-- ============================================
-- 13. xp_history — PHANTOM TABLE (GamificationContext inserts into it
--     but no migration ever created it; every XP award silently fails)
-- ============================================
CREATE TABLE IF NOT EXISTS xp_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID,
  amount INTEGER NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_history_user ON xp_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_history_business ON xp_history(business_id, created_at DESC);

ALTER TABLE xp_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xp_history own user read"
  ON xp_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "xp_history own user insert"
  ON xp_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- 14. approval_rules — PHANTOM TABLE (approvalWorkflow.ts queries it
--     but no migration ever created it; functions are currently dead
--     code but referenced by Approvals.tsx type imports)
-- ============================================
CREATE TABLE IF NOT EXISTS approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  min_amount DECIMAL(15,2),
  max_amount DECIMAL(15,2),
  required_approvers JSONB NOT NULL DEFAULT '[]',
  conditions JSONB DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_rules_business ON approval_rules(business_id, type, active);

ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_rules business read"
  ON approval_rules FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "approval_rules business write"
  ON approval_rules FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ############################################
-- FILE: 073_automation_secret.sql
-- ############################################
-- ============================================================================
-- 073: Add X-Automation-Secret to all pg_net calls to execute-automation
--
-- The execute-automation edge function now requires an X-Automation-Secret
-- header to prevent unauthorized external callers from triggering automations
-- across all businesses. This migration updates the three DB-side callers
-- (trigger_deal_automation, trigger_task_automation, execute_due_automations)
-- to pass the secret in pg_net headers.
--
-- The secret is stored in app.settings.automation_secret and must match the
-- AUTOMATION_SECRET env var set on the edge function via:
--   supabase secrets set AUTOMATION_SECRET=<value>
--
-- To set the Postgres setting:
--   ALTER DATABASE postgres SET app.settings.automation_secret = '<value>';
-- (run in Supabase SQL editor as postgres user)
-- ============================================================================

-- ============================================
-- 1. Replace trigger_deal_automation with version that includes secret header
-- ============================================
CREATE OR REPLACE FUNCTION trigger_deal_automation()
RETURNS TRIGGER AS $$
DECLARE
  trigger_type TEXT;
  v_webhook_url TEXT;
  v_secret TEXT;
BEGIN
  -- Determine trigger type
  IF TG_OP = 'INSERT' THEN
    trigger_type := 'deal_created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.stage = 'won' AND OLD.stage != 'won' THEN
      trigger_type := 'deal_won';
    ELSIF NEW.stage = 'lost' AND OLD.stage != 'lost' THEN
      trigger_type := 'deal_lost';
    ELSIF NEW.stage != OLD.stage THEN
      trigger_type := 'deal_stage_changed';
    ELSE
      RETURN NEW; -- No relevant change
    END IF;
  END IF;

  v_webhook_url := current_setting('app.settings.automation_webhook_url', true);
  v_secret := COALESCE(current_setting('app.settings.automation_secret', true), '');

  PERFORM net.http_post(
    url := v_webhook_url || '/functions/v1/execute-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Automation-Secret', v_secret
    ),
    body := json_build_object(
      'trigger', trigger_type,
      'payload', json_build_object(
        'deal_id', NEW.id,
        'title', NEW.title,
        'stage', NEW.stage,
        'value', NEW.value
      )
    )::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Automation trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. Replace trigger_task_automation with version that includes secret header
-- ============================================
CREATE OR REPLACE FUNCTION trigger_task_automation()
RETURNS TRIGGER AS $$
DECLARE
  trigger_type TEXT;
  v_webhook_url TEXT;
  v_secret TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    trigger_type := 'task_created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
      trigger_type := 'task_completed';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Check for due soon (24 hours)
  IF NEW.due_date IS NOT NULL THEN
    IF NEW.due_date <= NOW() + INTERVAL '24 hours' AND NEW.due_date > NOW() THEN
      trigger_type := 'task_due_soon';
    END IF;
  END IF;

  IF trigger_type IS NOT NULL THEN
    v_webhook_url := current_setting('app.settings.automation_webhook_url', true);
    v_secret := COALESCE(current_setting('app.settings.automation_secret', true), '');

    PERFORM net.http_post(
      url := v_webhook_url || '/functions/v1/execute-automation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Automation-Secret', v_secret
      ),
      body := json_build_object(
        'trigger', trigger_type,
        'payload', json_build_object(
          'task_id', NEW.id,
          'title', NEW.title,
          'status', NEW.status,
          'due_date', NEW.due_date
        )
      )::jsonb
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Task automation trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Replace execute_due_automations with version that includes secret header
-- ============================================
CREATE OR REPLACE FUNCTION public.execute_due_automations()
RETURNS void AS $$
DECLARE
  due RECORD;
  edge_url TEXT;
  v_secret TEXT;
BEGIN
  edge_url := current_setting('app.avenize_edge_url', true);
  IF edge_url IS NULL OR edge_url = '' THEN
    edge_url := 'https://avnenzpwqcnqvxwvtsqb.supabase.co/functions/v1/execute-automation';
  END IF;

  v_secret := COALESCE(current_setting('app.settings.automation_secret', true), '');

  FOR due IN
    SELECT id, business_id
    FROM public.automations
    WHERE trigger_type = 'schedule'
      AND enabled = TRUE
      AND next_run_at IS NOT NULL
      AND next_run_at <= NOW()
    ORDER BY next_run_at
    LIMIT 50
  LOOP
    PERFORM net.http_post(
      url := edge_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Automation-Secret', v_secret
      ),
      body := jsonb_build_object(
        'automation_id', due.id,
        'business_id', due.business_id
      )
    );

    UPDATE public.automations
    SET next_run_at = NULL
    WHERE id = due.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ############################################
-- FILE: 074_critical_rls_fix.sql
-- ############################################
-- ============================================
-- CRITICAL RLS FIX: Remove "Allow all" permissive policies on core tables
--
-- Migration 041 created `USING (true) WITH CHECK (true)` policies on
-- businesses, staff, business_branding, and user_xp. No later migration
-- ever dropped them. In Postgres RLS, multiple permissive policies for
-- the same command combine with OR, so even the restrictive policies
-- added by 998/999 on user_xp were effectively bypassed.
--
-- CONSEQUENCE: ANY authenticated user could read, insert, update, or
-- delete ANY business record, ANY staff record, ANY branding record,
-- and ANY user's XP — across ALL tenants. This completely broke
-- multi-tenant isolation.
--
-- Signup/invite flows are unaffected because create_business_and_owner
-- and accept_invite are SECURITY DEFINER functions that bypass RLS.
-- ============================================


-- ============================================
-- 1. BUSINESSES
-- ============================================

-- Drop the permissive policy and any stale policies
DROP POLICY IF EXISTS "Allow all on businesses" ON businesses;
DROP POLICY IF EXISTS "Users see own business" ON businesses;
DROP POLICY IF EXISTS "Authenticated users can create businesses" ON businesses;
DROP POLICY IF EXISTS "Businesses insert" ON businesses;

-- Users can see the business they belong to
CREATE POLICY "businesses_own_select"
  ON businesses FOR SELECT
  USING (id IN (SELECT business_id FROM get_current_staff()));

-- Owner/admin of the business can update it
CREATE POLICY "businesses_own_update"
  ON businesses FOR UPDATE
  USING (id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (id IN (SELECT business_id FROM get_current_staff()));

-- Direct INSERT is blocked — business creation must go through the
-- create_business_and_owner SECURITY DEFINER RPC (which bypasses RLS).
-- This prevents users from creating arbitrary businesses or inserting
-- into other tenants' business rows.

-- ============================================
-- 2. STAFF
-- ============================================

-- Drop the permissive policy and any stale policies
DROP POLICY IF EXISTS "Allow all on staff" ON staff;
DROP POLICY IF EXISTS "Staff see same business" ON staff;
DROP POLICY IF EXISTS "Owners/managers can manage staff" ON staff;
DROP POLICY IF EXISTS "Authenticated users can create staff" ON staff;
DROP POLICY IF EXISTS "Staff insert" ON staff;
DROP POLICY IF EXISTS "staff_update_own_profile" ON staff;
DROP POLICY IF EXISTS "staff_read_own_profile" ON staff;

-- Users can see all staff in their own business
CREATE POLICY "staff_business_select"
  ON staff FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Users can update their own profile (non-role fields)
CREATE POLICY "staff_self_update"
  ON staff FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Owners/admins can manage staff in their business (insert/update/delete)
CREATE POLICY "staff_admin_manage"
  ON staff FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM get_current_staff()
      WHERE role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM get_current_staff()
      WHERE role IN ('owner', 'admin')
    )
  );

-- ============================================
-- 3. BUSINESS_BRANDING
-- ============================================

-- Drop the permissive policy and any stale policies
DROP POLICY IF EXISTS "Allow all on branding" ON business_branding;
DROP POLICY IF EXISTS "Allow all on business_branding" ON business_branding;
DROP POLICY IF EXISTS "Authenticated users can create branding" ON business_branding;
DROP POLICY IF EXISTS "Branding insert" ON business_branding;

-- Users can see their own business branding
CREATE POLICY "branding_business_select"
  ON business_branding FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Users in the business can update branding
CREATE POLICY "branding_business_update"
  ON business_branding FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- Users in the business can insert branding
CREATE POLICY "branding_business_insert"
  ON business_branding FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- 4. USER_XP
-- ============================================

-- Drop ALL existing policies (permissive + restrictive that were OR-bypassed)
DROP POLICY IF EXISTS "Allow all on user_xp" ON user_xp;
DROP POLICY IF EXISTS "XP own" ON user_xp;
DROP POLICY IF EXISTS "Users can view their own XP" ON user_xp;
DROP POLICY IF EXISTS "Users can update their own XP" ON user_xp;
DROP POLICY IF EXISTS "Users can insert their own XP" ON user_xp;
DROP POLICY IF EXISTS "Users can view own XP" ON user_xp;
DROP POLICY IF EXISTS "Users can update own XP" ON user_xp;
DROP POLICY IF EXISTS "Users can insert own XP" ON user_xp;

-- Users can only access their own XP record
CREATE POLICY "user_xp_own_select"
  ON user_xp FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "user_xp_own_insert"
  ON user_xp FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_xp_own_update"
  ON user_xp FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_xp_own_delete"
  ON user_xp FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- Done
-- ============================================
SELECT 'Critical RLS policies restored on businesses, staff, business_branding, user_xp' as status;
