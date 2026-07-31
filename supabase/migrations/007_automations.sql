-- AVENIZE Layer 1 - Workflow Automation
-- Triggers, actions, and automation execution

-- ============================================
-- AUTOMATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL, -- e.g., 'deal_stage_changed', 'invoice_created'
  trigger_config JSONB DEFAULT '{}', -- trigger-specific configuration
  action_type TEXT NOT NULL, -- e.g., 'create_task', 'send_notification', 'update_record'
  action_config JSONB DEFAULT '{}', -- action-specific configuration
  enabled BOOLEAN DEFAULT TRUE,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AUTOMATION RUNS TABLE (execution history)
-- ============================================
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  trigger_event JSONB NOT NULL, -- the event that triggered
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'skipped')),
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- NOTIFICATION TEMPLATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL, -- supports {{variable}} placeholders
  type TEXT DEFAULT 'in_app' CHECK (type IN ('in_app', 'email', 'sms')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AUTOMATION LOG TABLE (for debugging)
-- ============================================
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID REFERENCES automations(id) ON DELETE CASCADE,
  run_id UUID REFERENCES automation_runs(id) ON DELETE CASCADE,
  level TEXT DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- Automations: business members can view/manage
CREATE POLICY "Automations view"
  ON automations FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Automations create"
  ON automations FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Automations update"
  ON automations FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Automations delete"
  ON automations FOR DELETE
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Automation runs: visible to business
CREATE POLICY "Runs view"
  ON automation_runs FOR SELECT
  USING (automation_id IN (SELECT id FROM automations WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Runs create"
  ON automation_runs FOR INSERT
  WITH CHECK (automation_id IN (SELECT id FROM automations WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Notification templates: business members
CREATE POLICY "Templates view"
  ON notification_templates FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Templates create"
  ON notification_templates FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Templates update"
  ON notification_templates FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Templates delete"
  ON notification_templates FOR DELETE
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Automation logs: visible to business
CREATE POLICY "Logs view"
  ON automation_logs FOR SELECT
  USING (automation_id IN (SELECT id FROM automations WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get available triggers (metadata)
CREATE OR REPLACE FUNCTION get_automation_triggers()
RETURNS TABLE (
  type TEXT,
  name TEXT,
  description TEXT,
  fields JSONB
) AS $$
BEGIN
  RETURN QUERY VALUES
    ('deal_stage_changed', 'Deal stage changed', 'When a deal moves to a new stage', '[{"name":"from_stage","type":"string"},{"name":"to_stage","type":"string"}]'::jsonb),
    ('deal_created', 'Deal created', 'When a new deal is added', '[]'::jsonb),
    ('deal_won', 'Deal won', 'When a deal is marked as won', '[]'::jsonb),
    ('deal_lost', 'Deal lost', 'When a deal is marked as lost', '[]'::jsonb),
    ('invoice_created', 'Invoice created', 'When a new invoice is created', '[]'::jsonb),
    ('invoice_paid', 'Invoice paid', 'When an invoice is marked as paid', '[]'::jsonb),
    ('invoice_overdue', 'Invoice overdue', 'When an invoice becomes overdue', '[]'::jsonb),
    ('task_created', 'Task created', 'When a new task is added', '[]'::jsonb),
    ('task_completed', 'Task completed', 'When a task is marked done', '[]'::jsonb),
    ('task_due_soon', 'Task due soon', 'When a task is due within 24 hours', '[]'::jsonb),
    ('staff_joined', 'Staff joined', 'When a new team member joins', '[]'::jsonb),
    ('leave_requested', 'Leave requested', 'When a leave request is submitted', '[]'::jsonb),
    ('leave_approved', 'Leave approved', 'When a leave request is approved', '[]'::jsonb),
    ('product_low_stock', 'Low stock alert', 'When a product falls below threshold', '[]'::jsonb),
    ('social_post_published', 'Post published', 'When a social post goes live', '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get available actions (metadata)
CREATE OR REPLACE FUNCTION get_automation_actions()
RETURNS TABLE (
  type TEXT,
  name TEXT,
  description TEXT,
  fields JSONB
) AS $$
BEGIN
  RETURN QUERY VALUES
    ('create_task', 'Create task', 'Create a new task', '[{"name":"title","type":"string"},{"name":"description","type":"text"},{"name":"assignee_id","type":"uuid"},{"name":"priority","type":"string"}]'::jsonb),
    ('send_notification', 'Send notification', 'Send an in-app notification', '[{"name":"message","type":"text"},{"name":"recipient_id","type":"uuid"}]'::jsonb),
    ('send_email', 'Send email', 'Send an email notification', '[{"name":"to","type":"string"},{"name":"subject","type":"string"},{"name":"body","type":"text"}]'::jsonb),
    ('create_invoice', 'Create invoice', 'Create a new invoice', '[{"name":"client_name","type":"string"},{"name":"amount","type":"number"}]'::jsonb),
    ('update_deal', 'Update deal', 'Update deal fields', '[{"name":"field","type":"string"},{"name":"value","type":"string"}]'::jsonb),
    ('add_to_cashflow', 'Add cashflow entry', 'Record an income or expense', '[{"name":"type","type":"string"},{"name":"category","type":"string"},{"name":"amount","type":"number"}]'::jsonb),
    ('award_merit', 'Award merit points', 'Give recognition points', '[{"name":"staff_id","type":"uuid"},{"name":"points","type":"number"},{"name":"reason","type":"text"}]'::jsonb),
    ('update_inventory', 'Update inventory', 'Adjust product stock', '[{"name":"product_id","type":"uuid"},{"name":"adjustment","type":"number"}]'::jsonb),
    ('post_to_chat', 'Post to chat', 'Send a message to a channel', '[{"name":"channel_id","type":"uuid"},{"name":"message","type":"text"}]'::jsonb),
    ('schedule_post', 'Schedule social post', 'Schedule a social media post', '[{"name":"platform","type":"string"},{"name":"content","type":"text"},{"name":"scheduled_at","type":"timestamp"}]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute an automation action (called by trigger handlers)
CREATE OR REPLACE FUNCTION execute_automation_action(
  p_automation_id UUID,
  p_trigger_event JSONB
)
RETURNS UUID AS $$
DECLARE
  v_automation RECORD;
  v_action_type TEXT;
  v_action_config JSONB;
  v_run_id UUID;
  v_result BOOLEAN := TRUE;
BEGIN
  -- Get automation
  SELECT * INTO v_automation FROM automations WHERE id = p_automation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Automation not found';
  END IF;

  v_action_type := v_automation.action_type;
  v_action_config := v_automation.action_config;

  -- Create run record
  INSERT INTO automation_runs (automation_id, trigger_event)
  VALUES (p_automation_id, p_trigger_event)
  RETURNING id INTO v_run_id;

  -- Execute based on action type
  BEGIN
    IF v_action_type = 'create_task' THEN
      INSERT INTO tasks (business_id, title, description, priority, assignee_id, status)
      VALUES (
        v_automation.business_id,
        v_action_config->>'title',
        REPLACE(REPLACE(v_action_config->>'description', '{{deal_title}}', p_trigger_event->>'deal_title'), '{{contact_name}}', COALESCE(p_trigger_event->>'contact_name', '')),
        COALESCE(v_action_config->>'priority', 'medium'),
        (v_action_config->>'assignee_id')::uuid,
        'todo'
      );

    ELSIF v_action_type = 'send_notification' THEN
      INSERT INTO automation_logs (automation_id, run_id, level, message, details)
      VALUES (p_automation_id, v_run_id, 'info', 'Notification sent', v_action_config);

    ELSIF v_action_type = 'add_to_cashflow' THEN
      INSERT INTO cashflow_entries (business_id, type, category, amount, description)
      VALUES (
        v_automation.business_id,
        v_action_config->>'type',
        v_action_config->>'category',
        (v_action_config->>'amount')::decimal,
        REPLACE(REPLACE(v_action_config->>'description', '{{deal_title}}', p_trigger_event->>'deal_title'), '{{amount}}', COALESCE(p_trigger_event->>'amount', '0'))
      );

    ELSIF v_action_type = 'award_merit' THEN
      INSERT INTO merit_entries (business_id, staff_id, points, reason, awarded_by)
      VALUES (
        v_automation.business_id,
        (v_action_config->>'staff_id')::uuid,
        (v_action_config->>'points')::int,
        REPLACE(v_action_config->>'reason', '{{deal_title}}', COALESCE(p_trigger_event->>'deal_title', '')),
        v_automation.created_by
      );

    ELSIF v_action_type = 'post_to_chat' THEN
      INSERT INTO messages (channel_id, sender_id, content, message_type)
      VALUES (
        (v_action_config->>'channel_id')::uuid,
        v_automation.created_by,
        REPLACE(REPLACE(v_action_config->>'message', '{{deal_title}}', COALESCE(p_trigger_event->>'deal_title', '')), '{{value}}', COALESCE(p_trigger_event->>'value', '0')),
        'text'
      );

    END IF;

    -- Update automation stats
    UPDATE automations
    SET run_count = run_count + 1, last_run_at = NOW()
    WHERE id = p_automation_id;

    UPDATE automation_runs SET status = 'success' WHERE id = v_run_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE automation_runs SET status = 'failed', error_message = SQLERRM WHERE id = v_run_id;
    INSERT INTO automation_logs (automation_id, run_id, level, message)
    VALUES (p_automation_id, v_run_id, 'error', SQLERRM);
    RETURN v_run_id;
  END;

  RETURN v_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGER HANDLERS (for common events)
-- ============================================

-- After deal stage changes - check for automations
CREATE OR REPLACE FUNCTION check_deal_automations()
RETURNS TRIGGER AS $$
DECLARE
  v_automations RECORD;
BEGIN
  -- Check for 'deal_stage_changed' automations
  FOR v_automations IN
    SELECT id, trigger_config FROM automations
    WHERE business_id = NEW.business_id
    AND enabled = TRUE
    AND trigger_type = 'deal_stage_changed'
  LOOP
    -- Check if trigger config matches (if configured)
    IF v_automations.trigger_config->>'to_stage' IS NULL
       OR v_automations.trigger_config->>'to_stage' = NEW.stage THEN
      PERFORM execute_automation_action(
        v_automations.id,
        jsonb_build_object(
          'deal_id', NEW.id,
          'deal_title', NEW.title,
          'from_stage', OLD.stage,
          'to_stage', NEW.stage,
          'value', NEW.value,
          'contact_id', NEW.contact_id
        )
      );
    END IF;
  END LOOP;

  -- Check for 'deal_won'
  IF NEW.stage = 'won' AND OLD.stage != 'won' THEN
    FOR v_automations IN
      SELECT id FROM automations
      WHERE business_id = NEW.business_id AND enabled = TRUE AND trigger_type = 'deal_won'
    LOOP
      PERFORM execute_automation_action(
        v_automations.id,
        jsonb_build_object('deal_id', NEW.id, 'deal_title', NEW.title, 'value', NEW.value)
      );
    END LOOP;
  END IF;

  -- Check for 'deal_lost'
  IF NEW.stage = 'lost' AND OLD.stage != 'lost' THEN
    FOR v_automations IN
      SELECT id FROM automations
      WHERE business_id = NEW.business_id AND enabled = TRUE AND trigger_type = 'deal_lost'
    LOOP
      PERFORM execute_automation_action(
        v_automations.id,
        jsonb_build_object('deal_id', NEW.id, 'deal_title', NEW.title, 'value', NEW.value)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_deal_updated_automation
  AFTER UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION check_deal_automations();

-- After invoice status changes
CREATE OR REPLACE FUNCTION check_invoice_automations()
RETURNS TRIGGER AS $$
DECLARE
  v_automations RECORD;
BEGIN
  -- Invoice created
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    FOR v_automations IN
      SELECT id FROM automations
      WHERE business_id = NEW.business_id AND enabled = TRUE AND trigger_type = 'invoice_created'
    LOOP
      PERFORM execute_automation_action(
        v_automations.id,
        jsonb_build_object('invoice_id', NEW.id, 'client_name', NEW.client_name, 'total', NEW.total)
      );
    END LOOP;
  END IF;

  -- Invoice paid
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    FOR v_automations IN
      SELECT id FROM automations
      WHERE business_id = NEW.business_id AND enabled = TRUE AND trigger_type = 'invoice_paid'
    LOOP
      PERFORM execute_automation_action(
        v_automations.id,
        jsonb_build_object('invoice_id', NEW.id, 'client_name', NEW.client_name, 'total', NEW.total)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_invoice_updated_automation
  AFTER UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION check_invoice_automations();

-- After task completed
CREATE OR REPLACE FUNCTION check_task_automations()
RETURNS TRIGGER AS $$
DECLARE
  v_automations RECORD;
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    FOR v_automations IN
      SELECT id FROM automations
      WHERE business_id = NEW.business_id AND enabled = TRUE AND trigger_type = 'task_completed'
    LOOP
      PERFORM execute_automation_action(
        v_automations.id,
        jsonb_build_object('task_id', NEW.id, 'title', NEW.title)
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_task_updated_automation
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_task_automations();

-- After staff joined
CREATE OR REPLACE FUNCTION check_staff_automations()
RETURNS TRIGGER AS $$
DECLARE
  v_automations RECORD;
BEGIN
  FOR v_automations IN
    SELECT id FROM automations
    WHERE business_id = NEW.business_id AND enabled = TRUE AND trigger_type = 'staff_joined'
  LOOP
    PERFORM execute_automation_action(
      v_automations.id,
      jsonb_build_object('staff_id', NEW.id, 'staff_name', NEW.full_name, 'role', NEW.role)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_staff_created_automation
  AFTER INSERT ON staff
  FOR EACH ROW
  EXECUTE FUNCTION check_staff_automations();

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER automations_updated_at BEFORE UPDATE ON automations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
