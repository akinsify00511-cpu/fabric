-- ============================================
-- Add INSERT policy for businesses table
-- This allows new users to create a business during onboarding
-- ============================================

-- Drop existing insert policy if exists
DROP POLICY IF EXISTS "Authenticated users can create businesses" ON businesses;

-- Create policy: Any authenticated user can INSERT a business
CREATE POLICY "Authenticated users can create businesses"
  ON businesses FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Grant permissions
GRANT INSERT ON businesses TO authenticated;
GRANT INSERT ON businesses TO anon;
