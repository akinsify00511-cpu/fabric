-- 20260818600000_meeting_transcript_decisions_phase_c.sql
--
-- Meeting Phase C — Transcript + Summary + Decisions + Actions
-- (sections 6, 7, 9, 11, 12, 14, 31, 32, 34).
--
-- Phase A created the meeting lifecycle. Phase B added recording + capture.
-- Phase C makes recordings INTELLIGENT: transcript, segments, summary,
-- decisions, and actions (action→task linking).
--
-- Composition-first (section 2 non-negotiable):
--   • Reuses meeting_media (Phase A) — transcripts are a media_type.
--   • Reuses tasks table (004) — actions link to existing tasks, NOT a
--     parallel task system.
--   • Reuses claims table (060) — decisions can become recommendations
--     (the §15 outcome loop), NOT a parallel recommendation system.
--   • Reuses get_current_staff() RLS pattern.
--   • Reuses emit_business_event (058/059) for telemetry.
--   • Reuses transcribe-audio edge function (extended, not replaced).
-- No external dependency. Pure internal SQL. Idempotent.

-- ============================================================================
-- 1. meeting_transcripts (the full transcript — section 6)
-- ============================================================================
-- One transcript per recording (meeting_media row of media_type='transcript').
-- The transcribe-audio edge function writes here instead of the meetings
-- table (the old path wrote transcript TEXT to meetings, which was lossy +
-- unsearchable).

-- Add transcript_status to meetings (tracks the transcript processing state).
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS transcript_status TEXT
  DEFAULT 'pending' CHECK (transcript_status IN ('pending', 'processing', 'completed', 'failed'));
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS summary TEXT;

CREATE TABLE IF NOT EXISTS public.meeting_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  media_id UUID REFERENCES public.meeting_media(id) ON DELETE SET NULL,
  full_text TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  word_count INT,
  duration_seconds INT,
  confidence_score REAL,
  provider TEXT DEFAULT 'openai-whisper',
  processing_status TEXT NOT NULL DEFAULT 'completed'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_transcripts_meeting ON public.meeting_transcripts(meeting_id);

-- ============================================================================
-- 2. transcript_segments (searchable, timestamped — section 6/12)
-- ============================================================================
-- The transcript broken into time-coded segments for display + search.
-- One row per ~30s segment (or sentence boundary, depending on provider).

CREATE TABLE IF NOT EXISTS public.transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES public.meeting_transcripts(id) ON DELETE CASCADE,
  segment_index INT NOT NULL,
  start_time_ms BIGINT NOT NULL DEFAULT 0,
  end_time_ms BIGINT NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  speaker TEXT,
  confidence REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_transcript ON public.transcript_segments(transcript_id);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_search ON public.transcript_segments
  USING gin(to_tsvector('english', text));

