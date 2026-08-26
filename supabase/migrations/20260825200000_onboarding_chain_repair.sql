-- =============================================================================
-- P0 Onboarding-chain repair (forward-only, idempotent).
--
-- Root cause of the production failure:
--   "null value in column \"organization_id\" of relation \"businesses\"
--    violates not-null constraint"
--
-- Production applied 20260817150000_multi_entity_foundation_v1 (which made
-- businesses.organization_id NOT NULL and introduced organizations/
-- organization_memberships) but did NOT apply the later repair chain that
-- redefines create_business_and_owner to create the organization first.
-- The function currently in force on production is the stale
-- 20260819015000_account_member_kinds body, which inserts the business with
-- no organization_id -> 23502.
--
-- This migration is forward-only and idempotent. It does NOT:
--   - make organization_id nullable
--   - weaken/remove any RLS policy or the NOT NULL constraint
--   - patch data manually
--   - bypass authentication (the RPC still requires auth.uid())
--
-- It re-establishes the canonical architecture so a first-time signup:
--   1. creates the organization
--   2. creates the business with the correct organization_id
--   3. grants the founder group_owner organization membership
--   4. creates the owner staff row (email NOT NULL backfilled from auth)
--   5. ensures the #general channel + owner membership exist
--   6. refuses a second business for the same user (recoverable, no loop)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. channel_members: guarantee the canonical staff_id column.
--    A hand-built user_id-shaped table pre-exists on production; 998's
--    "ADD COLUMN IF NOT EXISTS staff_id" was a no-op there, so the canonical
--    get_my_channels() and create_business_and_owner (which join on
--    cm.staff_id) failed with "column staff_id does not exist". Add the
--    column additively and relax user_id to nullable so both the legacy
--    user_id rows and the canonical staff_id rows are valid. Never drop
--    user_id (it holds existing membership data). On a FRESH database the
--    canonical 005 shape already has staff_id and no user_id, so guard the
--    legacy-only ALTER against a missing user_id column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'channel_members' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.channel_members ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_channel_members_staff
  ON public.channel_members (staff_id);

