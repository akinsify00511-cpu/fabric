-- ============================================
-- CRITICAL INFRASTRUCTURE
-- Must-have systems without external dependencies
-- ============================================

-- ============================================
-- 1. AUDIT LOGGING
-- Track all changes for compliance and debugging
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Action details
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'login', 'logout', 'export', 'import'
  entity_type TEXT NOT NULL, -- 'staff', 'task', 'invoice', etc.
  entity_id UUID,
  
  -- Change tracking
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[], -- Array of changed field names
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS business_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id UUID;

CREATE INDEX IF NOT EXISTS idx_audit_business ON audit_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
-- (idx_audit_user created above)
-- (idx_audit_entity created above)
-- (idx_audit_created created above)

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
CREATE POLICY "Service can insert audit logs"
  ON audit_logs FOR INSERT WITH CHECK (TRUE);

-- ============================================
-- 2. DATA EXPORT TRACKING
-- Track all data exports for compliance
-- ============================================
CREATE TABLE IF NOT EXISTS data_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Export details
  export_type TEXT NOT NULL, -- 'csv', 'excel', 'pdf', 'json', 'backup'
  entity_type TEXT NOT NULL, -- 'staff', 'tasks', 'invoices', 'full_backup'
  format TEXT,
  
  -- Filters applied
  filters JSONB DEFAULT '{}',
  date_range JSONB, -- {start: '2024-01-01', end: '2024-12-31'}
  
  -- File info
  file_name TEXT,
  file_size_bytes BIGINT,
  storage_path TEXT, -- Path in Supabase storage
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  record_count INTEGER,
  error_message TEXT,
  
  -- Download tracking
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- When export file expires
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_exports_business ON data_exports(business_id);
CREATE INDEX idx_exports_user ON data_exports(user_id);
CREATE INDEX idx_exports_status ON data_exports(status);

ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own exports"
  ON data_exports FOR SELECT
  USING (user_id = auth.uid() OR business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));
CREATE POLICY "Users can create exports"
  ON data_exports FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================
-- 3. FULL-TEXT SEARCH CONFIGURATION
-- PostgreSQL full-text search setup
-- ============================================
CREATE TABLE IF NOT EXISTS search_indexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Index configuration
  entity_type TEXT NOT NULL, -- 'contacts', 'tasks', 'staff', 'documents'
  search_vector TSVECTOR, -- Combined searchable content
  searchable_fields TEXT[] DEFAULT '{}', -- Fields included in index
  
  -- Reference
  entity_id UUID NOT NULL,
  
  -- Cached content for search
  title TEXT,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Search ranking
  rank REAL DEFAULT 0,
  last_searched_at TIMESTAMPTZ,
  search_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, entity_type, entity_id)
);

CREATE INDEX idx_search_business ON search_indexes(business_id);
CREATE INDEX idx_search_entity ON search_indexes(entity_type, entity_id);
CREATE INDEX idx_search_vector ON search_indexes USING GIN(search_vector);
CREATE INDEX idx_search_rank ON search_indexes(rank DESC);

ALTER TABLE search_indexes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff can search"
  ON search_indexes FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid()
  ));
CREATE POLICY "Service can manage search indexes"
  ON search_indexes FOR ALL
  USING (TRUE);

-- ============================================
-- 4. SAVED SEARCHES
-- Users can save and reuse searches
-- ============================================
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- What was searched
  filters JSONB NOT NULL DEFAULT '{}',
  sort_by TEXT,
  sort_order TEXT DEFAULT 'asc',
  
  is_shared BOOLEAN DEFAULT FALSE, -- Share with team
  use_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own saved searches"
  ON saved_searches FOR ALL
  USING (user_id = auth.uid());

-- ============================================
-- 5. FILE/DOCUMENT MANAGEMENT
-- Enhanced document storage with versioning
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- File info
  name TEXT NOT NULL,
  original_name TEXT,
  file_type TEXT NOT NULL, -- 'pdf', 'image', 'document', etc.
  mime_type TEXT,
  size_bytes BIGINT NOT NULL,
  
  -- Storage
  storage_bucket TEXT DEFAULT 'documents',
  storage_path TEXT NOT NULL, -- Full path in storage
  storage_url TEXT, -- Public/private URL
  
  -- Versioning
  version INTEGER DEFAULT 1,
  parent_id UUID REFERENCES documents(id) ON DELETE CASCADE, -- Previous version
  version_note TEXT, -- Why this version was uploaded
  
  -- Organization
  folder_id UUID,
  category TEXT, -- 'contract', 'invoice', 'receipt', 'report', 'other'
  tags TEXT[] DEFAULT '{}',
  
  -- Metadata
  metadata JSONB DEFAULT '{}', -- Extracted info (OCR, etc.)
  
  -- Access
  is_public BOOLEAN DEFAULT FALSE,
  access_level TEXT DEFAULT 'private' CHECK (access_level IN ('private', 'team', 'business', 'public')),
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  deleted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_business ON documents(business_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents((metadata->>'entity_type'), (metadata->>'entity_id'));

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff can view documents"
  ON documents FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid()
  ));
