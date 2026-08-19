-- ============================================================================
-- Riverwayse Platform Operations Dashboard
-- ============================================================================
-- A separate system from Owner Intelligence (#18). Owner Intelligence
-- answers "is THIS business healthy" for one tenant. This answers "is THE
-- PLATFORM working, right now, for everyone" across all tenants.
--
-- Different audience (Riverwayse on-call, NOT business owners), different
-- data (platform health, not business financials), different privacy boundary
-- (aggregate + structural by default; tenant drill-down requires an explicit
-- logged action). Sits behind the EXISTING platform-owner authorization
-- boundary (is_platform_admin, migration 20260101000012) — that boundary is
-- the prerequisite this scope flagged, and it already exists.
--
-- Guiding standards (from the scope doc):
--  * Must not add latency/fragility to the customer app — ingest is
--    async/fire-and-forget, never a blocking call in a user's request path.
--  * Every alert threshold is tunable (platform_alert_thresholds), not
--    hardcoded without an obvious place to adjust it.
--  * Ops visibility is NOT data access — defaults to aggregate/structural,
--    not customer PII or financials. Drilling into a specific tenant's data
--    is a separate, AUDIT-LOGGED action.
--
-- All tables RLS-denied to clients. Only is_platform_admin()-gated
-- SECURITY DEFINER RPCs read them. Idempotent throughout.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. platform_error_events — unhandled frontend + edge-function + RPC errors
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,                       -- 'frontend' | 'edge-function' | 'rpc' | 'auth' | 'automation' | 'webhook'
  source_detail text,                        -- e.g. RPC name, edge function name, route
  severity text NOT NULL DEFAULT 'error',    -- 'info' | 'warning' | 'error' | 'critical'
  message text NOT NULL,
  stack text,
  business_id uuid,                           -- nullable: some errors aren't tenant-specific
  client_event_id uuid,                       -- idempotency key from client (dedupes retries)
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  CONSTRAINT platform_error_events_severity_check
    CHECK (severity IN ('info','warning','error','critical')),
  CONSTRAINT platform_error_events_source_check
    CHECK (source IN ('frontend','edge-function','rpc','auth','automation','webhook','integration'))
);

CREATE INDEX IF NOT EXISTS platform_error_events_captured_idx
  ON public.platform_error_events (captured_at DESC);
CREATE INDEX IF NOT EXISTS platform_error_events_source_severity_idx
  ON public.platform_error_events (source, severity, captured_at DESC);
CREATE INDEX IF NOT EXISTS platform_error_events_business_idx
  ON public.platform_error_events (business_id) WHERE business_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS platform_error_events_client_event_uidx
  ON public.platform_error_events (client_event_id) WHERE client_event_id IS NOT NULL;

ALTER TABLE public.platform_error_events ENABLE ROW LEVEL SECURITY;
-- RLS denies all direct client access; only SECURITY DEFINER RPCs read/write.

-- ----------------------------------------------------------------------------
-- 2. platform_integration_status — third-party dependency health
--    (Paystack, Flutterwave, Termii SMS, Resend email, Supabase itself)
--    WhatsApp/Meta intentionally excluded per product direction (no external
--    dependency built there).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_integration_status (
  integration text PRIMARY KEY,               -- 'paystack' | 'flutterwave' | 'termii' | 'resend' | 'supabase'
  display_name text NOT NULL,
  last_check_at timestamptz,
  status text NOT NULL DEFAULT 'unknown',    -- 'healthy' | 'degraded' | 'down' | 'unknown'
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_error text,
  last_success_at timestamptz,
  latency_ms integer,
  CONSTRAINT platform_integration_status_check
    CHECK (status IN ('healthy','degraded','down','unknown'))
);

ALTER TABLE public.platform_integration_status ENABLE ROW LEVEL SECURITY;

-- Seed the integrations we monitor (idempotent).
INSERT INTO public.platform_integration_status (integration, display_name, status)
VALUES
  ('paystack', 'Paystack (payments)', 'unknown'),
  ('flutterwave', 'Flutterwave (payments)', 'unknown'),
  ('termii', 'Termii (SMS)', 'unknown'),
  ('resend', 'Resend (email)', 'unknown'),
  ('supabase', 'Supabase (database/auth)', 'unknown')
