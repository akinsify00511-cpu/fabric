-- ============================================
-- Add INSERT policy for businesses and staff tables
-- This allows new users to create a business during onboarding
-- ============================================

-- Businesses: Drop existing insert policy if exists
DROP POLICY IF EXISTS "Authenticated users can create businesses" ON businesses;

-- Businesses: Create policy - Any authenticated user can INSERT
CREATE POLICY "Authenticated users can create businesses"
  ON businesses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Businesses: Grant permissions
GRANT INSERT ON businesses TO authenticated;
GRANT INSERT ON businesses TO anon;

-- Staff: Drop existing insert policy if exists
DROP POLICY IF EXISTS "Authenticated users can create staff" ON staff;

-- Staff: Create policy - Any authenticated user can INSERT
CREATE POLICY "Authenticated users can create staff"
  ON staff FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Staff: Grant permissions
GRANT INSERT ON staff TO authenticated;
GRANT INSERT ON staff TO anon;
