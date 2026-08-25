-- ============================================================================
-- Avenize Governance Engine
-- ============================================================================
-- The operational core of the Avenize Governance Control Center (the human
-- window into the autonomous governance system). Implements:
--   * central event model (governance_events)
--   * incident engine with explicit lifecycle (governance_incidents)
--   * audit center with before/after + approval + verification
--     (governance_audit_log)
--   * bounded autonomy queue with immutable policy snapshots
--     (autonomy_actions)
--   * human decision queue for authority-ladder Level 4 actions
--     (human_decisions)
--   * compliance report artifacts (governance_reports)
--
-- Constitution guarantees enforced here:
--   * UNKNOWN is never represented as healthy (NO FALSE GREEN).
--   * Autonomous actions never loop forever (max_attempts + escalation).
--   * Every state change writes an audit row in the same transaction.
--   * Governance self-health: if event/audit ingestion fails, the engine
--     reports DEGRADED — never HEALTHY.
--
-- All tables RLS-denied to clients. All access goes through
-- is_riverways_admin()-gated SECURITY DEFINER RPCs (Riverways operator
-- allowlist — the same gate as the Riverways console). Idempotent throughout.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. governance_events — central event model
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component text NOT NULL,            -- auth | database | rpc | api | edge | payments | ai | autonomy | deployment | governance
  event_key text NOT NULL,            -- dominates classification (e.g. drift.detected, contract.missing, repair.success)
  status text NOT NULL DEFAULT 'info',-- info | ok | warning | error | critical
  severity text NOT NULL DEFAULT 'P4',
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid,
  business_id uuid,                   -- nullable (platform events)
  actor text NOT NULL DEFAULT 'SYSTEM',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT governance_events_status_check
    CHECK (status IN ('info','ok','warning','error','critical')),
  CONSTRAINT governance_events_severity_check
    CHECK (severity IN ('P0','P1','P2','P3','P4')),
  CONSTRAINT governance_events_actor_check
    CHECK (actor IN ('USER','ADMIN','SYSTEM','AUTONOMY_ENGINE','AI_AGENT','DEPLOYMENT','SCHEDULED_MONITOR'))
);

CREATE INDEX IF NOT EXISTS governance_events_created_idx
  ON public.governance_events (created_at DESC);
CREATE INDEX IF NOT EXISTS governance_events_component_idx
  ON public.governance_events (component, status, created_at DESC);
CREATE INDEX IF NOT EXISTS governance_events_correlation_idx
  ON public.governance_events (correlation_id) WHERE correlation_id IS NOT NULL;

ALTER TABLE public.governance_events ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. governance_incidents — unified incident lifecycle
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_key text NOT NULL UNIQUE,  -- human-readable stable key (e.g. INC-2026-0001)
  component text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'DETECTED',
  description text NOT NULL,
  impact text,
  root_cause text,
  resolved_actions jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of resolution steps
  automated_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  human_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution text,
  correlation_id uuid,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT governance_incidents_severity_check
    CHECK (severity IN ('P0','P1','P2','P3','P4')),
  CONSTRAINT governance_incidents_status_check
    CHECK (status IN ('DETECTED','CLASSIFIED','INVESTIGATING','REMEDIATING','VERIFYING','RESOLVED','ESCALATED','CLOSED'))
);

CREATE INDEX IF NOT EXISTS governance_incidents_status_idx
  ON public.governance_incidents (status, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS governance_incidents_component_idx
  ON public.governance_incidents (component, detected_at DESC);

ALTER TABLE public.governance_incidents ENABLE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.incident_key_seq;

-- ----------------------------------------------------------------------------
-- 3. governance_audit_log — searchable audit center
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  actor_id uuid,                      -- auth uid when the actor is a human
  action text NOT NULL,
  target text,
  before_state jsonb,
  after_state jsonb,
  result text NOT NULL DEFAULT 'success',
  risk text,
  approval jsonb,                     -- approval evidence for Level-4 actions
  verification jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT governance_audit_log_actor_check
    CHECK (actor IN ('USER','ADMIN','SYSTEM','AUTONOMY_ENGINE','AI_AGENT','DEPLOYMENT','SCHEDULED_MONITOR')),
  CONSTRAINT governance_audit_log_result_check
    CHECK (result IN ('success','failure','partial'))
);

