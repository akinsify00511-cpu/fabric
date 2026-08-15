-- Company Home Page Builder
-- Enables businesses to create/edit a customizable company home page

-- Main table for home page content blocks
CREATE TABLE company_home_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN (
    'hero',           -- Large banner with title and description
    'announcement',   -- Important news/updates
    'team_spotlight', -- Featured team member(s)
    'metrics',        -- Key stats/numbers
    'gallery',        -- Image gallery
    'quote',          -- Testimonial or quote
    'cta',            -- Call to action button
    'text'            -- Rich text section
  )),
  title TEXT,
  content JSONB NOT NULL DEFAULT '{}',
  -- Content structure varies by block_type:
  -- hero: { subtitle, cta_text, cta_link, background_image }
  -- announcement: { body, author, published_at, priority }
  -- team_spotlight: { staff_ids[], description }
  -- metrics: { items: [{ label, value, change }] }
  -- gallery: { images: [{ url, caption }], layout }
  -- quote: { text, author, role, avatar_url }
  -- cta: { text, link, style }
  -- text: { body }
  "order" INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN DEFAULT false,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX idx_company_home_blocks_business ON company_home_blocks(business_id);
CREATE INDEX idx_company_home_blocks_order ON company_home_blocks(business_id, "order");
CREATE INDEX idx_company_home_blocks_published ON company_home_blocks(business_id, published);

-- RLS Policies
ALTER TABLE company_home_blocks ENABLE ROW LEVEL SECURITY;

-- Everyone in the business can view published blocks
CREATE POLICY "View published blocks" ON company_home_blocks
  FOR SELECT USING (
    published = true AND 
    business_id IN (
      SELECT business_id FROM staff WHERE id = auth.uid()
    )
  );

