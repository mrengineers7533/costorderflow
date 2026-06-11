-- GRN receipts: one row per purchase_order_rows entry (created lazily on first edit)
CREATE TABLE public.grn_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_row_id uuid NOT NULL UNIQUE REFERENCES public.purchase_order_rows(id) ON DELETE CASCADE,
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  material_reached_date date,
  delay_days int,
  received_qty numeric,
  late_comment text,
  gate_entry_done boolean NOT NULL DEFAULT false,
  gate_entry_at timestamptz,
  gate_entry_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grn_receipts TO authenticated;
GRANT ALL ON public.grn_receipts TO service_role;

ALTER TABLE public.grn_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GRN read via parent PO" ON public.grn_receipts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders p
    WHERE p.id = grn_receipts.po_id
      AND (p.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ));

CREATE POLICY "GRN insert via parent PO" ON public.grn_receipts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_orders p
    WHERE p.id = grn_receipts.po_id
      AND (p.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ));

CREATE POLICY "GRN update via parent PO" ON public.grn_receipts FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders p
    WHERE p.id = grn_receipts.po_id
      AND (p.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_orders p
    WHERE p.id = grn_receipts.po_id
      AND (p.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ));

CREATE POLICY "GRN delete admin" ON public.grn_receipts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_grn_updated BEFORE UPDATE ON public.grn_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_grn_po ON public.grn_receipts(po_id);
CREATE INDEX idx_grn_status ON public.grn_receipts(status);
CREATE INDEX idx_grn_reached ON public.grn_receipts(material_reached_date);

-- Extend Reset Generated Data to clear GRN as well
CREATE OR REPLACE FUNCTION public.admin_reset_generated_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _counts jsonb := '{}'::jsonb;
  _n bigint;
  _t text;
  _tables text[] := ARRAY[
    'activity_event_reads',
    'activity_events',
    'order_revision_notifications',
    'grn_receipts',
    'purchase_order_sends',
    'purchase_order_audit',
    'purchase_order_rows',
    'purchase_orders',
    'requisition_annexure_rows',
    'requisition_annexures',
    'requisition_distribution_log',
    'requisition_raw_materials',
    'requisition_items',
    'requisition_lots',
    'requisitions',
    'boq_design_review_documents',
    'boq_design_review_items',
    'boq_design_review_email_log',
    'boq_design_reviews',
    'boq_distribution_log',
    'boq_family_share_tokens',
    'boq_item_attachments',
    'boq_remarks_audit_log',
    'boq_revisions',
    'boqs',
    'client_copies',
    'proforma_invoice_documents',
    'proforma_invoices',
    'orders',
    'cost_sheets'
  ];
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('WITH d AS (DELETE FROM public.%I RETURNING 1) SELECT count(*) FROM d', _t) INTO _n;
    _counts := _counts || jsonb_build_object(_t, _n);
  END LOOP;

  UPDATE public.oa_counters         SET last_number = 0, updated_at = now();
  UPDATE public.pi_counters         SET last_number = 0, updated_at = now();
  UPDATE public.po_counters         SET last_number = 0, updated_at = now();
  UPDATE public.requisition_counters SET last_number = 0, updated_at = now();

  INSERT INTO public.admin_audit_log (actor, action, details)
  VALUES (_uid, 'reset_generated_data', _counts);

  RETURN _counts;
END;
$function$;