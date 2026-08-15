-- ============================================
-- OPERATIONAL BACKBONE
-- Complete business operations infrastructure
-- ============================================

-- ============================================
-- PART 1: ORGANIZATIONAL STRUCTURE
-- Departments, Teams, Positions, Reporting
-- ============================================

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT, -- Short code for display (e.g., "HR", "FIN")
  parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  head_id UUID REFERENCES staff(id) ON DELETE SET NULL, -- Department head
  color TEXT DEFAULT '#6366F1',
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_departments_business ON departments(business_id);
CREATE INDEX idx_departments_parent ON departments(parent_id);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  lead_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#10B981',
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_teams_business ON teams(business_id);
CREATE INDEX idx_teams_department ON teams(department_id);

-- Positions/Job Titles
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  level TEXT DEFAULT 'mid' CHECK (level IN ('entry', 'mid', 'senior', 'lead', 'manager', 'director', 'executive')),
  salary_min DECIMAL(15,2),
  salary_max DECIMAL(15,2),
  salary_currency TEXT DEFAULT 'NGN',
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positions_business ON positions(business_id);
CREATE INDEX idx_positions_department ON positions(department_id);

-- Staff Assignments (Department/Team/Position)
CREATE TABLE IF NOT EXISTS staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  role_in_dept TEXT DEFAULT 'member', -- head, lead, member
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  is_primary BOOLEAN DEFAULT FALSE, -- Primary assignment
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(staff_id, department_id, team_id, is_primary)
);

CREATE INDEX idx_assignments_staff ON staff_assignments(staff_id);
CREATE INDEX idx_assignments_dept ON staff_assignments(department_id);
CREATE INDEX idx_assignments_team ON staff_assignments(team_id);

-- ============================================
-- PART 2: LEAVE MANAGEMENT
-- Leave types, requests, balances, approvals
-- ============================================

-- Leave Types
CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Annual, Sick, Maternity, Paternity, Study, Unpaid
  code TEXT NOT NULL,
  color TEXT DEFAULT '#6366F1',
  icon TEXT,
  days_per_year INTEGER, -- NULL = unlimited
  days_carry_forward INTEGER DEFAULT 0, -- Days that can roll over
  carry_forward_expiry_months INTEGER, -- When carried days expire
  requires_approval BOOLEAN DEFAULT TRUE,
  requires_document BOOLEAN DEFAULT FALSE, -- Medical certificate, etc.
  is_paid BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leave Balances
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_days DECIMAL(5,1) DEFAULT 0,
  used_days DECIMAL(5,1) DEFAULT 0,
  pending_days DECIMAL(5,1) DEFAULT 0,
  carried_forward DECIMAL(5,1) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(staff_id, leave_type_id, year)
);

CREATE INDEX idx_balances_staff ON leave_balances(staff_id);
CREATE INDEX idx_balances_year ON leave_balances(year);

-- Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  
  -- Date range
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DECIMAL(5,1) NOT NULL,
  half_day BOOLEAN DEFAULT FALSE,
  half_day_period TEXT CHECK (half_day_period IN ('morning', 'afternoon')),
  
  -- Reason
  reason TEXT,
  document_url TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'escalated')),
  
  -- Approval tracking
  approved_by UUID REFERENCES staff(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Handover
  handover_notes TEXT,
  handover_to UUID REFERENCES staff(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leave_staff ON leave_requests(staff_id);
CREATE INDEX idx_leave_dates ON leave_requests(start_date, end_date);
CREATE INDEX idx_leave_status ON leave_requests(status);

-- Leave Request History
CREATE TABLE IF NOT EXISTS leave_request_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID REFERENCES leave_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- submitted, approved, rejected, cancelled, commented
  actor_id UUID REFERENCES staff(id),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PART 3: APPROVAL SYSTEM
-- Approval chains, templates, digital signatures
-- ============================================

-- Approval Templates
CREATE TABLE IF NOT EXISTS approval_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL, -- leave_request, expense_claim, invoice, requisition, etc.
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Conditions (JSONB for flexibility)
  conditions JSONB DEFAULT '[]', -- [{field: "amount", operator: "gt", value: 10000}]
  
  -- Steps (JSONB array)
  steps JSONB DEFAULT '[]', -- [{order: 1, approver_type: "manager", approver_id: null, step_name: "Manager Approval"}]
  
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approval_templates_entity ON approval_templates(entity_type);

-- Active Approvals
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES approval_templates(id) ON DELETE SET NULL,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  
  -- Requester
  requester_id UUID REFERENCES staff(id),
  
  -- Current status
  current_step INTEGER DEFAULT 1,
  total_steps INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'escalated')),
  
  -- Metadata
  amount DECIMAL(15,2),
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX idx_approvals_entity ON approvals(entity_type, entity_id);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_requester ON approvals(requester_id);

