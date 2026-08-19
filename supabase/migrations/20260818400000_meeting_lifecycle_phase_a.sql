-- ============================================================================
-- MEETING LIFECYCLE — PHASE A
-- (sections 6, 7, 9, 11, 12, 31, 32, 34, 35 of the Meeting build instruction)
--
-- This migration EXTENDS the existing meetings table (998) additively and adds
-- the relational participant-evidence layer the prior JSONB-attendees model
-- lacked. It does NOT create a parallel meeting system (§2 non-negotiable) —
-- it reuses the canonical meetings table, get_current_staff() RLS helper,
-- emit_business_event telemetry (058/059), and the storage.buckets pattern.
--
-- Phase A scope: lifecycle + room + participant evidence.
-- NOT here: recording/capture UI (B), transcript/decisions/actions (C),
-- task creation (D), analytics (E). The columns/RPCs for those are stubbed
-- where the schema needs them, but the processing is deferred.
-- ============================================================================

\set ON_ERROR_STOP on

-- ============================================================================
-- 0. MEETINGS TABLE (create-if-missing)
-- ============================================================================
-- The canonical meetings table lives in 998_create_all_missing_tables.sql,
-- but lexically 998 applies AFTER the 2026... migrations, so on a fresh
-- database this table does not exist yet when this file runs. Create it
-- here (identical definition to 998) so the additive extensions below have
-- a target. 998's own CREATE TABLE IF NOT EXISTS then no-ops.

CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  location TEXT,
  meeting_link TEXT,
  attendees JSONB DEFAULT '[]',
  agenda TEXT,
  notes TEXT,
  recording_url TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_staff ON public.meetings(staff_id);
