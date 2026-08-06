-- ============================================
-- SALES, TAX, BANKING & FINANCE MODULES
-- ============================================

-- Sales Targets
CREATE TABLE IF NOT EXISTS sales_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  target_type TEXT CHECK (target_type IN ('monthly', 'quarterly', 'annual')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  revenue_target NUMERIC(15,2) DEFAULT 0,
  deal_count_target INTEGER DEFAULT 0,
  actual_revenue NUMERIC(15,2) DEFAULT 0,
  actual_deals INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Commission Rules
CREATE TABLE IF NOT EXISTS commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  commission_type TEXT CHECK (commission_type IN ('percentage', 'tiered', 'fixed')),
  rate_percentage NUMERIC(5,2) DEFAULT 0,
  min_deal_value NUMERIC(15,2) DEFAULT 0,
  tier_json JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Staff Commissions
CREATE TABLE IF NOT EXISTS staff_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  deal_id UUID,
  deal_value NUMERIC(15,2),
  commission_amount NUMERIC(15,2),
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Win/Loss Analysis
CREATE TABLE IF NOT EXISTS deal_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID,
  business_id UUID NOT NULL REFERENCES businesses(id),
  outcome TEXT CHECK (outcome IN ('won', 'lost', 'cancelled')),
  lost_to_competitor TEXT,
  loss_reason TEXT,
  days_to_close INTEGER,
  initial_value NUMERIC(15,2),
  final_value NUMERIC(15,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tax Configurations
CREATE TABLE IF NOT EXISTS tax_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tax_type TEXT NOT NULL,
  name TEXT NOT NULL,
  rate_percentage NUMERIC(5,2) NOT NULL,
  account_code TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- VAT Records
CREATE TABLE IF NOT EXISTS vat_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  record_type TEXT CHECK (record_type IN ('sales', 'purchase')),
  invoice_number TEXT,
  invoice_date DATE,
  client_name TEXT,
  base_amount NUMERIC(15,2),
  vat_amount NUMERIC(15,2),
  total_amount NUMERIC(15,2),
  status TEXT DEFAULT 'pending',
  filed_period TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- WHT Records
CREATE TABLE IF NOT EXISTS wht_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  record_type TEXT CHECK (record_type IN ('withheld', 'received')),
  beneficiary_name TEXT,
  service_type TEXT,
  gross_amount NUMERIC(15,2),
  withholding_rate NUMERIC(5,2),
  withholding_amount NUMERIC(15,2),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bank Accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_type TEXT DEFAULT 'current',
  currency TEXT DEFAULT 'NGN',
  balance NUMERIC(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bank Transactions
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  transaction_date DATE NOT NULL,
  description TEXT,
  reference TEXT,
  debit_amount NUMERIC(15,2),
  credit_amount NUMERIC(15,2),
  balance_after NUMERIC(15,2),
  is_reconciled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Debtors
CREATE TABLE IF NOT EXISTS debtors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  invoice_number TEXT,
  original_amount NUMERIC(15,2) NOT NULL,
  outstanding_amount NUMERIC(15,2) NOT NULL,
  due_date DATE,
  days_overdue INTEGER DEFAULT 0,
  status TEXT DEFAULT 'outstanding',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Creditors
CREATE TABLE IF NOT EXISTS creditors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  supplier_email TEXT,
  invoice_number TEXT,
  original_amount NUMERIC(15,2) NOT NULL,
  outstanding_amount NUMERIC(15,2) NOT NULL,
  due_date DATE,
  days_overdue INTEGER DEFAULT 0,
  status TEXT DEFAULT 'outstanding',
  created_at TIMESTAMP DEFAULT NOW()
);

-- SMS Campaigns
CREATE TABLE IF NOT EXISTS sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_template TEXT,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- SMS Contacts
CREATE TABLE IF NOT EXISTS sms_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  opt_in BOOLEAN DEFAULT TRUE,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Delivery Orders
CREATE TABLE IF NOT EXISTS delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_reference TEXT,
  client_name TEXT,
  client_address TEXT,
  client_phone TEXT,
  delivery_type TEXT DEFAULT 'delivery',
  status TEXT DEFAULT 'pending',
  assigned_driver TEXT,
  scheduled_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Equipment
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  equipment_type TEXT,
  serial_number TEXT,
  purchase_date DATE,
  warranty_expiry DATE,
  status TEXT DEFAULT 'operational',
  location TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Maintenance Schedules
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id),
  maintenance_type TEXT,
  frequency_days INTEGER,
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lab Samples
CREATE TABLE IF NOT EXISTS lab_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sample_id TEXT NOT NULL,
  sample_type TEXT,
  client_name TEXT,
  status TEXT DEFAULT 'received',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Lab Tests
CREATE TABLE IF NOT EXISTS lab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES lab_samples(id),
  test_name TEXT NOT NULL,
  result_value TEXT,
  is_within_spec BOOLEAN,
  tested_by UUID REFERENCES staff(id),
  tested_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- QC Reports
CREATE TABLE IF NOT EXISTS qc_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  report_type TEXT,
  report_date DATE,
  sample_count INTEGER,
  pass_count INTEGER,
  fail_count INTEGER,
  pass_rate NUMERIC(5,2),
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Calibration Records
CREATE TABLE IF NOT EXISTS calibration_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  instrument_name TEXT NOT NULL,
  serial_number TEXT,
  calibration_date DATE,
  next_calibration_date DATE,
  calibration_result TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON sales_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON commission_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_commissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON deal_analytics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tax_configurations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vat_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON wht_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bank_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bank_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON debtors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON creditors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_samples TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lab_tests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON qc_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON calibration_records TO authenticated;

-- RLS
ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE creditors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE qc_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Staff access sales_targets" ON sales_targets FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access commission_rules" ON commission_rules FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access staff_commissions" ON staff_commissions FOR ALL USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access deal_analytics" ON deal_analytics FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access tax_configurations" ON tax_configurations FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access vat_records" ON vat_records FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access wht_records" ON wht_records FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access bank_accounts" ON bank_accounts FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access bank_transactions" ON bank_transactions FOR ALL USING (bank_account_id IN (SELECT id FROM bank_accounts WHERE business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())));
CREATE POLICY "Staff access debtors" ON debtors FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access creditors" ON creditors FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access sms_campaigns" ON sms_campaigns FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access sms_contacts" ON sms_contacts FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access delivery_orders" ON delivery_orders FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access equipment" ON equipment FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access maintenance_schedules" ON maintenance_schedules FOR ALL USING (equipment_id IN (SELECT id FROM equipment WHERE business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())));
CREATE POLICY "Staff access lab_samples" ON lab_samples FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access lab_tests" ON lab_tests FOR ALL USING (sample_id IN (SELECT id FROM lab_samples WHERE business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())));
CREATE POLICY "Staff access qc_reports" ON qc_reports FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
CREATE POLICY "Staff access calibration_records" ON calibration_records FOR ALL USING (business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid()));
