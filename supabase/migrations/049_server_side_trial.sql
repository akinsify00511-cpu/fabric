-- Move trial tracking server-side.
-- Adds trial_ends_at to business_entitlements so the trial window is
-- trusted (not client-side localStorage that users can clear to reset).

ALTER TABLE business_entitlements
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE business_entitlements
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

-- When a new free-tier entitlement row is created, start a 7-day trial.
-- Existing free rows with NULL trial_ends_at get backfilled to NOW()+7d
-- so every business gets exactly one trial window.
CREATE OR REPLACE FUNCTION start_trial_on_new_entitlement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan = 'free' AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_started_at = COALESCE(NEW.trial_started_at, NOW());
    NEW.trial_ends_at = NOW() + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_start_trial ON business_entitlements;
CREATE TRIGGER trg_start_trial
  BEFORE INSERT ON business_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION start_trial_on_new_entitlement();

-- Backfill: any existing free-tier business that never had a trial gets one
-- starting now. Paid-tier businesses get NULL (no trial).
UPDATE business_entitlements
  SET trial_started_at = NOW(),
      trial_ends_at = NOW() + INTERVAL '7 days'
  WHERE plan = 'free'
    AND trial_ends_at IS NULL
    AND trial_started_at IS NULL;

-- Helper: is this business still in trial?
CREATE OR REPLACE FUNCTION is_business_in_trial(p_business_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_entitlements
    WHERE business_id = p_business_id
      AND plan = 'free'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at > NOW()
  );
$$ LANGUAGE sql STABLE;
