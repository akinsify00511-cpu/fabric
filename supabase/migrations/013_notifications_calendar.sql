-- AVENIZE Layer 1 - Notifications & Calendar
-- In-app notifications, events, calendar, file attachments

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'chat_message', 'deal_assigned', 'deal_won', 'deal_lost',
    'task_assigned', 'task_due', 'task_completed',
    'invoice_paid', 'invoice_overdue',
    'leave_approved', 'leave_rejected',
    'mention', 'comment', 'system', 'achievement'
  )),
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}', -- extra context (deal_id, etc.)
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  action_url TEXT, -- deep link
  icon TEXT, -- emoji or icon class
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- NOTIFICATION PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Channel preferences
  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  -- Type preferences (true = enabled)
  chat_message BOOLEAN DEFAULT TRUE,
  deal_assigned BOOLEAN DEFAULT TRUE,
  deal_won BOOLEAN DEFAULT TRUE,
  task_assigned BOOLEAN DEFAULT TRUE,
  task_due BOOLEAN DEFAULT TRUE,
  task_completed BOOLEAN DEFAULT FALSE,
  invoice_paid BOOLEAN DEFAULT TRUE,
  invoice_overdue BOOLEAN DEFAULT TRUE,
  leave_requests BOOLEAN DEFAULT TRUE,
  mentions BOOLEAN DEFAULT TRUE,
  achievements BOOLEAN DEFAULT TRUE,
  -- Quiet hours
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EVENTS TABLE (Calendar)
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT DEFAULT 'event' CHECK (event_type IN ('event', 'meeting', 'deadline', 'reminder', 'blocked')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'UTC',
  -- Location
  location TEXT,
  location_url TEXT,
  -- People
  organizer_id UUID REFERENCES staff(id),
  attendees JSONB DEFAULT '[]', -- [{staff_id, name, email, status}]
  -- Recurrence
  recurrence_rule TEXT, -- RRULE format
  recurrence_end DATE,
  parent_event_id UUID REFERENCES events(id),
  -- Reminders
  reminders JSONB DEFAULT '[{"type":"popup","minutes":15}]', -- [{type, minutes}]
  -- Status
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('tentative', 'confirmed', 'cancelled')),
  -- External sync
  google_event_id TEXT,
  outlook_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EVENT PARTICIPANTS
-- ============================================
CREATE TABLE IF NOT EXISTS event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  email TEXT, -- for external attendees
  name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'tentative')),
  response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, staff_id),
  UNIQUE(event_id, email)
);

-- ============================================
-- FILE ATTACHMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS file_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES staff(id),
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size INTEGER NOT NULL, -- bytes
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL, -- path in Supabase storage
  storage_bucket TEXT DEFAULT 'files',
  -- Metadata
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'document', 'image', 'video', 'audio', 'archive', 'other')),
  tags TEXT[], -- for search
  -- Access
  is_public BOOLEAN DEFAULT FALSE,
  access_level TEXT DEFAULT 'business' CHECK (access_level IN ('business', 'team', 'private')),
  -- Preview
  thumbnail_url TEXT,
  preview_url TEXT,
  -- Stats
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FILE ACCESS (sharing)
-- ============================================
CREATE TABLE IF NOT EXISTS file_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES file_attachments(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id),
  email TEXT, -- for external sharing
  access_type TEXT DEFAULT 'view' CHECK (access_type IN ('view', 'download', 'edit')),
  expires_at TIMESTAMPTZ,
  token TEXT UNIQUE, -- for public share links
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_access ENABLE ROW LEVEL SECURITY;

-- Notifications: own only
CREATE POLICY "Notifications own"
  ON notifications FOR ALL
  USING (user_id = auth.uid());

-- Notification preferences: own only
CREATE POLICY "Preferences own"
  ON notification_preferences FOR ALL
  USING (user_id = auth.uid());

-- Events: business scope
CREATE POLICY "Events view"
  ON events FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Events create"
  ON events FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Events update"
  ON events FOR UPDATE
  USING (
    business_id IN (SELECT business_id FROM get_current_staff())
    AND (organizer_id = (SELECT id FROM staff WHERE user_id = auth.uid()) OR organizer_id IS NULL)
  );