-- Only owners and managers can view all blocks (including drafts)
CREATE POLICY "View all blocks for editors" ON company_home_blocks
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM staff 
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Only owners and managers can create blocks
CREATE POLICY "Create blocks" ON company_home_blocks
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT business_id FROM staff 
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Only owners and managers can update blocks
CREATE POLICY "Update blocks" ON company_home_blocks
  FOR UPDATE USING (
    business_id IN (
      SELECT business_id FROM staff 
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Only owners and managers can delete blocks
CREATE POLICY "Delete blocks" ON company_home_blocks
  FOR DELETE USING (
    business_id IN (
      SELECT business_id FROM staff 
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Comments on announcements
CREATE TABLE home_block_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES company_home_blocks(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE home_block_comments ENABLE ROW LEVEL SECURITY;

-- Anyone in business can view comments
CREATE POLICY "View comments" ON home_block_comments
  FOR SELECT USING (
    staff_id IN (
      SELECT id FROM staff WHERE business_id = (
        SELECT business_id FROM company_home_blocks WHERE id = block_id
      )
    )
  );

-- Anyone in business can comment
CREATE POLICY "Create comments" ON home_block_comments
  FOR INSERT WITH CHECK (
    staff_id IN (
      SELECT id FROM staff WHERE business_id = (
        SELECT business_id FROM company_home_blocks WHERE id = block_id
      )
    )
  );

-- Only comment author can update/delete
CREATE POLICY "Update own comments" ON home_block_comments
  FOR UPDATE USING (staff_id = auth.uid());

CREATE POLICY "Delete own comments" ON home_block_comments
  FOR DELETE USING (staff_id = auth.uid());

-- Reactions on announcements
CREATE TABLE home_block_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES company_home_blocks(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  reaction_type TEXT NOT NULL DEFAULT 'like', -- like, celebrate, insight, love
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(block_id, staff_id)
);

ALTER TABLE home_block_reactions ENABLE ROW LEVEL SECURITY;

-- View reactions if you can see the block
CREATE POLICY "View reactions" ON home_block_reactions
  FOR SELECT USING (
    staff_id IN (
      SELECT id FROM staff WHERE business_id = (
        SELECT business_id FROM company_home_blocks WHERE id = block_id
      )
    )
  );

-- Add reaction if in business
CREATE POLICY "Add reactions" ON home_block_reactions
  FOR INSERT WITH CHECK (
    staff_id IN (
      SELECT id FROM staff WHERE business_id = (
        SELECT business_id FROM company_home_blocks WHERE id = block_id
      )
    )
  );

-- Remove own reactions
CREATE POLICY "Remove own reactions" ON home_block_reactions
  FOR DELETE USING (staff_id = auth.uid());

-- Update own reactions
CREATE POLICY "Update own reactions" ON home_block_reactions
  FOR UPDATE USING (staff_id = auth.uid());

-- Trigger to update updated_at
CREATE TRIGGER update_company_home_blocks_updated_at
  BEFORE UPDATE ON company_home_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_home_block_comments_updated_at
  BEFORE UPDATE ON home_block_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample blocks for demo (will only work in demo mode)
-- This is a placeholder, actual demo data should be seeded differently


-- ============================================
-- MERGED from 023_organogram.sql (was a duplicate-numbered sibling)
-- ============================================

-- AVENIZE Layer 1 - Organogram & Reporting Structure
-- Automated organizational chart and reporting channels

-- ============================================
-- REPORTING STRUCTURE (extends staff)
-- ============================================
CREATE TABLE IF NOT EXISTS reporting_structure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  -- Direct manager
  manager_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  -- Position details
  position_title TEXT NOT NULL,
  department TEXT,
  division TEXT,
  location TEXT,
  -- Employment
  employment_type TEXT DEFAULT 'full_time' CHECK (employment_type IN (
    'full_time', 'part_time', 'contract', 'intern', 'consultant'
  )),
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  -- Hierarchy
  level INTEGER DEFAULT 0, -- 0 = CEO/Owner, 1 = C-Suite, 2 = Manager, 3+ = Individual contributors
  path LTREE, -- Materialized path for fast hierarchy queries (e.g., '1.5.12')
  -- Role details
  job_family TEXT, -- Engineering, Sales, Marketing, etc.
  job_level TEXT, -- IC1, IC2, M1, M2, D1, VP, etc.
  -- Cost center
  cost_center TEXT,
  budget_responsibility NUMERIC,
  headcount_responsibility INTEGER DEFAULT 0,
  -- Status
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, staff_id)
);

-- ============================================
-- ORGANOGRAM NODES (for visual org chart)
-- ============================================
CREATE TABLE IF NOT EXISTS organogram_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  node_type TEXT NOT NULL CHECK (node_type IN ('person', 'role', 'department', 'team')),
  -- Display
  display_name TEXT NOT NULL,
  title TEXT,
  avatar_url TEXT,
  department TEXT,
  -- Position in chart
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  -- Hierarchy reference
  reporting_structure_id UUID REFERENCES reporting_structure(id),
  parent_node_id UUID REFERENCES organogram_nodes(id),
  -- Styling
  color TEXT,
  icon TEXT,
  -- Status
  is_expanded BOOLEAN DEFAULT TRUE,
  is_hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REPORTING CHANNELS
-- ============================================
CREATE TABLE IF NOT EXISTS reporting_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN (
    'daily_standup', 'weekly_update', 'monthly_review', 'project_sync',
    'department_meeting', 'one_on_one', 'escalation', 'broadcast'
  )),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'MessageSquare',
  color TEXT DEFAULT '#6366F1',
  -- Configuration
  frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'as_needed')),
  scheduled_day INTEGER, -- 1-7 for weekly, 1-31 for monthly
  scheduled_time TIME DEFAULT '09:00',
  -- Auto-generation
  auto_generate BOOLEAN DEFAULT TRUE,
  generation_trigger TEXT, -- What triggers auto-generation
  template_id UUID, -- Message template to use
  -- Participation
  required_participants JSONB DEFAULT '[]', -- Staff IDs who must participate
  optional_participants JSONB DEFAULT '[]', -- Staff IDs who can optionally join
  -- Auto-include by role/department
  include_roles TEXT[] DEFAULT '{}',
  include_departments TEXT[] DEFAULT '{}',
  include_levels INTEGER[] DEFAULT '{}', -- Org levels to include
  -- Scope
  scope_type TEXT DEFAULT 'department' CHECK (scope_type IN ('all', 'department', 'team', 'custom')),
  scope_department TEXT,
  scope_team TEXT,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REPORTING UPDATES (automated updates)
