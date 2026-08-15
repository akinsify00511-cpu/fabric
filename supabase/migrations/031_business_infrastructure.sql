-- Migration: Business Infrastructure for HR/Payroll/Financial Tracking
-- Based on feature notes: branches, assets, loans, payroll, commissions
-- ============================================

-- ============================================
-- BRANCHES (Multi-location tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  manager_id UUID, -- references staff(id)
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ASSETS (Equipment, property, depreciation)
-- ============================================
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'equipment', 'property', 'vehicle', 'furniture', 'electronics', 'other'
  purchase_date DATE,
  purchase_cost DECIMAL(15,2),
  current_value DECIMAL(15,2),
  depreciation_rate DECIMAL(5,2) DEFAULT 0, -- annual percentage
  location TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disposed', 'maintenance', 'retired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LOANS & LIABILITIES
-- ============================================
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  lender TEXT NOT NULL, -- bank, institution, individual name
  type TEXT NOT NULL, -- 'bank_loan', 'equipment_financing', 'mortgage', 'overdraft', 'other'
  principal DECIMAL(15,2) NOT NULL,
  interest_rate DECIMAL(5,2), -- annual percentage
  monthly_payment DECIMAL(15,2),
  start_date DATE,
  end_date DATE,
  remaining_balance DECIMAL(15,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'defaulted', 'restructured')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loan repayment schedule
CREATE TABLE IF NOT EXISTS loan_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL,
  principal_portion DECIMAL(15,2),
  interest_portion DECIMAL(15,2),
  payment_date DATE,
  payment_method TEXT, -- 'bank_transfer', 'cash', 'check'
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAYROLL (Basic structure for Nigerian compliance)
-- ============================================
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'approved', 'paid')),
  total_gross DECIMAL(15,2) DEFAULT 0,
  total_deductions DECIMAL(15,2) DEFAULT 0,
  total_net DECIMAL(15,2) DEFAULT 0,
  approved_by UUID REFERENCES staff(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  basic_salary DECIMAL(15,2) NOT NULL,
  allowances DECIMAL(15,2) DEFAULT 0,
  overtime DECIMAL(15,2) DEFAULT 0,
  bonuses DECIMAL(15,2) DEFAULT 0,
  gross_salary DECIMAL(15,2),
  -- Nigerian statutory deductions
  pension DECIMAL(15,2) DEFAULT 0, -- 8% employee contribution
  paye DECIMAL(15,2) DEFAULT 0, -- PAYE tax
  nhf DECIMAL(15,2) DEFAULT 0, -- National Housing Fund
  nsitf DECIMAL(15,2) DEFAULT 0, -- NSITF contribution
  other_deductions DECIMAL(15,2) DEFAULT 0,
  total_deductions DECIMAL(15,2) DEFAULT 0,
  net_salary DECIMAL(15,2),
  bank_name TEXT,
  account_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMMISSIONS (Sales/staff commission tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS commission_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'percentage', 'tiered', 'fixed'
  rate DECIMAL(12,2), -- percentage or fixed amount (12,2 to hold large fixed amounts)
  tier_threshold DECIMAL(15,2), -- for tiered plans
  tier_rate DECIMAL(5,2), -- rate for this tier
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  commission_plan_id UUID REFERENCES commission_plans(id),
  deal_id UUID, -- reference to the deal that earned the commission
  amount DECIMAL(15,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  earned_date DATE,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CUSTOMER RISK SCORING
-- ============================================
CREATE TABLE IF NOT EXISTS customer_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  score INTEGER DEFAULT 50, -- 0-100 scale
  tier TEXT DEFAULT 'medium' CHECK (tier IN ('low', 'medium', 'high', 'critical')),
  payment_history_score INTEGER, -- based on payment timeliness
  tenure_months INTEGER, -- how long they've been a customer
  volume_trend TEXT CHECK (volume_trend IN ('increasing', 'stable', 'decreasing')),
  last_risk_assessment DATE,
  risk_factors JSONB, -- array of risk factors identified
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RECURRING COSTS (Rent, utilities, subscriptions)
-- ============================================
CREATE TABLE IF NOT EXISTS recurring_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  category TEXT NOT NULL, -- 'rent', 'utilities', 'subscription', 'insurance', 'maintenance', 'other'
  name TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  frequency TEXT NOT NULL, -- 'monthly', 'quarterly', 'yearly'
  next_due_date DATE,
  vendor TEXT,
  account_number TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_branches_business ON branches(business_id);
CREATE INDEX IF NOT EXISTS idx_assets_business ON assets(business_id);
CREATE INDEX IF NOT EXISTS idx_assets_branch ON assets(branch_id);
CREATE INDEX IF NOT EXISTS idx_loans_business ON loans(business_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_staff ON payroll_items(staff_id);
CREATE INDEX IF NOT EXISTS idx_commissions_staff ON staff_commissions(staff_id);
CREATE INDEX IF NOT EXISTS idx_risk_scores_contact ON customer_risk_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_recurring_costs_business ON recurring_costs(business_id);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Branches: business staff can read, owners/admins can manage
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branches are viewable by business staff" ON branches;
CREATE POLICY "Branches are viewable by business staff" ON branches
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())
  );

-- Assets: same as branches
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assets are viewable by business staff" ON assets;
CREATE POLICY "Assets are viewable by business staff" ON assets
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())
  );

-- Loans: same
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Loans are viewable by business staff" ON loans;
CREATE POLICY "Loans are viewable by business staff" ON loans
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())
  );

-- Payroll: owners only
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payroll viewable by owners" ON payroll_runs;
CREATE POLICY "Payroll viewable by owners" ON payroll_runs
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM staff 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Commissions: staff can view own
ALTER TABLE staff_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view own commissions" ON staff_commissions;
CREATE POLICY "Staff can view own commissions" ON staff_commissions
  FOR SELECT USING (
    staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())
    OR business_id IN (
      SELECT business_id FROM staff 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Recurring costs: business staff can view
ALTER TABLE recurring_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Recurring costs viewable by business staff" ON recurring_costs;
CREATE POLICY "Recurring costs viewable by business staff" ON recurring_costs
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())
  );

-- ============================================
-- SEED DATA: Default commission plans (only if a business exists)
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM businesses LIMIT 1) THEN
    INSERT INTO commission_plans (business_id, name, type, rate)
    SELECT id, 'Standard Sales Commission', 'percentage', 5.00
    FROM businesses LIMIT 1
    ON CONFLICT DO NOTHING;
  END IF;
END $$;


-- ============================================
-- MERGED from 031_hr_payroll_infrastructure.sql (was a duplicate-numbered sibling)
-- ============================================

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
-- Reconcile columns the sibling 031_business_infrastructure file may have
-- added (manager_id, is_active) so the table has the union of both
-- definitions regardless of which CREATE TABLE won the IF NOT EXISTS race.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_id UUID;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

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
  net_salary NUMERIC(15,2) GENERATED ALWAYS AS ((basic_salary + allowances + bonuses) - (paye + pension + nhf + nsitf + other_deductions)) STORED,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
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
