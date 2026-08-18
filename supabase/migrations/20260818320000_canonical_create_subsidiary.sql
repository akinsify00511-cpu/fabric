-- Canonical subsidiary creation (merges the prior 20260818300000 + 016 definitions).
--
-- HISTORY: two parallel sessions each defined `create_subsidiary` with a
-- different signature + body. PostgREST exposes one function per name, and
-- both were `(TEXT,TEXT,TEXT,TEXT)` so `CREATE OR REPLACE` made whichever
-- applied last win — silently breaking the other caller. This is the single
-- canonical version that serves BOTH callers:
--   * SubsidiarySwitcher.tsx  -> {p_name, p_entity_type, p_industry}
--   * Subsidiaries.tsx       -> {p_name, p_industry, p_business_model, p_description}
--
-- The body keeps the org-hierarchy authorization from 20260818300000 (group_
-- owner/group_admin OR parent-business owner — the real security boundary
-- from Session 22) AND the rich subsidiary onboarding from 016 (seeds
-- subsidiary_profiles + crm_configurations + crm_pipeline_stages so a new
-- subsidiary is immediately usable), AND grants the creator a staff row +
-- org membership so they can switch into it.
--
-- Returns UUID (the new business_id) — matches what Subsidiaries.tsx expects
-- (`if (typeof data === 'string')`). The prior 20260818300000 returned a
-- TABLE(business_id, organization_id); SubsidiarySwitcher only checked for an
-- error, not the shape, so the UUID return is compatible with both callers.
--
-- SECURITY: SECURITY DEFINER (inserts into businesses/staff/org memberships).
-- Gated to group_owner/group_admin of the parent's organization, or the owner
-- of the parent business. A plain staff member or a member of a DIFFERENT
-- organization cannot create subsidiaries.

CREATE OR REPLACE FUNCTION public.create_subsidiary(
  p_name TEXT,
  p_entity_type TEXT DEFAULT 'subsidiary',
  p_parent_business_id UUID DEFAULT NULL,
  p_industry TEXT DEFAULT NULL,
  p_business_model TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $_function_$
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
  -- the parent (subsidiaries nest under the org the creator already owns).
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

  -- Authorization: group_owner/group_admin of the org, OR owner of the parent.
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

  -- Grant the creator an org-level membership so get_current_accessible_
  -- businesses returns the new subsidiary (they can switch into it).
  INSERT INTO public.organization_memberships (organization_id, user_id, role, is_active)
  VALUES (v_org_id, auth.uid(), 'group_admin', true)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET is_active = true;

  -- Give the creator a real staff row in the new subsidiary so they can
  -- operate inside it (RLS keys off staff.business_id). UNIQUE(business_id,
  -- user_id) lets a user be staff in multiple subsidiaries.
  INSERT INTO public.staff (business_id, user_id, name, email, role)
  VALUES (v_new_biz_id, v_creator_staff.user_id, v_creator_staff.name, v_creator_staff.email, 'owner')
  ON CONFLICT (business_id, user_id) DO NOTHING;

  -- Rich subsidiary onboarding (from the 016 definition): seed the operating
  -- profile + CRM config + a default pipeline so the subsidiary is usable on
  -- day one. Each is best-effort via ON CONFLICT + undefined_table guard
  -- (tables may not exist yet if 20260818310000 hasn't been applied).
  BEGIN
    INSERT INTO public.subsidiary_profiles (business_id, display_name, description, industry, business_model)
    VALUES (v_new_biz_id, p_name, p_description, p_industry, p_business_model)
    ON CONFLICT (business_id) DO NOTHING;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    INSERT INTO public.crm_configurations (business_id)
    VALUES (v_new_biz_id)
    ON CONFLICT (business_id) DO NOTHING;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    INSERT INTO public.crm_pipeline_stages (business_id, name, key, position, probability, stage_type)
    VALUES
      (v_new_biz_id, 'Prospect', 'prospect', 0, 10.00, 'open'),
      (v_new_biz_id, 'Qualified', 'qualified', 1, 30.00, 'open'),
      (v_new_biz_id, 'Proposal', 'proposal', 2, 55.00, 'open'),
      (v_new_biz_id, 'Negotiation', 'negotiation', 3, 75.00, 'open'),
      (v_new_biz_id, 'Won', 'won', 4, 100.00, 'won'),
      (v_new_biz_id, 'Lost', 'lost', 5, 0.00, 'lost')
    ON CONFLICT (business_id, key) DO NOTHING;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN v_new_biz_id;
END
$_function_$;

-- Drop the prior conflicting overloads (different return shape / param set)
-- so PostgREST exposes exactly one create_subsidiary. Guarded so re-running
-- after the drop is a no-op.
DROP FUNCTION IF EXISTS public.create_subsidiary(TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.create_subsidiary(TEXT, TEXT, TEXT, TEXT);

-- Revoke from anon (subsidiary creation is an authenticated, authorized action).
REVOKE EXECUTE ON FUNCTION public.create_subsidiary(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_subsidiary(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_subsidiary IS
  'Create a subsidiary/branch/business_unit under the caller''s organization. Gated to group_owner/group_admin or the parent business owner. SECURITY DEFINER. Seeds subsidiary_profiles + CRM config + default pipeline. Returns the new business_id.';
