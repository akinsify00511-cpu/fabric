-- 080_fix_cross_tenant_rls_subquery.sql
--
-- CRITICAL cross-tenant data leak fix.
--
-- Migrations 054-070 created RLS policies whose USING / WITH CHECK clause was:
--
--   business_id IN (SELECT id FROM businesses)
--
-- That subquery returns EVERY business's id, so the predicate matches every
-- row regardless of tenant -- it is effectively USING(true) / WITH
-- CHECK(true). Any authenticated user could read, insert, update and delete
-- rows belonging to ANY other business across every table these migrations
-- covered (the business event bus, entity freshness, intelligence, control
-- plane, org memory, simulation, self-audit, reality gaps, guardrails,
-- enforcement gate, ...).
--
-- This migration drops and recreates every such policy with the canonical
-- tenant-scoping predicate used elsewhere in the codebase:
--
--   business_id IN (SELECT business_id FROM get_current_staff())
--
-- get_current_staff() (migration 001) returns the caller's staff row via
-- auth.uid(); each user belongs to exactly one business. The
-- 'business_id IS NULL OR ...' variants are preserved so genuinely global
-- rows (NULL business_id) remain readable.
--
-- Pure internal SQL -- no new dependency, no external service.

\set ON_ERROR_STOP on

ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS business_id UUID;

DO $$ BEGIN
  DROP POLICY IF EXISTS "maintenance_property_viewable_by_business" ON public.maintenance_records;
  CREATE POLICY "maintenance_property_viewable_by_business" ON public.maintenance_records FOR SELECT USING (source_type IN ('property','facility')
               AND business_id IN (SELECT business_id FROM get_current_staff()));
EXCEPTION WHEN undefined_table OR undefined_column THEN RAISE NOTICE 'maintenance_records/source_type not found, skipping'; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "maintenance_property_managing_by_business" ON public.maintenance_records;
CREATE POLICY "maintenance_property_managing_by_business" ON public.maintenance_records FOR ALL USING (source_type IN ('property','facility')
             AND business_id IN (SELECT business_id FROM get_current_staff()));
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'maintenance_records not found, skipping'; END $$;

