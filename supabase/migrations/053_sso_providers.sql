-- ============================================================================
-- Migration 053: SSO provider configuration (per business)
-- ----------------------------------------------------------------------------
-- SSOSettings was a static placeholder behind a feature flag. This migration
-- adds a per-business SSO provider config table so admins can enable Google
-- Workspace, Microsoft, or a custom SAML IdP for their team, and the Login
-- page can surface those providers. The actual SAML/OIDC handshake still
-- flows through Supabase Auth; this table records which providers a tenant
-- has enabled plus any SAML metadata URL / entity ID for custom IdPs.
-- ============================================================================

\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS public.sso_providers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL
                CHECK (provider IN ('google','azure','saml','oidc')),
  label         TEXT NOT NULL DEFAULT '',          -- display name e.g. "Acme Okta"
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  -- SAML custom IdP fields (provider = 'saml')
  metadata_url  TEXT,
  entity_id     TEXT,
  -- OIDC custom fields (provider = 'oidc')
  client_id     TEXT,
  issuer        TEXT,
  -- Domain hint: emails matching this domain are routed to this provider.
  domain_hint   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, provider)
);

ALTER TABLE public.sso_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sso_business_select" ON public.sso_providers
  FOR SELECT USING (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE POLICY "sso_business_modify" ON public.sso_providers
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));

CREATE INDEX IF NOT EXISTS idx_sso_providers_business ON public.sso_providers(business_id);

CREATE TRIGGER sso_providers_updated_at BEFORE UPDATE ON public.sso_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- get_enabled_sso_providers(business_id) — anon-callable so the Login page can
-- read which SSO options a tenant has enabled before the user authenticates.
-- Resolves the business by its slug (passed in p_business_slug) and returns
-- only enabled providers with their public-facing label.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_enabled_sso_providers(p_business_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  v_business_id UUID;
BEGIN
  SELECT id INTO v_business_id FROM public.businesses WHERE slug = p_business_slug LIMIT 1;
  IF v_business_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'provider', provider,
    'label', COALESCE(NULLIF(label, ''), provider)
  ) ORDER BY provider), '[]'::jsonb)
  FROM public.sso_providers
  WHERE business_id = v_business_id AND enabled = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_enabled_sso_providers(TEXT) TO anon, authenticated;
