-- ============================================
-- Add INSERT policy for all onboarding-related tables
-- This allows new users to create a business during onboarding
-- ============================================

-- Disable RLS temporarily to apply policies (SECURITY DEFINER functions bypass this anyway)
ALTER TABLE businesses DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE business_branding DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_branding ENABLE ROW LEVEL SECURITY;

-- Businesses: Drop existing insert policies
DROP POLICY IF EXISTS "Authenticated users can create businesses" ON businesses;
DROP POLICY IF EXISTS "Users can insert businesses" ON businesses;

-- Businesses: Create policy - Any authenticated user can INSERT
CREATE POLICY "Authenticated users can create businesses"
  ON businesses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Businesses: Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT INSERT ON businesses TO authenticated;

-- Staff: Drop existing insert policies
DROP POLICY IF EXISTS "Authenticated users can create staff" ON staff;
DROP POLICY IF EXISTS "Users can insert staff" ON staff;

-- Staff: Create policy - Any authenticated user can INSERT
CREATE POLICY "Authenticated users can create staff"
  ON staff FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Staff: Grant permissions
GRANT INSERT ON staff TO authenticated;

-- Business Branding: Drop existing insert policies
DROP POLICY IF EXISTS "Authenticated users can create branding" ON business_branding;
DROP POLICY IF EXISTS "Users can insert branding" ON business_branding;

-- Business Branding: Create policy - Any authenticated user can INSERT
CREATE POLICY "Authenticated users can create branding"
  ON business_branding FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Business Branding: Grant permissions
GRANT INSERT ON business_branding TO authenticated;