-- ============================================================================
-- 3. meeting_summaries (the GPT-4 summary — section 6)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meeting_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  transcript_id UUID REFERENCES public.meeting_transcripts(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  key_points TEXT[],
  provider TEXT DEFAULT 'openai-gpt4',
  model TEXT DEFAULT 'gpt-4o-mini',
  processing_status TEXT NOT NULL DEFAULT 'completed'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_summaries_meeting ON public.meeting_summaries(meeting_id);

-- ============================================================================
-- 4. meeting_decisions (structured decisions — sections 7, 9, 12)
-- ============================================================================
-- Decisions extracted by GPT-4 from the transcript. Each decision can become
-- a recommendation (claim) via the §15 outcome loop — decisions link to
-- claims, NOT a parallel system.

CREATE TABLE IF NOT EXISTS public.meeting_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  transcript_id UUID REFERENCES public.meeting_transcripts(id) ON DELETE SET NULL,
  claim_id UUID,                          -- link to claims (060) for the outcome loop
  decision_text TEXT NOT NULL,
  rationale TEXT,
  decided_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  timestamp_ms BIGINT,                    -- when in the meeting this was decided
  status TEXT NOT NULL DEFAULT 'decided'
    CHECK (status IN ('proposed', 'decided', 'reversed', 'superseded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_decisions_business ON public.meeting_decisions(business_id);
CREATE INDEX IF NOT EXISTS idx_meeting_decisions_meeting ON public.meeting_decisions(meeting_id);

-- ============================================================================
-- 5. meeting_actions (action items — sections 7, 9, 12, 14)
-- ============================================================================
-- Actions extracted by GPT-4. Each action links to a REAL task (004) — NOT
-- a parallel task system. The task is the execution; this table is the
-- meeting-context link (why this task exists, which meeting, which decision).

CREATE TABLE IF NOT EXISTS public.meeting_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  decision_id UUID REFERENCES public.meeting_decisions(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,  -- the REAL task (004)
  action_text TEXT NOT NULL,
  assignee_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  due_date DATE,
  priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled', 'deferred')),
  timestamp_ms BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_actions_business ON public.meeting_actions(business_id);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_meeting ON public.meeting_actions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_assignee ON public.meeting_actions(assignee_id);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_task ON public.meeting_actions(task_id);

-- ============================================================================
-- 6. RLS (business-scoped via get_current_staff)
-- ============================================================================
ALTER TABLE public.meeting_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_actions ENABLE ROW LEVEL SECURITY;

-- meeting_transcripts: select via meeting ownership, insert/update/delete same
DROP POLICY IF EXISTS meeting_transcripts_select ON public.meeting_transcripts;
CREATE POLICY meeting_transcripts_select ON public.meeting_transcripts
  FOR SELECT TO authenticated
  USING (meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())));

DROP POLICY IF EXISTS meeting_transcripts_insert ON public.meeting_transcripts;
CREATE POLICY meeting_transcripts_insert ON public.meeting_transcripts
  FOR INSERT TO authenticated
  WITH CHECK (meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())));

DROP POLICY IF EXISTS meeting_transcripts_update ON public.meeting_transcripts;
CREATE POLICY meeting_transcripts_update ON public.meeting_transcripts
  FOR UPDATE TO authenticated
  USING (meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())))
  WITH CHECK (meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())));

DROP POLICY IF EXISTS meeting_transcripts_delete ON public.meeting_transcripts;
CREATE POLICY meeting_transcripts_delete ON public.meeting_transcripts
  FOR DELETE TO authenticated
  USING (meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())));

-- transcript_segments: inherit via transcript→meeting
DROP POLICY IF EXISTS transcript_segments_select ON public.transcript_segments;
CREATE POLICY transcript_segments_select ON public.transcript_segments
  FOR SELECT TO authenticated
  USING (transcript_id IN (
    SELECT t.id FROM public.meeting_transcripts t
    WHERE t.meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff()))
  ));

DROP POLICY IF EXISTS transcript_segments_insert ON public.transcript_segments;
CREATE POLICY transcript_segments_insert ON public.transcript_segments
  FOR INSERT TO authenticated
  WITH CHECK (transcript_id IN (
    SELECT t.id FROM public.meeting_transcripts t
    WHERE t.meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff()))
  ));

DROP POLICY IF EXISTS transcript_segments_delete ON public.transcript_segments;
CREATE POLICY transcript_segments_delete ON public.transcript_segments
  FOR DELETE TO authenticated
  USING (transcript_id IN (
    SELECT t.id FROM public.meeting_transcripts t
    WHERE t.meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff()))
  ));

-- meeting_summaries: same pattern
DROP POLICY IF EXISTS meeting_summaries_select ON public.meeting_summaries;
CREATE POLICY meeting_summaries_select ON public.meeting_summaries
  FOR SELECT TO authenticated
  USING (meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())));

DROP POLICY IF EXISTS meeting_summaries_insert ON public.meeting_summaries;
CREATE POLICY meeting_summaries_insert ON public.meeting_summaries
  FOR INSERT TO authenticated
  WITH CHECK (meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())));

DROP POLICY IF EXISTS meeting_summaries_update ON public.meeting_summaries;
CREATE POLICY meeting_summaries_update ON public.meeting_summaries
  FOR UPDATE TO authenticated
  USING (meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())))
  WITH CHECK (meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())));

