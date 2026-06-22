
-- 1. activity_events: extend SELECT/INSERT to users with doc access
DROP POLICY IF EXISTS ae_select_owner_or_admin ON public.activity_events;
CREATE POLICY ae_select_owner_or_admin ON public.activity_events
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR actor_id = auth.uid()
  OR (order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM orders o WHERE o.id = activity_events.order_id
        AND (o.user_id = auth.uid() OR has_doc_access(auth.uid(), 'order'::doc_kind, o.id, 'view'::access_perm))))
  OR (order_root_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM orders o WHERE COALESCE(o.parent_order_id, o.id) = activity_events.order_root_id
        AND (o.user_id = auth.uid() OR has_doc_access(auth.uid(), 'order'::doc_kind, COALESCE(o.parent_order_id, o.id), 'view'::access_perm))))
  OR (boq_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM boqs b WHERE b.id = activity_events.boq_id
        AND (b.user_id = auth.uid() OR has_doc_access(auth.uid(), 'boq'::doc_kind, b.id, 'view'::access_perm))))
  OR (pi_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM proforma_invoices p WHERE p.id = activity_events.pi_id
        AND (p.user_id = auth.uid() OR has_doc_access(auth.uid(), 'pi'::doc_kind, p.id, 'view'::access_perm))))
  OR (requisition_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM requisitions r WHERE r.id = activity_events.requisition_id
        AND (r.user_id = auth.uid() OR has_doc_access(auth.uid(), 'requisition'::doc_kind, r.id, 'view'::access_perm))))
);

DROP POLICY IF EXISTS ae_insert_authenticated ON public.activity_events;
CREATE POLICY ae_insert_authenticated ON public.activity_events
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR actor_id = auth.uid()
  OR (order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM orders o WHERE o.id = activity_events.order_id
        AND (o.user_id = auth.uid() OR has_doc_access(auth.uid(), 'order'::doc_kind, o.id, 'edit'::access_perm))))
  OR (boq_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM boqs b WHERE b.id = activity_events.boq_id
        AND (b.user_id = auth.uid() OR has_doc_access(auth.uid(), 'boq'::doc_kind, b.id, 'edit'::access_perm))))
  OR (pi_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM proforma_invoices p WHERE p.id = activity_events.pi_id
        AND (p.user_id = auth.uid() OR has_doc_access(auth.uid(), 'pi'::doc_kind, p.id, 'edit'::access_perm))))
  OR (requisition_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM requisitions r WHERE r.id = activity_events.requisition_id
        AND (r.user_id = auth.uid() OR has_doc_access(auth.uid(), 'requisition'::doc_kind, r.id, 'edit'::access_perm))))
);

-- 2. boq_item_attachments: extend SELECT to doc-access grantees
DROP POLICY IF EXISTS "View own boq item attachments or admin" ON public.boq_item_attachments;
CREATE POLICY "View own boq item attachments or admin" ON public.boq_item_attachments
FOR SELECT TO authenticated
USING (
  uploaded_by = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM boqs b
    WHERE b.id = boq_item_attachments.boq_id
      AND (b.user_id = auth.uid() OR has_doc_access(auth.uid(), 'boq'::doc_kind, b.id, 'view'::access_perm))
  )
);

-- 3. boq_revisions: extend SELECT/INSERT to doc-access grantees
DROP POLICY IF EXISTS boq_revisions_select_owner_or_admin ON public.boq_revisions;
CREATE POLICY boq_revisions_select_owner_or_admin ON public.boq_revisions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM boqs b
    WHERE b.id = boq_revisions.boq_id
      AND (b.user_id = auth.uid()
           OR has_role(auth.uid(), 'admin'::app_role)
           OR has_doc_access(auth.uid(), 'boq'::doc_kind, b.id, 'view'::access_perm))
  )
);

DROP POLICY IF EXISTS boq_revisions_insert_owner_or_admin ON public.boq_revisions;
CREATE POLICY boq_revisions_insert_owner_or_admin ON public.boq_revisions
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM boqs b
    WHERE b.id = boq_revisions.boq_id
      AND (b.user_id = auth.uid()
           OR has_role(auth.uid(), 'admin'::app_role)
           OR has_doc_access(auth.uid(), 'boq'::doc_kind, b.id, 'edit'::access_perm))
  )
);

-- 4. realtime: scope app_notifications / app_notification_reads subscriptions
CREATE POLICY app_notifications_realtime_scoped ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'app_notifications%'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_module_access(auth.uid(), 'notifications'::text))
);

CREATE POLICY app_notification_reads_realtime_scoped ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'app_notification_reads%'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_module_access(auth.uid(), 'notifications'::text))
);
