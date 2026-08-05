-- ============================================
-- Integrations Tables
-- Social media and SMS provider integrations
-- ============================================

-- Social Media Integrations
CREATE TABLE IF NOT EXISTS social_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'facebook', 'twitter', 'tiktok')),
  connected BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  account_name TEXT,
  account_id TEXT,
  account_username TEXT,
  followers_count INTEGER,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, platform)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_social_integrations_business ON social_integrations(business_id);
CREATE INDEX IF NOT EXISTS idx_social_integrations_platform ON social_integrations(platform);

-- SMS Integrations
CREATE TABLE IF NOT EXISTS sms_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('twilio', 'vonage', 'africastalking', 'termii')),
  connected BOOLEAN DEFAULT false,
  configured_at TIMESTAMPTZ,
  phone_number TEXT,
  sender_id TEXT,
  sender_name TEXT,
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, provider)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sms_integrations_business ON sms_integrations(business_id);
CREATE INDEX IF NOT EXISTS idx_sms_integrations_provider ON sms_integrations(provider);

-- SMS Messages Log (for audit and analytics)
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('twilio', 'vonage', 'africastalking', 'termii')),
  message_id TEXT,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'undelivered')),
  status_reason TEXT,
  segments_count INTEGER DEFAULT 1,
  cost_amount NUMERIC(10, 4),
  cost_currency TEXT DEFAULT 'USD',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Indexes for SMS messages
CREATE INDEX IF NOT EXISTS idx_sms_messages_business ON sms_messages(business_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_sent_at ON sms_messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_sms_messages_to ON sms_messages(to_number);

-- Enable RLS
ALTER TABLE social_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for social_integrations
CREATE POLICY "Users can view own business social integrations"
  ON social_integrations FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own business social integrations"
  ON social_integrations FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for sms_integrations
CREATE POLICY "Users can view own business SMS integrations"
  ON sms_integrations FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own business SMS integrations"
  ON sms_integrations FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for sms_messages
CREATE POLICY "Users can view own business SMS messages"
  ON sms_messages FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own business SMS messages"
  ON sms_messages FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_social_integrations_updated_at
  BEFORE UPDATE ON social_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sms_integrations_updated_at
  BEFORE UPDATE ON sms_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE social_integrations IS 'Stores social media platform OAuth connections for businesses';
COMMENT ON TABLE sms_integrations IS 'Stores SMS provider configurations for businesses';
COMMENT ON TABLE sms_messages IS 'Audit log for sent SMS messages';

COMMENT ON COLUMN social_integrations.access_token_encrypted IS 'Encrypted OAuth access token - never expose to client';
COMMENT ON COLUMN social_integrations.refresh_token_encrypted IS 'Encrypted OAuth refresh token - never expose to client';
COMMENT ON COLUMN sms_integrations.api_key_encrypted IS 'Encrypted API key - never expose to client';
COMMENT ON COLUMN sms_integrations.api_secret_encrypted IS 'Encrypted API secret - never expose to client';
