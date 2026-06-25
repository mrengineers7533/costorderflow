-- One document/revision should be represented by one notification row.
-- Department-specific Seen/Ack remains stored in app_notification_reads.

CREATE OR REPLACE FUNCTION public.emit_notification(
  _module text, _event text, _record_id uuid, _record_ref text, _client text,
  _title text, _summary text, _old jsonb, _new jsonb,
  _order_root uuid DEFAULT NULL, _boq uuid DEFAULT NULL, _pi uuid DEFAULT NULL,
  _po uuid DEFAULT NULL, _req uuid DEFAULT NULL, _annex uuid DEFAULT NULL,
  _line_changes jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor_dept text := public.current_user_department();
  _actor_uid  uuid := auth.uid();
  _actor_name text := public.current_user_name();
  _actor_mods public.notif_module[];
  _src_module public.notif_module := public.notif_source_module(_module, _event);
  _targets text[];
  _suppress text := current_setting('notif.suppress_cascade', true);
  _rev_key text;
  _existing_id uuid;
  _existing_changes jsonb;
  _merged_changes jsonb;
  _merge_count int;
  _total_rows int;
  _total_cells int;
BEGIN
  IF _suppress = 'on' THEN RETURN; END IF;

  IF _event LIKE '%line_items_changed%' AND
     (_line_changes IS NULL OR jsonb_typeof(_line_changes) <> 'array' OR jsonb_array_length(_line_changes) = 0) THEN
    RETURN;
  END IF;

  IF _actor_uid IS NOT NULL THEN
    SELECT array_agg(DISTINCT module) INTO _actor_mods
      FROM public.notification_recipients
     WHERE user_id = _actor_uid AND is_active = true AND module IS NOT NULL;
  END IF;

  IF _actor_mods IS NOT NULL
     AND 'manufacturing'::public.notif_module = ANY(_actor_mods)
     AND _module IN ('purchase','grn','requisition','annexure') THEN
    _src_module := 'manufacturing'::public.notif_module;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT department), ARRAY[]::text[])
    INTO _targets
  FROM public.notification_recipients
  WHERE is_active = true
    AND (_actor_uid IS NULL OR user_id IS DISTINCT FROM _actor_uid)
    AND NOT (
      (module IS NOT NULL AND _src_module IS NOT NULL AND module = _src_module)
      OR (module IS NULL AND _src_module IS NOT NULL
            AND department IS NOT DISTINCT FROM _actor_dept)
    );

  IF _targets IS NULL OR cardinality(_targets) = 0 THEN RETURN; END IF;

  _rev_key := public._notif_revision_key(_module, _record_id, _boq);

  SELECT n.id, n.line_item_changes
    INTO _existing_id, _existing_changes
    FROM public.app_notifications n
   WHERE n.revision_key = _rev_key
   ORDER BY n.created_at ASC
   LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    _merged_changes := public._notif_merge_changes(_existing_changes, _line_changes);
    _merge_count := COALESCE(jsonb_array_length(COALESCE(_merged_changes,'[]'::jsonb)), 0);
    _total_rows := _merge_count;
    SELECT COALESCE(SUM(
      CASE
        WHEN jsonb_typeof(v->'changed_fields') = 'array' THEN GREATEST(1, jsonb_array_length(v->'changed_fields'))
        ELSE 1
      END
    ),0)::int INTO _total_cells
      FROM jsonb_array_elements(COALESCE(_merged_changes,'[]'::jsonb)) v;

    UPDATE public.app_notifications n
       SET line_item_changes = _merged_changes,
           total_changed_rows = _total_rows,
           total_changed_cells = _total_cells,
           title = CASE
             WHEN _merge_count > 0 AND COALESCE(n.record_ref, _record_ref) IS NOT NULL
             THEN COALESCE(n.record_ref, _record_ref) || ' — ' || _merge_count || ' change' || CASE WHEN _merge_count=1 THEN '' ELSE 's' END
             WHEN _merge_count > 0
             THEN initcap(_module) || ' — ' || _merge_count || ' change' || CASE WHEN _merge_count=1 THEN '' ELSE 's' END
             ELSE COALESCE(_title, n.title)
           END,
           summary = COALESCE(_summary, n.summary),
           old_value = COALESCE(n.old_value, _old),
           new_value = COALESCE(_new, n.new_value),
           actor_user_id = COALESCE(_actor_uid, n.actor_user_id),
           actor_user_name = COALESCE(_actor_name, n.actor_user_name),
           actor_department = COALESCE(_actor_dept, n.actor_department),
           target_departments = (
             SELECT COALESCE(array_agg(DISTINCT d ORDER BY d), ARRAY[]::text[])
               FROM unnest(COALESCE(n.target_departments, ARRAY[]::text[]) || _targets) AS d
              WHERE d IS NOT NULL AND btrim(d) <> ''
           ),
           related_order_root_id = COALESCE(n.related_order_root_id, _order_root),
           related_boq_id = COALESCE(n.related_boq_id, _boq),
           related_pi_id = COALESCE(n.related_pi_id, _pi),
           related_po_id = COALESCE(n.related_po_id, _po),
           related_requisition_id = COALESCE(n.related_requisition_id, _req),
           related_annexure_id = COALESCE(n.related_annexure_id, _annex),
           merge_meta = jsonb_build_object(
             'merge_count', COALESCE((n.merge_meta->>'merge_count')::int,1) + 1,
             'first_created_at', COALESCE(n.merge_meta->>'first_created_at', n.created_at::text),
             'last_merged_at', now()::text)
     WHERE n.id = _existing_id;

    -- New content in the same document/revision must become Not Seen again.
    DELETE FROM public.app_notification_reads WHERE notification_id = _existing_id;
  ELSE
    _total_rows := COALESCE(jsonb_array_length(COALESCE(_line_changes,'[]'::jsonb)),0);
    SELECT COALESCE(SUM(
      CASE
        WHEN jsonb_typeof(v->'changed_fields') = 'array' THEN GREATEST(1, jsonb_array_length(v->'changed_fields'))
        ELSE 1
      END
    ),0)::int INTO _total_cells
      FROM jsonb_array_elements(COALESCE(_line_changes,'[]'::jsonb)) v;

    INSERT INTO public.app_notifications
      (module, event_type, record_id, record_ref, client_name,
       title, summary, old_value, new_value,
       actor_user_id, actor_user_name, actor_department, target_departments,
       related_order_root_id, related_boq_id, related_pi_id, related_po_id,
       related_requisition_id, related_annexure_id, line_item_changes,
       dedupe_key, merge_meta, revision_key,
       total_changed_rows, total_changed_cells)
    VALUES
      (_module, _event, _record_id, _record_ref, _client,
       CASE WHEN _total_rows > 0 AND _record_ref IS NOT NULL
            THEN _record_ref || ' — ' || _total_rows || ' change' || CASE WHEN _total_rows=1 THEN '' ELSE 's' END
            ELSE _title END,
       _summary, _old, _new,
       _actor_uid, _actor_name, _actor_dept, _targets,
       _order_root, _boq, _pi, _po, _req, _annex, _line_changes,
       _module || ':' || _event || ':' || COALESCE(_record_id::text,'-') || ':' || _rev_key,
       jsonb_build_object('merge_count',1,'first_created_at',now()::text,'last_merged_at',now()::text),
       _rev_key, _total_rows, _total_cells);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_notification failed: %', SQLERRM;
