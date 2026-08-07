-- ============================================
-- Grant all permissions needed for onboarding
-- ============================================

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Businesses table: Grant all permissions
GRANT SELECT ON businesses TO postgres, anon, authenticated, service_role;
GRANT INSERT ON businesses TO postgres, anon, authenticated, service_role;
GRANT UPDATE ON businesses TO postgres, authenticated, service_role;
GRANT DELETE ON businesses TO postgres, service_role;

-- Staff table: Grant all permissions
GRANT SELECT ON staff TO postgres, anon, authenticated, service_role;
GRANT INSERT ON staff TO postgres, anon, authenticated, service_role;
GRANT UPDATE ON staff TO postgres, authenticated, service_role;
GRANT DELETE ON staff TO postgres, service_role;

-- Business branding table: Grant all permissions
GRANT SELECT ON business_branding TO postgres, anon, authenticated, service_role;
GRANT INSERT ON business_branding TO postgres, anon, authenticated, service_role;
GRANT UPDATE ON business_branding TO postgres, authenticated, service_role;
GRANT DELETE ON business_branding TO postgres, service_role;

-- Recreate INSERT policies
DROP POLICY IF EXISTS "Businesses insert" ON businesses;
CREATE POLICY "Businesses insert" ON businesses FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Staff insert" ON staff;
CREATE POLICY "Staff insert" ON staff FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Branding insert" ON business_branding;
CREATE POLICY "Branding insert" ON business_branding FOR INSERT TO authenticated WITH CHECK (true);