DROP POLICY IF EXISTS meeting_summaries_delete ON public.meeting_summaries;
CREATE POLICY meeting_summaries_delete ON public.meeting_summaries
  FOR DELETE TO authenticated
  USING (meeting_id IN (SELECT id FROM public.meetings m WHERE m.business_id IN (SELECT business_id FROM public.get_current_staff())));

-- meeting_decisions + meeting_actions: business_id direct
DROP POLICY IF EXISTS meeting_decisions_select ON public.meeting_decisions;
CREATE POLICY meeting_decisions_select ON public.meeting_decisions
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_decisions_insert ON public.meeting_decisions;
CREATE POLICY meeting_decisions_insert ON public.meeting_decisions
  FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_decisions_update ON public.meeting_decisions;
CREATE POLICY meeting_decisions_update ON public.meeting_decisions
  FOR UPDATE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_decisions_delete ON public.meeting_decisions;
CREATE POLICY meeting_decisions_delete ON public.meeting_decisions
  FOR DELETE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_actions_select ON public.meeting_actions;
CREATE POLICY meeting_actions_select ON public.meeting_actions
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_actions_insert ON public.meeting_actions;
CREATE POLICY meeting_actions_insert ON public.meeting_actions
  FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_actions_update ON public.meeting_actions;
CREATE POLICY meeting_actions_update ON public.meeting_actions
  FOR UPDATE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_actions_delete ON public.meeting_actions;
CREATE POLICY meeting_actions_delete ON public.meeting_actions
  FOR DELETE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_meeting_transcripts_updated_at ON public.meeting_transcripts;
CREATE TRIGGER trg_meeting_transcripts_updated_at
  BEFORE UPDATE ON public.meeting_transcripts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_summaries_updated_at ON public.meeting_summaries;
CREATE TRIGGER trg_meeting_summaries_updated_at
  BEFORE UPDATE ON public.meeting_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_decisions_updated_at ON public.meeting_decisions;
CREATE TRIGGER trg_meeting_decisions_updated_at
  BEFORE UPDATE ON public.meeting_decisions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_actions_updated_at ON public.meeting_actions;
CREATE TRIGGER trg_meeting_actions_updated_at
  BEFORE UPDATE ON public.meeting_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 7. RPCs (SECURITY DEFINER, membership-guarded — sections 9, 11, 32, 34)
-- ============================================================================

