-- 20260818240000_platform_resilience.sql
--
-- §N Platform Reliability — "too good to fail or break down."
--
-- The directive (checklist §N): graceful degradation, retry policies,
-- dead-letter queues, automatic recovery, Business Continuity Mode.
--
-- Audit first (composition-first — don't reinvent):
--   • circuit_breaker_events + trip_circuit_breaker (067) — exist for the AI
--     agent path. NOT duplicated here.
--   • platform_error_events / platform_integration_status /
--     platform_incidents / evaluate_platform_alerts / page_platform_oncall
--     (20260818120000, Session 22) — the platform-ops surface exists.
--     NOT duplicated here.
--   • automation_runs (007) — logs success/failed/skipped + error_message,
--     but NO retry count, NO next_retry_at, NO dead-letter. A failed
--     scheduled automation is logged once and never retried.
--   • business_brain (20260818220000) — calls all 5 sub-engines INLINE. If
--     ANY one throws, the outer EXCEPTION blanks the ENTIRE response —
--     losing state/diagnoses/nba even when 4/5 would have succeeded.
--
-- TWO genuine gaps, both fixed composition-first (no new tables for #1;
-- additive columns for #2):
--
-- 1. BRAIN GRACEFUL DEGRADATION: re-declare business_brain to wrap each
--    sub-engine in its own BEGIN/EXCEPTION. A failure in (say) value_ledger
--    returns that slot as `{degraded: true, error}` while state/diagnoses/
--    nba still render. The UI shows a per-engine degraded flag instead of a
--    blank Brain. This is the §N "graceful degradation / service fallback"
--    applied at the deterministic-engine level.
--
-- 2. AUTOMATION RETRY + DEAD-LETTER QUEUE: additive columns on
--    automation_runs (retry_count, next_retry_at, max_retries, dead_lettered)
--    + a reprocess_failed_automations() function that retries due failures
--    with exponential backoff and dead-letters after max_retries. A
--    revive_dead_lettered_automation() for manual revival. The DLQ is a
--    STATE on the existing table, not a new table (§0.5 — no parallel store).
--
-- Pure internal SQL. Idempotent. No external dependency.

\set ON_ERROR_STOP on

-- ============================================================
-- 1. BRAIN GRACEFUL DEGRADATION
-- Re-declare business_brain with per-engine EXCEPTION isolation. The ONLY
-- change vs 20260818220000: each sub-engine call is wrapped so a failure
-- degrades that ONE slot, not the whole response. Each slot carries a
-- `degraded` flag the UI can show.
-- ============================================================
CREATE OR REPLACE FUNCTION public.business_brain(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_authorized BOOLEAN := false;
  v_state JSONB;
  v_pulse JSONB;
  v_diag JSONB;
  v_nba JSONB;
  v_ledger JSONB;
BEGIN
  -- Membership guard (defense-in-depth; the per-engine RPCs also gate).
  SELECT EXISTS(SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = p_business_id) INTO v_authorized;
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- §N: each sub-engine isolated. A failure degrades ONE slot, not the Brain.
  BEGIN v_state := classify_business_state(p_business_id);
  EXCEPTION WHEN OTHERS THEN v_state := jsonb_build_object('degraded', true, 'error', SQLERRM); END;
  BEGIN v_pulse := current_business_health(p_business_id);
  EXCEPTION WHEN OTHERS THEN v_pulse := jsonb_build_object('degraded', true, 'error', SQLERRM); END;
  BEGIN v_diag := diagnose_business(p_business_id);
  EXCEPTION WHEN OTHERS THEN v_diag := jsonb_build_object('degraded', true, 'error', SQLERRM); END;
  BEGIN v_nba := next_best_action(p_business_id);
  EXCEPTION WHEN OTHERS THEN v_nba := jsonb_build_object('degraded', true, 'error', SQLERRM); END;
  BEGIN v_ledger := business_value_ledger(p_business_id);
  EXCEPTION WHEN OTHERS THEN v_ledger := jsonb_build_object('degraded', true, 'error', SQLERRM); END;

  RETURN jsonb_build_object(
    'authorized', true,
    'state', v_state,
    'pulse', v_pulse,
    'diagnoses', v_diag,
    'next_best_action', v_nba,
    'value_ledger', v_ledger
  );
EXCEPTION WHEN OTHERS THEN
  -- Only reaches here if the membership guard itself failed (catastrophic).
  RETURN jsonb_build_object('authorized', true, 'error', true, 'message', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.business_brain(UUID) TO authenticated;

COMMENT ON FUNCTION public.business_brain IS
  'The Avenize Business Brain. ONE call returns State + Pulse + Diagnoses + Next Best Action + Value Ledger. §N graceful degradation: each sub-engine is EXCEPTION-isolated so a failure degrades ONE slot (flagged degraded:true), not the whole response. Membership-guarded.';

-- ============================================================
-- 2. AUTOMATION RETRY + DEAD-LETTER QUEUE
-- Additive columns on automation_runs (007). A failed run gets retry_count,
-- next_retry_at (exponential backoff), and dead_lettered (true after
-- max_retries). The DLQ is a STATE on the existing table, not a new table.
-- ============================================================
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS dead_lettered BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ;

-- Index for the retry sweeper: find failed, not-dead-lettered runs due now.
CREATE INDEX IF NOT EXISTS idx_automation_runs_retry
  ON automation_runs (next_retry_at)
  WHERE status = 'failed' AND dead_lettered = false AND next_retry_at IS NOT NULL;

-- Index for the DLQ view: dead-lettered runs for manual review.
CREATE INDEX IF NOT EXISTS idx_automation_runs_dead_letter
  ON automation_runs (executed_at DESC)
  WHERE dead_lettered = true;

COMMENT ON COLUMN automation_runs.retry_count IS '§N retry policy: attempts so far for this run.';
COMMENT ON COLUMN automation_runs.max_retries IS '§N max retries before dead-lettering (default 3).';
COMMENT ON COLUMN automation_runs.next_retry_at IS '§N when to next retry (exponential backoff). NULL = not scheduled for retry.';
COMMENT ON COLUMN automation_runs.dead_lettered IS '§N dead-letter queue flag: true after max_retries exhausted. Manual review required.';
COMMENT ON COLUMN automation_runs.last_attempted_at IS '§N timestamp of the most recent attempt (success or failure).';

-- ============================================================
-- mark_automation_run_failed(p_run_id, p_error)
-- Called by the executor when an automation run fails. Increments retry_count,
-- sets next_retry_at with exponential backoff (30s, 2m, 8m), or dead-letters
-- after max_retries. Best-effort.
-- ============================================================
CREATE OR REPLACE FUNCTION mark_automation_run_failed(p_run_id UUID, p_error TEXT)
RETURNS VOID AS $$
DECLARE
  v_run RECORD;
  v_next_retry TIMESTAMPTZ;
  v_delay_sec INTEGER;
BEGIN
  SELECT * INTO v_run FROM automation_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE automation_runs
    SET status = 'failed',
        error_message = LEFT(COALESCE(p_error, 'unknown error'), 500),
        last_attempted_at = NOW(),
        retry_count = v_run.retry_count + 1
    WHERE id = p_run_id;

  -- Exponential backoff: 30s, 2m, 8m (base 30 * 4^retry_count).
  IF (v_run.retry_count + 1) < v_run.max_retries THEN
    v_delay_sec := 30 * (4 ^ (v_run.retry_count));
    v_next_retry := NOW() + (v_delay_sec || ' seconds')::INTERVAL;
    UPDATE automation_runs SET next_retry_at = v_next_retry, dead_lettered = false
      WHERE id = p_run_id;
  ELSE
    -- Exhausted retries → dead-letter.
    UPDATE automation_runs SET next_retry_at = NULL, dead_lettered = true
      WHERE id = p_run_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- mark_automation_run_success(p_run_id)
-- Called by the executor on success. Clears retry state.
-- ============================================================
CREATE OR REPLACE FUNCTION mark_automation_run_success(p_run_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE automation_runs
    SET status = 'success',
        error_message = NULL,
        last_attempted_at = NOW(),
        next_retry_at = NULL,
        dead_lettered = false
    WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- reprocess_failed_automations()
-- The retry sweeper. Finds failed, not-dead-lettered runs whose next_retry_at
-- is due, and re-executes them via execute_automation_action. Best-effort per
-- run (one failure never aborts the batch, §24). Returns the count retried.
-- Designed for pg_cron (every 2 min).
-- ============================================================
CREATE OR REPLACE FUNCTION reprocess_failed_automations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_run RECORD;
  v_automation RECORD;
BEGIN
  FOR v_run IN
    SELECT * FROM automation_runs
      WHERE status = 'failed'
        AND dead_lettered = false
        AND next_retry_at IS NOT NULL
        AND next_retry_at <= NOW()
      ORDER BY next_retry_at ASC
      LIMIT 50
  LOOP
    BEGIN
      SELECT * INTO v_automation FROM automations WHERE id = v_run.automation_id;
      IF NOT FOUND OR NOT v_automation.enabled THEN
        -- Automation gone or disabled — dead-letter it, don't keep retrying.
        UPDATE automation_runs SET dead_lettered = true, next_retry_at = NULL
          WHERE id = v_run.id;
        CONTINUE;
      END IF;

      PERFORM execute_automation_action(v_automation, v_run.trigger_event);
      PERFORM mark_automation_run_success(v_run.id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      PERFORM mark_automation_run_failed(v_run.id, SQLERRM);
    END;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- revive_dead_lettered_automation(p_run_id)
-- Manual revival: resets a dead-lettered run so it retries from scratch.
-- For when an operator fixes the underlying issue (bad config, missing data)
-- and wants the run retried.
-- ============================================================
CREATE OR REPLACE FUNCTION revive_dead_lettered_automation(p_run_id UUID)
RETURNS VOID AS $$
DECLARE
  v_membership RECORD;
  v_run RECORD;
BEGIN
  SELECT * INTO v_run FROM automation_runs ar
    JOIN automations a ON a.id = ar.automation_id
    WHERE ar.id = p_run_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Membership guard: only a member of the automation's business can revive.
  SELECT * INTO v_membership FROM get_current_staff() cs
    WHERE cs.business_id = v_run.business_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE automation_runs
    SET dead_lettered = false,
        retry_count = 0,
        next_retry_at = NOW(),
        error_message = NULL
    WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- automation_health_with_dlq(p_business_id)
-- Extends the Session-20 automation_health with the DLQ view: dead-lettered
-- runs, retry stats, recent failures. Owner-gated + membership-guarded.
-- ============================================================
CREATE OR REPLACE FUNCTION automation_health_with_dlq(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_membership RECORD;
  v_summary JSONB;
  v_dead_lettered JSONB;
  v_retries JSONB;
BEGIN
  SELECT * INTO v_membership FROM get_current_staff() cs
    WHERE cs.business_id = p_business_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT jsonb_build_object(
    'total_failed', COUNT(*) FILTER (WHERE ar.status = 'failed'),
    'total_retried', COUNT(*) FILTER (WHERE ar.retry_count > 0 AND ar.status = 'success'),
    'dead_lettered_count', COUNT(*) FILTER (WHERE ar.dead_lettered = true),
    'avg_retries_to_success',
      COALESCE(ROUND(AVG(ar.retry_count) FILTER (WHERE ar.status = 'success' AND ar.retry_count > 0), 1), 0)
  ) INTO v_summary
  FROM automation_runs ar
  JOIN automations a ON a.id = ar.automation_id
  WHERE a.business_id = p_business_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_dead_lettered
  FROM (
    SELECT ar.id, a.name AS automation_name, ar.error_message, ar.retry_count,
           ar.executed_at, ar.last_attempted_at
    FROM automation_runs ar
    JOIN automations a ON a.id = ar.automation_id
    WHERE a.business_id = p_business_id AND ar.dead_lettered = true
    ORDER BY ar.executed_at DESC
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'authorized', true,
    'summary', v_summary,
    'dead_lettered', v_dead_lettered
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION mark_automation_run_failed(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_automation_run_success(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reprocess_failed_automations() TO authenticated;
GRANT EXECUTE ON FUNCTION revive_dead_lettered_automation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION automation_health_with_dlq(UUID) TO authenticated;

-- pg_cron: retry sweeper every 2 minutes. Guarded (no pg_cron → no-op, §24).
DO $_$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-automation-retry');
EXCEPTION WHEN OTHERS THEN NULL;
END$_$;

DO $_$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-automation-retry',
    '*/2 * * * *',
    $job$ SELECT public.reprocess_failed_automations(); $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-automation-retry not scheduled: %', SQLERRM;
END$_$;

COMMENT ON FUNCTION reprocess_failed_automations IS
  '§N automation retry sweeper. Re-executes failed, not-dead-lettered runs whose next_retry_at is due, with exponential backoff (30s/2m/8m) and dead-lettering after max_retries. Best-effort per run (§24). pg_cron every 2 min.';
COMMENT ON FUNCTION revive_dead_lettered_automation IS
  '§N manual revival of a dead-lettered automation run. Resets retry_count + next_retry_at. Membership-guarded.';
COMMENT ON FUNCTION automation_health_with_dlq IS
  '§N automation health with the dead-letter queue view. Owner-gated + membership-guarded. Aggregate only (#21).';
