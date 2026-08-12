-- ============================================================================
-- 073: Add X-Automation-Secret to all pg_net calls to execute-automation
--
-- The execute-automation edge function now requires an X-Automation-Secret
-- header to prevent unauthorized external callers from triggering automations
-- across all businesses. This migration updates the three DB-side callers
-- (trigger_deal_automation, trigger_task_automation, execute_due_automations)
-- to pass the secret in pg_net headers.
--
-- The secret is stored in app.settings.automation_secret and must match the
-- AUTOMATION_SECRET env var set on the edge function via:
--   supabase secrets set AUTOMATION_SECRET=<value>
--
-- To set the Postgres setting:
--   ALTER DATABASE postgres SET app.settings.automation_secret = '<value>';
-- (run in Supabase SQL editor as postgres user)
-- ============================================================================

-- ============================================
-- 1. Replace trigger_deal_automation with version that includes secret header
-- ============================================
CREATE OR REPLACE FUNCTION trigger_deal_automation()
RETURNS TRIGGER AS $$
DECLARE
  trigger_type TEXT;
  v_webhook_url TEXT;
  v_secret TEXT;
BEGIN
  -- Determine trigger type
  IF TG_OP = 'INSERT' THEN
    trigger_type := 'deal_created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.stage = 'won' AND OLD.stage != 'won' THEN
      trigger_type := 'deal_won';
    ELSIF NEW.stage = 'lost' AND OLD.stage != 'lost' THEN
      trigger_type := 'deal_lost';
    ELSIF NEW.stage != OLD.stage THEN
      trigger_type := 'deal_stage_changed';
    ELSE
      RETURN NEW; -- No relevant change
    END IF;
  END IF;

  v_webhook_url := current_setting('app.settings.automation_webhook_url', true);
  v_secret := COALESCE(current_setting('app.settings.automation_secret', true), '');

  PERFORM net.http_post(
    url := v_webhook_url || '/functions/v1/execute-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Automation-Secret', v_secret
    ),
    body := json_build_object(
      'trigger', trigger_type,
      'payload', json_build_object(
        'deal_id', NEW.id,
        'title', NEW.title,
        'stage', NEW.stage,
        'value', NEW.value
      )
    )::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Automation trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. Replace trigger_task_automation with version that includes secret header
-- ============================================
CREATE OR REPLACE FUNCTION trigger_task_automation()
RETURNS TRIGGER AS $$
DECLARE
  trigger_type TEXT;
  v_webhook_url TEXT;
  v_secret TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    trigger_type := 'task_created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
      trigger_type := 'task_completed';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Check for due soon (24 hours)
  IF NEW.due_date IS NOT NULL THEN
    IF NEW.due_date <= NOW() + INTERVAL '24 hours' AND NEW.due_date > NOW() THEN
      trigger_type := 'task_due_soon';
    END IF;
  END IF;

  IF trigger_type IS NOT NULL THEN
    v_webhook_url := current_setting('app.settings.automation_webhook_url', true);
    v_secret := COALESCE(current_setting('app.settings.automation_secret', true), '');

    PERFORM net.http_post(
      url := v_webhook_url || '/functions/v1/execute-automation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Automation-Secret', v_secret
      ),
      body := json_build_object(
        'trigger', trigger_type,
        'payload', json_build_object(
          'task_id', NEW.id,
          'title', NEW.title,
          'status', NEW.status,
          'due_date', NEW.due_date
        )
      )::jsonb
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Task automation trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Replace execute_due_automations with version that includes secret header
-- ============================================
CREATE OR REPLACE FUNCTION public.execute_due_automations()
RETURNS void AS $$
DECLARE
  due RECORD;
  edge_url TEXT;
  v_secret TEXT;
BEGIN
  edge_url := current_setting('app.avenize_edge_url', true);
  IF edge_url IS NULL OR edge_url = '' THEN
    edge_url := 'https://avnenzpwqcnqvxwvtsqb.supabase.co/functions/v1/execute-automation';
  END IF;

  v_secret := COALESCE(current_setting('app.settings.automation_secret', true), '');

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
    PERFORM net.http_post(
      url := edge_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Automation-Secret', v_secret
      ),
      body := jsonb_build_object(
        'automation_id', due.id,
        'business_id', due.business_id
      )
    );

    UPDATE public.automations
    SET next_run_at = NULL
    WHERE id = due.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
