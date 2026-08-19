-- 20260818800000_meeting_analytics_phase_e.sql
--
-- Meeting Phase E — Analytics + Productivity Intelligence (sections 6, 9, 12).
--
-- Composes metrics across ALL meetings for a business: total hours, decisions,
-- actions, completion %, meeting waste detection (meetings with no decisions
-- AND no actions), per-staff load, per-meeting-type breakdown.
--
-- Composition-first (section 2 non-negotiable):
--   • Reuses meetings (998) + meeting_decisions + meeting_actions (Phase C).
--   • Reuses meeting_participants + meeting_participant_events (Phase A).
--   • Reuses get_current_staff() RLS pattern.
--   • No new tables — pure read-only analytics over existing data.
-- No external dependency. Pure internal SQL. Idempotent.

-- ============================================================================
-- meeting_analytics: the productivity metrics for a business (section 9/12)
-- ============================================================================
-- Returns a JSONB payload: totals (meetings, hours, decisions, actions,
-- completion %), waste detection (meetings with no decisions AND no actions),
-- per-staff meeting load, per-status breakdown.

CREATE OR REPLACE FUNCTION public.meeting_analytics(
  p_period_days INT DEFAULT 30
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_period_start TIMESTAMPTZ := NOW() - (COALESCE(p_period_days, 30) || ' days')::INTERVAL;
  v_totals JSONB;
  v_waste JSONB;
  v_per_staff JSONB;
  v_per_status JSONB;
  v_completion_pct REAL;
  v_total_actions INT;
  v_completed_actions INT;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  -- Totals (section 9)
  SELECT jsonb_build_object(
    'total_meetings', COUNT(*),
    'total_hours', COALESCE(SUM(
      CASE
        WHEN m.end_time IS NOT NULL THEN
          EXTRACT(EPOCH FROM (m.date + m.end_time) - (m.date + m.start_time)) / 3600.0
        ELSE 0
      END
    ), 0),
    'meetings_with_transcripts', COUNT(DISTINCT CASE WHEN m.transcript_status = 'completed' THEN m.id END),
    'total_decisions', (SELECT COUNT(*) FROM public.meeting_decisions d
      WHERE d.business_id = v_staff.business_id
        AND d.created_at >= v_period_start),
    'total_actions', (SELECT COUNT(*) FROM public.meeting_actions a
      WHERE a.business_id = v_staff.business_id
        AND a.created_at >= v_period_start)
  ) INTO v_totals
  FROM public.meetings m
  WHERE m.business_id = v_staff.business_id
    AND m.date >= v_period_start::date;

  -- Action completion rate (section 12)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_actions, v_completed_actions
  FROM public.meeting_actions
  WHERE business_id = v_staff.business_id
    AND created_at >= v_period_start;

  v_completion_pct := CASE WHEN v_total_actions > 0
    THEN ROUND((v_completed_actions::REAL / v_total_actions) * 100, 1)
    ELSE NULL END;

  -- Meeting waste detection (section 9 — meetings with no decisions AND no actions)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'meeting_id', m.id, 'title', m.title, 'date', m.date,
    'duration_hours', CASE
      WHEN m.end_time IS NOT NULL THEN
        EXTRACT(EPOCH FROM (m.date + m.end_time) - (m.date + m.start_time)) / 3600.0
      ELSE NULL END
  )), '[]'::jsonb) INTO v_waste
  FROM public.meetings m
  WHERE m.business_id = v_staff.business_id
    AND m.date >= v_period_start::date
    AND m.status IN ('completed', 'summarized')
    AND NOT EXISTS (SELECT 1 FROM public.meeting_decisions d WHERE d.meeting_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM public.meeting_actions a WHERE a.meeting_id = m.id)
  ORDER BY m.date DESC
  LIMIT 20;

  -- Per-staff meeting load (who attends/creates the most meetings)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'staff_id', s.id, 'staff_name', s.full_name,
    'meetings_created', COUNT(DISTINCT m.id) FILTER (WHERE m.staff_id = s.id),
    'meetings_attended', COUNT(DISTINCT m.id) FILTER (WHERE m.attendees ? s.id::TEXT OR m.staff_id = s.id)
  ) ORDER BY COUNT(DISTINCT m.id) DESC), '[]'::jsonb) INTO v_per_staff
  FROM public.staff s
  LEFT JOIN public.meetings m ON m.business_id = s.business_id
    AND m.date >= v_period_start::date
  WHERE s.business_id = v_staff.business_id AND s.active = true
  GROUP BY s.id, s.full_name
  LIMIT 10;

  -- Per-status breakdown
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'status', status, 'count', COUNT(*)
  )), '[]'::jsonb) INTO v_per_status
  FROM public.meetings
  WHERE business_id = v_staff.business_id
    AND date >= v_period_start::date
  GROUP BY status;

  RETURN jsonb_build_object(
    'period_days', COALESCE(p_period_days, 30),
    'totals', v_totals,
    'action_completion_pct', v_completion_pct,
    'wasted_meetings', v_waste,
    'wasted_meetings_count', jsonb_array_length(v_waste),
    'per_staff', v_per_staff,
    'per_status', v_per_status,
    'small_data_note', CASE
      WHEN (v_totals->>'total_meetings')::INT < 5
        THEN 'Insufficient data — fewer than 5 meetings in the period. Treat metrics with caution.'
      ELSE NULL END
  );
END;
$$;

-- ============================================================================
-- Grants
-- ============================================================================
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.meeting_analytics(INT) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
