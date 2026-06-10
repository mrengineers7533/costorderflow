
DROP POLICY IF EXISTS "PO read all auth" ON public.purchase_orders;
CREATE POLICY "PO read own or admin" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "PO rows read all auth" ON public.purchase_order_rows;
CREATE POLICY "PO rows read own or admin" ON public.purchase_order_rows
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders p
    WHERE p.id = purchase_order_rows.po_id
      AND (p.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

DROP POLICY IF EXISTS po_audit_select_auth ON public.purchase_order_audit;
CREATE POLICY po_audit_select_own_or_admin ON public.purchase_order_audit
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders p
    WHERE p.id = purchase_order_audit.po_id
      AND (p.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

DROP POLICY IF EXISTS po_sends_select_auth ON public.purchase_order_sends;
CREATE POLICY po_sends_select_own_or_admin ON public.purchase_order_sends
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders p
    WHERE p.id = purchase_order_sends.po_id
      AND (p.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

DROP POLICY IF EXISTS "auth can read annexures" ON public.requisition_annexures;
DROP POLICY IF EXISTS "auth can insert annexures" ON public.requisition_annexures;
DROP POLICY IF EXISTS "auth can update annexures" ON public.requisition_annexures;
DROP POLICY IF EXISTS "auth can delete annexures" ON public.requisition_annexures;

CREATE POLICY "annexures_select_owned_or_admin" ON public.requisition_annexures
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "annexures_insert_owned_or_admin" ON public.requisition_annexures
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "annexures_update_owned_or_admin" ON public.requisition_annexures
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "annexures_delete_owned_or_admin" ON public.requisition_annexures
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth can read annexure rows" ON public.requisition_annexure_rows;
DROP POLICY IF EXISTS "auth can insert annexure rows" ON public.requisition_annexure_rows;
DROP POLICY IF EXISTS "auth can update annexure rows" ON public.requisition_annexure_rows;
DROP POLICY IF EXISTS "auth can delete annexure rows" ON public.requisition_annexure_rows;

CREATE POLICY "annexure_rows_select_owned_or_admin" ON public.requisition_annexure_rows
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.requisition_annexures a
    WHERE a.id = requisition_annexure_rows.annexure_id
      AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));
CREATE POLICY "annexure_rows_write_owned_or_admin" ON public.requisition_annexure_rows
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.requisition_annexures a
    WHERE a.id = requisition_annexure_rows.annexure_id
      AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.requisition_annexures a
    WHERE a.id = requisition_annexure_rows.annexure_id
      AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

DROP POLICY IF EXISTS "Insert attachments by authenticated users" ON public.boq_item_attachments;
CREATE POLICY "Insert attachments on own boq or admin" ON public.boq_item_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.boqs b
      WHERE b.id = boq_item_attachments.boq_id
        AND (b.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
