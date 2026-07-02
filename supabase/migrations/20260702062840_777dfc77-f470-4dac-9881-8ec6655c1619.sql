
-- 1) GRN invoice storage: tie access to parent purchase_order via has_doc_access
DROP POLICY IF EXISTS "grn invoices read" ON storage.objects;
DROP POLICY IF EXISTS "grn invoices insert" ON storage.objects;
DROP POLICY IF EXISTS "grn invoices update" ON storage.objects;
DROP POLICY IF EXISTS "grn invoices delete" ON storage.objects;

CREATE POLICY "grn invoices read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'grn-invoices'
    AND public.has_doc_access(
      auth.uid(),
      'purchase_order'::public.doc_kind,
      NULLIF(split_part(name, '/', 1), '')::uuid,
      'view'::public.access_perm
    )
  );

CREATE POLICY "grn invoices insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'grn-invoices'
    AND public.has_doc_access(
      auth.uid(),
      'purchase_order'::public.doc_kind,
      NULLIF(split_part(name, '/', 1), '')::uuid,
      'edit'::public.access_perm
    )
  );

CREATE POLICY "grn invoices update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'grn-invoices'
    AND public.has_doc_access(
      auth.uid(),
      'purchase_order'::public.doc_kind,
      NULLIF(split_part(name, '/', 1), '')::uuid,
      'edit'::public.access_perm
    )
  )
  WITH CHECK (
    bucket_id = 'grn-invoices'
    AND public.has_doc_access(
      auth.uid(),
      'purchase_order'::public.doc_kind,
      NULLIF(split_part(name, '/', 1), '')::uuid,
      'edit'::public.access_perm
    )
  );

CREATE POLICY "grn invoices delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'grn-invoices'
    AND public.has_doc_access(
      auth.uid(),
      'purchase_order'::public.doc_kind,
      NULLIF(split_part(name, '/', 1), '')::uuid,
      'edit'::public.access_perm
    )
  );

-- 2) BOQ distribution log: also allow doc_access grantees to read
DROP POLICY IF EXISTS bdl_select_owned_or_admin ON public.boq_distribution_log;
CREATE POLICY bdl_select_owned_or_admin ON public.boq_distribution_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.boqs b
       WHERE b.id = boq_distribution_log.boq_id
         AND b.user_id = auth.uid()
    )
    OR public.has_doc_access(auth.uid(), 'boq'::public.doc_kind, boq_distribution_log.boq_id, 'view'::public.access_perm)
  );

-- 3) Requisition child tables: allow doc_access grantees to read
DROP POLICY IF EXISTS ri_select_owned_or_admin ON public.requisition_items;
CREATE POLICY ri_select_owned_or_admin ON public.requisition_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_items.requisition_id AND r.user_id = auth.uid())
    OR public.has_doc_access(auth.uid(), 'requisition'::public.doc_kind, requisition_items.requisition_id, 'view'::public.access_perm)
  );

DROP POLICY IF EXISTS rl_select_owned_or_admin ON public.requisition_lots;
CREATE POLICY rl_select_owned_or_admin ON public.requisition_lots
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_lots.requisition_id AND r.user_id = auth.uid())
    OR public.has_doc_access(auth.uid(), 'requisition'::public.doc_kind, requisition_lots.requisition_id, 'view'::public.access_perm)
  );

DROP POLICY IF EXISTS rrm_select_owned_or_admin ON public.requisition_raw_materials;
CREATE POLICY rrm_select_owned_or_admin ON public.requisition_raw_materials
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_raw_materials.requisition_id AND r.user_id = auth.uid())
    OR public.has_doc_access(auth.uid(), 'requisition'::public.doc_kind, requisition_raw_materials.requisition_id, 'view'::public.access_perm)
  );

DROP POLICY IF EXISTS rdl_select_owned_or_admin ON public.requisition_distribution_log;
CREATE POLICY rdl_select_owned_or_admin ON public.requisition_distribution_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = requisition_distribution_log.requisition_id AND r.user_id = auth.uid())
    OR public.has_doc_access(auth.uid(), 'requisition'::public.doc_kind, requisition_distribution_log.requisition_id, 'view'::public.access_perm)
  );