CREATE POLICY "Business staff can manage documents"
  ON documents FOR ALL
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Document folders
CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  parent_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,
  path TEXT, -- Materialized path for hierarchy
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff can view folders"
  ON document_folders FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid()
  ));

-- ============================================
-- 6. ACTIVITY TIMELINE
-- Activity history for entities
-- ============================================
CREATE TABLE IF NOT EXISTS activity_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Reference entity
  entity_type TEXT NOT NULL, -- 'contact', 'task', 'invoice', 'project'
  entity_id UUID NOT NULL,
  
  -- Activity details
  activity_type TEXT NOT NULL, -- 'created', 'updated', 'commented', 'assigned', 'completed'
  title TEXT NOT NULL,
  description TEXT,
  
  -- User who performed action
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  
  -- For comments/notes
  content TEXT, -- The actual comment or note
  is_internal BOOLEAN DEFAULT FALSE, -- Internal notes vs visible to all
  
  -- Related entities
  related_entity_type TEXT,
  related_entity_id UUID,
  
  -- Attachments
  attachments JSONB DEFAULT '[]', -- Array of attachment objects
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_timeline_entity ON activity_timeline(entity_type, entity_id);
CREATE INDEX idx_timeline_created ON activity_timeline(created_at DESC);

ALTER TABLE activity_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff can view timeline"
  ON activity_timeline FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid()
  ));
CREATE POLICY "Business staff can add to timeline"
  ON activity_timeline FOR INSERT
  WITH CHECK (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid()
  ));

-- ============================================
-- 7. COMMENTS & NOTES
-- Dedicated comments system
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Comment content
  content TEXT NOT NULL,
  content_html TEXT, -- Rendered HTML
  
  -- Reference
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  
  -- Threading
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  depth INTEGER DEFAULT 0, -- For nested comments
  
  -- Mentions
  mentions UUID[] DEFAULT '{}', -- User IDs mentioned
  
  -- Reactions
  reactions JSONB DEFAULT '{}', -- {emoji: [user_ids]}
  
  -- Status
  is_edited BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_created ON comments(created_at DESC);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff can view comments"
  ON comments FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid()
  ));
CREATE POLICY "Business staff can manage own comments"
  ON comments FOR ALL
  USING (user_id = auth.uid());

-- ============================================
-- 8. EXCHANGE RATES
-- Currency conversion rates
-- ============================================
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Currency pair
  base_currency TEXT NOT NULL, -- 'USD'
  target_currency TEXT NOT NULL, -- 'NGN'
  
  -- Rate
  rate DECIMAL(20, 10) NOT NULL, -- e.g., 1550.50
  inverse_rate DECIMAL(20, 10), -- Calculated inverse
  
  -- Source
  source TEXT DEFAULT 'manual', -- 'manual', ' CBN', 'xe.com'
  
  -- Validity
  effective_from DATE NOT NULL,
  effective_to DATE, -- NULL = no end date
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exchange_pair ON exchange_rates(base_currency, target_currency);
CREATE INDEX idx_exchange_date ON exchange_rates(effective_from DESC);

-- Seed with common rates
INSERT INTO exchange_rates (base_currency, target_currency, rate, source, effective_from) VALUES
  ('USD', 'NGN', 1550.00, 'manual', CURRENT_DATE),
  ('EUR', 'NGN', 1680.00, 'manual', CURRENT_DATE),
  ('GBP', 'NGN', 1950.00, 'manual', CURRENT_DATE),
  ('USD', 'EUR', 0.92, 'manual', CURRENT_DATE),
  ('USD', 'GBP', 0.79, 'manual', CURRENT_DATE)
ON CONFLICT DO NOTHING;

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view rates"
  ON exchange_rates FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Admins can manage rates"
  ON exchange_rates FOR ALL
  USING (TRUE);

-- ============================================
-- 9. CURRENCY BALANCES
-- Track balances in multiple currencies
-- ============================================
CREATE TABLE IF NOT EXISTS currency_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  currency TEXT NOT NULL, -- 'NGN', 'USD', 'EUR'
  account_type TEXT NOT NULL, -- 'cash', 'bank', 'petty_cash'
  account_name TEXT,
  
  balance DECIMAL(20, 2) DEFAULT 0,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(business_id, currency, account_type)
);

ALTER TABLE currency_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff can view balances"
  ON currency_balances FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid()
  ));
