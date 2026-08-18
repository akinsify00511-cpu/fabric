-- Multi-entity foundation: introduce organization hierarchy without changing existing tenant behavior.
-- Existing businesses are backfilled into one organization each, so current access remains unchanged.

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS parent_business_id uuid,
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'company';

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_entity_type_check;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_entity_type_check
  CHECK (entity_type IN ('company','subsidiary','branch','business_unit'));

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_parent_business_id_fkey;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_parent_business_id_fkey
  FOREIGN KEY (parent_business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_organization_id_fkey;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

INSERT INTO public.organizations (name)
SELECT b.name
FROM public.businesses b
WHERE b.organization_id IS NULL;

UPDATE public.businesses b
SET organization_id = o.id
FROM public.organizations o
WHERE b.organization_id IS NULL
  AND o.name = b.name
  AND NOT EXISTS (
    SELECT 1 FROM public.businesses b2
    WHERE b2.organization_id = o.id
      AND b2.id <> b.id
  );

-- Defensive fallback for duplicate business names: create a dedicated org per remaining business.
DO $do$
DECLARE
  r record;
  v_org uuid;
BEGIN
  FOR r IN SELECT id, name FROM public.businesses WHERE organization_id IS NULL LOOP
    INSERT INTO public.organizations(name) VALUES (r.name) RETURNING id INTO v_org;
    UPDATE public.businesses SET organization_id = v_org WHERE id = r.id;
  END LOOP;
END
$do$;

ALTER TABLE public.businesses
  ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS businesses_organization_id_idx
  ON public.businesses (organization_id);
CREATE INDEX IF NOT EXISTS businesses_parent_business_id_idx
  ON public.businesses (parent_business_id);

CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'group_member',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_role_check
    CHECK (role IN ('group_owner','group_admin','group_member')),
  CONSTRAINT organization_memberships_org_user_key
    UNIQUE (organization_id, user_id)
);

INSERT INTO public.organization_memberships (organization_id, user_id, role)
SELECT b.organization_id,
       s.user_id,
       CASE
         WHEN s.role = 'owner' THEN 'group_owner'
         WHEN s.role = 'admin' THEN 'group_admin'
         ELSE 'group_member'
       END
FROM public.staff s
JOIN public.businesses b ON b.id = s.business_id
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = CASE
             WHEN EXCLUDED.role = 'group_owner' THEN 'group_owner'
             WHEN organization_memberships.role = 'group_owner' THEN organization_memberships.role
             WHEN EXCLUDED.role = 'group_admin' THEN 'group_admin'
             ELSE organization_memberships.role
           END,
    updated_at = now();

CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
  ON public.organization_memberships (user_id, is_active);
CREATE INDEX IF NOT EXISTS organization_memberships_org_idx
  ON public.organization_memberships (organization_id, is_active);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships FORCE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS organization_memberships_select_self ON public.organization_memberships;
CREATE POLICY organization_memberships_select_self
ON public.organization_memberships
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_current_organization_memberships()
RETURNS TABLE(organization_id uuid, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT om.organization_id, om.role
  FROM public.organization_memberships om
  WHERE om.user_id = auth.uid()
    AND om.is_active = true;
$function$;

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

REVOKE ALL ON FUNCTION public.get_current_organization_memberships() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_accessible_businesses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_organization_memberships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_accessible_businesses() TO authenticated;

COMMENT ON TABLE public.organizations IS 'Top-level business group. A single-business tenant is represented by an organization containing one business.';
COMMENT ON COLUMN public.businesses.organization_id IS 'Owning organization/group for hierarchy-aware access and consolidation.';
COMMENT ON COLUMN public.businesses.parent_business_id IS 'Optional immediate parent entity. NULL for the top-level company in an organization.';
COMMENT ON COLUMN public.businesses.entity_type IS 'Business hierarchy type: company, subsidiary, branch, or business_unit.';
COMMENT ON FUNCTION public.get_current_accessible_businesses() IS 'Server-side hierarchy-aware access resolver. Existing direct business membership remains valid; group_owner/group_admin receive organization-wide business scope.';
