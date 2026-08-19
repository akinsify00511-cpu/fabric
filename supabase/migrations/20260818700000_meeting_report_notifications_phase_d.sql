-- 20260818700000_meeting_report_notifications_phase_d.sql
--
-- Meeting Phase D — Post-Meeting Report + Notifications (sections 6, 7, 11, 12).
--
-- Phase A = lifecycle, Phase B = recording, Phase C = transcript/decisions/
-- actions. Phase D composes them into a SHAREABLE post-meeting report +
-- notifies attendees when it's ready.
--
-- Composition-first (section 2 non-negotiable):
--   • Reuses meeting_summaries + meeting_decisions + meeting_actions (Phase C).
--   • Reuses notifications table (036) — NOT a parallel notification system.
--   • Reuses staff (002) for attendee emails.
--   • Reuses get_current_staff() RLS pattern.
--   • Reuses emit_business_event (058/059) for telemetry.
-- No external dependency. Pure internal SQL. Idempotent.

-- ============================================================================
-- 1. meeting_reports (the composed post-meeting report — section 6/7)
-- ============================================================================
-- A report is a SNAPSHOT of the meeting intelligence at generation time.
-- It composes the summary + decisions + actions + attendees into one
-- document. It's immutable once generated (audit trail — section 18).

CREATE TABLE IF NOT EXISTS public.meeting_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  generated_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  report_data JSONB NOT NULL,              -- the snapshot (summary + decisions + actions + attendees)
  sent_to UUID[] DEFAULT '{}',             -- staff IDs the report was sent to
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_reports_meeting ON public.meeting_reports(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_reports_business ON public.meeting_reports(business_id);

ALTER TABLE public.meeting_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_reports_select ON public.meeting_reports;
CREATE POLICY meeting_reports_select ON public.meeting_reports
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_reports_insert ON public.meeting_reports;
CREATE POLICY meeting_reports_insert ON public.meeting_reports
  FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_reports_delete ON public.meeting_reports;
CREATE POLICY meeting_reports_delete ON public.meeting_reports
  FOR DELETE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

-- ============================================================================
-- 2. generate_meeting_report RPC (composes the snapshot — section 6/7/9)
-- ============================================================================
-- Composes the meeting intelligence (transcript + summary + decisions +
-- actions + attendees) into a single JSONB report + stores it.

CREATE OR REPLACE FUNCTION public.generate_meeting_report(
  p_meeting_id UUID,
  p_send_notifications BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Compose the report from Phase C tables
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

  -- Store the report
  INSERT INTO public.meeting_reports (meeting_id, business_id, generated_by, report_data)
  VALUES (p_meeting_id, v_staff.business_id, v_staff.id, v_report_data)
  RETURNING id INTO v_report_id;

  -- Send notifications to attendees (best-effort — section 25 anti-spam:
  -- only on explicit generation, not every transcript refresh)
  IF p_send_notifications THEN
    -- Notify meeting creator + attendees who are staff
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

  -- Telemetry
  BEGIN
    PERFORM public.emit_business_event(
      v_staff.business_id, 'meeting_report_generated',
      v_report_id, jsonb_build_object('meeting_id', p_meeting_id, 'notified', v_notify_count)
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

-- ============================================================================
-- 3. get_meeting_reports RPC (list reports for a meeting)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_meeting_reports(
  p_meeting_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_reports JSONB;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'meeting_id', r.meeting_id,
    'report_data', r.report_data,
    'sent_to', r.sent_to, 'sent_at', r.sent_at,
    'created_at', r.created_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb) INTO v_reports
  FROM public.meeting_reports r
  WHERE r.meeting_id = p_meeting_id
    AND r.business_id = v_staff.business_id;

  RETURN v_reports;
END;
$$;

-- ============================================================================
-- 4. Grants
-- ============================================================================
GRANT SELECT, INSERT, DELETE ON public.meeting_reports TO authenticated;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.generate_meeting_report(UUID, BOOLEAN) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_meeting_reports(UUID) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
