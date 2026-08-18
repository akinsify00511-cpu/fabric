-- ============================================================================
-- P0 #16: Autonomous trial assistance.
--
-- The directive: personalized engagement messages during the trial, assistance
-- at key friction points (setup incomplete, feature unused, trial ending),
-- onboarding completion incentives. "AI-assisted trial guidance" — but
-- DETERMINISTIC (no LLM, §22). The "intelligence" is rule-based: detect the
-- trial phase + setup completeness + feature usage, and surface the ONE
-- nudge that best moves the user toward value.
--
-- Consumes: onboarding_funnel (Session 21 #14), feature_activation (#14),
-- business_entitlements (trial_ends_at), business_health (Session 14 #11).
-- Produces: a single prioritized nudge (headline + body + action label +
-- action route) + the trial phase context. The Dashboard / TrialBanner /
-- Subscription page read this to show the right message at the right time.
--
-- The nudge taxonomy (deterministic, priority-ordered):
--   1. SETUP_INCOMPLETE      — onboarding didn't finish (no onboarding_complete
--                              event, or steps_reached < final). Highest
--                              priority: a user who didn't finish setup will
--                              churn for sure.
--   2. TRIAL_ENDING_NO_USAGE — trial ends in <=2 days AND the business used
--                              <2 paid modules. The highest-risk churn: they
--                              haven't seen value yet.
--   3. TRIAL_ENDING_HEALTHY  — trial ends in <=3 days AND they've used paid
--                              modules. Nudge to convert (the plan rec).
--   4. FEATURE_UNUSED        — trial ongoing, setup done, but a high-value
--                              module is unused. Surfaced via feature_discovery
--                              (#13) — this nudge links there.
--   5. TRIAL_MIDPOINT        — trial at ~halfway, setup done, usage exists.
--                              A gentle "here's what else you can do" nudge.
--                              Lowest priority (don't over-nudge).
--   6. NONE                  — trial ended or not in trial, or healthy usage.
--                              No nudge (don't nag a healthy user).
--
-- Privacy: SECURITY DEFINER so it can read usage_events + onboarding funnel.
-- Membership-guarded via get_current_staff. Granted to authenticated.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trial_assistance(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_membership RECORD;
  v_trial_end TIMESTAMPTZ;
  v_in_trial BOOLEAN;
  v_days_left INT;
  v_funnel JSONB;
  v_setup_complete BOOLEAN := false;
  v_steps_reached INT := 0;
  v_activations JSONB;
  v_paid_modules_used INT := 0;
  v_phase TEXT;
  v_nudge JSONB;
  v_health JSONB;
  v_health_score INT;
BEGIN
  SELECT * INTO v_membership FROM get_current_staff() cs WHERE cs.business_id = p_business_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- Trial status.
  SELECT e.trial_ends_at INTO v_trial_end
    FROM business_entitlements e WHERE e.business_id = p_business_id;
  v_in_trial := v_trial_end IS NOT NULL AND v_trial_end > NOW();
  IF v_in_trial THEN
    v_days_left := GREATEST(0, EXTRACT(DAY FROM (v_trial_end - NOW()))::INT);
  END IF;

  -- Not in trial: no trial nudge (a paid user or an expired-trial user gets
  -- nothing from this RPC — their nudges come from the recommendation engine).
  IF NOT v_in_trial THEN
    RETURN jsonb_build_object('authorized', true, 'in_trial', false, 'nudge', NULL,
      'phase', 'not_in_trial');
  END IF;

  -- Onboarding funnel (did they finish setup?).
  BEGIN
    v_funnel := onboarding_funnel(p_business_id);
    v_setup_complete := (v_funnel->>'completed_at') IS NOT NULL;
    v_steps_reached := COALESCE((v_funnel->>'steps_reached')::INT, 0);
  EXCEPTION WHEN OTHERS THEN
    v_setup_complete := false; v_steps_reached := 0;
  END;

  -- Feature activation (how many paid modules have they used?).
  BEGIN
    v_activations := feature_activation(p_business_id);
    SELECT COUNT(*) INTO v_paid_modules_used
      FROM jsonb_array_elements(v_activations) a
      JOIN module_plan_tiers m ON m.module_key = a->>'module_key'
      WHERE m.min_plan_tier > 0;
  EXCEPTION WHEN OTHERS THEN
    v_paid_modules_used := 0;
  END;

  -- Determine the trial phase (the deterministic nudge selector).
  IF NOT v_setup_complete THEN
    v_phase := 'setup_incomplete';
  ELSIF v_days_left <= 2 AND v_paid_modules_used < 2 THEN
    v_phase := 'trial_ending_no_usage';
  ELSIF v_days_left <= 3 THEN
    v_phase := 'trial_ending_healthy';
  ELSIF v_paid_modules_used = 0 THEN
    v_phase := 'feature_unused';
  ELSIF v_days_left <= 5 THEN
    v_phase := 'trial_midpoint';
  ELSE
    v_phase := 'healthy';
  END IF;

  -- Best-effort: the health score (for the "trial_ending_healthy" nudge).
  BEGIN
    v_health := compute_business_health(p_business_id);
    v_health_score := COALESCE((v_health->>'overall_score')::INT, 0);
  EXCEPTION WHEN OTHERS THEN
    v_health_score := 0;
  END;

  -- The nudge (deterministic copy per phase — tunable by Avenize operators
  -- by editing this function; matches the ops-dashboard tunable standard).
  v_nudge := CASE v_phase
    WHEN 'setup_incomplete' THEN jsonb_build_object(
      'type', 'setup_incomplete',
      'headline', 'Let''s finish setting up your business',
      'body', CASE WHEN v_steps_reached = 0
        THEN 'You''re a few steps away from a working business. It takes about two minutes.'
        ELSE format('You''re %s steps in — a couple more and you''re ready.', v_steps_reached) END,
      'action_label', 'Continue setup',
      'action_route', '/onboarding')

    WHEN 'trial_ending_no_usage' THEN jsonb_build_object(
      'type', 'trial_ending_no_usage',
      'headline', format('Your trial ends in %s day%s — let''s find your first win', v_days_left, CASE WHEN v_days_left = 1 THEN '' ELSE 's' END),
      'body', 'You haven''t tried the paid tools yet. Pick one and see what Avenize can do for you in the next two days.',
      'action_label', 'Explore a tool',
      'action_route', '/app')

    WHEN 'trial_ending_healthy' THEN jsonb_build_object(
      'type', 'trial_ending_healthy',
      'headline', format('Your trial ends in %s day%s', v_days_left, CASE WHEN v_days_left = 1 THEN '' ELSE 's' END),
      'body', CASE WHEN v_health_score > 0
        THEN format('Your business health is %s/100. Keep it going — pick the plan that fits how you work.', v_health_score)
        ELSE 'You''ve been using Avenize — pick the plan that fits how you actually work.' END,
      'action_label', 'See your recommended plan',
      'action_route', '/app/subscription')

    WHEN 'feature_unused' THEN jsonb_build_object(
      'type', 'feature_unused',
      'headline', 'You haven''t explored your paid tools yet',
      'body', 'Based on your business, there''s a tool that could save you time or find money you''re missing. Let us show you which one.',
      'action_label', 'See what''s worth exploring',
      'action_route', '/app')

    WHEN 'trial_midpoint' THEN jsonb_build_object(
      'type', 'trial_midpoint',
      'headline', format('%s days left in your trial', v_days_left),
      'body', 'You''re set up and using Avenize. Here''s what else you can do before your trial ends.',
      'action_label', 'Explore more',
      'action_route', '/app')

    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'authorized', true,
    'in_trial', v_in_trial,
    'trial_ends_at', v_trial_end,
    'days_left', v_days_left,
    'phase', v_phase,
    'setup_complete', v_setup_complete,
    'steps_reached', v_steps_reached,
    'paid_modules_used', v_paid_modules_used,
    'health_score', v_health_score,
    'nudge', v_nudge
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('authorized', true, 'in_trial', v_in_trial, 'nudge', NULL, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.trial_assistance(UUID) TO authenticated;

COMMENT ON FUNCTION public.trial_assistance(UUID) IS
  'P0 #16: the autonomous trial assistance engine. Detects the trial phase (setup incomplete / ending-no-usage / ending-healthy / feature-unused / midpoint) and surfaces the ONE nudge that best moves the user toward value. Deterministic (no LLM, §22) — reads onboarding_funnel + feature_activation + trial status. Best-effort (never blocks). Membership-guarded.';
