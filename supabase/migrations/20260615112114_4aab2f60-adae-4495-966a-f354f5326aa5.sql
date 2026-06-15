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
    EXECUTE format('WITH d AS (DELETE FROM public.%I WHERE true RETURNING 1) SELECT count(*) FROM d', _t) INTO _n;
    _counts := _counts || jsonb_build_object(_t, _n);
  END LOOP;

  UPDATE public.oa_counters         SET last_number = 0, updated_at = now() WHERE true;
  UPDATE public.pi_counters         SET last_number = 0, updated_at = now() WHERE true;
  UPDATE public.po_counters         SET last_number = 0, updated_at = now() WHERE true;
  UPDATE public.requisition_counters SET last_number = 0, updated_at = now() WHERE true;

  INSERT INTO public.admin_audit_log (actor, action, details)
  VALUES (_uid, 'reset_generated_data', _counts);

  RETURN _counts;
END;
$function$;