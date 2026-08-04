-- Fix staff table schema to match RPC functions
-- This migration was missing, causing "column job_title does not exist" error

-- Add job_title column (used by create_business_and_owner RPC)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Add missing role values to match AuthContext.tsx
-- Current: ('owner', 'manager', 'staff')
-- Needed: ('owner', 'admin', 'manager', 'team_lead', 'staff')
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check 
  CHECK (role IN ('owner', 'admin', 'manager', 'team_lead', 'staff'));

-- Add phone column if missing (used in several pages)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add department column if missing
ALTER TABLE staff ADD COLUMN IF NOT EXISTS department TEXT;

-- Add avatar_url column if missing
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
