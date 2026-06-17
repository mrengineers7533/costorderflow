
CREATE OR REPLACE FUNCTION public.emit_notification(
  _module text, _event text, _record_id uuid, _record_ref text, _client text,
  _title text, _summary text, _old jsonb, _new jsonb,
  _order_root uuid DEFAULT NULL, _boq uuid DEFAULT NULL, _pi uuid DEFAULT NULL,
  _po uuid DEFAULT NULL, _req uuid DEFAULT NULL, _annex uuid DEFAULT NULL,
  _line_changes jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _actor_dept text := public.current_user_department();
  _actor_uid  uuid := auth.uid();
  _actor_name text := public.current_user_name();
  _actor_mods public.notif_module[];
  _src_module public.notif_module := public.notif_source_module(_module, _event);
  _targets text[];
  _suppress text := current_setting('notif.suppress_cascade', true);
  _existing_id uuid;
  _existing_changes jsonb;
  _merged_changes jsonb;
BEGIN
  IF _suppress = 'on' THEN
    RETURN;
  END IF;

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

  IF _targets IS NULL OR cardinality(_targets) = 0 THEN
    RETURN;
  END IF;

  -- Defensive consolidation: if the same actor just emitted a notification
  -- for the same (module, event, record) within the last 5 seconds, merge
  -- the new change details into that existing notification instead of
  -- creating a duplicate row. This guarantees "one save = one notification
  -- per department" even if a future code path forgets to set the
  -- suppression flag.
  SELECT id, line_item_changes
    INTO _existing_id, _existing_changes
    FROM public.app_notifications
   WHERE module = _module
     AND event_type = _event
     AND record_id IS NOT DISTINCT FROM _record_id
     AND actor_user_id IS NOT DISTINCT FROM _actor_uid
     AND created_at > now() - interval '5 seconds'
   ORDER BY created_at DESC
   LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    IF _line_changes IS NOT NULL AND jsonb_typeof(_line_changes) = 'array' THEN
      IF _existing_changes IS NULL OR jsonb_typeof(_existing_changes) <> 'array' THEN
        _merged_changes := _line_changes;
      ELSE
        _merged_changes := _existing_changes || _line_changes;
      END IF;
    ELSE
      _merged_changes := _existing_changes;
    END IF;

    UPDATE public.app_notifications
       SET line_item_changes = _merged_changes,
           summary = COALESCE(summary, _summary),
           new_value = COALESCE(new_value, _new),
           target_departments = (
             SELECT ARRAY(SELECT DISTINCT unnest(target_departments || _targets))
           )
     WHERE id = _existing_id;
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
