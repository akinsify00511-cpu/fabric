-- Session-33 closure (Stage-33b): staff role/member_kind immutability trigger.
-- staff_self_update lets an employee update their own row — including role
-- and member_kind — enabling self-promotion to owner (verified P0). This
-- trigger forces role/member_kind mutations to come only from a caller
-- whose own staff role is owner/admin of the same business.
CREATE OR REPLACE FUNCTION public.enforce_staff_role_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role <> OLD.role OR NEW.member_kind <> OLD.member_kind THEN
    PERFORM 1
      FROM public.get_current_staff() gcs
      WHERE gcs.business_id = OLD.business_id
        AND gcs.role IN ('owner','admin');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only owners/admins may change staff role or member kind.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_role_immutability ON public.staff;
CREATE TRIGGER staff_role_immutability
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_role_immutability();

COMMENT ON FUNCTION public.enforce_staff_role_immutability IS
  'Closes the employee self-promotion P0: role/member_kind mutation requires owner/admin.';

SELECT 1;
