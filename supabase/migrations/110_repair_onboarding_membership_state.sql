-- Repair stale onboarding state and make invite membership onboarding authoritative.
--
-- Owners with an existing business are already through the business-creation
-- onboarding flow. A stale FALSE flag traps them behind RequireAuth.
UPDATE public.staff
SET onboarding_completed = TRUE,
    full_name = COALESCE(full_name, name),
    updated_at = now()
WHERE role = 'owner'
  AND business_id IS NOT NULL
  AND onboarding_completed = FALSE;

-- Invited staff complete membership onboarding through the invite flow.
-- They must not be forced through the owner/business creation wizard.
DROP FUNCTION IF EXISTS public.accept_invite(TEXT, TEXT);

CREATE FUNCTION public.accept_invite(
  p_token TEXT,
  p_staff_name TEXT DEFAULT NULL
) RETURNS TABLE(p_business_id UUID, p_staff_id UUID, p_role TEXT) AS $$
DECLARE
  v_invite RECORD;
  v_staff_id UUID;
  v_user_email TEXT;
  v_staff_name TEXT;
BEGIN
  SELECT * INTO v_invite
  FROM public.invites
  WHERE invites.token = p_token
    AND invites.used = FALSE
    AND (invites.expires_at IS NULL OR invites.expires_at > now());

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite';
  END IF;

  SELECT auth.users.email INTO v_user_email
  FROM auth.users
  WHERE auth.users.id = auth.uid();

  IF v_invite.email != v_user_email THEN
    RAISE EXCEPTION 'Email mismatch - use the invited email address';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff
    WHERE staff.user_id = auth.uid()
      AND staff.business_id = v_invite.business_id
  ) THEN
    RAISE EXCEPTION 'Already a member of this business';
  END IF;

  v_staff_name := COALESCE(
    NULLIF(trim(p_staff_name), ''),
    (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid()),
    'Team member'
  );

  INSERT INTO public.staff (
    business_id,
    user_id,
    name,
    full_name,
    role,
    onboarding_completed
  )
  VALUES (
    v_invite.business_id,
    auth.uid(),
    v_staff_name,
    v_staff_name,
    v_invite.role,
    TRUE
  )
  RETURNING staff.id INTO v_staff_id;

  UPDATE public.invites
  SET used = TRUE
  WHERE invites.id = v_invite.id;

  RETURN QUERY SELECT v_invite.business_id, v_staff_id, v_invite.role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.accept_invite(TEXT, TEXT) TO authenticated;