-- ============================================
CREATE TABLE IF NOT EXISTS reporting_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES reporting_channels(id) ON DELETE CASCADE,
  -- Generation
  generated_for_date DATE NOT NULL,
  generated_by_ai BOOLEAN DEFAULT FALSE,
  -- Content
  summary TEXT, -- Auto-generated summary
  highlights JSONB DEFAULT '[]', -- Key points
  blockers JSONB DEFAULT '[]', -- Issues flagged
  accomplishments JSONB DEFAULT '[]', -- Completed items
  upcoming JSONB DEFAULT '[]', -- Upcoming items
  metrics JSONB DEFAULT '{}', -- Relevant metrics
  -- Participants
  participant_updates JSONB DEFAULT '[]', -- [{staff_id, update_text}]
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ESCALATION PATHS
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Trigger conditions
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'task_overdue', 'ticket_unresolved', 'deal_stalled', 'budget_exceeded',
    'performance_below', 'attendance_issue', 'escalation_request'
  )),
  trigger_conditions JSONB DEFAULT '{}', -- {threshold_days: 3, priority: 'high'}
  -- Escalation chain
  levels JSONB NOT NULL DEFAULT '[]', -- [{level: 1, assignee_type: 'manager', delay_hours: 0}, ...]
  -- Notifications
  notify_on_escalation BOOLEAN DEFAULT TRUE,
  email_template_id UUID,
  slack_template_id UUID,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PERFORMANCE REVIEWS
-- ============================================
CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES staff(id),
  reviewee_id UUID NOT NULL REFERENCES staff(id),
  -- Review details
  review_type TEXT DEFAULT 'annual' CHECK (review_type IN (
    'annual', 'quarterly', 'probation', 'promotion', '360', 'peer'
  )),
  review_period_start DATE,
  review_period_end DATE,
  due_date DATE,
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'self_review', 'manager_review', 'calibration', 'completed', 'cancelled'
  )),
  -- Ratings
  overall_rating NUMERIC CHECK (overall_rating BETWEEN 1 AND 5),
  ratings JSONB DEFAULT '{}', -- {communication: 4, teamwork: 5, ...}
  -- Content
  strengths TEXT,
  areas_for_improvement TEXT,
  goals TEXT,
  development_plan TEXT,
  -- Sign-off
  reviewee_acknowledged BOOLEAN DEFAULT FALSE,
  reviewee_comments TEXT,
  reviewer_signed_at TIMESTAMPTZ,
  reviewee_signed_at TIMESTAMPTZ,
  -- Compensation
  compensation_review BOOLEAN DEFAULT FALSE,
  current_salary NUMERIC,
  proposed_salary NUMERIC,
  salary_change_percent NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TEAM STRUCTURE (departments/teams)
-- ============================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT, -- Short code (ENG, SALES, etc.)
  description TEXT,
  -- Hierarchy
  parent_department_id UUID REFERENCES departments(id),
  head_staff_id UUID REFERENCES staff(id),
  -- Structure
  department_type TEXT CHECK (department_type IN ('division', 'department', 'team', 'unit')),
  cost_center TEXT,
  budget NUMERIC,
  -- Contact
  email TEXT,
  slack_channel TEXT,
  -- Display
  color TEXT DEFAULT '#6366F1',
  icon TEXT,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DEPARTMENT MEMBERSHIP
-- ============================================
CREATE TABLE IF NOT EXISTS department_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('head', 'lead', 'member', 'temp')),
  is_primary BOOLEAN DEFAULT TRUE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(department_id, staff_id)
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE reporting_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE organogram_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_members ENABLE ROW LEVEL SECURITY;

-- Reporting structure: visible to business
CREATE POLICY "Reporting structure view"
  ON reporting_structure FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Reporting structure manage"
  ON reporting_structure FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Organogram nodes
CREATE POLICY "Organogram view"
  ON organogram_nodes FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Organogram manage"
  ON organogram_nodes FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Reporting channels
CREATE POLICY "Channels view"
  ON reporting_channels FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Channels manage"
  ON reporting_channels FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Reporting updates
