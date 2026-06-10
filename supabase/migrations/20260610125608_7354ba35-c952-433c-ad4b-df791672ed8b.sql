
CREATE POLICY "req_uploads_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'requisition-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "req_uploads_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'requisition-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "req_uploads_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'requisition-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "req_uploads_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'requisition-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