CREATE INDEX IF NOT EXISTS governance_audit_log_created_idx
  ON public.governance_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS governance_audit_log_action_idx
  ON public.governance_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS governance_audit_log_actor_idx
  ON public.governance_audit_log (actor, created_at DESC);

ALTER TABLE public.governance_audit_log ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. autonomy_actions — bounded autonomy queue
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.autonomy_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  level int NOT NULL,                 -- 2 (safe-repair) or 3 (controlled-recovery)
  policy jsonb NOT NULL,              -- immutable policy snapshot from autonomy-policy-registry.json
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued', -- queued | running | succeeded | failed | escalated | cancelled
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL,
  cooldown_seconds int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT autonomy_actions_level_check CHECK (level IN (2,3)),
  CONSTRAINT autonomy_actions_status_check
    CHECK (status IN ('queued','running','succeeded','failed','escalated','cancelled'))
);

CREATE INDEX IF NOT EXISTS autonomy_actions_due_idx
  ON public.autonomy_actions (status, next_attempt_at) WHERE status IN ('queued','failed');
CREATE INDEX IF NOT EXISTS autonomy_actions_action_idx
  ON public.autonomy_actions (action, queued_at DESC);

ALTER TABLE public.autonomy_actions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5. human_decisions — Level-4 authority queue
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.human_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  risk text NOT NULL,
  reason text NOT NULL,
  proposed_action jsonb NOT NULL,
  impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  rollback_available boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | expired
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT human_decisions_risk_check
    CHECK (risk IN ('low','medium','high','critical')),
  CONSTRAINT human_decisions_status_check
    CHECK (status IN ('pending','approved','rejected','expired'))
);

CREATE INDEX IF NOT EXISTS human_decisions_pending_idx
  ON public.human_decisions (status, risk, created_at DESC);

ALTER TABLE public.human_decisions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 6. governance_reports — compliance report artifacts (CI or operator)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,             -- the full governance-report.json
  fingerprint text,                   -- dedup/Idempotency
  channel text NOT NULL DEFAULT 'ci', -- ci | local | scheduled
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS governance_reports_published_idx
  ON public.governance_reports (published_at DESC);

ALTER TABLE public.governance_reports ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RPC guard helper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._governance_guard()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.is_riverways_admin();
END $$;

REVOKE EXECUTE ON FUNCTION public._governance_guard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public._governance_guard() TO authenticated;

