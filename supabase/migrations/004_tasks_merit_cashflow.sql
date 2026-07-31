-- FABRIC Layer 1 - Tasks, Merit Points, and Cash Flow
-- Frontend pages for these tables already exist or will be created

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assignee_id UUID REFERENCES staff(id),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MERIT ENTRIES TABLE (recognition/rewards)
-- ============================================
CREATE TABLE IF NOT EXISTS merit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  points INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  awarded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CASHFLOW ENTRIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS cashflow_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL, -- e.g., 'sales', 'payroll', 'marketing', 'operations'
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  reference_id UUID, -- optional link to invoice, payroll, etc.
  staff_id UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS FOR NEW TABLES
-- ============================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE merit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_entries ENABLE ROW LEVEL SECURITY;

-- Tasks: same business; assignees and creators can see all in business
CREATE POLICY "Tasks same business"
  ON tasks FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Merit entries: same business
CREATE POLICY "Merit entries same business"
  ON merit_entries FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Cashflow entries: same business
CREATE POLICY "Cashflow entries same business"
  ON cashflow_entries FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER IF NOT EXISTS tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS cashflow_entries_updated_at BEFORE UPDATE ON cashflow_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
