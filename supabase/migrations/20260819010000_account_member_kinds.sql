-- Account member kinds (owner / staff / consultant / vendor / expert /
-- partner) as a FIRST-CLASS membership identity.
--
-- CONTEXT (the gap this closes):
--   * Membership was `staff` rows only. `staff.role` (024) expresses SENIORITY
--     inside the business (owner/admin/manager/team_lead/staff); it cannot
--     express WHAT KIND of account the member is (internal employee vs
--     external consultant/vendor/expert/partner).
--   * `functional_roles` (027) is a tool-access layer, not identity.
--   * `vendors` (045) is a business record (supplier), not a member account.
--   * `persona_type` (069) is persona intelligence, not membership identity.
--   * Invites only captured a role — a consultant invited by email arrived as
--     indistinguishable from an employee.
--
-- ARCHITECTURE (composition-first, §0.5):
--   * ADDITIVE on the canonical `staff` table — NO parallel membership table.
--   * `member_kind` is IDENTITY + UX composition. It is NOT the authorization
--     boundary: `staff.role` + RLS remain authoritative (same invariant as
--     Session 20 "selection is UX, not security" and Session 25's active_role).
--     A consultant's member_kind emphasizes a narrower surface; it never grants
--     access the role denies, and RLS keeps enforcing role/business scope.
--
-- INVITABLE kinds: staff / consultant / vendor / expert / partner. 'owner' is
-- never invitable — ownership is created by create_business_and_owner or a
-- subsidiary flow, not by email invite.

-- =============================================================================
-- 1. staff.member_kind — the first-class account identity attribute.
-- =============================================================================
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS member_kind TEXT NOT NULL DEFAULT 'staff';

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_member_kind_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_member_kind_check
  CHECK (member_kind IN ('owner', 'staff', 'consultant', 'vendor', 'expert', 'partner'));

-- Backfill: the founding/creator rows with role 'owner' are OWNERS; everything
-- else is an internal staff member. Idempotent (safe to re-run).
UPDATE public.staff SET member_kind = 'owner' WHERE role = 'owner' AND member_kind = 'staff';

CREATE INDEX IF NOT EXISTS idx_staff_business_member_kind
  ON public.staff (business_id, member_kind);

COMMENT ON COLUMN public.staff.member_kind IS
  'First-class account identity: owner | staff | consultant | vendor | expert | partner. Identity/UX only — role + RLS remain the authorization boundary.';

-- =============================================================================
-- 2. invites.member_kind — capture the kind at invite time.
-- =============================================================================
ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS member_kind TEXT NOT NULL DEFAULT 'staff';

ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_member_kind_check;
ALTER TABLE public.invites
  ADD CONSTRAINT invites_member_kind_check
  CHECK (member_kind IN ('owner', 'staff', 'consultant', 'vendor', 'expert', 'partner'));

-- =============================================================================
-- 3. create_invite — accept p_member_kind (DROP the prior 4-arg overload so
--    there is exactly ONE signature, mirroring the seat-check fix pattern).
-- =============================================================================
DROP FUNCTION IF EXISTS public.create_invite(TEXT, TEXT, UUID, INT);

CREATE OR REPLACE FUNCTION public.create_invite(
  p_email TEXT,
  p_role TEXT DEFAULT 'staff',
  p_member_kind TEXT DEFAULT 'staff',
  p_business_id UUID DEFAULT NULL,
  p_expires_days INT DEFAULT 7
)
RETURNS TABLE(p_token TEXT, p_join_url TEXT, p_business_name TEXT, p_seat_available BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $_function_$
DECLARE
  v_business_id UUID;
  v_inviter staff%ROWTYPE;
  v_seat_ok BOOLEAN;
  v_token TEXT;
BEGIN
  SELECT * INTO v_inviter FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only business members can send invites.' USING ERRCODE = '42501';
  END IF;

  v_business_id := COALESCE(p_business_id, v_inviter.business_id);

  IF v_inviter.business_id != v_business_id
     OR v_inviter.role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Not authorized to invite to this business.' USING ERRCODE = '42501';
  END IF;

  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'Invitee email is required' USING ERRCODE = '23502';
  END IF;

  IF p_role NOT IN ('admin', 'manager', 'team_lead', 'staff') THEN
    RAISE EXCEPTION 'Invalid role. Allowed: admin, manager, team_lead, staff.' USING ERRCODE = '23514';
  END IF;

  -- 'owner' is never invitable; other kinds are.
  IF p_member_kind NOT IN ('staff', 'consultant', 'vendor', 'expert', 'partner') THEN
    RAISE EXCEPTION 'Invalid member kind. Allowed: staff, consultant, vendor, expert, partner.' USING ERRCODE = '23514';
  END IF;

  SELECT public.can_add_team_member(v_business_id) INTO v_seat_ok;
  IF v_seat_ok IS NOT TRUE THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invites
    WHERE business_id = v_business_id
      AND email = lower(btrim(p_email))
      AND used = FALSE
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RAISE EXCEPTION 'A pending invite already exists for this email.' USING ERRCODE = '23505';
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.invites (business_id, email, role, member_kind, token, created_by, expires_at)
  VALUES (v_business_id, lower(btrim(p_email)), p_role, p_member_kind, v_token, v_inviter.id,
          CASE WHEN p_expires_days > 0 THEN now() + (p_expires_days || ' days')::INTERVAL ELSE NULL END);

  RETURN QUERY
    SELECT
      v_token,
      '/join/' || v_token,
      (SELECT name FROM public.businesses WHERE id = v_business_id),
      TRUE;
END
$_function_$;

REVOKE EXECUTE ON FUNCTION public.create_invite(TEXT, TEXT, TEXT, UUID, INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_invite(TEXT, TEXT, TEXT, UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.create_invite(TEXT, TEXT, TEXT, UUID, INT) IS
  'Create a staff invite with a first-class member kind (staff/consultant/vendor/expert/partner; owner is not invitable). SECURITY DEFINER. Enforces can_add_team_member seat limit server-side.';

-- =============================================================================
-- 4. accept_invite — carry member_kind from the invite into the staff row.
-- =============================================================================
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

  -- email included: 001 makes staff.email NOT NULL, so the 110 version of
  -- this INSERT failed on EVERY invite acceptance (pre-existing defect found
  -- by the apply-test). The invite row carries the email; use it.
  INSERT INTO public.staff (
    business_id,
    user_id,
    name,
    full_name,
    email,
    role,
    member_kind,
    onboarding_completed
  )
  VALUES (
    v_invite.business_id,
    auth.uid(),
    v_staff_name,
    v_staff_name,
    v_invite.email,
    v_invite.role,
    COALESCE(v_invite.member_kind, 'staff'),
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

COMMENT ON FUNCTION public.accept_invite(TEXT, TEXT) IS
  'Accept an invite and create the staff row, carrying the invited member kind.';

-- =============================================================================
-- 5. create_business_and_owner — the founder is member_kind 'owner'.
-- =============================================================================
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
  IF EXISTS (SELECT 1 FROM staff WHERE staff.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User already belongs to a business';
  END IF;

  INSERT INTO businesses (name, industry)
  VALUES (p_business_name, p_industry)
  RETURNING businesses.id INTO v_business_id;

  INSERT INTO staff (staff.business_id, staff.user_id, staff.name, staff.role, staff.job_title, staff.member_kind, staff.onboarding_completed)
  VALUES (v_business_id, auth.uid(), p_staff_name, 'owner', COALESCE(NULLIF(TRIM(p_job_title), ''), 'Owner'), 'owner', TRUE)
  RETURNING staff.id INTO v_staff_id;

  RETURN QUERY SELECT v_business_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_business_and_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION create_business_and_owner(TEXT, TEXT, TEXT, TEXT) IS
  'Create a business and its owner. The founder is member_kind ''owner''.';

-- =============================================================================
-- 6. set_member_kind — owner/admin reclassifies a member (e.g. a staff member
--    becomes an external consultant). Same-business + owner/admin guard. A
--    business must always keep at least one member_kind='owner' row (the
--    role='owner' integrity constraint already guarantees a role owner; this
--    guards the kind surface from drifting away from role ownership).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_member_kind(p_staff_id UUID, p_member_kind TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_caller staff%ROWTYPE;
  v_target_business UUID;
BEGIN
  IF p_member_kind NOT IN ('owner', 'staff', 'consultant', 'vendor', 'expert', 'partner') THEN
    RAISE EXCEPTION 'Invalid member kind.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_caller FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;
  IF NOT FOUND OR v_caller.role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only owners/admins can change a member kind.' USING ERRCODE = '42501';
  END IF;

  SELECT s.business_id INTO v_target_business FROM public.staff s WHERE s.id = p_staff_id;
  IF v_target_business IS NULL OR v_target_business != v_caller.business_id THEN
    RAISE EXCEPTION 'Member not found in your business.' USING ERRCODE = '42501';
  END IF;

  -- Never demote the last owner-kind member. Only engages when the TARGET
  -- currently holds member_kind='owner' (reclassifying a non-owner never
  -- blocks).
  IF p_member_kind != 'owner'
     AND (SELECT member_kind FROM public.staff WHERE id = p_staff_id) = 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.staff
      WHERE business_id = v_target_business
        AND member_kind = 'owner'
        AND id != p_staff_id
    ) THEN
      RAISE EXCEPTION 'A business must always have at least one owner.' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.staff SET member_kind = p_member_kind WHERE id = p_staff_id;
  RETURN TRUE;
END
$$;

REVOKE EXECUTE ON FUNCTION public.set_member_kind(UUID, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_member_kind(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.set_member_kind(UUID, TEXT) IS
  'Owner/admin reclassifies a member kind within their business. Guards the last-owner invariant. Identity only — role + RLS remain the boundary.';