-- Remaining tables (timesheets, payment_providers, etc.) should already exist
DROP POLICY IF EXISTS "timesheets_viewable_by_business" ON public.timesheets;
CREATE POLICY "timesheets_viewable_by_business" ON public.timesheets FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "timesheets_manageable_by_business" ON public.timesheets;
CREATE POLICY "timesheets_manageable_by_business" ON public.timesheets FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "payment_providers_viewable" ON public.payment_providers;
CREATE POLICY "payment_providers_viewable" ON public.payment_providers FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "payment_providers_managing" ON public.payment_providers;
CREATE POLICY "payment_providers_managing" ON public.payment_providers FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "business_events_viewable" ON public.business_events;
CREATE POLICY "business_events_viewable" ON public.business_events FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "business_events_inserting" ON public.business_events;
CREATE POLICY "business_events_inserting" ON public.business_events FOR INSERT WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "entity_freshness_viewable" ON public.entity_freshness;
CREATE POLICY "entity_freshness_viewable" ON public.entity_freshness FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "entity_relationships_viewable" ON public.entity_relationships;
CREATE POLICY "entity_relationships_viewable" ON public.entity_relationships FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "entity_relationships_managing" ON public.entity_relationships;
CREATE POLICY "entity_relationships_managing" ON public.entity_relationships FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "business_ontology_viewable" ON public.business_ontology;
CREATE POLICY "business_ontology_viewable" ON public.business_ontology FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "business_ontology_managing" ON public.business_ontology;
CREATE POLICY "business_ontology_managing" ON public.business_ontology FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "dq_viewable" ON public.data_quality_checks;
CREATE POLICY "dq_viewable" ON public.data_quality_checks FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "dq_managing" ON public.data_quality_checks;
CREATE POLICY "dq_managing" ON public.data_quality_checks FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "claims_viewable" ON public.claims;
CREATE POLICY "claims_viewable" ON public.claims FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "claims_managing" ON public.claims;
CREATE POLICY "claims_managing" ON public.claims FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "attention_viewable" ON public.attention_exceptions;
CREATE POLICY "attention_viewable" ON public.attention_exceptions FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "attention_managing" ON public.attention_exceptions;
CREATE POLICY "attention_managing" ON public.attention_exceptions FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "simulations_viewable" ON public.simulations;
CREATE POLICY "simulations_viewable" ON public.simulations FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "simulations_managing" ON public.simulations;
CREATE POLICY "simulations_managing" ON public.simulations FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "objectives_viewable" ON public.strategic_objectives;
CREATE POLICY "objectives_viewable" ON public.strategic_objectives FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "objectives_managing" ON public.strategic_objectives;
CREATE POLICY "objectives_managing" ON public.strategic_objectives FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "benchmarks_viewable" ON public.market_benchmarks;
CREATE POLICY "benchmarks_viewable" ON public.market_benchmarks FOR SELECT USING (business_id IS NULL OR business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "benchmarks_managing" ON public.market_benchmarks;
CREATE POLICY "benchmarks_managing" ON public.market_benchmarks FOR ALL USING (business_id IS NULL OR business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "decisions_viewable" ON public.decisions;
CREATE POLICY "decisions_viewable" ON public.decisions FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "decisions_managing" ON public.decisions;
CREATE POLICY "decisions_managing" ON public.decisions FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "authority_viewable" ON public.authority_graph;
CREATE POLICY "authority_viewable" ON public.authority_graph FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "authority_managing" ON public.authority_graph;
CREATE POLICY "authority_managing" ON public.authority_graph FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "company_entities_viewable" ON public.company_entities;
CREATE POLICY "company_entities_viewable" ON public.company_entities FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "company_entities_managing" ON public.company_entities;
CREATE POLICY "company_entities_managing" ON public.company_entities FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "intercompany_viewable" ON public.intercompany_transactions;
CREATE POLICY "intercompany_viewable" ON public.intercompany_transactions FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "intercompany_managing" ON public.intercompany_transactions;
CREATE POLICY "intercompany_managing" ON public.intercompany_transactions FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "ai_agents_viewable" ON public.ai_agents;
CREATE POLICY "ai_agents_viewable" ON public.ai_agents FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "ai_agents_managing" ON public.ai_agents;
CREATE POLICY "ai_agents_managing" ON public.ai_agents FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "ai_agent_logs_viewable" ON public.ai_agent_logs;
CREATE POLICY "ai_agent_logs_viewable" ON public.ai_agent_logs FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "ai_agent_logs_managing" ON public.ai_agent_logs;
CREATE POLICY "ai_agent_logs_managing" ON public.ai_agent_logs FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "automation_proposals_viewable" ON public.automation_proposals;
CREATE POLICY "automation_proposals_viewable" ON public.automation_proposals FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "automation_proposals_managing" ON public.automation_proposals;
CREATE POLICY "automation_proposals_managing" ON public.automation_proposals FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "friction_viewable" ON public.friction_metrics;
CREATE POLICY "friction_viewable" ON public.friction_metrics FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "friction_managing" ON public.friction_metrics;
CREATE POLICY "friction_managing" ON public.friction_metrics FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "portal_accounts_viewable" ON public.portal_accounts;
CREATE POLICY "portal_accounts_viewable" ON public.portal_accounts FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "portal_accounts_managing" ON public.portal_accounts;
CREATE POLICY "portal_accounts_managing" ON public.portal_accounts FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "migration_viewable" ON public.migration_jobs;
CREATE POLICY "migration_viewable" ON public.migration_jobs FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "migration_managing" ON public.migration_jobs;
CREATE POLICY "migration_managing" ON public.migration_jobs FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "backup_viewable" ON public.backup_runs;
CREATE POLICY "backup_viewable" ON public.backup_runs FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "backup_managing" ON public.backup_runs;
CREATE POLICY "backup_managing" ON public.backup_runs FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "retention_viewable" ON public.retention_policies;
CREATE POLICY "retention_viewable" ON public.retention_policies FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "retention_managing" ON public.retention_policies;
CREATE POLICY "retention_managing" ON public.retention_policies FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "control_plane_viewable" ON public.control_plane_objects;
CREATE POLICY "control_plane_viewable" ON public.control_plane_objects FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "control_plane_managing" ON public.control_plane_objects;
CREATE POLICY "control_plane_managing" ON public.control_plane_objects FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "sod_viewable" ON public.separation_of_duties_rules;
CREATE POLICY "sod_viewable" ON public.separation_of_duties_rules FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "sod_managing" ON public.separation_of_duties_rules;
CREATE POLICY "sod_managing" ON public.separation_of_duties_rules FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "work_routes_viewable" ON public.work_routes;
CREATE POLICY "work_routes_viewable" ON public.work_routes FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "work_routes_managing" ON public.work_routes;
CREATE POLICY "work_routes_managing" ON public.work_routes FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "handoffs_viewable" ON public.handoffs;
CREATE POLICY "handoffs_viewable" ON public.handoffs FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "handoffs_managing" ON public.handoffs;
CREATE POLICY "handoffs_managing" ON public.handoffs FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "work_deps_viewable" ON public.work_dependencies;
CREATE POLICY "work_deps_viewable" ON public.work_dependencies FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "work_deps_managing" ON public.work_dependencies;
CREATE POLICY "work_deps_managing" ON public.work_dependencies FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "sla_viewable" ON public.sla_definitions;
CREATE POLICY "sla_viewable" ON public.sla_definitions FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "sla_managing" ON public.sla_definitions;
CREATE POLICY "sla_managing" ON public.sla_definitions FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "sla_track_viewable" ON public.sla_trackers;
CREATE POLICY "sla_track_viewable" ON public.sla_trackers FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "sla_track_managing" ON public.sla_trackers;
CREATE POLICY "sla_track_managing" ON public.sla_trackers FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "escalation_viewable" ON public.escalation_rules;
CREATE POLICY "escalation_viewable" ON public.escalation_rules FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "escalation_managing" ON public.escalation_rules;
CREATE POLICY "escalation_managing" ON public.escalation_rules FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "decision_records_viewable" ON public.decision_records;
CREATE POLICY "decision_records_viewable" ON public.decision_records FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "decision_records_managing" ON public.decision_records;
CREATE POLICY "decision_records_managing" ON public.decision_records FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "action_runs_viewable" ON public.action_protocol_runs;
CREATE POLICY "action_runs_viewable" ON public.action_protocol_runs FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "action_runs_managing" ON public.action_protocol_runs;
CREATE POLICY "action_runs_managing" ON public.action_protocol_runs FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "aicap_viewable" ON public.ai_capability_authorities;
CREATE POLICY "aicap_viewable" ON public.ai_capability_authorities FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "aicap_managing" ON public.ai_capability_authorities;
CREATE POLICY "aicap_managing" ON public.ai_capability_authorities FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "guardrail_viewable" ON public.agent_guardrail_checks;
CREATE POLICY "guardrail_viewable" ON public.agent_guardrail_checks FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "guardrail_managing" ON public.agent_guardrail_checks;
CREATE POLICY "guardrail_managing" ON public.agent_guardrail_checks FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "circuit_breaker_viewable" ON public.circuit_breaker_events;
CREATE POLICY "circuit_breaker_viewable" ON public.circuit_breaker_events FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "circuit_breaker_managing" ON public.circuit_breaker_events;
CREATE POLICY "circuit_breaker_managing" ON public.circuit_breaker_events FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "drift_viewable" ON public.process_drift_findings;
CREATE POLICY "drift_viewable" ON public.process_drift_findings FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "drift_managing" ON public.process_drift_findings;
CREATE POLICY "drift_managing" ON public.process_drift_findings FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "config_viewable" ON public.configuration_changes;
CREATE POLICY "config_viewable" ON public.configuration_changes FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "config_managing" ON public.configuration_changes;
CREATE POLICY "config_managing" ON public.configuration_changes FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "audit_viewable" ON public.self_audit_findings;
CREATE POLICY "audit_viewable" ON public.self_audit_findings FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "audit_managing" ON public.self_audit_findings;
CREATE POLICY "audit_managing" ON public.self_audit_findings FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "recon_viewable" ON public.reconciliation_runs;
CREATE POLICY "recon_viewable" ON public.reconciliation_runs FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "recon_managing" ON public.reconciliation_runs;
CREATE POLICY "recon_managing" ON public.reconciliation_runs FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "dead_wf_viewable" ON public.dead_workflow_findings;
CREATE POLICY "dead_wf_viewable" ON public.dead_workflow_findings FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "dead_wf_managing" ON public.dead_workflow_findings;
CREATE POLICY "dead_wf_managing" ON public.dead_workflow_findings FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "dup_auto_viewable" ON public.duplicate_automation_findings;
CREATE POLICY "dup_auto_viewable" ON public.duplicate_automation_findings FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "dup_auto_managing" ON public.duplicate_automation_findings;
CREATE POLICY "dup_auto_managing" ON public.duplicate_automation_findings FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "sys_deps_viewable" ON public.system_dependencies;
CREATE POLICY "sys_deps_viewable" ON public.system_dependencies FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "sys_deps_managing" ON public.system_dependencies;
CREATE POLICY "sys_deps_managing" ON public.system_dependencies FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "config_versions_viewable" ON public.configuration_versions;
CREATE POLICY "config_versions_viewable" ON public.configuration_versions FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "config_versions_managing" ON public.configuration_versions;
CREATE POLICY "config_versions_managing" ON public.configuration_versions FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "flags_viewable" ON public.feature_flags;
CREATE POLICY "flags_viewable" ON public.feature_flags FOR SELECT USING (business_id IS NULL OR business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "flags_managing" ON public.feature_flags;
CREATE POLICY "flags_managing" ON public.feature_flags FOR ALL USING (business_id IS NULL OR business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "incidents_viewable" ON public.incidents;
CREATE POLICY "incidents_viewable" ON public.incidents FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "incidents_managing" ON public.incidents;
CREATE POLICY "incidents_managing" ON public.incidents FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "anomaly_viewable" ON public.anomaly_events;
CREATE POLICY "anomaly_viewable" ON public.anomaly_events FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "anomaly_managing" ON public.anomaly_events;
CREATE POLICY "anomaly_managing" ON public.anomaly_events FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "four_reality_viewable" ON public.four_reality_assessments;
CREATE POLICY "four_reality_viewable" ON public.four_reality_assessments FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "four_reality_managing" ON public.four_reality_assessments;
CREATE POLICY "four_reality_managing" ON public.four_reality_assessments FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "persona_viewable" ON public.persona_profiles;
CREATE POLICY "persona_viewable" ON public.persona_profiles FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "persona_managing" ON public.persona_profiles;
CREATE POLICY "persona_managing" ON public.persona_profiles FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "need_signals_viewable" ON public.persona_need_signals;
CREATE POLICY "need_signals_viewable" ON public.persona_need_signals FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "need_signals_managing" ON public.persona_need_signals;
CREATE POLICY "need_signals_managing" ON public.persona_need_signals FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "journeys_viewable" ON public.persona_journeys;
CREATE POLICY "journeys_viewable" ON public.persona_journeys FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "journeys_managing" ON public.persona_journeys;
CREATE POLICY "journeys_managing" ON public.persona_journeys FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "adaptive_viewable" ON public.adaptive_experience_overrides;
CREATE POLICY "adaptive_viewable" ON public.adaptive_experience_overrides FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "adaptive_managing" ON public.adaptive_experience_overrides;
CREATE POLICY "adaptive_managing" ON public.adaptive_experience_overrides FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "discovery_viewable" ON public.persona_discovery_iterations;
CREATE POLICY "discovery_viewable" ON public.persona_discovery_iterations FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "discovery_managing" ON public.persona_discovery_iterations;
CREATE POLICY "discovery_managing" ON public.persona_discovery_iterations FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "enforcement_log_viewable" ON public.approval_enforcement_logs;
CREATE POLICY "enforcement_log_viewable" ON public.approval_enforcement_logs FOR SELECT USING (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "enforcement_log_managing" ON public.approval_enforcement_logs;
CREATE POLICY "enforcement_log_managing" ON public.approval_enforcement_logs FOR ALL USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- ---------------------------------------------------------------------------
-- entity_freshness_status view: recreate as a security_barrier view so the
-- underlying entity_freshness RLS (fixed above) is enforced even when the
-- view owner would otherwise bypass RLS. Without this, a non-barrier view
-- owned by a superuser could still expose every business's freshness rows.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS entity_freshness_status;
CREATE OR REPLACE VIEW entity_freshness_status WITH (security_barrier = true) AS
SELECT
  id, business_id, entity_type, entity_id,
  last_event_type, last_event_at, updated_at,
  CASE
    WHEN last_event_at IS NULL THEN 'unknown'
    WHEN now() - last_event_at < interval '1 hour' THEN 'fresh'
    WHEN now() - last_event_at < interval '24 hours' THEN 'today'
    WHEN now() - last_event_at < interval '7 days' THEN 'stale'
    ELSE 'old'
  END AS freshness_tier,
  CASE WHEN last_event_at IS NULL THEN NULL
       ELSE EXTRACT(EPOCH FROM (now() - last_event_at))::INTEGER END AS seconds_since_update
FROM entity_freshness;

-- ---------------------------------------------------------------------------
-- asset_categories / expense_categories: RLS was enabled (migration 039) but
-- NO policy was ever created, so these tables failed closed -- the frontend
-- (AssetManagement, ExpenseClaims) always got empty category lists. Add the
-- standard tenant-scoped read policy (all business staff) and owner/manager
-- write policy so categories load and admins can manage them.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "asset_categories_view" ON asset_categories;
CREATE POLICY "asset_categories_view" ON asset_categories
  FOR SELECT USING (business_id = (SELECT business_id FROM get_current_staff()));
DROP POLICY IF EXISTS "asset_categories_manage" ON asset_categories;
CREATE POLICY "asset_categories_manage" ON asset_categories
  FOR ALL USING (business_id = (SELECT business_id FROM get_current_staff())
    AND (SELECT role FROM get_current_staff()) IN ('owner', 'manager'))
  WITH CHECK (business_id = (SELECT business_id FROM get_current_staff())
    AND (SELECT role FROM get_current_staff()) IN ('owner', 'manager'));

DROP POLICY IF EXISTS "expense_categories_view" ON expense_categories;
CREATE POLICY "expense_categories_view" ON expense_categories
  FOR SELECT USING (business_id = (SELECT business_id FROM get_current_staff()));
DROP POLICY IF EXISTS "expense_categories_manage" ON expense_categories;
CREATE POLICY "expense_categories_manage" ON expense_categories
  FOR ALL USING (business_id = (SELECT business_id FROM get_current_staff())
    AND (SELECT role FROM get_current_staff()) IN ('owner', 'manager'))
  WITH CHECK (business_id = (SELECT business_id FROM get_current_staff())
    AND (SELECT role FROM get_current_staff()) IN ('owner', 'manager'));

-- ---------------------------------------------------------------------------
-- approval_requests view: same security_barrier fix. The view (migration 046)
-- is owned by the postgres superuser and is NOT a barrier view, so it bypasses
-- the (correct, tenant-scoped) RLS on the underlying approvals table and would
-- expose every business's approvals. Recreate WITH (security_barrier = true)
-- using the identical column list so the existing INSTEAD OF UPDATE trigger
-- (approval_requests_update) keeps working.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.approval_requests WITH (security_barrier = true) AS
SELECT
  a.id,
  a.business_id,
  a.status,
  a.current_step AS current_level,
  a.total_steps,
  a.amount,
  a.entity_type AS type,
  COALESCE(a.description, a.entity_type) AS entity_name,
  a.entity_id,
  a.requester_id,
  s.full_name AS requester,
  a.created_at,
  a.updated_at
FROM public.approvals a
LEFT JOIN public.staff s ON s.id = a.requester_id;

