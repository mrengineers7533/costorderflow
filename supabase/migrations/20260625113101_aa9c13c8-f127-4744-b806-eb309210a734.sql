
-- 1. Add audit/merge columns.
ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS revision_key text,
  ADD COLUMN IF NOT EXISTS total_changed_rows int,
  ADD COLUMN IF NOT EXISTS total_changed_cells int;

CREATE INDEX IF NOT EXISTS idx_app_notif_merge_lookup
  ON public.app_notifications (module, record_id, revision_key, created_at DESC);

-- 2. Helper: compute revision_key per module.
CREATE OR REPLACE FUNCTION public._notif_revision_key(_module text, _record_id uuid, _boq uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _rev int; _id uuid;
BEGIN
  IF _module = 'order' THEN
    SELECT COALESCE(revision, 0) INTO _rev FROM public.orders WHERE id = _record_id;
    RETURN COALESCE(_record_id::text,'-') || ':r' || COALESCE(_rev, 0);
  ELSIF _module = 'boq' THEN
    SELECT COALESCE(revision, 0) INTO _rev FROM public.boqs WHERE id = _record_id;
    RETURN COALESCE(_record_id::text,'-') || ':r' || COALESCE(_rev, 0);
  ELSIF _module = 'design_comment' THEN
    _id := COALESCE(_boq, _record_id);
    SELECT COALESCE(revision, 0) INTO _rev FROM public.boqs WHERE id = _id;
    RETURN 'boq:' || COALESCE(_id::text,'-') || ':r' || COALESCE(_rev, 0);
  ELSE
    -- Other modules: merge until acknowledged, no revision concept.
    RETURN _module || ':' || COALESCE(_record_id::text,'-') || ':open';
  END IF;
END $$;

-- 3. Helper: dedupe + count line changes.
CREATE OR REPLACE FUNCTION public._notif_merge_changes(_existing jsonb, _incoming jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _out jsonb := COALESCE(_existing, '[]'::jsonb);
  _seen text[] := ARRAY[]::text[];
  _it jsonb;
  _key text;
BEGIN
  IF jsonb_typeof(_out) <> 'array' THEN _out := '[]'::jsonb; END IF;
  -- Seed seen-set from existing.
  IF jsonb_array_length(_out) > 0 THEN
    FOR _it IN SELECT value FROM jsonb_array_elements(_out) LOOP
      _key := COALESCE(_it->>'line_no','-') || '|' || COALESCE((_it->>'changed_fields'),'');
      _seen := array_append(_seen, _key);
    END LOOP;
  END IF;
  IF _incoming IS NULL OR jsonb_typeof(_incoming) <> 'array' THEN RETURN _out; END IF;
  FOR _it IN SELECT value FROM jsonb_array_elements(_incoming) LOOP
    _key := COALESCE(_it->>'line_no','-') || '|' || COALESCE((_it->>'changed_fields'),'');
    IF NOT (_key = ANY(_seen)) THEN
      _out := _out || jsonb_build_array(_it);
      _seen := array_append(_seen, _key);
    END IF;
  END LOOP;
  RETURN _out;
END $$;

-- 4. Replace emit_notification: fan-out + per-revision merge.
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
  _dept text;
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

  FOREACH _dept IN ARRAY _targets LOOP
    BEGIN
      -- Look for an existing un-acknowledged notification for this dept + revision.
      SELECT n.id, n.line_item_changes
        INTO _existing_id, _existing_changes
        FROM public.app_notifications n
       WHERE n.module = _module
         AND n.record_id IS NOT DISTINCT FROM _record_id
         AND n.revision_key = _rev_key
         AND n.target_departments = ARRAY[_dept]
         AND n.event_type = _event
         AND NOT EXISTS (
           SELECT 1 FROM public.app_notification_reads r
            WHERE r.notification_id = n.id
         )
       ORDER BY n.created_at DESC
       LIMIT 1;

      IF _existing_id IS NOT NULL THEN
        _merged_changes := public._notif_merge_changes(_existing_changes, _line_changes);
        _merge_count := COALESCE(jsonb_array_length(_merged_changes), 0);
        _total_rows := _merge_count;
        SELECT COALESCE(SUM(
          GREATEST(1, COALESCE(array_length(string_to_array(v->>'changed_fields',','),1),1))
        ),0)::int INTO _total_cells
          FROM jsonb_array_elements(COALESCE(_merged_changes,'[]'::jsonb)) v;

        UPDATE public.app_notifications
           SET line_item_changes = _merged_changes,
               total_changed_rows = _total_rows,
               total_changed_cells = _total_cells,
               title = CASE
                 WHEN _merge_count > 0
                 THEN initcap(_module) || ' Updated — ' || _merge_count || ' change' || CASE WHEN _merge_count=1 THEN '' ELSE 's' END
                 ELSE _title
               END,
               new_value = COALESCE(_new, new_value),
               merge_meta = jsonb_build_object(
                 'merge_count', COALESCE((merge_meta->>'merge_count')::int,1) + 1,
                 'first_created_at', COALESCE(merge_meta->>'first_created_at', created_at::text),
                 'last_merged_at', now()::text)
         WHERE id = _existing_id;
      ELSE
        _total_rows := COALESCE(jsonb_array_length(COALESCE(_line_changes,'[]'::jsonb)),0);
        SELECT COALESCE(SUM(
          GREATEST(1, COALESCE(array_length(string_to_array(v->>'changed_fields',','),1),1))
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
           _title, _summary, _old, _new,
           _actor_uid, _actor_name, _actor_dept, ARRAY[_dept],
           _order_root, _boq, _pi, _po, _req, _annex, _line_changes,
           _module || ':' || _event || ':' || COALESCE(_record_id::text,'-') || ':' || _dept || ':' || _rev_key,
           jsonb_build_object('merge_count',1,'first_created_at',now()::text,'last_merged_at',now()::text),
           _rev_key, _total_rows, _total_cells);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'emit_notification per-dept insert failed (%): %', _dept, SQLERRM;
    END;
  END LOOP;
END $function$;