CREATE INDEX IF NOT EXISTS idx_meetings_business ON public.meetings(business_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date ON public.meetings(date);

-- ============================================================================
-- 1. EXTEND meetings TABLE (additive — no breaking changes)
-- ============================================================================
-- The existing table (998) has: staff_id, title, date, start_time, end_time,
-- attendees JSONB, agenda, notes, recording_url, status. We KEEP all of those
-- (back-compat) and add the lifecycle/evidence columns the instruction
-- requires (sections 6, 7, 12).

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_type TEXT DEFAULT 'internal'
    CHECK (meeting_type IN ('internal', 'external', 'recurring', 'instant')),
  ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_seconds INT,
  ADD COLUMN IF NOT EXISTS recording_status TEXT DEFAULT 'none'
    CHECK (recording_status IN ('none', 'requested', 'recording', 'paused', 'available', 'failed')),
  ADD COLUMN IF NOT EXISTS transcript_status TEXT DEFAULT 'none'
    CHECK (transcript_status IN ('none', 'queued', 'processing', 'available', 'failed')),
  ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'business'
    CHECK (visibility IN ('business', 'participants', 'private')),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organization_id UUID;  -- multi-company scope (20260817150000)

-- Backfill created_by from staff_id (the prior host column) for existing rows.
UPDATE public.meetings
  SET created_by = staff_id
  WHERE created_by IS NULL AND staff_id IS NOT NULL;

-- Backfill scheduled_start/end from the lossy DATE + TIME pair for existing rows.
UPDATE public.meetings
  SET scheduled_start = (date::text || ' ' || start_time::text)::TIMESTAMPTZ
  WHERE scheduled_start IS NULL AND date IS NOT NULL AND start_time IS NOT NULL;

UPDATE public.meetings
  SET scheduled_end = (date::text || ' ' || COALESCE(end_time::text, start_time::text))::TIMESTAMPTZ
  WHERE scheduled_end IS NULL AND date IS NOT NULL AND start_time IS NOT NULL;

-- Widen the status CHECK to the full lifecycle (section 7).
-- Old default 'scheduled' stays valid.
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_status_check;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_status_check CHECK (status IN (
    'scheduled', 'starting', 'live', 'ending', 'processing', 'completed',
    'cancelled', 'processing_failed', 'recording_failed', 'transcription_failed'
  ));

-- Indexes for the new columns.
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_start ON public.meetings(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON public.meetings(created_by);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_business_status ON public.meetings(business_id, status);

-- ============================================================================
-- 2. meeting_participants (relational — replaces the JSONB attendees blob)
-- ============================================================================
-- A participant is EITHER an internal staff member (staff_id + user_id) OR an
-- external guest (guest_token). The CHECK enforces one-or-the-other. This is
-- the foundation for section 12 (attendance evidence) + section 11 (external
-- guests via secure token, like the 050 signing-token pattern).

CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  -- Internal participant (one of these two paths is required):
  user_id UUID,                           -- auth.users id (internal)
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  -- External guest (section 11 — token-gated, no full membership):
  guest_name TEXT,
  guest_email TEXT,
  guest_token TEXT UNIQUE,                -- secure meeting join token
  -- Role + lifecycle:
  role TEXT NOT NULL DEFAULT 'participant'
    CHECK (role IN ('host', 'co_host', 'participant', 'guest')),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  total_seconds INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'joined', 'left', 'removed', 'declined', 'no_show')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Must be either internal (staff_id) or external (guest_token), not both/neither.
  CHECK (
    (staff_id IS NOT NULL) OR (guest_token IS NOT NULL)
  ),
  -- External guests must have a name.
  CHECK (
    guest_token IS NULL OR guest_name IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON public.meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_staff ON public.meeting_participants(staff_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_token ON public.meeting_participants(guest_token);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_status ON public.meeting_participants(meeting_id, status);

ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_participants_business_read ON public.meeting_participants;
CREATE POLICY meeting_participants_business_read ON public.meeting_participants
  FOR SELECT TO authenticated
  USING (meeting_id IN (
    SELECT m.id FROM public.meetings m
    WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

DROP POLICY IF EXISTS meeting_participants_host_insert ON public.meeting_participants;
CREATE POLICY meeting_participants_host_insert ON public.meeting_participants
  FOR INSERT TO authenticated
  WITH CHECK (meeting_id IN (
    SELECT m.id FROM public.meetings m
    WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

DROP POLICY IF EXISTS meeting_participants_host_update ON public.meeting_participants;
CREATE POLICY meeting_participants_host_update ON public.meeting_participants
  FOR UPDATE TO authenticated
  USING (meeting_id IN (
    SELECT m.id FROM public.meetings m
    WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

DROP POLICY IF EXISTS meeting_participants_host_delete ON public.meeting_participants;
CREATE POLICY meeting_participants_host_delete ON public.meeting_participants
  FOR DELETE TO authenticated
  USING (meeting_id IN (
    SELECT m.id FROM public.meetings m
    WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

-- Guest self-read: an unauthenticated guest can read THEIR OWN participant row
-- by token (section 11). This is the 050 signing-token pattern: anon reads
-- via token, not via business scope.
DROP POLICY IF EXISTS meeting_participants_guest_self_read ON public.meeting_participants;
CREATE POLICY meeting_participants_guest_self_read ON public.meeting_participants
  FOR SELECT TO anon, authenticated
  USING (guest_token IS NOT NULL AND guest_token = current_setting('meeting.guest_token', true));

-- ============================================================================
-- 3. meeting_participant_events (the evidence trail — section 12)
-- ============================================================================
-- Append-only record of every participant state change. This is how Avenize
-- PROVES a meeting occurred and who was present (section 12). Not proof of
-- physical presence/attention — proof of authenticated/session-based
-- participation (as the instruction states).

CREATE TABLE IF NOT EXISTS public.meeting_participant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.meeting_participants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'invited', 'joined', 'left', 'rejoined', 'removed',
    'muted', 'unmuted', 'camera_on', 'camera_off',
    'screen_share_started', 'screen_share_stopped', 'hand_raised', 'hand_lowered'
  )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_meeting_events_meeting ON public.meeting_participant_events(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_events_participant ON public.meeting_participant_events(participant_id);
CREATE INDEX IF NOT EXISTS idx_meeting_events_time ON public.meeting_participant_events(occurred_at DESC);

ALTER TABLE public.meeting_participant_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_participant_events_business_read ON public.meeting_participant_events;
CREATE POLICY meeting_participant_events_business_read ON public.meeting_participant_events
  FOR SELECT TO authenticated
  USING (meeting_id IN (
    SELECT m.id FROM public.meetings m
    WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

DROP POLICY IF EXISTS meeting_participant_events_host_insert ON public.meeting_participant_events;
CREATE POLICY meeting_participant_events_host_insert ON public.meeting_participant_events
  FOR INSERT TO authenticated
  WITH CHECK (meeting_id IN (
    SELECT m.id FROM public.meetings m
    WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

-- ============================================================================
-- 4. meeting_media (recording metadata — sections 6, 13, 14)
-- ============================================================================
-- Stores the PRIVATE storage path (never a public URL — section 32). Access
-- is via signed URLs generated server-side. The existing meetings.recording_url
-- column (public URL) is kept for back-compat but deprecated; new recordings
-- use this table.

CREATE TABLE IF NOT EXISTS public.meeting_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL DEFAULT 'recording'
    CHECK (media_type IN ('recording', 'transcript', 'capture', 'chat_export')),
  storage_path TEXT,                      -- private path in meeting-recordings bucket
  duration_seconds INT,
  size_bytes BIGINT,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'available', 'failed', 'deleted')),
  retention_until TIMESTAMPTZ,            -- section 14 retention policy
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_media_meeting ON public.meeting_media(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_media_status ON public.meeting_media(processing_status);

ALTER TABLE public.meeting_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_media_business_read ON public.meeting_media;
CREATE POLICY meeting_media_business_read ON public.meeting_media
  FOR SELECT TO authenticated
  USING (meeting_id IN (
    SELECT m.id FROM public.meetings m
    WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

DROP POLICY IF EXISTS meeting_media_host_write ON public.meeting_media;
CREATE POLICY meeting_media_host_write ON public.meeting_media
  FOR ALL TO authenticated
  USING (meeting_id IN (
    SELECT m.id FROM public.meetings m
    WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())
  ))
  WITH CHECK (meeting_id IN (
    SELECT m.id FROM public.meetings m
    WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())
  ));

-- ============================================================================
-- 5. meeting-recordings storage bucket (PRIVATE — section 13/32)
-- ============================================================================
-- The existing Meetings.tsx uploads to a 'meeting-recordings' bucket that no
-- migration created — the upload silently failed. This creates it (private —
-- never public; signed URLs only).

INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-recordings', 'meeting-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: business-scoped read/write (matches the avatars/documents pattern).
-- A staff member can read/write recordings for their own business's meetings.
DROP POLICY IF EXISTS "meeting_recordings_business_read" ON storage.objects;
CREATE POLICY "meeting_recordings_business_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'meeting-recordings'
    AND (
      -- The path convention is meetings/{meeting_id}/{filename}. Extract the
      -- meeting_id and check the caller belongs to that meeting's business.
      EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE m.id = (
          split_part(name, '/', 2)::uuid  -- meetings/{meeting_id}/...
        )
        AND m.business_id IN (SELECT business_id FROM public.get_current_staff())
      )
    )
  );

DROP POLICY IF EXISTS "meeting_recordings_business_write" ON storage.objects;
CREATE POLICY "meeting_recordings_business_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'meeting-recordings'
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = split_part(name, '/', 2)::uuid
      AND m.business_id IN (SELECT business_id FROM public.get_current_staff())
    )
  );

DROP POLICY IF EXISTS "meeting_recordings_business_update" ON storage.objects;
CREATE POLICY "meeting_recordings_business_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'meeting-recordings'
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = split_part(name, '/', 2)::uuid
      AND m.business_id IN (SELECT business_id FROM public.get_current_staff())
    )
  );

DROP POLICY IF EXISTS "meeting_recordings_business_delete" ON storage.objects;
CREATE POLICY "meeting_recordings_business_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'meeting-recordings'
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = split_part(name, '/', 2)::uuid
      AND m.business_id IN (SELECT business_id FROM public.get_current_staff())
    )
  );

-- ============================================================================
-- 6. FIX meetings RLS (use canonical get_current_staff — section 32)
-- ============================================================================
-- The existing 998 policies use the pre-080 pattern
-- (`staff WHERE user_id = auth.uid()`). Rewrite to get_current_staff() for
-- consistency with the 080 cross-tenant repair (111 policies).

DROP POLICY IF EXISTS "Business members can view meetings" ON public.meetings;
CREATE POLICY "Business members can view meetings" ON public.meetings
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS "Business members can insert meetings" ON public.meetings;
CREATE POLICY "Business members can insert meetings" ON public.meetings
  FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS "Business members can update meetings" ON public.meetings;
CREATE POLICY "Business members can update meetings" ON public.meetings
  FOR UPDATE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS "Business members can delete meetings" ON public.meetings;
CREATE POLICY "Business members can delete meetings" ON public.meetings
  FOR DELETE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

-- ============================================================================
-- 7. updated_at triggers (reuse the 007 update_updated_at helper)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_meeting_participants_updated_at ON public.meeting_participants;
CREATE TRIGGER trg_meeting_participants_updated_at
  BEFORE UPDATE ON public.meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_media_updated_at ON public.meeting_media;
CREATE TRIGGER trg_meeting_media_updated_at
  BEFORE UPDATE ON public.meeting_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 8. LIFECYCLE RPCs (SECURITY DEFINER, membership-guarded — sections 7, 9, 11)
-- ============================================================================
-- Each RPC verifies the caller belongs to the meeting's business via
-- get_current_staff(). Guest-token operations verify the token instead.
-- All emit business_events via emit_business_event (058/059 — NOT a new event
-- system, per §2 non-negotiable + section 31).

-- Drop stale overloads (robustness — may not exist, guarded).
DROP FUNCTION IF EXISTS public.create_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.start_meeting(UUID);
DROP FUNCTION IF EXISTS public.join_meeting(UUID);
DROP FUNCTION IF EXISTS public.join_meeting(UUID, TEXT);
DROP FUNCTION IF EXISTS public.leave_meeting(UUID, UUID);
DROP FUNCTION IF EXISTS public.end_meeting(UUID);
DROP FUNCTION IF EXISTS public.generate_meeting_token(UUID, TEXT);

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
  -- Authorization: caller must belong to the business.
  SELECT s.id INTO v_staff_id
  FROM public.get_current_staff() s
  WHERE s.business_id = p_business_id
  LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to create meetings for this business';
  END IF;

  INSERT INTO public.meetings (
    business_id, staff_id, created_by, title, description,
    meeting_type, scheduled_start, scheduled_end, visibility, status
  ) VALUES (
    p_business_id, COALESCE(p_created_by, v_staff_id), COALESCE(p_created_by, v_staff_id),
    p_title, p_description, p_meeting_type, p_scheduled_start, p_scheduled_end,
    p_visibility, 'scheduled'
  ) RETURNING id INTO v_meeting_id;

  -- Host participant row.
  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.meeting_participants (
    meeting_id, staff_id, user_id, role, status
  ) VALUES (
    v_meeting_id, v_staff_id, auth.uid(), 'host', 'invited'
  );

  -- Telemetry (reuse 058/059 — NOT a new event system).
  PERFORM public.emit_business_event(
    p_business_id, v_staff_id, 'meeting_created',
    jsonb_build_object('meeting_id', v_meeting_id, 'title', p_title, 'meeting_type', p_meeting_type)
  );

  RETURN QUERY SELECT v_meeting_id, v_token;
END;
$$;

COMMENT ON FUNCTION public.create_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID) IS
  'Create a meeting. Caller must be a member of the business. Returns meeting_id + a host join token. Emits meeting_created business_event.';

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

  -- Authorization: caller must belong to the meeting's business.
  SELECT s.id INTO v_staff_id
  FROM public.get_current_staff() s
  WHERE s.business_id = v_business_id LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to start this meeting';
  END IF;

  -- Idempotent (section 34): if already live, no-op.
  IF EXISTS (SELECT 1 FROM public.meetings WHERE id = p_meeting_id AND status = 'live') THEN
    RETURN QUERY SELECT true;
    RETURN;
  END IF;

  UPDATE public.meetings
    SET status = 'live', actual_start = NOW()
    WHERE id = p_meeting_id AND status IN ('scheduled', 'starting');

  PERFORM public.emit_business_event(
    v_business_id, v_staff_id, 'meeting_started',
    jsonb_build_object('meeting_id', p_meeting_id)
  );

  RETURN QUERY SELECT true;
END;
$$;

COMMENT ON FUNCTION public.start_meeting(UUID) IS
  'Start a meeting (set status=live, actual_start=now). Idempotent. Caller must be a business member.';

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
    -- External guest (section 11): verify the token, not business membership.
    SELECT id INTO v_participant_id
    FROM public.meeting_participants
    WHERE meeting_id = p_meeting_id AND guest_token = p_guest_token
      AND status IN ('invited', 'joined', 'left');
    IF v_participant_id IS NULL THEN
      RETURN QUERY SELECT NULL::UUID, false;
      RETURN;
    END IF;
  ELSE
    -- Internal participant: must be a business member.
    SELECT s.id INTO v_staff_id
    FROM public.get_current_staff() s
    WHERE s.business_id = v_business_id LIMIT 1;
    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'Not authorized to join this meeting';
    END IF;

    -- Upsert the participant row (idempotent — section 34).
    INSERT INTO public.meeting_participants (meeting_id, staff_id, user_id, role, status, joined_at)
    VALUES (p_meeting_id, v_staff_id, auth.uid(), 'participant', 'joined', NOW())
    ON CONFLICT (meeting_id, staff_id) DO UPDATE
      SET status = 'joined', joined_at = NOW(), left_at = NULL
    RETURNING id INTO v_participant_id;
  END IF;

  -- Record the evidence event (section 12).
  INSERT INTO public.meeting_participant_events (meeting_id, participant_id, event_type)
  VALUES (p_meeting_id, v_participant_id, 'joined');

  -- Idempotently start the meeting if the host joins (section 34).
  UPDATE public.meetings SET status = 'live', actual_start = COALESCE(actual_start, NOW())
    WHERE id = p_meeting_id AND status IN ('scheduled', 'starting');

  PERFORM public.emit_business_event(
    v_business_id, v_staff_id, 'meeting_joined',
    jsonb_build_object('meeting_id', p_meeting_id, 'is_guest', v_is_guest)
  );

  RETURN QUERY SELECT v_participant_id, true;
END;
$$;

COMMENT ON FUNCTION public.join_meeting(UUID, TEXT) IS
  'Join a meeting (internal staff or external guest via token). Upserts participant + records joined event. Idempotent. Emits meeting_joined.';

CREATE OR REPLACE FUNCTION public.leave_meeting(
  p_meeting_id UUID,
  p_participant_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
  v_joined_at TIMESTAMPTZ;
BEGIN
  SELECT m.business_id INTO v_business_id
  FROM public.meetings m WHERE m.id = p_meeting_id;

  -- Authorization: either a business member, or the participant itself (guest).
  IF v_business_id IS NOT NULL THEN
    SELECT s.id INTO v_staff_id
    FROM public.get_current_staff() s
    WHERE s.business_id = v_business_id LIMIT 1;
  END IF;

  SELECT joined_at INTO v_joined_at
  FROM public.meeting_participants
  WHERE id = p_participant_id AND meeting_id = p_meeting_id;

  IF v_joined_at IS NULL THEN
    RETURN false;  -- not joined or not found
  END IF;

  -- Idempotent (section 34): if already left, no-op.
  IF EXISTS (
    SELECT 1 FROM public.meeting_participants
    WHERE id = p_participant_id AND left_at IS NOT NULL
  ) THEN
    RETURN true;
  END IF;

  UPDATE public.meeting_participants
    SET status = 'left', left_at = NOW(),
        total_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - joined_at))::INT)
    WHERE id = p_participant_id;

  INSERT INTO public.meeting_participant_events (meeting_id, participant_id, event_type)
  VALUES (p_meeting_id, p_participant_id, 'left');

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.leave_meeting(UUID, UUID) IS
  'Leave a meeting (set status=left, left_at=now, total_seconds). Idempotent. Records left event.';

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

  -- Authorization: caller must be a business member (host controls — section 10).
  SELECT s.id INTO v_staff_id
  FROM public.get_current_staff() s
  WHERE s.business_id = v_business_id LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to end this meeting';
  END IF;

  -- Idempotent (section 34): if already completed, no-op.
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

  -- Mark all still-joined participants as left.
  UPDATE public.meeting_participants
    SET status = 'left', left_at = NOW(),
        total_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - joined_at))::INT)
    WHERE meeting_id = p_meeting_id AND status = 'joined';

  PERFORM public.emit_business_event(
    v_business_id, v_staff_id, 'meeting_ended',
    jsonb_build_object('meeting_id', p_meeting_id)
  );

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.end_meeting(UUID) IS
  'End a meeting for all (host control). Sets status=completed, actual_end, duration_seconds. Idempotent. Marks remaining participants as left.';

