-- ============================================
-- COMPREHENSIVE DATABASE FIX
-- Creates all missing tables, functions, and RLS policies
-- Run this to fix all 406/404 errors
-- ============================================

-- ============================================
-- 1. USER XP & GAMIFICATION
-- ============================================

CREATE TABLE IF NOT EXISTS user_xp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak_days INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  total_actions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  module_name TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, module_id)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  xp_reward INTEGER DEFAULT 0,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- ============================================
-- 2. BUSINESS ENTITLEMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS business_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'starter',
  feature TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  limit_value INTEGER,
  used_value INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, feature)
);

-- ============================================
-- 3. ANALYTICS & EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  page TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_business ON analytics_events(business_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);

-- ============================================
-- 4. TASKS
-- ============================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL,
  due_date DATE,
  due_time TIME,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  project_id UUID,
  estimated_hours NUMERIC(10,2),
  actual_hours NUMERIC(10,2),
  tags TEXT[],
  subtasks JSONB DEFAULT '[]',
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_business ON tasks(business_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

-- ============================================
-- 5. TIME TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration INTEGER,
  billable BOOLEAN DEFAULT TRUE,
  invoiced BOOLEAN DEFAULT FALSE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMZT DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_time_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_hours NUMERIC(10,2) DEFAULT 0,
  billable_hours NUMERIC(10,2) DEFAULT 0,
  non_billable_hours NUMERIC(10,2) DEFAULT 0,
  overtime_hours NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, date)
);

