-- ============================================================================
-- AI CAPTURE ATTACHMENTS
--
-- Private Storage bucket for files/images attached to AICapture events.
-- Object path contract:
--   {business_id}/captures/{uuid}-{safe_filename}
--
-- The capture event stores the private storage path in payload._attachments.
-- No public URLs are persisted or required.
-- ============================================================================

\set ON_ERROR_STOP on

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'capture-attachments',
  'capture-attachments',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Read/list/download access is restricted to authenticated staff belonging to
-- the business encoded in the first path segment.
DROP POLICY IF EXISTS "capture_attachments_business_read" ON storage.objects;
CREATE POLICY "capture_attachments_business_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'capture-attachments'
  AND (storage.foldername(name))[2] = 'captures'
  AND (storage.foldername(name))[1] IN (
    SELECT business_id::text FROM public.get_current_staff()
  )
);

-- New uploads are only accepted under the caller's own business/captures path.
DROP POLICY IF EXISTS "capture_attachments_business_insert" ON storage.objects;
CREATE POLICY "capture_attachments_business_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'capture-attachments'
  AND (storage.foldername(name))[2] = 'captures'
  AND (storage.foldername(name))[1] IN (
    SELECT business_id::text FROM public.get_current_staff()
  )
);

-- A rep may remove a file they attached to a capture in their own business.
-- Upsert is intentionally disabled in the client, so UPDATE permission is not
-- granted; this keeps replacement/overwrite outside the v1 access surface.
DROP POLICY IF EXISTS "capture_attachments_business_delete" ON storage.objects;
CREATE POLICY "capture_attachments_business_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'capture-attachments'
  AND (storage.foldername(name))[2] = 'captures'
  AND (storage.foldername(name))[1] IN (
    SELECT business_id::text FROM public.get_current_staff()
  )
);
