-- AVENIZE Layer 1 - Monitoring & Event Systems
-- System health, uptime tracking, alerts, and incident management

-- ============================================
-- MONITORS (services to monitor)
-- ============================================
CREATE TABLE IF NOT EXISTS monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by UUID REFERENCES staff(id),
  -- Monitor config
  name TEXT NOT NULL,
  description TEXT,
  monitor_type TEXT NOT NULL CHECK (monitor_type IN (
    'http', 'tcp', 'dns', 'ssl', 'ping', 'page', 'cron', 'agent'
  )),
  -- Target
  target_url TEXT, -- For http/page
  host TEXT, -- For tcp/ping
  port INTEGER, -- For tcp
  check_interval INTEGER DEFAULT 60, -- Seconds
  -- Authentication
  auth_type TEXT CHECK (auth_type IN ('none', 'basic', 'bearer', 'api_key')),
  auth_config JSONB, -- Encrypted credentials
  -- Expected response
  expected_status_codes INTEGER[] DEFAULT '{200,201,204}',
  expected_string TEXT, -- Response body should contain
  response_timeout INTEGER DEFAULT 30, -- Seconds
  -- SSL specific
  ssl_expiry_days_warning INTEGER DEFAULT 30,
  ssl_expiry_days_critical INTEGER DEFAULT 7,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'unknown' CHECK (status IN (
    'up', 'down', 'degraded', 'unknown', 'paused'
  )),
  last_check_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MONITOR CHECKS (individual check results)
-- ============================================
CREATE TABLE IF NOT EXISTS monitor_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
  ) STORED,
  -- Result
  status TEXT NOT NULL CHECK (status IN (
    'up', 'down', 'timeout', 'error', 'ssl_error', 'dns_error'
  )),
  status_code INTEGER, -- HTTP status code
  response_body TEXT,
  error_message TEXT,
  -- Metrics
  response_time_ms INTEGER,
  dns_time_ms INTEGER,
  connect_time_ms INTEGER,
  ssl_time_ms INTEGER,
  ttfb_ms INTEGER, -- Time to first byte
  -- SSL info
  ssl_valid_from TIMESTAMPTZ,
  ssl_valid_until TIMESTAMPTZ,
  ssl_issuer TEXT,
  -- Metadata
  check_location TEXT, -- Which location checked
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- UPTIME RECORDS (aggregated)
-- ============================================
CREATE TABLE IF NOT EXISTS uptime_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  -- Period
  record_date DATE NOT NULL,
  record_hour INTEGER, -- 0-23 for hourly, NULL for daily
  -- Aggregated metrics
  total_checks INTEGER DEFAULT 0,
  successful_checks INTEGER DEFAULT 0,
  failed_checks INTEGER DEFAULT 0,
  uptime_percent NUMERIC GENERATED ALWAYS AS (
    CASE WHEN total_checks > 0 
    THEN (successful_checks::NUMERIC / total_checks * 100) 
    ELSE 100 END
  ) STORED,
  avg_response_time_ms INTEGER,
  min_response_time_ms INTEGER,
  max_response_time_ms INTEGER,
  -- Incidents
  incident_count INTEGER DEFAULT 0,
  total_downtime_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(monitor_id, record_date, record_hour)
);

-- ============================================
-- INCIDENTS
-- ============================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  monitor_id UUID REFERENCES monitors(id),
  -- Incident info
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN (
    'critical', 'high', 'medium', 'low', 'info'
  )),
  -- Timing
  started_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  -- Duration
  duration_seconds INTEGER GENERATED ALWAYS AS (
    CASE WHEN resolved_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (resolved_at - started_at))::INTEGER
    ELSE EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
    END
  ) STORED,
  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN (
    'open', 'investigating', 'identified', 'monitoring', 'resolved'
  )),
  -- Root cause
  root_cause TEXT,
  resolution_notes TEXT,
  -- Impact
  impact_level TEXT DEFAULT 'minimal' CHECK (impact_level IN (
    'none', 'minimal', 'partial', 'major', 'total'
  )),
  affected_users INTEGER,
  affected_revenue NUMERIC,
  -- Acknowledgment
  acknowledged_by UUID REFERENCES staff(id),
  acknowledged_reason TEXT,
  -- Resolved by
  resolved_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INCIDENT TIMELINE
-- ============================================
CREATE TABLE IF NOT EXISTS incident_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES staff(id),
  -- Entry type
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'status_change', 'comment', 'acknowledgment', 'escalation', 
    'notification_sent', 'remediation', 'external_update'
  )),
  content TEXT NOT NULL,
  -- Previous/new values
  previous_value JSONB,
  new_value JSONB,
  -- Status at this point
  incident_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ALERTS & NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  monitor_id UUID REFERENCES monitors(id), -- NULL = all monitors
  -- Rule config
  name TEXT NOT NULL,
  description TEXT,
  -- Conditions
  condition_type TEXT NOT NULL CHECK (condition_type IN (
    'status_down', 'response_time_above', 'ssl_expiring', 'error_rate_above',
    'uptime_below', 'incident_created', 'incident_severity'
  )),
  condition_value JSONB NOT NULL, -- {threshold: 1000, operator: '>'}
  -- Severity
  alert_severity TEXT DEFAULT 'medium' CHECK (alert_severity IN (
    'critical', 'high', 'medium', 'low', 'info'
  )),
  -- Cooldown
  cooldown_minutes INTEGER DEFAULT 5, -- Don't alert again within this period
  -- Notification
  notify_channels JSONB DEFAULT '[]', -- [{type: 'email', target: '...'}]
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  incident_id UUID REFERENCES incidents(id),
  monitor_id UUID REFERENCES monitors(id),
  -- Alert info
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  -- Delivery
  notified_channels JSONB DEFAULT '[]',
  delivery_status JSONB DEFAULT '{}', -- {email: 'sent', slack: 'failed'}
  -- Status
  status TEXT DEFAULT 'fired' CHECK (status IN (
    'fired', 'acknowledged', 'resolved', 'suppressed'
  )),
  acknowledged_by UUID REFERENCES staff(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HEARTBEATS (for cron jobs and background tasks)
-- ============================================
CREATE TABLE IF NOT EXISTS heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Expected schedule
  check_interval_seconds INTEGER DEFAULT 300, -- 5 minutes
  grace_period_seconds INTEGER DEFAULT 60, -- Extra time before alert
  -- Last heartbeat
  last_heartbeat_at TIMESTAMPTZ,
  next_expected_at TIMESTAMPTZ,
  -- Status
  status TEXT DEFAULT 'healthy' CHECK (status IN (
    'healthy', 'late', 'missed', 'disabled'
  )),
  consecutive_misses INTEGER DEFAULT 0,
  last_missed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS heartbeat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heartbeat_id UUID NOT NULL REFERENCES heartbeats(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ok', 'late', 'missed')),
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STATUS PAGES
-- ============================================
CREATE TABLE IF NOT EXISTS status_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Page info
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  domain TEXT, -- Custom domain
  logo_url TEXT,
  -- Content
  description TEXT,
  header_html TEXT, -- Custom HTML in header
  footer_html TEXT,
  -- Components (services)
  components JSONB DEFAULT '[]', -- [{name, description, order}]
  -- Status
  is_published BOOLEAN DEFAULT FALSE,
  is_password_protected BOOLEAN DEFAULT FALSE,
  password_hash TEXT,
  -- Subscribers
  subscriber_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS status_page_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT,
  notify_email BOOLEAN DEFAULT TRUE,
  notify_sms BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  unsubscribe_token TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS status_page_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  incident_id UUID REFERENCES incidents(id),
  -- Status page specific
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'medium',
  -- Timing
  started_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  -- Display
  is_visible BOOLEAN DEFAULT TRUE,
  affected_components TEXT[], -- Component names affected
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE uptime_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE heartbeat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_page_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_page_incidents ENABLE ROW LEVEL SECURITY;

-- Monitors
CREATE POLICY "Monitors view"
  ON monitors FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Monitors manage"
  ON monitors FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Checks (append only)
CREATE POLICY "Checks insert"
  ON monitor_checks FOR INSERT
  WITH CHECK (monitor_id IN (SELECT id FROM monitors WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Checks view"
  ON monitor_checks FOR SELECT
  USING (monitor_id IN (SELECT id FROM monitors WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Uptime records
CREATE POLICY "Uptime view"
  ON uptime_records FOR SELECT
  USING (monitor_id IN (SELECT id FROM monitors WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Incidents
CREATE POLICY "Incidents view"
  ON incidents FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Incidents manage"
  ON incidents FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Incident timeline
CREATE POLICY "Timeline view"
  ON incident_timeline FOR SELECT
  USING (incident_id IN (SELECT id FROM incidents WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Timeline create"
  ON incident_timeline FOR INSERT
  WITH CHECK (incident_id IN (SELECT id FROM incidents WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Alert rules
CREATE POLICY "Alert rules view"
  ON alert_rules FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Alert rules manage"
  ON alert_rules FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Alert history
CREATE POLICY "Alert history view"
  ON alert_history FOR SELECT
  USING (rule_id IN (SELECT id FROM alert_rules WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Alert history update"
  ON alert_history FOR UPDATE
  USING (TRUE); -- Staff can acknowledge

-- Heartbeats
CREATE POLICY "Heartbeats view"
  ON heartbeats FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Heartbeats manage"
  ON heartbeats FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

CREATE POLICY "Heartbeat logs insert"
  ON heartbeat_logs FOR INSERT
  WITH CHECK (heartbeat_id IN (SELECT id FROM heartbeats WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Status pages: public view
CREATE POLICY "Status pages public view"
  ON status_pages FOR SELECT
  USING (is_published = TRUE OR business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Status pages manage"
  ON status_pages FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Subscribers
CREATE POLICY "Subscribers view"
  ON status_page_subscribers FOR SELECT
  USING (status_page_id IN (SELECT id FROM status_pages WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Subscribers create"
  ON status_page_subscribers FOR INSERT
  WITH CHECK (TRUE);

-- Status page incidents
CREATE POLICY "Status incidents view"
  ON status_page_incidents FOR SELECT
  USING (status_page_id IN (SELECT id FROM status_pages WHERE is_published = TRUE OR business_id IN (SELECT business_id FROM get_current_staff())));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Record a check result
CREATE OR REPLACE FUNCTION record_check(
  p_monitor_id UUID,
  p_status TEXT,
  p_duration_ms INTEGER DEFAULT NULL,
  p_status_code INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_response_body TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_check_id UUID;
  v_monitor RECORD;
  v_previous_status TEXT;
BEGIN
  SELECT * INTO v_monitor FROM monitors WHERE id = p_monitor_id;
  v_previous_status := v_monitor.status;
  
  -- Insert check
  INSERT INTO monitor_checks (
    monitor_id, status, duration_ms, status_code, error_message, response_body, completed_at
  )
  VALUES (p_monitor_id, p_status, p_duration_ms, p_status_code, p_error_message, p_response_body, NOW())
  RETURNING id INTO v_check_id;
  
  -- Update monitor status
  UPDATE monitors 
  SET status = p_status, 
      last_check_at = NOW(),
      next_check_at = NOW() + (check_interval || ' seconds')::interval
  WHERE id = p_monitor_id;
  
  -- Check if incident should be created
  IF p_status = 'down' AND v_previous_status = 'up' THEN
    INSERT INTO incidents (business_id, monitor_id, title, severity, started_at)
    VALUES (
      v_monitor.business_id, p_monitor_id,
      v_monitor.name || ' is down',
      'high', NOW()
    );
  END IF;
  
  -- Update uptime record for today
  INSERT INTO uptime_records (monitor_id, record_date, total_checks, successful_checks, failed_checks, avg_response_time_ms)
  VALUES (p_monitor_id, CURRENT_DATE, 1, CASE WHEN p_status = 'up' THEN 1 ELSE 0 END, CASE WHEN p_status != 'up' THEN 1 ELSE 0 END, p_duration_ms)
  ON CONFLICT (monitor_id, record_date, record_hour) DO UPDATE SET
    total_checks = uptime_records.total_checks + 1,
    successful_checks = uptime_records.successful_checks + CASE WHEN p_status = 'up' THEN 1 ELSE 0 END,
    failed_checks = uptime_records.failed_checks + CASE WHEN p_status != 'up' THEN 1 ELSE 0 END,
    avg_response_time_ms = (uptime_records.avg_response_time_ms + p_duration_ms) / 2;
  
  RETURN v_check_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record heartbeat
CREATE OR REPLACE FUNCTION record_heartbeat(p_heartbeat_id UUID)
RETURNS VOID AS $$
DECLARE
  v_hb RECORD;
BEGIN
  SELECT * INTO v_hb FROM heartbeats WHERE id = p_heartbeat_id;
  
  UPDATE heartbeats
  SET last_heartbeat_at = NOW(),
      next_expected_at = NOW() + (check_interval_seconds || ' seconds')::interval,
      status = 'healthy',
      consecutive_misses = 0
  WHERE id = p_heartbeat_id;
  
  INSERT INTO heartbeat_logs (heartbeat_id, status, response_time_ms)
  VALUES (p_heartbeat_id, 'ok', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Acknowledge incident
CREATE OR REPLACE FUNCTION acknowledge_incident(p_incident_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  UPDATE incidents
  SET status = 'investigating',
      acknowledged_at = NOW(),
      acknowledged_by = (SELECT id FROM staff WHERE user_id = auth.uid()),
      acknowledged_reason = p_reason
  WHERE id = p_incident_id;
  
  INSERT INTO incident_timeline (incident_id, entry_type, content, incident_status)
  VALUES (p_incident_id, 'acknowledgment', 'Incident acknowledged', 'investigating');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resolve incident
CREATE OR REPLACE FUNCTION resolve_incident(
  p_incident_id UUID,
  p_resolution_notes TEXT DEFAULT NULL,
  p_root_cause TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE incidents
  SET status = 'resolved',
      resolved_at = NOW(),
      resolved_by = (SELECT id FROM staff WHERE user_id = auth.uid()),
      resolution_notes = p_resolution_notes,
      root_cause = p_root_cause
  WHERE id = p_incident_id;
  
  UPDATE monitors
  SET status = 'up'
  WHERE id = (SELECT monitor_id FROM incidents WHERE id = p_incident_id);
  
  INSERT INTO incident_timeline (incident_id, entry_type, content, incident_status)
  VALUES (p_incident_id, 'status_change', 'Incident resolved', 'resolved');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER monitors_updated_at BEFORE UPDATE ON monitors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER incidents_updated_at BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER alert_rules_updated_at BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER heartbeats_updated_at BEFORE UPDATE ON heartbeats FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER status_pages_updated_at BEFORE UPDATE ON status_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
