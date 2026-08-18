-- Avenize: subsidiary operating profiles + CRM configuration
-- Safe additive migration. Existing businesses already represent subsidiaries/tenants.

CREATE TABLE IF NOT EXISTS subsidiary_profiles (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  legal_name TEXT,
  display_name TEXT,
  description TEXT,
  industry TEXT,
  business_model TEXT,
  target_customer TEXT,
  currency_code TEXT NOT NULL DEFAULT 'NGN',
  country_code TEXT NOT NULL DEFAULT 'NG',
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  website_url TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  revenue_target NUMERIC(18,2),
  sales_target NUMERIC(18,2),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_configurations (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_currency TEXT NOT NULL DEFAULT 'NGN',
  lead_sources JSONB NOT NULL DEFAULT '["Website","Referral","Social","Phone","Walk-in","Other"]'::jsonb,
  customer_types JSONB NOT NULL DEFAULT '["Lead","Prospect","Customer","Partner"]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  automation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  stage_type TEXT NOT NULL DEFAULT 'open' CHECK (stage_type IN ('open','won','lost')),
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, key),
  UNIQUE(business_id, position)
);

CREATE INDEX IF NOT EXISTS idx_subsidiary_profiles_industry ON subsidiary_profiles(industry);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_business ON crm_pipeline_stages(business_id, position);

ALTER TABLE subsidiary_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Access is intentionally delegated to the existing subsidiary access/RLS model.
DROP POLICY IF EXISTS "Users access own subsidiary profile" ON subsidiary_profiles;
CREATE POLICY "Users access own subsidiary profile"
  ON subsidiary_profiles FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_accessible_businesses()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_accessible_businesses()));

DROP POLICY IF EXISTS "Users access own CRM configuration" ON crm_configurations;
CREATE POLICY "Users access own CRM configuration"
  ON crm_configurations FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_accessible_businesses()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_accessible_businesses()));

DROP POLICY IF EXISTS "Users access own CRM stages" ON crm_pipeline_stages;
CREATE POLICY "Users access own CRM stages"
  ON crm_pipeline_stages FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_accessible_businesses()))
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_accessible_businesses()));

-- Provision defaults for existing subsidiaries without overwriting data.
INSERT INTO subsidiary_profiles (business_id, display_name, industry)
SELECT b.id, b.name, b.industry
FROM businesses b
WHERE NOT EXISTS (SELECT 1 FROM subsidiary_profiles sp WHERE sp.business_id = b.id);

INSERT INTO crm_configurations (business_id)
SELECT b.id
FROM businesses b
WHERE NOT EXISTS (SELECT 1 FROM crm_configurations cc WHERE cc.business_id = b.id);

-- Seed the reusable CRM pipeline for existing subsidiaries only when they have no stages.
INSERT INTO crm_pipeline_stages (business_id, name, key, position, probability, stage_type)
SELECT b.id, s.name, s.key, s.position, s.probability, s.stage_type
FROM businesses b
CROSS JOIN (VALUES
  ('Prospect','prospect',0,10.00,'open'),
  ('Qualified','qualified',1,30.00,'open'),
  ('Proposal','proposal',2,55.00,'open'),
  ('Negotiation','negotiation',3,75.00,'open'),
  ('Won','won',4,100.00,'won'),
  ('Lost','lost',5,0.00,'lost')
) AS s(name,key,position,probability,stage_type)
WHERE NOT EXISTS (
  SELECT 1 FROM crm_pipeline_stages ps WHERE ps.business_id = b.id
);

CREATE OR REPLACE FUNCTION update_subsidiary_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subsidiary_profiles_updated_at ON subsidiary_profiles;
CREATE TRIGGER subsidiary_profiles_updated_at
BEFORE UPDATE ON subsidiary_profiles FOR EACH ROW
EXECUTE FUNCTION update_subsidiary_profile_timestamp();

DROP TRIGGER IF EXISTS crm_configurations_updated_at ON crm_configurations;
CREATE TRIGGER crm_configurations_updated_at
BEFORE UPDATE ON crm_configurations FOR EACH ROW
EXECUTE FUNCTION update_subsidiary_profile_timestamp();

DROP TRIGGER IF EXISTS crm_pipeline_stages_updated_at ON crm_pipeline_stages;
CREATE TRIGGER crm_pipeline_stages_updated_at
BEFORE UPDATE ON crm_pipeline_stages FOR EACH ROW
EXECUTE FUNCTION update_subsidiary_profile_timestamp();
