-- ============================================
-- Notifications System
-- In-app and email notifications for user engagement
-- ============================================

-- Notification categories
CREATE TYPE notification_category AS ENUM (
  'onboarding',      -- Welcome, first steps
  'task',           -- Task completion, assignments
  'payment',        -- Payment success, subscription
  'reminder',       -- Trial expiring, follow-ups
  'marketing',      -- Feature highlights, tips
  'social',         -- Team activity, mentions
  'system'          -- Security, account updates
);

-- Notification channels
CREATE TYPE notification_channel AS ENUM (
  'in_app',         -- In-application notifications
  'email',          -- Email notifications
  'both'            -- Both channels
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Notification content
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category notification_category NOT NULL,
  channel notification_channel NOT NULL DEFAULT 'both',
  
  -- Related entity (optional)
  entity_type TEXT,          -- 'task', 'payment', 'staff', etc.
  entity_id UUID,
  
  -- Notification data (JSON for flexibility)
  data JSONB DEFAULT '{}',
  
  -- Status
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- Email specific
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,
  email_clicked BOOLEAN DEFAULT FALSE,
  
  -- Scheduling (for delayed notifications)
  scheduled_for TIMESTAMPTZ,
  sent BOOLEAN DEFAULT FALSE,
  
  -- Actions
  action_url TEXT,
  action_text TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist (notifications may have been created by 013 with fewer cols)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS business_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sent BOOLEAN DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_business ON notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_for) WHERE scheduled_for IS NOT NULL AND sent = FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_unsent_email ON notifications(email_sent, created_at) WHERE email_sent = FALSE;

-- ============================================
-- Notification Preferences
-- ============================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- In-app preferences
  in_app_onboarding BOOLEAN DEFAULT TRUE,
  in_app_tasks BOOLEAN DEFAULT TRUE,
  in_app_payments BOOLEAN DEFAULT TRUE,
  in_app_reminders BOOLEAN DEFAULT TRUE,
  in_app_marketing BOOLEAN DEFAULT FALSE,
  in_app_social BOOLEAN DEFAULT TRUE,
  in_app_system BOOLEAN DEFAULT TRUE,
  
  -- Email preferences
  email_onboarding BOOLEAN DEFAULT TRUE,
  email_tasks BOOLEAN DEFAULT TRUE,
  email_payments BOOLEAN DEFAULT TRUE,
  email_reminders BOOLEAN DEFAULT TRUE,
  email_marketing BOOLEAN DEFAULT FALSE,
  email_weekly_digest BOOLEAN DEFAULT TRUE,
  email_monthly_report BOOLEAN DEFAULT TRUE,
  
  -- Marketing preferences
  email_feature_updates BOOLEAN DEFAULT FALSE,
  email_tips_tricks BOOLEAN DEFAULT TRUE,
  email_promotions BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Notification Templates