-- Approval Actions (Each step's action)
CREATE TABLE IF NOT EXISTS approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  
  -- Approver
  approver_id UUID REFERENCES staff(id),
  
  -- Action
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'request_info', 'delegate', 'escalate')),
  comment TEXT,
  
  -- Digital signature
  signature_url TEXT,
  signed_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_actions_approval ON approval_actions(approval_id);

-- Escalation Rules
CREATE TABLE IF NOT EXISTS escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES approval_templates(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  delay_hours INTEGER DEFAULT 24,
  action TEXT DEFAULT 'notify' CHECK (action IN ('notify', 'reassign', 'auto_approve', 'auto_reject')),
  escalate_to_id UUID REFERENCES staff(id),
  message TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- PART 4: BUDGET & FINANCE
-- Budgets, cost centers, expense claims
-- ============================================

-- Cost Centers
CREATE TABLE IF NOT EXISTS cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  parent_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'expense' CHECK (type IN ('revenue', 'expense', 'asset', 'liability')),
  manager_id UUID REFERENCES staff(id),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cost_centers_business ON cost_centers(business_id);

-- Budgets
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  period_type TEXT DEFAULT 'yearly' CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
  
  -- Amounts
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  allocated_amount DECIMAL(15,2) DEFAULT 0,
  spent_amount DECIMAL(15,2) DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'overbudget')),
  
  start_date DATE,
  end_date DATE,
  
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_budgets_business ON budgets(business_id);
CREATE INDEX idx_budgets_fiscal ON budgets(fiscal_year);

-- Budget Allocations
CREATE TABLE IF NOT EXISTS budget_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id UUID, -- expense category
  amount DECIMAL(15,2) NOT NULL,
  description TEXT
);

-- Budget Transactions
CREATE TABLE IF NOT EXISTS budget_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('allocation', 'expense', 'reallocation', 'adjustment')),
  reference_type TEXT, -- invoice, expense_claim, etc.
  reference_id UUID,
  description TEXT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expense Categories
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  parent_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  max_amount DECIMAL(15,2), -- Optional spending limit
  requires_receipt BOOLEAN DEFAULT TRUE,
  requires_approval BOOLEAN DEFAULT TRUE,
  approval_threshold DECIMAL(15,2), -- Amount above which approval is required
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expense Claims
CREATE TABLE IF NOT EXISTS expense_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT DEFAULT 'NGN',
  
  category_id UUID REFERENCES expense_categories(id),
  description TEXT NOT NULL,
  
  -- Receipt
  receipt_urls TEXT[] DEFAULT '{}',
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'reimbursed', 'cancelled')),
  
  -- Approval
  approval_id UUID REFERENCES approvals(id),
  
  -- Reimbursement
  reimbursed_at TIMESTAMPTZ,
  reimbursed_by UUID REFERENCES staff(id),
  payment_reference TEXT,
  
  -- Date
  expense_date DATE NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expense_staff ON expense_claims(staff_id);
CREATE INDEX idx_expense_status ON expense_claims(status);
CREATE INDEX idx_expense_date ON expense_claims(expense_date);

-- ============================================
-- PART 5: ASSET MANAGEMENT
-- Assets, maintenance, tracking
-- ============================================

-- Asset Categories
CREATE TABLE IF NOT EXISTS asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  parent_id UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
  depreciation_method TEXT DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line', 'declining', 'units_of_production')),
  default_life_years INTEGER DEFAULT 5,
  default_residual_value DECIMAL(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
  
  name TEXT NOT NULL,
  description TEXT,
  serial_number TEXT,
  barcode TEXT,
  
  -- Purchase info
  purchase_date DATE,
  purchase_cost DECIMAL(15,2),
  supplier TEXT,
  invoice_reference TEXT,
  
  -- Current value
  current_value DECIMAL(15,2),
  residual_value DECIMAL(15,2) DEFAULT 0,
  depreciation_method TEXT DEFAULT 'straight_line',
  useful_life_years INTEGER DEFAULT 5,
  depreciation_rate DECIMAL(5,2), -- Annual depreciation rate
  
  -- Location
  location TEXT,
  location_details TEXT,
  
  -- Assignment
  assigned_to UUID REFERENCES staff(id),
  assigned_date DATE,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'in_maintenance', 'retired', 'disposed', 'lost', 'stolen')),
  
  -- Warranty
  warranty_expiry DATE,
  warranty_details TEXT,
  
  -- Image
  image_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assets_business ON assets(business_id);
