-- AVENIZE Layer 1 - Event Management
-- Events, registrations, RSVPs, and event scheduling

-- ============================================
-- EVENT TYPES
-- ============================================
CREATE TABLE IF NOT EXISTS event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'Calendar',
  color TEXT DEFAULT '#6366F1',
  -- Default settings
  default_duration INTEGER DEFAULT 60, -- Minutes
  default_capacity INTEGER, -- NULL = unlimited
  requires_registration BOOLEAN DEFAULT FALSE,
  allows_guests BOOLEAN DEFAULT TRUE,
  -- Location types
  location_types TEXT[] DEFAULT '{physical,virtual}'::text[],
  -- Fields to collect
  registration_fields JSONB DEFAULT '[
    {"name": "name", "label": "Full Name", "type": "text", "required": true},
    {"name": "email", "label": "Email", "type": "email", "required": true}
  ]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_type_id UUID REFERENCES event_types(id),
  organizer_id UUID REFERENCES staff(id),
  -- Basic info
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  -- Timing
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  is_all_day BOOLEAN DEFAULT FALSE,
  -- Recurrence
  recurrence_rule TEXT, -- iCal RRULE
  recurrence_end_date DATE,
  parent_event_id UUID REFERENCES events(id),
  -- Location
  location_type TEXT DEFAULT 'physical' CHECK (location_type IN ('physical', 'virtual', 'hybrid')),
  location_name TEXT,
  location_address TEXT,
  location_url TEXT, -- For virtual events
  meeting_id TEXT, -- Zoom, Teams, etc.
  -- Capacity & Registration
  max_capacity INTEGER, -- NULL = unlimited
  current_registrations INTEGER DEFAULT 0,
  requires_registration BOOLEAN DEFAULT FALSE,
  registration_deadline TIMESTAMPTZ,
  allow_waitlist BOOLEAN DEFAULT TRUE,
  waitlist_count INTEGER DEFAULT 0,
  -- Visibility
  visibility TEXT DEFAULT 'internal' CHECK (visibility IN (
    'private', 'internal', 'public', 'invite_only'
  )),
  -- Settings
  is_published BOOLEAN DEFAULT FALSE,
  is_cancelled BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  -- Rich content
  cover_image_url TEXT,
  agenda JSONB DEFAULT '[]', -- [{time, title, speaker, description}]
  -- Costs
  is_paid BOOLEAN DEFAULT FALSE,
  price_amount NUMERIC,
  price_currency TEXT DEFAULT 'USD',
  -- Communication
  send_reminders BOOLEAN DEFAULT TRUE,
  reminder_days INTEGER[] DEFAULT '{1,3,7}',
  -- Analytics
  view_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EVENT INVITEES & REGISTRATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- Registrant info
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  -- Registration details
  registration_type TEXT DEFAULT 'attendee' CHECK (registration_type IN (
    'attendee', 'speaker', 'sponsor', 'volunteer', 'vip'
  )),
  status TEXT DEFAULT 'registered' CHECK (status IN (
    'registered', 'attended', 'no_show', 'cancelled', 'waitlisted', 'declined'
  )),
  registration_source TEXT CHECK (registration_source IN (
    'website', 'email', 'social', 'direct', 'api'
  )),
  -- Guest +1
  plus_ones INTEGER DEFAULT 0,
  total_attendees INTEGER GENERATED ALWAYS AS (1 + plus_ones) STORED,
  -- RSVP
  rsvp_status TEXT DEFAULT 'pending' CHECK (rsvp_status IN (
    'pending', 'yes', 'no', 'maybe', 'tentative'
  )),
  rsvp_responded_at TIMESTAMPTZ,
  -- Check-in
  checked_in BOOLEAN DEFAULT FALSE,
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES staff(id),
  -- Notes
  dietary_requirements TEXT,
  accessibility_needs TEXT,
  notes TEXT,
  -- Custom fields
  custom_answers JSONB DEFAULT '{}',
  -- Payment
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'paid', 'refunded', 'waived', 'failed'
  )),
  payment_amount NUMERIC,
  payment_id TEXT,
  -- Feedback
  feedback_submitted BOOLEAN DEFAULT FALSE,
  feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_comments TEXT,
  -- Tracking
  referral_source TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EVENT WAITLIST
