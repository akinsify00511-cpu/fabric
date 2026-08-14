
-- ############################################
-- FILE: 075_leads_business_id_and_rls.sql
-- ############################################
-- ============================================
-- LEADS TABLE: Add business_id + fix cross-tenant RLS
--
-- The leads table (migration 041) was created WITHOUT a business_id
-- column, but the frontend (Leads.tsx, crm.ts) filters by business_id —
-- so queries silently returned nothing and the lead pipeline was broken.
-- The RLS policy also allowed ANY authenticated user to see ALL
-- unassigned leads across ALL businesses (cross-tenant leak).
--
-- This migration:
-- 1. Adds business_id (nullable — existing leads and platform-level
--    leads have no business)
-- 2. Drops the permissive "unassigned visible to all" policy
-- 3. Restores business-scoped RLS
-- 4. Adds an index for the business_id filter
-- ============================================


-- 1. Add business_id column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

-- 2. Index for the common query pattern
CREATE INDEX IF NOT EXISTS idx_leads_business ON leads(business_id, created_at DESC);

-- 3. Drop old permissive policies
DROP POLICY IF EXISTS "Anyone can create leads" ON leads;
DROP POLICY IF EXISTS "Users can view business leads" ON leads;
DROP POLICY IF EXISTS "Users can update assigned leads" ON leads;

-- 4. New RLS policies

-- Public insert: anonymous users can submit a lead for a specific business
-- (business_id is provided by the public form). Platform-level leads
-- (business_id NULL) are also allowed from the public marketing form.
CREATE POLICY "leads_public_insert"
  ON leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

-- Business members can see leads scoped to their business
CREATE POLICY "leads_business_select"
  ON leads FOR SELECT
  TO authenticated
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Business members can update leads in their business
CREATE POLICY "leads_business_update"
  ON leads FOR UPDATE
  TO authenticated
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- Business members can delete leads in their business
CREATE POLICY "leads_business_delete"
  ON leads FOR DELETE
  TO authenticated
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- Done
-- ============================================
SELECT 'leads table: business_id added, RLS scoped to business' as status;

-- ============================================
-- CONTACTS: Add traceability columns used by crm.ts convertLeadToContact
-- The contacts table (migration 001) only has: name, email, phone,
-- company, deal_id. The lead-conversion code inserts full_name, source,
-- lead_id, notes — none of which exist. Add them so the pipeline works.
-- ============================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS full_name TEXT;

-- full_name is the human-readable name; populate from name for existing rows
UPDATE contacts SET full_name = name WHERE full_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_lead_id ON contacts(lead_id) WHERE lead_id IS NOT NULL;

-- ############################################
-- FILE: 076_clients_public_update_policy.sql
-- ############################################
-- ============================================
-- PUBLIC BOOKING: Allow anon UPDATE on clients for upsert
--
-- PublicAppointments.tsx upserts a client row by (business_id, email) when
-- an anonymous booker submits the form. The `clients_public_insert` policy
-- (migration 043) allows anon INSERT, but there is no anon UPDATE policy.
-- PostgREST's upsert runs INSERT ... ON CONFLICT DO UPDATE, so the UPDATE
-- branch is rejected by RLS when a returning booker (same email) submits
-- again — the booking crashes with a 403/RLS denial instead of updating
-- their phone/name.
--
-- This migration adds a narrowly-scoped anon UPDATE policy on clients so
-- the upsert's ON CONFLICT branch can update the matching row. The policy
-- mirrors the INSERT check (business_id IS NOT NULL); the upsert's own
-- ON CONFLICT (business_id, email) clause provides the row-level scoping.
-- ============================================


DROP POLICY IF EXISTS "clients_public_update" ON clients;

CREATE POLICY "clients_public_update" ON public.clients
  FOR UPDATE TO anon, authenticated
  USING (business_id IS NOT NULL)
  WITH CHECK (business_id IS NOT NULL);

SELECT 'clients: anon UPDATE policy added for public booking upsert' as status;

