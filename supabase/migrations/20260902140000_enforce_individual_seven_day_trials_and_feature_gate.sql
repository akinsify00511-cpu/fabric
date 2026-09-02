-- Each business gets exactly one seven-day trial anchored to business creation.
-- Repairs legacy free entitlements that were stamped with one shared migration time.
UPDATE public.business_entitlements e
SET trial_started_at = b.created_at,
    trial_ends_at = b.created_at + interval '7 days',
    updated_at = now()
FROM public.businesses b
WHERE b.id = e.business_id
  AND e.plan = 'free'
  AND (e.trial_started_at IS NULL OR e.trial_started_at > b.created_at + interval '1 day');

CREATE OR REPLACE FUNCTION public.has_feature(p_business_id uuid, p_feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_plan text;
  v_features jsonb;
  v_trial_end timestamptz;
  v_user_business uuid;
BEGIN
  SELECT s.business_id INTO v_user_business
  FROM public.staff s
  WHERE s.user_id = auth.uid()
    AND s.business_id = p_business_id
  LIMIT 1;

  IF v_user_business IS NULL THEN
    RETURN false;
  END IF;

  SELECT e.plan, e.features, e.trial_ends_at
    INTO v_plan, v_features, v_trial_end
  FROM public.business_entitlements e
  WHERE e.business_id = p_business_id;

  IF coalesce(v_plan, 'free') = 'free' AND v_trial_end IS NOT NULL AND v_trial_end > now() THEN
    RETURN true;
  END IF;

  v_plan := coalesce(v_plan, 'free');

  IF v_plan = 'free' THEN
    RETURN coalesce((public.get_plan_features('free')->>p_feature)::boolean, false);
  END IF;

  IF v_features ? p_feature AND (v_features->>p_feature)::boolean THEN
    RETURN true;
  END IF;

  RETURN coalesce((public.get_plan_features(v_plan)->>p_feature)::boolean, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_feature(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_business_in_trial(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.business_id = p_business_id
      AND s.user_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.business_entitlements e
    WHERE e.business_id = p_business_id
      AND e.plan = 'free'
      AND e.trial_ends_at IS NOT NULL
      AND e.trial_ends_at > now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_business_in_trial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_business_in_trial(uuid) TO authenticated;