CREATE INDEX idx_assets_category ON assets(category_id);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_assigned ON assets(assigned_to);

-- Asset Depreciation Records
CREATE TABLE IF NOT EXISTS asset_depreciation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT DEFAULT 'monthly',
  opening_value DECIMAL(15,2) NOT NULL,
  depreciation_amount DECIMAL(15,2) NOT NULL,
  closing_value DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maintenance Records
CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  
  type TEXT NOT NULL CHECK (type IN ('preventive', 'corrective', 'inspection', 'upgrade')),
  title TEXT NOT NULL,
  description TEXT,
  
  -- Scheduling
  scheduled_date DATE,
  completed_date DATE,
  
  -- Cost
  cost DECIMAL(15,2) DEFAULT 0,
  vendor TEXT,
  invoice_reference TEXT,
  
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'overdue')),
  
  -- Performed by
  performed_by UUID REFERENCES staff(id),
  external_vendor TEXT,
  
  -- Next maintenance
  next_maintenance_date DATE,
  next_maintenance_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maintenance Schedule
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  
  type TEXT DEFAULT 'preventive',
  interval_days INTEGER NOT NULL, -- Every X days
  interval_usage_hours INTEGER, -- Or every X usage hours
  
  last_performed DATE,
  next_due DATE,
  next_due_usage_hours INTEGER,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asset Assignments History
CREATE TABLE IF NOT EXISTS asset_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  assigned_date DATE NOT NULL,
  returned_date DATE,
  condition_on_return TEXT,
  notes TEXT,
  assigned_by UUID REFERENCES staff(id)
);

-- ============================================
-- PART 6: ANNOUNCEMENTS & COMMUNICATION
-- Company-wide notices, templates
-- ============================================

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- HTML content
  content_text TEXT, -- Plain text version
  
  -- Targeting
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'department', 'team', 'role', 'individual')),
  target_ids UUID[] DEFAULT '{}', -- Array of department/team/staff IDs
  target_roles TEXT[] DEFAULT '{}', -- Array of roles
  
  -- Display
  is_pinned BOOLEAN DEFAULT FALSE,
  is_dismissible BOOLEAN DEFAULT TRUE,
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ, -- NULL = no expiry
  color TEXT DEFAULT '#6366F1',
  icon TEXT,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  
  -- Stats
  view_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_announcements_business ON announcements(business_id);
CREATE INDEX idx_announcements_status ON announcements(status);
CREATE INDEX idx_announcements_dates ON announcements(start_date, end_date);

-- Announcement Views
CREATE TABLE IF NOT EXISTS announcement_views (
  announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  
  PRIMARY KEY (announcement_id, staff_id)
);

-- Email Templates
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'welcome', 'invoice', 'quote', 'reminder', 'notification', 'leave', 'expense', 'approval', 'marketing')),
  
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT, -- Plain text version
  
  -- Variables
  variables JSONB DEFAULT '[]', -- [{key: "{{name}}", description: "Recipient name"}]
  
  -- Settings
  from_name TEXT,
  from_email TEXT,
  reply_to TEXT,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_templates_category ON email_templates(category);

-- Email Template Variables (for common templates)
CREATE TABLE IF NOT EXISTS email_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES email_templates(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  source TEXT, -- 'static', 'staff', 'business', 'entity'
  source_field TEXT -- Field to pull from source
);

-- ============================================
-- PART 7: RESOURCE BOOKING
-- Rooms, equipment, appointments
-- ============================================

-- Resources (Rooms, Equipment, Vehicles)
CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('room', 'equipment', 'vehicle', 'facility', 'other')),
  category TEXT,
  
  -- Capacity (for rooms)
  capacity INTEGER,
  size_sqm DECIMAL(10,2),
  
  -- Location
  location TEXT,
  floor TEXT,
  building TEXT,
  
  -- Features/Amenities
  amenities TEXT[] DEFAULT '{}', -- ['projector', 'whiteboard', 'wifi']
  
  -- Image
  image_url TEXT,
  
  -- Booking settings
  requires_approval BOOLEAN DEFAULT FALSE,
  max_booking_duration_hours INTEGER, -- NULL = unlimited
  buffer_minutes INTEGER DEFAULT 0, -- Gap between bookings
  
  -- Availability
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Cost
  hourly_rate DECIMAL(10,2), -- If billable
  currency TEXT DEFAULT 'NGN',
  
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resources_business ON resources(business_id);
CREATE INDEX idx_resources_type ON resources(type);
CREATE INDEX idx_resources_active ON resources(is_active);

