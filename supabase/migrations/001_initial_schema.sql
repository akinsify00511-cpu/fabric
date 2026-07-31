-- FABRIC Layer 1 Schema
-- Multi-tenant business OS with Row-Level Security

-- ============================================
-- TABLES
-- ============================================

-- Businesses (tenants)
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT, -- retail, real_estate, consulting, production
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff (users within a business)
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- auth.users id
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, user_id)
);

-- Invites (team invites)
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES staff(id)
);

-- Contacts (CRM)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  deal_id UUID, -- linked deal
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deals (CRM pipeline)
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  value DECIMAL(12,2) DEFAULT 0,
  stage TEXT DEFAULT 'prospect' CHECK (stage IN ('prospect', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  contact_id UUID REFERENCES contacts(id),
  expected_close DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products (inventory)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost DECIMAL(12,2) DEFAULT 0,
  stock INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions (POS/inventory movements)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'adjustment', 'return')),
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  staff_id UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transaction items
CREATE TABLE transaction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices (billing)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_number TEXT,
  client_name TEXT NOT NULL,
  client_email TEXT,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  due_date DATE,
  deal_id UUID REFERENCES deals(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice line items
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW-LEVEL SECURITY
-- ============================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's staff record
CREATE OR REPLACE FUNCTION get_current_staff()
RETURNS TABLE (id UUID, business_id UUID, role TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.business_id, s.role
  FROM staff s
  WHERE s.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Businesses: users can only see their own
CREATE POLICY "Users see own business"
  ON businesses FOR SELECT
  USING (id IN (SELECT business_id FROM get_current_staff()));

-- Staff: same business only
CREATE POLICY "Staff see same business"
  ON staff FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Staff: owners/managers can insert new staff
CREATE POLICY "Owners/managers can manage staff"
  ON staff FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM get_current_staff() cs
      WHERE cs.business_id = staff.business_id AND cs.role IN ('owner', 'manager')
    )
  );

-- Invites: owners/managers can create; invited email can view
CREATE POLICY "Owners/managers manage invites"
  ON invites FOR ALL
  USING (
    business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager'))
  );

CREATE POLICY "Invites viewable by token or business"
  ON invites FOR SELECT
  USING (
    used = FALSE
    AND expires_at > NOW()
    AND (business_id IN (SELECT business_id FROM get_current_staff()) OR TRUE)
  );

-- Contacts: same business
CREATE POLICY "Contacts same business"
  ON contacts FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Deals: same business
CREATE POLICY "Deals same business"
  ON deals FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Products: same business
CREATE POLICY "Products same business"
  ON products FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Transactions: same business
CREATE POLICY "Transactions same business"
  ON transactions FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Transaction items: via transaction
CREATE POLICY "Transaction items via transaction"
  ON transaction_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_items.transaction_id
      AND t.business_id IN (SELECT business_id FROM get_current_staff())
    )
  );

-- Invoices: same business
CREATE POLICY "Invoices same business"
  ON invoices FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Invoice items: via invoice
CREATE POLICY "Invoice items via invoice"
  ON invoice_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_items.invoice_id
      AND i.business_id IN (SELECT business_id FROM get_current_staff())
    )
  );

-- ============================================
-- SECURITY DEFINER FUNCTIONS (bypass RLS)
-- ============================================

-- Bootstrap a new business (signup)
CREATE OR REPLACE FUNCTION bootstrap_business(
  p_business_name TEXT,
  p_owner_name TEXT,
  p_email TEXT,
  p_password_hash TEXT
)
RETURNS TABLE (business_id UUID, user_id UUID, staff_id UUID) AS $$
DECLARE
  v_user_id UUID;
  v_business_id UUID;
  v_staff_id UUID;
BEGIN
  -- Create auth user
  INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
  VALUES (p_email, p_password_hash, jsonb_build_object('name', p_owner_name))
  RETURNING id INTO v_user_id;

  -- Create business
  INSERT INTO businesses (name)
  VALUES (p_business_name)
  RETURNING id INTO v_business_id;

  -- Create owner staff record
  INSERT INTO staff (business_id, user_id, name, email, role)
  VALUES (v_business_id, v_user_id, p_owner_name, p_email, 'owner')
  RETURNING id INTO v_staff_id;

  RETURN QUERY SELECT v_business_id, v_user_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Accept invite
CREATE OR REPLACE FUNCTION accept_invite(
  p_token TEXT,
  p_user_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_password_hash TEXT
)
RETURNS TABLE (business_id UUID, staff_id UUID) AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_staff_id UUID;
BEGIN
  -- Get invite
  SELECT * INTO v_invite
  FROM invites
  WHERE token = p_token AND used = FALSE AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  -- Create user (if doesn't exist via auth trigger)
  -- For now, assume user exists or create:
  INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
  VALUES (p_email, p_password_hash, jsonb_build_object('name', p_name))
  ON CONFLICT (email) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password
  RETURNING id INTO v_user_id;

  -- Create staff record
  INSERT INTO staff (business_id, user_id, name, email, role)
  VALUES (v_invite.business_id, v_user_id, p_name, p_email, v_invite.role)
  RETURNING id INTO v_staff_id;

  -- Mark invite used
  UPDATE invites SET used = TRUE WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.business_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create invite
CREATE OR REPLACE FUNCTION create_invite(
  p_email TEXT,
  p_role TEXT
)
RETURNS TABLE (invite_id UUID, token TEXT) AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
  v_invite_id UUID;
  v_token TEXT;
BEGIN
  -- Get current user's business
  SELECT cs.business_id, cs.id INTO v_business_id, v_staff_id
  FROM get_current_staff() cs
  WHERE cs.role IN ('owner', 'manager');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to create invites';
  END IF;

  -- Create invite
  INSERT INTO invites (business_id, email, role, created_by)
  VALUES (v_business_id, p_email, p_role, v_staff_id)
  RETURNING id, token INTO v_invite_id, v_token;

  RETURN QUERY SELECT v_invite_id, v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get invite info (public)
CREATE OR REPLACE FUNCTION get_invite_info(p_token TEXT)
RETURNS TABLE (business_name TEXT, email TEXT, role TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT b.name, i.email, i.role
  FROM invites i
  JOIN businesses b ON b.id = i.business_id
  WHERE i.token = p_token AND i.used = FALSE AND i.expires_at > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