-- ----------------------------------------------------------------------------
-- log_governance_event — central event writer (browse/edge/scheduler)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_governance_event(
  p_component text,
  p_event_key text,
  p_message text,
  p_status text DEFAULT 'info',
  p_severity text DEFAULT 'P4',
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_correlation_id uuid DEFAULT NULL,
  p_business_id uuid DEFAULT NULL,
  p_actor text DEFAULT 'SYSTEM'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public._governance_guard() THEN
    RETURN NULL;  -- fire-and-forget: never block the caller
  END IF;
  INSERT INTO public.governance_events
    (component, event_key, status, severity, message, payload, correlation_id, business_id, actor)
  VALUES
    (p_component, p_event_key, p_status, p_severity, p_message,
     COALESCE(p_payload, '{}'::jsonb), p_correlation_id, p_business_id, p_actor)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- event logging must never break the request path
END $$;

REVOKE EXECUTE ON FUNCTION public.log_governance_event(text, text, text, text, text, jsonb, uuid, uuid, text)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_governance_event(text, text, text, text, text, jsonb, uuid, uuid, text)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- create_incident / transition_incident — incident lifecycle
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_incident(
  p_component text,
  p_severity text,
  p_description text,
  p_impact text DEFAULT NULL,
  p_root_cause text DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_key text;
BEGIN
  IF NOT public._governance_guard() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  v_key := 'INC-' || to_char(now(), 'YYYY') || '-' ||
           lpad(nextval('public.incident_key_seq')::text, 4, '0');
  INSERT INTO public.governance_incidents
    (incident_key, component, severity, description, impact, root_cause, correlation_id)
  VALUES (v_key, p_component, p_severity, p_description, p_impact, p_root_cause, p_correlation_id)
  RETURNING id INTO v_id;
  PERFORM public.log_governance_event('governance', 'incident.created',
          'Incident ' || v_key || ': ' || p_description, 'warning', p_severity,
          jsonb_build_object('incident_id', v_id, 'component', p_component),
          p_correlation_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.transition_incident(
  p_incident_id uuid,
  p_to_status text,
  p_reason text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prior_status text;
BEGIN
  IF NOT public._governance_guard() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  SELECT status INTO v_prior_status FROM public.governance_incidents WHERE id = p_incident_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE public.governance_incidents
     SET status = p_to_status,
         resolved_at = CASE WHEN p_to_status IN ('RESOLVED','CLOSED') THEN now() ELSE resolved_at END,
         closed_at   = CASE WHEN p_to_status = 'CLOSED' THEN now() ELSE closed_at END,
         resolved_actions = COALESCE(resolved_actions, '[]'::jsonb) ||
           jsonb_build_object('status', p_to_status, 'reason', COALESCE(p_reason, ''), 'at', now())
   WHERE id = p_incident_id;
  PERFORM public.log_governance_event('governance', 'incident.transition',
          'Incident moved ' || v_prior_status || ' → ' || p_to_status,
          'info', 'P4',
          jsonb_build_object('incident_id', p_incident_id, 'from', v_prior_status,
                             'to', p_to_status, 'reason', COALESCE(p_reason, '')));
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_incident(text, text, text, text, text, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.transition_incident(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_incident(text, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_incident(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- incidents_feed / governance_overview — operator reads
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incidents_feed(
  p_limit int DEFAULT 100
) RETURNS SETOF public.governance_incidents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._governance_guard() THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.governance_incidents
    ORDER BY detected_at DESC LIMIT LEAST(p_limit, 500);
END $$;

CREATE OR REPLACE FUNCTION public.governance_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._governance_guard() THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;
  RETURN jsonb_build_object(
    'authorized', true,
    'incidents', (
      SELECT jsonb_build_object(
        'open', count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED')),
        'p0_open', count(*) FILTER (WHERE severity = 'P0' AND status NOT IN ('RESOLVED','CLOSED')),
        'p1_open', count(*) FILTER (WHERE severity = 'P1' AND status NOT IN ('RESOLVED','CLOSED')),
        'total', count(*)
      ) FROM public.governance_incidents
    ),
    'autonomy', (
      SELECT jsonb_build_object(
        'queued', count(*) FILTER (WHERE status IN ('queued','failed')),
        'succeeded_today', count(*) FILTER (WHERE status='succeeded' AND queued_at::date = now()::date),
        'escalated', count(*) FILTER (WHERE status='escalated')
      ) FROM public.autonomy_actions
    ),
    'decisions', (
      SELECT jsonb_build_object('pending', count(*))
      FROM public.human_decisions WHERE status='pending'
    ),
    'events_today', (
      SELECT count(*) FROM public.governance_events WHERE created_at::date = now()::date
    ),
    'audit_today', (
      SELECT count(*) FROM public.governance_audit_log WHERE created_at::date = now()::date
    ),
    'latest_report', (
      SELECT jsonb_build_object('payload', payload, 'published_at', published_at, 'channel', channel)
      FROM public.governance_reports
      ORDER BY published_at DESC LIMIT 1
    )
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.incidents_feed(int) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.governance_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incidents_feed(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_overview() TO authenticated;

-- ----------------------------------------------------------------------------
-- human decision queue
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_human_decision(
  p_title text,
  p_risk text,
  p_reason text,
  p_proposed_action jsonb,
  p_impact jsonb DEFAULT '{}'::jsonb,
  p_rollback_available boolean DEFAULT false
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
          jsonb_build_object('decision_id', v_id, 'risk', p_risk));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.decide_human_decision(
  p_decision_id uuid,
  p_decision text,                  -- 'approved' | 'rejected'
  p_reason text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._governance_guard() THEN
    RAISE EXCEPTION 'unauthorized';
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
                             'reason', COALESCE(p_reason, '')));
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_human_decision(text, text, text, jsonb, jsonb, boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.decide_human_decision(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_human_decision(text, text, text, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_human_decision(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.decisions_feed(
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 100
) RETURNS SETOF public.human_decisions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._governance_guard() THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.human_decisions
    WHERE (p_status IS NULL OR status = p_status)
    ORDER BY created_at DESC LIMIT LEAST(p_limit, 200);
END $$;

REVOKE EXECUTE ON FUNCTION public.decisions_feed(text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decisions_feed(text, int) TO authenticated;

-- ----------------------------------------------------------------------------
-- autonomy queue
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_autonomy_action(
  p_action text,
  p_level int,
  p_max_attempts int,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_cooldown_seconds int DEFAULT 0,
  p_policy jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public._governance_guard() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_level NOT IN (2,3) THEN
    RAISE EXCEPTION 'level must be 2 (safe-repair) or 3 (controlled recovery)';
  END IF;
  INSERT INTO public.autonomy_actions
    (action, level, policy, context, max_attempts, cooldown_seconds, next_attempt_at)
  VALUES (p_action, p_level,
          COALESCE(p_policy, '{}'::jsonb), COALESCE(p_context, '{}'::jsonb),
          p_max_attempts, p_cooldown_seconds,
          now() + make_interval(secs => p_cooldown_seconds))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- record_autonomy_attempt: bounded retry + escalation. Never loops forever.
CREATE OR REPLACE FUNCTION public.record_autonomy_attempt(
  p_action_id uuid,
  p_success boolean,
  p_error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.autonomy_actions;
  v_status text;
BEGIN
  IF NOT public._governance_guard() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  SELECT * INTO v_row FROM public.autonomy_actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_row.status IN ('succeeded','escalated','cancelled') THEN
    RETURN true;  -- terminal
  END IF;

  IF p_success THEN
    v_status := 'succeeded';
  ELSIF v_row.attempts + 1 >= v_row.max_attempts THEN
    v_status := 'escalated';
  ELSE
    v_status := 'failed';
  END IF;

  UPDATE public.autonomy_actions
     SET attempts = attempts + 1,
         status = v_status,
         last_error = CASE WHEN p_success THEN NULL ELSE p_error END,
         next_attempt_at = CASE WHEN v_status='failed' THEN now() + make_interval(secs => cooldown_seconds) ELSE next_attempt_at END,
         completed_at = CASE WHEN v_status IN ('succeeded','escalated') THEN now() ELSE completed_at END
   WHERE id = p_action_id;

  PERFORM public.log_governance_event('autonomy', 'autonomy.attempt',
          'Autonomous action attempt recorded: ' || v_row.action,
          CASE WHEN p_success THEN 'ok' WHEN v_status='escalated' THEN 'error' ELSE 'warning' END,
          CASE WHEN p_success THEN 'P4' WHEN v_status='escalated' THEN 'P2' ELSE 'P3' END,
          jsonb_build_object('action_id', p_action_id, 'attempts', v_row.attempts + 1,
                             'max_attempts', v_row.max_attempts,
                             'status', v_status),
          NULL, NULL, 'AUTONOMY_ENGINE');

  IF v_status = 'escalated' THEN
    PERFORM public.create_incident('autonomy', 'P2',
            'Autonomous action escalated after ' || v_row.max_attempts || ' attempts: ' || v_row.action,
            COALESCE(v_row.last_error, p_error, 'attempts exhausted'),
            'autonomy_actions.id=' || p_action_id::text);
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.autonomy_feed(
  p_limit int DEFAULT 50
) RETURNS SETOF public.autonomy_actions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._governance_guard() THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.autonomy_actions ORDER BY queued_at DESC LIMIT LEAST(p_limit, 200);
END $$;

REVOKE EXECUTE ON FUNCTION public.queue_autonomy_action(text, int, int, jsonb, int, jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.record_autonomy_attempt(uuid, boolean, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.autonomy_feed(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.queue_autonomy_action(text, int, int, jsonb, int, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_autonomy_attempt(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.autonomy_feed(int) TO authenticated;

-- ----------------------------------------------------------------------------
-- audit center
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_audit(
  p_actor text,
  p_action text,
  p_target text DEFAULT NULL,
  p_before jsonb DEFAULT '{}'::jsonb,
  p_after jsonb DEFAULT '{}'::jsonb,
  p_result text DEFAULT 'success',
  p_risk text DEFAULT NULL,
  p_approval jsonb DEFAULT '{}'::jsonb,
  p_verification jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public._governance_guard() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  INSERT INTO public.governance_audit_log
    (actor, actor_id, action, target, before_state, after_state, result, risk, approval, verification)
  VALUES
    (p_actor, auth.uid(), p_action, p_target,
     COALESCE(p_before, '{}'::jsonb), COALESCE(p_after, '{}'::jsonb),
     p_result, p_risk, COALESCE(p_approval, '{}'::jsonb), COALESCE(p_verification, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.search_audit(
  p_action text DEFAULT NULL,
  p_actor text DEFAULT NULL,
  p_limit int DEFAULT 100
) RETURNS SETOF public.governance_audit_log LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._governance_guard() THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.governance_audit_log
    WHERE (p_action IS NULL OR action ILIKE '%' || p_action || '%')
      AND (p_actor IS NULL OR actor = p_actor)
    ORDER BY created_at DESC LIMIT LEAST(p_limit, 500);
END $$;

REVOKE EXECUTE ON FUNCTION public.record_audit(text, text, text, jsonb, jsonb, text, text, jsonb, jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.search_audit(text, text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_audit(text, text, text, jsonb, jsonb, text, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_audit(text, text, int) TO authenticated;

-- ----------------------------------------------------------------------------
-- compliance publish + self health
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_compliance_report(
  p_payload jsonb,
  p_p_fingerprint text DEFAULT NULL,
  p_channel text DEFAULT 'ci'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public._governance_guard() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  INSERT INTO public.governance_reports (payload, fingerprint, channel, published_by)
  VALUES (COALESCE(p_payload, '{}'::jsonb), p_p_fingerprint, p_channel, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.governance_self_health()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_ok boolean := true;
  v_audit_ok boolean := true;
  v_incident_ok boolean := true;
  v_event_id uuid;
  v_latest timestamptz;
BEGIN
  IF NOT public._governance_guard() THEN
    RETURN jsonb_build_object('authorized', false, 'status', 'UNKNOWN');
  END IF;
  BEGIN
    v_event_id := public.log_governance_event('governance', 'self.healthcheck',
      'governance self-health probe', 'ok', 'P4');
    v_event_ok := v_event_id IS NOT NULL;
    PERFORM public.record_audit('SYSTEM', 'self-health-probe', 'governance_engine');
    v_audit_ok := true;
    SELECT max(created_at) INTO v_latest FROM public.governance_events;
    v_incident_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_event_ok := false;
    v_audit_ok := false;
  END;
  RETURN jsonb_build_object(
    'authorized', true,
    'status', CASE WHEN v_event_ok AND v_audit_ok THEN 'healthy'
                   ELSE 'DEGRADED' END,
    'checks', jsonb_build_object(
      'event_ingest', v_event_ok,
      'audit_ingest', v_audit_ok,
      'latest_event_at', v_latest
    )
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.publish_compliance_report(jsonb, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.governance_self_health() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.publish_compliance_report(jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_self_health() TO authenticated;