-- Resource Availability Rules
CREATE TABLE IF NOT EXISTS resource_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  
  effective_from DATE,
  effective_to DATE
);

-- Resource Bookings
CREATE TABLE IF NOT EXISTS resource_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  booked_by UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  
  title TEXT,
  description TEXT,
  
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (end_time - start_time)) / 60) STORED,
  is_all_day BOOLEAN DEFAULT FALSE,
  
  -- Recurrence
  recurrence_rule TEXT, -- RRULE format
  recurrence_parent_id UUID REFERENCES resource_bookings(id),
  
  -- Status
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('tentative', 'confirmed', 'cancelled')),
  
  -- Approval
  approval_id UUID REFERENCES approvals(id),
  
  -- Attendees (for rooms)
  attendees UUID[] DEFAULT '{}',
  attendee_count INTEGER,
  
  -- Meeting details
  meeting_link TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_resource ON resource_bookings(resource_id);
CREATE INDEX idx_bookings_time ON resource_bookings(start_time, end_time);
CREATE INDEX idx_bookings_status ON resource_bookings(status);

-- Booking Conflicts (for conflict detection)
CREATE TABLE IF NOT EXISTS booking_conflicts (
  booking_id UUID REFERENCES resource_bookings(id) ON DELETE CASCADE,
  conflicting_booking_id UUID REFERENCES resource_bookings(id) ON DELETE CASCADE,
  conflict_type TEXT, -- 'overlap', 'double_booking'
  
  PRIMARY KEY (booking_id, conflicting_booking_id)
);

-- ============================================
-- PART 8: ATTENDANCE
-- Check-in/out, tracking, geo-fence
-- ============================================

-- Attendance Settings
CREATE TABLE IF NOT EXISTS attendance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  
  work_start_time TIME DEFAULT '08:00',
  work_end_time TIME DEFAULT '17:00',
  work_days INTEGER[] DEFAULT '{1,2,3,4,5}', -- Mon-Fri
  
  -- Late threshold (minutes)
  late_threshold_minutes INTEGER DEFAULT 15,
  
  -- Geo-fencing
  geo_fencing_enabled BOOLEAN DEFAULT FALSE,
  geo_fence_radius_meters INTEGER DEFAULT 100,
  geo_fence_centers JSONB DEFAULT '[]', -- [{lat, lng, name, radius}]
  
  -- Auto-detection
  auto_check_out_enabled BOOLEAN DEFAULT TRUE,
  auto_check_out_hours INTEGER DEFAULT 12, -- Hours after check-in to auto-check-out
  
  -- Half day
  half_day_minutes INTEGER DEFAULT 240, -- 4 hours minimum for half day
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance Records
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  
  -- Check in/out
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  work_hours DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN check_in IS NOT NULL AND check_out IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (check_out - check_in)) / 3600 
      ELSE 0 
    END
  ) STORED,
  
  -- Status
  status TEXT DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'half_day', 'on_leave', 'holiday', 'weekend', 'remote')),
  
  -- Location
  check_in_lat DECIMAL(10,8),
  check_in_lng DECIMAL(11,8),
  check_in_location TEXT,
  check_out_lat DECIMAL(10,8),
  check_out_lng DECIMAL(11,8),
  check_out_location TEXT,
  
  -- Geo-fence status
  check_in_within_geo_fence BOOLEAN,
  
  -- Device info
  check_in_device TEXT,
  check_out_device TEXT,
  
  -- Notes
  notes TEXT,
  
  -- Flags
  is_auto_check_out BOOLEAN DEFAULT FALSE,
  is_manual_adjustment BOOLEAN DEFAULT FALSE,
  adjusted_by UUID REFERENCES staff(id),
  adjustment_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(staff_id, date)
);

CREATE INDEX idx_attendance_staff ON attendance_records(staff_id);
CREATE INDEX idx_attendance_date ON attendance_records(date);
CREATE INDEX idx_attendance_status ON attendance_records(status);

