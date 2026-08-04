-- ============================================
-- AUTOMATION & WEBHOOK TABLES
-- Required for Edge Functions to work
-- ============================================

-- Webhook logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  response_status INTEGER,
  response_body TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying webhook logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- Automation runs table
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  trigger_event JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error_message TEXT,
  duration_ms INTEGER,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying automation runs
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_executed_at ON automation_runs(executed_at DESC);

-- Notifications table (for send_notification action)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'general',
  related_id UUID,
  related_type TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying user notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_business_id ON notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Recognition table (for award_merit action)
CREATE TABLE IF NOT EXISTS recognition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  reason TEXT,
  awarded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying recognition
CREATE INDEX IF NOT EXISTS idx_recognition_user_id ON recognition(user_id);
CREATE INDEX IF NOT EXISTS idx_recognition_business_id ON recognition(business_id);

-- Add business_id column to automations if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automations' AND column_name = 'business_id'
  ) THEN
    ALTER TABLE automations ADD COLUMN business_id UUID;
  END IF;
END $$;

-- Add run_count and last_run_at columns to automations if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automations' AND column_name = 'run_count'
  ) THEN
    ALTER TABLE automations ADD COLUMN run_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'automations' AND column_name = 'last_run_at'
  ) THEN
    ALTER TABLE automations ADD COLUMN last_run_at TIMESTAMPTZ;
  END IF;
END $$;

-- Function to increment automation stats
CREATE OR REPLACE FUNCTION increment_automation_stats(auto_id UUID, run_duration INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE automations 
  SET 
    run_count = run_count + 1,
    last_run_at = NOW()
  WHERE id = auto_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- DATABASE TRIGGERS FOR AUTOMATION EXECUTION
-- These fire the execute-automation edge function
-- ============================================

-- Function to trigger automation on deal changes
CREATE OR REPLACE FUNCTION trigger_deal_automation()
RETURNS TRIGGER AS $$
DECLARE
  trigger_type TEXT;
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

  -- Call the automation execution function via HTTP
  -- Note: Requires pg_net extension. If not available, use a queue table instead.
  PERFORM net.http_post(
    url := current_setting('app.settings.automation_webhook_url', true) || '/functions/v1/execute-automation',
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
  -- Log error but don't fail the operation
  RAISE WARNING 'Automation trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on deals table (if table exists)
-- Note: This is conditional and may fail if deals table doesn't exist yet
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deals') THEN
    DROP TRIGGER IF EXISTS deal_automation_trigger ON deals;
    CREATE TRIGGER deal_automation_trigger
      AFTER INSERT OR UPDATE ON deals
      FOR EACH ROW
      EXECUTE FUNCTION trigger_deal_automation();
  END IF;
END $$;

-- Function to trigger automation on task changes
CREATE OR REPLACE FUNCTION trigger_task_automation()
RETURNS TRIGGER AS $$
DECLARE
  trigger_type TEXT;
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
    PERFORM net.http_post(
      url := current_setting('app.settings.automation_webhook_url', true) || '/functions/v1/execute-automation',
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

-- Create trigger on tasks table (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    DROP TRIGGER IF EXISTS task_automation_trigger ON tasks;
    CREATE TRIGGER task_automation_trigger
      AFTER INSERT OR UPDATE ON tasks
      FOR EACH ROW
      EXECUTE FUNCTION trigger_task_automation();
  END IF;
END $$;

-- ============================================
-- ENABLE PG_NET EXTENSION (for HTTP calls)
-- Requires: CREATE EXTENSION pg_net;
-- Run manually in Supabase dashboard if needed
-- ============================================

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
