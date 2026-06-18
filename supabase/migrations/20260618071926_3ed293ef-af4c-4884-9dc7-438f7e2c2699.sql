
-- Per-document RLS for Purchase child tables; preserve access via creator backfill.

-- purchase_order_rows
DROP POLICY IF EXISTS "PO rows read own or admin" ON public.purchase_order_rows;
DROP POLICY IF EXISTS "PO rows write via parent" ON public.purchase_order_rows;
CREATE POLICY "po_rows_select_doc_access" ON public.purchase_order_rows
  FOR SELECT TO authenticated
  USING (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'view'::access_perm));
CREATE POLICY "po_rows_write_doc_access" ON public.purchase_order_rows
  FOR ALL TO authenticated
  USING (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'edit'::access_perm))
  WITH CHECK (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'edit'::access_perm));

-- purchase_order_audit
DROP POLICY IF EXISTS "po_audit_select_own_or_admin" ON public.purchase_order_audit;
DROP POLICY IF EXISTS "po_audit_insert_owned_or_admin" ON public.purchase_order_audit;
CREATE POLICY "po_audit_select_doc_access" ON public.purchase_order_audit
  FOR SELECT TO authenticated
  USING (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'view'::access_perm));
CREATE POLICY "po_audit_insert_doc_access" ON public.purchase_order_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'edit'::access_perm));

-- purchase_order_sends
DROP POLICY IF EXISTS "po_sends_select_own_or_admin" ON public.purchase_order_sends;
DROP POLICY IF EXISTS "po_sends_insert_owned_or_admin" ON public.purchase_order_sends;
CREATE POLICY "po_sends_select_doc_access" ON public.purchase_order_sends
  FOR SELECT TO authenticated
  USING (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'view'::access_perm));
CREATE POLICY "po_sends_insert_doc_access" ON public.purchase_order_sends
  FOR INSERT TO authenticated
  WITH CHECK (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'edit'::access_perm));

-- grn_receipts
DROP POLICY IF EXISTS "GRN read via parent PO" ON public.grn_receipts;
DROP POLICY IF EXISTS "GRN insert via parent PO" ON public.grn_receipts;
DROP POLICY IF EXISTS "GRN update via parent PO" ON public.grn_receipts;
DROP POLICY IF EXISTS "GRN delete admin" ON public.grn_receipts;
CREATE POLICY "grn_select_doc_access" ON public.grn_receipts
  FOR SELECT TO authenticated
  USING (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'view'::access_perm));
CREATE POLICY "grn_insert_doc_access" ON public.grn_receipts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'edit'::access_perm));
CREATE POLICY "grn_update_doc_access" ON public.grn_receipts
  FOR UPDATE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'edit'::access_perm))
  WITH CHECK (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'edit'::access_perm));
CREATE POLICY "grn_delete_doc_access" ON public.grn_receipts
  FOR DELETE TO authenticated
  USING (public.has_doc_access(auth.uid(), 'purchase_order'::doc_kind, po_id, 'edit'::access_perm));

-- Idempotent backfill so existing documents stay visible to their creators.
-- has_doc_access already grants admin and creator implicitly, but inserting
-- explicit rows also makes the central "Document Access" admin screen and
-- per-document dialog reflect creators correctly. ON CONFLICT keeps it safe.
INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
SELECT 'purchase_order'::doc_kind, id, created_by, 'edit'::access_perm, created_by
  FROM public.purchase_orders WHERE created_by IS NOT NULL
ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;

INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
SELECT 'requisition'::doc_kind, id, user_id, 'edit'::access_perm, user_id
  FROM public.requisitions WHERE user_id IS NOT NULL
ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;

INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
SELECT 'order'::doc_kind, id, user_id, 'edit'::access_perm, user_id
  FROM public.orders WHERE user_id IS NOT NULL
ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;

INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
SELECT 'boq'::doc_kind, id, user_id, 'edit'::access_perm, user_id
  FROM public.boqs WHERE user_id IS NOT NULL
ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;

INSERT INTO public.document_access (doc_kind, doc_id, user_id, permission, granted_by)
SELECT 'pi'::doc_kind, id, user_id, 'edit'::access_perm, user_id
  FROM public.proforma_invoices WHERE user_id IS NOT NULL
ON CONFLICT (doc_kind, doc_id, user_id) DO NOTHING;
