
DROP POLICY IF EXISTS order_templates_authenticated_read ON storage.objects;
CREATE POLICY order_templates_authenticated_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'order-templates'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_module_perm(auth.uid(), 'costing', 'view'::public.access_perm))
  );

DROP POLICY IF EXISTS rm_master_uploads_read_auth ON storage.objects;
CREATE POLICY rm_master_uploads_read_auth ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rm-master-uploads'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_module_perm(auth.uid(), 'raw_materials', 'view'::public.access_perm))
  );
