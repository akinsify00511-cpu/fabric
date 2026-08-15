-- AVENIZE Layer 1 - SSO/SAML Authentication
-- Single Sign-On for enterprise identity providers

-- ============================================
-- SSO PROVIDERS (supported identity providers)
-- ============================================
CREATE TABLE IF NOT EXISTS sso_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- 'Okta', 'Azure AD', 'Google Workspace', 'Generic SAML', 'Generic OIDC'
  provider_type TEXT NOT NULL CHECK (provider_type IN ('saml', 'oidc')),
  logo_url TEXT,
  color TEXT DEFAULT '#6366F1',
  -- Configuration fields
  client_id TEXT, -- OIDC: Client ID
  client_secret_encrypted TEXT, -- OIDC: Encrypted Client Secret
  issuer_url TEXT, -- OIDC: Issuer URL
  authorization_url TEXT, -- OIDC: Authorization URL
  token_url TEXT, -- OIDC: Token URL
  userinfo_url TEXT, -- OIDC: UserInfo URL
  jwks_url TEXT, -- OIDC: JWKS URL
  -- SAML specific
  entity_id TEXT, -- SAML: Entity ID / Issuer
  sso_url TEXT, -- SAML: SSO URL
  slo_url TEXT, -- SAML: Single Logout URL
  certificate TEXT, -- SAML: X.509 Certificate
  metadata_url TEXT, -- SAML/OIDC: Metadata URL
  -- Mappings
  email_field TEXT DEFAULT 'email', -- Field to use as email
  name_field TEXT DEFAULT 'name', -- Field to use as name
  first_name_field TEXT DEFAULT 'given_name',
  last_name_field TEXT DEFAULT 'family_name',
  groups_field TEXT DEFAULT 'groups',
  -- Settings
  auto_provision_users BOOLEAN DEFAULT TRUE, -- Auto-create users if not exist
  force_sso BOOLEAN DEFAULT FALSE, -- Force SSO (disable password login)
  default_role TEXT DEFAULT 'staff', -- Role for new SSO users
  -- Status
  is_enabled BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE, -- Domain verified
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BUSINESS SSO CONNECTIONS (business -> provider)
-- ============================================
CREATE TABLE IF NOT EXISTS sso_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES sso_providers(id) ON DELETE CASCADE,
  -- Business-specific config
  domain TEXT NOT NULL, -- e.g., 'acme.com' - email domain for SSO
  subdomain TEXT, -- Optional subdomain for SSO login page
  -- OIDC
  client_id TEXT, -- Business-specific client ID
  client_secret_encrypted TEXT, -- Encrypted
  -- SAML
  sp_entity_id TEXT, -- Service Provider Entity ID
  sp_acs_url TEXT, -- Assertion Consumer Service URL
  sp_metadata_url TEXT, -- SP Metadata URL
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'failed')),
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  -- Users synced via this connection
  synced_users INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, provider_id),
  UNIQUE(business_id, domain)
);

-- ============================================
-- SSO SESSIONS (track SSO login sessions)
-- ============================================
CREATE TABLE IF NOT EXISTS sso_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES sso_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_user_id TEXT NOT NULL, -- User ID from the SSO provider
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  id_token TEXT,
  expires_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, user_id)
);