-- ============================================
CREATE TABLE IF NOT EXISTS event_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_id UUID REFERENCES event_registrations(id),
  email TEXT NOT NULL,
  full_name TEXT,
  position INTEGER NOT NULL, -- Queue position
  notified_at TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  status TEXT DEFAULT 'waiting' CHECK (status IN (
    'waiting', 'offered', 'converted', 'expired', 'declined'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EVENT SESSIONS (for multi-session events)
-- ============================================
CREATE TABLE IF NOT EXISTS event_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  -- Location
  location_name TEXT,
  location_url TEXT,
  -- Capacity
  max_capacity INTEGER,
  current_capacity INTEGER DEFAULT 0,
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  -- Speaker
  speaker_name TEXT,
  speaker_title TEXT,
  speaker_bio TEXT,
  speaker_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SESSION REGISTRATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS session_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'cancelled')),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, registration_id)
);

-- ============================================
-- EVENT COMMUNICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS event_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL CHECK (email_type IN (
    'invitation', 'confirmation', 'reminder', 'update', 'cancellation', 'follow_up', 'thank_you'
  )),
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  -- Sending
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER,
  open_count INTEGER,
  click_count INTEGER,
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EVENT ANALYTICS
-- ============================================
CREATE TABLE IF NOT EXISTS event_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- Traffic
  page_views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  registration_starts INTEGER DEFAULT 0,
  registration_completions INTEGER DEFAULT 0,
  -- Conversion
  conversion_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN page_views > 0 
    THEN (registration_completions::NUMERIC / page_views * 100) 
    ELSE 0 END
  ) STORED,
  -- Attendance
  expected_attendance INTEGER DEFAULT 0,
  actual_attendance INTEGER DEFAULT 0,
  attendance_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN expected_attendance > 0 
    THEN (actual_attendance::NUMERIC / expected_attendance * 100) 
    ELSE 0 END
  ) STORED,
  -- Revenue
  gross_revenue NUMERIC DEFAULT 0,
  refunds_issued NUMERIC DEFAULT 0,
  net_revenue NUMERIC GENERATED ALWAYS AS (gross_revenue - refunds_issued) STORED,
  -- Feedback
  avg_rating NUMERIC,
  total_feedbacks INTEGER DEFAULT 0,
  -- Date
  recorded_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_analytics ENABLE ROW LEVEL SECURITY;

-- Event types
CREATE POLICY "Event types view"
  ON event_types FOR SELECT
  USING (business_id IN (SELECT business_id FROM get_current_staff()));

CREATE POLICY "Event types manage"
  ON event_types FOR ALL
  USING (business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager')));

-- Events
ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
DROP POLICY IF EXISTS "Events read" ON events;
CREATE POLICY "Events read"
  ON events FOR SELECT
  USING (
    visibility = 'public'
    OR business_id IN (SELECT business_id FROM get_current_staff())
  );

DROP POLICY IF EXISTS "Events create" ON events;
CREATE POLICY "Events create"
  ON events FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM get_current_staff()));

DROP POLICY IF EXISTS "Events update" ON events;
CREATE POLICY "Events update"
  ON events FOR UPDATE
  USING (
    organizer_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
    OR business_id IN (SELECT business_id FROM get_current_staff() WHERE role IN ('owner', 'manager'))
  );

-- Registrations: public sign-up + view own
CREATE POLICY "Registrations view"
  ON event_registrations FOR SELECT
  USING (
    event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff()))
  );

CREATE POLICY "Registrations create"
  ON event_registrations FOR INSERT
  WITH CHECK (TRUE); -- Public registration

CREATE POLICY "Registrations update"
  ON event_registrations FOR UPDATE
  USING (
    user_id = auth.uid()
    OR event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff()))
  );

-- Waitlist
CREATE POLICY "Waitlist view"
  ON event_waitlist FOR SELECT
  USING (event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Waitlist manage"
  ON event_waitlist FOR ALL
  USING (event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Sessions
CREATE POLICY "Sessions view"
  ON event_sessions FOR SELECT
  USING (event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Sessions manage"
  ON event_sessions FOR ALL
  USING (event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Session registrations
CREATE POLICY "Session regs view"
  ON session_registrations FOR SELECT
  USING (session_id IN (SELECT id FROM event_sessions WHERE event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff()))));

CREATE POLICY "Session regs manage"
  ON session_registrations FOR ALL
  USING (session_id IN (SELECT id FROM event_sessions WHERE event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff()))));