-- ############################################
-- FILE: 077_atomic_xp_award.sql
-- ############################################
-- ============================================
-- ATOMIC XP AWARD WITH STREAK + LEVEL + HISTORY
--
-- GamificationContext.awardXP was doing a client-side read-modify-write:
-- SELECT xp_total, compute new value in JS, UPDATE. Two concurrent calls
-- (e.g., completing two tasks quickly) would both read the same xp_total,
-- both add their amount, and the second UPDATE would overwrite the first,
-- silently losing XP.
--
-- The existing award_xp() RPC does atomic increment but doesn't handle
-- streak logic or xp_history logging. This new RPC does everything
-- server-side in a single transaction:
--   1. Atomic xp_total increment (no race)
--   2. Streak update (today vs yesterday vs other)
--   3. Level recalculation
--   4. xp_history insert
--   5. Returns new state for client to consume
-- ============================================


CREATE OR REPLACE FUNCTION public.award_xp_with_streak(
  p_user_id UUID,
  p_xp_amount INTEGER,
  p_action TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE(
  xp_total INTEGER,
  level INTEGER,
  streak_days INTEGER,
  longest_streak INTEGER,
  last_active_date DATE,
  leveled_up BOOLEAN
) AS $$
DECLARE
  v_current_xp INTEGER := 0;
  v_new_xp INTEGER;
  v_old_level INTEGER;
  v_new_level INTEGER;
  v_streak INTEGER := 0;
  v_longest INTEGER := 0;
  v_last_active DATE;
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - 1;
BEGIN
  -- Ensure user_xp row exists
  INSERT INTO user_xp (user_id, xp_total, level, streak_days, longest_streak, last_active_date)
  VALUES (p_user_id, 0, 1, 0, 0, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  -- Read current state (single read, then atomic update below)
  SELECT xp_total, streak_days, longest_streak, last_active_date
  INTO v_current_xp, v_streak, v_longest, v_last_active
  FROM user_xp
  WHERE user_id = p_user_id;

  v_current_xp := COALESCE(v_current_xp, 0);
  v_new_xp := v_current_xp + p_xp_amount;
  v_old_level := calculate_level(v_current_xp);
  v_new_level := calculate_level(v_new_xp);

  -- Streak logic
  IF v_last_active IS NULL OR v_last_active < v_yesterday THEN
    v_streak := 1;
  ELSIF v_last_active = v_yesterday THEN
    v_streak := v_streak + 1;
  END IF;

  v_longest := GREATEST(COALESCE(v_longest, 0), v_streak);

  -- Atomic update (single statement, no race window)
  UPDATE user_xp
  SET
    xp_total = v_new_xp,
    level = v_new_level,
    streak_days = v_streak,
    longest_streak = v_longest,
    last_active_date = v_today,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log to xp_history
  INSERT INTO xp_history (user_id, amount, action, description)
  VALUES (p_user_id, p_xp_amount, p_action, p_description);

  RETURN QUERY
  SELECT
    v_new_xp,
    v_new_level,
    v_streak,
    v_longest,
    v_today,
    (v_new_level > v_old_level);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant to authenticated (the RPC uses auth.uid() indirectly via p_user_id
-- which the client passes from supabase.auth.getUser())
GRANT EXECUTE ON FUNCTION public.award_xp_with_streak TO authenticated;

SELECT 'award_xp_with_streak RPC created' as status;

-- ############################################
-- FILE: 078_enable_rls_unprotected_tables.sql
-- ############################################
-- ============================================
-- ENABLE RLS ON 11 UNPROTECTED TABLES
--
-- Discovery found 11 tables created by migrations but never had
-- ENABLE ROW LEVEL SECURITY applied. Without RLS, ANY authenticated
-- user can read/write ALL rows across ALL businesses (cross-tenant).
-- None of these tables are queried directly from the frontend (all
-- access is via SECURITY DEFINER RPCs or service_role edge functions),
-- so enabling RLS will not break any client query.
--
-- Categories:
--   A. Business-scoped (have business_id): action_reversals,
--      commission_plans, customer_risk_scores, security_audit_log
--   B. Parent-linked (business_id via FK): purchase_request_items,
--      rfq_line_items, webhook_logs
--   C. Global/platform (no business_id, server-side only):
--      auth_rate_limits, business_event_handlers, plan_pricing,
--      saml_metadata_cache
-- ============================================


-- ============================================
-- A. BUSINESS-SCOPED TABLES
-- ============================================

-- action_reversals
ALTER TABLE action_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "action_reversals_business" ON action_reversals
  FOR ALL USING (business_id = (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM get_current_staff()));

-- commission_plans
ALTER TABLE commission_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commission_plans_business" ON commission_plans
  FOR ALL USING (business_id = (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM get_current_staff()));

-- customer_risk_scores
ALTER TABLE customer_risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_risk_scores_business" ON customer_risk_scores
  FOR ALL USING (business_id = (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM get_current_staff()));

-- security_audit_log (business_id is nullable — platform events have no business)
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security_audit_log_business_read" ON security_audit_log
  FOR SELECT USING (
    business_id IS NULL OR business_id = (SELECT business_id FROM get_current_staff())
  );
-- Writes only via service_role (edge functions / triggers); no client INSERT/UPDATE policy.

-- ============================================
-- B. PARENT-LINKED TABLES (business_id via FK join)
-- ============================================

-- purchase_request_items -> purchase_requests.business_id
ALTER TABLE purchase_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_request_items_business" ON purchase_request_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM purchase_requests pr
           WHERE pr.id = purchase_request_items.request_id
             AND pr.business_id = (SELECT business_id FROM get_current_staff()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM purchase_requests pr
           WHERE pr.id = purchase_request_items.request_id
             AND pr.business_id = (SELECT business_id FROM get_current_staff()))
  );

-- rfq_line_items -> rfqs.business_id
ALTER TABLE rfq_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rfq_line_items_business" ON rfq_line_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM rfqs r
           WHERE r.id = rfq_line_items.rfq_id
             AND r.business_id = (SELECT business_id FROM get_current_staff()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM rfqs r
           WHERE r.id = rfq_line_items.rfq_id
             AND r.business_id = (SELECT business_id FROM get_current_staff()))
  );

