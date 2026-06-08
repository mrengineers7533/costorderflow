
-- Allow anon SELECT on boq-item-docs when an open design review exists for the parent BOQ.
-- Path convention: "{boq_id}/{boq_item_id}/{uuid}.{ext}" -> first segment is boq_id (uuid).
CREATE POLICY "Anon read boq-item-docs via open review"
  ON storage.objects FOR SELECT
  TO anon
  USING (
    bucket_id = 'boq-item-docs'
    AND EXISTS (
      SELECT 1 FROM public.boq_design_reviews r
      WHERE r.status = 'sent'
        AND r.expires_at > now()
        AND r.boq_id::text = split_part(storage.objects.name, '/', 1)
    )
  );
