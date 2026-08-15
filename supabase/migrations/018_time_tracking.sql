-- AVENIZE Layer 1 - Time Tracking & Task Management
-- Time entries, time blocks, productivity tracking

-- ============================================
-- TIME ENTRIES
-- ============================================
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  task_id UUID REFERENCES tasks(id), -- Optional link to task
  project_id UUID REFERENCES projects(id),
  -- Entry details
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN end_time IS NOT NULL THEN 
      EXTRACT(EPOCH FROM (end_time - start_time)) / 60 
    ELSE NULL 
    END
  ) STORED,
  -- Manual entry
  is_manual BOOLEAN DEFAULT FALSE,
  manual_minutes INTEGER, -- For manual entries without start/end
  -- Billing
  billable BOOLEAN DEFAULT TRUE,
  hourly_rate NUMERIC,
  -- Tags
  tags TEXT[] DEFAULT '{}',
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'discarded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TIME BLOCKS (recurring time allocations)
-- ============================================
CREATE TABLE IF NOT EXISTS time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  name TEXT NOT NULL,
  description TEXT,
  -- Time block
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  days_of_week INTEGER[] DEFAULT '{1,2,3,4,5}', -- 1=Monday, 7=Sunday
  -- Recurrence
  start_date DATE NOT NULL,
  end_date DATE, -- NULL = indefinite
  -- Link to task/project
  task_id UUID REFERENCES tasks(id),
  project_id UUID REFERENCES projects(id),
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DAILY TIME SUMMARIES
-- ============================================
CREATE TABLE IF NOT EXISTS daily_time_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  date DATE NOT NULL,
  -- Totals
  total_minutes INTEGER DEFAULT 0,
  billable_minutes INTEGER DEFAULT 0,
  non_billable_minutes INTEGER DEFAULT 0,
  -- Breakdown
  project_breakdown JSONB DEFAULT '{}', -- {project_id: minutes}
  task_breakdown JSONB DEFAULT '{}', -- {task_id: minutes}
  -- Goals
  target_minutes INTEGER DEFAULT 480, -- 8 hours default
  goal_met BOOLEAN GENERATED ALWAYS AS (total_minutes >= target_minutes) STORED,
  -- Overtime
  overtime_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN total_minutes > target_minutes THEN total_minutes - target_minutes ELSE 0 END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, date)
);

-- ============================================
-- TIME OFF / LEAVE
-- ============================================
CREATE TABLE IF NOT EXISTS time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  -- Leave details
  leave_type TEXT NOT NULL CHECK (leave_type IN (
    'vacation', 'sick', 'personal', 'bereavement', 'parental', 'unpaid', 'other'
  )),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT,
  -- Approval
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  approved_by UUID REFERENCES staff(id),
  approved_at TIMESTAMPTZ,
  denial_reason TEXT,
  -- Partial day
  start_half BOOLEAN DEFAULT FALSE, -- Morning only
  end_half BOOLEAN DEFAULT FALSE, -- Afternoon only
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_time_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;

-- Time entries: own entries, or managers see all
CREATE POLICY "Time entries view own"
  ON time_entries FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Time entries view business"
  ON time_entries FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

CREATE POLICY "Time entries manage"
  ON time_entries FOR ALL
  USING (
    staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    OR business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager'))
  );

-- Time blocks: own blocks
CREATE POLICY "Time blocks view"
  ON time_blocks FOR SELECT
  USING (
    staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    OR business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager'))
  );

CREATE POLICY "Time blocks manage"
  ON time_blocks FOR ALL
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Daily summaries: own or manager
CREATE POLICY "Daily summaries view"
  ON daily_time_summaries FOR SELECT
  USING (
    staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    OR business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager'))
  );

-- Time off: own requests, or managers approve
CREATE POLICY "Time off view own"
  ON time_off_requests FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Time off view business"
  ON time_off_requests FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