CREATE POLICY "Updates view"
  ON reporting_updates FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Updates manage"
  ON reporting_updates FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Escalation paths
CREATE POLICY "Escalation view"
  ON escalation_paths FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Escalation manage"
  ON escalation_paths FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Performance reviews
CREATE POLICY "Reviews view"
  ON performance_reviews FOR SELECT
  USING (
    business_id IN (SELECT business_id FROM get_current_staff())
    AND (reviewer_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
         OR reviewee_id IN (SELECT id FROM staff WHERE user_id = auth.uid()))
  );

CREATE POLICY "Reviews manage"
  ON performance_reviews FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Departments
CREATE POLICY "Departments view"
  ON departments FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Departments manage"
  ON departments FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Department members
CREATE POLICY "Dept members view"
  ON department_members FOR SELECT
  USING (department_id IN (SELECT id FROM departments WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Dept members manage"
  ON department_members FOR ALL
  USING (department_id IN (SELECT id FROM departments WHERE business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager'))));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Set reporting manager
CREATE OR REPLACE FUNCTION set_reporting_manager(
  p_staff_id UUID,
  p_manager_id UUID,
  p_position_title TEXT,
  p_department TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_level INTEGER;
  v_business_id UUID;
BEGIN
  v_business_id := (SELECT business_id FROM staff WHERE id = p_staff_id);
  
  -- Calculate level based on manager
  IF p_manager_id IS NULL THEN
    v_level := 0; -- Top level
  ELSE
    SELECT COALESCE(MAX(level), 0) + 1 INTO v_level
    FROM reporting_structure
    WHERE staff_id = p_manager_id;
  END IF;
  
  INSERT INTO reporting_structure (business_id, staff_id, manager_id, position_title, department, level)
  VALUES (v_business_id, p_staff_id, p_manager_id, p_position_title, p_department, v_level)
  ON CONFLICT (business_id, staff_id) DO UPDATE SET
    manager_id = p_manager_id,
    position_title = p_position_title,
    department = p_department,
    level = v_level,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get direct reports
CREATE OR REPLACE FUNCTION get_direct_reports(p_staff_id UUID)
RETURNS TABLE (
  staff_id UUID,
  full_name TEXT,
  email TEXT,
  position_title TEXT,
  department TEXT,
  level INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rs.staff_id, s.full_name, s.email, rs.position_title, rs.department, rs.level
  FROM reporting_structure rs
  JOIN staff s ON s.id = rs.staff_id
  WHERE rs.manager_id = p_staff_id AND rs.is_active = TRUE
  ORDER BY rs.level, s.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get full team (all reports recursively)
CREATE OR REPLACE FUNCTION get_full_team(p_staff_id UUID)
RETURNS TABLE (
  staff_id UUID,
  full_name TEXT,
  email TEXT,
  position_title TEXT,
  department TEXT,
  level INTEGER,
  reports_to UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rs.staff_id, s.full_name, s.email, rs.position_title, rs.department, rs.level, rs.manager_id
  FROM reporting_structure rs
  JOIN staff s ON s.id = rs.staff_id
  WHERE rs.manager_id = p_staff_id AND rs.is_active = TRUE
  UNION ALL
  SELECT 
    rs.staff_id, s.full_name, s.email, rs.position_title, rs.department, rs.level, rs.manager_id
  FROM reporting_structure rs
  JOIN staff s ON s.id = rs.staff_id
  WHERE rs.manager_id IN (SELECT staff_id FROM get_full_team(p_staff_id)) AND rs.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get org chart data
CREATE OR REPLACE FUNCTION get_org_chart()
RETURNS TABLE (
  staff_id UUID,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  position_title TEXT,
  department TEXT,
  level INTEGER,
  manager_id UUID,
  direct_report_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rs.staff_id,
    s.full_name,
    s.email,
    s.avatar_url,
    rs.position_title,
    rs.department,
    rs.level,
    rs.manager_id,
    (SELECT COUNT(*) FROM reporting_structure WHERE manager_id = rs.staff_id AND is_active = TRUE)::INTEGER as direct_report_count
  FROM reporting_structure rs
  JOIN staff s ON s.id = rs.staff_id
  WHERE rs.business_id = (SELECT business_id FROM get_current_staff())
    AND rs.is_active = TRUE
  ORDER BY rs.level, s.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generate reporting update
CREATE OR REPLACE FUNCTION generate_reporting_update(p_channel_id UUID, p_date DATE)
RETURNS UUID AS $$
DECLARE
  v_update_id UUID;
  v_channel RECORD;
  v_participants JSONB;
BEGIN
  SELECT * INTO v_channel FROM reporting_channels WHERE id = p_channel_id;
  
  -- Get participants based on scope
  SELECT jsonb_agg(staff_id) INTO v_participants
  FROM staff
  WHERE business_id = v_channel.business_id
    AND id = ANY(v_channel.required_participants || v_channel.optional_participants);
  
  -- Create update
  INSERT INTO reporting_updates (business_id, channel_id, generated_for_date, participant_updates)
  VALUES (v_channel.business_id, p_channel_id, p_date, v_participants)
  RETURNING id INTO v_update_id;
  
  -- Update channel last generated
  UPDATE reporting_channels SET last_generated_at = NOW() WHERE id = p_channel_id;
  
  RETURN v_update_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger escalation
CREATE OR REPLACE FUNCTION trigger_escalation(
  p_trigger_type TEXT,
  p_entity_type TEXT, -- 'task', 'ticket', 'deal'
  p_entity_id UUID,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
DECLARE
  v_escalation RECORD;
  v_level INTEGER;
  v_assignee_id UUID;
BEGIN
  -- Find matching escalation path
  SELECT * INTO v_escalation
  FROM escalation_paths
  WHERE trigger_type = p_trigger_type AND is_active = TRUE
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get current level (starts at 1)
  v_level := 1;
  
  -- Find assignee for this level
  -- This would need custom logic based on entity type
  -- For now, just log the escalation
  INSERT INTO reporting_updates (business_id, channel_id, generated_for_date, summary, highlights)
  VALUES (
    v_escalation.business_id,
    NULL, -- No specific channel
    CURRENT_DATE,
    'Escalation triggered: ' || p_trigger_type,
    jsonb_build_array(jsonb_build_object('level', v_level, 'type', p_trigger_type, 'entity', p_entity_id))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sync organogram from reporting structure
CREATE OR REPLACE FUNCTION sync_organogram()
RETURNS VOID AS $$
BEGIN
  -- Clear existing nodes
  DELETE FROM organogram_nodes
  WHERE business_id = (SELECT business_id FROM get_current_staff());
  
  -- Rebuild from reporting structure
  INSERT INTO organogram_nodes (business_id, staff_id, node_type, display_name, title, avatar_url, department, reporting_structure_id, parent_node_id)
  SELECT 
    rs.business_id,
    rs.staff_id,
    'person',
    s.full_name,
    rs.position_title,
    s.avatar_url,
    rs.department,
    rs.id,
    (SELECT id FROM organogram_nodes WHERE staff_id = rs.manager_id)
  FROM reporting_structure rs
  JOIN staff s ON s.id = rs.staff_id
  WHERE rs.business_id = (SELECT business_id FROM get_current_staff())
    AND rs.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- AUTO-POPULATE REPORTING STRUCTURE
-- ============================================
-- Create reporting entries for existing staff
INSERT INTO reporting_structure (business_id, staff_id, position_title, department, level)
SELECT 
  s.business_id,
  s.id,
  COALESCE(s.job_title, 'Team Member'),
  'General',
  CASE s.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END
FROM staff s
WHERE s.business_id = (SELECT id FROM businesses LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM reporting_structure WHERE staff_id = s.id)
ON CONFLICT DO NOTHING;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER reporting_structure_updated_at BEFORE UPDATE ON reporting_structure FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER organogram_nodes_updated_at BEFORE UPDATE ON organogram_nodes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER reporting_channels_updated_at BEFORE UPDATE ON reporting_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER escalation_paths_updated_at BEFORE UPDATE ON escalation_paths FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER performance_reviews_updated_at BEFORE UPDATE ON performance_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
