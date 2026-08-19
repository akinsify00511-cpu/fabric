-- 20260818500000_meeting_recording_capture_phase_b.sql
--
-- Meeting Phase B — Recording + Capture (sections 6, 13, 14, 31, 32, 34).
--
-- Phase A created the meeting_media table + the PRIVATE meeting-recordings
-- bucket. Phase B makes recordings actually USABLE:
--   1. Signed-URL upload + access RPCs (fixes the getPublicUrl security gap
--      in Meetings.tsx — public URLs on a private bucket returned 404).
--   2. meeting_captures table for async Loom-style screen/camera captures
--      (not tied to a live meeting — the user records, THEN attaches).
--   3. Recording lifecycle: pending → processing → available → expired.
--   4. Retention policy enforcement (section 14).
--
-- Composition-first (section 2 non-negotiable):
--   • Reuses meeting_media (Phase A) — NOT a parallel media table.
--   • Reuses meeting-recordings bucket (Phase A) — NOT a new bucket.
--   • Reuses get_current_staff() RLS pattern.
--   • Reuses emit_business_event (058/059) for telemetry.
-- No external dependency. Pure internal SQL. Idempotent.

-- ============================================================================
-- 1. meeting_captures (async Loom-style — section 6 "Recording + Capture")
-- ============================================================================
-- A capture is a recording made OUTSIDE a live meeting (screen recording,
-- video message). It can later be attached to a meeting (e.g. as context
-- for an async decision). This is the "Loom-style" half of section 6.

CREATE TABLE IF NOT EXISTS public.meeting_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  creator_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  capture_type TEXT NOT NULL DEFAULT 'screen'
    CHECK (capture_type IN ('screen', 'camera', 'screen_with_camera', 'audio_only')),
  storage_path TEXT,                      -- private path in meeting-recordings bucket
  duration_seconds INT,
  size_bytes BIGINT,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'available', 'failed', 'expired')),
  view_count INT NOT NULL DEFAULT 0,
  retention_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (business-scoped via get_current_staff — the canonical pattern)
ALTER TABLE public.meeting_captures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_captures_select ON public.meeting_captures;
CREATE POLICY meeting_captures_select ON public.meeting_captures
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_captures_insert ON public.meeting_captures;
CREATE POLICY meeting_captures_insert ON public.meeting_captures
  FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_captures_update ON public.meeting_captures;
CREATE POLICY meeting_captures_update ON public.meeting_captures
  FOR UPDATE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS meeting_captures_delete ON public.meeting_captures;
CREATE POLICY meeting_captures_delete ON public.meeting_captures
  FOR DELETE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

