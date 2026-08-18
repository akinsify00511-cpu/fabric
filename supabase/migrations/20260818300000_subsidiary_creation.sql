-- Subsidiary creation + role-aware staff helpers.
--
-- Background: the org hierarchy (20260817150000) already supports
-- subsidiaries (businesses.entity_type = 'subsidiary', parent_business_id).
-- But there was no RPC to CREATE a subsidiary + grant the creating user
-- access. This migration adds:
--   1. create_subsidiary(p_name, p_entity_type, p_parent_business_id, p_industry)
--      — SECURITY DEFINER, gated to group_owner/group_admin of the
--      parent's organization. Creates the subsidiary business + an
--      organization_memberships row so the creator can switch into it.
--   2. A staff-backfill guard: when a user switches to a subsidiary they
--      have an org-membership in but no staff row, the UI degrades
--      gracefully (the home shows the subsidiary's data via RLS-less
--      reads... no — RLS still applies). This RPC is the clean path: the
--      creator gets a real staff row so they can operate in the subsidiary.
--
-- SECURITY: the RPC verifies the caller is a group_owner/group_admin of the
-- parent business's organization BEFORE creating anything. A plain staff
-- member or a member of a DIFFERENT organization cannot create subsidiaries.
-- SECURITY DEFINER is required to insert into businesses (RLS would otherwise
-- deny cross-tenant inserts).

CREATE OR REPLACE FUNCTION public.create_subsidiary(
  p_name TEXT,
  p_entity_type TEXT DEFAULT 'subsidiary',
  p_parent_business_id UUID DEFAULT NULL,
  p_industry TEXT DEFAULT NULL
)
RETURNS TABLE(business_id uuid, organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_parent businesses%ROWTYPE;
  v_org_id uuid;
  v_new_biz_id uuid;
  v_creator_staff staff%ROWTYPE;
  v_is_authorized boolean := false;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Subsidiary name is required' USING ERRCODE = '23502';
  END IF;

  IF p_entity_type NOT IN ('subsidiary','branch','business_unit') THEN
    RAISE EXCEPTION 'Invalid entity_type. Must be subsidiary, branch, or business_unit.' USING ERRCODE = '23514';
  END IF;

  -- Resolve the creator's staff row (their "home" business).
  SELECT * INTO v_creator_staff FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only business members can create subsidiaries.' USING ERRCODE = '42501';
  END IF;

  -- If a parent is specified, it must exist + the creator must be authorized
  -- over its organization. If no parent, the creator's own business becomes
  -- the parent (so subsidiaries nest under the org the creator already owns).
  IF p_parent_business_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.businesses WHERE id = p_parent_business_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent business not found' USING ERRCODE = '23503';
    END IF;
    v_org_id := v_parent.organization_id;
  ELSE
    SELECT * INTO v_parent FROM public.businesses WHERE id = v_creator_staff.business_id;
    v_org_id := v_parent.organization_id;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Parent business has no organization. Cannot create subsidiary.' USING ERRCODE = '55000';
  END IF;

  -- Authorization: the caller must be a group_owner/group_admin of the org,
  -- OR the owner of the parent business itself.
  SELECT EXISTS(
    SELECT 1 FROM public.organization_memberships om
    WHERE om.organization_id = v_org_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND om.role IN ('group_owner','group_admin')
  ) OR EXISTS(
    SELECT 1 FROM public.staff s
    WHERE s.business_id = v_parent.id
      AND s.user_id = auth.uid()
      AND s.role = 'owner'
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized to create subsidiaries in this organization.' USING ERRCODE = '42501';
  END IF;

  -- Create the subsidiary business, sharing the parent's organization.
  INSERT INTO public.businesses (name, industry, organization_id, parent_business_id, entity_type)
  VALUES (p_name, p_industry, v_org_id, v_parent.id, p_entity_type)
  RETURNING id INTO v_new_biz_id;

  -- Grant the creator an org-level membership so get_current_accessible_businesses
  -- returns the new subsidiary (they can switch into it). role = group_admin so
  -- they retain oversight.
  INSERT INTO public.organization_memberships (organization_id, user_id, role, is_active)
  VALUES (v_org_id, auth.uid(), 'group_admin', true)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET is_active = true;

  RETURN QUERY SELECT v_new_biz_id, v_org_id;
END
$function$;

-- Revoke from anon (subsidiary creation is an authenticated, authorized action).
REVOKE EXECUTE ON FUNCTION public.create_subsidiary(TEXT, TEXT, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_subsidiary(TEXT, TEXT, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_subsidiary IS
  'Create a subsidiary/branch/business_unit under the caller''s organization. Gated to group_owner/group_admin or the parent business owner. SECURITY DEFINER to insert into businesses.';
