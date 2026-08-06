-- ============================================
-- PROCESS, WORKFLOW & ORGANIZATION MANAGEMENT
-- ============================================

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  parent_id UUID REFERENCES departments(id),
  manager_id UUID REFERENCES staff(id),
  budget NUMERIC(15,2),
  headcount INTEGER DEFAULT 0,
  color TEXT DEFAULT '#4F46E5',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Job Titles/Positions
CREATE TABLE IF NOT EXISTS job_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  level TEXT CHECK (level IN ('entry', 'mid', 'senior', 'lead', 'manager', 'director', 'executive')),
  department_id UUID REFERENCES departments(id),
  description TEXT,
  responsibilities TEXT[],
  requirements TEXT[],
  salary_min NUMERIC(15,2),
  salary_max NUMERIC(15,2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Standard Operating Procedures (SOPs)
CREATE TABLE IF NOT EXISTS standard_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  code TEXT,
  department_id UUID REFERENCES departments(id),
  category TEXT CHECK (category IN ('hr', 'finance', 'operations', 'sales', 'it', 'safety', 'compliance', 'other')),
  version TEXT DEFAULT '1.0',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'active', 'archived')),
  description TEXT,
  steps JSONB, -- Array of step objects with order, title, description, responsible, duration
  policies JSONB, -- Related policies
  forms JSONB, -- Related forms/documents
  approved_by UUID REFERENCES staff(id),
  approved_at TIMESTAMP,
  effective_date DATE,
  review_date DATE,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Process Workflows
CREATE TABLE IF NOT EXISTS process_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT CHECK (workflow_type IN ('approval', 'onboarding', 'offboarding', 'purchase', 'leave', 'reimbursement', 'escalation', 'incident', 'custom')),
  steps JSONB NOT NULL, -- Array of step objects with order, title, approver_role, timeout_hours, action
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Workflow Instances (running processes)
CREATE TABLE IF NOT EXISTS workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES process_workflows(id),
  initiated_by UUID REFERENCES staff(id),
  reference_type TEXT, -- 'leave_request', 'purchase', etc.
  reference_id UUID,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'cancelled')),
  data JSONB, -- Form data submitted
  history JSONB, -- Audit trail of step completions
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Issue/Problem Management
CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  issue_type TEXT CHECK (issue_type IN ('bug', 'feature', 'process', 'compliance', 'safety', 'customer', 'internal', 'other')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'closed', 'escalated')),
  category TEXT,
  assigned_to UUID REFERENCES staff(id),
  reported_by UUID REFERENCES staff(id),
  department_id UUID REFERENCES departments(id),
  due_date DATE,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  impact_level TEXT CHECK (impact_level IN ('minimal', 'low', 'medium', 'high', 'critical')),
  root_cause TEXT,
  corrective_action TEXT,
  attachments JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- SLA Management
CREATE TABLE IF NOT EXISTS sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issue_type TEXT,
  priority TEXT,
  response_time_hours INTEGER,
  resolution_time_hours INTEGER,
  escalation_hours INTEGER,
  escalation_to UUID REFERENCES staff(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Quality Control Checks
CREATE TABLE IF NOT EXISTS quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  checklist_type TEXT CHECK (checklist_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual', 'incident')),
  department_id UUID REFERENCES departments(id),
  items JSONB NOT NULL, -- Array of {item, required, type: boolean/number/text}
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  assigned_to UUID REFERENCES staff(id),
  completed_by UUID REFERENCES staff(id),
  due_date DATE,
  completed_at TIMESTAMP,
  results JSONB,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Company Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT CHECK (category IN ('general', 'hr', 'finance', 'it', 'security', 'event', 'urgent')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all', 'management', 'department', 'individual')),
  target_department_id UUID REFERENCES departments(id),
  target_staff_ids UUID[],
  attachments JSONB,
  is_pinned BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Document Management
CREATE TABLE IF NOT EXISTS company_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type TEXT CHECK (document_type IN ('policy', 'procedure', 'contract', 'template', 'report', 'legal', 'training', 'other')),
  department_id UUID REFERENCES departments(id),
  file_url TEXT,
  file_size INTEGER,
  mime_type TEXT,
  version TEXT DEFAULT '1.0',
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'review', 'approved', 'active', 'archived')),
  description TEXT,
  tags TEXT[],
  expires_at DATE,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Compliance Tracking
CREATE TABLE IF NOT EXISTS compliance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  requirement TEXT NOT NULL,
  regulation TEXT, -- e.g., 'NDPR', 'FIRS', 'SON'
  compliance_type TEXT CHECK (compliance_type IN ('data_protection', 'tax', 'labor', 'safety', 'environmental', 'financial', 'other')),
  frequency TEXT CHECK (frequency IN ('one_time', 'daily', 'weekly', 'monthly', 'quarterly', 'annually')),
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'compliant', 'non_compliant', 'waived')),
  evidence_url TEXT,
  reviewed_by UUID REFERENCES staff(id),
  reviewed_at TIMESTAMP,
  next_review_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON job_titles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON standard_procedures TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON process_workflows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON issues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sla_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON quality_checks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON announcements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON company_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON compliance_items TO authenticated;

-- RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Staff access departments" ON departments FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access job_titles" ON job_titles FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access standard_procedures" ON standard_procedures FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access process_workflows" ON process_workflows FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access workflow_instances" ON workflow_instances FOR ALL USING (workflow_id IN (SELECT id FROM process_workflows WHERE business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())));
CREATE POLICY "Staff access issues" ON issues FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access sla_policies" ON sla_policies FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access quality_checks" ON quality_checks FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access announcements" ON announcements FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access company_documents" ON company_documents FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access compliance_items" ON compliance_items FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
