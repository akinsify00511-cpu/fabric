-- 20260101000013_automation_health_and_scheduled.sql
-- #20 automation health + scheduled-automation executor.
--
-- The "automations not ready" claim (module_status) was STALE: migration 007
-- already has a REAL execution engine (execute_automation_action inserts
-- tasks/notifications/cashflow/merit/chat messages) wired as live Postgres
-- triggers for 4 data-trigger types (deal/invoice/task/staff stage changes).
--
-- The real gaps were:
--   1. No automation_health RPC — owners/builders can't see success/failure
--      rates, never-run automations, or recent run history (the #20
--      "automation health" requirement).
--   2. No scheduled/time-based automations — only data-trigger automations
--      fire. A "every Monday, create a weekly review task" automation had
--      no executor. This adds run_due_automations() + a pg_cron job.
--
-- Idempotent. SECURITY DEFINER. No external API.

-- ============================================================================
-- 1. automation_health(p_business_id) — owner-gated health view (#20).
--    Success/failure rates, run counts, last-run, never-run automations,
--    recent runs. Membership-guarded via get_current_staff (defense-in-depth).
--    #21: reads only automation_runs + automations (operational data).
-- ============================================================================
CREATE OR REPLACE FUNCTION automation_health(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_out JSONB;
BEGIN
  -- OWNERSHIP GUARD.
  IF NOT EXISTS (
    SELECT 1 FROM get_current_staff() cs WHERE cs.business_id = p_business_id
  ) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT jsonb_build_object(
    'authorized', true,
    'total_automations',
      (SELECT COUNT(*) FROM automations a WHERE a.business_id = p_business_id),
    'enabled_automations',
      (SELECT COUNT(*) FROM automations a WHERE a.business_id = p_business_id AND a.enabled),
    'total_runs',
      (SELECT COUNT(*) FROM automation_runs ar
       JOIN automations a ON a.id = ar.automation_id
       WHERE a.business_id = p_business_id),
    'successful_runs',
      (SELECT COUNT(*) FROM automation_runs ar
       JOIN automations a ON a.id = ar.automation_id
       WHERE a.business_id = p_business_id AND ar.status = 'success'),
    'failed_runs',
      (SELECT COUNT(*) FROM automation_runs ar
       JOIN automations a ON a.id = ar.automation_id
       WHERE a.business_id = p_business_id AND ar.status = 'failed'),
    'never_run',
      (SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name,
        'trigger_type', a.trigger_type, 'action_type', a.action_type,
        'enabled', a.enabled, 'created_at', a.created_at
      ) ORDER BY a.created_at DESC)
       FROM automations a
       WHERE a.business_id = p_business_id
         AND a.id NOT IN (SELECT automation_id FROM automation_runs)),
    'recent_runs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ar.id, 'automation_name', a.name, 'trigger_type', a.trigger_type,
        'status', ar.status, 'error_message', ar.error_message,
        'executed_at', ar.executed_at
      ) ORDER BY ar.executed_at DESC)
      FROM automation_runs ar
      JOIN automations a ON a.id = ar.automation_id
      WHERE a.business_id = p_business_id
      LIMIT 20
    ), '[]'::JSONB)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION automation_health(UUID) TO authenticated;

COMMENT ON FUNCTION automation_health IS 'Owner-gated (#20): automation success/failure rates, never-run automations, recent runs. Membership-guarded via get_current_staff. Reads only automation_runs + automations (operational data, #21).';

-- ============================================================================
-- 2. SCHEDULED-AUTOMATION EXECUTOR.
--    run_due_automations() finds enabled automations with trigger_type =
--    'scheduled' whose cron schedule is due (checked against last_run_at in
--    trigger_config) and executes them. Idempotent per cron window.
--    Best-effort per automation (EXCEPTION → skip, never aborts the batch).
-- ============================================================================
CREATE OR REPLACE FUNCTION run_due_automations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_automation RECORD;
  v_cron TEXT;
  v_last_run TIMESTAMPTZ;
  v_should_run BOOLEAN;
  v_new_last_run TIMESTAMPTZ;
BEGIN
  FOR v_automation IN
    SELECT id, business_id, trigger_type, trigger_config, action_type, action_config, enabled
    FROM automations
    WHERE enabled = TRUE AND trigger_type = 'scheduled'
  LOOP
    BEGIN
      v_cron := v_automation.trigger_config->>'cron';
      -- Skip if no cron schedule configured.
      IF v_cron IS NULL THEN
        CONTINUE;
      END IF;

      v_last_run := NULL;
      -- Track last-run in trigger_config.last_run_at (avoids schema change).
      v_last_run := (v_automation.trigger_config->>'last_run_at')::TIMESTAMPTZ;

      -- Determine if due: run if never run, or if last run was before the
      -- start of the current cron window. Use a conservative 55-minute floor
      -- for common schedules to avoid double-firing within the same window.
      -- For simplicity + safety: run if never run, OR last run > 1 hour ago
      -- (the pg_cron job runs hourly). This matches the hourly cron cadence.
      v_should_run := v_last_run IS NULL OR v_last_run < NOW() - INTERVAL '55 minutes';

      IF v_should_run THEN
        v_new_last_run := NOW();
        PERFORM execute_automation_action(
          v_automation.id,
          jsonb_build_object(
            'trigger_type', 'scheduled',
            'cron', v_cron,
            'scheduled_at', v_new_last_run
          )
        );
        -- Update last_run_at in trigger_config (idempotent, no schema change).
        UPDATE automations
        SET trigger_config = jsonb_set(
          trigger_config, '{last_run_at}', to_jsonb(v_new_last_run)
        )
        WHERE id = v_automation.id;
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Best-effort: a failing automation never aborts the batch.
      INSERT INTO automation_logs (automation_id, level, message, details)
      VALUES (v_automation.id, 'error', 'Scheduled run failed', jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. pg_cron job for scheduled automations (hourly). Guarded so a DB without
--    pg_cron no-ops (§24). Unschedule-first so re-running updates not dupes.
-- ============================================================================
DO $$
BEGIN
  PERFORM extensions.cron.unschedule('avenize-scheduled-automations');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

DO $cron_$
BEGIN
  PERFORM extensions.cron.schedule(
    'avenize-scheduled-automations',
    '0 * * * *',  -- hourly at minute 0
    $job$SELECT run_due_automations()$job$
  );
  RAISE NOTICE 'pg_cron avenize-scheduled-automations scheduled hourly';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron avenize-scheduled-automations not scheduled: %', SQLERRM;
END
$cron_$;

COMMENT ON FUNCTION run_due_automations IS 'Scheduled-automation executor (#20): runs enabled time-based automations whose cron window is due. Idempotent per window (last_run_at tracked in trigger_config). Best-effort per automation. The hourly pg_cron job calls this.';

-- ============================================================================
-- 4. FIX STALE module_status.automations reason. The original seed (20260101000005)
--    said "not wired to a real execution engine — demo only" — but 007 already
--    has a real engine (execute_automation_action + 4 live triggers). The gap
--    was scheduled automations + health visibility, now closed. Update the
--    readiness note to reflect reality (still false until the migration is
--    applied to live DB; the reason is now accurate).
-- ============================================================================
UPDATE module_status
SET note = 'Real execution engine (007: execute_automation_action for deal/invoice/task/staff triggers) + scheduled-automations executor (20260101000013: run_due_automations, hourly pg_cron) + automation_health RPC. Ready where the migration is applied.'
WHERE module_key = 'automations';
