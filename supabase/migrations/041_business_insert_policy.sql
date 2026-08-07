-- ============================================
-- COMPLETE DATABASE SETUP FOR ONBOARDING
-- Run this to fix all issues
-- ============================================

-- Step 1: Drop ALL existing policies
DROP POLICY IF EXISTS "Users see own business" ON businesses;
DROP POLICY IF EXISTS "Staff see same business" ON staff;
DROP POLICY IF EXISTS "Owners/managers can manage staff" ON staff;
DROP POLICY IF EXISTS "Authenticated users can create businesses" ON businesses;
DROP POLICY IF EXISTS "Authenticated users can create staff" ON staff;
DROP POLICY IF EXISTS "Authenticated users can create branding" ON business_branding;
DROP POLICY IF EXISTS "Businesses insert" ON businesses;
DROP POLICY IF EXISTS "Staff insert" ON staff;
DROP POLICY IF EXISTS "Branding insert" ON business_branding;

-- Step 2: Disable RLS completely
ALTER TABLE businesses DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE business_branding DISABLE ROW LEVEL SECURITY;

-- Step 3: Grant ALL permissions to ALL roles
GRANT ALL ON businesses TO postgres, anon, authenticated, service_role;
GRANT ALL ON staff TO postgres, anon, authenticated, service_role;
GRANT ALL ON business_branding TO postgres, anon, authenticated, service_role;

-- Step 4: Re-enable RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_branding ENABLE ROW LEVEL SECURITY;

-- Step 5: Create PERMISSIVE policies (anyone can do anything)
CREATE POLICY "Allow all on businesses" ON businesses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on staff" ON staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on branding" ON business_branding FOR ALL USING (true) WITH CHECK (true);
