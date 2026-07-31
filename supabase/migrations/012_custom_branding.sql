-- AVENIZE Layer 1 - Custom Branding & White-Label
-- Business theming, logos, custom domains, branding settings

-- ============================================
-- BUSINESS BRANDING SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS business_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  -- Logo
  logo_url TEXT,
  logo_dark_url TEXT, -- for dark backgrounds
  favicon_url TEXT,
  -- Colors
  primary_color TEXT DEFAULT '#4F46E5', -- main brand color
  accent_color TEXT DEFAULT '#FF7A59', -- secondary color
  background_color TEXT DEFAULT '#FAFAFA',
  surface_color TEXT DEFAULT '#FFFFFF',
  text_color TEXT DEFAULT '#111111',
  -- Dark mode colors
  dark_primary_color TEXT DEFAULT '#818CF8',
  dark_accent_color TEXT DEFAULT '#FB923C',
  dark_background_color TEXT DEFAULT '#111111',
  dark_surface_color TEXT DEFAULT '#1F1F1F',
  dark_text_color TEXT DEFAULT '#F5F5F5',
  -- Theme settings
  theme_mode TEXT DEFAULT 'system' CHECK (theme_mode IN ('light', 'dark', 'system')),
  border_radius TEXT DEFAULT 'lg', -- 'none', 'sm', 'md', 'lg', 'xl', '2xl'
  font_family TEXT DEFAULT 'default', -- 'default', 'inter', 'poppins', 'roboto', 'custom'
  -- Display settings
  custom_name TEXT, -- Override "Avenize" display name
  custom_tagline TEXT,
  -- Social links
  website_url TEXT,
  twitter_url TEXT,
  linkedin_url TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  -- Created/Updated
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CUSTOM DOMAINS
-- ============================================
CREATE TABLE IF NOT EXISTS custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE, -- e.g., "app.company.com"
  verification_token TEXT, -- for DNS verification
  verification_method TEXT DEFAULT 'cname' CHECK (verification_method IN ('cname', 'txt')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  verified_at TIMESTAMPTZ,
  ssl_cert_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2FA / MFA SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS user_mfa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT FALSE,
  method TEXT DEFAULT 'totp' CHECK (method IN ('totp', 'sms')),
  -- TOTP
  totp_secret TEXT, -- encrypted
  totp_confirmed_at TIMESTAMPTZ,
  -- Backup codes (hashed)
  backup_codes_hash TEXT,
  backup_codes_used INTEGER DEFAULT 0,
  -- SMS (for future use)
  phone_number TEXT,
  phone_confirmed BOOLEAN DEFAULT FALSE,
  -- Device tracking
  trusted_devices JSONB DEFAULT '[]', -- list of device fingerprints
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AUDIT LOG
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'invite'
  resource_type TEXT NOT NULL, -- 'invoice', 'contact', 'deal', 'user', etc.
  resource_id UUID,
  resource_name TEXT, -- human-readable name
  details JSONB DEFAULT '{}', -- extra context
  ip_address INET,
  user_agent TEXT,
  location JSONB, -- {country, city, region}
  metadata JSONB DEFAULT '{}', -- additional data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LANGUAGE SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS user_locale (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'es', 'fr', 'de', 'ar', 'zh', 'ja', 'hi', 'pt', 'ru')),
  timezone TEXT DEFAULT 'UTC',
  date_format TEXT DEFAULT 'MM/DD/YYYY',
  time_format TEXT DEFAULT '12h', -- '12h' or '24h'
  number_format TEXT DEFAULT 'comma_dot', -- 'comma_dot', 'dot_comma', 'space_dot'
  currency_display TEXT DEFAULT 'symbol', -- 'symbol', 'code', 'both'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE business_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mfa ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locale ENABLE ROW LEVEL SECURITY;

-- Business Branding: business owner can manage
CREATE POLICY "Branding view"
  ON business_branding FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Branding update"
  ON business_branding FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Custom Domains: business owner can manage
CREATE POLICY "Domains view"
  ON custom_domains FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Domains manage"
  ON custom_domains FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

-- User MFA: own record only
CREATE POLICY "MFA own"
  ON user_mfa FOR ALL
  USING (user_id = auth.uid());

-- Audit Logs: visible to owner/managers
CREATE POLICY "Audit view"
  ON audit_logs FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

CREATE POLICY "Audit insert"
  ON audit_logs FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- User Locale: own record only
CREATE POLICY "Locale own"
  ON user_locale FOR ALL
  USING (user_id = auth.uid());

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get business branding (with defaults)
CREATE OR REPLACE FUNCTION get_business_branding(p_business_id UUID)
RETURNS business_branding AS $$
DECLARE
  v_branding business_branding%ROWTYPE;
BEGIN
  SELECT * INTO v_branding FROM business_branding WHERE business_id = p_business_id;
  
  -- Return defaults if none exists
  IF NOT FOUND THEN
    RETURN NULL; -- frontend will use defaults
  END IF;
  
  RETURN v_branding;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log audit event
CREATE OR REPLACE FUNCTION log_audit_event(
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_resource_name TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
DECLARE
  v_business_id UUID;
  v_user_id UUID;
  v_staff_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Get business and staff IDs
  SELECT business_id, id INTO v_staff_id, v_business_id
  FROM staff
  WHERE user_id = v_user_id
  LIMIT 1;
  
  INSERT INTO audit_logs (
    business_id,
    user_id,
    staff_id,
    action,
    resource_type,
    resource_id,
    resource_name,
    details,
    created_at
  )
  VALUES (
    v_business_id,
    v_user_id,
    v_staff_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_resource_name,
    p_details
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate MFA backup codes
CREATE OR REPLACE FUNCTION generate_mfa_backup_codes()
RETURNS TEXT[] AS $$
DECLARE
  v_codes TEXT[] := '{}';
  i INTEGER;
BEGIN
  FOR i IN 1..10 LOOP
    v_codes := array_append(v_codes, upper(substring(md5(random()::text) for 8) || '-' || substring(md5(random()::text) for 8)));
  END LOOP;
  RETURN v_codes;
END;
$$ LANGUAGE plpgsql;

-- Verify domain CNAME
CREATE OR REPLACE FUNCTION verify_custom_domain(p_domain TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_record RECORD;
BEGIN
  -- In production, this would check DNS
  -- For now, just mark as pending
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER business_branding_updated_at BEFORE UPDATE ON business_branding FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER custom_domains_updated_at BEFORE UPDATE ON custom_domains FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_mfa_updated_at BEFORE UPDATE ON user_mfa FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_logs_created_at BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_locale_updated_at BEFORE UPDATE ON user_locale FOR EACH ROW EXECUTE FUNCTION update_updated_at();