-- Attendance Summary (Monthly)
CREATE TABLE IF NOT EXISTS attendance_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  
  -- Counts
  total_days INTEGER DEFAULT 0,
  present_days INTEGER DEFAULT 0,
  absent_days INTEGER DEFAULT 0,
  late_days INTEGER DEFAULT 0,
  half_days INTEGER DEFAULT 0,
  leave_days INTEGER DEFAULT 0,
  holiday_days INTEGER DEFAULT 0,
  
  -- Hours
  total_work_hours DECIMAL(10,2) DEFAULT 0,
  average_work_hours DECIMAL(5,2) DEFAULT 0,
  
  -- On time
  on_time_days INTEGER DEFAULT 0,
  on_time_percentage DECIMAL(5,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(staff_id, year, month)
);

CREATE INDEX idx_attendance_summary_staff ON attendance_summary(staff_id);
CREATE INDEX idx_attendance_summary_period ON attendance_summary(year, month);

-- ============================================
-- HELPER FUNCTIONS & TRIGGERS
-- ============================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leave_balances_updated_at BEFORE UPDATE ON leave_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_approvals_updated_at BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON budgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expense_claims_updated_at BEFORE UPDATE ON expense_claims FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maintenance_records_updated_at BEFORE UPDATE ON maintenance_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_resource_bookings_updated_at BEFORE UPDATE ON resource_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attendance_records_updated_at BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attendance_summary_updated_at BEFORE UPDATE ON attendance_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all new tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_request_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_depreciation ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_summary ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is in business
CREATE OR REPLACE FUNCTION user_in_business(p_business_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM staff 
    WHERE staff.user_id = auth.uid() 
    AND staff.business_id = p_business_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION user_is_admin(p_business_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM staff 
    WHERE staff.user_id = auth.uid() 
    AND staff.business_id = p_business_id
    AND staff.role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Departments
CREATE POLICY "Business staff can view departments"
  ON departments FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage departments"
  ON departments FOR ALL
  USING (user_is_admin(business_id));

-- Teams
CREATE POLICY "Business staff can view teams"
  ON teams FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage teams"
  ON teams FOR ALL
  USING (user_is_admin(business_id));

-- Positions
CREATE POLICY "Business staff can view positions"
  ON positions FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage positions"
  ON positions FOR ALL
  USING (user_is_admin(business_id));

-- Staff Assignments
CREATE POLICY "Business staff can view own assignments"
  ON staff_assignments FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage assignments"
  ON staff_assignments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM staff s 
    WHERE s.id = staff_assignments.staff_id 
    AND s.business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ));

-- Leave Types
CREATE POLICY "Business staff can view leave types"
  ON leave_types FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage leave types"
  ON leave_types FOR ALL
  USING (user_is_admin(business_id));

-- Leave Balances
CREATE POLICY "Staff can view own balances"
  ON leave_balances FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage balances"
  ON leave_balances FOR ALL
  USING (EXISTS (
    SELECT 1 FROM staff s 
    WHERE s.id = leave_balances.staff_id 
    AND s.business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ));

-- Leave Requests
CREATE POLICY "Staff can view own leave requests"
  ON leave_requests FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff can create leave requests"
  ON leave_requests FOR INSERT
  WITH CHECK (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff can update own pending requests"
  ON leave_requests FOR UPDATE
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()) AND status = 'pending');
CREATE POLICY "Admins can manage all leave requests"
  ON leave_requests FOR ALL
  USING (EXISTS (
    SELECT 1 FROM staff s 
    WHERE s.id = leave_requests.staff_id 
    AND s.business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ));

-- Approvals
CREATE POLICY "Staff can view approvals they're involved in"
  ON approvals FOR SELECT
  USING (
    requester_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM approval_actions aa 
      WHERE aa.approval_id = approvals.id AND aa.approver_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM staff s 
      WHERE s.id = approvals.requester_id 
      AND s.business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
    )
  );
CREATE POLICY "Staff can create approvals"
  ON approvals FOR INSERT WITH CHECK (user_is_admin(business_id) OR requester_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff can update approvals they're involved in"
  ON approvals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM approval_actions aa 
      WHERE aa.approval_id = approvals.id AND aa.approver_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    )
    OR user_is_admin(business_id)
  );

-- Approval Templates
CREATE POLICY "Business staff can view approval templates"
  ON approval_templates FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage templates"
  ON approval_templates FOR ALL
  USING (user_is_admin(business_id));

-- Budgets
CREATE POLICY "Business staff can view budgets"
  ON budgets FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage budgets"
  ON budgets FOR ALL
  USING (user_is_admin(business_id));

