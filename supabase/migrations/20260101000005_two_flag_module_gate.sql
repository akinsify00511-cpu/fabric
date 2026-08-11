-- ============================================
-- TWO-FLAG MODULE ACCESS GATE
--   entitled  = does this business's plan include the module?
--   ready     = is the module wired to real data yet (not demo/hardcoded)?
-- A module renders ONLY when BOTH are true. Readiness gates everyone
-- (even paying customers); entitlement gates by plan on top of that.
--
-- This closes the P0 hole: a hidden nav item with an unprotected route
-- behind it is not a gate. can_access_module() is the single server-side
-- authority; the client calls it AND it's enforced at the route layer.
-- ============================================

-- Plan tier rank — higher = more modules. Existing plans are
-- free/starter/professional/enterprise. The product roadmap names
-- growth/scale; we map growth→professional, scale→enterprise so existing
-- data is untouched, while the roadmap tiers are recognised as aliases.
CREATE TABLE IF NOT EXISTS module_plan_tiers (
  module_key TEXT PRIMARY KEY,
  min_plan_tier INTEGER NOT NULL,   -- 0=free 1=starter 2=prof 3=enterprise
  display_name TEXT NOT NULL,
  category TEXT DEFAULT 'core'
);

-- The readiness flag — the safety net. Set HONESTLY: only true where the
-- module persists real data to Supabase right now. Flipping a row to true
-- is the "launch" of a module for whoever is already entitled.
CREATE TABLE IF NOT EXISTS module_status (
  module_key TEXT PRIMARY KEY REFERENCES module_plan_tiers(module_key) ON DELETE CASCADE,
  ready BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Helper: resolve a business's effective plan tier (0-3). Reads
-- business_entitlements.plan, falls back to free, and accepts the
-- roadmap aliases (growth→prof, scale→enterprise).
CREATE OR REPLACE FUNCTION resolve_plan_tier(p_business_id UUID)
RETURNS INTEGER AS $$
DECLARE v_plan TEXT; v_tier INTEGER;
BEGIN
  SELECT e.plan INTO v_plan
  FROM business_entitlements e
  WHERE e.business_id = p_business_id;
  v_plan := COALESCE(v_plan, 'free');
  v_tier := CASE v_plan
    WHEN 'free' THEN 0
    WHEN 'starter' THEN 1
    WHEN 'growth' THEN 2
    WHEN 'professional' THEN 2
    WHEN 'pro' THEN 2
    WHEN 'scale' THEN 3
    WHEN 'enterprise' THEN 3
    ELSE 0
  END;
  RETURN v_tier;
END;
$$ LANGUAGE plpgsql STABLE;

-- The single authority. Returns the two flags ANDed so the client never
-- has to reason about both. Also returns them individually for richer UI
-- (e.g. "not ready" vs "needs higher plan").
CREATE OR REPLACE FUNCTION can_access_module(
  p_business_id UUID,
  p_module_key TEXT
)
RETURNS TABLE(can_access BOOLEAN, entitled BOOLEAN, ready BOOLEAN, min_tier INTEGER, current_tier INTEGER) AS $$
DECLARE
  v_min_tier INTEGER;
  v_ready BOOLEAN;
  v_current_tier INTEGER;
BEGIN
  SELECT m.min_plan_tier INTO v_min_tier FROM module_plan_tiers m WHERE m.module_key = p_module_key;
  IF v_min_tier IS NULL THEN
    -- Unknown module: deny by default (fail closed).
    RETURN QUERY SELECT false, false, false, NULL, NULL;
    RETURN;
  END IF;

  SELECT COALESCE(s.ready, false) INTO v_ready FROM module_status s WHERE s.module_key = p_module_key;
  v_current_tier := resolve_plan_tier(p_business_id);

  RETURN QUERY SELECT
    (v_current_tier >= v_min_tier) AND v_ready,
    (v_current_tier >= v_min_tier),
    v_ready,
    v_min_tier,
    v_current_tier;
END;
$$ LANGUAGE plpgsql STABLE;

-- Batch helper: which modules can THIS business access right now? Used to
-- drive the sidebar in one call instead of N.
CREATE OR REPLACE FUNCTION list_accessible_modules(p_business_id UUID)
RETURNS TABLE(module_key TEXT, ready BOOLEAN, entitled BOOLEAN) AS $$
DECLARE v_tier INTEGER;
BEGIN
  v_tier := resolve_plan_tier(p_business_id);
  RETURN QUERY
  SELECT t.module_key,
         COALESCE(s.ready, false) AS ready,
         (v_tier >= t.min_plan_tier) AS entitled
  FROM module_plan_tiers t
  LEFT JOIN module_status s ON s.module_key = t.module_key
  WHERE COALESCE(s.ready, false) AND (v_tier >= t.min_plan_tier);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- SEED: module → min tier (the entitlement map)
-- ============================================
INSERT INTO module_plan_tiers (module_key, min_plan_tier, display_name, category) VALUES
  ('finance',          1, 'Finance',          'money'),
  ('chat',             1, 'Chat',             'communicate'),
  ('crm',              2, 'CRM',              'sell'),
  ('tasks',            2, 'Tasks',            'mywork'),
  ('reports',          2, 'Reports',          'analytics'),
  ('hr',               2, 'People',           'people'),
  ('projects',         2, 'Projects',         'ops'),
  ('inventory',        2, 'Inventory',        'ops'),
  ('knowledge',        2, 'Docs',             'mywork'),
  ('approvals',        2, 'Approvals',        'mywork'),
  ('calendar',         2, 'Calendar',         'mywork'),
  ('legal',            2, 'Legal',            'ops'),
  ('procurement',      2, 'Procurement',      'ops'),
  ('intelligence',     2, 'Insights',        'home'),
  ('market',           2, 'Market Index',      'home'),
  ('memory',           2, 'Org Memory',       'mywork'),
  ('reality_gap',      2, 'Reality Gap',      'controls'),
  ('self_audit',       2, 'Self-Audit',       'controls'),
  ('cockpit',          2, 'Executive Cockpit','home'),
  ('wall',             2, 'Company Wall',     'communicate'),
  ('automations',      3, 'Automations',      'ops'),
  ('sso',              3, 'SSO',              'settings'),
  ('api',              3, 'API & Webhooks',   'settings'),
  ('multi_company',    3, 'Multi-Company',    'settings'),
  ('security',         3, 'Security',         'settings')
ON CONFLICT (module_key) DO UPDATE SET
  min_plan_tier = EXCLUDED.min_plan_tier,
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category;

-- ============================================
-- SEED: module readiness — STRICT. Only true where the module persists
-- real data to Supabase today. This flag is the whole safety net; when
-- in doubt, leave false.
-- ============================================
INSERT INTO module_status (module_key, ready, notes) VALUES
  ('finance',        true,  'transactions + invoices persist; closest to real'),
  ('chat',           true,  'messages persist'),
  ('crm',            true,  'deals + contacts persist'),
  ('tasks',          true,  'tasks persist'),
  ('hr',             true,  'staff + contracts persist'),
  ('projects',       true,  'projects persist'),
  ('inventory',      true,  'stock persists'),
  ('knowledge',      true,  'kb_pages persist'),
  ('approvals',      true,  'approvals + actions persist'),
  ('calendar',       true,  'events persist'),
  ('legal',          true,  'legal_contracts/cases/obligations persist (migration 0404)'),
  ('procurement',    true,  'purchase_requests + rfqs persist (migration 0404)'),
  ('intelligence',   true,  'calls real RPCs'),
  ('market',         true,  'calls market_intelligence RPC'),
  ('memory',         true,  'organizational_memory persists (migration 0404)'),
  ('reality_gap',    true,  'reality_gaps persists (migration 0404)'),
  ('self_audit',     true,  'calls run_system_health_audit'),
  ('cockpit',        true,  'reads real transactions/deals/staff + RPCs'),
  ('wall',           true,  'recognition + announcements + events + polls persist'),
  -- NOT READY — demo/hardcoded or not built. Stays false until wired.
  ('reports',        false, 'uses demo/mock data — not yet reading real aggregates'),
  ('automations',    false, 'not wired to a real execution engine — demo only'),
  ('sso',            false, 'SSO settings page exists; no IdP integration wired'),
  ('api',            false, 'API key management page exists; key issuance/gating not enforced server-side'),
  ('multi_company',   false, 'single-business only; no multi-tenant switching'),
  ('security',       false, 'security settings page exists; audit enforcement incomplete')
ON CONFLICT (module_key) DO UPDATE SET ready = EXCLUDED.ready, notes = EXCLUDED.notes;

-- ============================================
-- RLS + grants
-- ============================================
ALTER TABLE module_plan_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_status ENABLE ROW LEVEL SECURITY;

-- The tier/readiness config is safe to read by any authenticated user in
-- the business (it's product config, not customer data).
CREATE POLICY "Authenticated read module_plan_tiers"
  ON module_plan_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read module_status"
  ON module_status FOR SELECT TO authenticated USING (true);

-- Only service role (migrations/admin) may flip readiness — never the
-- client. This prevents a paying customer from self-enabling a module.
GRANT SELECT ON module_plan_tiers TO authenticated;
GRANT SELECT ON module_status TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_module(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION list_accessible_modules(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_plan_tier(UUID) TO authenticated;

CREATE TRIGGER trg_module_status_updated
  BEFORE UPDATE ON module_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE module_status IS
  'Module readiness gate (the safety net). ready=true ONLY where the module persists real data. Flipping to true is the launch.';
COMMENT ON FUNCTION can_access_module IS
  'Two-flag gate: returns can_access = entitled AND ready. The single server-side authority for module visibility.';
