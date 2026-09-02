-- Trial eligibility is anchored to the individual business creation date.
-- Never use a shared migration/run timestamp as the start of a customer's trial.
UPDATE public.business_entitlements e
SET trial_started_at = b.created_at,
    trial_ends_at = b.created_at + interval '7 days',
    updated_at = now()
FROM public.businesses b
WHERE b.id = e.business_id
  AND e.plan = 'free'
  AND (
    e.trial_started_at IS DISTINCT FROM b.created_at
    OR e.trial_ends_at IS DISTINCT FROM b.created_at + interval '7 days'
  );
