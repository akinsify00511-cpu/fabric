-- Payments page drift repair: the page writes/reads description, category,
-- invoice_number, client_name, staff_id columns that the payments table never
-- had, so every insert was rejected by PostgREST as unknown columns and the
-- page could never show a recorded payment. Additively add the columns the
-- UI contract has always assumed, and keep the type/payment_type and
-- method/payment_method semantic pairs in sync (admin/accounting paths use
-- the payment_* names; the Payments page uses the short names).
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS method TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS bank TEXT;

CREATE OR REPLACE FUNCTION public.sync_payment_aliases()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type IS NULL THEN NEW.type := NEW.payment_type; END IF;
  IF NEW.payment_type IS NULL THEN NEW.payment_type := NEW.type; END IF;
  IF NEW.method IS NULL THEN NEW.method := NEW.payment_method; END IF;
  IF NEW.payment_method IS NULL THEN NEW.payment_method := NEW.method; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_sync_aliases ON public.payments;
CREATE TRIGGER trg_payments_sync_aliases
  BEFORE INSERT OR UPDATE OF type, payment_type, method, payment_method ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_payment_aliases();

UPDATE public.payments SET type = payment_type WHERE type IS NULL;
UPDATE public.payments SET method = payment_method WHERE method IS NULL;