-- Pre-defined notification templates for consistency
-- ============================================
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category notification_category NOT NULL,
  
  -- Template content
  title_template TEXT NOT NULL,
  message_template TEXT NOT NULL,
  
  -- Email specific
  email_subject TEXT,
  email_html TEXT,
  
  -- Variables available in templates
  variables JSONB DEFAULT '[]',
  
  -- Settings
  is_active BOOLEAN DEFAULT TRUE,
  channel notification_channel DEFAULT 'both',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default notification templates
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
DO $$ BEGIN ALTER TABLE notification_templates ALTER COLUMN body DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE notification_templates ALTER COLUMN message_template DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE notification_templates ALTER COLUMN business_id DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_slug_unique UNIQUE (slug);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS title_template TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS message_template TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS variables JSONB;
INSERT INTO notification_templates (slug, name, category, title_template, message_template, email_subject, variables) VALUES
  -- Onboarding
  ('welcome', 'Welcome to Avenize', 'onboarding', 
   'Welcome to Avenize, {{name}}! 🎉',
   'Your business account is ready. Here''s how to get started: 1) Add your team members, 2) Set up your first project, 3) Explore the CRM.',
   'Welcome to Avenize!',
   '["name"]'),
   
  ('first_step', 'Complete Your First Step', 'onboarding',
   'Ready to get started? Complete your first step!',
   'Take your first step with Avenize: {{action}}. It only takes {{time}} minutes.',
   'Your Avenize journey begins here',
   '["action", "time"]'),
   
  ('setup_reminder', 'Finish Your Setup', 'onboarding',
   'Complete your Avenize setup',
   'You''re {{progress}}% done with setup. {{remaining}} remaining: {{items}}',
   'Complete your Avenize setup',
   '["progress", "remaining", "items"]'),
   
  -- Task notifications
  ('task_assigned', 'New Task Assigned', 'task',
   '{{assigner}} assigned you a task',
   'Task: "{{task_name}}" is now assigned to you. Due: {{due_date}}',
   'New task assigned: {{task_name}}',
   '["assigner", "task_name", "due_date"]'),
   
  ('task_completed', 'Task Completed', 'task',
   'Task "{{task_name}}" is complete! ✓',
   '{{assignee}} has completed "{{task_name}}". Great work!',
   'Task completed: {{task_name}}',
   '["assignee", "task_name"]'),
   
  ('task_overdue', 'Task Overdue', 'task',
   'Task "{{task_name}}" is overdue',
   'The task "{{task_name}}" was due {{due_date}}. Please take action.',
   'Action required: Overdue task',
   '["task_name", "due_date"]'),
   
  -- Payment notifications
  ('payment_success', 'Payment Successful', 'payment',
   'Payment Confirmed! ✓',
   'Your payment of {{amount}} for {{plan}} plan has been processed successfully.',
   'Payment confirmed - Thank you!',
   '["amount", "plan"]'),
   
  ('subscription_active', 'Subscription Active', 'payment',
   'Your {{plan}} subscription is now active!',
   'Welcome to {{plan}}! You now have access to {{features}}. Enjoy!',
   'Welcome to {{plan}}!',
   '["plan", "features"]'),
   
  ('subscription_expiring', 'Subscription Expiring Soon', 'payment',
   'Your subscription renews in {{days}} days',
   'Your {{plan}} plan will auto-renew on {{date}}. No action needed unless you want to make changes.',
   'Subscription renewal reminder',
   '["days", "plan", "date"]'),
   
  ('trial_expiring', 'Trial Ending Soon', 'reminder',
   'Your free trial ends in {{days}} days! ⏰',
   'Don''t lose access to your data. Upgrade to {{plan}} before {{date}} to keep everything.',
   'Your free trial ends soon',
   '["days", "plan", "date"]'),
   
  ('trial_expired', 'Trial Has Ended', 'reminder',
   'Your free trial has ended',
   'Your 7-day Avenize trial has ended. Upgrade now to keep your data and team access.',
   'Your trial has ended',
   '[]'),
   
  -- Marketing/Feature notifications
  ('feature_highlight', 'You haven''t tried {{feature}} yet!', 'marketing',
   'Try {{feature}} - It could help you!',
   '{{feature_description}}. Many businesses like yours find it useful. Click to learn more.',
   'Discover a feature that could help you',
   '["feature", "feature_description"]'),
   
  ('unused_feature', 'Unlock more with {{feature}}', 'marketing',
   'You''re missing out on {{feature}}',
   'Based on your activity, you might love {{feature}}. Here''s how to get started in {{time}}.',
   'Unlock the power of {{feature}}',
   '["feature", "time"]'),
   
  ('usage_tip', 'Pro tip: {{tip_title}}', 'marketing',
   '💡 {{tip_title}}',
   '{{tip_description}}. Try it now!',
   'A tip to help you get more from Avenize',
   '["tip_title", "tip_description"]'),
   
  -- System notifications
  ('welcome_back', 'Welcome back, {{name}}!', 'system',
   'Welcome back, {{name}}!',
   'It''s been {{days}} days since your last visit. Here''s what''s new.',
   'Welcome back to Avenize',
   '["name", "days"]'),
   
  ('team_join', 'New team member joined', 'social',
   '{{name}} joined your team! 👋',
   '{{name}} ({{email}}) has joined {{business}}. Say hello!',
   'A new team member joined',
   '["name", "email", "business"]')

ON CONFLICT (slug) DO UPDATE SET
  title_template = EXCLUDED.title_template,
  message_template = EXCLUDED.message_template,
  email_subject = EXCLUDED.email_subject,
  variables = EXCLUDED.variables;

-- ============================================
-- Functions
-- ============================================

-- Function to create a notification
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_business_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_category notification_category,
  p_channel notification_channel DEFAULT 'both',
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_data JSONB DEFAULT '{}',
  p_action_url TEXT DEFAULT NULL,
  p_action_text TEXT DEFAULT NULL,
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id, business_id, title, message, category, channel,
    entity_type, entity_id, data, action_url, action_text, scheduled_for
  ) VALUES (
    p_user_id, p_business_id, p_title, p_message, p_category, p_channel,
    p_entity_type, p_entity_id, p_data, p_action_url, p_action_text, p_scheduled_for
  ) RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to send email notification (placeholder for edge function)
CREATE OR REPLACE FUNCTION send_email_notification(
  p_notification_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_notification RECORD;
BEGIN
  SELECT * INTO v_notification FROM notifications WHERE id = p_notification_id;
  
  IF NOT FOUND OR v_notification.email_sent THEN
    RETURN FALSE;
  END IF;
  
  -- Mark as sent (actual sending handled by edge function)
  UPDATE notifications 
  SET email_sent = TRUE, email_sent_at = NOW()
  WHERE id = p_notification_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(
  p_notification_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE notifications 
  SET read = TRUE, read_at = NOW()
  WHERE id = p_notification_id AND user_id = p_user_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread count
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count 
  FROM notifications 
  WHERE user_id = p_user_id AND read = FALSE AND sent = TRUE;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (TRUE);

-- Notification preferences RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences"
  ON notification_preferences FOR ALL
  USING (user_id = auth.uid());

-- Templates are readable by all authenticated users
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates"
  ON notification_templates FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Default notification preferences for new users
-- ============================================
CREATE OR REPLACE FUNCTION create_default_notification_preferences(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO notification_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE notifications IS 'User notifications for in-app and email';
COMMENT ON TABLE notification_preferences IS 'User preferences for which notifications they receive';
COMMENT ON TABLE notification_templates IS 'Pre-defined notification templates for consistency';
