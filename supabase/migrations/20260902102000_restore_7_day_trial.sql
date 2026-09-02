-- Restore the intended server-side 7-day Avenize trial.
-- Trial state is kept in business_entitlements, never in localStorage.

ALTER TABLE public.business_entitlements
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE public.business_entitlements
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.start_trial_on_new_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.plan = 'free' AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_started_at = COALESCE(NEW.trial_started_at, NOW());
    NEW.trial_ends_at = COALESCE(NEW.trial_ends_at, NOW() + INTERVAL '7 days');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_start_trial ON public.business_entitlements;
CREATE TRIGGER trg_start_trial
  BEFORE INSERT ON public.business_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.start_trial_on_new_entitlement();

-- Existing free businesses that have no recorded trial receive the same
-- seven-day server-side trial window rather than remaining permanently free.
UPDATE public.business_entitlements
SET trial_started_at = COALESCE(trial_started_at, NOW()),
    trial_ends_at = COALESCE(trial_ends_at, NOW() + INTERVAL '7 days')
WHERE plan = 'free'
  AND trial_ends_at IS NULL
  AND trial_started_at IS NULL;

CREATE OR REPLACE FUNCTION public.is_business_in_trial(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff
    WHERE business_id = p_business_id
      AND user_id = auth.uid()
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.business_entitlements
    WHERE business_id = p_business_id
      AND plan = 'free'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at > NOW()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_trial_on_new_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_business_in_trial(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_business_in_trial(UUID) TO authenticated;
