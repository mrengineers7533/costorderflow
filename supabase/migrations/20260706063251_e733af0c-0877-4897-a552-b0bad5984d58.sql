
DROP POLICY IF EXISTS boqs_select_module_perm ON public.boqs;
DROP POLICY IF EXISTS orders_select_module_perm ON public.orders;
DROP POLICY IF EXISTS po_select_module_perm ON public.purchase_orders;
DROP POLICY IF EXISTS requisitions_select_module_perm ON public.requisitions;

DROP POLICY IF EXISTS design_status_select_module ON public.boq_item_design_status;
CREATE POLICY design_status_select_module ON public.boq_item_design_status
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_doc_access(auth.uid(), 'boq'::doc_kind, boq_id, 'view'::access_perm)
  );

DROP POLICY IF EXISTS vendors_select_auth ON public.vendors;
CREATE POLICY vendors_select_scoped ON public.vendors
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_perm(auth.uid(), 'purchase'::text, 'view'::access_perm)
    OR public.has_module_perm(auth.uid(), 'manufacturing'::text, 'view'::access_perm)
    OR public.has_module_perm(auth.uid(), 'requisitions'::text, 'view'::access_perm)
    OR public.has_module_perm(auth.uid(), 'annexures'::text, 'view'::access_perm)
  );