END $function$;

-- Collapse existing duplicate rows that represent the same document/revision.
DO $$
DECLARE
  _grp record;
  _keep uuid;
  _ids uuid[];
  _merged jsonb;
  _targets text[];
  _row record;
  _rows int;
  _cells int;
BEGIN
  UPDATE public.app_notifications n
     SET revision_key = public._notif_revision_key(n.module, n.record_id, n.related_boq_id)
   WHERE revision_key IS NULL;

  FOR _grp IN
    SELECT revision_key, array_agg(id ORDER BY created_at ASC) AS ids
      FROM public.app_notifications
     WHERE revision_key IS NOT NULL
     GROUP BY revision_key
    HAVING count(*) > 1
  LOOP
    _ids := _grp.ids;
    _keep := _ids[1];
    _merged := '[]'::jsonb;
    _targets := ARRAY[]::text[];

    FOR _row IN
      SELECT id, line_item_changes, target_departments
        FROM public.app_notifications
       WHERE id = ANY(_ids)
       ORDER BY created_at ASC
    LOOP
      _merged := public._notif_merge_changes(_merged, COALESCE(_row.line_item_changes, '[]'::jsonb));
      _targets := _targets || COALESCE(_row.target_departments, ARRAY[]::text[]);
    END LOOP;

    SELECT COALESCE(array_agg(DISTINCT d ORDER BY d), ARRAY[]::text[])
      INTO _targets
      FROM unnest(_targets) AS d
     WHERE d IS NOT NULL AND btrim(d) <> '';

    _rows := COALESCE(jsonb_array_length(_merged), 0);
    SELECT COALESCE(SUM(
      CASE
        WHEN jsonb_typeof(v->'changed_fields') = 'array' THEN GREATEST(1, jsonb_array_length(v->'changed_fields'))
        ELSE 1
      END
    ),0)::int
      INTO _cells
      FROM jsonb_array_elements(COALESCE(_merged,'[]'::jsonb)) v;

    -- Preserve seen/ack records from rows that will be removed.
    INSERT INTO public.app_notification_reads (notification_id, user_id, user_name, department, seen_at, kind)
    SELECT _keep, r.user_id, r.user_name, r.department, r.seen_at, r.kind
      FROM public.app_notification_reads r
     WHERE r.notification_id = ANY(_ids)
       AND r.notification_id <> _keep
    ON CONFLICT (notification_id, user_id, kind) DO NOTHING;

    UPDATE public.app_notifications
       SET line_item_changes = _merged,
           target_departments = _targets,
           total_changed_rows = _rows,
           total_changed_cells = _cells,
           title = CASE
             WHEN _rows > 0 AND record_ref IS NOT NULL
             THEN record_ref || ' — ' || _rows || ' change' || CASE WHEN _rows=1 THEN '' ELSE 's' END
             ELSE title END,
           merge_meta = jsonb_set(
             COALESCE(merge_meta, '{}'::jsonb),
             '{merge_count}',
             to_jsonb(GREATEST(COALESCE((merge_meta->>'merge_count')::int, 1), cardinality(_ids)))
           )
     WHERE id = _keep;

    DELETE FROM public.app_notifications
     WHERE id = ANY(_ids) AND id <> _keep;
  END LOOP;
END $$;

-- Related notification lookup now respects department-level visibility while still allowing
-- admins, notification managers, and actors to access their tracking rows.
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
  WITH me AS (
    SELECT
      auth.uid() AS uid,
      public.current_user_modules() AS mods,
      public.current_user_department() AS dept,
      public.has_role(auth.uid(), 'admin'::public.app_role) AS is_admin,
      public.has_module_access(auth.uid(), 'notifications') AS has_notif_access
  )
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

GRANT EXECUTE ON FUNCTION public.get_related_notifications(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text[], integer) TO authenticated, service_role;