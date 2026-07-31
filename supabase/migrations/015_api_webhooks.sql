-- AVENIZE Layer 1 - API & Webhooks
-- Public API, API Keys, Webhooks, Integrations

-- ============================================
-- API KEYS
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  name TEXT NOT NULL,
  description TEXT,
  -- Key hash (never store raw)
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL, -- First 8 chars for identification
  -- Permissions
  permissions JSONB DEFAULT '["read"]'::jsonb, -- ["read", "write", "admin"]
  scopes TEXT[] DEFAULT ARRAY['data:read'],
  -- Restrictions
  allowed_ips INET[], -- Empty = all IPs allowed
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WEBHOOK ENDPOINTS
-- ============================================
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  -- Events to subscribe
  events TEXT[] NOT NULL DEFAULT '{}',
  -- Authentication
  secret TEXT, -- For HMAC signature verification
  auth_type TEXT DEFAULT 'none' CHECK (auth_type IN ('none', 'basic', 'bearer', 'signature', 'apikey')),
  auth_header TEXT DEFAULT 'Authorization',
  auth_value TEXT,
  -- Retry settings
  retry_count INTEGER DEFAULT 3,
  retry_delay INTEGER DEFAULT 60, -- seconds
  timeout INTEGER DEFAULT 30, -- seconds
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  last_triggered_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WEBHOOK DELIVERY LOG
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  response_time INTEGER, -- ms
  attempt INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- API REQUEST LOG (for analytics)
-- ============================================
CREATE TABLE IF NOT EXISTS api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id),
  business_id UUID REFERENCES businesses(id),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query_params JSONB,
  request_body JSONB,
  response_status INTEGER,
  response_time INTEGER, -- ms
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INTEGRATIONS (connected apps)
-- ============================================
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL CHECK (integration_type IN (
    'quickbooks', 'xero', 'salesforce', 'hubspot', 'zapier', 'make',
    'stripe', 'paypal', 'square', 'shopify', 'woocommerce', 'slack',
    'teams', 'zoom', 'calendly', 'twilio', 'sendgrid', 'resend',
    'google_calendar', 'outlook', 'google_drive', 'dropbox', 'custom'
  )),
  name TEXT NOT NULL,
  description TEXT,
  -- OAuth
  oauth_client_id TEXT,
  oauth_encrypted_client_secret TEXT,
  oauth_refresh_token_encrypted TEXT,
  oauth_token_expires_at TIMESTAMPTZ,
  oauth_auth_url TEXT,
  oauth_token_url TEXT,
  -- API credentials
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  webhook_secret TEXT, -- For receiving webhooks from integration
  -- Status
  is_connected BOOLEAN DEFAULT FALSE,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT, -- 'idle', 'syncing', 'error'
  sync_error TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INTEGRATION SYNC LOG
-- ============================================
CREATE TABLE IF NOT EXISTS integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- 'full', 'incremental', 'realtime'
  direction TEXT NOT NULL CHECK (direction IN ('import', 'export')),
  resource_type TEXT NOT NULL, -- 'contacts', 'invoices', 'products', etc.
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;

-- API Keys: business owner only
CREATE POLICY "API Keys view"
  ON api_keys FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

CREATE POLICY "API Keys manage"
  ON api_keys FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

-- Webhooks: business owner only
CREATE POLICY "Webhooks view"
  ON webhooks FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

CREATE POLICY "Webhooks manage"
  ON webhooks FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

