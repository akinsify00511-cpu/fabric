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

\set ON_ERROR_STOP on

-- ============================================
-- A. BUSINESS-SCOPED TABLES
-- ============================================

-- action_reversals (may not exist if 20260101000004 failed)
DO $$ BEGIN
  ALTER TABLE action_reversals ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "action_reversals_business" ON action_reversals
    FOR ALL USING (business_id = (SELECT business_id FROM get_current_staff()))
    WITH CHECK (business_id = (SELECT business_id FROM get_current_staff()));
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'action_reversals not found, skipping'; END $$;

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
DO $$ BEGIN
  ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "security_audit_log_business_read" ON security_audit_log
    FOR SELECT USING (
    business_id IS NULL OR business_id = (SELECT business_id FROM get_current_staff())
  );
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'security_audit_log not found, skipping'; END $$;
-- Writes only via service_role (edge functions / triggers); no client INSERT/UPDATE policy.

-- ============================================
-- B. PARENT-LINKED TABLES (business_id via FK join)
-- ============================================

-- purchase_request_items -> purchase_requests.business_id (may not exist)
DO $$ BEGIN
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
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'purchase_request_items not found, skipping'; END $$;

-- rfq_line_items -> rfqs.business_id (may not exist)
DO $$ BEGIN
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
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'rfq_line_items not found, skipping'; END $$;

-- webhook_logs -> webhooks.business_id
DO $$ BEGIN ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'webhook_logs not found, skipping'; END $$;
DO $$ BEGIN
  CREATE POLICY "webhook_logs_business" ON webhook_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM webhooks w
           WHERE w.id = webhook_logs.webhook_id
             AND w.business_id = (SELECT business_id FROM get_current_staff()))
  );
EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'webhook_logs not found, skipping'; END $$;
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

DO $$ BEGIN ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'auth_rate_limits not found, skipping'; END $$;
DO $$ BEGIN ALTER TABLE business_event_handlers ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'business_event_handlers not found, skipping'; END $$;
DO $$ BEGIN ALTER TABLE plan_pricing ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'plan_pricing not found, skipping'; END $$;
DO $$ BEGIN ALTER TABLE saml_metadata_cache ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'saml_metadata_cache not found, skipping'; END $$;

SELECT 'RLS enabled on 11 previously-unprotected tables' as status;