-- save_transcript: called by the transcribe-audio edge function (service role)
-- OR by an authenticated host. Stores the full transcript + segments.
CREATE OR REPLACE FUNCTION public.save_transcript(
  p_meeting_id UUID,
  p_full_text TEXT,
  p_language TEXT DEFAULT 'en',
  p_duration_seconds INT DEFAULT NULL,
  p_segments JSONB DEFAULT NULL,
  p_summary TEXT DEFAULT NULL,
  p_key_points TEXT[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_transcript_id UUID;
  v_summary_id UUID;
  v_seg JSONB;
  v_segment_index INT := 0;
BEGIN
  -- If called by service role (edge fn), trust the meeting_id.
  -- If called by authenticated, verify membership.
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;

  -- Create transcript
  INSERT INTO public.meeting_transcripts (meeting_id, full_text, language, duration_seconds, word_count, processing_status)
  VALUES (p_meeting_id, p_full_text, p_language, p_duration_seconds,
    array_length(regexp_split_to_array(p_full_text, '\s+'), 1), 'completed')
  RETURNING id INTO v_transcript_id;

  -- Create segments if provided
  IF p_segments IS NOT NULL THEN
    FOR v_seg IN SELECT * FROM jsonb_array_elements(p_segments) LOOP
      INSERT INTO public.transcript_segments (transcript_id, segment_index, start_time_ms, end_time_ms, text, speaker, confidence)
      VALUES (v_transcript_id, v_segment_index,
        COALESCE((v_seg->>'start_time_ms')::bigint, 0),
        COALESCE((v_seg->>'end_time_ms')::bigint, 0),
        v_seg->>'text',
        NULLIF(v_seg->>'speaker', ''),
        NULLIF((v_seg->>'confidence')::real, NULL));
      v_segment_index := v_segment_index + 1;
    END LOOP;
  END IF;

  -- Create summary if provided
  IF p_summary IS NOT NULL AND p_summary != '' THEN
    INSERT INTO public.meeting_summaries (meeting_id, transcript_id, summary, key_points, processing_status)
    VALUES (p_meeting_id, v_transcript_id, p_summary, p_key_points, 'completed')
    RETURNING id INTO v_summary_id;
  END IF;

  -- Update meeting transcript_status
  UPDATE public.meetings SET transcript_status = 'completed' WHERE id = p_meeting_id;

  -- Telemetry
  BEGIN
    PERFORM public.emit_business_event(
      COALESCE(v_staff.business_id, (SELECT business_id FROM public.meetings WHERE id = p_meeting_id)),
      'meeting_transcribed',
      p_meeting_id,
      jsonb_build_object('transcript_id', v_transcript_id, 'segments', v_segment_index)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'transcript_id', v_transcript_id,
    'summary_id', v_summary_id
  );
END;
$$;

-- save_meeting_decisions: stores extracted decisions + actions (from GPT-4).
-- Called by the edge function or the host after reviewing the transcript.
CREATE OR REPLACE FUNCTION public.save_meeting_decisions(
  p_meeting_id UUID,
  p_decisions JSONB DEFAULT NULL,
  p_actions JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_business_id UUID;
  v_dec_count INT := 0;
  v_act_count INT := 0;
  v_dec JSONB;
  v_act JSONB;
BEGIN
  SELECT business_id INTO v_business_id FROM public.meetings WHERE id = p_meeting_id;
  IF v_business_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Meeting not found');
  END IF;

  -- Decisions
  IF p_decisions IS NOT NULL THEN
    FOR v_dec IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
      INSERT INTO public.meeting_decisions (business_id, meeting_id, decision_text, rationale, timestamp_ms, status)
      VALUES (v_business_id, p_meeting_id,
        v_dec->>'text', v_dec->>'rationale',
        NULLIF((v_dec->>'timestamp_ms')::bigint, NULL),
        COALESCE(v_dec->>'status', 'decided'));
      v_dec_count := v_dec_count + 1;
    END LOOP;
  END IF;

  -- Actions
  IF p_actions IS NOT NULL THEN
    FOR v_act IN SELECT * FROM jsonb_array_elements(p_actions) LOOP
      INSERT INTO public.meeting_actions (business_id, meeting_id, action_text, assignee_id, due_date, priority, status, timestamp_ms)
      VALUES (v_business_id, p_meeting_id,
        v_act->>'text',
        NULLIF(v_act->>'assignee_id', '')::uuid,
        NULLIF(v_act->>'due_date', '')::date,
        COALESCE(v_act->>'priority', 'medium'),
        COALESCE(v_act->>'status', 'open'),
        NULLIF(v_act->>'timestamp_ms', '')::bigint);
      v_act_count := v_act_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('decisions_saved', v_dec_count, 'actions_saved', v_act_count);
END;
$$;

-- create_action_task: links a meeting action to a REAL task (004).
-- The task is the execution; the meeting_action is the context link.
CREATE OR REPLACE FUNCTION public.create_action_task(
  p_action_id UUID,
  p_title TEXT,
  p_assignee_id UUID DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Create the REAL task (004)
  INSERT INTO public.tasks (business_id, title, assignee_id, due_date, priority, status, created_by)
  VALUES (v_action.business_id, p_title, p_assignee_id, p_due_date, p_priority, 'todo', v_staff.id)
  RETURNING id INTO v_task_id;

  -- Link the meeting action to the task
  UPDATE public.meeting_actions
  SET task_id = v_task_id, status = 'in_progress'
  WHERE id = p_action_id;

  -- Telemetry
  BEGIN
    PERFORM public.emit_business_event(
      v_staff.business_id, 'meeting_action_to_task',
      v_task_id, jsonb_build_object('action_id', p_action_id, 'meeting_id', v_action.meeting_id)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_task_id;
END;
$$;

-- get_meeting_intelligence: returns the full transcript + summary + decisions
-- + actions for a meeting in ONE call (the §6 "meeting intelligence" view).
CREATE OR REPLACE FUNCTION public.get_meeting_intelligence(
  p_meeting_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_meeting RECORD;
  v_transcript JSONB;
  v_segments JSONB;
  v_summary JSONB;
  v_decisions JSONB;
  v_actions JSONB;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id;

  IF v_meeting.business_id IS NULL OR v_meeting.business_id != v_staff.business_id THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'full_text', t.full_text, 'language', t.language,
    'duration_seconds', t.duration_seconds, 'word_count', t.word_count,
    'created_at', t.created_at
  )), '[]'::jsonb) INTO v_transcript
  FROM public.meeting_transcripts t WHERE t.meeting_id = p_meeting_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'segment_index', s.segment_index,
    'start_time_ms', s.start_time_ms, 'end_time_ms', s.end_time_ms,
    'text', s.text, 'speaker', s.speaker
  ) ORDER BY s.segment_index), '[]'::jsonb) INTO v_segments
  FROM public.transcript_segments s
  WHERE s.transcript_id IN (SELECT id FROM public.meeting_transcripts WHERE meeting_id = p_meeting_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', sm.id, 'summary', sm.summary, 'key_points', sm.key_points
  )), '[]'::jsonb) INTO v_summary
  FROM public.meeting_summaries sm WHERE sm.meeting_id = p_meeting_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id, 'decision_text', d.decision_text, 'rationale', d.rationale,
    'decided_by', d.decided_by, 'timestamp_ms', d.timestamp_ms, 'status', d.status
  )), '[]'::jsonb) INTO v_decisions
  FROM public.meeting_decisions d WHERE d.meeting_id = p_meeting_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'action_text', a.action_text, 'assignee_id', a.assignee_id,
    'due_date', a.due_date, 'priority', a.priority, 'status', a.status,
    'task_id', a.task_id, 'timestamp_ms', a.timestamp_ms
  )), '[]'::jsonb) INTO v_actions
  FROM public.meeting_actions a WHERE a.meeting_id = p_meeting_id;

  RETURN jsonb_build_object(
    'meeting', jsonb_build_object(
      'id', v_meeting.id, 'title', v_meeting.title,
      'status', v_meeting.status, 'transcript_status', v_meeting.transcript_status
    ),
    'transcripts', v_transcript,
    'segments', v_segments,
    'summaries', v_summary,
    'decisions', v_decisions,
    'actions', v_actions
  );