-- Expense Claims
CREATE POLICY "Staff can view own expenses"
  ON expense_claims FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff can create own expenses"
  ON expense_claims FOR INSERT
  WITH CHECK (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff can update own pending expenses"
  ON expense_claims FOR UPDATE
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()) AND status = 'draft');
CREATE POLICY "Admins can manage all expenses"
  ON expense_claims FOR ALL
  USING (user_is_admin(business_id));

-- Assets
CREATE POLICY "Business staff can view assets"
  ON assets FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage assets"
  ON assets FOR ALL
  USING (user_is_admin(business_id));

-- Maintenance Records
CREATE POLICY "Business staff can view maintenance"
  ON maintenance_records FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM assets a 
    WHERE a.id = maintenance_records.asset_id 
    AND user_in_business(a.business_id)
  ));
CREATE POLICY "Admins can manage maintenance"
  ON maintenance_records FOR ALL
  USING (EXISTS (
    SELECT 1 FROM assets a 
    WHERE a.id = maintenance_records.asset_id 
    AND user_is_admin(a.business_id)
  ));

-- Announcements
CREATE POLICY "Staff can view announcements"
  ON announcements FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Staff can create announcements"
  ON announcements FOR INSERT WITH CHECK (user_is_admin(business_id));
CREATE POLICY "Authors can update own announcements"
  ON announcements FOR UPDATE
  USING (author_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage all announcements"
  ON announcements FOR ALL
  USING (user_is_admin(business_id));

-- Announcement Views
CREATE POLICY "Staff can manage own views"
  ON announcement_views FOR ALL
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Email Templates
CREATE POLICY "Business staff can view templates"
  ON email_templates FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage templates"
  ON email_templates FOR ALL
  USING (user_is_admin(business_id));

-- Resources
CREATE POLICY "Business staff can view resources"
  ON resources FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage resources"
  ON resources FOR ALL
  USING (user_is_admin(business_id));

-- Resource Bookings
CREATE POLICY "Staff can view own bookings"
  ON resource_bookings FOR SELECT
  USING (booked_by IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff can create bookings"
  ON resource_bookings FOR INSERT
  WITH CHECK (booked_by IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff can manage own bookings"
  ON resource_bookings FOR UPDATE
  USING (booked_by IN (SELECT id FROM staff WHERE user_id = auth.uid()) AND status != 'cancelled');
CREATE POLICY "Admins can manage all bookings"
  ON resource_bookings FOR ALL
  USING (user_is_admin(EXISTS (
    SELECT business_id FROM resources WHERE id = resource_bookings.resource_id
  )));

-- Attendance Settings
CREATE POLICY "Staff can view attendance settings"
  ON attendance_settings FOR SELECT
  USING (user_in_business(business_id));
CREATE POLICY "Admins can manage settings"
  ON attendance_settings FOR ALL
  USING (user_is_admin(business_id));

-- Attendance Records
CREATE POLICY "Staff can view own attendance"
  ON attendance_records FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff can check in/out"
  ON attendance_records FOR INSERT
  WITH CHECK (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff can update own records"
  ON attendance_records FOR UPDATE
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage all attendance"
  ON attendance_records FOR ALL
  USING (user_is_admin(business_id));

-- Attendance Summary
CREATE POLICY "Staff can view own summary"
  ON attendance_summary FOR SELECT
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Admins can view all summaries"
  ON attendance_summary FOR SELECT
  USING (user_is_admin(business_id));

-- ============================================
-- SEED DATA
-- ============================================

-- Default Leave Types (will be created per business)
-- These will be inserted when a business is created via a trigger

-- Default Expense Categories
INSERT INTO expense_categories (business_id, name, code, requires_receipt, requires_approval, approval_threshold)
SELECT 
  id, 
  unnest(ARRAY['Travel', 'Meals', 'Accommodation', 'Office Supplies', 'Transportation', 'Communication', 'Equipment', 'Training', 'Entertainment', 'Other']),
  unnest(ARRAY['TRAVEL', 'MEALS', 'ACCOM', 'SUPPLIES', 'TRANSPORT', 'COMM', 'EQUIP', 'TRAINING', 'ENTERTAIN', 'OTHER']),
  TRUE,
  TRUE,
  10000
FROM businesses
ON CONFLICT DO NOTHING;

-- Default Asset Categories
INSERT INTO asset_categories (business_id, name, code)
SELECT 
  id,
  unnest(ARRAY['Office Equipment', 'IT Hardware', 'Furniture', 'Vehicles', 'Machinery', 'Tools']),
  unnest(ARRAY['OFFICE', 'IT', 'FURNITURE', 'VEHICLE', 'MACHINERY', 'TOOLS'])
FROM businesses
ON CONFLICT DO NOTHING;


-- ============================================
-- MERGED from 039_property_management.sql (was a duplicate-numbered sibling)
-- ============================================

-- Migration: Property & Real Estate Management
-- Core property management tables for real estate businesses

-- ============================================
-- PROPERTY LISTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Property Details
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT NOT NULL CHECK (property_type IN (
    'residential', 'commercial', 'land', 'industrial', 'mixed_use'
  )),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('sale', 'rent', 'both')),
  -- Location
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT DEFAULT 'Nigeria',
  postal_code TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  -- Property Specs
  bedrooms INTEGER,
  bathrooms INTEGER,
  parking_spaces INTEGER,
  total_area_sqm DECIMAL(12, 2),
  furnished BOOLEAN DEFAULT FALSE,
  -- Pricing
  price DECIMAL(15, 2), -- Sale price
  rent_amount DECIMAL(15, 2), -- Monthly rent
  price_type TEXT CHECK (price_type IN ('fixed', 'negotiable', 'per_sqm')),
  -- Status
  status TEXT DEFAULT 'available' CHECK (status IN (
    'available', 'under_offer', 'sold', 'rented', 'withdrawn', 'pending'
  )),
  -- Media
  images JSONB DEFAULT '[]'::jsonb,
  documents JSONB DEFAULT '[]'::jsonb,
  -- Agent/Owner
  assigned_agent_id UUID REFERENCES staff(id),
  owner_id UUID REFERENCES clients(id),
  -- Commission
  commission_rate DECIMAL(5, 2), -- Percentage
  commission_fixed DECIMAL(15, 2),
  -- SEO
  slug TEXT UNIQUE,
  meta_title TEXT,
  meta_description TEXT,
  -- Timestamps
  listed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Properties are viewable by business" ON properties
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Properties are manageable by business" ON properties
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_properties_business ON properties(business_id);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_listing ON properties(listing_type);
CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(city, state);

CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- PROPERTY ENQUIRIES
-- ============================================
CREATE TABLE IF NOT EXISTS property_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Contact Info
  client_id UUID REFERENCES clients(id),
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  -- Enquiry Details
  enquiry_type TEXT CHECK (enquiry_type IN ('viewing', 'purchase', 'rental', 'information')),
  message TEXT,
  preferred_date DATE,
  preferred_time TIME,
  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'viewing_scheduled', 'qualified', 'lost')),
  notes TEXT,
  assigned_to UUID REFERENCES staff(id),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE property_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enquiries viewable by business" ON property_enquiries
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Enquiries manageable by business" ON property_enquiries
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE INDEX IF NOT EXISTS idx_enquiries_property ON property_enquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON property_enquiries(status);

-- ============================================
-- LEASE AGREEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS lease_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Parties
  landlord_id UUID REFERENCES clients(id), -- Owner
  tenant_id UUID NOT NULL REFERENCES clients(id),
  -- Lease Terms
  lease_type TEXT CHECK (lease_type IN ('residential', 'commercial', 'land', 'short_term')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_months INTEGER,
  -- Rent
  monthly_rent DECIMAL(15, 2) NOT NULL,
  rent_due_day INTEGER DEFAULT 1, -- Day of month rent is due
  security_deposit DECIMAL(15, 2),
  advance_months INTEGER DEFAULT 1,
  -- Terms
  terms_conditions TEXT,
  renewal_option BOOLEAN DEFAULT FALSE,
  pet_policy TEXT,
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_signature', 'active', 'renewed', 'terminated', 'expired'
  )),
  -- Payment
  next_rent_due DATE,
  -- Timestamps
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lease_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leases viewable by business" ON lease_agreements
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Leases manageable by business" ON lease_agreements
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE INDEX IF NOT EXISTS idx_leases_property ON lease_agreements(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON lease_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON lease_agreements(status);

CREATE TRIGGER leases_updated_at BEFORE UPDATE ON lease_agreements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RENT PAYMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS rent_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES lease_agreements(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES clients(id),
  -- Payment Details
  amount DECIMAL(15, 2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  -- Payment Info
  paid_date DATE,
  payment_method TEXT,
  reference_number TEXT,
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'paid', 'partial', 'overdue', 'waived'
  )),
  late_fee DECIMAL(15, 2) DEFAULT 0,
  notes TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rent_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rent payments viewable by business" ON rent_payments
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Rent payments manageable by business" ON rent_payments
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE INDEX IF NOT EXISTS idx_rent_lease ON rent_payments(lease_id);
CREATE INDEX IF NOT EXISTS idx_rent_tenant ON rent_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_status ON rent_payments(status);
CREATE INDEX IF NOT EXISTS idx_rent_due ON rent_payments(due_date);

-- ============================================
-- PROPERTY MAINTENANCE
-- ============================================
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id UUID REFERENCES lease_agreements(id),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Reporter
  reported_by UUID REFERENCES clients(id),
  assigned_to UUID REFERENCES staff(id),
  -- Issue Details
  category TEXT CHECK (category IN (
    'plumbing', 'electrical', 'structural', 'hvac', 'appliances',
    'pest_control', 'cleaning', 'landscaping', 'security', 'other'
  )),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,
  -- Status
  status TEXT DEFAULT 'reported' CHECK (status IN (
    'reported', 'assigned', 'in_progress', 'pending_parts', 'completed', 'cancelled'
  )),
  -- Resolution
  resolution_notes TEXT,
  completed_at TIMESTAMPTZ,
  cost DECIMAL(15, 2),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Maintenance viewable by business" ON maintenance_requests
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Maintenance manageable by business" ON maintenance_requests
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE INDEX IF NOT EXISTS idx_maintenance_property ON maintenance_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_priority ON maintenance_requests(priority);

CREATE TRIGGER maintenance_updated_at BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- PROPERTY INSPECTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS property_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id UUID REFERENCES lease_agreements(id),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Inspector
  inspector_id UUID REFERENCES staff(id),
  -- Inspection Details
  inspection_type TEXT CHECK (inspection_type IN (
    'move_in', 'move_out', 'routine', 'quarterly', 'annual'
  )),
  scheduled_date TIMESTAMPTZ NOT NULL,
  completed_date TIMESTAMPTZ,
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'in_progress', 'completed', 'cancelled'
  )),
  -- Report
  condition_rating TEXT CHECK (condition_rating IN ('excellent', 'good', 'fair', 'poor')),
  findings TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  recommendations TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE property_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inspections viewable by business" ON property_inspections
  FOR SELECT USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE POLICY "Inspections manageable by business" ON property_inspections
  FOR ALL USING (business_id = (
    SELECT business_id FROM staff WHERE id = current_setting('request.jwt.claims', true)::jsonb->>'staff_id'
  ));

