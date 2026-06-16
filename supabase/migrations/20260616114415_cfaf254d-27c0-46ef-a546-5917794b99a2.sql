
-- Lock down app_notifications inserts (only SECURITY DEFINER triggers / service_role)
DROP POLICY IF EXISTS "system inserts allowed" ON public.app_notifications;
CREATE POLICY app_notifications_insert_admin
  ON public.app_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Lock down purchase_order_sends inserts to PO owner or admin
DROP POLICY IF EXISTS po_sends_insert_auth ON public.purchase_order_sends;
CREATE POLICY po_sends_insert_owned_or_admin
  ON public.purchase_order_sends
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders p
      WHERE p.id = purchase_order_sends.po_id
        AND (p.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- Also tighten purchase_order_audit inserts similarly (same class of issue)
DROP POLICY IF EXISTS po_audit_insert_auth ON public.purchase_order_audit;
CREATE POLICY po_audit_insert_owned_or_admin
  ON public.purchase_order_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders p
      WHERE p.id = purchase_order_audit.po_id
        AND (p.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- Let users read their own notification_recipients row
CREATE POLICY nr_select_self
  ON public.notification_recipients
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
