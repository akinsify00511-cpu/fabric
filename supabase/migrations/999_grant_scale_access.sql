-- ============================================
-- GRANT SCALE ACCOUNT ACCESS
-- Staff: Oluwafemi Akintola (dgtlzfemi@gmail.com)
-- ============================================

-- Insert or update staff record with all provided data
INSERT INTO staff (
  id,
  business_id,
  user_id,
  name,
  email,
  role,
  full_name,
  created_at,
  updated_at
) VALUES (
  '8ea1ed5c-25eb-4860-b8ee-e3769bb2cbbf',
  '4c6f65d8-b4ea-4420-95d7-409d906f0a16',
  'c42f1b21-c0f3-4318-8cd8-9dbb3dda7378',
  'Oluwafemi Akintola',
  'dgtlzfemi@gmail.com',
  'owner',
  'Oluwafemi Akintola',
  '2026-08-07 11:33:27.246514+00'::timestamptz,
  '2026-08-07 11:33:27.246514+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  business_id = EXCLUDED.business_id,
  user_id = EXCLUDED.user_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  updated_at = NOW();

-- Grant owner role privileges (all permissions)
UPDATE staff 
SET role = 'owner',
    is_admin = true,
    updated_at = NOW()
WHERE id = '8ea1ed5c-25eb-4860-b8ee-e3769bb2cbbf';

-- Verify the update
SELECT 
  id, 
  business_id, 
  name, 
  email, 
  role, 
  is_admin,
  created_at,
  updated_at
FROM staff 
WHERE id = '8ea1ed5c-25eb-4860-b8ee-e3769bb2cbbf';
