-- AVENIZE Layer 1 - Reports & Analytics
-- Report builder, scheduled reports, and business intelligence

-- ============================================
-- REPORT DEFINITIONS
-- ============================================
CREATE TABLE IF NOT EXISTS report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by UUID REFERENCES staff(id),
  -- Report info
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'custom' CHECK (category IN (
    'sales', 'finance', 'inventory', 'hr', 'operations', 'custom'
  )),
  icon TEXT DEFAULT 'BarChart3',
  color TEXT DEFAULT '#6366F1',
  -- Report config
  report_type TEXT NOT NULL CHECK (report_type IN (
    'table', 'chart', 'metric', 'funnel', 'pivot', 'comparison'
  )),
  chart_type TEXT CHECK (chart_type IN (
    'bar', 'line', 'pie', 'donut', 'area', 'scatter', 'funnel'
  )),
  -- Data source
  data_source TEXT NOT NULL, -- Table or view name
  base_query JSONB DEFAULT '{}', -- Default filters
  aggregation_type TEXT DEFAULT 'count' CHECK (aggregation_type IN (
    'count', 'sum', 'avg', 'min', 'max', 'distinct'
  )),
  group_by_field TEXT, -- Field to group by
  -- Visualization
  x_axis_field TEXT,
  y_axis_field TEXT,
  value_field TEXT,
  -- Styling
  color_scheme JSONB DEFAULT '["#6366F1", "#10B981", "#F59E0B", "#EF4444"]',
  show_legend BOOLEAN DEFAULT TRUE,
  show_grid BOOLEAN DEFAULT TRUE,
  -- Sharing
  is_public BOOLEAN DEFAULT FALSE,
  is_template BOOLEAN DEFAULT FALSE,
  -- Status
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REPORT FILTERS
-- ============================================
CREATE TABLE IF NOT EXISTS report_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_label TEXT,
  filter_type TEXT DEFAULT 'text' CHECK (filter_type IN (
    'text', 'number', 'date', 'daterange', 'select', 'multiselect', 'boolean'
  )),
  default_value JSONB,
  options JSONB DEFAULT '[]', -- For select/multiselect
  is_required BOOLEAN DEFAULT FALSE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REPORT DATA (cached results)