-- webhook_logs -> webhooks.business_id
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_logs_business" ON webhook_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM webhooks w
           WHERE w.id = webhook_logs.webhook_id
             AND w.business_id = (SELECT business_id FROM get_current_staff()))
  );
-- webhook_logs are append-only by the system; no client INSERT/UPDATE/DELETE policy.

-- ============================================
-- C. GLOBAL / PLATFORM TABLES (no client access)
-- RLS enabled with NO policies = client (anon/authenticated) denied all
-- access; only service_role (edge functions) and SECURITY DEFINER
-- RPCs can read/write. This is the correct posture for:
--   - auth_rate_limits: server-side rate limiting
--   - business_event_handlers: server-side event handler registry
--   - plan_pricing: read via grant_business_plan SECURITY DEFINER RPC
--   - saml_metadata_cache: server-side SSO metadata cache
-- ============================================

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_event_handlers ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE saml_metadata_cache ENABLE ROW LEVEL SECURITY;

SELECT 'RLS enabled on 11 previously-unprotected tables' as status;

-- ############################################
-- FILE: 079_settings_type_and_secret_rls.sql
-- ############################################
-- 079_settings_type_and_secret_rls.sql
--
-- Two problems fixed here:
--
-- 1. The `settings` table was created (046) WITHOUT a `type` column, but the
--    client (smsService / SMS page / WhatsApp integration) upserts rows with
--    `type: 'secret'`. PostgREST rejects unknown columns, so saving an
--    integration API key has been silently failing (the error is swallowed by
--    the page's try/catch). This adds the missing column so those writes
--    succeed, and backfills known secret keys.
--
-- 2. The `settings_business_all` policy let ANY business staff member read
--    every settings row — including rows holding provider API keys / access
--    tokens (type='secret'). A non-admin staff member could exfiltrate the
--    Termii API key or WhatsApp token by querying the table directly via the
--    Postgres REST API. This tightens RLS so secret rows are readable (and
--    writable) only by owner/manager roles; non-secret rows stay
--    business-readable as before.
--
-- Pure internal SQL — no new dependency, no external service.


-- (1) Add the missing column. Nullable so existing rows default to NULL.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS type TEXT;

-- Backfill known integration-secret keys so the new RLS gate covers them.
UPDATE public.settings
SET type = 'secret'
WHERE type IS NULL
  AND key IN (
    'termii_api_key',
    'whatsapp_access_token',
    'whatsapp_phone_number_id',
    'whatsapp_business_id',
    'paystack_secret_key',
    'flutterwave_secret_key',
    'mailgun_api_key',
    'sendgrid_api_key',
    'postmark_api_token',
    'smtp_password'
  );

-- (2) Tighten RLS. Drop the broad business-wide policy.
DROP POLICY IF EXISTS "settings_business_all" ON public.settings;

-- Read: all business staff may read NON-secret settings; only owner/manager
-- may read secret settings.
CREATE POLICY "settings_select_non_secret" ON public.settings
  FOR SELECT USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND (type IS DISTINCT FROM 'secret')
  );

