-- Session-33 closure (Stage-33d): businesses structural immutability.
-- Any business member could UPDATE businesses.organization_id/parent_business_id/
-- entity_type — the fixture moved a business into a foreign organization via
-- a plain UPDATE (verified P0). Group/subsidiary structure must only change
-- through admin RPCs (create_subsidiary etc.), guarded here to callers whose
-- own staff role is owner/admin of the business in question.
CREATE OR REPLACE FUNCTION public.enforce_business_structural_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id)
     OR (NEW.parent_business_id IS DISTINCT FROM OLD.parent_business_id)
     OR (NEW.entity_type IS DISTINCT FROM OLD.entity_type) THEN
    PERFORM 1
      FROM public.get_current_staff() gcs
      WHERE gcs.business_id = OLD.id
        AND gcs.role IN ('owner','admin');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Organization structure changes require owner/admin.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_structural_immutability ON public.businesses;
CREATE TRIGGER businesses_structural_immutability
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_structural_immutability();

COMMENT ON FUNCTION public.enforce_business_structural_immutability IS
  'Closes the org-move P0: organization_id/parent_business_id/entity_type mutations require owner/admin.';

SELECT 1;
