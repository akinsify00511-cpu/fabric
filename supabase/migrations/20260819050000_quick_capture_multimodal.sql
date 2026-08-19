-- 20260819050000_quick_capture_multimodal.sql
--
-- Quick Capture Multimodal — Clip / Mic / Image (master checklist item 3).
--
-- The AICapture surface previously had Mic / Attach / Image buttons with no
-- handlers — multimodal capture did not exist. This migration adds the
-- backend for all three:
--   1. capture_attachments table — the attachment metadata + the
--      capture↔attachment relationship (event_id) + optional direct
--      entity relationship (entity_type/entity_id).
--   2. capture-attachments storage bucket (PRIVATE — signed URLs only,
--      never getPublicUrl — §32).
--   3. Signed-path upload RPCs (mirrors the meeting Phase B pattern):
--      create_capture_attachment (validates kind/mime/size server-side,
--      returns the private upload path), finalize_capture_attachment,
--      generate_capture_attachment_url (the membership-guarded auth gate),
--      link_capture_to_event / link_capture_to_entity,
--      save_capture_transcript / save_capture_ocr (written by the
--      capture-process edge function + the client for edited transcripts),
--      list_capture_attachments, delete_capture_attachment.
--
-- Composition-first (§2 non-negotiable):
--   • Attachments link to business_events (058) via event_id — the capture
--     IS a business event; the attachment is evidence on it. NOT a parallel
--     event system.
--   • Storage path convention captures/{business_id}/... so storage RLS is
--     a TEXT segment comparison (no uuid cast → malformed paths can't error
--     the policy).
--   • Reuses get_current_staff() RLS helper (001), update_updated_at (007).
-- No external dependency in this migration. Idempotent.

-- ============================================================================
-- 0. FIX: business_events missing updated_at (found by the local pg15 smoke
-- ============================================================================
-- test of this migration). 058 attaches the business_events_updated_at
-- trigger (update_updated_at → NEW.updated_at := NOW()) but never adds the
-- column — so EVERY UPDATE on business_events (including
-- process_business_event's `SET processed = FALSE`, which runs inside EVERY
-- emit_business_event) raises "record new has no field updated_at" and the
-- whole event bus errors. The trigger's intent is the column; add it.

ALTER TABLE public.business_events
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- 1. capture_attachments
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.capture_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('file', 'image', 'audio')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT,
  storage_path TEXT NOT NULL,             -- private path in capture-attachments bucket
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'failed')),
  -- Image metadata (client-reported after decode)
  width INT,
  height INT,
  -- Audio metadata
  duration_seconds INT,
  -- Mic flow: transcript (Whisper or live speech) + its lifecycle
  transcript TEXT,
  transcript_status TEXT CHECK (transcript_status IN ('pending', 'completed', 'failed')),
  -- Image flow: OCR extraction {vendor, amount, currency, date, line_items, confidence}
  ocr JSONB,
  ocr_status TEXT CHECK (ocr_status IN ('pending', 'completed', 'failed')),
  -- Capture ↔ attachment relationship: the business event this evidence
  -- belongs to (linked after emit_business_event returns the event id).
  event_id UUID REFERENCES public.business_events(id) ON DELETE SET NULL,
  -- Optional direct entity relationship (the deal/invoice the file is about).
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.capture_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS capture_attachments_select ON public.capture_attachments;
CREATE POLICY capture_attachments_select ON public.capture_attachments
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS capture_attachments_insert ON public.capture_attachments;
CREATE POLICY capture_attachments_insert ON public.capture_attachments
  FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS capture_attachments_update ON public.capture_attachments;
CREATE POLICY capture_attachments_update ON public.capture_attachments
  FOR UPDATE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.get_current_staff()));

DROP POLICY IF EXISTS capture_attachments_delete ON public.capture_attachments;
CREATE POLICY capture_attachments_delete ON public.capture_attachments
  FOR DELETE TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

CREATE INDEX IF NOT EXISTS idx_capture_attachments_business
  ON public.capture_attachments(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capture_attachments_event
  ON public.capture_attachments(event_id) WHERE event_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_capture_attachments_updated_at ON public.capture_attachments;
CREATE TRIGGER trg_capture_attachments_updated_at
  BEFORE UPDATE ON public.capture_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 2. capture-attachments storage bucket (PRIVATE — §32)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('capture-attachments', 'capture-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: the path convention is captures/{business_id}/{attachment_id}/{file}.
-- TEXT comparison of the business segment — no uuid cast, so a malformed path
-- simply fails the check instead of erroring the query.
DROP POLICY IF EXISTS "capture_attachments_business_read" ON storage.objects;
CREATE POLICY "capture_attachments_business_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'capture-attachments'
    AND split_part(name, '/', 2) IN (
      SELECT business_id::text FROM public.get_current_staff()
    )
  );

DROP POLICY IF EXISTS "capture_attachments_business_write" ON storage.objects;
CREATE POLICY "capture_attachments_business_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'capture-attachments'
    AND split_part(name, '/', 2) IN (
      SELECT business_id::text FROM public.get_current_staff()
    )
  );