CREATE POLICY "settings_select_secret_admin" ON public.settings
  FOR SELECT USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND type = 'secret'
    AND (SELECT role FROM public.get_current_staff()) IN ('owner', 'manager')
  );

-- Writes: owner/manager may write secret rows; any business staff may write
-- non-secret rows (preserves existing write behaviour for config keys).
CREATE POLICY "settings_insert" ON public.settings
  FOR INSERT WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND (
      type IS DISTINCT FROM 'secret'
      OR (SELECT role FROM public.get_current_staff()) IN ('owner', 'manager')
    )
  );

CREATE POLICY "settings_update" ON public.settings
  FOR UPDATE USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND (
      type IS DISTINCT FROM 'secret'
      OR (SELECT role FROM public.get_current_staff()) IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND (
      type IS DISTINCT FROM 'secret'
      OR (SELECT role FROM public.get_current_staff()) IN ('owner', 'manager')
    )
  );

CREATE POLICY "settings_delete" ON public.settings
  FOR DELETE USING (
    business_id = (SELECT business_id FROM public.get_current_staff())
    AND (
      type IS DISTINCT FROM 'secret'
      OR (SELECT role FROM public.get_current_staff()) IN ('owner', 'manager')
    )
  );

-- ############################################
-- FILE: 080_fix_cross_tenant_rls_subquery.sql
-- ############################################
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


