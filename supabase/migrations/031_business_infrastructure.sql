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
  rate DECIMAL(5,2), -- percentage or fixed amount
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
-- SEED DATA: Default commission plans
-- ============================================
INSERT INTO commission_plans (business_id, name, type, rate) VALUES
  (gen_random_uuid(), 'Standard Sales Commission', 'percentage', 5.00),
  (gen_random_uuid(), 'Referral Bonus', 'fixed', 10000.00)
ON CONFLICT DO NOTHING;
