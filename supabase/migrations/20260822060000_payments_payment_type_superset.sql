-- Widen payments_payment_type_check to the canonical superset.
-- Accounting paths write 'receive'/'pay'/'internal'; the Payments page
-- vocabulary is 'income'/'expense'. The old CHECK rejected the page's rows
-- (payments_payment_type_check violation), so recording a payment failed.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type = ANY (ARRAY['receive','pay','internal','income','expense'])) NOT VALID;
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_payment_type_check;
