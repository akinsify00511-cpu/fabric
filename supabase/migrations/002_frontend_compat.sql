-- Avenize Layer 1 - Schema fixes to match frontend
-- Adds missing tables and fixes field names

-- ============================================
-- PROJECTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'done', 'on_hold', 'cancelled')),
  owner_id UUID REFERENCES staff(id),
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LEAVE REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STOCK MOVEMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  change INTEGER NOT NULL, -- positive = stock in, negative = stock out
  reason TEXT,
  staff_id UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

-- Add full_name alias to staff (frontend expects full_name but schema uses name)
-- Add active column to staff
ALTER TABLE staff ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- Update full_name from name if empty
UPDATE staff SET full_name = name WHERE full_name IS NULL;

-- Add owner_id to deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES staff(id);

-- Add client_name and client_email to invoices (frontend expects these)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax DECIMAL(12,2) DEFAULT 0;

-- Rename amount to total in invoices (if column exists)
-- Note: We'll handle this in application layer since column rename is complex

-- ============================================
-- RLS FOR NEW TABLES
-- ============================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- Projects: same business
CREATE POLICY "Projects same business"
  ON projects FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Leave requests: same business
CREATE POLICY "Leave requests same business"
  ON leave_requests FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Stock movements: same business
CREATE POLICY "Stock movements same business"
  ON stock_movements FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- ============================================
-- UPDATE BOOTSTRAP FUNCTION
-- Create owner record with full_name matching metadata
-- ============================================
CREATE OR REPLACE FUNCTION bootstrap_business(
  p_business_name TEXT,
  p_staff_full_name TEXT,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (business_id UUID, user_id UUID, staff_id UUID) AS $$
DECLARE
  v_user_id UUID;
  v_business_id UUID;
  v_staff_id UUID;
BEGIN
  v_user_id := p_user_id;

  -- Create business
  INSERT INTO businesses (name)
  VALUES (p_business_name)
  RETURNING id INTO v_business_id;

  -- Create owner staff record with full_name
  INSERT INTO staff (business_id, user_id, name, email, role, full_name)
  SELECT
    v_business_id,
    v_user_id,
    p_staff_full_name,
    COALESCE(raw_user_meta_data->>'email', ''),
    'owner',
    p_staff_full_name
  FROM auth.users WHERE id = v_user_id
  RETURNING id INTO v_staff_id;

  RETURN QUERY SELECT v_business_id, v_user_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE ACCEPT INVITE FUNCTION
-- Match frontend signature
-- ============================================
CREATE OR REPLACE FUNCTION accept_invite(
  p_invite_id TEXT,
  p_staff_full_name TEXT,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (business_id UUID, staff_id UUID) AS $$
DECLARE
  v_invite RECORD;
  v_staff_id UUID;
BEGIN
  -- Get invite by token (frontend passes token as invite_id)
  SELECT * INTO v_invite
  FROM invites
  WHERE token = p_invite_id AND used = FALSE AND expires_at > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  -- Create staff record
  INSERT INTO staff (business_id, user_id, name, email, role, full_name)
  SELECT
    v_invite.business_id,
    p_user_id,
    p_staff_full_name,
    COALESCE(raw_user_meta_data->>'email', ''),
    v_invite.role,
    p_staff_full_name
  FROM auth.users WHERE id = p_user_id
  RETURNING id INTO v_staff_id;

  -- Mark invite used
  UPDATE invites SET used = TRUE WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.business_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE CREATE INVITE FUNCTION
-- Match frontend signature
-- ============================================
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

-- ============================================
-- UPDATED_AT TRIGGERS FOR NEW TABLES
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS leave_requests_updated_at ON leave_requests;
CREATE TRIGGER leave_requests_updated_at BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FIX AUTH CONTEXT QUERY
-- Staff should be queried by user_id, not id
-- ============================================
-- Note: This is a frontend fix, not schema. See AuthContext.tsx