CREATE POLICY "Events delete"
  ON events FOR DELETE
  USING (
    business_id IN (SELECT business_id FROM get_current_staff())
    AND organizer_id = (SELECT id FROM staff WHERE user_id = auth.uid())
  );

-- Event participants: visible to event attendees
CREATE POLICY "Participants view"
  ON event_participants FOR SELECT
  USING (
    event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff()))
    OR staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())
  );

CREATE POLICY "Participants create"
  ON event_participants FOR INSERT
  WITH CHECK (
    event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff()))
  );

-- File attachments: business scope
CREATE POLICY "Files view"
  ON file_attachments FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Files upload"
  ON file_attachments FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Files update"
  ON file_attachments FOR UPDATE
  USING (
    business_id IN (SELECT business_id FROM get_current_staff())
    AND uploader_id = (SELECT id FROM staff WHERE user_id = auth.uid())
  );

-- File access: visible to owner and those with access
CREATE POLICY "Access view"
  ON file_access FOR SELECT
  USING (
    file_id IN (SELECT id FROM file_attachments WHERE business_id IN (SELECT business_id FROM get_current_staff()))
    OR staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())
  );

CREATE POLICY "Access create"
  ON file_access FOR INSERT
  WITH CHECK (
    file_id IN (SELECT id FROM file_attachments WHERE business_id IN (SELECT business_id FROM get_current_staff()))
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Send notification
CREATE OR REPLACE FUNCTION send_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_data JSONB DEFAULT '{}'::jsonb,
  p_priority TEXT DEFAULT 'normal'
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (id, user_id, type, title, body, data, priority)
  VALUES (gen_random_uuid(), p_user_id, p_type, p_title, p_body, p_data, p_priority)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Broadcast notification to all business members
CREATE OR REPLACE FUNCTION broadcast_notification(
  p_business_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  FOR v_user_id IN
    SELECT user_id FROM staff WHERE business_id = p_business_id
  LOOP
    PERFORM send_notification(v_user_id, p_type, p_title, p_body, p_data);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark notifications as read
CREATE OR REPLACE FUNCTION mark_notifications_read(p_notification_ids UUID[])
RETURNS VOID AS $$
BEGIN
  UPDATE notifications
  SET read = TRUE, read_at = NOW()
  WHERE id = ANY(p_notification_ids) AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get unread count
CREATE OR REPLACE FUNCTION get_unread_notification_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM notifications WHERE user_id = auth.uid() AND read = FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get events for date range
CREATE OR REPLACE FUNCTION get_events_in_range(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  event_type TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN,
  location TEXT,
  status TEXT,
  organizer_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.description,
    e.event_type,
    e.start_time,
    e.end_time,
    e.all_day,
    e.location,
    e.status,
    COALESCE(s.full_name, s.name) as organizer_name
  FROM events e
  LEFT JOIN staff s ON s.id = e.organizer_id
  WHERE e.business_id IN (SELECT business_id FROM get_current_staff())
  AND e.status != 'cancelled'
  AND e.start_time >= p_start
  AND e.start_time <= p_end
  ORDER BY e.start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get file size category
CREATE OR REPLACE FUNCTION get_mime_category(p_mime_type TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_mime_type LIKE 'image/%' THEN RETURN 'image';
  ELSIF p_mime_type LIKE 'video/%' THEN RETURN 'video';
  ELSIF p_mime_type LIKE 'audio/%' THEN RETURN 'audio';
  ELSIF p_mime_type LIKE 'application/pdf%' OR p_mime_type LIKE 'application/msword%' OR p_mime_type LIKE 'application/vnd.%' THEN RETURN 'document';
  ELSIF p_mime_type LIKE 'application/zip%' OR p_mime_type LIKE 'application/x-%' THEN RETURN 'archive';
  END IF;
  RETURN 'other';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER file_attachments_updated_at BEFORE UPDATE ON file_attachments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
