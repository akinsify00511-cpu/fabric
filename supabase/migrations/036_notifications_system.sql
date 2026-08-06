-- ============================================
-- NOTIFICATIONS SYSTEM
-- Real-time notifications for Avenize users
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  type TEXT NOT NULL
    CHECK (type IN (
      'job_created', 'job_assigned', 'job_updated', 'job_completed',
      'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost',
      'invoice_created', 'invoice_paid', 'invoice_overdue',
      'task_assigned', 'task_completed',
      'leave_request', 'leave_approved', 'leave_rejected',
      'payment_received', 'payment_overdue',
      'system', 'mention', 'approval_required'
    )),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own" ON notifications FOR ALL
  USING (user_id = auth.uid());

-- Index for fast unread queries
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications(user_id, created_at DESC)
  WHERE read = FALSE;

-- Trigger: auto-create notification when a job is assigned
CREATE OR REPLACE FUNCTION notify_job_assigned()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    SELECT NEW.assigned_to, 'job_assigned',
           'New job assigned to you',
           NEW.title,
           '/app/jobs',
           jsonb_build_object('job_id', NEW.id, 'business_id', NEW.business_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_job_assigned
  AFTER UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION notify_job_assigned();

-- Trigger: notify on job completion
CREATE OR REPLACE FUNCTION notify_job_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    SELECT NEW.created_by, 'job_completed',
           'Job completed',
           NEW.title || ' has been marked as completed',
           '/app/jobs',
           jsonb_build_object('job_id', NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_job_completed
  AFTER UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION notify_job_completed();

-- Trigger: notify on invoice paid
CREATE OR REPLACE FUNCTION notify_invoice_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    SELECT s.user_id, 'invoice_paid',
           'Payment received',
           'Invoice ' || COALESCE(NEW.invoice_number, NEW.id::text) || ' has been paid',
           '/app/payments',
           jsonb_build_object('invoice_id', NEW.id)
    FROM staff s WHERE s.business_id = NEW.business_id AND s.role IN ('owner', 'admin', 'manager');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_invoice_paid
  AFTER UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION notify_invoice_paid();

-- Trigger: notify on leave request
CREATE OR REPLACE FUNCTION notify_leave_request()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  SELECT s.user_id, 'leave_request',
         'New leave request',
         COALESCE(NEW.staff_name, 'A staff member') || ' has requested leave',
         '/app/hr',
         jsonb_build_object('leave_id', NEW.id)
  FROM staff s
  WHERE s.business_id = NEW.business_id
    AND s.role IN ('owner', 'admin', 'manager');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_leave_request
  AFTER INSERT ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION notify_leave_request();
