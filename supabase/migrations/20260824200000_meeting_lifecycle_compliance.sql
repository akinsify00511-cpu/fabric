-- M1: Meeting lifecycle compliance
-- Additive + idempotent. Closes the drift between the canonical lifecycle
-- (20260818400000) and the live pages that bypassed it.
-- 1) meeting_participants unique key for join_meeting's ON CONFLICT.
-- 2) Backfill legacy meetings.attendees JSONB -> meeting_participants rows.
-- 3) meeting_chat_messages (native meeting chat, persisted, meeting-scoped).
-- 4) meetings business-context links (CRM/objective association).

-- 0. Pre-existing event-bus defect (Session 33): business_events has the
-- update_updated_at trigger but no updated_at column, so every UPDATE (incl.
-- process_business_event's re-queue) raised "record new has no field
-- updated_at". Add the column additively so the event bus works on a fresh DB.
ALTER TABLE public.business_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'meeting_participants_meeting_staff_key'
  ) THEN
    CREATE UNIQUE INDEX meeting_participants_meeting_staff_key
      ON public.meeting_participants (meeting_id, staff_id)
      WHERE staff_id IS NOT NULL;
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
  a JSONB;
  v_staff UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name = 'attendees'
  ) THEN
    FOR r IN
      SELECT id AS meeting_id, business_id, attendees
      FROM public.meetings
      WHERE attendees IS NOT NULL AND jsonb_typeof(attendees) = 'array'
        AND jsonb_array_length(attendees) > 0
    LOOP
      FOR a IN SELECT * FROM jsonb_array_elements(r.attendees)
      LOOP
        BEGIN
          v_staff := NULL;
          IF (a ? 'id') THEN
            SELECT s.id INTO v_staff FROM public.staff s
            WHERE s.id = (a->>'id')::uuid AND s.business_id = r.business_id
            LIMIT 1;
          END IF;
          IF v_staff IS NOT NULL THEN
            INSERT INTO public.meeting_participants
              (meeting_id, staff_id, role, status)
            VALUES (r.meeting_id, v_staff, 'participant', 'invited')
            ON CONFLICT (meeting_id, staff_id)
              WHERE staff_id IS NOT NULL
            DO NOTHING;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END LOOP;
    END LOOP;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.meeting_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  guest_token TEXT,
  guest_name TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  CHECK ((staff_id IS NOT NULL) OR (guest_token IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_meeting_chat_meeting
  ON public.meeting_chat_messages(meeting_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meeting_chat_business
  ON public.meeting_chat_messages(business_id, created_at);

ALTER TABLE public.meeting_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_chat_select_participant ON public.meeting_chat_messages;
CREATE POLICY meeting_chat_select_participant ON public.meeting_chat_messages
  FOR SELECT TO authenticated
  USING (
    business_id IN (SELECT business_id FROM public.get_current_staff())
    OR (guest_token IS NOT NULL
        AND guest_token = current_setting('meeting.guest_token', true))
  );

DROP POLICY IF EXISTS meeting_chat_insert_member ON public.meeting_chat_messages;
CREATE POLICY meeting_chat_insert_member ON public.meeting_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (SELECT business_id FROM public.get_current_staff())
    AND EXISTS (
      SELECT 1 FROM public.get_current_staff() s
      WHERE s.id = meeting_chat_messages.staff_id
        AND s.business_id = meeting_chat_messages.business_id
    )
  );

DROP POLICY IF EXISTS meeting_chat_insert_guest ON public.meeting_chat_messages;
CREATE POLICY meeting_chat_insert_guest ON public.meeting_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_token IS NOT NULL
    AND guest_token = current_setting('meeting.guest_token', true)
  );

CREATE OR REPLACE FUNCTION public.send_meeting_chat_guest(
  p_meeting_id UUID,
  p_guest_token TEXT,
  p_body TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_business_id UUID;
  v_guest_name TEXT;
  v_id UUID;
BEGIN
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Message body is required';
  END IF;
  SELECT m.business_id INTO v_business_id
  FROM public.meetings m WHERE m.id = p_meeting_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;
  SELECT p.guest_name INTO v_guest_name
  FROM public.meeting_participants p
  WHERE p.meeting_id = p_meeting_id AND p.guest_token = p_guest_token
    AND p.status IN ('invited', 'joined', 'left')
  LIMIT 1;
  IF v_guest_name IS NULL THEN
    RAISE EXCEPTION 'Invalid guest token';
  END IF;
  PERFORM set_config('meeting.guest_token', p_guest_token, true);
  INSERT INTO public.meeting_chat_messages
    (meeting_id, business_id, guest_token, guest_name, body)
  VALUES (p_meeting_id, v_business_id, p_guest_token, v_guest_name, trim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.send_meeting_chat_guest(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_meeting_chat_guest(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_meeting_chat(
  p_meeting_id UUID,
  p_body TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
  v_id UUID;
BEGIN
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Message body is required';
  END IF;
  SELECT m.business_id INTO v_business_id
  FROM public.meetings m WHERE m.id = p_meeting_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;
  SELECT s.id INTO v_staff_id
  FROM public.get_current_staff() s
  WHERE s.business_id = v_business_id LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to chat in this meeting';
  END IF;
  INSERT INTO public.meeting_chat_messages
    (meeting_id, business_id, staff_id, body)
  VALUES (p_meeting_id, v_business_id, v_staff_id, trim(p_body))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.send_meeting_chat(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_meeting_chat(UUID, TEXT) TO authenticated;

-- 1b. Fix create_meeting: it never populated the legacy NOT NULL
-- date/start_time columns (998), so every RPC-created meeting failed with a
-- null-constraint violation. Re-declare the base 8-arg overload only (the
-- 9-arg governance overload in 20260822141000 is a separate signature,
-- untouched here).
DROP FUNCTION IF EXISTS public.create_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.create_meeting(
  p_business_id UUID,
  p_title TEXT,
  p_scheduled_start TIMESTAMPTZ DEFAULT NULL,
  p_scheduled_end TIMESTAMPTZ DEFAULT NULL,
  p_meeting_type TEXT DEFAULT 'internal',
  p_visibility TEXT DEFAULT 'business',
  p_description TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS TABLE(meeting_id UUID, join_token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_meeting_id UUID;
  v_token TEXT;
BEGIN
  SELECT s.id INTO v_staff_id
  FROM public.get_current_staff() s
  WHERE s.business_id = p_business_id
  LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to create meetings for this business';
  END IF;
  INSERT INTO public.meetings (
    business_id, staff_id, created_by, title, description,
    meeting_type, scheduled_start, scheduled_end, visibility, status,
    date, start_time, end_time
  ) VALUES (
    p_business_id, COALESCE(p_created_by, v_staff_id), COALESCE(p_created_by, v_staff_id),
    p_title, p_description, p_meeting_type, p_scheduled_start, p_scheduled_end,
    p_visibility, 'scheduled',
    COALESCE(p_scheduled_start, NOW())::DATE,
    COALESCE(p_scheduled_start, NOW())::TIME,
    COALESCE(p_scheduled_end, COALESCE(p_scheduled_start, NOW()) + INTERVAL '1 hour')::TIME
  ) RETURNING id INTO v_meeting_id;
  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.meeting_participants (
    meeting_id, staff_id, user_id, role, status
  ) VALUES (
    v_meeting_id, v_staff_id, auth.uid(), 'host', 'invited'
  );
  PERFORM public.emit_business_event(
    p_business_id := p_business_id,
    p_event_type := 'meeting_created',
    p_entity_type := 'meeting',
    p_entity_id := v_meeting_id,
    p_payload := jsonb_build_object('meeting_id', v_meeting_id, 'title', p_title, 'meeting_type', p_meeting_type),
    p_actor_id := v_staff_id,
    p_source := 'system'
  );
  RETURN QUERY SELECT v_meeting_id, v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.create_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contacts') THEN
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS contact_id UUID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='deals') THEN
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS deal_id UUID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leads') THEN
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS lead_id UUID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='strategic_objectives') THEN
    ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS objective_id UUID;
  END IF;
END $$;

-- 1c. join_meeting's ON CONFLICT (meeting_id, staff_id) cannot infer the
-- partial unique index (WHERE staff_id IS NOT NULL) without the predicate.
-- Re-declare join_meeting with the matching index specification.
CREATE OR REPLACE FUNCTION public.join_meeting(
  p_meeting_id UUID,
  p_guest_token TEXT DEFAULT NULL
) RETURNS TABLE(participant_id UUID, authorized BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
  v_participant_id UUID;
  v_is_guest BOOLEAN := (p_guest_token IS NOT NULL);
BEGIN
  SELECT m.business_id INTO v_business_id
  FROM public.meetings m WHERE m.id = p_meeting_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF v_is_guest THEN
    SELECT id INTO v_participant_id
    FROM public.meeting_participants
    WHERE meeting_id = p_meeting_id AND guest_token = p_guest_token
      AND status IN ('invited', 'joined', 'left');
    IF v_participant_id IS NULL THEN
      RETURN QUERY SELECT NULL::UUID, false;
      RETURN;
    END IF;
  ELSE
    SELECT s.id INTO v_staff_id
    FROM public.get_current_staff() s
    WHERE s.business_id = v_business_id LIMIT 1;
    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'Not authorized to join this meeting';
    END IF;

    INSERT INTO public.meeting_participants (meeting_id, staff_id, user_id, role, status, joined_at)
    VALUES (p_meeting_id, v_staff_id, auth.uid(), 'participant', 'joined', NOW())
    ON CONFLICT (meeting_id, staff_id) WHERE staff_id IS NOT NULL DO UPDATE
      SET status = 'joined', joined_at = NOW(), left_at = NULL
    RETURNING id INTO v_participant_id;
  END IF;

  INSERT INTO public.meeting_participant_events (meeting_id, participant_id, event_type)
  VALUES (p_meeting_id, v_participant_id, 'joined');

  UPDATE public.meetings SET status = 'live', actual_start = COALESCE(actual_start, NOW())
    WHERE id = p_meeting_id AND status IN ('scheduled', 'starting');

  PERFORM public.emit_business_event(
    p_business_id := v_business_id,
    p_event_type := 'meeting_joined',
    p_entity_type := 'meeting',
    p_entity_id := p_meeting_id,
    p_payload := jsonb_build_object('meeting_id', p_meeting_id, 'is_guest', v_is_guest),
    p_actor_id := v_staff_id,
    p_source := 'system'
  );

  RETURN QUERY SELECT v_participant_id, true;
END;
$$;
REVOKE ALL ON FUNCTION public.join_meeting(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_meeting(UUID, TEXT) TO authenticated;

-- 2. Backfill legacy JSONB attendees -> relational participant rows.
-- 1d. end_meeting (from 20260818400000) used the wrong 4-arg positional
-- emit_business_event signature. Re-declare with the correct named-arg call.
CREATE OR REPLACE FUNCTION public.end_meeting(p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
  v_actual_start TIMESTAMPTZ;
BEGIN
  SELECT m.business_id, m.actual_start INTO v_business_id, v_actual_start
  FROM public.meetings m WHERE m.id = p_meeting_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.get_current_staff() s
  WHERE s.business_id = v_business_id LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to end this meeting';
  END IF;

  IF EXISTS (SELECT 1 FROM public.meetings WHERE id = p_meeting_id AND status = 'completed') THEN
    RETURN true;
  END IF;

  UPDATE public.meetings
    SET status = 'completed', actual_end = NOW(),
        duration_seconds = CASE
          WHEN actual_start IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - actual_start))::INT)
          ELSE NULL
        END
    WHERE id = p_meeting_id;

  UPDATE public.meeting_participants
    SET status = 'left', left_at = NOW(),
        total_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - joined_at))::INT)
    WHERE meeting_id = p_meeting_id AND status = 'joined';

  PERFORM public.emit_business_event(
    p_business_id := v_business_id,
    p_event_type := 'meeting_ended',
    p_entity_type := 'meeting',
    p_entity_id := p_meeting_id,
    p_payload := jsonb_build_object('meeting_id', p_meeting_id),
    p_actor_id := v_staff_id,
    p_source := 'system'
  );

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.end_meeting(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_meeting(UUID) TO authenticated;

-- 1e. start_meeting (from 20260818400000) had the same wrong emit signature.
CREATE OR REPLACE FUNCTION public.start_meeting(p_meeting_id UUID)
RETURNS TABLE(live BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
BEGIN
  SELECT m.business_id INTO v_business_id
  FROM public.meetings m WHERE m.id = p_meeting_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;
  SELECT s.id INTO v_staff_id
  FROM public.get_current_staff() s
  WHERE s.business_id = v_business_id LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to start this meeting';
  END IF;
  IF EXISTS (SELECT 1 FROM public.meetings WHERE id = p_meeting_id AND status = 'live') THEN
    RETURN QUERY SELECT true;
    RETURN;
  END IF;
  UPDATE public.meetings
    SET status = 'live', actual_start = NOW()
    WHERE id = p_meeting_id AND status IN ('scheduled', 'starting');
  PERFORM public.emit_business_event(
    p_business_id := v_business_id,
    p_event_type := 'meeting_started',
    p_entity_type := 'meeting',
    p_entity_id := p_meeting_id,
    p_payload := jsonb_build_object('meeting_id', p_meeting_id),
    p_actor_id := v_staff_id,
    p_source := 'system'
  );
  RETURN QUERY SELECT true;
END;
$$;
REVOKE ALL ON FUNCTION public.start_meeting(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_meeting(UUID) TO authenticated;

-- Realtime: publish meeting_chat_messages so the in-room chat tab receives
-- inserts live (guarded — bare postgres has no supabase_realtime publication).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_chat_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ============================================================================
-- M3: typed capture + promote-to-task/decision
-- ============================================================================

-- Fix latent create_action_task (Phase C) emit signature drift + it used
-- 'meeting_action_to_task' which is not in the business_events_source_check
-- source list via positional call; re-declare with the correct named call.
CREATE OR REPLACE FUNCTION public.create_action_task(
  p_action_id UUID,
  p_title TEXT,
  p_assignee_id UUID DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_action RECORD;
  v_task_id UUID;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_action FROM public.meeting_actions WHERE id = p_action_id AND business_id = v_staff.business_id;
  IF v_action.id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.tasks (business_id, title, assignee_id, due_date, priority, status, created_by)
  VALUES (v_action.business_id, p_title, p_assignee_id, p_due_date, p_priority, 'todo', v_staff.id)
  RETURNING id INTO v_task_id;

  UPDATE public.meeting_actions
  SET task_id = v_task_id, status = 'in_progress'
  WHERE id = p_action_id;

  BEGIN
    PERFORM public.emit_business_event(
      p_business_id := v_staff.business_id,
      p_event_type := 'meeting_action_to_task',
      p_entity_type := 'task',
      p_entity_id := v_task_id,
      p_payload := jsonb_build_object('action_id', p_action_id, 'meeting_id', v_action.meeting_id),
      p_actor_id := v_staff.id,
      p_source := 'system'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_task_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_action_task(UUID, TEXT, UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_action_task(UUID, TEXT, UUID, DATE, TEXT) TO authenticated;

-- save_meeting_decision: record a decision captured live in the room.
CREATE OR REPLACE FUNCTION public.save_meeting_decision(
  p_meeting_id UUID,
  p_decision_text TEXT,
  p_rationale TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'decided'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_business_id UUID;
  v_id UUID;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT m.business_id INTO v_business_id FROM public.meetings m WHERE m.id = p_meeting_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = v_business_id) THEN
    RAISE EXCEPTION 'Not authorized for this meeting';
  END IF;
  INSERT INTO public.meeting_decisions (business_id, meeting_id, decision_text, rationale, decided_by, status)
  VALUES (v_business_id, p_meeting_id, p_decision_text, p_rationale, v_staff.id, p_status)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_meeting_decision(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_meeting_decision(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- save_meeting_action: record an action item captured live in the room.
CREATE OR REPLACE FUNCTION public.save_meeting_action(
  p_meeting_id UUID,
  p_action_text TEXT,
  p_assignee_id UUID DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_business_id UUID;
  v_id UUID;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT m.business_id INTO v_business_id FROM public.meetings m WHERE m.id = p_meeting_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = v_business_id) THEN
    RAISE EXCEPTION 'Not authorized for this meeting';
  END IF;
  INSERT INTO public.meeting_actions (business_id, meeting_id, action_text, assignee_id, due_date, priority, status)
  VALUES (v_business_id, p_meeting_id, p_action_text, p_assignee_id, p_due_date, p_priority, 'open')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_meeting_action(UUID, TEXT, UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_meeting_action(UUID, TEXT, UUID, DATE, TEXT) TO authenticated;

-- ============================================================================
-- M4: fix generate_meeting_report emit signature (post-meeting record)
-- ============================================================================
-- The Phase D generate_meeting_report used the wrong 4-arg positional
-- emit_business_event call. Re-declare the telemetry block correctly by
-- re-creating the function (same signature, corrected emit).
CREATE OR REPLACE FUNCTION public.generate_meeting_report(
  p_meeting_id UUID,
  p_send_notifications BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_meeting RECORD;
  v_summary TEXT;
  v_key_points TEXT[];
  v_decisions JSONB;
  v_actions JSONB;
  v_attendees JSONB;
  v_report_data JSONB;
  v_report_id UUID;
  v_attendee RECORD;
  v_notify_count INT := 0;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id;

  IF v_meeting.business_id IS NULL OR v_meeting.business_id != v_staff.business_id THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT summary INTO v_summary FROM public.meeting_summaries
  WHERE meeting_id = p_meeting_id ORDER BY created_at DESC LIMIT 1;

  SELECT key_points INTO v_key_points FROM public.meeting_summaries
  WHERE meeting_id = p_meeting_id ORDER BY created_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id, 'text', d.decision_text, 'rationale', d.rationale,
    'status', d.status, 'timestamp_ms', d.timestamp_ms
  )), '[]'::jsonb) INTO v_decisions
  FROM public.meeting_decisions d WHERE d.meeting_id = p_meeting_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'text', a.action_text, 'assignee_id', a.assignee_id,
    'due_date', a.due_date, 'priority', a.priority, 'status', a.status,
    'task_id', a.task_id
  )), '[]'::jsonb) INTO v_actions
  FROM public.meeting_actions a WHERE a.meeting_id = p_meeting_id;

  v_attendees := COALESCE(v_meeting.attendees, '[]'::jsonb);

  v_report_data := jsonb_build_object(
    'meeting', jsonb_build_object(
      'id', v_meeting.id, 'title', v_meeting.title,
      'date', v_meeting.date, 'start_time', v_meeting.start_time,
      'end_time', v_meeting.end_time, 'location', v_meeting.location,
      'meeting_link', v_meeting.meeting_link
    ),
    'summary', COALESCE(v_summary, ''),
    'key_points', COALESCE(v_key_points, '[]'::jsonb),
    'decisions', v_decisions,
    'actions', v_actions,
    'attendees', v_attendees,
    'generated_at', NOW(),
    'generated_by', v_staff.id
  );

  INSERT INTO public.meeting_reports (meeting_id, business_id, generated_by, report_data)
  VALUES (p_meeting_id, v_staff.business_id, v_staff.id, v_report_data)
  RETURNING id INTO v_report_id;

  IF p_send_notifications THEN
    FOR v_attendee IN
      SELECT s.id, s.user_id FROM public.staff s
      WHERE s.business_id = v_staff.business_id
        AND s.active = true
        AND (
          s.id = v_meeting.staff_id
          OR s.id = ANY (SELECT * FROM jsonb_array_elements_text(v_attendees))
        )
    LOOP
      BEGIN
        INSERT INTO public.notifications (user_id, business_id, title, message, category, channel, entity_type, entity_id, data)
        VALUES (
          v_attendee.user_id,
          v_staff.business_id,
          'Meeting report ready: ' || v_meeting.title,
          'The post-meeting report for "' || v_meeting.title || '" is ready to review.',
          'meeting',
          'both',
          'meeting',
          p_meeting_id,
          jsonb_build_object('report_id', v_report_id, 'meeting_id', p_meeting_id)
        );
        v_notify_count := v_notify_count + 1;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;

    UPDATE public.meeting_reports
    SET sent_to = ARRAY(
      SELECT s.id FROM public.staff s
      WHERE s.business_id = v_staff.business_id AND s.active = true
        AND (s.id = v_meeting.staff_id OR s.id = ANY (SELECT * FROM jsonb_array_elements_text(v_attendees)))
    ),
    sent_at = NOW()
    WHERE id = v_report_id;
  END IF;

  BEGIN
    PERFORM public.emit_business_event(
      p_business_id := v_staff.business_id,
      p_event_type := 'meeting_report_generated',
      p_entity_type := 'meeting',
      p_entity_id := p_meeting_id,
      p_payload := jsonb_build_object('meeting_id', p_meeting_id, 'report_id', v_report_id, 'notified', v_notify_count),
      p_actor_id := v_staff.id,
      p_source := 'system'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'report_id', v_report_id,
    'report_data', v_report_data,
    'notified', v_notify_count
  );
END;
$$;
REVOKE ALL ON FUNCTION public.generate_meeting_report(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_meeting_report(UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- M5: journey wiring — meeting -> CRM record link
-- ============================================================================
-- A meeting can be associated with a CRM record (lead/deal/contact) so the
-- meeting becomes business-intelligence input (meeting -> customer -> quote).
-- Additive columns; NULL = standalone internal meeting.
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS related_entity_type TEXT
    CHECK (related_entity_type IN ('lead','deal','contact','customer')),
  ADD COLUMN IF NOT EXISTS related_entity_id UUID;

CREATE INDEX IF NOT EXISTS idx_meetings_related
  ON public.meetings(related_entity_type, related_entity_id);

-- link_meeting_to_crm: associate a meeting with a CRM record (membership-guarded).
CREATE OR REPLACE FUNCTION public.link_meeting_to_crm(
  p_meeting_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_staff RECORD;
  v_business_id UUID;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.id IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT m.business_id INTO v_business_id FROM public.meetings m WHERE m.id = p_meeting_id;
  IF v_business_id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = v_business_id) THEN
    RETURN FALSE;
  END IF;
  IF p_entity_type NOT IN ('lead','deal','contact','customer') THEN
    RETURN FALSE;
  END IF;
  UPDATE public.meetings
  SET related_entity_type = p_entity_type, related_entity_id = p_entity_id
  WHERE id = p_meeting_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.link_meeting_to_crm(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_meeting_to_crm(UUID, TEXT, UUID) TO authenticated;
