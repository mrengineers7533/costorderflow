-- 1) emit_notification: only triggers / service role may call it
REVOKE EXECUTE ON FUNCTION public.emit_notification(text,text,uuid,text,text,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;

-- 2) internal helpers should not be callable from the API
REVOKE EXECUTE ON FUNCTION public.carry_forward_boq_design_state(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_boq_revision_approval_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_sender_email_change() FROM PUBLIC, anon, authenticated;

-- 3) admin preview must not be anon-callable
REVOKE EXECUTE ON FUNCTION public.admin_reset_preview() FROM PUBLIC, anon;

-- 4) drop blanket PUBLIC execute on the public token-based functions (keep anon/authenticated)
REVOKE EXECUTE ON FUNCTION public.get_boq_by_verification_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_boq_item_attachments_by_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_design_review_by_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_design_review_docs_by_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_design_review_items_by_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_final_boq_by_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_latest_approved_boq_by_family_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_requisition_by_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_requisition_items_by_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_requisition_raw_materials_by_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sign_boq_item_doc_by_token(uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_design_review_with_token(uuid,text,jsonb,jsonb,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_boq_items_with_token(uuid,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_boq_items_with_token(uuid,text,jsonb,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_boq_with_token(uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_open_design_review(text) FROM PUBLIC;

-- 5) get_related_notifications: enforce per-document view access
CREATE OR REPLACE FUNCTION public.get_related_notifications(
  p_order_root uuid DEFAULT NULL::uuid,
  p_boq uuid DEFAULT NULL::uuid,
  p_pi uuid DEFAULT NULL::uuid,
  p_po uuid DEFAULT NULL::uuid,
  p_req uuid DEFAULT NULL::uuid,
  p_annex uuid DEFAULT NULL::uuid,
  p_record_id uuid DEFAULT NULL::uuid,
  p_modules text[] DEFAULT NULL::text[],
  p_limit integer DEFAULT 20
)
RETURNS SETOF app_notifications
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT
      auth.uid() AS uid,
      public.current_user_modules() AS mods,
      public.current_user_department() AS dept,
      public.has_role(auth.uid(), 'admin'::public.app_role) AS is_admin,
      public.has_module_access(auth.uid(), 'notifications') AS has_notif_access
  ),
  scope AS (
    SELECT
      me.*,
      CASE WHEN p_order_root IS NOT NULL AND (me.is_admin OR public.has_doc_access(me.uid, 'order'::public.doc_kind, p_order_root, 'view'::public.access_perm)) THEN p_order_root END AS ok_order,
      CASE WHEN p_boq IS NOT NULL AND (me.is_admin OR public.has_doc_access(me.uid, 'boq'::public.doc_kind, p_boq, 'view'::public.access_perm)) THEN p_boq END AS ok_boq,
      CASE WHEN p_pi IS NOT NULL AND (me.is_admin OR public.has_doc_access(me.uid, 'pi'::public.doc_kind, p_pi, 'view'::public.access_perm)) THEN p_pi END AS ok_pi,
      CASE WHEN p_po IS NOT NULL AND (me.is_admin OR public.has_doc_access(me.uid, 'purchase_order'::public.doc_kind, p_po, 'view'::public.access_perm)) THEN p_po END AS ok_po,
      CASE WHEN p_req IS NOT NULL AND (me.is_admin OR public.has_doc_access(me.uid, 'requisition'::public.doc_kind, p_req, 'view'::public.access_perm)) THEN p_req END AS ok_req
    FROM me
  )
  SELECT n.*
  FROM public.app_notifications n, scope me
  WHERE (
       (me.ok_order IS NOT NULL AND n.related_order_root_id = me.ok_order)
    OR (me.ok_boq   IS NOT NULL AND n.related_boq_id        = me.ok_boq)
    OR (me.ok_pi    IS NOT NULL AND n.related_pi_id         = me.ok_pi)
    OR (me.ok_po    IS NOT NULL AND n.related_po_id         = me.ok_po)
    OR (me.ok_req   IS NOT NULL AND n.related_requisition_id = me.ok_req)
    OR (p_annex     IS NOT NULL AND n.related_annexure_id   = p_annex)
    OR (p_record_id IS NOT NULL AND n.record_id             = p_record_id)
  )
  AND (p_modules IS NULL OR n.module = ANY(p_modules))
  AND (
    cardinality(me.mods) = 0
    OR public.notif_source_module(n.module, n.event_type) IS NULL
    OR NOT (public.notif_source_module(n.module, n.event_type) = ANY(me.mods))
    OR me.is_admin
    OR n.actor_user_id = me.uid
  )
  AND (
    me.is_admin
    OR me.has_notif_access
    OR n.actor_user_id = me.uid
    OR EXISTS (
      SELECT 1
        FROM unnest(n.target_departments) t
       WHERE lower(regexp_replace(regexp_replace(coalesce(t,''), '\s+team$', '', 'i'), '\s+', ' ', 'g')) =
             lower(regexp_replace(regexp_replace(coalesce(me.dept,''), '\s+team$', '', 'i'), '\s+', ' ', 'g'))
    )
  )
  ORDER BY n.created_at DESC
  LIMIT p_limit;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_related_notifications(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text[],integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_related_notifications(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text[],integer) TO authenticated, service_role;