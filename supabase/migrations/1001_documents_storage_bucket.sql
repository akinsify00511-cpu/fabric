-- Documents storage bucket for company_documents (Operations > Documents tab)
-- Allows authenticated staff to upload business documents and read them.

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documents_read_public" ON storage.objects;
CREATE POLICY "documents_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_insert_auth" ON storage.objects;
CREATE POLICY "documents_insert_auth" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_update_auth" ON storage.objects;
CREATE POLICY "documents_update_auth" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_delete_auth" ON storage.objects;
CREATE POLICY "documents_delete_auth" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'documents');
