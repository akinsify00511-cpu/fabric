-- Humanize the staff record: personal fields that aid HR / People / the
-- Company Wall (birthdays already use date_of_birth) and let a person
-- introduce themselves beyond name + title. Also extends the onboarding RPC
-- to accept the owner's job title / position (was hardcoded to 'Owner').

-- 1. Personal / humanizing columns on staff.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS hobbies TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pronouns TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS emergency_contact TEXT;

-- 2. create_business_and_owner: accept the owner's position/job title so
-- onboarding can capture "I'm the Operations Director" instead of always
-- writing 'Owner'. CREATE OR REPLACE cannot change the parameter list, so
-- DROP then CREATE. Defaults keep existing callers (signup, invite-accept)
-- working unchanged.
DROP FUNCTION IF EXISTS create_business_and_owner(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_business_and_owner(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_business_and_owner(
  p_business_name TEXT,
  p_industry TEXT DEFAULT NULL,
  p_staff_name TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL
) RETURNS TABLE(p_business_id UUID, p_staff_id UUID) AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
BEGIN
  -- Check if user already belongs to a business
  IF EXISTS (SELECT 1 FROM staff WHERE staff.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User already belongs to a business';
  END IF;

  -- Create the business
  INSERT INTO businesses (name, industry)
  VALUES (p_business_name, p_industry)
  RETURNING businesses.id INTO v_business_id;

  -- Create the owner staff record WITH onboarding completed.
  -- job_title: use the position the user gave at onboarding, falling back to
  -- 'Owner' so the column is never empty for the business founder.
  INSERT INTO staff (staff.business_id, staff.user_id, staff.name, staff.role, staff.job_title, staff.onboarding_completed)
  VALUES (v_business_id, auth.uid(), p_staff_name, 'owner', COALESCE(NULLIF(TRIM(p_job_title), ''), 'Owner'), TRUE)
  RETURNING staff.id INTO v_staff_id;

  RETURN QUERY SELECT v_business_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_business_and_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Reload PostgREST so the new function signature + columns are visible.
NOTIFY pgrst, 'reload schema';