-- Emails
CREATE POLICY "Emails view"
  ON event_emails FOR SELECT
  USING (event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Emails manage"
  ON event_emails FOR ALL
  USING (event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- Analytics
CREATE POLICY "Event analytics view"
  ON event_analytics FOR SELECT
  USING (event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff())));

CREATE POLICY "Event analytics manage"
  ON event_analytics FOR ALL
  USING (event_id IN (SELECT id FROM events WHERE business_id IN (SELECT business_id FROM get_current_staff())));

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Register for event
CREATE OR REPLACE FUNCTION register_for_event(
  p_event_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_company TEXT DEFAULT NULL,
  p_custom_answers JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_reg_id UUID;
  v_event RECORD;
  v_available INTEGER;
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  
  IF v_event.is_cancelled THEN
    RAISE EXCEPTION 'Event is cancelled';
  END IF;
  
  IF v_event.registration_deadline < NOW() THEN
    RAISE EXCEPTION 'Registration deadline has passed';
  END IF;
  
  -- Check capacity
  IF v_event.max_capacity IS NOT NULL THEN
    SELECT v_event.max_capacity - v_event.current_registrations INTO v_available;
    IF v_available <= 0 THEN
      IF NOT v_event.allow_waitlist THEN
        RAISE EXCEPTION 'Event is full';
      END IF;
      -- Add to waitlist
      INSERT INTO event_waitlist (event_id, email, full_name, position)
      VALUES (p_event_id, p_email, p_full_name, v_event.waitlist_count + 1);
      RETURN NULL; -- Registration failed, added to waitlist
    END IF;
  END IF;
  
  -- Create registration
  INSERT INTO event_registrations (
    event_id, email, full_name, phone, company, user_id, custom_answers, registration_source
  )
  VALUES (
    p_event_id, p_email, p_full_name, p_phone, p_company,
    (SELECT id FROM staff WHERE user_id = auth.uid()),
    p_custom_answers, 'website'
  )
  RETURNING id INTO v_reg_id;
  
  -- Update event registration count
  UPDATE events SET current_registrations = current_registrations + 1 WHERE id = p_event_id;
  
  RETURN v_reg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cancel registration
CREATE OR REPLACE FUNCTION cancel_registration(p_registration_id UUID)
RETURNS VOID AS $$
DECLARE
  v_reg RECORD;
BEGIN
  SELECT * INTO v_reg FROM event_registrations WHERE id = p_registration_id;
  
  UPDATE event_registrations SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_registration_id;
  
  -- Update event count
  UPDATE events SET current_registrations = current_registrations - 1
  WHERE id = v_reg.event_id;
  
  -- Offer spot to waitlist
  INSERT INTO event_waitlist (event_id, email, full_name, position)
  SELECT event_id, email, full_name, 1 FROM event_registrations WHERE id = p_registration_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check in attendee
CREATE OR REPLACE FUNCTION check_in_attendee(p_registration_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE event_registrations
  SET checked_in = TRUE, checked_in_at = NOW(),
      status = 'attended', updated_at = NOW()
  WHERE id = p_registration_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RSVP to event
CREATE OR REPLACE FUNCTION rsvp_event(
  p_registration_id UUID,
  p_rsvp_status TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE event_registrations
  SET rsvp_status = p_rsvp_status,
      rsvp_responded_at = NOW(),
      updated_at = NOW()
  WHERE id = p_registration_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get upcoming events
CREATE OR REPLACE FUNCTION get_upcoming_events(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  location_name TEXT,
  location_type TEXT,
  max_capacity INTEGER,
  current_registrations INTEGER,
  requires_registration BOOLEAN,
  is_published BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id, e.title, e.description, e.start_date, e.end_date,
    e.location_name, e.location_type, e.max_capacity,
    e.current_registrations, e.requires_registration, e.is_published
  FROM events e
  WHERE e.business_id = (SELECT business_id FROM get_current_staff())
    AND e.start_date > NOW()
    AND e.is_published = TRUE
    AND e.is_cancelled = FALSE
  ORDER BY e.start_date ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE TRIGGER event_types_updated_at BEFORE UPDATE ON event_types FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER event_registrations_updated_at BEFORE UPDATE ON event_registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER event_analytics_updated_at BEFORE UPDATE ON event_analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
