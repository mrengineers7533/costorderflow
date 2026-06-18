
-- Restore BOQ/Order visibility for module users (per approved + design-approved BOQ workflow).
-- Edit permissions remain per-document via has_doc_access.

DROP POLICY IF EXISTS boqs_select_module_approved ON public.boqs;
CREATE POLICY boqs_select_module_approved ON public.boqs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    verification_status = 'approved'
    AND design_review_status IN ('design_approved','final_sent')
    AND (
      public.has_module_perm(auth.uid(), 'purchase',      'view')
      OR public.has_module_perm(auth.uid(), 'manufacturing','view')
      OR public.has_module_perm(auth.uid(), 'design',      'view')
    )
  );

DROP POLICY IF EXISTS orders_select_module_for_approved_boq ON public.orders;
CREATE POLICY orders_select_module_for_approved_boq ON public.orders
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      public.has_module_perm(auth.uid(), 'purchase',      'view')
      OR public.has_module_perm(auth.uid(), 'manufacturing','view')
      OR public.has_module_perm(auth.uid(), 'design',      'view')
    )
    AND EXISTS (
      SELECT 1
      FROM public.boqs b
      JOIN public.orders o2 ON o2.id = b.order_id
      WHERE COALESCE(o2.parent_order_id, o2.id) = COALESCE(orders.parent_order_id, orders.id)
        AND b.verification_status = 'approved'
        AND b.design_review_status IN ('design_approved','final_sent')
    )
  );
