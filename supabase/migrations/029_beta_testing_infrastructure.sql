-- Beta Testing Infrastructure
-- Feature flags, per-business overrides, and beta tester tracking

-- ============================================
-- FEATURE FLAGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,           -- 'two_factor_auth', 'sso', 'webhooks', 'company_home'
  name TEXT NOT NULL,                 -- Human-readable name
  description TEXT,                    -- What this feature does
  enabled_globally BOOLEAN DEFAULT FALSE,  -- Available to everyone
  enabled_for_beta BOOLEAN DEFAULT FALSE,  -- Available to beta testers
  rollout_percentage INTEGER DEFAULT 0,     -- 0-100, gradual rollout
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PER-BUSINESS OVERRIDE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS business_feature_overrides (
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  feature_key TEXT REFERENCES feature_flags(key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,                -- TRUE or FALSE, overrides defaults
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (business_id, feature_key)
);

-- ============================================
-- BETA FEEDBACK TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS beta_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  route TEXT,                              -- Page they were on
  description TEXT NOT NULL,               -- User's description
  user_agent TEXT,                          -- Browser info
  console_errors JSONB DEFAULT '[]',        -- Last 10 console errors
  app_version TEXT,                         -- VITE_GIT_SHA
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ANALYTICS EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,                -- 'onboarding_step_completed', 'onboarding_rpc_failed'
  meta JSONB DEFAULT '{}',                  -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ADD is_beta_tester TO STAFF
-- ============================================
ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_beta_tester BOOLEAN DEFAULT FALSE;

-- ============================================
-- RESOLVE FEATURE FLAG FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION resolve_feature_flag(
  p_key TEXT,
  p_business_id UUID DEFAULT NULL,
  p_is_beta BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN AS $$
  DECLARE
    v_result BOOLEAN;
    v_flag RECORD;
    v_override BOOLEAN;
    v_hash INTEGER;
  BEGIN
    -- First check for per-business override
    IF p_business_id IS NOT NULL THEN
      SELECT enabled INTO v_override
      FROM business_feature_overrides
      WHERE business_id = p_business_id AND feature_key = p_key;
      
      IF FOUND THEN
        RETURN v_override;
      END IF;
    END IF;

    -- Get the flag
    SELECT * INTO v_flag FROM feature_flags WHERE key = p_key;
    
    IF NOT FOUND THEN
      -- Flag doesn't exist, default to FALSE for safety
      RETURN FALSE;
    END IF;

    -- Beta testers get beta access
    IF p_is_beta THEN
      RETURN COALESCE(v_flag.enabled_for_beta, FALSE);
    END IF;

    -- Check rollout percentage (deterministic per staff)
    IF v_flag.rollout_percentage > 0 AND v_flag.rollout_percentage < 100 AND p_business_id IS NOT NULL THEN
      -- Use hash of business_id for deterministic percentage
      v_hash := ('x' || substr(md5(p_business_id::text), 1, 8))::bit(32)::int;
      IF (v_hash % 100) >= v_flag.rollout_percentage THEN
        RETURN FALSE;
      END IF;
    END IF;

    -- Return global setting
    RETURN COALESCE(v_flag.enabled_globally, FALSE);
  END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- TRACK ANALYTICS EVENT FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION track_analytics_event(
  p_event_name TEXT,
  p_meta JSONB DEFAULT '{}',
  p_business_id UUID DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO analytics_events (business_id, staff_id, event_name, meta)
  VALUES (
    COALESCE(p_business_id, NULLIF(current_setting('request.jwt.claim.business_id', true), '')::UUID),
    COALESCE(p_staff_id, NULLIF(current_setting('request.jwt.claim.staff_id', true), '')::UUID),
    p_event_name,
    p_meta
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Feature flags readable by all authenticated users
CREATE POLICY "Feature flags readable"
  ON feature_flags FOR SELECT
  USING (auth.role() = 'authenticated');

-- Feature flags writable by service role only
CREATE POLICY "Feature flags admin only"
  ON feature_flags FOR ALL
  USING (auth.role() = 'service_role');

-- Business overrides readable by same business
CREATE POLICY "Business overrides same business"
  ON business_feature_overrides FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Business overrides writable by admin/owner only
CREATE POLICY "Business overrides admin only"
  ON business_feature_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM get_current_staff() cs
      WHERE cs.business_id = business_feature_overrides.business_id
      AND cs.role IN ('owner', 'admin')
    )
  );

-- Beta feedback insertable by authenticated users
CREATE POLICY "Beta feedback insertable"
  ON beta_feedback FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Beta feedback readable by admin/owner only
CREATE POLICY "Beta feedback admin only"
  ON beta_feedback FOR SELECT
  USING (
    business_id IS NULL OR
    EXISTS (
      SELECT 1 FROM get_current_staff() cs
      WHERE cs.business_id = beta_feedback.business_id
      AND cs.role IN ('owner', 'admin')
    )
  );

-- Analytics events insertable by authenticated users
CREATE POLICY "Analytics events insertable"
  ON analytics_events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Analytics events readable by admin/owner only
CREATE POLICY "Analytics events admin only"
  ON analytics_events FOR SELECT
  USING (
    business_id IS NULL OR
    EXISTS (
      SELECT 1 FROM get_current_staff() cs
      WHERE cs.business_id = analytics_events.business_id
      AND cs.role IN ('owner', 'admin')
    )
  );

-- ============================================
-- SEED INITIAL FEATURE FLAGS
-- ============================================
INSERT INTO feature_flags (key, name, description, enabled_globally, enabled_for_beta) VALUES
  ('two_factor_auth', 'Two-Factor Authentication', 'TOTP-based 2FA with authenticator apps', FALSE, FALSE),
  ('sso', 'Single Sign-On', 'SAML/OIDC enterprise SSO', FALSE, FALSE),
  ('webhooks', 'Webhooks', 'Real-time event webhooks to external services', FALSE, TRUE),
  ('automations', 'Automations', 'Workflow automation with triggers and actions', FALSE, TRUE),
  ('company_home', 'Company Home', 'Dashboard with company overview blocks', FALSE, FALSE),
  ('onboarding_v2', 'Onboarding V2', 'Improved onboarding flow', FALSE, TRUE)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- UPDATED_AT TRIGGER FOR feature_flags
-- ============================================
CREATE OR REPLACE FUNCTION update_feature_flag_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_feature_flag_timestamp();