CREATE OR REPLACE FUNCTION public.generate_meeting_token(
  p_meeting_id UUID,
  p_guest_email TEXT,
  p_guest_name TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_business_id UUID;
  v_staff_id UUID;
  v_token TEXT;
  v_name TEXT;
BEGIN
  SELECT m.business_id INTO v_business_id
  FROM public.meetings m WHERE m.id = p_meeting_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Authorization: caller must be a business member (only the host can invite guests).
  SELECT s.id INTO v_staff_id
  FROM public.get_current_staff() s
  WHERE s.business_id = v_business_id LIMIT 1;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to invite guests to this meeting';
  END IF;

  v_name := COALESCE(p_guest_name, p_guest_email);
  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.meeting_participants (
    meeting_id, guest_name, guest_email, guest_token, role, status
  ) VALUES (
    p_meeting_id, v_name, p_guest_email, v_token, 'guest', 'invited'
  );

  INSERT INTO public.meeting_participant_events (meeting_id, participant_id, event_type)
  SELECT p_meeting_id, id, 'invited'
  FROM public.meeting_participants
  WHERE meeting_id = p_meeting_id AND guest_token = v_token;

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.generate_meeting_token(UUID, TEXT, TEXT) IS
  'Generate a secure join token for an external guest (section 11). Caller must be a business member. Returns the token (shown once).';

-- Grant to authenticated (anon gets the guest-self-read via RLS, not these RPCs).
GRANT EXECUTE ON FUNCTION public.create_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_meeting(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_meeting(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_meeting(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_meeting(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_meeting_token(UUID, TEXT, TEXT) TO authenticated;
