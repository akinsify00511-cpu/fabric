-- Migration: 20260822141000 (renumbered from 20260822140000 — collision with contract_scan_extension)
-- Governance meeting scheduling — a 9-argument overload of the canonical
-- create_meeting RPC (20260818400000) adding p_board_committee_id so the
-- Governance tab can schedule full-board (NULL) or committee meetings through
-- the same lifecycle (host participant + join token), no parallel system.

-- Legacy schemas (e.g. the 998 hand-crafted meetings table) carry legacy
-- NOT NULL date/start_time/end_time columns that the phase-A extended
-- scheduled_start/scheduled_end columns superseded. Drop the legacy NOT
-- NULLs so the canonical lifecycle RPC works against either schema shape.
ALTER TABLE public.meetings ALTER COLUMN date DROP NOT NULL;
ALTER TABLE public.meetings ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE public.meetings ALTER COLUMN end_time DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_meeting(
  p_business_id UUID,
  p_title TEXT,
  p_scheduled_start TIMESTAMPTZ DEFAULT NULL,
  p_scheduled_end TIMESTAMPTZ DEFAULT NULL,
  p_meeting_type TEXT DEFAULT 'internal',
  p_visibility TEXT DEFAULT 'business',
  p_description TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_board_committee_id UUID DEFAULT NULL
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
  IF NULLIF(p_business_id::TEXT, '') IS NULL OR NULLIF(p_title, '') IS NULL THEN
    RAISE EXCEPTION 'business_id and title are required.' USING ERRCODE = '22023';
  END IF;

  SELECT cs.id INTO v_staff_id
  FROM public.get_current_staff() cs
  WHERE cs.business_id = p_business_id
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Not a member of this business.' USING ERRCODE = '42501';
  END IF;

  IF p_board_committee_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.board_committees bc
       WHERE bc.id = p_board_committee_id AND bc.business_id = p_business_id
       AND bc.is_active
     ) THEN
    RAISE EXCEPTION 'Committee not found in this business.' USING ERRCODE = '22023';
  END IF;

  -- Legacy 998 meetings schema carries `date DATE NOT NULL`; backfill it from
  -- the scheduled start (or today) so legacy-schematized DBs don't reject.
  INSERT INTO public.meetings (
    business_id, staff_id, created_by, title, description,
    meeting_type, scheduled_start, scheduled_end, visibility, status,
    board_committee_id, date
  ) VALUES (
    p_business_id, COALESCE(p_created_by, v_staff_id), COALESCE(p_created_by, v_staff_id),
    p_title, p_description, COALESCE(p_meeting_type, 'internal'), p_scheduled_start,
    p_scheduled_end, COALESCE(p_visibility, 'business'), 'scheduled',
    p_board_committee_id, COALESCE(p_scheduled_start::DATE, CURRENT_DATE)
  ) RETURNING id INTO v_meeting_id;

  v_token := encode(gen_random_bytes(24), 'hex');

  INSERT INTO public.meeting_participants (meeting_id, staff_id, user_id, role, status)
  VALUES (v_meeting_id, v_staff_id, auth.uid(), 'host', 'invited');

  PERFORM public.emit_business_event(
    p_business_id := p_business_id,
    p_event_type := 'meeting_created',
    p_entity_type := 'meeting',
    p_entity_id := v_meeting_id,
    p_payload := jsonb_build_object(
      'meeting_id', v_meeting_id,
      'title', p_title,
      'board_committee_id', p_board_committee_id,
      'governance', true
    ),
    p_actor_id := COALESCE(p_created_by, v_staff_id)
  );

  RETURN QUERY SELECT v_meeting_id, v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.create_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, UUID)
TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.create_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, UUID)
FROM anon;

COMMENT ON FUNCTION
  public.create_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, UUID) IS
  'Canonical meeting creation + governance linkage (board_committee_id NULL = full board). Reuses the meetings lifecycle; member of business required. 9-arg overload (8-arg from phase A remains).';