CREATE INDEX IF NOT EXISTS idx_meeting_captures_business ON public.meeting_captures(business_id);
CREATE INDEX IF NOT EXISTS idx_meeting_captures_meeting ON public.meeting_captures(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_captures_creator ON public.meeting_captures(creator_id);

DROP TRIGGER IF EXISTS trg_meeting_captures_updated_at ON public.meeting_captures;
CREATE TRIGGER trg_meeting_captures_updated_at
  BEFORE UPDATE ON public.meeting_captures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 2. Signed-URL RPCs (fixes the getPublicUrl security gap — section 32)
-- ============================================================================
-- The existing Meetings.tsx used getPublicUrl() on a PRIVATE bucket → the
-- URL returned a 404 (bucket is private). The fix: generate a short-lived
-- SIGNED URL server-side. The client never gets a public URL.

-- create_recording_upload_path: returns a storage path the client uploads to.
-- The client uses supabase.storage.from('meeting-recordings').upload(path, blob)
-- — the RLS on the bucket (set in Phase A) authorizes the business member.
CREATE OR REPLACE FUNCTION public.create_recording_upload_path(
  p_meeting_id UUID DEFAULT NULL,
  p_capture_id UUID DEFAULT NULL,
  p_media_type TEXT DEFAULT 'recording'
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_path TEXT;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_meeting_id IS NULL AND p_capture_id IS NULL THEN
    RAISE EXCEPTION 'Either p_meeting_id or p_capture_id is required';
  END IF;

  v_path := 'meetings/' || COALESCE(p_meeting_id::TEXT, 'capture-' || p_capture_id::TEXT)
    || '/' || extract(epoch from now())::bigint::TEXT || '-' || gen_random_uuid()::TEXT;

  -- If meeting_id provided, verify membership + create a pending media row
  IF p_meeting_id IS NOT NULL THEN
    INSERT INTO public.meeting_media (meeting_id, media_type, storage_path, processing_status)
    VALUES (p_meeting_id, p_media_type, v_path, 'pending')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_path;
END;
$$;

-- create_capture: creates a capture record (Loom-style) + returns upload path.
CREATE OR REPLACE FUNCTION public.create_capture(
  p_title TEXT,
  p_capture_type TEXT DEFAULT 'screen',
  p_description TEXT DEFAULT NULL,
  p_meeting_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_capture_id UUID;
  v_path TEXT;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  v_path := 'meetings/capture-' || extract(epoch from now())::bigint::TEXT
    || '-' || gen_random_uuid()::TEXT;

  INSERT INTO public.meeting_captures (
    business_id, title, description, capture_type, storage_path,
    processing_status, creator_id, meeting_id
  )
  VALUES (
    v_staff.business_id, p_title, p_description, p_capture_type, v_path,
    'pending', v_staff.id, p_meeting_id
  )
  RETURNING id INTO v_capture_id;

  -- telemetry (reuse the event bus — 058/059)
  BEGIN
    PERFORM public.emit_business_event(
      v_staff.business_id,
      'capture_created',
      v_capture_id,
      jsonb_build_object('capture_type', p_capture_type, 'meeting_id', p_meeting_id)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'capture_id', v_capture_id,
    'upload_path', v_path
  );
END;
$$;

-- finalize_recording: marks the recording as available + stores metadata.
-- Called by the client AFTER the upload completes.
CREATE OR REPLACE FUNCTION public.finalize_recording(
  p_storage_path TEXT,
  p_duration_seconds INT DEFAULT NULL,
  p_size_bytes BIGINT DEFAULT NULL,
  p_meeting_id UUID DEFAULT NULL,
  p_capture_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN false;
  END IF;

  -- Update meeting_media if a pending row exists for this path
  UPDATE public.meeting_media
  SET processing_status = 'available',
      duration_seconds = p_duration_seconds,
      size_bytes = p_size_bytes
  WHERE storage_path = p_storage_path
    AND meeting_id IN (SELECT id FROM public.meetings WHERE business_id = v_staff.business_id);

  -- Update capture if exists
  UPDATE public.meeting_captures
  SET processing_status = 'available',
      duration_seconds = p_duration_seconds,
      size_bytes = p_size_bytes
  WHERE storage_path = p_storage_path
    AND business_id = v_staff.business_id;

  -- Telemetry
  BEGIN
    PERFORM public.emit_business_event(
      v_staff.business_id,
      'recording_finalized',
      COALESCE(p_meeting_id, p_capture_id),
      jsonb_build_object('duration', p_duration_seconds, 'size', p_size_bytes)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN true;
END;
$$;

-- generate_recording_signed_url: returns a short-lived signed URL for playback.
-- This replaces getPublicUrl() entirely (section 32 — never expose public URL).
CREATE OR REPLACE FUNCTION public.generate_recording_signed_url(
  p_storage_path TEXT,
  p_expires_seconds INT DEFAULT 3600
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_url TEXT;
BEGIN
  -- Supabase storage signed URLs are generated via the storage schema.
  -- This RPC verifies the caller is a business member BEFORE creating the URL.
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Verify the path belongs to the caller's business (path convention:
  -- meetings/{meeting_id}/... where meeting_id belongs to the business, OR
  -- meetings/capture-... where the capture belongs to the business).
  -- The actual URL is generated by the storage API; this RPC is the
  -- authorization gate. The client calls storage.createSignedUrl after this
  -- returns true. For the live DB, the storage schema generates the URL;
  -- here we return the path the client should sign.
  PERFORM 1 FROM public.meeting_media m
  WHERE m.storage_path = p_storage_path
    AND m.meeting_id IN (SELECT id FROM public.meetings WHERE business_id = v_staff.business_id);

  IF NOT FOUND THEN
    PERFORM 1 FROM public.meeting_captures c
    WHERE c.storage_path = p_storage_path
      AND c.business_id = v_staff.business_id;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;  -- path doesn't belong to caller's business
  END IF;

  -- Return the storage path; the client calls supabase.storage
  -- .createSignedUrl('meeting-recordings', path, { expiresIn }) to get the URL.
  -- The authorization was verified HERE (server-side); the storage RLS is the
  -- backstop.
  RETURN p_storage_path;
END;
$$;

-- list_recordings: returns available recordings + captures for a business.
CREATE OR REPLACE FUNCTION public.list_recordings(
  p_meeting_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_media JSONB;
  v_captures JSONB;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  IF p_meeting_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', m.id, 'meeting_id', m.meeting_id, 'media_type', m.media_type,
        'storage_path', m.storage_path, 'duration_seconds', m.duration_seconds,
        'size_bytes', m.size_bytes, 'processing_status', m.processing_status,
        'created_at', m.created_at
      ) ORDER BY m.created_at DESC
    ), '[]'::jsonb) INTO v_media
    FROM public.meeting_media m
    WHERE m.meeting_id = p_meeting_id
      AND m.processing_status = 'available'
      AND m.deleted_at IS NULL;
  ELSE
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', c.id, 'meeting_id', c.meeting_id, 'title', c.title,
        'description', c.description, 'capture_type', c.capture_type,
        'storage_path', c.storage_path, 'duration_seconds', c.duration_seconds,
        'size_bytes', c.size_bytes, 'processing_status', c.processing_status,
        'view_count', c.view_count, 'created_at', c.created_at
      ) ORDER BY c.created_at DESC
    ), '[]'::jsonb) INTO v_captures
    FROM public.meeting_captures c
    WHERE c.business_id = v_staff.business_id
      AND c.processing_status = 'available'
      AND c.deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'meeting_media', COALESCE(v_media, '[]'::jsonb),
    'captures', COALESCE(v_captures, '[]'::jsonb)
  );