CREATE POLICY "Admins can manage balances"
  ON currency_balances FOR ALL
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- ============================================
-- 10. DATA VALIDATION RULES
-- Custom validation for data quality
-- ============================================
CREATE TABLE IF NOT EXISTS validation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  entity_type TEXT NOT NULL, -- 'contacts', 'invoices', 'staff'
  field_name TEXT NOT NULL,
  
  -- Rule definition
  rule_type TEXT NOT NULL, -- 'required', 'unique', 'pattern', 'range', 'custom'
  rule_config JSONB NOT NULL DEFAULT '{}', -- Rule-specific configuration
  
  -- Error messages
  error_message TEXT,
  warning_message TEXT,
  
  -- Priority (lower = higher priority)
  priority INTEGER DEFAULT 100,
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage rules"
  ON validation_rules FOR ALL
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- ============================================
-- 11. CUSTOM WORKFLOWS
-- Define custom business processes
-- ============================================
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Trigger
  trigger_type TEXT NOT NULL, -- 'manual', 'on_create', 'on_update', 'on_delete', 'scheduled'
  trigger_config JSONB DEFAULT '{}',
  
  -- Steps
  steps JSONB NOT NULL DEFAULT '[]', -- Array of step definitions
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Stats
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  
  -- Input/output
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  error_message TEXT,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_workflow_runs ON workflow_runs(workflow_id, status);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage workflows"
  ON workflows FOR ALL
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));
CREATE POLICY "Admins can view workflow runs"
  ON workflow_runs FOR SELECT
  USING (workflow_id IN (
    SELECT id FROM workflows WHERE business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ));

-- ============================================
-- 12. API USAGE & RATE LIMITING
-- Track API usage per business/user
-- ============================================
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Usage tracking
  endpoint TEXT NOT NULL,
  method TEXT,
  
  -- Counts
  request_count INTEGER DEFAULT 1,
  bytes_in BIGINT DEFAULT 0,
  bytes_out BIGINT DEFAULT 0,
  
  -- Rate limiting
  rate_limit INTEGER DEFAULT 1000, -- Max requests per window
  rate_window TEXT DEFAULT 'hour', -- 'minute', 'hour', 'day'
  
  -- Timestamps
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, endpoint, period_start)
);

CREATE INDEX idx_api_usage_user ON api_usage(user_id, period_start DESC);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usage"
  ON api_usage FOR SELECT
  USING (user_id = auth.uid() OR business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Rate limit configuration per business
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  
  -- Limits
  daily_limit INTEGER DEFAULT 10000,
  hourly_limit INTEGER DEFAULT 1000,
  minute_limit INTEGER DEFAULT 100,
  
  -- Current usage
  current_day_usage INTEGER DEFAULT 0,
  current_hour_usage INTEGER DEFAULT 0,
  current_minute_usage INTEGER DEFAULT 0,
  
  -- Tracking
  day_reset_at TIMESTAMPTZ,
  hour_reset_at TIMESTAMPTZ,
  minute_reset_at TIMESTAMPTZ,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business staff can view limits"
  ON rate_limits FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM staff WHERE user_id = auth.uid()
  ));

-- ============================================
-- 13. WEBHOOK DELIVERY LOGS
-- Track webhook deliveries
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
  
  -- Request
  request_url TEXT NOT NULL,
  request_method TEXT DEFAULT 'POST',
  request_headers JSONB DEFAULT '{}',
  request_body JSONB,
  
  -- Response
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
  error_message TEXT,
  
  -- Retry tracking
  attempt_count INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 3,
  
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries ON webhook_deliveries(webhook_id, status);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view webhook logs"
  ON webhook_deliveries FOR SELECT
  USING (webhook_id IN (
    SELECT id FROM webhooks WHERE business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get current exchange rate
CREATE OR REPLACE FUNCTION get_exchange_rate(p_from_currency TEXT, p_to_currency TEXT)
RETURNS DECIMAL AS $$
DECLARE
  v_rate DECIMAL;
BEGIN
  IF p_from_currency = p_to_currency THEN
    RETURN 1;
  END IF;
  
  SELECT rate INTO v_rate
  FROM exchange_rates
  WHERE base_currency = p_from_currency
    AND target_currency = p_to_currency
    AND effective_from <= CURRENT_DATE
    AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  RETURN COALESCE(v_rate, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to convert currency
CREATE OR REPLACE FUNCTION convert_currency(p_amount DECIMAL, p_from_currency TEXT, p_to_currency TEXT)
RETURNS DECIMAL AS $$
BEGIN
  RETURN p_amount * get_exchange_rate(p_from_currency, p_to_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record audit log
CREATE OR REPLACE FUNCTION record_audit(
  p_business_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_changed_fields TEXT[];
  v_log_id UUID;
BEGIN
  -- Calculate changed fields
  IF p_old_values IS NOT NULL AND p_new_values IS NOT NULL THEN
    SELECT array_agg(key)
    INTO v_changed_fields
    FROM jsonb_object_keys(p_old_values) AS key
    WHERE p_old_values->>key IS DISTINCT FROM p_new_values->>key;
  END IF;
  
  INSERT INTO audit_logs (
    business_id, user_id, action, entity_type, entity_id,
    old_values, new_values, changed_fields
  ) VALUES (
    p_business_id, p_user_id, p_action, p_entity_type, p_entity_id,
    p_old_values, p_new_values, v_changed_fields
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for updated_at
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_search_indexes_updated_at
  BEFORE UPDATE ON search_indexes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_currency_balances_updated_at
  BEFORE UPDATE ON currency_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: Default rate limits
-- ============================================
INSERT INTO rate_limits (business_id, daily_limit, hourly_limit, minute_limit)
SELECT id, 10000, 1000, 100
FROM businesses
ON CONFLICT (business_id) DO NOTHING;
