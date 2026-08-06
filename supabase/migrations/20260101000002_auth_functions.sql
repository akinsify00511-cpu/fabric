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
) RETURNS TABLE(business_id UUID, staff_id UUID) AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
BEGIN
  -- Check if user already belongs to a business
  IF EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User already belongs to a business';
  END IF;
  
  -- Create the business
  INSERT INTO businesses (name, industry)
  VALUES (p_business_name, p_industry)
  RETURNING id INTO v_business_id;
  
  -- Create the owner staff record WITH onboarding completed
  INSERT INTO staff (business_id, user_id, name, role, job_title, onboarding_completed)
  VALUES (v_business_id, auth.uid(), p_staff_name, 'owner', 'Owner', TRUE)
  RETURNING id INTO v_staff_id;
  
  RETURN QUERY SELECT v_business_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- accept_invite
-- Accepts an invite and adds the user as staff
CREATE OR REPLACE FUNCTION accept_invite(
  p_token TEXT,
  p_staff_name TEXT DEFAULT NULL
) RETURNS TABLE(business_id UUID, staff_id UUID, role TEXT) AS $$
DECLARE
  v_invite RECORD;
  v_staff_id UUID;
BEGIN
  -- Get the invite
  SELECT * INTO v_invite FROM invites
  WHERE token = p_token 
    AND used = FALSE 
    AND (expires_at IS NULL OR expires_at > now());
  
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;
  
  -- Verify email matches the signed-in user
  IF v_invite.email != (SELECT email FROM auth.users WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Email mismatch - use the invited email address';
  END IF;
  
  -- Check if user already joined this business
  IF EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND business_id = v_invite.business_id) THEN
    RAISE EXCEPTION 'Already a member of this business';
  END IF;
  
  -- Create staff record
  INSERT INTO staff (business_id, user_id, name, role)
  VALUES (
    v_invite.business_id, 
    auth.uid(), 
    COALESCE(p_staff_name, (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid())),
    v_invite.role
  )
  RETURNING id INTO v_staff_id;
  
  -- Mark invite as used
  UPDATE invites SET used = TRUE WHERE id = v_invite.id;
  
  RETURN QUERY SELECT v_invite.business_id, v_staff_id, v_invite.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_invite_info
-- Returns info about an invite (public, for the join page)
CREATE OR REPLACE FUNCTION get_invite_info(invite_id TEXT)
RETURNS TABLE(
  business_id UUID, 
  business_name TEXT, 
  role TEXT, 
  email TEXT, 
  invited_by_name TEXT, 
  valid BOOLEAN, 
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.business_id,
    b.name as business_name,
    i.role,
    i.email,
    COALESCE(s.name, 'Admin') as invited_by_name,
    (NOT i.used AND (i.expires_at IS NULL OR i.expires_at > now())) as valid,
    i.expires_at
  FROM invites i
  JOIN businesses b ON b.id = i.business_id
  LEFT JOIN staff s ON s.id = i.created_by
  WHERE i.token = invite_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_business_and_owner TO authenticated;
GRANT EXECUTE ON FUNCTION accept_invite TO authenticated;
GRANT EXECUTE ON FUNCTION get_invite_info TO authenticated;
GRANT EXECUTE ON FUNCTION get_invite_info TO anon;
