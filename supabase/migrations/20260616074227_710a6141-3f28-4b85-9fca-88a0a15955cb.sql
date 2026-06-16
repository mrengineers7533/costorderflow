
-- 1. Enum for recipient module
DO $$ BEGIN
  CREATE TYPE public.notif_module AS ENUM ('oa','boq','pi','design','purchase','manufacturing','requisition','project');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add module column to notification_recipients (nullable for back-compat)
ALTER TABLE public.notification_recipients
  ADD COLUMN IF NOT EXISTS module public.notif_module;

CREATE INDEX IF NOT EXISTS idx_notif_recipients_module_active
  ON public.notification_recipients(module) WHERE is_active;

-- 3. Map raw notification.module + event_type -> source notif_module
CREATE OR REPLACE FUNCTION public.notif_source_module(_module text, _event text)
RETURNS public.notif_module
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _module = 'order' THEN 'oa'::public.notif_module
    WHEN _module = 'pi' THEN 'pi'::public.notif_module
    WHEN _module = 'boq' AND _event = 'design_item_status_changed' THEN 'design'::public.notif_module
    WHEN _module = 'boq' THEN 'boq'::public.notif_module
    WHEN _module = 'design_comment' THEN 'design'::public.notif_module
    WHEN _module IN ('purchase','grn') THEN 'purchase'::public.notif_module
    WHEN _module IN ('requisition','annexure') THEN 'requisition'::public.notif_module
    ELSE NULL
  END;
$$;

-- 4. Modules owned by the current authenticated user
CREATE OR REPLACE FUNCTION public.current_user_modules()
RETURNS public.notif_module[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(DISTINCT module) FILTER (WHERE module IS NOT NULL), ARRAY[]::public.notif_module[])
  FROM public.notification_recipients
  WHERE user_id = auth.uid()
    AND is_active = true;
$$;

-- 5. Updated emit_notification: exclude actor's module/department, skip insert if no targets
CREATE OR REPLACE FUNCTION public.emit_notification(
  _module text, _event text, _record_id uuid, _record_ref text, _client text,
  _title text, _summary text, _old jsonb, _new jsonb,
  _order_root uuid DEFAULT NULL::uuid, _boq uuid DEFAULT NULL::uuid,
  _pi uuid DEFAULT NULL::uuid, _po uuid DEFAULT NULL::uuid,
  _req uuid DEFAULT NULL::uuid, _annex uuid DEFAULT NULL::uuid,
  _line_changes jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor_dept text := public.current_user_department();
  _actor_uid  uuid := auth.uid();
  _actor_name text := public.current_user_name();
  _src_module public.notif_module := public.notif_source_module(_module, _event);
  _targets text[];
BEGIN
  -- Skip empty line-item-change events outright.
  IF _event LIKE '%line_items_changed%' AND
     (_line_changes IS NULL OR jsonb_typeof(_line_changes) <> 'array' OR jsonb_array_length(_line_changes) = 0) THEN
    RETURN;
  END IF;

  -- Build target_departments by excluding the source module's owners.
  -- A recipient row is excluded if:
  --   * row.module = source module, OR
  --   * row.module IS NULL AND row.department = actor's department (back-compat), OR
  --   * row.user_id = actor (actor never notifies themselves regardless of module).
  SELECT COALESCE(array_agg(DISTINCT department), ARRAY[]::text[])
    INTO _targets
  FROM public.notification_recipients
  WHERE is_active = true
    AND (_actor_uid IS NULL OR user_id IS DISTINCT FROM _actor_uid)
    AND NOT (
      (module IS NOT NULL AND _src_module IS NOT NULL AND module = _src_module)
      OR (module IS NULL AND department IS NOT DISTINCT FROM _actor_dept)
    );

  -- Nothing to notify -> don't create a row at all.
  IF _targets IS NULL OR cardinality(_targets) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.app_notifications
    (module, event_type, record_id, record_ref, client_name,
     title, summary, old_value, new_value,
     actor_user_id, actor_user_name, actor_department, target_departments,
     related_order_root_id, related_boq_id, related_pi_id, related_po_id,
     related_requisition_id, related_annexure_id, line_item_changes)
  VALUES
    (_module, _event, _record_id, _record_ref, _client,
     _title, _summary, _old, _new,
     _actor_uid, _actor_name, _actor_dept, _targets,
     _order_root, _boq, _pi, _po, _req, _annex, _line_changes);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_notification failed: %', SQLERRM;
END $function$;

-- 6. Updated get_related_notifications: hide rows whose source module the viewer owns
CREATE OR REPLACE FUNCTION public.get_related_notifications(
  p_order_root uuid DEFAULT NULL::uuid, p_boq uuid DEFAULT NULL::uuid,
  p_pi uuid DEFAULT NULL::uuid, p_po uuid DEFAULT NULL::uuid,
  p_req uuid DEFAULT NULL::uuid, p_annex uuid DEFAULT NULL::uuid,
  p_record_id uuid DEFAULT NULL::uuid, p_modules text[] DEFAULT NULL::text[],
  p_limit integer DEFAULT 20)
RETURNS SETOF app_notifications
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT public.current_user_modules() AS mods)
  SELECT n.*
  FROM public.app_notifications n, me
  WHERE (
       (p_order_root IS NOT NULL AND n.related_order_root_id = p_order_root)
    OR (p_boq        IS NOT NULL AND n.related_boq_id        = p_boq)
    OR (p_pi         IS NOT NULL AND n.related_pi_id         = p_pi)
    OR (p_po         IS NOT NULL AND n.related_po_id         = p_po)
    OR (p_req        IS NOT NULL AND n.related_requisition_id = p_req)
    OR (p_annex      IS NOT NULL AND n.related_annexure_id   = p_annex)
    OR (p_record_id  IS NOT NULL AND n.record_id             = p_record_id)
  )
  AND (p_modules IS NULL OR n.module = ANY(p_modules))
  AND (
    cardinality(me.mods) = 0
    OR public.notif_source_module(n.module, n.event_type) IS NULL
    OR NOT (public.notif_source_module(n.module, n.event_type) = ANY(me.mods))
  )
  ORDER BY n.created_at DESC
  LIMIT p_limit;
$function$;

-- 7. Sidebar bell unread count (single RPC, same exclusion rule)
CREATE OR REPLACE FUNCTION public.count_unread_notifications()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (SELECT public.current_user_modules() AS mods)
  SELECT COUNT(*)::int
  FROM public.app_notifications n, me
  WHERE (
    cardinality(me.mods) = 0
    OR public.notif_source_module(n.module, n.event_type) IS NULL
    OR NOT (public.notif_source_module(n.module, n.event_type) = ANY(me.mods))
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.app_notification_reads r
    WHERE r.notification_id = n.id AND r.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.notif_source_module(text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_modules() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_unread_notifications() TO authenticated, service_role;