DROP POLICY IF EXISTS "capture_attachments_business_update" ON storage.objects;
CREATE POLICY "capture_attachments_business_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'capture-attachments'
    AND split_part(name, '/', 2) IN (
      SELECT business_id::text FROM public.get_current_staff()
    )
  );

DROP POLICY IF EXISTS "capture_attachments_business_delete" ON storage.objects;
CREATE POLICY "capture_attachments_business_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'capture-attachments'
    AND split_part(name, '/', 2) IN (
      SELECT business_id::text FROM public.get_current_staff()
    )
  );

-- ============================================================================
-- 3. RPCs (all SECURITY DEFINER + membership-guarded)
-- ============================================================================

-- Server-side validation caps. The client validates too (UX), but the RPC is
-- the authority (§28 — no client-side security decisions).
--   image: ≤ 15MB, image/* only
--   audio: ≤ 50MB, audio/* only
--   file:  ≤ 25MB, document allowlist (pdf/office/csv/txt/images)
CREATE OR REPLACE FUNCTION public.create_capture_attachment(
  p_kind TEXT,
  p_file_name TEXT,
  p_mime_type TEXT,
  p_size_bytes BIGINT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_id UUID;
  v_path TEXT;
  v_max_bytes BIGINT;
  v_safe_name TEXT;
  v_allowed BOOLEAN;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  IF p_kind NOT IN ('file', 'image', 'audio') THEN
    RETURN jsonb_build_object('error', 'Invalid attachment kind');
  END IF;

  -- Per-kind size caps
  v_max_bytes := CASE p_kind
    WHEN 'image' THEN 15728640   -- 15MB
    WHEN 'audio' THEN 52428800   -- 50MB
    ELSE 26214400                -- 25MB
  END;
  IF p_size_bytes IS NOT NULL AND p_size_bytes > v_max_bytes THEN
    RETURN jsonb_build_object('error', 'File too large', 'max_bytes', v_max_bytes);
  END IF;

  -- Per-kind mime allowlist
  v_allowed := CASE p_kind
    WHEN 'image' THEN p_mime_type LIKE 'image/%'
    WHEN 'audio' THEN p_mime_type LIKE 'audio/%' OR p_mime_type = 'video/webm' -- MediaRecorder webm
    ELSE p_mime_type IN (
      'application/pdf', 'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip'
    ) OR p_mime_type LIKE 'image/%'
  END;
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('error', 'File type not allowed', 'mime_type', p_mime_type);
  END IF;

  v_id := gen_random_uuid();
  -- Strip path separators + control chars from the client-supplied name.
  v_safe_name := regexp_replace(coalesce(nullif(p_file_name, ''), 'file'), '[/\\\x00-\x1f]', '_', 'g');
  v_path := 'captures/' || v_staff.business_id::text || '/' || v_id::text || '/' || v_safe_name;

  INSERT INTO public.capture_attachments (
    id, business_id, staff_id, kind, file_name, mime_type, size_bytes, storage_path, status
  ) VALUES (
    v_id, v_staff.business_id, v_staff.id, p_kind, p_file_name, p_mime_type, p_size_bytes, v_path, 'pending'
  );

  RETURN jsonb_build_object(
    'attachment_id', v_id,
    'storage_path', v_path,
    'max_bytes', v_max_bytes
  );
END;
$$;

-- finalize_capture_attachment: after the storage upload succeeds, mark the
-- attachment available + record client-decoded metadata (image dimensions,
-- audio duration). Only the uploader's own pending row can be finalized.
CREATE OR REPLACE FUNCTION public.finalize_capture_attachment(
  p_attachment_id UUID,
  p_size_bytes BIGINT DEFAULT NULL,
  p_width INT DEFAULT NULL,
  p_height INT DEFAULT NULL,
  p_duration_seconds INT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.capture_attachments
  SET status = 'available',
      size_bytes = coalesce(p_size_bytes, size_bytes),
      width = coalesce(p_width, width),
      height = coalesce(p_height, height),
      duration_seconds = coalesce(p_duration_seconds, duration_seconds)
  WHERE id = p_attachment_id
    AND business_id = v_staff.business_id
    AND status = 'pending';

  RETURN FOUND;
END;
$$;

-- generate_capture_attachment_url: the authorization gate (§32). Verifies
-- business membership, then returns the private storage_path. The client then
-- calls supabase.storage.createSignedUrl (short-lived, revocable). NEVER a
-- public URL.
CREATE OR REPLACE FUNCTION public.generate_capture_attachment_url(
  p_attachment_id UUID
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
    RETURN NULL;
  END IF;

  SELECT storage_path INTO v_path
  FROM public.capture_attachments
  WHERE id = p_attachment_id
    AND business_id = v_staff.business_id
    AND status = 'available';

  RETURN v_path; -- NULL if not found / not a member / not available
END;
$$;

-- link_capture_to_event: attach the evidence to the business event raised by
-- the capture (emit_business_event returns the event id). Both rows must
-- belong to the caller's business — a cross-business link is denied.
CREATE OR REPLACE FUNCTION public.link_capture_to_event(
  p_attachment_id UUID,
  p_event_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_event_business UUID;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT business_id INTO v_event_business
  FROM public.business_events
  WHERE id = p_event_id;
  IF v_event_business IS NULL OR v_event_business <> v_staff.business_id THEN
    RETURN FALSE;
  END IF;

  UPDATE public.capture_attachments
  SET event_id = p_event_id
  WHERE id = p_attachment_id
    AND business_id = v_staff.business_id;

  RETURN FOUND;
END;
$$;

-- link_capture_to_entity: optional direct entity relationship (the deal /
-- invoice / product the attachment is about).
CREATE OR REPLACE FUNCTION public.link_capture_to_entity(
  p_attachment_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.capture_attachments
  SET entity_type = p_entity_type, entity_id = p_entity_id
  WHERE id = p_attachment_id
    AND business_id = v_staff.business_id;

  RETURN FOUND;
END;
$$;

-- save_capture_transcript: written by the capture-process edge fn (Whisper)
-- or by the client when the user edits the transcript. The edit IS the
-- transcript of record (human verification is the ground truth).
CREATE OR REPLACE FUNCTION public.save_capture_transcript(
  p_attachment_id UUID,
  p_transcript TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.capture_attachments
  SET transcript = p_transcript,
      transcript_status = 'completed'
  WHERE id = p_attachment_id
    AND business_id = v_staff.business_id;

  RETURN FOUND;
END;
$$;

-- save_capture_ocr: written by the capture-process edge fn after GPT-4o-mini
-- vision extraction. The OCR result is advisory evidence — the human
-- confirms/edits before it becomes a capture (§22 anti-fabrication: the
-- extraction prompt says "If you cannot identify the field, use null").
CREATE OR REPLACE FUNCTION public.save_capture_ocr(
  p_attachment_id UUID,
  p_ocr JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.capture_attachments
  SET ocr = p_ocr,
      ocr_status = 'completed'
  WHERE id = p_attachment_id
    AND business_id = v_staff.business_id;

  RETURN FOUND;
END;
$$;

-- list_capture_attachments: by event (evidence on a capture) or the
-- business's recent attachments.
CREATE OR REPLACE FUNCTION public.list_capture_attachments(
  p_event_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
) RETURNS SETOF public.capture_attachments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
BEGIN
  SELECT * INTO v_staff FROM public.get_current_staff() LIMIT 1;
  IF v_staff.business_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ca.*
  FROM public.capture_attachments ca
  WHERE ca.business_id = v_staff.business_id
    AND (p_event_id IS NULL OR ca.event_id = p_event_id)
  ORDER BY ca.created_at DESC
  LIMIT LEAST(p_limit, 200);
END;
$$;

-- delete_capture_attachment: removes the row and returns the storage path so
-- the client can remove the object via the storage API (storage RLS restricts
-- the delete to the business). Membership-guarded.
CREATE OR REPLACE FUNCTION public.delete_capture_attachment(
  p_attachment_id UUID
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
    RETURN NULL;
  END IF;

  DELETE FROM public.capture_attachments
  WHERE id = p_attachment_id
    AND business_id = v_staff.business_id
  RETURNING storage_path INTO v_path;

  RETURN v_path; -- NULL if not found / not a member
END;
$$;

-- Grants (authenticated only — never anon; attachments are business data).
GRANT EXECUTE ON FUNCTION public.create_capture_attachment(TEXT, TEXT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_capture_attachment(UUID, BIGINT, INT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_capture_attachment_url(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_capture_to_event(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_capture_to_entity(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_capture_transcript(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_capture_ocr(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_capture_attachments(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_capture_attachment(UUID) TO authenticated;

COMMENT ON TABLE public.capture_attachments IS
  'Quick Capture multimodal evidence (checklist item 3). Clip/file, mic audio, and image attachments linked to business_events (event_id) with optional direct entity links. Private bucket; signed-URL access only (§32).';
