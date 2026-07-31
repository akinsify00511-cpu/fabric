-- AVENIZE Layer 1 - Double-Entry Accounting (Odoo competitor)
-- Chart of accounts, journal entries, general ledger, financial reports

-- ============================================
-- ACCOUNT TYPES (hierarchical)
-- ============================================
CREATE TYPE account_type AS ENUM (
  'asset',        -- Assets (cash, inventory, receivables)
  'liability',    -- Liabilities (payables, loans)
  'equity',       -- Owner's equity
  'revenue',      -- Income/revenue
  'expense'       -- Expenses/costs
);

-- ============================================
-- ACCOUNTS TABLE (Chart of Accounts)
-- ============================================
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL, -- e.g., '1100', '2100'
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id UUID REFERENCES accounts(id), -- for sub-accounts
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_cash BOOLEAN DEFAULT FALSE, -- for cash flow tracking
  bank_account_id TEXT, -- link to external bank account
  opening_balance DECIMAL(14,2) DEFAULT 0,
  opening_balance_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, code)
);

-- ============================================
-- JOURNAL ENTRIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entry_number TEXT NOT NULL, -- auto-generated: JE-0001
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT, -- invoice number, etc.
  description TEXT, -- memo/narration
  status TEXT DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'void')),
  posted_by UUID REFERENCES staff(id),
  posted_at TIMESTAMPTZ,
  source_type TEXT, -- 'manual', 'invoice', 'payment', 'inventory', 'payroll'
  source_id UUID, -- link to source document
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, entry_number)
);

-- ============================================
-- JOURNAL LINE ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id),
  debit DECIMAL(14,2) DEFAULT 0 CHECK (debit >= 0),
  credit DECIMAL(14,2) DEFAULT 0 CHECK (credit >= 0),
  description TEXT, -- line item description
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ACCOUNT BALANCES (denormalized for fast reporting)
-- ============================================
CREATE TABLE IF NOT EXISTS account_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  debit_total DECIMAL(14,2) DEFAULT 0,
  credit_total DECIMAL(14,2) DEFAULT 0,
  PRIMARY KEY (business_id, account_id, period_year, period_month)
);

-- ============================================
-- BANK ACCOUNTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id), -- linked GL account
  name TEXT NOT NULL,
  bank_name TEXT,
  account_number TEXT, -- masked
  account_type TEXT, -- 'checking', 'savings', 'credit_card'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  journal_entry_id UUID REFERENCES journal_entries(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(14,2) NOT NULL,
  payment_type TEXT CHECK (payment_type IN ('receive', 'pay', 'internal')),
  payment_method TEXT, -- 'cash', 'bank_transfer', 'check', 'card'
  reference TEXT, -- check number, etc.
  contact_id UUID REFERENCES contacts(id),
  invoice_id UUID REFERENCES invoices(id), -- linked invoice
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Accounts: business members
CREATE POLICY "Accounts view"
  ON accounts FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Accounts create"
  ON accounts FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Accounts update"
  ON accounts FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Journal entries: business members
CREATE POLICY "Entries view"
  ON journal_entries FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Entries create"
  ON journal_entries FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Entries update"
  ON journal_entries FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Journal lines: business members
CREATE POLICY "Lines view"
  ON journal_lines FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Lines create"
  ON journal_lines FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- Account balances: business members
CREATE POLICY "Balances view"
  ON account_balances FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Bank accounts: business members
CREATE POLICY "Banks view"
  ON bank_accounts FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Banks create"
  ON bank_accounts FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- Payments: business members
CREATE POLICY "Payments view"
  ON payments FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Payments create"
  ON payments FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get next journal entry number
CREATE OR REPLACE FUNCTION get_next_entry_number()
RETURNS TEXT AS $$
DECLARE
  v_next INTEGER;
  v_business_id UUID;
BEGIN
  v_business_id := (SELECT business_id FROM get_current_staff() LIMIT 1);
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 'JE-(\d+)') AS INTEGER)), 0)
  INTO v_next
  FROM journal_entries
  WHERE business_id = v_business_id;
  
  RETURN 'JE-' || LPAD((v_next + 1)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create journal entry with lines
CREATE OR REPLACE FUNCTION create_journal_entry(
  p_date DATE,
  p_description TEXT,
  p_lines JSONB -- [{"account_id": "uuid", "debit": 100, "credit": 0, "description": "line desc"}, ...]
)
RETURNS UUID AS $$
DECLARE
  v_entry_id UUID;
  v_business_id UUID;
  v_total_debit DECIMAL(14,2) := 0;
  v_total_credit DECIMAL(14,2) := 0;
  v_line JSONB;
BEGIN
  v_business_id := (SELECT business_id FROM get_current_staff() LIMIT 1);
  
  -- Validate debits = credits
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_total_debit := v_total_debit + COALESCE((v_line->>'debit')::DECIMAL, 0);
    v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::DECIMAL, 0);
  END LOOP;
  
  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Debits (%.2f) must equal credits (%.2f)', v_total_debit, v_total_credit;
  END IF;
  
  -- Create entry
  INSERT INTO journal_entries (business_id, entry_number, date, description, posted_by, posted_at)
  VALUES (v_business_id, get_next_entry_number(), p_date, p_description, (SELECT id FROM staff WHERE user_id = auth.uid()), NOW())
  RETURNING id INTO v_entry_id;
  
  -- Create lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, description)
    VALUES (
      v_business_id,
      v_entry_id,
      (v_line->>'account_id')::UUID,
      COALESCE((v_line->>'debit')::DECIMAL, 0),
      COALESCE((v_line->>'credit')::DECIMAL, 0),
      v_line->>'description'
    );
  END LOOP;
  
  -- Update balances
  PERFORM update_account_balances(v_entry_id);
  
  RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update account balances after entry
