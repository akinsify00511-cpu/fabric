-- ============================================
-- Business Entitlements System
-- Real plan gating with feature-level access control
-- ============================================

-- Entitlements per business (plan + individual feature flags)
CREATE TABLE IF NOT EXISTS business_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
  features JSONB NOT NULL DEFAULT '{
    "time_tracking": false,
    "invoicing": false,
    "api_access": false,
    "custom_branding": false,
    "advanced_analytics": false,
    "unlimited_team": false,
    "multi_currency": false,
    "automations": false,
    "campaigns": false,
    "social_media": false,
    "whatsapp": false,
    "sms": false,
    "paystack": false,
    "multi_bank": false,
    "inventory": false,
    "projects": false,
    "crm": false,
    "support_tickets": false,
    "live_chat": false,
    "knowledge_base": false,
    "recognition": false
  }',
  team_limit INTEGER DEFAULT 3,
  storage_limit_mb INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plan feature definitions
-- This defines what each plan includes
CREATE OR REPLACE FUNCTION get_plan_features(p_plan TEXT)
RETURNS JSONB AS $$
DECLARE
  plan_features JSONB;
BEGIN
  -- Default features per plan
  plan_features := CASE p_plan
    WHEN 'free' THEN '{"time_tracking": false, "invoicing": false, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "paystack": false, "multi_bank": false, "inventory": false, "projects": true, "crm": true, "support_tickets": false, "live_chat": false, "knowledge_base": false, "recognition": false}'::JSONB
    WHEN 'starter' THEN '{"time_tracking": false, "invoicing": false, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "paystack": false, "multi_bank": false, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": false, "recognition": false}'::JSONB
    WHEN 'professional' THEN '{"time_tracking": true, "invoicing": true, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": true, "automations": false, "campaigns": true, "social_media": true, "whatsapp": false, "sms": false, "paystack": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::JSONB
    WHEN 'enterprise' THEN '{"time_tracking": true, "invoicing": true, "api_access": true, "custom_branding": true, "advanced_analytics": true, "unlimited_team": true, "multi_currency": true, "automations": true, "campaigns": true, "social_media": true, "whatsapp": true, "sms": true, "paystack": true, "multi_bank": true, "inventory": true, "projects": true, "crm": true, "support_tickets": true, "live_chat": true, "knowledge_base": true, "recognition": true}'::JSONB
    ELSE '{"time_tracking": false, "invoicing": false, "api_access": false, "custom_branding": false, "advanced_analytics": false, "unlimited_team": false, "multi_currency": false, "automations": false, "campaigns": false, "social_media": false, "whatsapp": false, "sms": false, "paystack": false, "multi_bank": false, "inventory": false, "projects": false, "crm": false, "support_tickets": false, "live_chat": false, "knowledge_base": false, "recognition": false}'::JSONB
  END;
  RETURN plan_features;
END;
$$ LANGUAGE plpgsql;

-- Function to check if business has a specific feature
CREATE OR REPLACE FUNCTION has_feature(p_business_id UUID, p_feature TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan TEXT;
  v_features JSONB;
BEGIN
  SELECT e.plan, e.features INTO v_plan, v_features
  FROM business_entitlements e
  WHERE e.business_id = p_business_id;
  
  -- If no entitlements record, use default for free plan
  IF v_plan IS NULL THEN
    v_plan := 'free';
    v_features := get_plan_features('free');
  END IF;
  
  -- Check feature in custom features first
  IF v_features ? p_feature AND (v_features->>p_feature)::BOOLEAN THEN
    RETURN TRUE;
  END IF;
  
  -- Fall back to plan defaults
  RETURN (get_plan_features(v_plan)->>p_feature)::BOOLEAN;
END;
$$ LANGUAGE plpgsql;

-- Function to get team count
CREATE OR REPLACE FUNCTION get_team_count(p_business_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) 
    FROM staff 
    WHERE business_id = p_business_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to check if can add more team members
CREATE OR REPLACE FUNCTION can_add_team_member(p_business_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_team_limit INTEGER;
  v_current_count INTEGER;
BEGIN
  SELECT e.team_limit INTO v_team_limit
  FROM business_entitlements e
  WHERE e.business_id = p_business_id;
  
  -- Default limit of 3 for free
  IF v_team_limit IS NULL THEN
    v_team_limit := 3;
  END IF;
  
  v_current_count := get_team_count(p_business_id);
  
  RETURN v_current_count < v_team_limit;
END;
$$ LANGUAGE plpgsql;

-- Seed entitlements for existing businesses
INSERT INTO business_entitlements (business_id, plan, team_limit)
SELECT id, COALESCE(subscription_tier, 'free'), 
  CASE COALESCE(subscription_tier, 'free')
    WHEN 'free' THEN 3
    WHEN 'starter' THEN 10
    WHEN 'professional' THEN 50
    WHEN 'enterprise' THEN 999999
    ELSE 3
  END
FROM businesses
ON CONFLICT (business_id) DO NOTHING;

-- RLS
ALTER TABLE business_entitlements ENABLE ROW LEVEL SECURITY;

-- Policies: business owners/admins can manage, staff can read own business
CREATE POLICY "Staff can read own business entitlements"
  ON business_entitlements FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage business entitlements"
  ON business_entitlements FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_business_entitlements_updated_at
  BEFORE UPDATE ON business_entitlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE business_entitlements IS 'Plan and feature entitlements per business';
COMMENT ON FUNCTION has_feature IS 'Check if business has a specific feature (considers plan defaults + custom overrides)';
COMMENT ON FUNCTION can_add_team_member IS 'Check if business can add more team members based on plan limit';
