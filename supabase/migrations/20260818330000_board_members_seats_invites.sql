-- Board members, server-enforced seat limits, and a canonical invite-creation
-- RPC. Three missing pieces required to onboard a real multi-entity org (1
-- parent + N subsidiaries + hundreds of staff + a governance board) end-to-end.
--
-- CONTEXT (the half-fixed state this repairs):
--   * invites table (001) + accept_invite RPC (20260101000002) + Join.tsx all
--     existed and worked — but People.tsx `sendInvite()` was a fake `alert()`
--     that never inserted an invite, so the whole loop was unreachable.
--   * can_add_team_member RPC (028) existed but accept_invite NEVER called it,
--     so the seat limit was client-advisory only (bypassable via direct RPC).
--   * invites.role CHECK only allowed ('owner','manager','staff') but staff.role
--     was widened to 5 roles in 024 — admin/team_lead invites were uncreatable.
--   * No board-members concept existed at all (staff.role has no 'board').

-- =============================================================================
-- 1. Widen invites.role CHECK to match staff.role (024).
--    admin + team_lead are valid staff roles now; invites must allow them.
--    Drop the existing constraint by name (Postgres auto-names it
--    invites_role_check; the prior DO-block pattern match failed because
--    Postgres normalizes `role IN (...)` to `role = ANY (ARRAY[...])`
--    internally, so the ILIKE '%role IN%' never matched).
-- =============================================================================
ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_role_check;
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Belt-and-braces: drop any OTHER check constraint on invites.role that
  -- might exist under a non-standard name (e.g. a prior migration renamed it).
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.invites'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF v_constraint_name IS NOT NULL AND v_constraint_name != 'invites_role_check' THEN
    EXECUTE format('ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.invites
  ADD CONSTRAINT invites_role_check CHECK (role IN ('owner', 'admin', 'manager', 'team_lead', 'staff'));

-- =============================================================================
-- 1b. can_add_team_member — handle NULL team_limit + new plan codes.
--
--     The original (028) treated team_limit IS NULL as 3 (the free default)
--     via `IF v_team_limit IS NULL THEN v_team_limit := 3`. But the new pricing
--     tiers (team/business/pro/scale from 20260818200000) are not in 028's plan
--     CASE, and the Scale plan advertises seats_included=NULL = unlimited.
--     Re-declared: when team_limit is explicitly set, use it; otherwise derive
--     from the plan (covering all 8 codes, with scale/enterprise = unlimited).
--     This means a Scale subscriber with 250 staff is allowed (1,000,000 cap),
--     while a free plan stays at 3 — regardless of whether team_limit was
--     explicitly seeded.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.can_add_team_member(p_business_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_team_limit INTEGER;
  v_plan TEXT;
  v_current_count INTEGER;
BEGIN
  SELECT e.team_limit, e.plan INTO v_team_limit, v_plan
  FROM public.business_entitlements e
  WHERE e.business_id = p_business_id;

  -- Derive from plan when no explicit team_limit (covers all 8 plan codes).
  -- scale/enterprise → 1,000,000 (effectively unlimited, bounded).
  IF v_team_limit IS NULL THEN
    v_team_limit := CASE COALESCE(v_plan, 'free')
      WHEN 'free' THEN 3
      WHEN 'starter' THEN 10
      WHEN 'team' THEN 15
      WHEN 'business' THEN 30
      WHEN 'professional' THEN 50
      WHEN 'pro' THEN 60
      WHEN 'scale' THEN 1000000
      WHEN 'enterprise' THEN 1000000
      ELSE 3
    END;
  END IF;

  v_current_count := public.get_team_count(p_business_id);
  RETURN v_current_count < v_team_limit;
END
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.can_add_team_member IS
  'Check if a business can add more staff. Uses explicit team_limit or a plan-derived default (all 8 plan codes; scale/enterprise = unlimited). Seat limit is the real boundary, enforced in accept_invite.';

-- =============================================================================
-- 2. board_members — governance roster, separate from operational staff.
--
--    A board member is NOT a staff member: they oversee (governance/strategy/
--    fiduciary duty) rather than operate the day-to-day business, so they do
--    not get a `staff` row (no auth login to the app, no business_id-scoped
--    operational RLS). This keeps the operational perimeter clean: only real
--    employees appear in People.tsx / HR / payroll; the board is a distinct,
--    owner-managed roster surfaced on a dedicated page.
--
--    Optional user_id links a board member to an auth account so an owner who
--    is ALSO a director can be cross-referenced — but the board row itself is
--    governance metadata, not an access grant.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT NOT NULL DEFAULT 'Director'
    CHECK (title IN ('Chair', 'Vice Chair', 'Director', 'Secretary', 'Treasurer', 'Member', 'Observer')),
  bio TEXT,
  term_start DATE,
  term_end DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  user_id UUID,  -- optional: link to auth.users if the director also has an account
  appointed_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_members_business ON public.board_members(business_id);
CREATE INDEX IF NOT EXISTS idx_board_members_active ON public.board_members(business_id, is_active);

ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;

-- Only members of the business can see its board; only owner/admin can write.
DROP POLICY IF EXISTS board_members_business_read ON public.board_members;
CREATE POLICY board_members_business_read ON public.board_members
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS board_members_owner_admin_insert ON public.board_members;
CREATE POLICY board_members_owner_admin_insert ON public.board_members
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (SELECT business_id FROM public.get_current_staff())
    AND (SELECT role FROM public.get_current_staff()) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS board_members_owner_admin_update ON public.board_members;
CREATE POLICY board_members_owner_admin_update ON public.board_members
  FOR UPDATE TO authenticated
  USING (
    business_id IN (SELECT business_id FROM public.get_current_staff())
    AND (SELECT role FROM public.get_current_staff()) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS board_members_owner_admin_delete ON public.board_members;
CREATE POLICY board_members_owner_admin_delete ON public.board_members
  FOR DELETE TO authenticated
  USING (
    business_id IN (SELECT business_id FROM public.get_current_staff())
    AND (SELECT role FROM public.get_current_staff()) IN ('owner', 'admin')
  );

DROP TRIGGER IF EXISTS trg_board_members_updated_at ON public.board_members;
CREATE TRIGGER trg_board_members_updated_at
  BEFORE UPDATE ON public.board_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- 3. create_invite — canonical invite creation (single source of truth).
--
--    Replaces the fake People.tsx alert(). SECURITY DEFINER so it can write
--    the invite row + read business_entitlements for the seat check in one
--    atomic call. Enforces can_add_team_member so the seat limit cannot be
--    bypassed by calling the RPC directly (the prior gap).
--
--    Returns the invite token + the join URL so the UI can show a copyable
--    link (the "easier than WhatsApp" path — owner sends the link via any
--    channel) AND optionally trigger an email.
--
--    DROP the prior 2-arg overload (001/002) — it was the UNSAFE version
--    with no seat enforcement. Keeping it would leave two create_invite
--    signatures, making COMMENT/GRANT ambiguous + letting callers bypass
--    the seat check by using the old 2-arg form.
-- =============================================================================
DROP FUNCTION IF EXISTS public.create_invite(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_invite(
  p_email TEXT,
  p_role TEXT DEFAULT 'staff',
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
  -- Resolve the inviter + target business.
  SELECT * INTO v_inviter FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only business members can send invites.' USING ERRCODE = '42501';
  END IF;

  v_business_id := COALESCE(p_business_id, v_inviter.business_id);

  -- Inviter must belong to the target business + be owner/admin/manager.
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

  -- Enforce the seat limit server-side (the core fix). can_add_team_member
  -- reads business_entitlements.team_limit. NULL team_limit = unlimited (Scale).
  SELECT public.can_add_team_member(v_business_id) INTO v_seat_ok;
  IF v_seat_ok IS NOT TRUE THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE;
    RETURN;
  END IF;

  -- Don't create a duplicate pending invite for the same email+business.
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

  INSERT INTO public.invites (business_id, email, role, token, created_by, expires_at)
  VALUES (v_business_id, lower(btrim(p_email)), p_role, v_token, v_inviter.id,
          CASE WHEN p_expires_days > 0 THEN now() + (p_expires_days || ' days')::INTERVAL ELSE NULL END);

  RETURN QUERY
    SELECT
      v_token,
      '/join/' || v_token,
      (SELECT name FROM public.businesses WHERE id = v_business_id),
      TRUE;
END
$_function_$;

REVOKE EXECUTE ON FUNCTION public.create_invite(TEXT, TEXT, UUID, INT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_invite(TEXT, TEXT, UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.create_invite(TEXT, TEXT, UUID, INT) IS
  'Create a staff invite. SECURITY DEFINER. Enforces can_add_team_member (seat limit) server-side. Returns {token, join_url, business_name, seat_available}. Owner/admin/manager only.';

-- =============================================================================
-- 4. revoke_invite — cancel a pending invite (owner/admin only).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.revoke_invite(p_invite_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $_function_$
DECLARE
  v_inviter_role TEXT;
BEGIN
  SELECT s.role INTO v_inviter_role
  FROM public.invites i
  JOIN public.staff s ON s.business_id = i.business_id AND s.user_id = auth.uid()
  WHERE i.id = p_invite_id;

  IF v_inviter_role IS NULL OR v_inviter_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Not authorized to revoke this invite.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.invites WHERE id = p_invite_id AND used = FALSE;
  RETURN FOUND;
END
$_function_$;

REVOKE EXECUTE ON FUNCTION public.revoke_invite(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.revoke_invite(UUID) TO authenticated;

-- =============================================================================
-- 5. Enforce seat limit INSIDE accept_invite (the core server-side gate).
--
--    accept_invite (20260101000002) created the staff row without checking
--    can_add_team_member — a client calling the RPC directly bypassed the
--    seat limit entirely. Re-declare with the check BEFORE the INSERT. All
--    other logic (email match, already-member, token validity) preserved.
--
--    DROP stale overloads from 001/002 first so there's exactly ONE
--    accept_invite signature (TEXT, TEXT) — robust even if 20260101000002
--    (which does the same drops) failed to apply on a given DB.
-- =============================================================================
DROP FUNCTION IF EXISTS public.accept_invite(TEXT, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.accept_invite(TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.accept_invite(
  p_token TEXT,
  p_staff_name TEXT DEFAULT NULL
) RETURNS TABLE(p_business_id UUID, p_staff_id UUID, p_role TEXT) AS $$
DECLARE
  v_invite RECORD;
  v_staff_id UUID;
  v_seat_ok BOOLEAN;
BEGIN
  SELECT * INTO v_invite FROM public.invites
  WHERE invites.token = p_token
    AND invites.used = FALSE
    AND (invites.expires_at IS NULL OR invites.expires_at > now());

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite' USING ERRCODE = 'P0002';
  END IF;

  IF v_invite.email != (SELECT auth.users.email FROM auth.users WHERE auth.users.id = auth.uid()) THEN
    RAISE EXCEPTION 'Email mismatch - use the invited email address' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM staff WHERE staff.user_id = auth.uid() AND staff.business_id = v_invite.business_id) THEN
    RAISE EXCEPTION 'Already a member of this business' USING ERRCODE = '23505';
  END IF;

  -- SERVER-SIDE SEAT ENFORCEMENT (the fix). Fails closed: if the seat check
  -- errors or returns false, the invite cannot be accepted even though it's
  -- valid — preventing over-subscription when an admin invited more people
  -- than the plan allows (e.g. downgraded the plan after sending invites).
  SELECT public.can_add_team_member(v_invite.business_id) INTO v_seat_ok;
  IF v_seat_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'Seat limit reached for this plan. Ask an admin to upgrade or remove a seat.' USING ERRCODE = '55006';
  END IF;

  INSERT INTO staff (staff.business_id, staff.user_id, staff.name, staff.role)
  VALUES (
    v_invite.business_id,
    auth.uid(),
    COALESCE(p_staff_name, (SELECT auth.users.raw_user_meta_data->>'full_name' FROM auth.users WHERE auth.users.id = auth.uid())),
    v_invite.role
  )
  RETURNING staff.id INTO v_staff_id;

  UPDATE invites SET invites.used = TRUE WHERE invites.id = v_invite.id;

  RETURN QUERY SELECT v_invite.business_id, v_staff_id, v_invite.role;
END
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the prior 2-arg overload signature if a stale one lingers (20260101000002
-- used the same signature, so CREATE OR REPLACE replaces it; this is belt-and-
-- braces for any older drift).
GRANT EXECUTE ON FUNCTION public.accept_invite(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.accept_invite(TEXT, TEXT) IS
  'Accept a staff invite by token. SECURITY DEFINER. Enforces can_add_team_member (seat limit) server-side before creating the staff row. Email must match the invited address.';
