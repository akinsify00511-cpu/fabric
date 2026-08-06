-- ============================================
-- HR, PAYROLL & BUSINESS INFRASTRUCTURE
-- Tables for: branches, payroll, loans, commissions, assets, liabilities, recurring expenses
-- ============================================

-- Branches / Locations
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  is_headquarters BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff branch assignments (many-to-many)
CREATE TABLE IF NOT EXISTS staff_branch_assignments (
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (staff_id, branch_id)
);

-- Payroll runs
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'cancelled')),
  total_gross NUMERIC(15,2) DEFAULT 0,
  total_deductions NUMERIC(15,2) DEFAULT 0,
  total_net NUMERIC(15,2) DEFAULT 0,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Payroll entries (per staff)
CREATE TABLE IF NOT EXISTS payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  basic_salary NUMERIC(15,2) NOT NULL,
  allowances NUMERIC(15,2) DEFAULT 0,
  bonuses NUMERIC(15,2) DEFAULT 0,
  gross_salary NUMERIC(15,2) GENERATED ALWAYS AS (basic_salary + allowances + bonuses) STORED,
  paye NUMERIC(15,2) DEFAULT 0,
  pension NUMERIC(15,2) DEFAULT 0,
  nhf NUMERIC(15,2) DEFAULT 0,
  nsitf NUMERIC(15,2) DEFAULT 0,
  other_deductions NUMERIC(15,2) DEFAULT 0,
  total_deductions NUMERIC(15,2) GENERATED ALWAYS AS (paye + pension + nhf + nsitf + other_deductions) STORED,
  net_salary NUMERIC(15,2) GENERATED ALWAYS AS (gross_salary - total_deductions) STORED,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  created_at TIMERTAMPTZ DEFAULT NOW(),
  UNIQUE(payroll_run_id, staff_id)
);

-- Loans (business loans or staff loans)
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id), -- NULL for business loans
  lender_name TEXT NOT NULL,
  loan_type TEXT CHECK (loan_type IN ('business', 'staff_advance', 'equipment', 'mortgage', 'other')),
  principal_amount NUMERIC(15,2) NOT NULL,
  interest_rate NUMERIC(5,2) DEFAULT 0,
  tenure_months INTEGER,
  emi_amount NUMERIC(15,2),
  start_date DATE,
  end_date DATE,
  outstanding_balance NUMERIC(15,2) DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'defaulted', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loan repayments
CREATE TABLE IF NOT EXISTS loan_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  principal_portion NUMERIC(15,2),
  interest_portion NUMERIC(15,2),
  payment_date DATE NOT NULL,
  payment_method TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Commissions
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  commission_type TEXT CHECK (commission_type IN ('sales', 'referral', 'performance', 'team')),
  amount NUMERIC(15,2) NOT NULL,
  percentage NUMERIC(5,2),
  deal_id UUID, -- reference to quote or invoice
  deal_amount NUMERIC(15,2),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  approved_by UUID REFERENCES staff(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recurring expenses (rent, phones, subscriptions)
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category TEXT CHECK (category IN ('rent', 'phones', 'subscriptions', 'utilities', 'insurance', 'maintenance', 'other')),
  name TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  frequency TEXT CHECK (frequency IN ('monthly', 'quarterly', 'annually')),
  next_due_date DATE,
  vendor TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business assets
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  asset_type TEXT CHECK (asset_type IN ('property', 'vehicle', 'equipment', 'furniture', 'electronics', 'software', 'other')),
  name TEXT NOT NULL,
  description TEXT,
  purchase_date DATE,
  purchase_price NUMERIC(15,2),
  current_value NUMERIC(15,2),
  depreciation_rate NUMERIC(5,2) DEFAULT 0,
  depreciation_method TEXT CHECK (depreciation_method IN ('straight_line', 'declining', 'none')),
  serial_number TEXT,
  location TEXT,
  assigned_to UUID REFERENCES staff(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disposed', 'under_maintenance', 'retired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business liabilities (debts, bonds, notes payable)
CREATE TABLE IF NOT EXISTS liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  liability_type TEXT CHECK (liability_type IN ('bond', 'note_payable', 'mortgage', 'credit_line', 'trade_payable', 'other')),
  name TEXT NOT NULL,
  creditor TEXT,
  original_amount NUMERIC(15,2) NOT NULL,
  current_balance NUMERIC(15,2),
  interest_rate NUMERIC(5,2),
  maturity_date DATE,
  collateral TEXT,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'restructured', 'defaulted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time tracking entries (for time-per-hour ratio)
CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  project_id UUID, -- reference to projects if applicable
  date DATE NOT NULL,
  hours NUMERIC(5,2) NOT NULL,
  description TEXT,
  billable BOOLEAN DEFAULT FALSE,
  hourly_rate NUMERIC(10,2), -- for billable work
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cost centers (for cost allocation)
CREATE TABLE IF NOT EXISTS cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('department', 'project', 'branch', 'product', 'other')),
  parent_id UUID REFERENCES cost_centers(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cost allocations
CREATE TABLE IF NOT EXISTS cost_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_center_id UUID NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE,
  expense_category TEXT,
  amount NUMERIC(15,2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_branch_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON loans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON loan_repayments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON commissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON liabilities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON time_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cost_centers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cost_allocations TO authenticated;

-- Add RLS policies
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_branch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_allocations ENABLE ROW LEVEL SECURITY;

-- RLS policies (staff can only access their business's data)
CREATE POLICY "Staff can access their business branches" ON branches
  FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can access branch assignments" ON staff_branch_assignments
  FOR ALL USING (branch_id IN (SELECT id FROM branches WHERE business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())));

CREATE POLICY "Staff can access payroll" ON payroll_runs
  FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can access payroll entries" ON payroll_entries
  FOR ALL USING (payroll_run_id IN (SELECT id FROM payroll_runs WHERE business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())));

CREATE POLICY "Staff can access loans" ON loans
  FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can access loan repayments" ON loan_repayments
  FOR ALL USING (loan_id IN (SELECT id FROM loans WHERE business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())));

CREATE POLICY "Staff can access commissions" ON commissions
  FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can access recurring expenses" ON recurring_expenses
  FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can access assets" ON assets
  FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can access liabilities" ON liabilities
  FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can access time entries" ON time_entries
  FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can access cost centers" ON cost_centers
  FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY "Staff can access cost allocations" ON cost_allocations
  FOR ALL USING (cost_center_id IN (SELECT id FROM cost_centers WHERE business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())));
