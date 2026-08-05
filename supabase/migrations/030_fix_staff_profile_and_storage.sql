-- Migration: Fix staff profile fields and create storage bucket for avatars
-- Fixes: avatar_url, phone, department, job_title, full_name columns
-- Creates: avatars storage bucket

-- ============================================
-- STAFF TABLE COLUMNS
-- ============================================

-- Add full_name column (used throughout the app)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Add avatar_url column for profile pictures
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add phone column for contact info
ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add department column for organizational structure
ALTER TABLE staff ADD COLUMN IF NOT EXISTS department TEXT;

-- Add job_title column for role display
ALTER TABLE staff ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Update existing rows: copy name to full_name if full_name is null
UPDATE staff SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL;

-- ============================================
-- BUSINESS TABLE COLUMNS
-- ============================================

-- Add logo_url for business branding
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add address for business details
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS address TEXT;

-- Add phone for business contact
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add website URL
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS website TEXT;

-- ============================================
-- RLS POLICIES FOR STAFF PROFILE
-- ============================================

-- Allow staff to update their own profile fields
DROP POLICY IF EXISTS "staff_update_own_profile" ON staff;
CREATE POLICY "staff_update_own_profile" ON staff
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow staff to read their own profile
DROP POLICY IF EXISTS "staff_read_own_profile" ON staff;
CREATE POLICY "staff_read_own_profile" ON staff
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_staff_business_id ON staff(business_id);
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_department ON staff(department);

-- ============================================
-- AVATARS STORAGE BUCKET
-- Note: Run this separately via Supabase Dashboard if the bucket doesn't exist
-- ============================================

-- Uncomment the following to create the storage bucket:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('avatars', 'avatars', true)
-- ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for avatars
-- DROP POLICY IF EXISTS "Public avatar access" ON storage.objects;
-- CREATE POLICY "Public avatar access" ON storage.objects
--   FOR SELECT USING (bucket_id = 'avatars');

-- Allow authenticated users to upload their own avatar
-- DROP POLICY IF EXISTS "Authenticated users upload own avatar" ON storage.objects;
-- CREATE POLICY "Authenticated users upload own avatar" ON storage.objects
--   FOR INSERT WITH CHECK (
--     bucket_id = 'avatars' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- Allow users to update their own avatar
-- DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
-- CREATE POLICY "Users update own avatar" ON storage.objects
--   FOR UPDATE USING (
--     bucket_id = 'avatars' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );
