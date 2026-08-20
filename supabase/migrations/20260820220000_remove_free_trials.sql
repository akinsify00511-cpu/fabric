-- Avenize is paid from the first subscription payment.
-- Keep legacy trial columns for backward compatibility, but remove all active
-- trial behavior and prevent future subscription rows from using trialing.

DROP TRIGGER IF EXISTS trg_start_trial ON business_entitlements;
DROP FUNCTION IF EXISTS start_trial_on_new_entitlement();
DROP FUNCTION IF EXISTS is_business_in_trial(UUID);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='business_entitlements' AND column_name='trial_ends_at') THEN
    UPDATE public.business_entitlements SET trial_ends_at = NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='business_entitlements' AND column_name='trial_started_at') THEN
    UPDATE public.business_entitlements SET trial_started_at = NULL;
  END IF;
END $$;

UPDATE public.business_subscriptions
SET status = 'expired', trial_ends_at = NULL
WHERE status = 'trialing';

ALTER TABLE public.business_subscriptions
  DROP CONSTRAINT IF EXISTS business_subscriptions_status_check;

ALTER TABLE public.business_subscriptions
  ADD CONSTRAINT business_subscriptions_status_check
  CHECK (status = ANY (ARRAY['active','cancelled','expired','past_due','paused']));

UPDATE public.business_subscriptions SET trial_ends_at = NULL;
