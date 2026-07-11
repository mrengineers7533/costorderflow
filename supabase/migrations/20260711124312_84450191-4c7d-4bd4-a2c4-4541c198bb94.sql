
-- 1) boq_item_attachments: restrict SELECT to uploader/admin only
DROP POLICY IF EXISTS "View own boq item attachments or admin" ON public.boq_item_attachments;
CREATE POLICY "View own attachments or admin"
  ON public.boq_item_attachments FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 2) Revoke EXECUTE on trigger-only functions from anon, authenticated, PUBLIC
DO $$
DECLARE
  fn text;
  trigger_fns text[] := ARRAY[
    '_grant_creator_doc_access()',
    '_notif_revision_key(text,text,text)',
    'enqueue_order_revision_notification()',
    'flag_descendants_on_boq_approval()',
    'handle_new_user()',
    'notif_on_annexure()',
    'notif_on_annexure_row()',
    'notif_on_boqs()',
    'notif_on_design_comment()',
    'notif_on_design_item_status()',
    'notif_on_grn()',
    'notif_on_orders()',
    'notif_on_pi()',
    'notif_on_po()',
    'notif_on_req()',
    'notify_send_notification_email()',
    'set_notif_suppress(boolean)',
    'sync_design_status_to_boq_line_items()',
    'sync_email_log_reads()',
    'sync_po_counter()',
    'trg_refresh_boq_revision_approval_snapshot()',
    'trg_refresh_boq_snapshot_from_boq()',
    'refresh_boq_revision_approval_snapshot_internal(uuid)',
    'log_login_attempt(text,boolean,text)'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      -- signature mismatch, skip
      NULL;
    END;
  END LOOP;
END$$;

-- Broad revoke by name (covers any signature) for trigger/internal functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        '_grant_creator_doc_access','_notif_revision_key',
        'enqueue_order_revision_notification','flag_descendants_on_boq_approval',
        'handle_new_user','notif_on_annexure','notif_on_annexure_row','notif_on_boqs',
        'notif_on_design_comment','notif_on_design_item_status','notif_on_grn',
        'notif_on_orders','notif_on_pi','notif_on_po','notif_on_req',
        'notify_send_notification_email','set_notif_suppress',
        'sync_design_status_to_boq_line_items','sync_email_log_reads','sync_po_counter',
        'trg_refresh_boq_revision_approval_snapshot','trg_refresh_boq_snapshot_from_boq',
        'refresh_boq_revision_approval_snapshot_internal','log_login_attempt',
        'admin_reset_generated_data','repair_inherited_boq_approval_snapshots'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END$$;

-- 3) Revoke anon EXECUTE from auth-dependent RPCs and internal helpers.
-- Anonymous callers have no auth.uid(); these should be authenticated-only.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'has_role','has_module_access','has_module_perm','has_doc_access',
        'can_edit_module','can_edit_doc','can_ack_notification',
        'current_user_department','current_user_modules','current_user_name',
        'mark_notification_seen','get_related_notifications',
        'count_unread_notifications','get_notification_tracking',
        'apply_design_comment_to_oa','cancel_purchase_order',
        'refresh_boq_revision_approval_snapshot',
        'order_visible_via_approved_boq','has_open_review_for_boq',
        'is_design_review_owner','emit_notification',
        'next_oa_number','next_pi_number','next_po_number',
        'next_requisition_number','next_general_requisition_number',
        'peek_next_po_number'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END$$;
