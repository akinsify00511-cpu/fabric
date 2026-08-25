-- ============================================================================
-- 20260825200000_step_up_human_decisions.sql
-- Human-decision RPCs now require STEP-UP authorization for the sensitive
-- operations: approving/rejecting a decision (p_step_up = TRUE).
-- The client confirms that the admin explicitly re-proves their authority
-- (a second-click confirm) before calling the RPC with p_step_up=true.
-- Idempotent; applied after 20260825160000.
-- ============================================================================

\echo 'step-up human-decision contract'

CREATE OR REPLACE FUNCTION public.decide_human_decision(
  p_decision_id uuid,
  p_decision text,                  -- 'approved' | 'rejected'
  p_reason text DEFAULT NULL,
  p_step_up boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._governance_guard() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT p_step_up THEN
    RAISE EXCEPTION 'step-up authorization required (p_step_up=true)';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid decision';
  END IF;
  UPDATE public.human_decisions
     SET status = p_decision,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_reason = COALESCE(p_reason, decision_reason)
   WHERE id = p_decision_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  PERFORM public.log_governance_event('governance', 'decision.resolved',
          'Decision ' || p_decision || ' recorded', 'info', 'P3',
          jsonb_build_object('decision_id', p_decision_id, 'decision', p_decision,
                             'reason', COALESCE(p_reason, ''),
                             'step_up', p_step_up));
  RETURN true;
END $$;

-- The creator side records whether step-up was required at queue time —
-- a high-risk or irreversible bill must not be decided casually.
CREATE OR REPLACE FUNCTION public.create_human_decision(
  p_title text,
  p_risk text,
  p_reason text,
  p_proposed_action jsonb,
  p_impact jsonb DEFAULT '{}'::jsonb,
  p_rollback_available boolean DEFAULT false,
  p_step_up boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public._governance_guard() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  INSERT INTO public.human_decisions
    (title, risk, reason, proposed_action, impact, rollback_available)
  VALUES (p_title, p_risk, p_reason,
          COALESCE(p_proposed_action, '{}'::jsonb),
          COALESCE(p_impact, '{}'::jsonb), p_rollback_available)
  RETURNING id INTO v_id;
  PERFORM public.log_governance_event('governance', 'decision.created',
          'Human decision queued: ' || p_title, 'warning', 'P2',
          jsonb_build_object('decision_id', v_id, 'risk', p_risk,
                             'step_up', p_step_up));
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.decide_human_decision(uuid, text, text, boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.create_human_decision(text, text, text, jsonb, jsonb, boolean, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decide_human_decision(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_human_decision(text, text, text, jsonb, jsonb, boolean, boolean) TO authenticated;