-- Webhook Deliveries: owner only
CREATE POLICY "Deliveries view"
  ON webhook_deliveries FOR SELECT
  USING (
    webhook_id IN (SELECT id FROM webhooks WHERE business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'))
  );

-- API Logs: owner only
CREATE POLICY "API Logs view"
  ON api_request_logs FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

-- Integrations: owner only
CREATE POLICY "Integrations view"
  ON integrations FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

CREATE POLICY "Integrations manage"
  ON integrations FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'));

-- Sync Logs: owner only
CREATE POLICY "Sync Logs view"
  ON integration_sync_logs FOR SELECT
  USING (
    integration_id IN (SELECT id FROM integrations WHERE business_id IN (SELECT business_id FROM get_current_staff() WHERE role = 'owner'))
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate API key
CREATE OR REPLACE FUNCTION generate_api_key(p_name TEXT)
RETURNS TABLE(key TEXT, key_id UUID) AS $$
DECLARE
  v_key TEXT;
  v_key_id UUID;
  v_key_hash TEXT;
  v_prefix TEXT;
BEGIN
  -- Generate random key
  v_key := 'aven_' || encode(gen_random_bytes(32), 'hex');
  v_key_hash := encode(sha256(v_key::bytea), 'hex');
  v_prefix := substring(v_key, 1, 8);
  
  INSERT INTO api_keys (id, business_id, name, key_hash, key_prefix)
  VALUES (gen_random_uuid(), (SELECT business_id FROM get_current_staff()), p_name, v_key_hash, v_prefix)
  RETURNING id INTO v_key_id;
  
  RETURN QUERY SELECT v_key, v_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify API key
CREATE OR REPLACE FUNCTION verify_api_key(p_key TEXT)
RETURNS api_keys AS $$
DECLARE
  v_key_hash TEXT;
BEGIN
  v_key_hash := encode(sha256(p_key::bytea), 'hex');
  
  RETURN QUERY
  SELECT * FROM api_keys
  WHERE key_hash = v_key_hash
    AND is_active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;
  
  -- Update usage
  IF FOUND THEN
    UPDATE api_keys
    SET use_count = use_count + 1, last_used_at = NOW()
    WHERE key_hash = v_key_hash;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger webhook
CREATE OR REPLACE FUNCTION trigger_webhook(
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS VOID AS $$
DECLARE
  v_webhook RECORD;
BEGIN
  FOR v_webhook IN
    SELECT * FROM webhooks
    WHERE is_active = TRUE
      AND business_id IN (SELECT business_id FROM get_current_staff())
      AND p_event_type = ANY(events)
  LOOP
    -- Create delivery record
    INSERT INTO webhook_deliveries (webhook_id, event_type, payload)
    VALUES (v_webhook.id, p_event_type, p_payload);
    
    -- In production, this would queue the actual HTTP request
    -- For now, just log it
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get available webhook events
CREATE OR REPLACE FUNCTION get_webhook_events()
RETURNS TABLE(event_name TEXT, description TEXT, category TEXT) AS $$
BEGIN
  RETURN QUERY VALUES
    ('deal.created', 'A new deal was created', 'CRM'),
    ('deal.updated', 'A deal was updated', 'CRM'),
    ('deal.won', 'A deal was marked as won', 'CRM'),
    ('deal.lost', 'A deal was marked as lost', 'CRM'),
    ('contact.created', 'A new contact was created', 'CRM'),
    ('contact.updated', 'A contact was updated', 'CRM'),
    ('task.created', 'A new task was created', 'Tasks'),
    ('task.completed', 'A task was completed', 'Tasks'),
    ('task.due_soon', 'A task is due within 24 hours', 'Tasks'),
    ('invoice.created', 'A new invoice was created', 'Finance'),
    ('invoice.paid', 'An invoice was paid', 'Finance'),
    ('invoice.overdue', 'An invoice is overdue', 'Finance'),
    ('payment.received', 'A payment was received', 'Finance'),
    ('user.invited', 'A new user was invited', 'Team'),
    ('user.joined', 'A user accepted invitation', 'Team'),
    ('message.sent', 'A chat message was sent', 'Chat'),
    ('ticket.created', 'A support ticket was created', 'Support'),
    ('ticket.resolved', 'A support ticket was resolved', 'Support');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER webhooks_updated_at BEFORE UPDATE ON webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
