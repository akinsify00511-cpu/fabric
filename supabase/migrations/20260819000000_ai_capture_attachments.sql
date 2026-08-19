-- ============================================================================
-- AI CAPTURE ATTACHMENTS
--
-- Private Storage bucket for files/images attached to AICapture events.
-- Object path contract:
--   {business_id}/captures/{uuid}-{safe_filename}
--
-- The capture event stores the private storage path in payload._attachments.
-- No public URLs are persisted or required.
--
-- The repository's migration CI uses a lightweight storage schema shim that
-- intentionally exposes only the portable bucket columns (id/name/public).
-- File-size and MIME restrictions are therefore enforced in the client for
-- v1; the production Supabase Storage service can additionally enforce them
-- through bucket configuration.
-- ============================================================================

\set ON_ERROR_STOP on

INSERT INTO storage.buckets (id, name, public)
VALUES (
  'capture-attachments',
  'capture-attachments',
  false
)
ON CONFLICT (id) DO UPDATE
SET public = false;

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