-- ============================================
-- SSO AUDIT LOG
-- ============================================
CREATE TABLE IF NOT EXISTS sso_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  connection_id UUID REFERENCES sso_connections(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'login', 'logout', 'provision', 'sync_error', 'config_change'
  provider_name TEXT,
  ip_address INET,
  user_agent TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SAML METADATA CACHE
-- ============================================
CREATE TABLE IF NOT EXISTS saml_metadata_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES sso_providers(id) ON DELETE CASCADE,
  metadata_xml TEXT NOT NULL,
  valid_until TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE sso_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sso_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sso_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sso_audit_log ENABLE ROW LEVEL SECURITY;

-- SSO Providers: viewable by all (for login selection)
CREATE POLICY "SSO Providers view"
  ON sso_providers FOR SELECT
  USING (is_enabled = TRUE);

-- SSO Connections: business owner only
CREATE POLICY "Connections view"
  ON sso_connections FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

CREATE POLICY "Connections create"
  ON sso_connections FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

CREATE POLICY "Connections update"
  ON sso_connections FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

CREATE POLICY "Connections delete"
  ON sso_connections FOR DELETE
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

-- SSO Sessions: own only
CREATE POLICY "Sessions own"
  ON sso_sessions FOR ALL
  USING (user_id = auth.uid());

-- SSO Audit: owner only
CREATE POLICY "SSO Audit view"
  ON sso_audit_log FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

-- SAML Metadata: public for providers
CREATE POLICY "Metadata view"
  ON saml_metadata_cache FOR SELECT
  USING (TRUE);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get SSO providers for login
CREATE OR REPLACE FUNCTION get_sso_login_options(p_email TEXT)
RETURNS TABLE (
  provider_id UUID,
  provider_name TEXT,
  provider_type TEXT,
  logo_url TEXT,
  connection_id UUID
) AS $$
BEGIN
  -- Extract domain from email
  RETURN QUERY
  SELECT
    sp.id as provider_id,
    sp.name as provider_name,
    sp.provider_type,
    sp.logo_url,
    sc.id as connection_id
  FROM sso_providers sp
  JOIN sso_connections sc ON sc.provider_id = sp.id
  WHERE sp.is_enabled = TRUE
    AND sc.status = 'active'
    AND sc.domain = COALESCE(
      (SELECT split_part($1, '@', 2)),
      ''
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Provision SSO user
CREATE OR REPLACE FUNCTION provision_sso_user(
  p_connection_id UUID,
  p_provider_user_id TEXT,
  p_email TEXT,
  p_name TEXT,
  p_provider_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_staff_id UUID;
  v_business_id UUID;
  v_connection RECORD;
  v_role TEXT;
BEGIN
  -- Get connection details
  SELECT * INTO v_connection FROM sso_connections WHERE id = p_connection_id;
  
  -- Check if user exists by email
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  
  IF v_user_id IS NULL THEN
    -- Create new auth user
    INSERT INTO auth.users (email, encrypted_metadata, raw_user_meta_data)
    VALUES (p_email, '{}', jsonb_build_object('provider', 'sso', 'provider_user_id', p_provider_user_id))
    RETURNING id INTO v_user_id;
  END IF;
  
  -- Get or create staff record
  SELECT id, business_id INTO v_staff_id, v_business_id
  FROM staff
  WHERE user_id = v_user_id AND business_id = v_connection.business_id;
  
  IF v_staff_id IS NULL THEN
    -- Get default role from provider
    SELECT default_role INTO v_role FROM sso_providers WHERE id = v_connection.provider_id;
    
    INSERT INTO staff (business_id, user_id, email, full_name, role, sso_connection_id)
    VALUES (v_connection.business_id, v_user_id, p_email, p_name, COALESCE(v_role, 'staff'), p_connection_id)
    RETURNING id INTO v_staff_id;
    
    -- Update sync count
    UPDATE sso_connections SET synced_users = synced_users + 1 WHERE id = p_connection_id;
  END IF;
  
  -- Log the provisioning
  INSERT INTO sso_audit_log (business_id, connection_id, user_id, action, details)
  VALUES (v_connection.business_id, p_connection_id, v_user_id, 'provision', p_provider_data);
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update SSO session
CREATE OR REPLACE FUNCTION update_sso_session(
  p_connection_id UUID,
  p_user_id UUID,
  p_provider_user_id TEXT,
  p_access_token TEXT,
  p_refresh_token TEXT,
  p_id_token TEXT,
  p_expires_in INTEGER
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO sso_sessions (
    connection_id,
    user_id,
    provider_user_id,
    access_token_encrypted,
    refresh_token_encrypted,
    id_token,
    expires_at
  )
  VALUES (
    p_connection_id,
    p_user_id,
    p_provider_user_id,
    p_access_token,
    p_refresh_token,
    p_id_token,
    NOW() + (p_expires_in || ' seconds')::interval
  )
  ON CONFLICT (connection_id, user_id) DO UPDATE SET
    provider_user_id = p_provider_user_id,
    access_token_encrypted = p_access_token,
    refresh_token_encrypted = p_refresh_token,
    id_token = p_id_token,
    expires_at = NOW() + (p_expires_in || ' seconds')::interval,
    last_login_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log SSO audit event
CREATE OR REPLACE FUNCTION log_sso_event(
  p_action TEXT,
  p_connection_id UUID DEFAULT NULL,
  p_provider_name TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_business_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NOT NULL THEN
    SELECT business_id INTO v_business_id FROM staff WHERE user_id = v_user_id LIMIT 1;
  END IF;
  
  INSERT INTO sso_audit_log (
    business_id,
    connection_id,
    user_id,
    action,
    provider_name,
    details
  )
  VALUES (
    v_business_id,
    p_connection_id,
    v_user_id,
    p_action,
    p_provider_name,
    p_details
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SEED DEFAULT SSO PROVIDERS
-- ============================================
ALTER TABLE sso_providers ADD COLUMN IF NOT EXISTS description TEXT;
INSERT INTO sso_providers (name, provider_type, logo_url, color, description) VALUES
  ('Okta', 'oidc', 'https://www.google.com/s2/favicons?domain=okta.com', '#007DC1', 'Enterprise identity management'),
  ('Microsoft', 'oidc', 'https://www.google.com/s2/favicons?domain=microsoft.com', '#0078D4', 'Azure Active Directory / Microsoft 365'),
  ('Google', 'oidc', 'https://www.google.com/s2/favicons?domain=google.com', '#4285F4', 'Google Workspace'),
  ('OneLogin', 'saml', 'https://www.google.com/s2/favicons?domain=onelogin.com', '#2B5B84', 'Enterprise SSO'),
  ('Generic SAML', 'saml', NULL, '#6366F1', 'Custom SAML 2.0 provider'),
  ('Generic OIDC', 'oidc', NULL, '#8B5CF6', 'Custom OpenID Connect provider')
ON CONFLICT DO NOTHING;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER sso_providers_updated_at BEFORE UPDATE ON sso_providers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER sso_connections_updated_at BEFORE UPDATE ON sso_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
