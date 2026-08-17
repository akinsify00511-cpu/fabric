-- 20260101000012_builder_dashboard.sql
-- #19/#34: the builder/board dashboard — a PLATFORM-OPERATOR surface, distinct
-- from the per-business owner intelligence (#18). Shows AGGREGATE cross-business
-- patterns: which modules get adopted/abandoned platform-wide, onboarding
-- conversion, sector×module adoption. The Avenize operator uses this for sprint
-- decisions ("which of the 61 modules actually get touched") + product-market gaps.
--
-- Security (§28, #21):
--   - NOT a business-owner feature. Gated by a platform_admins email allowlist,
--     verified server-side via auth.uid(). A business owner/admin (role in
--     owner|admin|manager|team_lead|staff) is NOT a platform admin.
--   - AGGREGATE ONLY. Never individual business content, customer data, or
--     walled content (legal, disciplinary, payroll, litigation). The underlying
--     RPCs (sector_module_usage, onboarding_conversion, usage_cross_business_adoption)
--     are service-role-only; this RPC re-aggregates their output and is the
--     ONLY authenticated-callable path. Direct RPC calls stay REVOKED.
--   - The dashboard surfaces counts/averages/rates — never a business name,
--     owner email, or row-level datum (#21 walled-content exclusion).
--
-- Idempotent. SECURITY DEFINER STABLE. No external API.

-- ============================================================================
-- 1. platform_admins — email allowlist for platform operators.
--    Seeded empty; the Avenize operator adds their auth email here (service
--    role only — RLS denies all client access). A row here grants builder-
--    dashboard access only — NOT business data access.
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS on: no client (anon/authenticated) can read or write this table.
-- Only the service role can manage the allowlist. This prevents a business
-- user from granting themselves platform-admin access.
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
-- (No policies = deny all to authenticated/anon. Service role bypasses RLS.)

COMMENT ON TABLE platform_admins IS 'Platform-operator email allowlist (#19/#34). RLS denies all client access — service role only. A row grants builder-dashboard access only, never business data access.';

-- ============================================================================
-- 2. is_platform_admin() — true if the current auth.uid() email is in the
--    allowlist. SECURITY DEFINER so it can read platform_admins (which is
--    RLS-locked for clients).
-- ============================================================================
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins pa
    JOIN auth.users u ON u.id = auth.uid()
    WHERE lower(u.email) = lower(pa.email)
  );
$$;

-- ============================================================================
-- 3. builder_dashboard() — the aggregator. SECURITY DEFINER so it can call
--    the service-role-only cross-business RPCs (sector_module_usage,
--    onboarding_conversion, usage_cross_business_adoption). Gated by
--    is_platform_admin(). Returns ONE JSONB payload.
--
--    #21 boundary: aggregate only. The payload contains:
--      - onboarding_conversion: total_authenticated, total_completed,
--        total_abandoned, conversion_rate, median_steps_reached,
--        avg_duration_seconds (counts/averages — NO business identifiers).
--      - cross_business_adoption: module_key, businesses_touching (count),
--        total_events (count) — NO business identifiers.
--      - sector_module_usage: industry, module_key, businesses_selecting (count),
--        businesses_using (count), adoption_rate — NO business identifiers.
--    Never: business names, owner emails, customer names, invoice amounts,
--    legal/disciplinary/payroll data.
-- ============================================================================
CREATE OR REPLACE FUNCTION builder_dashboard()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_out JSONB;
BEGIN
  -- PLATFORM-ADMIN GATE. Non-admins get an empty 'unauthorized' payload
  -- (safe — no error, no leak). A business owner is NOT a platform admin.
  IF NOT is_platform_admin() THEN
    RETURN jsonb_build_object(
      'authorized', false,
      'onboarding_conversion', NULL,
      'cross_business_adoption', '[]'::JSONB,
      'sector_module_usage', '[]'::JSONB,
      'data_scope', 'aggregate_only_no_business_pii'
    );
  END IF;

  SELECT jsonb_build_object(
    'authorized', true,
    'onboarding_conversion', (
      SELECT jsonb_build_object(
        'total_authenticated', oc.total_authenticated,
        'total_completed', oc.total_completed,
        'total_abandoned', oc.total_abandoned,
        'conversion_rate', oc.conversion_rate,
        'median_steps_reached', oc.median_steps_reached,
        'avg_duration_seconds', oc.avg_duration_seconds
      )
      FROM onboarding_conversion() oc
      LIMIT 1
    ),
    'cross_business_adoption', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'module_key', cba.module_key,
        'businesses_touching', cba.businesses_touching,
        'total_events', cba.total_events
      ) ORDER BY cba.businesses_touching DESC NULLS LAST)
      FROM usage_cross_business_adoption() cba
    ), '[]'::JSONB),
    'sector_module_usage', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'industry', smu.industry,
        'module_key', smu.module_key,
        'businesses_selecting', smu.businesses_selecting,
        'businesses_using', smu.businesses_using,
        'adoption_rate', smu.adoption_rate
      ) ORDER BY smu.industry, smu.adoption_rate DESC NULLS LAST)
      FROM sector_module_usage() smu
    ), '[]'::JSONB),
    'data_scope', 'aggregate_only_no_business_pii'
  ) INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION builder_dashboard() TO authenticated;

COMMENT ON FUNCTION builder_dashboard IS 'Platform-operator dashboard (#19/#34). Gated by is_platform_admin (email allowlist, NOT a business role). Aggregates cross-business RPCs (onboarding_conversion, usage_cross_business_adoption, sector_module_usage) into one JSONB payload. #21: aggregate only — never business names, owner emails, customer data, or walled content. The underlying RPCs stay REVOKED from authenticated; this is the only authenticated-callable path.';