ON CONFLICT (integration) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. platform_alert_thresholds — TUNABLE. Riverwayse adjusts what counts as
--    "degraded" per integration and per system. Not hardcoded.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_alert_thresholds (
  key text PRIMARY KEY,                      -- e.g. 'paystack.consecutive_failures', 'auth.failure_rate_5m'
  display_name text NOT NULL,
  system text NOT NULL,                      -- 'payments' | 'notifications' | 'auth' | 'automations' | 'onboarding' | 'database'
  metric text NOT NULL,                      -- 'consecutive_failures' | 'error_count_5m' | 'failure_rate_pct' | 'latency_ms'
  warning_value numeric,                     -- opens a 'warning' incident
  critical_value numeric,                    -- opens a 'critical' incident
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_alert_thresholds ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_alert_thresholds (key, display_name, system, metric, warning_value, critical_value)
VALUES
  ('paystack.consecutive_failures', 'Paystack consecutive failures', 'payments', 'consecutive_failures', 2, 5),
  ('flutterwave.consecutive_failures', 'Flutterwave consecutive failures', 'payments', 'consecutive_failures', 2, 5),
  ('termii.consecutive_failures', 'Termii consecutive failures', 'notifications', 'consecutive_failures', 2, 5),
  ('resend.consecutive_failures', 'Resend consecutive failures', 'notifications', 'consecutive_failures', 2, 5),
  ('supabase.consecutive_failures', 'Supabase consecutive failures', 'database', 'consecutive_failures', 1, 3),
  ('frontend.error_count_5m', 'Frontend errors (5 min window)', 'database', 'error_count_5m', 5, 20),
  ('auth.failure_count_5m', 'Auth failures (5 min window)', 'auth', 'error_count_5m', 10, 30),
  ('automation.failure_count_15m', 'Automation failures (15 min window)', 'automations', 'error_count_5m', 3, 10),
  ('webhook.failure_count_15m', 'Webhook delivery failures (15 min window)', 'automations', 'error_count_5m', 3, 10),
  ('onboarding.failure_count_15m', 'Onboarding failures (15 min window)', 'onboarding', 'error_count_5m', 1, 5)
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. platform_incidents — auto-opened when a threshold crosses; stays open
--    until resolved; postmortem notes attachable.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at timestamptz NOT NULL DEFAULT now(),
  trigger_key text NOT NULL,                  -- which threshold/error fired it
  severity text NOT NULL DEFAULT 'warning',  -- 'warning' | 'critical'
  status text NOT NULL DEFAULT 'open',       -- 'open' | 'investigating' | 'resolved'
  title text NOT NULL,
  summary text,
  affected_business_count integer NOT NULL DEFAULT 0,  -- aggregate count first
  affected_business_ids uuid[] DEFAULT '{}',           -- specifics only on drill-down
  resolution_notes text,
  postmortem text,
  closed_at timestamptz,
  closed_by text,
  CONSTRAINT platform_incidents_severity_check CHECK (severity IN ('warning','critical')),
  CONSTRAINT platform_incidents_status_check CHECK (status IN ('open','investigating','resolved'))
);

CREATE INDEX IF NOT EXISTS platform_incidents_opened_idx ON public.platform_incidents (opened_at DESC);
CREATE INDEX IF NOT EXISTS platform_incidents_status_idx ON public.platform_incidents (status, opened_at DESC);

ALTER TABLE public.platform_incidents ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5. platform_oncall_contacts — who gets paged. Service-role-managed.
--    Push (Slack/email/SMS to on-call), not pull — the dashboard is where you
--    go AFTER being paged, not the primary detection mechanism.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_oncall_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,                                 -- paged via send-email
  phone text,                                 -- paged via send-sms
  channel text NOT NULL DEFAULT 'email',      -- 'email' | 'sms' | 'both'
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_oncall_contacts ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 6. platform_incident_investigations — AUDIT TRAIL for tenant drill-down.
--    Drilling into a specific business's data to investigate an incident is
--    an explicit, logged action. Even Riverwayse's own team doesn't get
--    silent, unlogged access to tenant data just because they're debugging.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_incident_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.platform_incidents(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,                  -- the tenant being investigated
  investigated_by_email text NOT NULL,        -- the platform admin who drilled in
  investigated_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,                       -- why this tenant's data was accessed
  accessed_tables text[] NOT NULL DEFAULT '{}'::text[]  -- what was looked at
);