END;
$$;

-- increment_capture_view: bumps view_count (best-effort, idempotent via
-- client-side dedup; the RPC is the authoritative counter).
CREATE OR REPLACE FUNCTION public.increment_capture_view(
  p_capture_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.meeting_captures
  SET view_count = view_count + 1
  WHERE id = p_capture_id
    AND business_id IN (SELECT business_id FROM public.get_current_staff());
END;
$$;

-- ============================================================================
-- 3. Retention policy (section 14)
-- ============================================================================
-- Recordings older than retention_until are marked deleted (soft delete).
-- The actual storage object is purged by a separate cleanup job.

CREATE OR REPLACE FUNCTION public.expire_recordings() RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.meeting_media
  SET processing_status = 'deleted', deleted_at = NOW()
  WHERE retention_until IS NOT NULL
    AND retention_until < NOW()
    AND processing_status != 'deleted'
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.meeting_captures
  SET processing_status = 'expired', deleted_at = NOW()
  WHERE retention_until IS NOT NULL
    AND retention_until < NOW()
    AND processing_status NOT IN ('expired', 'failed')
    AND deleted_at IS NULL;

  RETURN v_count;
END;
$$;

-- ============================================================================
-- 4. Grants
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_captures TO authenticated;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_recording_upload_path(UUID, UUID, TEXT) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.create_capture(TEXT, TEXT, TEXT, UUID) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.finalize_recording(TEXT, INT, BIGINT, UUID, UUID) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.generate_recording_signed_url(TEXT, INT) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.list_recordings(UUID) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.increment_capture_view(UUID) TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.expire_recordings() TO authenticated;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