-- channel_members had RLS enabled with ZERO policies on production (the
-- 005 policies never landed because the hand-built table pre-existed), which
-- denied EVERY insert/select — including the SECURITY DEFINER RPC's owner
-- join. Restore the channel_members access policies. The 005 SELECT policy
-- was self-referencing (USING (channel_id IN (SELECT channel_id FROM
-- channel_members ...))) which causes INFINITE RECURSION on a fresh
-- evaluation, so both policies are defined non-recursively: scoped through
-- the channel's business (get_current_staff-scoped, never USING(true)).
-- Idempotent via DROP IF EXISTS.
DROP POLICY IF EXISTS "Channel members visible" ON public.channel_members;
CREATE POLICY "Channel members visible"
  ON public.channel_members FOR SELECT
  USING (channel_id IN (
    SELECT c.id FROM public.channels c
    WHERE c.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

DROP POLICY IF EXISTS "Channel members join" ON public.channel_members;
CREATE POLICY "Channel members join"
  ON public.channel_members FOR INSERT
  WITH CHECK (channel_id IN (
    SELECT c.id FROM public.channels c
    WHERE c.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

-- The channels SELECT policy is the other half of the recursion: it
-- referenced channel_members, whose SELECT policy now references channels.
-- Redefine it without the channel_members subquery (business-scope only).
DROP POLICY IF EXISTS "Channels visible to business" ON public.channels;
CREATE POLICY "Channels visible to business"
  ON public.channels FOR SELECT
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

-- ---------------------------------------------------------------------------
-- 2. get_my_channels — canonical business-scoped definition. The 005 version
--    has a latent "column reference id is ambiguous" defect (unqualified
--    c.id inside RETURN QUERY against OUT params) and is superseded by the
--    046 chat_conversations architecture (which the frontend falls back to).
--    Replace with the canonical 998 business-scoped shape so the chat page
--    loads and the onboarding channel join is verifiable.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_my_channels(UUID);
DROP FUNCTION IF EXISTS public.get_my_channels();

CREATE OR REPLACE FUNCTION public.get_my_channels()
RETURNS TABLE (
  id UUID,
  business_id UUID,
  name TEXT,
  description TEXT,
  type TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.business_id, c.name, c.description, c.type, c.created_by, c.created_at
  FROM public.channels c
  INNER JOIN public.channel_members cm ON c.id = cm.channel_id
  INNER JOIN public.staff s ON cm.staff_id = s.id
  WHERE s.user_id = auth.uid()
  ORDER BY c.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_my_channels() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Re-create the businesses AFTER INSERT trigger that auto-creates the
--    #general channel. 005_chat.sql created it originally, but the
--    fresh-DB / 998 path never re-creates it, so create_default_channel never
--    fires and the canonical RPC's channel-join finds no channel. The
--    function body is hardened below (tolerates a NULL owner).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_business_created ON public.businesses;
CREATE TRIGGER on_business_created
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.create_default_channel();

-- ---------------------------------------------------------------------------
-- 4. create_default_channel — tolerate a missing owner. The businesses AFTER
--    INSERT trigger runs before create_business_and_owner has inserted the
--    owner staff row, so v_owner_id was NULL and the channel_members insert
--    (staff_id NOT NULL) violated the constraint, failing the ENTIRE business
--    creation. Create the channel without the member row; the RPC joins the
--    owner explicitly after the staff row exists.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_default_channel()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id UUID;
  v_channel_id UUID;
BEGIN
  SELECT id INTO v_owner_id FROM public.staff WHERE business_id = NEW.id AND role = 'owner' LIMIT 1;

  INSERT INTO public.channels (business_id, name, description, type, created_by)
  VALUES (NEW.id, 'general', 'Company-wide announcements and updates', 'public', v_owner_id)
  RETURNING id INTO v_channel_id;

  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.channel_members (channel_id, staff_id, role)
    VALUES (v_channel_id, v_owner_id, 'owner');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------------------------------------------------------------------------
-- 5. create_business_and_owner — the canonical onboarding RPC. Replaces the
--    stale organization-less body with the organization-first architecture.
--    Fixes the organization_id / staff.email NOT NULL violations and hardens
--    auth. Idempotent (DROP + CREATE).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_business_and_owner(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_business_and_owner(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_business_and_owner(
  p_business_name TEXT,
  p_industry TEXT DEFAULT NULL,
  p_staff_name TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL
) RETURNS TABLE(p_business_id UUID, p_staff_id UUID) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_email TEXT;
  v_org_id UUID;
  v_business_id UUID;
  v_staff_id UUID;
BEGIN
  -- Callable only with a real session. The businesses/staff inserts key off
  -- auth.uid(); without this guard an anonymous call failed deep inside the
  -- inserts with a raw constraint error.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- One user, one business through this path. Repeat onboarding attempts are
  -- recoverable client-side (the caller refreshes membership and enters /app).
  IF EXISTS (SELECT 1 FROM public.staff WHERE staff.user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already belongs to a business';
  END IF;

  -- staff.email is NOT NULL; backfill from the auth account.
  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user_id;
  v_user_email := COALESCE(v_user_email, auth.jwt() ->> 'email', '');

  -- Every business belongs to an organization (organization_id NOT NULL). A
  -- founder-led business gets its own organization and the founder becomes
  -- its group_owner, matching the multi-entity foundation backfill shape.
  INSERT INTO public.organizations (name)
  VALUES (p_business_name)
  RETURNING id INTO v_org_id;

  INSERT INTO public.businesses (name, industry, organization_id, entity_type)
  VALUES (p_business_name, p_industry, v_org_id, 'company')
  RETURNING businesses.id INTO v_business_id;

  INSERT INTO public.organization_memberships (organization_id, user_id, role, is_active)
  VALUES (v_org_id, v_user_id, 'group_owner', TRUE)
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  INSERT INTO public.staff (business_id, user_id, name, full_name, email,
                            role, job_title, member_kind, onboarding_completed)
  VALUES (v_business_id, v_user_id, COALESCE(NULLIF(TRIM(p_staff_name), ''), v_user_email),
          NULLIF(TRIM(p_staff_name), ''), v_user_email, 'owner',
          COALESCE(NULLIF(TRIM(p_job_title), ''), 'Owner'), 'owner', TRUE)
  RETURNING id INTO v_staff_id;

  -- The on_business_created trigger ran before this staff row existed, so the
  -- owner was not auto-joined to #general. Join them now that the row exists.
  INSERT INTO public.channel_members (channel_id, staff_id, role)
  SELECT c.id, v_staff_id, 'owner' FROM public.channels c
  WHERE c.business_id = v_business_id AND c.name = 'general'
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_business_id, v_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only authenticated users may create their own business. Postgres grants
-- EXECUTE to PUBLIC by default, so revoke it explicitly.
REVOKE EXECUTE ON FUNCTION public.create_business_and_owner(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_and_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_business_and_owner(TEXT, TEXT, TEXT, TEXT) IS
  'Create the founder organization, the business (organization_id NOT NULL), the group_owner membership, and the owner staff row. One business per user through this path.';
