
-- Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read admin_audit_log" ON public.admin_audit_log;
CREATE POLICY "admins read admin_audit_log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Centralized reset function. Add future transactional tables here.
CREATE OR REPLACE FUNCTION public.admin_reset_generated_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _counts jsonb := '{}'::jsonb;
  _n bigint;
  _t text;
  _tables text[] := ARRAY[
    -- activity / notifications
    'activity_event_reads',
    'activity_events',
    'order_revision_notifications',
    -- purchase orders (children first)
    'purchase_order_sends',
    'purchase_order_audit',
    'purchase_order_rows',
    'purchase_orders',
    -- requisitions
    'requisition_annexure_rows',
    'requisition_annexures',
    'requisition_distribution_log',
    'requisition_raw_materials',
    'requisition_items',
    'requisition_lots',
    'requisitions',
    -- BOQ ecosystem
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
    -- orders / PI
    'client_copies',
    'proforma_invoice_documents',
    'proforma_invoices',
    'orders',
    -- cost sheets
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

  -- Reset numbering counters (keep rows, set last_number back to 0)
  UPDATE public.oa_counters         SET last_number = 0, updated_at = now();
  UPDATE public.pi_counters         SET last_number = 0, updated_at = now();
  UPDATE public.po_counters         SET last_number = 0, updated_at = now();
  UPDATE public.requisition_counters SET last_number = 0, updated_at = now();

  INSERT INTO public.admin_audit_log (actor, action, details)
  VALUES (_uid, 'reset_generated_data', _counts);

  RETURN _counts;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_generated_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_generated_data() TO authenticated, service_role;
