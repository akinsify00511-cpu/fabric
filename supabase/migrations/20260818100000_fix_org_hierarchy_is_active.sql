-- Corrective fix for migration 20260817150000_multi_entity_foundation_v1.
-- The staff table uses `active BOOLEAN` (migration 002), NOT `is_active`.
-- get_current_accessible_businesses() and the organizations_select_member RLS
-- policy both referenced s.is_active, which errors at query time and would
-- break organization-scoped access once any subsidiary UI consumes it.
-- The function did not error at CREATE time (plpgsql defers column resolution
-- to execution), and the Supabase-aware migration job applied it without
-- complaint, so the bug was latent — the bare-postgres migration-test job
-- (which executes the function body via the membership backfill that also
-- touches staff.active) surfaced it.
--
-- Idempotent: re-declares the function and the policy with the correct column.

CREATE OR REPLACE FUNCTION public.get_current_accessible_businesses()
RETURNS TABLE(business_id uuid, organization_id uuid, access_role text, access_reason text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT DISTINCT s.business_id,
         b.organization_id,
         s.role,
         'direct_membership'::text
  FROM public.staff s
  JOIN public.businesses b ON b.id = s.business_id
  WHERE s.user_id = auth.uid()
    AND s.active = true

  UNION

  SELECT b.id,
         b.organization_id,
         om.role,
         'organization_scope'::text
  FROM public.organization_memberships om
  JOIN public.businesses b ON b.organization_id = om.organization_id
  WHERE om.user_id = auth.uid()
    AND om.is_active = true
    AND om.role IN ('group_owner','group_admin');
$function$;

-- organization_memberships.is_active IS a real column (defined in the same
-- 20260817150000 migration), so that reference is correct and unchanged.

DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
CREATE POLICY organizations_select_member
ON public.organizations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.businesses b ON b.id = s.business_id
    WHERE s.user_id = auth.uid()
      AND s.active = true
      AND b.organization_id = organizations.id
  )
);

COMMENT ON FUNCTION public.get_current_accessible_businesses() IS 'Server-side hierarchy-aware access resolver. Existing direct business membership remains valid (staff.active); group_owner/group_admin receive organization-wide business scope. organization_memberships uses its own is_active flag.';
