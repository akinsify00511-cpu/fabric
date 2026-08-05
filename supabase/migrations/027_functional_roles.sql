-- ============================================
-- Functional Roles System
-- Enables per-business role definitions and tool access control
-- ============================================

-- Catalog of functional roles per business
CREATE TABLE IF NOT EXISTS functional_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, name)
);

-- Tools/modules each role can access
CREATE TABLE IF NOT EXISTS functional_role_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  functional_role_id UUID REFERENCES functional_roles(id) ON DELETE CASCADE NOT NULL,
  tool_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(functional_role_id, tool_key)
);

-- Staff to functional roles mapping (many-to-many)
CREATE TABLE IF NOT EXISTS staff_functional_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE NOT NULL,
  functional_role_id UUID REFERENCES functional_roles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, functional_role_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_functional_roles_business ON functional_roles(business_id);
CREATE INDEX IF NOT EXISTS idx_functional_role_tools_role ON functional_role_tools(functional_role_id);
CREATE INDEX IF NOT EXISTS idx_staff_functional_roles_staff ON staff_functional_roles(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_functional_roles_role ON staff_functional_roles(functional_role_id);

-- Enable RLS
ALTER TABLE functional_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE functional_role_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_functional_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for functional_roles
CREATE POLICY "Users can view own business functional roles"
  ON functional_roles FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage own business functional roles"
  ON functional_roles FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for functional_role_tools
CREATE POLICY "Users can view role tools"
  ON functional_role_tools FOR SELECT
  USING (
    functional_role_id IN (
      SELECT id FROM functional_roles WHERE business_id IN (
        SELECT business_id FROM staff WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins can manage role tools"
  ON functional_role_tools FOR ALL
  USING (
    functional_role_id IN (
      SELECT id FROM functional_roles WHERE business_id IN (
        SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- RLS Policies for staff_functional_roles
CREATE POLICY "Users can view own functional roles"
  ON staff_functional_roles FOR SELECT
  USING (
    staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage staff functional roles"
  ON staff_functional_roles FOR ALL
  USING (
    staff_id IN (
      SELECT id FROM staff WHERE business_id IN (
        SELECT business_id FROM staff WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_functional_roles_updated_at
  BEFORE UPDATE ON functional_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Seed default functional roles
-- ============================================
CREATE OR REPLACE FUNCTION seed_default_functional_roles(p_business_id UUID)
RETURNS VOID AS $$
DECLARE
  sales_role_id UUID;
  marketing_role_id UUID;
  finance_role_id UUID;
  ops_role_id UUID;
  hr_role_id UUID;
  support_role_id UUID;
  engineering_role_id UUID;
BEGIN
  -- Sales
  INSERT INTO functional_roles (business_id, name, description, is_default)
  VALUES (p_business_id, 'Sales', 'Manages leads, deals, and customer relationships', true)
  ON CONFLICT (business_id, name) DO NOTHING
  RETURNING id INTO sales_role_id;
  
  -- Marketing
  INSERT INTO functional_roles (business_id, name, description, is_default)
  VALUES (p_business_id, 'Marketing', 'Handles campaigns, social media, and brand', true)
  ON CONFLICT (business_id, name) DO NOTHING
  RETURNING id INTO marketing_role_id;
  
  -- Finance
  INSERT INTO functional_roles (business_id, name, description, is_default)
  VALUES (p_business_id, 'Finance', 'Manages accounting, invoicing, and payments', true)
  ON CONFLICT (business_id, name) DO NOTHING
  RETURNING id INTO finance_role_id;
  
  -- Operations
  INSERT INTO functional_roles (business_id, name, description, is_default)
  VALUES (p_business_id, 'Operations', 'Handles projects, inventory, and logistics', true)
  ON CONFLICT (business_id, name) DO NOTHING
  RETURNING id INTO ops_role_id;
  
  -- HR
  INSERT INTO functional_roles (business_id, name, description, is_default)
  VALUES (p_business_id, 'HR', 'Manages people, onboarding, and approvals', true)
  ON CONFLICT (business_id, name) DO NOTHING
  RETURNING id INTO hr_role_id;
  
  -- Support
  INSERT INTO functional_roles (business_id, name, description, is_default)
  VALUES (p_business_id, 'Support', 'Handles tickets and customer service', true)
  ON CONFLICT (business_id, name) DO NOTHING
  RETURNING id INTO support_role_id;
  
  -- Engineering
  INSERT INTO functional_roles (business_id, name, description, is_default)
  VALUES (p_business_id, 'Engineering', 'Technical development and integrations', true)
  ON CONFLICT (business_id, name) DO NOTHING
  RETURNING id INTO engineering_role_id;
  
  -- Assign default tools to each role (if role was newly created)
  IF sales_role_id IS NOT NULL THEN
    INSERT INTO functional_role_tools (functional_role_id, tool_key) VALUES
      (sales_role_id, 'crm'), (sales_role_id, 'quotes'), (sales_role_id, 'payments'), (sales_role_id, 'reports')
    ON CONFLICT DO NOTHING;
  END IF;
  
  IF marketing_role_id IS NOT NULL THEN
    INSERT INTO functional_role_tools (functional_role_id, tool_key) VALUES
      (marketing_role_id, 'campaigns'), (marketing_role_id, 'social'), (marketing_role_id, 'crm'), (marketing_role_id, 'reports')
    ON CONFLICT DO NOTHING;
  END IF;
  
  IF finance_role_id IS NOT NULL THEN
    INSERT INTO functional_role_tools (functional_role_id, tool_key) VALUES
      (finance_role_id, 'finance'), (finance_role_id, 'payments'), (finance_role_id, 'accounting'), (finance_role_id, 'reports')
    ON CONFLICT DO NOTHING;
  END IF;
  
  IF ops_role_id IS NOT NULL THEN
    INSERT INTO functional_role_tools (functional_role_id, tool_key) VALUES
      (ops_role_id, 'projects'), (ops_role_id, 'inventory'), (ops_role_id, 'requisitions'), (ops_role_id, 'tasks')
    ON CONFLICT DO NOTHING;
  END IF;
  
  IF hr_role_id IS NOT NULL THEN
    INSERT INTO functional_role_tools (functional_role_id, tool_key) VALUES
      (hr_role_id, 'people'), (hr_role_id, 'approvals'), (hr_role_id, 'reports'), (hr_role_id, 'tasks')
    ON CONFLICT DO NOTHING;
  END IF;
  
  IF support_role_id IS NOT NULL THEN
    INSERT INTO functional_role_tools (functional_role_id, tool_key) VALUES
      (support_role_id, 'tickets'), (support_role_id, 'crm'), (support_role_id, 'chat'), (support_role_id, 'reports')
    ON CONFLICT DO NOTHING;
  END IF;
  
  IF engineering_role_id IS NOT NULL THEN
    INSERT INTO functional_role_tools (functional_role_id, tool_key) VALUES
      (engineering_role_id, 'projects'), (engineering_role_id, 'automations'), (engineering_role_id, 'integrations'), (engineering_role_id, 'api')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Seed for existing businesses
DO $$
DECLARE
  b RECORD;
BEGIN
  FOR b IN SELECT id FROM businesses LOOP
    PERFORM seed_default_functional_roles(b.id);
  END LOOP;
END $$;

-- Add functional_role_id to staff table (optional link to primary role)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS functional_role_id UUID REFERENCES functional_roles(id);

-- Note: For existing staff, they'll get access via staff_functional_roles
-- The Shell.tsx will use staff_functional_roles for tool access (many-to-many)

COMMENT ON TABLE functional_roles IS 'Business-configurable functional roles (Sales, Marketing, etc.)';
COMMENT ON TABLE functional_role_tools IS 'Maps functional roles to tools/modules they can access';
COMMENT ON TABLE staff_functional_roles IS 'Many-to-many mapping of staff to functional roles';