CREATE INDEX IF NOT EXISTS idx_inspections_property ON property_inspections(property_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON property_inspections(status);

-- ============================================
-- FUNCTION: Auto-update property status
-- ============================================
CREATE OR REPLACE FUNCTION update_property_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if there's an active lease
  IF EXISTS (
    SELECT 1 FROM lease_agreements
    WHERE property_id = NEW.property_id
    AND status = 'active'
    AND end_date > CURRENT_DATE
  ) THEN
    UPDATE properties SET status = 'rented' WHERE id = NEW.property_id;
  -- Check if there's a pending sale
  ELSIF EXISTS (
    SELECT 1 FROM properties
    WHERE id = NEW.property_id
    AND listing_type IN ('sale', 'both')
    AND status = 'under_offer'
  ) THEN
    -- Keep as under_offer
    NULL;
  ELSE
    UPDATE properties SET status = 'available' WHERE id = NEW.property_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_property_on_lease_change
  AFTER INSERT OR UPDATE OR DELETE ON lease_agreements
  FOR EACH ROW EXECUTE FUNCTION update_property_status();

-- ============================================
-- FUNCTION: Generate property slug
-- ============================================
CREATE OR REPLACE FUNCTION generate_property_slug(title TEXT, business_id UUID)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Create base slug from title
  base_slug := lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;
  
  -- Check for existing slugs
  WHILE EXISTS (
    SELECT 1 FROM properties 
    WHERE slug = final_slug AND business_id = generate_property_slug.business_id
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Audit logging for property changes
-- ============================================
INSERT INTO audit_logs (business_id, action, entity_type, entity_id, new_values)
SELECT 
  business_id,
  'create',
  'property',
  id,
  jsonb_build_object('title', title, 'listing_type', listing_type, 'price', price)
FROM properties WHERE id IN (SELECT id FROM properties);
