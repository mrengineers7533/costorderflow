-- Allow any authenticated user who can view the parent BOQ (via boqs RLS/has_doc_access)
-- to read item attachment files. Read-only; upload/delete policies unchanged.
DROP POLICY IF EXISTS "Auth read own boq-item-docs" ON storage.objects;

CREATE POLICY "Read boq-item-docs when BOQ visible"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'boq-item-docs'
  AND (
    owner = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.boqs b
      WHERE b.id::text = split_part(storage.objects.name, '/', 1)
        AND (
          b.user_id = auth.uid()
          OR has_doc_access(auth.uid(), 'boq'::doc_kind, b.id, 'view'::access_perm)
        )
    )
  )
);