CREATE POLICY "Time off create"
  ON time_off_requests FOR INSERT
  WITH CHECK (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Time off update"
  ON time_off_requests FOR UPDATE
  USING (
    staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    OR business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager'))
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Start time tracking
CREATE OR REPLACE FUNCTION start_time_tracking(
  p_description TEXT DEFAULT NULL,
  p_task_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_entry_id UUID;
BEGIN
  -- Stop any active entries first
  UPDATE time_entries 
  SET status = 'stopped', end_time = NOW()
  WHERE staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())
    AND status = 'active';
  
  -- Create new entry
  INSERT INTO time_entries (business_id, staff_id, task_id, project_id, description, tags)
  VALUES (
    (SELECT business_id FROM get_current_staff()),
    (SELECT id FROM staff WHERE user_id = auth.uid()),
    p_task_id, p_project_id, p_description, p_tags
  )
  RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stop time tracking
CREATE OR REPLACE FUNCTION stop_time_tracking()
RETURNS INTEGER AS $$
DECLARE
  v_duration INTEGER;
BEGIN
  UPDATE time_entries
  SET status = 'stopped', end_time = NOW()
  WHERE staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())
    AND status = 'active'
  RETURNING EXTRACT(EPOCH FROM (NOW() - start_time)) / 60 INTO v_duration;
  
  RETURN COALESCE(v_duration, 0)::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get active time entry
CREATE OR REPLACE FUNCTION get_active_time_entry()
RETURNS time_entries AS $$
DECLARE result time_entries;
BEGIN
  SELECT * INTO result FROM time_entries
  WHERE staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())
    AND status = 'active'
  LIMIT 1;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add manual time entry
CREATE OR REPLACE FUNCTION add_manual_time_entry(
  p_description TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_billable BOOLEAN DEFAULT TRUE,
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_entry_id UUID;
BEGIN
  INSERT INTO time_entries (
    business_id, staff_id, description, start_time, end_time, is_manual, billable, tags, status
  )
  VALUES (
    (SELECT business_id FROM get_current_staff()),
    (SELECT id FROM staff WHERE user_id = auth.uid()),
    p_description, p_start_time, p_end_time, TRUE, p_billable, p_tags, 'stopped'
  )
  RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get time entries for date range
CREATE OR REPLACE FUNCTION get_time_entries_range(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  id UUID,
  description TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  billable BOOLEAN,
  tags TEXT[],
  task_title TEXT,
  project_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    te.id, te.description, te.start_time, te.end_time, 
    te.duration_minutes::INTEGER, te.billable, te.tags,
    t.title as task_title,
    p.name as project_name
  FROM time_entries te
  LEFT JOIN tasks t ON t.id = te.task_id
  LEFT JOIN projects p ON p.id = te.project_id
  WHERE te.staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())
    AND DATE(te.start_time) BETWEEN p_start_date AND p_end_date
    AND te.status = 'stopped'
  ORDER BY te.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update daily summary (called by trigger or scheduled job)
CREATE OR REPLACE FUNCTION update_daily_summary(p_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
BEGIN
  INSERT INTO daily_time_summaries (business_id, staff_id, date, total_minutes, billable_minutes, non_billable_minutes)
  SELECT 
    te.business_id,
    te.staff_id,
    p_date,
    COALESCE(SUM(te.duration_minutes), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN te.billable THEN te.duration_minutes ELSE 0 END), 0)::INTEGER,
    COALESCE(SUM(CASE WHEN NOT te.billable THEN te.duration_minutes ELSE 0 END), 0)::INTEGER
  FROM time_entries te
  WHERE DATE(te.start_time) = p_date AND te.status = 'stopped'
  GROUP BY te.business_id, te.staff_id
  ON CONFLICT (staff_id, date) DO UPDATE SET
    total_minutes = EXCLUDED.total_minutes,
    billable_minutes = EXCLUDED.billable_minutes,
    non_billable_minutes = EXCLUDED.non_billable_minutes,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Request time off
CREATE OR REPLACE FUNCTION request_time_off(
  p_leave_type TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_request_id UUID;
BEGIN
  INSERT INTO time_off_requests (
    business_id, staff_id, leave_type, start_date, end_date, total_days, reason
  )
  VALUES (
    (SELECT business_id FROM get_current_staff()),
    (SELECT id FROM staff WHERE user_id = auth.uid()),
    p_leave_type, p_start_date, p_end_date,
    p_end_date - p_start_date + 1,
    p_reason
  )
  RETURNING id INTO v_request_id;
  
  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Approve time off
CREATE OR REPLACE FUNCTION approve_time_off(p_request_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE time_off_requests
  SET status = 'approved',
      approved_by = (SELECT id FROM staff WHERE user_id = auth.uid()),
      approved_at = NOW()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Deny time off
CREATE OR REPLACE FUNCTION deny_time_off(p_request_id UUID, p_reason TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE time_off_requests
  SET status = 'denied',
      denial_reason = p_reason
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER time_entries_updated_at BEFORE UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER time_blocks_updated_at BEFORE UPDATE ON time_blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER daily_time_summaries_updated_at BEFORE UPDATE ON daily_time_summaries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER time_off_requests_updated_at BEFORE UPDATE ON time_off_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