CREATE INDEX IF NOT EXISTS idx_time_entries_staff ON time_entries(staff_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_business ON time_entries(business_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_staff ON daily_time_summaries(staff_id);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_time_summaries(date);

-- ============================================
-- 6. KNOWLEDGE BASE
-- ============================================

CREATE TABLE IF NOT EXISTS kb_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES kb_spaces(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  slug TEXT,
  author_id UUID REFERENCES auth.users(id),
  is_published BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,
  view_count INTEGER DEFAULT 0,
  tags TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_spaces_business ON kb_spaces(business_id);
CREATE INDEX IF NOT EXISTS idx_kb_pages_space ON kb_pages(space_id);
CREATE INDEX IF NOT EXISTS idx_kb_pages_business ON kb_pages(business_id);
CREATE INDEX IF NOT EXISTS idx_kb_pages_archived ON kb_pages(is_archived);

-- ============================================
-- 7. SUPPORT TICKETS
-- ============================================

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  ticket_number TEXT UNIQUE,
  subject TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  category TEXT,
  created_by UUID REFERENCES auth.users(id),
  assigned_to UUID REFERENCES staff(id),
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  resolved_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),
  author_name TEXT,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_business ON tickets(business_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- ============================================
-- 8. INVENTORY MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL,
  unit TEXT DEFAULT 'piece',
  cost_price NUMERIC(15,2) DEFAULT 0,
  selling_price NUMERIC(15,2) DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  icon TEXT,
  parent_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_business ON inventory(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_inventory ON stock_movements(inventory_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_business ON stock_movements(business_id);

-- ============================================
-- 9. REQUISITIONS
-- ============================================

CREATE TABLE IF NOT EXISTS requisition_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  max_amount NUMERIC(15,2),
  requires_approval BOOLEAN DEFAULT TRUE,
  approver_role TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES requisition_categories(id) ON DELETE SET NULL,
  requester_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(15,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'normal',
  approved_by UUID REFERENCES staff(id),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requisitions_business ON requisitions(business_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_requester ON requisitions(requester_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_status ON requisitions(status);
CREATE INDEX IF NOT EXISTS idx_req_categories_business ON requisition_categories(business_id);

-- ============================================
-- 10. MEETINGS
-- ============================================

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  location TEXT,
  meeting_link TEXT,
  attendees JSONB DEFAULT '[]',
  agenda TEXT,
  notes TEXT,
  recording_url TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_staff ON meetings(staff_id);
CREATE INDEX IF NOT EXISTS idx_meetings_business ON meetings(business_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);

-- ============================================
-- 11. INCIDENTS & MONITORING
-- ============================================

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'low',
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  reporter_id UUID REFERENCES auth.users(id),
  assignee_id UUID REFERENCES staff(id),
  category TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  endpoint TEXT,
  status TEXT DEFAULT 'active',
  last_check_at TIMESTAMPTZ,
  last_status TEXT,
  uptime_percentage NUMERIC(5,2) DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_business ON incidents(business_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_monitors_business ON monitors(business_id);

-- ============================================
-- 12. REPORTING CHANNELS
-- ============================================

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  description TEXT,
  icon TEXT,
  color TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channels_business ON channels(business_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);

-- ============================================
-- 13. CALENDAR EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT FALSE,
  event_type TEXT,
  location TEXT,
  reminder JSONB DEFAULT '{}',
  attendees JSONB DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_business ON events(business_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(start_date);

-- ============================================
-- 14. MISSING RPC FUNCTIONS
-- ============================================

-- get_my_channels function
CREATE OR REPLACE FUNCTION get_my_channels(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  business_id UUID,
  name TEXT,
  type TEXT,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_private BOOLEAN,
  unread_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.business_id,
    c.name,
    c.type,
    c.description,
    c.icon,
    c.color,
    c.is_private,
    COALESCE(m.unread_count, 0)::INTEGER as unread_count
  FROM channels c
  LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = p_user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as unread_count 
    FROM chat_messages 
    WHERE channel_id = c.id 
    AND created_at > COALESCE(cm.joined_at, '1970-01-01')
  ) m ON true
  WHERE cm.user_id = p_user_id OR NOT c.is_private;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- record_analytics_event function
CREATE OR REPLACE FUNCTION record_analytics_event(
  p_user_id UUID,
  p_business_id UUID,
  p_event_type TEXT,
  p_event_name TEXT,
  p_properties JSONB DEFAULT '{}',
  p_page TEXT DEFAULT NULL,
  p_referrer TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO analytics_events (
    user_id, business_id, event_type, event_name, 
    properties, page, referrer
  ) VALUES (
    p_user_id, p_business_id, p_event_type, p_event_name,
    p_properties, p_page, p_referrer
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_events_in_range function
CREATE OR REPLACE FUNCTION get_events_in_range(
  p_business_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  all_day BOOLEAN,
  event_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.description,
    e.start_date,
    e.end_date,
    e.all_day,
    e.event_type
  FROM events e
  WHERE e.business_id = p_business_id
    AND e.start_date >= p_start_date
    AND e.start_date <= p_end_date
  ORDER BY e.start_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_active_time_entry function
CREATE OR REPLACE FUNCTION get_active_time_entry(p_staff_id UUID)
RETURNS TABLE(
  id UUID,
  description TEXT,
  start_time TIMESTAMPTZ,
  task_id UUID,
  project_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    te.id,
    te.description,
    te.start_time,
    te.task_id,
    te.project_id
  FROM time_entries te
  WHERE te.staff_id = p_staff_id
    AND te.end_time IS NULL
  ORDER BY te.start_time DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_org_chart function
CREATE OR REPLACE FUNCTION get_org_chart(p_business_id UUID)
RETURNS TABLE(
  staff_id UUID,
  name TEXT,
  email TEXT,
  job_title TEXT,
  department TEXT,
  role TEXT,
  avatar_url TEXT,
  reports_to UUID,
  level INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as staff_id,
    s.name,
    s.email,
    s.job_title,
    s.department,
    s.role,
    s.avatar_url,
    ra.staff_id as reports_to,
    COALESCE(s.level, 0) as level
  FROM staff s
  LEFT JOIN reporting_channels rc ON rc.staff_id = s.id
  LEFT JOIN reporting_assignments ra ON ra.channel_id = rc.channel_id AND ra.is_primary = TRUE
  WHERE s.business_id = p_business_id
    AND s.is_active = TRUE
  ORDER BY s.level NULLS LAST, s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 15. RLS POLICIES FOR ALL TABLES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_time_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisition_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create policies for user_xp
CREATE POLICY "Users can view their own XP" ON user_xp FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own XP" ON user_xp FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own XP" ON user_xp FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policies for business_entitlements
CREATE POLICY "Business members can view entitlements" ON business_entitlements FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can update entitlements" ON business_entitlements FOR UPDATE
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Create policies for tasks
CREATE POLICY "Business members can view tasks" ON tasks FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can insert tasks" ON tasks FOR INSERT 
  WITH CHECK (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can update tasks" ON tasks FOR UPDATE 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can delete tasks" ON tasks FOR DELETE 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')));

-- Create policies for time_entries
CREATE POLICY "Business members can view time entries" ON time_entries FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can insert time entries" ON time_entries FOR INSERT 
  WITH CHECK (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can update time entries" ON time_entries FOR UPDATE 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- Create policies for kb_spaces and kb_pages
CREATE POLICY "Business members can view KB" ON kb_spaces FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can manage KB" ON kb_spaces FOR ALL
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')));

CREATE POLICY "Business members can view KB pages" ON kb_pages FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can insert KB pages" ON kb_pages FOR INSERT 
  WITH CHECK (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can update KB pages" ON kb_pages FOR UPDATE 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can delete KB pages" ON kb_pages FOR DELETE 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Create policies for channels
CREATE POLICY "Members can view channels" ON channels FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage channels" ON channels FOR ALL
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Create policies for events
CREATE POLICY "Business members can view events" ON events FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can insert events" ON events FOR INSERT 
  WITH CHECK (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can update events" ON events FOR UPDATE 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can delete events" ON events FOR DELETE 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Create policies for meetings
CREATE POLICY "Business members can view meetings" ON meetings FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can insert meetings" ON meetings FOR INSERT 
  WITH CHECK (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can update meetings" ON meetings FOR UPDATE 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can delete meetings" ON meetings FOR DELETE 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Create policies for inventory
CREATE POLICY "Business members can view inventory" ON inventory FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can manage inventory" ON inventory FOR ALL
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')));

-- Create policies for requisitions
CREATE POLICY "Business members can view requisitions" ON requisitions FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can insert requisitions" ON requisitions FOR INSERT 
  WITH CHECK (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can update requisitions" ON requisitions FOR UPDATE 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- Create policies for tickets
CREATE POLICY "Business members can view tickets" ON tickets FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can manage tickets" ON tickets FOR ALL
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

-- Create policies for incidents
CREATE POLICY "Business members can view incidents" ON incidents FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can manage incidents" ON incidents FOR ALL
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Create policies for monitors
CREATE POLICY "Business members can view monitors" ON monitors FOR SELECT 
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Business members can manage monitors" ON monitors FOR ALL
  USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- ============================================
-- 16. GRANT PERMISSIONS
-- ============================================

-- Least-privilege grants (§84). Previously this granted ALL functions and
-- ALL table verbs to BOTH anon and authenticated — a blanket that exposed
-- every SECURITY DEFINER function (which bypasses RLS) to unauthenticated
-- callers. RLS is the row-level boundary; these grants are the
-- verb/function-level boundary.
--
-- The only functions anon (unauthenticated) may call are the deliberately
-- public ones, each granted explicitly in its own migration:
--   • signing-by-token: 050_public_signing_flow.sql (4 functions)
--   • SSO provider lookup: 053_sso_providers.sql
--   • invite info: 20260101000002_auth_functions.sql
-- Those explicit grants remain; the blanket below no longer extends anon
-- access to every function in the schema.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- Tables: only the CRUD verbs RLS then gates (no TRUNCATE/REFERENCES to
-- anon/authenticated — those are service-role only).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- anon gets table USAGE so it can reach explicitly-granted public RPCs, but
-- no blanket table verbs (RLS policies on public-facing tables gate anon).
GRANT USAGE ON SCHEMA public TO anon;
-- Functions: authenticated keeps the blanket (app users are authenticated;
-- RLS + SECURITY DEFINER checks still apply). anon does NOT — it may only
-- call the explicitly-granted public functions above.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================
-- 17. REFRESH SCHEMA CACHE
-- ============================================

NOTIFY pgrst, 'reload';

-- ============================================
-- DONE
-- ============================================

SELECT 'All missing tables, functions, and RLS policies created!' as status;


-- ============================================
-- MERGED from 999_fix_missing_tables.sql (was a duplicate-numbered sibling)
-- ============================================

-- ============================================
-- Fix Missing Tables
-- Run this in Supabase SQL Editor to create missing tables
-- ============================================

-- ============================================
-- USER XP & LEVELS (Gamification)
-- ============================================
CREATE TABLE IF NOT EXISTS user_xp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_total INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak_days INTEGER DEFAULT 0,
  last_active_date DATE,
  longest_streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================
-- USER LEARNING (Personalization)
-- ============================================
CREATE TABLE IF NOT EXISTS user_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Behavioral patterns
  preferred_times JSONB DEFAULT '{}',
  preferred_days JSONB DEFAULT '{}',
  avg_session_duration INTEGER DEFAULT 0,
  avg_actions_per_session INTEGER DEFAULT 0,
  
  -- Most used features
  top_features JSONB DEFAULT '[]',
  
  -- Communication preferences
  preferred_channel TEXT DEFAULT 'in_app',
  notification_frequency TEXT DEFAULT 'daily',
  
  -- Work style insights
  work_style TEXT DEFAULT 'balanced',
  multitasking_level INTEGER DEFAULT 50,
  
  -- Learning feedback
  positive_signals INTEGER DEFAULT 0,
  negative_signals INTEGER DEFAULT 0,
  suggestions_shown INTEGER DEFAULT 0,
  suggestions_accepted INTEGER DEFAULT 0,
  
  -- Learning data
  learning_data JSONB DEFAULT '{"interactions": {}}',
  
  last_learning_at TIMESTAMPTZ DEFAULT NOW(),
  learning_confidence DECIMAL(5,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USER ACHIEVEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  achievement_key TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  
  -- Progress
  progress_current INTEGER DEFAULT 0,
  progress_target INTEGER DEFAULT 1,
  progress_percent INTEGER DEFAULT 0,
  
  -- Status
  unlocked BOOLEAN DEFAULT FALSE,
  unlocked_at TIMESTAMPTZ,
  
  -- Points
  points INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, achievement_key)
);

-- ============================================
-- BUSINESS ENTITLEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS business_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
  features JSONB DEFAULT '{}',
  team_limit INTEGER DEFAULT 3,
  storage_limit_mb INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ANALYTICS EVENTS
-- ============================================
CREATE TYPE IF NOT EXISTS event_category AS ENUM (
  'page_view', 'user_action', 'feature_usage', 'search', 'filter',
  'export', 'import', 'notification', 'payment', 'auth', 'error', 'performance', 'engagement'
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  category event_category NOT NULL,
  page TEXT,
  component TEXT,
  action TEXT,
  metadata JSONB DEFAULT '{}',
  duration_ms INTEGER,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CHANNELS (Chat)
-- ============================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'public' CHECK (type IN ('public', 'private', 'direct')),
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, name)
);

-- ============================================
-- TASKS
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assignee_id UUID REFERENCES staff(id),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Function to get user's channels
CREATE OR REPLACE FUNCTION get_my_channels()
RETURNS TABLE (
  id UUID,
  business_id UUID,
  name TEXT,
  description TEXT,
  type TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.business_id, c.name, c.description, c.type, c.created_by, c.created_at
  FROM channels c
  INNER JOIN channel_members cm ON c.id = cm.channel_id
  INNER JOIN staff s ON cm.staff_id = s.id
  WHERE s.user_id = auth.uid()
  ORDER BY c.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record analytics event
CREATE OR REPLACE FUNCTION record_analytics_event(
  p_business_id UUID,
  p_user_id UUID,
  p_event_name TEXT,
  p_category event_category,
  p_page TEXT DEFAULT NULL,
  p_component TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_duration_ms INTEGER DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO analytics_events (
    business_id, user_id, event_name, category,
    page, component, action, metadata, duration_ms, session_id
  ) VALUES (
    p_business_id, p_user_id, p_event_name, p_category,
    p_page, p_component, p_action, p_metadata, p_duration_ms, p_session_id
  ) RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_xp_user ON user_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_user_learning_user ON user_learning(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_user_unlocked ON user_achievements(user_id, unlocked);
CREATE INDEX IF NOT EXISTS idx_business_entitlements_business ON business_entitlements(business_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_business ON analytics_events(business_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channels_business ON channels(business_id);
CREATE INDEX IF NOT EXISTS idx_tasks_business ON tasks(business_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- user_xp policies
CREATE POLICY "Users can view own XP"
  ON user_xp FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own XP"
  ON user_xp FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own XP"
  ON user_xp FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- user_learning policies
CREATE POLICY "Users can view own learning"
  ON user_learning FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own learning"
  ON user_learning FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own learning"
  ON user_learning FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- user_achievements policies
CREATE POLICY "Users can view own achievements"
  ON user_achievements FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own achievements"
  ON user_achievements FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own achievements"
  ON user_achievements FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- business_entitlements policies
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

-- analytics_events policies
CREATE POLICY "Users can view own analytics"
  ON analytics_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service can insert analytics"
  ON analytics_events FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Admins can view business analytics"
  ON analytics_events FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- channels policies
CREATE POLICY "Staff can view business channels"
  ON channels FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Channel members can view channels"
  ON channels FOR SELECT
  USING (
    id IN (
      SELECT channel_id FROM channel_members
      INNER JOIN staff ON channel_members.staff_id = staff.id
      WHERE staff.user_id = auth.uid()
    )
  );

-- tasks policies
CREATE POLICY "Staff can view business tasks"
  ON tasks FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can create tasks"
  ON tasks FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can update business tasks"
  ON tasks FOR UPDATE
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- SEED DEFAULT ACHIEVEMENTS
-- ============================================
INSERT INTO user_achievements (user_id, achievement_key, achievement_name, achievement_description, category, points)
SELECT 
  u.id as user_id,
  ach.key as achievement_key,
  ach.name as achievement_name,
  ach.description as achievement_description,
  ach.category,
  ach.points
FROM auth.users u
CROSS JOIN (
  VALUES 
    ('first_login', 'Welcome Aboard', 'Logged in for the first time', 'usage', 10),
    ('first_task', 'Task Starter', 'Completed your first task', 'usage', 25),
    ('explorer', 'Explorer', 'Visited 10 different pages', 'exploration', 50),
    ('consistent', 'Consistent', 'Used the app 3 days in a row', 'consistency', 100),
    ('power_user', 'Power User', 'Used 5 different features', 'mastery', 150),
    ('week_streak', 'Week Warrior', 'Maintained a 7-day streak', 'consistency', 500),
    ('speed_demon', 'Speed Demon', 'Completed 10 tasks in a day', 'usage', 75),
    ('social_butterfly', 'Social Butterfly', 'Invited your first team member', 'usage', 100)
) AS ach(key, name, description, category, points)
ON CONFLICT (user_id, achievement_key) DO NOTHING;

-- ============================================
-- ENABLE REALTIME (optional)
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- ============================================
-- Done!
-- ============================================
SELECT 'All missing tables created successfully!' as status;
