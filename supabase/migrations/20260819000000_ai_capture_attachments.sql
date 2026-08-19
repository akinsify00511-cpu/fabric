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
-- CI portability note: the repository migration-test shim exposes only the
-- portable Storage bucket columns (id/name/public). Production Supabase may
-- additionally enforce size/MIME limits at the Storage service layer.
-- ============================================================================

\set ON_ERROR_STOP on

INSERT INTO storage.buckets (id, name, public)
VALUES ('capture-attachments', 'capture-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "capture_attachments_business_read" ON storage.objects;
CREATE POLICY "capture_attachments_business_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'capture-attachments'
  AND (storage.foldername(name))[2] = 'captures'
  AND (storage.foldername(name))[1] IN (
    SELECT business_id::text FROM public.get_current_staff()
  )
);

DROP POLICY IF EXISTS "capture_attachments_business_insert" ON storage.objects;
CREATE POLICY "capture_attachments_business_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'capture-attachments'
  AND (storage.foldername(name))[2] = 'captures'
  AND (storage.foldername(name))[1] IN (
    SELECT business_id::text FROM public.get_current_staff()
  )
);

DROP POLICY IF EXISTS "capture_attachments_business_delete" ON storage.objects;
CREATE POLICY "capture_attachments_business_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'capture-attachments'
  AND (storage.foldername(name))[2] = 'captures'
  AND (storage.foldername(name))[1] IN (
    SELECT business_id::text FROM public.get_current_staff()
  )
);
