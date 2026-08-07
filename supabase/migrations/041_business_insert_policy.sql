-- ============================================
-- COMPLETELY DISABLE RLS for onboarding tables
-- Then re-enable with permissive policies
-- ============================================

-- Step 1: Completely drop ALL policies on these tables
DROP POLICY IF EXISTS "Users see own business" ON businesses;
DROP POLICY IF EXISTS "Authenticated users can create businesses" ON businesses;
DROP POLICY IF EXISTS "Users can insert businesses" ON businesses;
DROP POLICY IF EXISTS "Businesses insert" ON businesses;

DROP POLICY IF EXISTS "Staff see same business" ON staff;
DROP POLICY IF EXISTS "Owners/managers can manage staff" ON staff;
DROP POLICY IF EXISTS "Authenticated users can create staff" ON staff;
DROP POLICY IF EXISTS "Users can insert staff" ON staff;
DROP POLICY IF EXISTS "Staff insert" ON staff;

DROP POLICY IF EXISTS "Authenticated users can create branding" ON business_branding;
DROP POLICY IF EXISTS "Users can insert branding" ON business_branding;
DROP POLICY IF EXISTS "Branding insert" ON business_branding;

-- Step 2: Disable RLS completely
ALTER TABLE businesses DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE business_branding DISABLE ROW LEVEL SECURITY;

-- Step 3: Grant all permissions to all roles
GRANT ALL ON businesses TO postgres, anon, authenticated, service_role;
GRANT ALL ON staff TO postgres, anon, authenticated, service_role;
GRANT ALL ON business_branding TO postgres, anon, authenticated, service_role;
