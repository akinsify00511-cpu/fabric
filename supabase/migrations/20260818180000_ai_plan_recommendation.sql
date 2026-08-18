-- ============================================================================
-- P0 #15: AI plan recommendation at trial end.
--
-- The directive: at end of trial, "Based on how you use Avenize, we recommend
-- Business." Explain: features used, business needs identified, why the plan
-- fits, what additional value becomes available. Do NOT simply say "Upgrade
-- now."
--
-- This is DETERMINISTIC (no LLM, §22-compliant — never fabricates usage).
-- It consumes the self-instrumentation data (Session 21 #14: feature_activation
-- + usage_events) + the module_plan_tiers config (Session 8) to recommend the
-- lowest plan tier that covers every module the business ACTUALLY USED during
-- the trial, with an evidence-based rationale citing real usage numbers.
--
-- The recommendation is the MINIMUM tier that unlocks the modules the business
-- touched — never upsells beyond what usage justifies (anti-gouging), and never
-- recommends a tier below what the business needs (anti-churn). When the
-- business used nothing beyond free-tier modules, it recommends staying on the
-- free plan with an honest "you haven't explored paid features yet" nudge.
--
-- Security: SECURITY DEFINER so it can read usage_events (business-scoped RLS
-- would still work, but the feature_activation helper is SECURITY DEFINER).
-- Membership-guarded via get_current_staff — a non-member gets {authorized:false}
-- (safe, no leak). Granted to authenticated.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recommend_plan(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_membership RECORD;
  v_activations RECORD[];
  v_activation  RECORD;
  v_min_tier    INT := 0;
  v_needed_tier INT;
  v_recommended_plan TEXT;
  v_current_plan TEXT;
  v_current_tier INT;
  v_modules_used INT := 0;
  v_modules_requiring_higher INT := 0;
  v_used_module_keys TEXT[] := '{}';
  v_locked_module_keys TEXT[] := '{}';
  v_evidence TEXT[] := '{}';
  v_reasons TEXT[] := '{}';
  v_additional_value TEXT[] := '{}';
  v_plan_name TEXT;
  v_plan_price TEXT;
  v_trial_end TIMESTAMPTZ;
  v_in_trial BOOLEAN;
BEGIN
  -- Authorization: must be a member of the business.
  SELECT * INTO v_membership FROM get_current_staff() cs WHERE cs.business_id = p_business_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- Current plan + trial status.
  SELECT e.plan, e.trial_ends_at INTO v_current_plan, v_trial_end
    FROM business_entitlements e WHERE e.business_id = p_business_id;
  v_current_plan := COALESCE(v_current_plan, 'free');
  -- Maps the plan names actually used by Pricing.tsx + the subscription-management
  -- edge function (starter/team/business/pro/scale) plus legacy aliases
  -- (growth/professional/enterprise). NOTE: resolve_plan_tier (migration 20260101000005)
  -- lacks 'business' and 'team' — a known drift; this CASE is comprehensive so a
  -- Business-plan user isn't falsely told to upgrade.
  v_current_tier := CASE v_current_plan
    WHEN 'free' THEN 0
    WHEN 'starter' THEN 1
    WHEN 'team' THEN 2
    WHEN 'growth' THEN 2
    WHEN 'professional' THEN 2
    WHEN 'pro' THEN 2
    WHEN 'business' THEN 2
    WHEN 'scale' THEN 3
    WHEN 'enterprise' THEN 3
    ELSE 0
  END;
  v_in_trial := v_trial_end IS NOT NULL AND v_trial_end > NOW();

  -- Gather feature activation (what they actually used).
  FOR v_activation IN
    SELECT module_key, first_active_at, distinct_active_days, reuse_label
      FROM feature_activation(p_business_id)
  LOOP
    v_modules_used := v_modules_used + 1;
    v_used_module_keys := array_append(v_used_module_keys, v_activation.module_key);

    -- What tier does this module need?
    SELECT min_plan_tier INTO v_needed_tier FROM module_plan_tiers m WHERE m.module_key = v_activation.module_key;
    v_needed_tier := COALESCE(v_needed_tier, 0);

    IF v_needed_tier > v_min_tier THEN
      v_min_tier := v_needed_tier;
    END IF;
    IF v_needed_tier > v_current_tier THEN
      v_modules_requiring_higher := v_modules_requiring_higher + 1;
      v_locked_module_keys := array_append(v_locked_module_keys, v_activation.module_key);
    END IF;

    -- Build evidence: real usage facts (§22 — never fabricated).
    IF v_activation.reuse_label = 'reused' THEN
      v_evidence := array_append(v_evidence,
        format('You used %s across %s different days — it''s part of your routine.',
          v_activation.module_key, v_activation.distinct_active_days));
    ELSIF v_activation.reuse_label = 'returning' THEN
      v_evidence := array_append(v_evidence,
        format('You came back to %s on %s separate days.', v_activation.module_key, v_activation.distinct_active_days));
    ELSIF v_activation.reuse_label = 'activated' THEN
      v_evidence := array_append(v_evidence,
        format('You started using %s.', v_activation.module_key));
    END IF;
  END LOOP;

  -- Map the computed min tier back to a plan name + price (matches Pricing.tsx).
  v_recommended_plan := CASE v_min_tier
    WHEN 0 THEN 'free'
    WHEN 1 THEN 'starter'
    WHEN 2 THEN 'business'
    WHEN 3 THEN 'scale'
  END;
  v_plan_name := CASE v_min_tier
    WHEN 0 THEN 'Free'
    WHEN 1 THEN 'Starter'
    WHEN 2 THEN 'Business'
    WHEN 3 THEN 'Scale'
  END;
  v_plan_price := CASE v_min_tier
    WHEN 0 THEN '₦0'
    WHEN 1 THEN '₦15,000/mo'
    WHEN 2 THEN '₦112,000/mo'
    WHEN 3 THEN '₦380,000/mo'
  END;

  -- Why this plan fits (deterministic rationale).
  IF v_min_tier = 0 THEN
    v_reasons := array_append(v_reasons,
      'You''ve only used features available on the free plan — no paid modules yet.');
    v_reasons := array_append(v_reasons,
      'Keep exploring: tools like CRM, inventory, and HR unlock more as your business grows.');
  ELSE
    v_reasons := array_append(v_reasons,
      format('%s is the lowest plan that covers every tool you actually used during your trial.', v_plan_name));
    IF v_modules_requiring_higher > 0 THEN
      v_reasons := array_append(v_reasons,
        format('%s of the tools you used require a higher plan than you''re on now.', v_modules_requiring_higher));
    END IF;
  END IF;

  -- Additional value at the recommended tier (what else unlocks — the directive's
  -- "what additional value becomes available"). Deterministic: query the tier's
  -- OTHER modules the business has NOT used yet.
  IF v_min_tier > 0 THEN
    SELECT array_agg(module_key ORDER BY module_key) INTO v_additional_value
      FROM module_plan_tiers m
      WHERE m.min_plan_tier <= v_min_tier
        AND m.module_key NOT IN (SELECT unnest(v_used_module_keys))
      LIMIT 5;
    v_additional_value := COALESCE(v_additional_value, ARRAY[]::TEXT[]);
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'in_trial', v_in_trial,
    'trial_ends_at', v_trial_end,
    'current_plan', v_current_plan,
    'current_tier', v_current_tier,
    'recommended_plan', v_recommended_plan,
    'recommended_plan_name', v_plan_name,
    'recommended_price', v_plan_price,
    'recommended_tier', v_min_tier,
    'should_upgrade', v_min_tier > v_current_tier,
    'modules_used_count', v_modules_used,
    'modules_requiring_higher_count', v_modules_requiring_higher,
    'used_modules', v_used_module_keys,
    'locked_modules', v_locked_module_keys,
    'evidence', to_jsonb(v_evidence),
    'reasons', to_jsonb(v_reasons),
    'additional_value_unlocks', to_jsonb(v_additional_value)
  );
EXCEPTION WHEN OTHERS THEN
  -- Best-effort: never block the trial-end flow on a recommendation failure.
  RETURN jsonb_build_object('authorized', true, 'error', SQLERRM,
    'recommended_plan', v_current_plan, 'should_upgrade', false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.recommend_plan(UUID) TO authenticated;

COMMENT ON FUNCTION public.recommend_plan(UUID) IS
  'P0 #15: deterministic AI plan recommendation at trial end. Recommends the lowest plan tier that covers every module the business actually used (evidence-based, §22 — never fabricates usage). Membership-guarded. Returns evidence (real usage facts) + reasons (why the plan fits) + additional_value_unlocks (what else the tier enables). Best-effort: never blocks the trial flow.';