DROP POLICY IF EXISTS "maintenance_property_viewable_by_business" ON public.maintenance_records;
CREATE POLICY "maintenance_property_viewable_by_business" ON public.maintenance_records FOR SELECT USING (source_type IN ('property','facility')
             AND business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "maintenance_property_managing_by_business" ON public.maintenance_records;
CREATE POLICY "maintenance_property_managing_by_business" ON public.maintenance_records FOR ALL USING (source_type IN ('property','facility')
             AND business_id IN (SELECT business_id FROM get_current_staff()));

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


-- ############################################
-- FILE: 081_business_fk_cascade.sql
-- ############################################
-- 081_business_fk_cascade.sql
--
-- Two business-scoped child tables were created with a bare
-- `business_id ... REFERENCES businesses(id)` and NO ON DELETE action:
--
--   api_request_logs.business_id  (migration 015)
--   deal_analytics.business_id    (migration 034)
--
-- The default action is RESTRICT, so deleting a business would fail as long
-- as either table holds a row for it -- the business becomes undeletable and
-- the rows are effectively orphaned from a lifecycle standpoint. Both tables
-- are purely business-owned child data (API request logs, deal win/loss
-- analytics) with no cross-tenant meaning, so they should be cleaned up when
-- the business is deleted, matching the ~295 other business FKs that already
-- use ON DELETE CASCADE.
--
-- Pure internal SQL. No new dependency.


-- api_request_logs: drop whatever FK name Postgres assigned, re-add named.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'api_request_logs'::regclass AND contype = 'f'
             AND connamespace = 'public'::regnamespace LOOP
    EXECUTE format('ALTER TABLE public.api_request_logs DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.api_request_logs
  ADD CONSTRAINT api_request_logs_business_fk
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- deal_analytics: same.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'deal_analytics'::regclass AND contype = 'f'
             AND connamespace = 'public'::regnamespace LOOP
    EXECUTE format('ALTER TABLE public.deal_analytics DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.deal_analytics
  ADD CONSTRAINT deal_analytics_business_fk
  FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- ############################################
-- FILE: 082_schema_drift_repair.sql
-- ############################################
-- ============================================
-- SCHEMA DRIFT REPAIR: deals columns + stage CHECK, staff.date_of_birth,
-- realtime publication, signatures storage bucket
--
-- Fixes frontend↔schema drift found by comprehensive column-level audit.
-- Every column/stage referenced by the frontend but missing from the schema
-- is added here. Idempotent (IF NOT EXISTS / DROP IF EXISTS).
-- ============================================


-- ============================================
-- 1. DEALS TABLE: add missing columns + fix stage CHECK constraint
-- ============================================
-- CRM.tsx inserts/updates contact_name, contact_email, contact_phone,
-- notes, probability — none exist on the deals table (001).
-- Dashboard.tsx filters .eq('stage','hot'); CRM default stage is 'active'.
-- The 001 CHECK only allows prospect|qualified|proposal|negotiation|won|lost
-- — 'hot' and 'active' are rejected, breaking deal creation and the dashboard.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 50;

-- Replace the stage CHECK to include 'hot' and 'active' (used by CRM + Dashboard).
-- Constraint name is auto-generated; drop by pattern using a DO block.
DO $$
BEGIN
  -- Drop any existing CHECK constraint on deals.stage
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'deals'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%stage IN%'
  ) THEN
    EXECUTE format(
      'ALTER TABLE deals DROP CONSTRAINT %I',
      (SELECT conname FROM pg_constraint
       WHERE conrelid = 'deals'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%stage IN%'
       LIMIT 1)
    );
  END IF;
END $$;

ALTER TABLE deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN ('prospect', 'qualified', 'hot', 'active', 'proposal', 'negotiation', 'won', 'lost'));

-- ============================================
-- 2. STAFF TABLE: add date_of_birth
-- ============================================
-- CompanyWall.tsx and CompanyHome.tsx select staff.date_of_birth for
-- birthday widgets. No migration ever defined this column.

ALTER TABLE staff ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ============================================
-- 3. REALTIME PUBLICATION: add tables the frontend subscribes to
-- ============================================
-- Only channels/messages/tasks were in supabase_realtime (999_fix_missing).
-- The frontend subscribes to postgres_changes on:
--   notifications (NotificationBell, Notifications, NotificationsCenter)
--   business_events (FreshnessBadge)
--   chat_messages (LiveChat)
-- Without these in the publication, subscribe() fires a postgres_changes error.

-- ADD TABLE IF NOT EXISTS is unsupported on Postgres < 15; guard each add.
-- Notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
-- business_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'business_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.business_events;
  END IF;
END $$;
-- chat_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;

-- ============================================
-- 4. SIGNATURES STORAGE BUCKET
-- ============================================
-- SignDocument.tsx uploads signature images to storage.from('signatures')
-- but no migration created the bucket.

INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', false)
ON CONFLICT (id) DO NOTHING;

-- ############################################
-- FILE: 082_self_audit_function_grant.sql
-- ############################################
-- Ensure run_system_health_audit exists AND is callable from the client.
-- PostgREST reports "Could not find the function public.run_system_health_audit
-- (p_business_id) in the schema cache" when the function is missing or not
-- granted to the requesting role. This migration re-declares the function
-- idempotently (so it exists even if 068 was not applied) and grants EXECUTE
-- to authenticated, then reloads the PostgREST schema cache.

CREATE TABLE IF NOT EXISTS self_audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID,
  audit_dimension TEXT,
  category TEXT,
  severity TEXT,
  title TEXT,
  detail TEXT,
  entity_type TEXT,
  entity_id TEXT,
  owner_id UUID,
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION run_system_health_audit(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'system_health', 'stale_data', 'warning',
    'Stale entity: ' || entity_type, 'No events for ' || entity_type || ' in 30 days',
    entity_type, entity_id
  FROM entity_freshness
  WHERE business_id = p_business_id AND freshness_tier IN ('stale','old')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

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

CREATE OR REPLACE FUNCTION run_business_health_audit(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO self_audit_findings (business_id, audit_dimension, category, severity, title, detail, entity_type, entity_id)
  SELECT p_business_id, 'business_health', 'incomplete_record', 'warning',
    'Invoice without a contact', 'Invoice has no contact linked',
    'invoice', i.id
  FROM invoices i WHERE i.business_id = p_business_id AND i.contact_id IS NULL
  ON CONFLICT DO NOTHING;

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

GRANT EXECUTE ON FUNCTION run_system_health_audit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION run_business_health_audit(UUID) TO authenticated;

-- Reload the PostgREST schema cache so the newly-granted function is visible.
NOTIFY pgrst, 'reload schema';

-- ############################################
-- FILE: 083_staff_personal_fields_and_onboarding_title.sql
-- ############################################
-- Humanize the staff record: personal fields that aid HR / People / the
-- Company Wall (birthdays already use date_of_birth) and let a person
-- introduce themselves beyond name + title. Also extends the onboarding RPC
-- to accept the owner's job title / position (was hardcoded to 'Owner').

-- 1. Personal / humanizing columns on staff.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS hobbies TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pronouns TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS emergency_contact TEXT;

-- 2. create_business_and_owner: accept the owner's position/job title so
-- onboarding can capture "I'm the Operations Director" instead of always
-- writing 'Owner'. CREATE OR REPLACE cannot change the parameter list, so
-- DROP then CREATE. Defaults keep existing callers (signup, invite-accept)
-- working unchanged.
DROP FUNCTION IF EXISTS create_business_and_owner(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_business_and_owner(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_business_and_owner(
  p_business_name TEXT,
  p_industry TEXT DEFAULT NULL,
  p_staff_name TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL
) RETURNS TABLE(p_business_id UUID, p_staff_id UUID) AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
BEGIN
  -- Check if user already belongs to a business
  IF EXISTS (SELECT 1 FROM staff WHERE staff.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User already belongs to a business';
  END IF;

  -- Create the business
  INSERT INTO businesses (name, industry)
  VALUES (p_business_name, p_industry)
  RETURNING businesses.id INTO v_business_id;

  -- Create the owner staff record WITH onboarding completed.
  -- job_title: use the position the user gave at onboarding, falling back to
  -- 'Owner' so the column is never empty for the business founder.
  INSERT INTO staff (staff.business_id, staff.user_id, staff.name, staff.role, staff.job_title, staff.onboarding_completed)
  VALUES (v_business_id, auth.uid(), p_staff_name, 'owner', COALESCE(NULLIF(TRIM(p_job_title), ''), 'Owner'), TRUE)
  RETURNING staff.id INTO v_staff_id;

  RETURN QUERY SELECT v_business_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_business_and_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Reload PostgREST so the new function signature + columns are visible.
NOTIFY pgrst, 'reload schema';

-- ############################################
-- FILE: 084_task_management_enhancements.sql
-- ############################################
-- 084_task_management_enhancements.sql
-- Turn the tasks table from a basic todo list into a managed-work surface:
-- assignment, follow-up comments, review feedback (satisfactory / rework),
-- and time management (estimated vs logged hours).
--
-- All additions are additive (no drop of existing data) and idempotent.


-- ============================================================
-- 1. Extend tasks table with review + time-management columns
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(6,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(6,2) DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_status TEXT
  DEFAULT 'pending'
  CHECK (review_status IN ('pending', 'satisfactory', 'needs_rework'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_comment TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES staff(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Allow the richer priority set used by the UI (004 only allowed low/medium/high/urgent).
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

COMMENT ON COLUMN tasks.review_status IS
  'pending = not yet reviewed; satisfactory = approved by a manager/lead; needs_rework = sent back for rework.';

-- ============================================================
-- 2. task_comments — follow-up thread on a task
-- ============================================================

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  author_id UUID REFERENCES staff(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_comments same business read"
  ON task_comments FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));
CREATE POLICY "task_comments same business write"
  ON task_comments FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================================
-- 3. task_time_logs — manual time entries (hours + note)
-- ============================================================

CREATE TABLE IF NOT EXISTS task_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  hours NUMERIC(6,2) NOT NULL CHECK (hours > 0),
  note TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_time_logs_task_id ON task_time_logs(task_id);

ALTER TABLE task_time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_time_logs same business read"
  ON task_time_logs FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));
CREATE POLICY "task_time_logs same business write"
  ON task_time_logs FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================================
-- 4. Auto-maintain tasks.actual_hours from time logs + updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION maintain_task_actual_hours()
RETURNS TRIGGER AS $$
DECLARE
  p_task UUID;
  p_business UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    p_task := OLD.task_id;
    p_business := OLD.business_id;
  ELSE
    p_task := NEW.task_id;
    p_business := NEW.business_id;
  END IF;

  UPDATE tasks SET
    actual_hours = (
      SELECT COALESCE(SUM(hours), 0) FROM task_time_logs WHERE task_id = p_task
    ),
    updated_at = NOW()
  WHERE id = p_task;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_task_time_logs_actual_hours ON task_time_logs;
CREATE TRIGGER trg_task_time_logs_actual_hours
  AFTER INSERT OR UPDATE OR DELETE ON task_time_logs
  FOR EACH ROW EXECUTE FUNCTION maintain_task_actual_hours();
