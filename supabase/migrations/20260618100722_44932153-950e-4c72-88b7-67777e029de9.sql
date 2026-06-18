
CREATE OR REPLACE FUNCTION public.can_edit_module(_user_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access
      WHERE user_id = _user_id AND module = _module AND permission = 'edit'
    )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_doc(_user_id uuid, _doc_kind text, _doc_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.can_edit_module(_user_id, _module)
    OR EXISTS (
      SELECT 1 FROM public.document_access da
      WHERE da.user_id = _user_id
        AND da.doc_kind::text = _doc_kind
        AND da.doc_id = _doc_id
        AND da.permission::text = 'edit'
    )
$$;

DO $$
DECLARE
  t text;
  tbl text;
  modk text;
BEGIN
  -- Doc-override tables (orders/boqs/pi)
  FOR t IN SELECT unnest(ARRAY['orders:order:costing','boqs:boq:costing','proforma_invoices:pi:costing']) LOOP
    tbl := split_part(t,':',1);
    DECLARE dk text := split_part(t,':',2); m text := split_part(t,':',3);
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS module_edit_gate_ins ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS module_edit_gate_upd ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS module_edit_gate_del ON public.%I', tbl);
      EXECUTE format($p$CREATE POLICY module_edit_gate_ins ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_edit_module(auth.uid(), %L))$p$, tbl, m);
      EXECUTE format($p$CREATE POLICY module_edit_gate_upd ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_edit_doc(auth.uid(), %L, id, %L)) WITH CHECK (public.can_edit_doc(auth.uid(), %L, id, %L))$p$, tbl, dk, m, dk, m);
      EXECUTE format($p$CREATE POLICY module_edit_gate_del ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.can_edit_doc(auth.uid(), %L, id, %L))$p$, tbl, dk, m);
    END;
  END LOOP;

  -- Simple module-gated tables
  FOR t IN SELECT unnest(ARRAY[
    'boq_revisions:costing','order_templates:costing','client_copies:costing',
    'boq_item_attachments:costing','boq_remarks_audit_log:costing','proforma_invoice_documents:costing',
    'purchase_orders:purchase','purchase_order_rows:purchase','purchase_order_sends:purchase',
    'purchase_order_audit:purchase','purchase_settings:purchase','vendors:purchase',
    'requisitions:requisitions','requisition_items:requisitions','requisition_lots:requisitions',
    'requisition_raw_materials:requisitions','requisition_distribution_log:requisitions',
    'requisition_annexures:annexures','requisition_annexure_rows:annexures',
    'fg_raw_material_map:manufacturing','grn_receipts:grn','rm_master_uploads:raw_materials',
    'boq_design_comments:design','boq_design_reviews:design','boq_design_review_items:design',
    'boq_design_review_documents:design','boq_item_design_status:design',
    'cost_sheets:cost_sheets','order_revision_notifications:notifications'
  ]) LOOP
    tbl := split_part(t,':',1);
    modk := split_part(t,':',2);
    EXECUTE format('DROP POLICY IF EXISTS module_edit_gate_ins ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS module_edit_gate_upd ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS module_edit_gate_del ON public.%I', tbl);
    EXECUTE format($p$CREATE POLICY module_edit_gate_ins ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_edit_module(auth.uid(), %L))$p$, tbl, modk);
    EXECUTE format($p$CREATE POLICY module_edit_gate_upd ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_edit_module(auth.uid(), %L)) WITH CHECK (public.can_edit_module(auth.uid(), %L))$p$, tbl, modk, modk);
    EXECUTE format($p$CREATE POLICY module_edit_gate_del ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.can_edit_module(auth.uid(), %L))$p$, tbl, modk);
  END LOOP;
END $$;