END;
$$;

-- search_transcripts: full-text search across meeting transcripts (section 6).
CREATE OR REPLACE FUNCTION public.search_transcripts(
  p_query TEXT,
  p_limit INT DEFAULT 20
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_results JSONB;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'segment_id', s.id, 'text', s.text, 'start_time_ms', s.start_time_ms,
    'meeting_id', t.meeting_id, 'meeting_title', m.title,
    'transcript_id', s.transcript_id
  )), '[]'::jsonb) INTO v_results
  FROM public.transcript_segments s
  JOIN public.meeting_transcripts t ON s.transcript_id = t.id
  JOIN public.meetings m ON t.meeting_id = m.id
  WHERE m.business_id = v_staff.business_id
    AND to_tsvector('english', s.text) @@ plainto_tsquery('english', p_query)
  LIMIT p_limit;

  RETURN v_results;
END;
$$;

-- ============================================================================
-- 8. Grants
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.meeting_transcripts, public.transcript_segments,
  public.meeting_summaries, public.meeting_decisions,
  public.meeting_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.meeting_transcripts, public.transcript_segments,
  public.meeting_summaries, public.meeting_decisions,
  public.meeting_actions TO service_role;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.save_transcript(UUID, TEXT, TEXT, INT, JSONB, TEXT, TEXT[]) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.save_transcript(UUID, TEXT, TEXT, INT, JSONB, TEXT, TEXT[]) TO service_role;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.save_meeting_decisions(UUID, JSONB, JSONB) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.save_meeting_decisions(UUID, JSONB, JSONB) TO service_role;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_action_task(UUID, TEXT, UUID, DATE, TEXT) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.get_meeting_intelligence(UUID) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.search_transcripts(TEXT, INT) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
