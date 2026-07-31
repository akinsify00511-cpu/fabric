-- AVENIZE Layer 1 - Support Tickets (Zendesk competitor)
-- Tickets, replies, assignments, SLA

-- ============================================
-- TICKETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category TEXT, -- 'bug', 'feature', 'billing', 'support', 'other'
  source TEXT DEFAULT 'in_app' CHECK (source IN ('in_app', 'email', 'chat', 'phone', 'social')),
  customer_name TEXT,
  customer_email TEXT,
  customer_id UUID, -- link to contacts table if available
  assignee_id UUID REFERENCES staff(id),
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TICKET REPLIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('staff', 'customer')),
  sender_id UUID, -- staff id or customer id
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE, -- internal notes visible only to staff
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TICKET ATTACHMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  reply_id UUID REFERENCES ticket_replies(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TICKET TAGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ticket_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticket_id, tag)
);

-- ============================================
-- TICKET ACTIVITY LOG (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS ticket_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  action TEXT NOT NULL, -- 'created', 'status_changed', 'assigned', 'replied', 'tagged'
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_activity ENABLE ROW LEVEL SECURITY;

-- Tickets: visible to all in business
CREATE POLICY "Tickets visible"
  ON tickets FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Tickets create"
  ON tickets FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Tickets update"
  ON tickets FOR UPDATE
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

-- Replies: visible to business members (hide internal if not staff)
CREATE POLICY "Replies visible"
  ON ticket_replies FOR SELECT
  USING (
    ticket_id IN (SELECT id FROM tickets WHERE business_id IN (SELECT business_id FROM get_current_staff()))
  );

CREATE POLICY "Replies create"
  ON ticket_replies FOR INSERT
  WITH CHECK (
    ticket_id IN (SELECT id FROM tickets WHERE business_id IN (SELECT business_id FROM get_current_staff()))
  );

-- Attachments: same as tickets
CREATE POLICY "Attachments visible"
  ON ticket_attachments FOR SELECT
  USING (ticket_id IN (SELECT id FROM tickets WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Attachments create"
  ON ticket_attachments FOR INSERT
  WITH CHECK (ticket_id IN (SELECT id FROM tickets WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Tags: same as tickets
CREATE POLICY "Tags visible"
  ON ticket_tags FOR SELECT
  USING (ticket_id IN (SELECT id FROM tickets WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Tags manage"
  ON ticket_tags FOR ALL
  USING (ticket_id IN (SELECT id FROM tickets WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Activity: same as tickets
CREATE POLICY "Activity visible"
  ON ticket_activity FOR SELECT
  USING (ticket_id IN (SELECT id FROM tickets WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Activity create"
  ON ticket_activity FOR INSERT
  WITH CHECK (ticket_id IN (SELECT id FROM tickets WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get ticket with replies
CREATE OR REPLACE FUNCTION get_ticket_with_replies(p_ticket_id UUID)
RETURNS TABLE (
  ticket_id UUID,
  subject TEXT,
  description TEXT,
  status TEXT,
  priority TEXT,
  category TEXT,
  customer_name TEXT,
  customer_email TEXT,
  assignee_id UUID,
  assignee_name TEXT,
  created_at TIMESTAMPTZ,
  reply_id UUID,
  reply_sender_type TEXT,
  reply_sender_name TEXT,
  reply_content TEXT,
  reply_is_internal BOOLEAN,
  reply_created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.subject,
    t.description,
    t.status,
    t.priority,
    t.category,
    t.customer_name,
    t.customer_email,
    t.assignee_id,
    COALESCE(a.full_name, a.name) as assignee_name,
    t.created_at,
    r.id as reply_id,
    r.sender_type,
    r.sender_name,
    r.content,
    r.is_internal,
    r.created_at
  FROM tickets t
  LEFT JOIN staff a ON a.id = t.assignee_id
  LEFT JOIN ticket_replies r ON r.ticket_id = t.id
  WHERE t.id = p_ticket_id
  ORDER BY r.created_at ASC NULLS FIRST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get ticket stats
CREATE OR REPLACE FUNCTION get_ticket_stats()
RETURNS TABLE (
  open_count BIGINT,
  in_progress_count BIGINT,
  resolved_count BIGINT,
  urgent_count BIGINT,
  avg_response_time INTERVAL
) AS $$
DECLARE
  v_open BIGINT;
  v_in_progress BIGINT;
  v_resolved BIGINT;
  v_urgent BIGINT;
  v_avg INTERVAL;
BEGIN
  SELECT COUNT(*) INTO v_open FROM tickets WHERE status = 'open';
  SELECT COUNT(*) INTO v_in_progress FROM tickets WHERE status = 'in_progress';
  SELECT COUNT(*) INTO v_resolved FROM tickets WHERE status IN ('resolved', 'closed');
  SELECT COUNT(*) INTO v_urgent FROM tickets WHERE priority = 'urgent' AND status NOT IN ('resolved', 'closed');
  SELECT AVG(first_response_at - created_at) INTO v_avg FROM tickets WHERE first_response_at IS NOT NULL;

  RETURN QUERY SELECT v_open, v_in_progress, v_resolved, v_urgent, v_avg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log ticket activity
CREATE OR REPLACE FUNCTION log_ticket_activity(
  p_ticket_id UUID,
  p_action TEXT,
  p_details JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO ticket_activity (ticket_id, staff_id, action, details)
  VALUES (p_ticket_id, (SELECT id FROM staff WHERE user_id = auth.uid()), p_action, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: update first_response_at
CREATE OR REPLACE FUNCTION set_first_response()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.first_response_at IS NULL AND EXISTS (
    SELECT 1 FROM ticket_replies WHERE ticket_id = NEW.id AND sender_type = 'staff'
  ) THEN
    NEW.first_response_at := (
      SELECT MIN(created_at) FROM ticket_replies
      WHERE ticket_id = NEW.id AND sender_type = 'staff'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_ticket_update_first_response
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_first_response();

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
