
-- 1) Add dedupe_key column + index
ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE INDEX IF NOT EXISTS app_notifications_dedupe_key_idx
  ON public.app_notifications (dedupe_key, created_at DESC);

-- 2) Backfill historical rows so any future emit sees a stable key
UPDATE public.app_notifications
   SET dedupe_key = module || ':' || event_type || ':'
                    || COALESCE(record_id::text, '-') || ':'
                    || COALESCE(actor_user_id::text, '-')
 WHERE dedupe_key IS NULL;

-- 3) Replace emit_notification: dedupe per (module,event,record,actor)
--    while the existing notification is still unread by any recipient.
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
  _dedupe_key text;
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

  -- Per-document, per-actor dedupe key.
  _dedupe_key := _module || ':' || _event || ':'
                 || COALESCE(_record_id::text, '-') || ':'
                 || COALESCE(_actor_uid::text, '-');

  -- Find the most recent notification with this key that has NOT yet been
  -- read by anyone. While it is still unread, new edits on the same record
  -- merge into it (one notification per department per document edit cycle).
  -- Once any recipient opens it, the next edit starts a fresh notification.
  SELECT n.id, n.line_item_changes
    INTO _existing_id, _existing_changes
    FROM public.app_notifications n
   WHERE n.dedupe_key = _dedupe_key
     AND NOT EXISTS (
       SELECT 1 FROM public.app_notification_reads r
        WHERE r.notification_id = n.id
     )
   ORDER BY n.created_at DESC
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
           summary = COALESCE(_summary, summary),
           new_value = COALESCE(_new, new_value),
           target_departments = (
             SELECT ARRAY(SELECT DISTINCT unnest(target_departments || _targets))
           ),
           created_at = now()
     WHERE id = _existing_id;
    RETURN;
  END IF;

  INSERT INTO public.app_notifications
    (module, event_type, record_id, record_ref, client_name,
     title, summary, old_value, new_value,
     actor_user_id, actor_user_name, actor_department, target_departments,
     related_order_root_id, related_boq_id, related_pi_id, related_po_id,
     related_requisition_id, related_annexure_id, line_item_changes,
     dedupe_key)
  VALUES
    (_module, _event, _record_id, _record_ref, _client,
     _title, _summary, _old, _new,
     _actor_uid, _actor_name, _actor_dept, _targets,
     _order_root, _boq, _pi, _po, _req, _annex, _line_changes,
     _dedupe_key);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_notification failed: %', SQLERRM;
END $function$;