CREATE OR REPLACE FUNCTION update_account_balances(p_entry_id UUID)
RETURNS VOID AS $$
DECLARE
  v_entry RECORD;
  v_line RECORD;
  v_year INTEGER;
  v_month INTEGER;
BEGIN
  SELECT * INTO v_entry FROM journal_entries WHERE id = p_entry_id;
  v_year := EXTRACT(YEAR FROM v_entry.date)::INTEGER;
  v_month := EXTRACT(MONTH FROM v_entry.date)::INTEGER;
  
  FOR v_line IN SELECT * FROM journal_lines WHERE journal_entry_id = p_entry_id
  LOOP
    INSERT INTO account_balances (business_id, account_id, period_year, period_month, debit_total, credit_total)
    VALUES (v_entry.business_id, v_line.account_id, v_year, v_month, v_line.debit, v_line.credit)
    ON CONFLICT (business_id, account_id, period_year, period_month)
    DO UPDATE SET
      debit_total = account_balances.debit_total + v_line.debit,
      credit_total = account_balances.credit_total + v_line.credit;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get trial balance
CREATE OR REPLACE FUNCTION get_trial_balance(p_year INTEGER, p_month INTEGER)
RETURNS TABLE (
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  debit DECIMAL(14,2),
  credit DECIMAL(14,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.code,
    a.name,
    a.type,
    COALESCE(SUM(ab.debit_total), 0) - COALESCE(
      (SELECT SUM(jl.debit) FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.account_id = a.id AND EXTRACT(YEAR FROM je.date) * 12 + EXTRACT(MONTH FROM je.date) < p_year * 12 + p_month
      ), 0
    ) as running_debit,
    COALESCE(SUM(ab.credit_total), 0) - COALESCE(
      (SELECT SUM(jl.credit) FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.account_id = a.id AND EXTRACT(YEAR FROM je.date) * 12 + EXTRACT(MONTH FROM je.date) < p_year * 12 + p_month
      ), 0
    ) as running_credit
  FROM accounts a
  LEFT JOIN account_balances ab ON ab.account_id = a.id AND ab.period_year = p_year AND ab.period_month = p_month
  WHERE a.business_id IN (SELECT business_id FROM get_current_staff())
  AND a.is_active = TRUE
  ORDER BY a.code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get account balance
CREATE OR REPLACE FUNCTION get_account_balance(p_account_id UUID)
RETURNS TABLE (
  balance DECIMAL(14,2),
  debit_total DECIMAL(14,2),
  credit_total DECIMAL(14,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0),
    COALESCE(SUM(jl.debit), 0),
    COALESCE(SUM(jl.credit), 0)
  FROM journal_lines jl
  WHERE jl.account_id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER journal_entries_updated_at BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
