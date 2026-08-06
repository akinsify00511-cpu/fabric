-- ============================================
-- HR EXTENSIONS: Leave, Attendance, Performance, Recruitment
-- ============================================

-- Leave Types
CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days_per_year INTEGER DEFAULT 0,
  is_paid BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Staff Leave Balances
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_days NUMERIC(5,1) DEFAULT 0,
  used_days NUMERIC(5,1) DEFAULT 0,
  pending_days NUMERIC(5,1) DEFAULT 0,
  UNIQUE(staff_id, leave_type_id, year)
);

-- Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested NUMERIC(5,1) NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by UUID REFERENCES staff(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Attendance Records
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  status TEXT DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'half_day', 'on_leave')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(staff_id, date)
);

-- Performance Reviews
CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES staff(id),
  review_period TEXT, -- e.g., "Q1 2024", "Annual 2024"
  rating_overall NUMERIC(2,1), -- 1.0 to 5.0
  rating_quality NUMERIC(2,1),
  rating_productivity NUMERIC(2,1),
  rating_communication NUMERIC(2,1),
  rating_teamwork NUMERIC(2,1),
  goals_achieved TEXT,
  goals_next_period TEXT,
  strengths TEXT,
  improvements TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Recruitment Pipeline
CREATE TABLE IF NOT EXISTS recruitment_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  department TEXT,
  location TEXT,
  employment_type TEXT CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship')),
  description TEXT,
  requirements TEXT,
  salary_range TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed', 'filled')),
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES recruitment_stages(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  cv_url TEXT,
  cover_letter TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Staff Contracts
CREATE TABLE IF NOT EXISTS staff_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  contract_type TEXT CHECK (contract_type IN ('permanent', 'contract', 'internship', 'casual')),
  start_date DATE NOT NULL,
  end_date DATE,
  salary_amount NUMERIC(15,2),
  salary_frequency TEXT CHECK (salary_frequency IN ('monthly', 'weekly', 'daily')),
  probation_months INTEGER DEFAULT 3,
  notice_period_days INTEGER DEFAULT 30,
  document_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated', 'renewed')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Staff Documents
CREATE TABLE IF NOT EXISTS staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  document_type TEXT CHECK (document_type IN ('id', 'certificate', 'contract', 'performance', 'discipline', 'other')),
  title TEXT NOT NULL,
  file_url TEXT,
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Staff Benefits
CREATE TABLE IF NOT EXISTS staff_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  benefit_type TEXT CHECK (benefit_type IN ('health', 'transport', 'housing', 'meal', 'phone', 'internet', 'other')),
  description TEXT,
  amount NUMERIC(15,2),
  frequency TEXT CHECK (frequency IN ('monthly', 'quarterly', 'annually', 'one_time')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON leave_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON leave_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON leave_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON performance_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON recruitment_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON job_postings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON job_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_benefits TO authenticated;

-- RLS
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_benefits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Staff access leave_types" ON leave_types FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access own leave_balances" ON leave_balances FOR ALL USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access own leave_requests" ON leave_requests FOR ALL USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access own attendance" ON attendance_records FOR ALL USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access own performance" ON performance_reviews FOR ALL USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access recruitment_stages" ON recruitment_stages FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access job_postings" ON job_postings FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access job_applications" ON job_applications FOR ALL USING (job_id IN (SELECT id FROM job_postings WHERE business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())));
CREATE POLICY "Staff access own contracts" ON staff_contracts FOR ALL USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access own documents" ON staff_documents FOR ALL USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access own benefits" ON staff_benefits FOR ALL USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Insert default leave types for Nigeria
INSERT INTO leave_types (business_id, name, days_per_year, is_paid) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Annual Leave', 21, TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Sick Leave', 14, TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Maternity Leave', 84, TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Paternity Leave', 14, TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Compassionate Leave', 5, TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Unpaid Leave', 0, FALSE);
