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
