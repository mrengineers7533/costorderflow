
-- Fix: restrict boq_item_attachments SELECT to BOQ owner or admin
DROP POLICY IF EXISTS "View attachments for accessible BOQs" ON public.boq_item_attachments;
CREATE POLICY "View own boq item attachments or admin"
ON public.boq_item_attachments
FOR SELECT
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.boqs b
    WHERE b.id = boq_item_attachments.boq_id
      AND b.user_id = auth.uid()
  )
);

-- Fix: restrict notification_recipients SELECT to admins only
DROP POLICY IF EXISTS "nr_select_auth" ON public.notification_recipients;
CREATE POLICY "nr_select_admin"
ON public.notification_recipients
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Fix: restrict storage SELECT on boq-item-docs to owner/admin (anon token policy already exists)
DROP POLICY IF EXISTS "Auth read boq-item-docs" ON storage.objects;
CREATE POLICY "Auth read own boq-item-docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'boq-item-docs'
  AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
);
