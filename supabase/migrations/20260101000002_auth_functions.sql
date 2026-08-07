-- ============================================
-- AVENIZE AUTH FUNCTIONS
-- Drop and recreate with correct signatures
-- ============================================

-- Drop existing functions first
DROP FUNCTION IF EXISTS create_business_and_owner(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS accept_invite(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_invite_info(TEXT);

-- create_business_and_owner
-- Creates a business and adds the signing up user as owner
CREATE OR REPLACE FUNCTION create_business_and_owner(
  p_business_name TEXT,
  p_industry TEXT DEFAULT NULL,
  p_staff_name TEXT DEFAULT NULL
) RETURNS TABLE(p_business_id UUID, p_staff_id UUID) AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
BEGIN
  -- Check if user already belongs to a business (use table-qualified column)
  IF EXISTS (SELECT 1 FROM staff WHERE staff.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User already belongs to a business';
  END IF;
  
  -- Create the business
  INSERT INTO businesses (name, industry)
  VALUES (p_business_name, p_industry)
  RETURNING businesses.id INTO v_business_id;
  
  -- Create the owner staff record WITH onboarding completed
  INSERT INTO staff (staff.business_id, staff.user_id, staff.name, staff.role, staff.job_title, staff.onboarding_completed)
  VALUES (v_business_id, auth.uid(), p_staff_name, 'owner', 'Owner', TRUE)
  RETURNING staff.id INTO v_staff_id;
  
  RETURN QUERY SELECT v_business_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- accept_invite
-- Accepts an invite and adds the user as staff
CREATE OR REPLACE FUNCTION accept_invite(
  p_token TEXT,
  p_staff_name TEXT DEFAULT NULL
) RETURNS TABLE(p_business_id UUID, p_staff_id UUID, p_role TEXT) AS $$
DECLARE
  v_invite RECORD;
  v_staff_id UUID;
BEGIN
  -- Get the invite
  SELECT * INTO v_invite FROM invites
  WHERE invites.token = p_token 
    AND invites.used = FALSE 
    AND (invites.expires_at IS NULL OR invites.expires_at > now());
  
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;
  
  -- Verify email matches the signed-in user
  IF v_invite.email != (SELECT auth.users.email FROM auth.users WHERE auth.users.id = auth.uid()) THEN
    RAISE EXCEPTION 'Email mismatch - use the invited email address';
  END IF;
  
  -- Check if user already joined this business (use table-qualified column)
  IF EXISTS (SELECT 1 FROM staff WHERE staff.user_id = auth.uid() AND staff.business_id = v_invite.business_id) THEN
    RAISE EXCEPTION 'Already a member of this business';
  END IF;
  
  -- Create staff record with table-qualified columns
  INSERT INTO staff (staff.business_id, staff.user_id, staff.name, staff.role)
  VALUES (
    v_invite.business_id, 
    auth.uid(), 
    COALESCE(p_staff_name, (SELECT auth.users.raw_user_meta_data->>'full_name' FROM auth.users WHERE auth.users.id = auth.uid())),
    v_invite.role
  )
  RETURNING staff.id INTO v_staff_id;
  
  -- Mark invite as used
  UPDATE invites SET invites.used = TRUE WHERE invites.id = v_invite.id;
  
  RETURN QUERY SELECT v_invite.business_id, v_staff_id, v_invite.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_invite_info
-- Returns info about an invite (public, for the join page)
CREATE OR REPLACE FUNCTION get_invite_info(invite_id TEXT)
RETURNS TABLE(
  p_business_id UUID, 
  p_business_name TEXT, 
  p_role TEXT, 
  p_email TEXT, 
  p_invited_by_name TEXT, 
  p_valid BOOLEAN, 
  p_expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    invites.business_id,
    businesses.name as business_name,
    invites.role,
    invites.email,
    COALESCE(staff.name, 'Admin') as invited_by_name,
    (NOT invites.used AND (invites.expires_at IS NULL OR invites.expires_at > now())) as valid,
    invites.expires_at
  FROM invites
  JOIN businesses ON businesses.id = invites.business_id
  LEFT JOIN staff ON staff.id = invites.created_by
  WHERE invites.token = invite_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_business_and_owner TO authenticated;
GRANT EXECUTE ON FUNCTION accept_invite TO authenticated;
GRANT EXECUTE ON FUNCTION get_invite_info TO authenticated;
GRANT EXECUTE ON FUNCTION get_invite_info TO anon;
