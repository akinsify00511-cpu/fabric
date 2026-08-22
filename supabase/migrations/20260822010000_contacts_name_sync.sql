-- Reconcile the contacts name/full_name split brain.
-- 001 created contacts.name NOT NULL; 075 added contacts.full_name and the
-- app writes full_name only, so inserts violated the NOT NULL on name.
-- A BEFORE trigger keeps the two in sync; NOT NULL stays enforced.
CREATE OR REPLACE FUNCTION public.sync_contact_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.full_name IS NULL OR btrim(NEW.full_name) = '' THEN
    NEW.full_name := NEW.name;
  END IF;
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    NEW.name := NEW.full_name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_sync_name ON public.contacts;
CREATE TRIGGER trg_contacts_sync_name
  BEFORE INSERT OR UPDATE OF name, full_name ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_contact_name();

UPDATE public.contacts SET full_name = name WHERE full_name IS NULL;