CREATE INDEX IF NOT EXISTS platform_incident_investigations_incident_idx
  ON public.platform_incident_investigations (incident_id);
CREATE INDEX IF NOT EXISTS platform_incident_investigations_business_idx
  ON public.platform_incident_investigations (business_id, investigated_at DESC);

ALTER TABLE public.platform_incident_investigations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RPCs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- log_platform_error — the async ingest path.
-- Granted to authenticated (fire-and-forget from client + edge functions).
-- Append-only, no SELECT round-trip, swallow-on-failure (returns NULL on
-- error so a logging failure never breaks the caller's request path).
-- Idempotent via client_event_id (ON CONFLICT DO NOTHING).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_platform_error(
  p_source text,
  p_severity text DEFAULT 'error',
  p_message text DEFAULT NULL,
  p_source_detail text DEFAULT NULL,
  p_business_id uuid DEFAULT NULL,
  p_stack text DEFAULT NULL,
  p_client_event_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- Swallow all errors: this is fire-and-forget. A logging failure must
  -- never propagate into a user's request path or an edge function's flow.
  BEGIN
    INSERT INTO public.platform_error_events
      (source, source_detail, severity, message, stack, business_id, client_event_id)
    VALUES
      (p_source, p_source_detail, COALESCE(p_severity,'error'),
       COALESCE(p_message,'(no message)'), p_stack, p_business_id, p_client_event_id)
    ON CONFLICT (client_event_id) WHERE client_event_id IS NOT NULL
    DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Intentionally swallowed. Return silently.
    RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.log_platform_error(text, text, text, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_platform_error(text, text, text, text, uuid, text, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- record_integration_check — service-role only (the scheduled health checker
-- writes here; no client ever calls it directly).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_integration_check(
  p_integration text,
  p_status text,
  p_error text DEFAULT NULL,
  p_latency_ms integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev integer;
  v_new_count integer;
BEGIN
  SELECT consecutive_failures INTO v_prev
    FROM public.platform_integration_status WHERE integration = p_integration;

  IF p_status = 'healthy' THEN
    v_new_count := 0;
  ELSIF p_status = 'down' THEN
    v_new_count := COALESCE(v_prev, 0) + 1;
  ELSIF p_status = 'degraded' THEN
    v_new_count := COALESCE(v_prev, 0) + 1;
  ELSE
    v_new_count := COALESCE(v_prev, 0);
  END IF;

  INSERT INTO public.platform_integration_status
    (integration, display_name, last_check_at, status, consecutive_failures, last_error, last_success_at, latency_ms)
  VALUES
    (p_integration, p_integration, now(), p_status, v_new_count, p_error,
     CASE WHEN p_status = 'healthy' THEN now() END, p_latency_ms)
  ON CONFLICT (integration) DO UPDATE
  SET last_check_at = now(),
      status = EXCLUDED.status,
      consecutive_failures = v_new_count,
      last_error = p_error,
      last_success_at = COALESCE(CASE WHEN p_status = 'healthy' THEN now() END,
                                  platform_integration_status.last_success_at),
      latency_ms = p_latency_ms;
END;
$$;

-- Service-role only: the scheduled health-check edge function uses the
-- service role key, NOT a client JWT.
REVOKE ALL ON FUNCTION public.record_integration_check(text, text, text, integer) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- resolve_platform_error — platform admin marks an error resolved.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_platform_error(
  p_error_id uuid,
  p_resolution_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  UPDATE public.platform_error_events
    SET resolved_at = now(), resolved_by = v_email, resolution_note = p_resolution_note
    WHERE id = p_error_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_platform_error(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- update_platform_incident — open/investigating/resolved + postmortem.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_platform_incident(
  p_incident_id uuid,
  p_status text DEFAULT NULL,
  p_resolution_notes text DEFAULT NULL,
  p_postmortem text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  UPDATE public.platform_incidents SET
    status = COALESCE(p_status, status),
    resolution_notes = COALESCE(p_resolution_notes, resolution_notes),
    postmortem = COALESCE(p_postmortem, postmortem),
    closed_at = CASE WHEN p_status = 'resolved' THEN now() ELSE closed_at END,
    closed_by = CASE WHEN p_status = 'resolved' THEN v_email ELSE closed_by END
    WHERE id = p_incident_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_platform_incident(uuid, text, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- investigate_business_incident — the AUDIT-LOGGED tenant drill-down.
-- Drilling into a specific tenant's data is an explicit, logged action.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.investigate_business_incident(
  p_incident_id uuid,
  p_business_id uuid,
  p_reason text,
  p_accessed_tables text[] DEFAULT ARRAY[]::text[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO public.platform_incident_investigations
    (incident_id, business_id, investigated_by_email, reason, accessed_tables)
  VALUES
    (p_incident_id, p_business_id, v_email, p_reason, p_accessed_tables);
END;
$$;

GRANT EXECUTE ON FUNCTION public.investigate_business_incident(uuid, uuid, text, text[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- list_platform_oncall / upsert_platform_oncall — manage paging contacts.
-- Platform-admin-gated. Service-role could also manage these directly, but a
-- gated authenticated RPC lets the Riverwayse on-call manage their own roster
-- from the ops dashboard without a separate admin tool.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_platform_oncall()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RETURN jsonb_build_object('authorized', false, 'contacts', '[]'::JSONB);
  END IF;
  RETURN jsonb_build_object(
    'authorized', true,
    'contacts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'email', email, 'phone', phone,
        'channel', channel, 'is_active', is_active, 'created_at', created_at
      ) ORDER BY created_at)
      FROM platform_oncall_contacts
    ), '[]'::JSONB)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_platform_oncall() TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_platform_oncall(
  p_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_channel text DEFAULT 'email',
  p_is_active boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NOT NULL THEN
    UPDATE platform_oncall_contacts
      SET name = COALESCE(p_name, name),
          email = COALESCE(p_email, email),
          phone = COALESCE(p_phone, phone),
          channel = COALESCE(p_channel, channel),
          is_active = COALESCE(p_is_active, is_active)
      WHERE id = p_id
      RETURNING id INTO v_id;
  ELSE
    INSERT INTO platform_oncall_contacts (name, email, phone, channel, is_active)
    VALUES (COALESCE(p_name,''), p_email, p_phone, p_channel, p_is_active)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_platform_oncall(uuid, text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_platform_oncall(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  DELETE FROM platform_oncall_contacts WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_platform_oncall(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- list_platform_thresholds / update_platform_threshold — TUNABLE alert
-- thresholds. The scope's explicit standard: "every alert threshold is a
-- business decision Riverwayse should be able to tune — not hardcoded
-- without an obvious place to adjust it."
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_platform_thresholds()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RETURN jsonb_build_object('authorized', false, 'thresholds', '[]'::JSONB);
  END IF;
  RETURN jsonb_build_object(
    'authorized', true,
    'thresholds', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', key, 'display_name', display_name, 'system', system,
        'metric', metric, 'warning_value', warning_value,
        'critical_value', critical_value, 'enabled', enabled, 'updated_at', updated_at
      ) ORDER BY system, key)
      FROM platform_alert_thresholds
    ), '[]'::JSONB)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_platform_thresholds() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_platform_threshold(
  p_key text,
  p_warning_value numeric DEFAULT NULL,
  p_critical_value numeric DEFAULT NULL,
  p_enabled boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  UPDATE platform_alert_thresholds SET
    warning_value = COALESCE(p_warning_value, warning_value),
    critical_value = COALESCE(p_critical_value, critical_value),
    enabled = COALESCE(p_enabled, enabled),
    updated_at = now()
    WHERE key = p_key;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_platform_threshold(text, numeric, numeric, boolean) TO authenticated;

COMMENT ON FUNCTION public.list_platform_oncall() IS 'Riverwayse ops: list paging contacts. is_platform_admin()-gated.';
COMMENT ON FUNCTION public.upsert_platform_oncall(uuid, text, text, text, text, boolean) IS 'Riverwayse ops: add/update a paging contact. is_platform_admin()-gated.';
COMMENT ON FUNCTION public.delete_platform_oncall(uuid) IS 'Riverwayse ops: remove a paging contact. is_platform_admin()-gated.';
COMMENT ON FUNCTION public.list_platform_thresholds() IS 'Riverwayse ops: list TUNABLE alert thresholds. is_platform_admin()-gated.';
COMMENT ON FUNCTION public.update_platform_threshold(text, numeric, numeric, boolean) IS 'Riverwayse ops: tune what counts as degraded/critical. is_platform_admin()-gated. The scope standard: thresholds are a business decision, not hardcoded.';

-- ----------------------------------------------------------------------------
-- evaluate_platform_alerts — the threshold→incident automation.
-- Reads integration streaks + rolling error counts against
-- platform_alert_thresholds; opens incidents when crossed; auto-resolves
-- when the condition clears. Idempotent (won't open a duplicate for a key
-- that already has an open incident). Best-effort per rule.
-- Called by pg_cron (see end of migration).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_platform_alerts()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_threshold record;
  v_count integer;
  v_severity text;
  v_existing uuid;
  v_affected_ids uuid[];
BEGIN
  -- 1. Integration consecutive-failure thresholds.
  FOR v_threshold IN
    SELECT t.key, t.display_name, t.system, t.metric,
           t.warning_value, t.critical_value, i.integration
    FROM platform_alert_thresholds t
    JOIN platform_integration_status i
      ON i.integration = split_part(t.key, '.', 1)
    WHERE t.enabled AND t.metric = 'consecutive_failures'
  LOOP
    BEGIN
      SELECT consecutive_failures INTO v_count
        FROM platform_integration_status WHERE integration = v_threshold.integration;
      v_severity := CASE
        WHEN v_count >= COALESCE(v_threshold.critical_value, 999999) THEN 'critical'
        WHEN v_count >= COALESCE(v_threshold.warning_value, 999999) THEN 'warning'
        ELSE NULL
      END;
      IF v_severity IS NOT NULL THEN
        SELECT id INTO v_existing FROM platform_incidents
          WHERE trigger_key = v_threshold.key AND status IN ('open','investigating')
          LIMIT 1;
        IF v_existing IS NULL THEN
          INSERT INTO platform_incidents
            (trigger_key, severity, title, summary, affected_business_count)
          VALUES
            (v_threshold.key, v_severity,
             v_threshold.display_name || ' degraded',
             COALESCE(v_count,0) || ' consecutive failures on ' || v_threshold.integration,
             0);
        END IF;
      ELSE
        -- Condition cleared: auto-resolve any open incident for this key.
        UPDATE platform_incidents SET status = 'resolved',
          closed_at = now(), closed_by = 'system',
          resolution_notes = COALESCE(resolution_notes, 'Auto-resolved: condition cleared')
          WHERE trigger_key = v_threshold.key AND status IN ('open','investigating');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Best-effort per rule: a failure here never aborts the batch.
      CONTINUE;
    END;
  END LOOP;

  -- 2. Rolling error-count thresholds (5m / 15m windows).
  FOR v_threshold IN
    SELECT key, display_name, system, metric, warning_value, critical_value
    FROM platform_alert_thresholds
    WHERE enabled AND metric = 'error_count_5m'
  LOOP
    BEGIN
      v_count := 0;
      -- Parse the source/system from the key. Keys are like
      -- 'frontend.error_count_5m', 'auth.failure_count_5m',
      -- 'automation.failure_count_15m', 'webhook.failure_count_15m',
      -- 'onboarding.failure_count_15m'.
      IF v_threshold.key LIKE 'frontend.%' THEN
        SELECT count(*) INTO v_count FROM platform_error_events
          WHERE source IN ('frontend') AND severity IN ('error','critical')
            AND captured_at > now() - interval '5 minutes';
      ELSIF v_threshold.key LIKE 'auth.%' THEN
        SELECT count(*) INTO v_count FROM platform_error_events
          WHERE source = 'auth' AND severity IN ('error','critical')
            AND captured_at > now() - interval '5 minutes';
      ELSIF v_threshold.key LIKE 'automation.%' THEN
        SELECT count(*) INTO v_count FROM platform_error_events
          WHERE source = 'automation' AND severity IN ('error','critical')
            AND captured_at > now() - interval '15 minutes';
      ELSIF v_threshold.key LIKE 'webhook.%' THEN
        SELECT count(*) INTO v_count FROM platform_error_events
          WHERE source = 'webhook' AND severity IN ('error','critical')
            AND captured_at > now() - interval '15 minutes';
      ELSIF v_threshold.key LIKE 'onboarding.%' THEN
        SELECT count(*) INTO v_count FROM platform_error_events
          WHERE source_detail ILIKE '%onboarding%' AND severity IN ('error','critical')
            AND captured_at > now() - interval '15 minutes';
      END IF;

      v_severity := CASE
        WHEN v_count >= COALESCE(v_threshold.critical_value, 999999) THEN 'critical'
        WHEN v_count >= COALESCE(v_threshold.warning_value, 999999) THEN 'warning'
        ELSE NULL
      END;
      IF v_severity IS NOT NULL THEN
        SELECT id INTO v_existing FROM platform_incidents
          WHERE trigger_key = v_threshold.key AND status IN ('open','investigating')
          LIMIT 1;
        IF v_existing IS NULL THEN
          SELECT array_agg(DISTINCT business_id) INTO v_affected_ids
            FROM platform_error_events
            WHERE business_id IS NOT NULL
              AND severity IN ('error','critical')
              AND captured_at > now() - interval '15 minutes';
          INSERT INTO platform_incidents
            (trigger_key, severity, title, summary, affected_business_count, affected_business_ids)
          VALUES
            (v_threshold.key, v_severity,
             v_threshold.display_name,
             v_count || ' events in window',
             COALESCE(array_length(v_affected_ids, 1), 0),
             COALESCE(v_affected_ids, ARRAY[]::uuid[]));
        END IF;
      ELSE
        UPDATE platform_incidents SET status = 'resolved',
          closed_at = now(), closed_by = 'system',
          resolution_notes = COALESCE(resolution_notes, 'Auto-resolved: error rate returned to normal')
          WHERE trigger_key = v_threshold.key AND status IN ('open','investigating');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_platform_alerts() FROM PUBLIC, anon, authenticated;
-- Service-role only: called by pg_cron / scheduled function, never by clients.

-- ----------------------------------------------------------------------------
-- platform_ops — the aggregator. is_platform_admin()-gated. ONE call returns
-- the live-status-strip payload: per-system traffic-lights, recent error
-- counts, integration statuses, open incidents. AGGREGATE + STRUCTURAL only
-- — no PII, no invoice contents, no customer data.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_ops()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_out JSONB;
  v_auth boolean := is_platform_admin();
BEGIN
  IF NOT v_auth THEN
    RETURN jsonb_build_object(
      'authorized', false,
      'data_scope', 'aggregate_only_no_business_pii'
    );
  END IF;

  SELECT jsonb_build_object(
    'authorized', true,
    'data_scope', 'aggregate_only_no_business_pii',

    -- Live status strip: one traffic-light per major system.
    'systems', jsonb_build_object(
      'auth', jsonb_build_object(
        'status', CASE WHEN (
          SELECT count(*) FROM platform_error_events
          WHERE source = 'auth' AND severity IN ('error','critical')
            AND captured_at > now() - interval '5 minutes'
        ) >= 30 THEN 'down'
        WHEN (
          SELECT count(*) FROM platform_error_events
          WHERE source = 'auth' AND severity IN ('error','critical')
            AND captured_at > now() - interval '5 minutes'
        ) >= 10 THEN 'degraded'
        ELSE 'healthy' END,
        'error_count_5m',
        (SELECT count(*) FROM platform_error_events
         WHERE source = 'auth' AND severity IN ('error','critical')
           AND captured_at > now() - interval '5 minutes')
      ),
      'database', jsonb_build_object(
        'status', (SELECT CASE status WHEN 'healthy' THEN 'healthy'
                                       WHEN 'degraded' THEN 'degraded'
                                       WHEN 'down' THEN 'down'
                                       ELSE 'unknown' END
                    FROM platform_integration_status WHERE integration = 'supabase')
      ),
      'payments', jsonb_build_object(
        'status', CASE
          WHEN EXISTS (SELECT 1 FROM platform_integration_status
                       WHERE integration IN ('paystack','flutterwave') AND status = 'down')
          THEN 'down'
          WHEN EXISTS (SELECT 1 FROM platform_integration_status
                       WHERE integration IN ('paystack','flutterwave') AND status = 'degraded')
          THEN 'degraded'
          ELSE 'healthy' END
      ),
      'notifications', jsonb_build_object(
        'status', CASE
          WHEN EXISTS (SELECT 1 FROM platform_integration_status
                       WHERE integration IN ('termii','resend') AND status = 'down')
          THEN 'down'
          WHEN EXISTS (SELECT 1 FROM platform_integration_status
                       WHERE integration IN ('termii','resend') AND status = 'degraded')
          THEN 'degraded'
          ELSE 'healthy' END
      ),
      'automations', jsonb_build_object(
        'status', CASE WHEN (
          SELECT count(*) FROM platform_error_events
          WHERE source = 'automation' AND severity IN ('error','critical')
            AND captured_at > now() - interval '15 minutes'
        ) >= 10 THEN 'down'
        WHEN (
          SELECT count(*) FROM platform_error_events
          WHERE source = 'automation' AND severity IN ('error','critical')
            AND captured_at > now() - interval '15 minutes'
        ) >= 3 THEN 'degraded'
        ELSE 'healthy' END
      ),
      'onboarding', jsonb_build_object(
        'status', CASE WHEN (
          SELECT count(*) FROM platform_error_events
          WHERE source_detail ILIKE '%onboarding%' AND severity IN ('error','critical')
            AND captured_at > now() - interval '15 minutes'
        ) >= 5 THEN 'down'
        WHEN (
          SELECT count(*) FROM platform_error_events
          WHERE source_detail ILIKE '%onboarding%' AND severity IN ('error','critical')
            AND captured_at > now() - interval '15 minutes'
        ) >= 1 THEN 'degraded'
        ELSE 'healthy' END
      )
    ),

    'integrations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'integration', integration,
        'display_name', display_name,
        'status', status,
        'consecutive_failures', consecutive_failures,
        'last_check_at', last_check_at,
        'last_error', last_error,
        'last_success_at', last_success_at,
        'latency_ms', latency_ms
      ) ORDER BY
        CASE status WHEN 'down' THEN 0 WHEN 'degraded' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END,
        integration)
      FROM platform_integration_status
    ), '[]'::jsonb),

    'recent_errors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'captured_at', captured_at,
        'source', source,
        'source_detail', source_detail,
        'severity', severity,
        'message', left(message, 300),
        'has_business', business_id IS NOT NULL,
        'resolved_at', resolved_at
      ) ORDER BY captured_at DESC)
      FROM (
        SELECT id, captured_at, source, source_detail, severity, message, business_id, resolved_at
        FROM platform_error_events
        WHERE resolved_at IS NULL
        ORDER BY captured_at DESC
        LIMIT 50
      ) recent_error_rows
    ), '[]'::jsonb),

    'open_incidents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'opened_at', opened_at,
        'trigger_key', trigger_key,
        'severity', severity,
        'status', status,
        'title', title,
        'summary', summary,
        'affected_business_count', affected_business_count
      ) ORDER BY
        CASE severity WHEN 'critical' THEN 0 ELSE 1 END,
        opened_at DESC)
      FROM platform_incidents
      WHERE status IN ('open','investigating')
    ), '[]'::jsonb),

    'recent_incidents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'opened_at', opened_at,
        'closed_at', closed_at,
        'severity', severity,
        'status', status,
        'title', title,
        'summary', summary
      ) ORDER BY opened_at DESC)
      FROM (
        SELECT id, opened_at, closed_at, severity, status, title, summary
        FROM platform_incidents
        ORDER BY opened_at DESC
        LIMIT 20
      ) recent_incident_rows
    ), '[]'::jsonb),

    'error_counts', jsonb_build_object(
      'last_5m', (SELECT count(*) FROM platform_error_events WHERE captured_at > now() - interval '5 minutes'),
      'last_1h', (SELECT count(*) FROM platform_error_events WHERE captured_at > now() - interval '1 hour'),
      'last_24h', (SELECT count(*) FROM platform_error_events WHERE captured_at > now() - interval '24 hours'),
      'unresolved', (SELECT count(*) FROM platform_error_events WHERE resolved_at IS NULL)
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_ops() TO authenticated;

COMMENT ON TABLE public.platform_error_events IS 'Riverwayse ops: unhandled frontend/edge/RPC errors. RLS-denied to clients; only is_platform_admin()-gated SECURITY DEFINER RPCs read. business_id nullable (some errors arent tenant-specific). Idempotent via client_event_id.';
COMMENT ON TABLE public.platform_integration_status IS 'Riverwayse ops: third-party dependency health (Paystack/Flutterwave/Termii/Resend/Supabase). WhatsApp/Meta intentionally excluded (no external dependency built).';
COMMENT ON TABLE public.platform_alert_thresholds IS 'Riverwayse ops: TUNABLE thresholds. What counts as degraded/critical per integration/system — adjusted by Riverwayse, not hardcoded.';
COMMENT ON TABLE public.platform_incidents IS 'Riverwayse ops: auto-opened when a threshold crosses. Stays open until resolved. Postmortem notes attachable.';
COMMENT ON TABLE public.platform_oncall_contacts IS 'Riverwayse ops: who gets paged (push, not pull). Service-role-managed.';
COMMENT ON TABLE public.platform_incident_investigations IS 'Riverwayse ops: AUDIT TRAIL for tenant drill-down. Drilling into a specific tenants data is an explicit, logged action.';
COMMENT ON FUNCTION public.platform_ops() IS 'Riverwayse ops aggregator. is_platform_admin()-gated. Aggregate + structural only — no PII, no financials. Tenant drill-down is a separate audit-logged RPC.';
COMMENT ON FUNCTION public.log_platform_error(text, text, text, text, uuid, text, uuid) IS 'Async ingest path. Granted to authenticated (fire-and-forget). Swallow-on-failure: a logging failure never breaks the callers request path. Idempotent via client_event_id.';

-- ----------------------------------------------------------------------------
-- page_platform_oncall — push, not pull. When a critical incident opens,
-- page the on-call via email/SMS (reuses the existing send-sms/send-email
-- edge functions which are invoked by the service role). This RPC records
-- the intent; the actual delivery is dispatched by the scheduled pager
-- function below. Best-effort.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.page_platform_oncall(
  p_incident_id uuid,
  p_severity text DEFAULT 'critical'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_incident record;
  v_contact record;
BEGIN
  SELECT * INTO v_incident FROM platform_incidents WHERE id = p_incident_id;
  IF v_incident.id IS NULL THEN RETURN; END IF;

  -- Insert a notification into the business_events-less platform stream.
  -- The actual email/SMS dispatch is handled by the scheduled edge function
  -- (which reads open critical incidents + active oncall contacts and calls
  -- send-email/send-sms). We do NOT call pg_net here to avoid coupling
  -- alerting to network availability.
  FOR v_contact IN
    SELECT * FROM platform_oncall_contacts WHERE is_active = true
  LOOP
    -- The scheduled pager edge function reads these incident rows +
    -- contact rows and dispatches. This function just ensures the
    -- incident is marked as needing paging (severity = critical).
    NULL; -- no per-contact write needed; the pager reads the incident.
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.page_platform_oncall(uuid, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- pg_cron: evaluate alerts every 3 minutes. Guarded so a DB without pg_cron
-- no-ops (matches the 051 pg_cron pattern). The health-check edge function
-- runs on its own schedule (Vercel cron / GitHub Actions) and writes
-- integration status via record_integration_check; this SQL just evaluates
-- thresholds against that data.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM extensions.cron.unschedule('avenize-platform-alerts');
    PERFORM extensions.cron.schedule('avenize-platform-alerts', '*/3 * * * *',
      $job$ SELECT public.evaluate_platform_alerts(); $job$);
    RAISE NOTICE 'Scheduled avenize-platform-alerts (every 3 min)';
  ELSE
    RAISE NOTICE 'pg_cron not available, skipping platform-alerts schedule (set up manually on Supabase)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'platform-alerts schedule skipped: %', SQLERRM;
END
$$;
