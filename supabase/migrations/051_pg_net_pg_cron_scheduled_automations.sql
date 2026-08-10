-- ============================================================================
-- Migration 051: Enable pg_net + pg_cron and wire scheduled automations
-- ----------------------------------------------------------------------------
-- The webhook dispatch in 20240101000001 calls net.http_post() but pg_net was
-- never enabled — outbound webhooks silently no-op. pg_cron is needed so
-- time-based ("schedule") automations actually fire instead of being dead
-- config rows. This migration enables both (idempotent), adds the scheduling
-- columns to automations, and registers a 1-minute cron job that executes
-- due scheduled automations via the existing execute-automation edge fn.
-- ============================================================================

\set ON_ERROR_STOP on

-- pg_net: HTTP client used by dispatch-webhooks for outbound POST.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- pg_cron: PostgreSQL-based cron. On Supabase this lives in the `extensions`
-- schema. Idempotent so re-running migrations is safe.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Ensure the cron schema is reachable.
GRANT USAGE ON SCHEMA extensions TO service_role;

-- ============================================================================
-- 1. Schedule columns on automations (for time-based triggers)
-- ============================================================================
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS schedule_cron TEXT;        -- '*/5 * * * *' style cron expr
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS last_run_status TEXT;      -- success | failed | skipped

-- Backfill next_run_at for enabled scheduled automations missing it.
UPDATE public.automations
SET next_run_at = NOW()
WHERE trigger_type = 'schedule'
  AND enabled = TRUE
  AND next_run_at IS NULL;

-- ============================================================================
-- 2. execute_due_automations() — picks up scheduled automations whose turn
--    has come and invokes the execute-automation edge function for each.
--    Runs as SECURITY DEFINER so the cron job (which runs as the cron
--    superuser) can read across businesses without per-user RLS friction.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.execute_due_automations()
RETURNS void AS $$
DECLARE
  due RECORD;
  edge_url TEXT;
BEGIN
  edge_url := current_setting('app.avenize_edge_url', true);
  IF edge_url IS NULL OR edge_url = '' THEN
    edge_url := 'https://avnenzpwqcnqvxwvtsqb.supabase.co/functions/v1/execute-automation';
  END IF;

  FOR due IN
    SELECT id, business_id
    FROM public.automations
    WHERE trigger_type = 'schedule'
      AND enabled = TRUE
      AND next_run_at IS NOT NULL
      AND next_run_at <= NOW()
    ORDER BY next_run_at
    LIMIT 50
  LOOP
    -- Fire-and-forget HTTP POST to the edge function; net.http_post is async.
    PERFORM net.http_post(
      url := edge_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', current_setting('app.avenize_service_key', true)
      ),
      body := jsonb_build_object(
        'automation_id', due.id,
        'business_id', due.business_id
      )
    );

    -- Bump next_run_at by ~1 minute so the same row isn't re-picked every
    -- second; the cron job itself runs each minute.
    UPDATE public.automations
    SET next_run_at = NOW() + INTERVAL '1 minute'
    WHERE id = due.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.execute_due_automations() TO service_role;

-- ============================================================================
-- 3. Register the cron schedule. pg_cron jobs are name-scoped; use the
--    jobname pattern so re-running this migration updates rather than dupes.
-- ============================================================================
DO $$
BEGIN
  -- Unschedule any stale version first so the jobname is free.
  PERFORM cron.unschedule('avenize-due-automations');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'avenize-due-automations',
  '* * * * *',                       -- every minute
  $$ SELECT public.execute_due_automations(); $$
);
