
-- Reset audit table
CREATE TABLE IF NOT EXISTS public.admin_reset_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor uuid,
  status text NOT NULL CHECK (status IN ('started','completed','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  files_removed integer NOT NULL DEFAULT 0,
  error text
);

GRANT SELECT ON public.admin_reset_audit TO authenticated;
GRANT ALL ON public.admin_reset_audit TO service_role;

ALTER TABLE public.admin_reset_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view reset audit" ON public.admin_reset_audit;
CREATE POLICY "Admins can view reset audit"
  ON public.admin_reset_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Preview function: returns counts of what would be deleted
CREATE OR REPLACE FUNCTION public.admin_reset_preview()
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
    'app_notification_reads','app_notifications','activity_event_reads','activity_events',
    'order_revision_notifications','grn_receipts','purchase_order_sends','purchase_order_audit',
    'purchase_order_rows','purchase_orders','requisition_annexure_rows','requisition_annexures',
    'requisition_distribution_log','requisition_raw_materials','requisition_items',
    'requisition_lots','requisitions','boq_design_review_documents','boq_design_review_items',
    'boq_design_review_email_log','boq_design_reviews','boq_design_comments',
    'boq_item_design_status','boq_item_attachments','boq_distribution_log',
    'boq_family_share_tokens','boq_remarks_audit_log','boq_revision_approval_snapshots',
    'boq_revisions','boqs','client_copies','proforma_invoice_documents','proforma_invoices',
    'orders','cost_sheets'
  ];
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', _t) INTO _n;
    _counts := _counts || jsonb_build_object(_t, _n);
  END LOOP;

  RETURN _counts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_preview() TO authenticated;

-- Full-graph, dependency-ordered, transactional reset
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
  -- Delete child rows first, then parents.
  _tables text[] := ARRAY[
    'app_notification_reads',
    'app_notifications',
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
    'boq_design_comments',
    'boq_item_design_status',
    'boq_item_attachments',
    'boq_distribution_log',
    'boq_family_share_tokens',
    'boq_remarks_audit_log',
    'boq_revision_approval_snapshots',
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

  -- Serialize concurrent resets within this transaction.
  PERFORM pg_advisory_xact_lock(hashtext('admin_reset_generated_data'));

  -- Clean email log rows tied to notifications about to be removed;
  -- keep NULL notification_id rows (test emails and standalone sends).
  WITH d AS (
    DELETE FROM public.email_notification_log
    WHERE notification_id IS NOT NULL
    RETURNING 1
  ) SELECT count(*) FROM d INTO _n;
  _counts := _counts || jsonb_build_object('email_notification_log', _n);

  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('WITH d AS (DELETE FROM public.%I WHERE true RETURNING 1) SELECT count(*) FROM d', _t) INTO _n;
    _counts := _counts || jsonb_build_object(_t, _n);
  END LOOP;

  -- Clean document_access rows that pointed to now-deleted docs.
  WITH d AS (
    DELETE FROM public.document_access
    WHERE true
    RETURNING 1
  ) SELECT count(*) FROM d INTO _n;
  _counts := _counts || jsonb_build_object('document_access', _n);

  -- Reset counters (config preserved, only the running number).
  UPDATE public.oa_counters         SET last_number = 0, updated_at = now() WHERE true;
  UPDATE public.pi_counters         SET last_number = 0, updated_at = now() WHERE true;
  UPDATE public.po_counters         SET last_number = 0 WHERE true;
  UPDATE public.requisition_counters SET last_number = 0 WHERE true;
  UPDATE public.general_requisition_counters SET last_number = 0 WHERE true;

  INSERT INTO public.admin_audit_log (actor, action, details)
  VALUES (_uid, 'reset_generated_data', _counts);

  RETURN _counts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_generated_data() TO authenticated;