-- ============================================
CREATE TABLE IF NOT EXISTS report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  -- Snapshot metadata
  snapshot_date DATE DEFAULT CURRENT_DATE,
  period_start DATE,
  period_end DATE,
  -- Cached data
  data JSONB NOT NULL, -- The actual report data
  metadata JSONB DEFAULT '{}', -- Row count, exec time, etc.
  -- Status
  status TEXT DEFAULT 'ready' CHECK (status IN ('ready', 'stale', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SCHEDULED REPORTS
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  created_by UUID REFERENCES staff(id),
  -- Schedule
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN (
    'once', 'daily', 'weekly', 'monthly', 'quarterly'
  )),
  schedule_time TIME DEFAULT '09:00',
  schedule_day INTEGER, -- Day of week (1-7) or month (1-31)
  -- Delivery
  delivery_method TEXT DEFAULT 'email' CHECK (delivery_method IN (
    'email', 'slack', 'webhook', 'dashboard'
  )),
  recipients JSONB DEFAULT '[]', -- Email addresses or user IDs
  email_subject TEXT,
  include_data BOOLEAN DEFAULT TRUE,
  attach_pdf BOOLEAN DEFAULT FALSE,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REPORT RUN HISTORY
-- ============================================
CREATE TABLE IF NOT EXISTS report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
  scheduled_id UUID REFERENCES scheduled_reports(id),
  -- Execution
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  -- Result
  status TEXT DEFAULT 'running' CHECK (status IN (
    'running', 'completed', 'failed', 'cancelled'
  )),
  error_message TEXT,
  row_count INTEGER,
  -- Output
  output_url TEXT, -- URL to generated file if applicable
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ANALYTICS EVENTS (app-wide tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  -- Event data
  event_name TEXT NOT NULL,
  event_category TEXT, -- 'page', 'action', 'conversion', 'error'
  event_properties JSONB DEFAULT '{}',
  -- Context
  page_url TEXT,
  page_name TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_address INET,
  -- Session
  session_id TEXT,
  -- Timing
  duration_ms INTEGER, -- For page views
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- METRICS & KPI TRACKING
-- ============================================
CREATE TABLE IF NOT EXISTS kpi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Metric definition
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  unit TEXT DEFAULT 'number', -- 'number', 'currency', 'percent', 'duration'
  -- Data
  current_value NUMERIC,
  previous_value NUMERIC,
  change_value NUMERIC,
  change_percent NUMERIC,
  -- Goal
  target_value NUMERIC,
  target_date DATE,
  -- Metadata
  data_source TEXT,
  query_definition JSONB,
  last_calculated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DASHBOARDS
-- ============================================
CREATE TABLE IF NOT EXISTS dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by UUID REFERENCES staff(id),
  -- Dashboard info
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'LayoutDashboard',
  color TEXT DEFAULT '#6366F1',
  -- Layout
  layout JSONB DEFAULT '[]', -- Widget positions
  is_default BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE,
  -- Access
  shared_with JSONB DEFAULT '[]', -- Staff IDs
  -- Status
  refresh_interval INTEGER DEFAULT 300, -- Seconds
  last_refreshed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DASHBOARD WIDGETS
-- ============================================
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  report_id UUID REFERENCES report_definitions(id),
  -- Widget config
  widget_type TEXT NOT NULL CHECK (widget_type IN (
    'metric', 'chart', 'table', 'text', 'image', 'divider', 'embed'
  )),
  title TEXT,
  -- Position & size (grid-based)
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 4, -- Grid columns
  height INTEGER DEFAULT 3, -- Grid rows
  -- Chart config
  chart_type TEXT,
  color_scheme JSONB,
  show_trend BOOLEAN DEFAULT FALSE,
  -- Content
  content TEXT, -- For text/embed widgets
  image_url TEXT,
  -- Status
  is_visible BOOLEAN DEFAULT TRUE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

-- Reports: business scope
CREATE POLICY "Reports view"
  ON report_definitions FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Reports manage"
  ON report_definitions FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Scheduled reports
CREATE POLICY "Scheduled reports view"
  ON scheduled_reports FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Scheduled reports manage"
  ON scheduled_reports FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Report runs
CREATE POLICY "Report runs view"
  ON report_runs FOR SELECT
  USING (report_id IN (SELECT id FROM report_definitions WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Analytics events: append only, business scope
CREATE POLICY "Analytics events append"
  ON analytics_events FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Analytics events view"
  ON analytics_events FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- KPI metrics
CREATE POLICY "KPI view"
  ON kpi_metrics FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "KPI manage"
  ON kpi_metrics FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Dashboards
CREATE POLICY "Dashboards view"
  ON dashboards FOR SELECT
  USING (
    is_public = TRUE
    OR created_by IN (SELECT id FROM staff WHERE user_id = auth.uid())
    OR business_id IN (SELECT business_id FROM get_current_staff())
  );

CREATE POLICY "Dashboards manage"
  ON dashboards FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Widgets
CREATE POLICY "Widgets view"
  ON dashboard_widgets FOR SELECT
  USING (dashboard_id IN (SELECT id FROM dashboards WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Widgets manage"
  ON dashboard_widgets FOR ALL
  USING (dashboard_id IN (SELECT id FROM dashboards WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Track analytics event
CREATE OR REPLACE FUNCTION track_event(
  p_event_name TEXT,
  p_event_category TEXT DEFAULT NULL,
  p_properties JSONB DEFAULT '{}'::jsonb,
  p_page_url TEXT DEFAULT NULL,
  p_page_name TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO analytics_events (
    business_id, staff_id, event_name, event_category, event_properties,
    page_url, page_name, session_id
  )
  VALUES (
    (SELECT business_id FROM get_current_staff()),
    (SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1),
    p_event_name, p_event_category, p_properties,
    p_page_url, p_page_name,
    COALESCE(current_setting('app.session_id', TRUE)::TEXT, gen_random_uuid()::TEXT)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run report and return data
CREATE OR REPLACE FUNCTION run_report(p_report_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_report RECORD;
  v_result JSONB;
BEGIN
  SELECT * INTO v_report FROM report_definitions WHERE id = p_report_id;
  
  -- Build query based on report type
  -- This is a simplified version - in production you'd build dynamically
  v_result := jsonb_build_object(
    'report_id', p_report_id,
    'report_name', v_report.name,
    'generated_at', NOW(),
    'data', jsonb_build_array() -- Placeholder
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER report_definitions_updated_at BEFORE UPDATE ON report_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER scheduled_reports_updated_at BEFORE UPDATE ON scheduled_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER kpi_metrics_updated_at BEFORE UPDATE ON kpi_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER dashboards_updated_at BEFORE UPDATE ON dashboards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER dashboard_widgets_updated_at BEFORE UPDATE ON dashboard_widgets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
