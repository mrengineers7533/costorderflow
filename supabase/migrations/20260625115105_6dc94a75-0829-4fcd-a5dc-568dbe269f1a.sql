
-- 1. app_notification_reads: add kind, drop old uniqueness, add new uniqueness
ALTER TABLE public.app_notification_reads
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ack'
    CHECK (kind IN ('seen','ack'));

ALTER TABLE public.app_notification_reads
  DROP CONSTRAINT IF EXISTS app_notification_reads_notification_id_user_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_notification_reads_notif_user_kind_key'
  ) THEN
    ALTER TABLE public.app_notification_reads
      ADD CONSTRAINT app_notification_reads_notif_user_kind_key
      UNIQUE (notification_id, user_id, kind);
  END IF;
END $$;

-- 2. Rewrite emit_notification: merge on (revision_key, dept) only.
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
      -- Merge by (revision, dept). Ignore record_id/event_type so design
      -- comments and multiple edit events on the same revision collapse.
      SELECT n.id, n.line_item_changes
        INTO _existing_id, _existing_changes
        FROM public.app_notifications n
       WHERE n.revision_key = _rev_key
         AND _dept = ANY(n.target_departments)
         AND NOT EXISTS (
           SELECT 1 FROM public.app_notification_reads r
            WHERE r.notification_id = n.id AND r.kind = 'ack'
         )
       ORDER BY n.created_at ASC
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
                 WHEN _merge_count > 0 AND record_ref IS NOT NULL
                 THEN record_ref || ' — ' || _merge_count || ' change' || CASE WHEN _merge_count=1 THEN '' ELSE 's' END
                 WHEN _merge_count > 0
                 THEN initcap(_module) || ' — ' || _merge_count || ' change' || CASE WHEN _merge_count=1 THEN '' ELSE 's' END
                 ELSE title
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
           CASE WHEN _total_rows > 0 AND _record_ref IS NOT NULL
                THEN _record_ref || ' — ' || _total_rows || ' change' || CASE WHEN _total_rows=1 THEN '' ELSE 's' END
                ELSE _title END,
           _summary, _old, _new,
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

-- 3. Backfill revision_key for existing rows
UPDATE public.app_notifications n
   SET revision_key = public._notif_revision_key(n.module, n.record_id, n.related_boq_id)
 WHERE revision_key IS NULL;

-- 4. Backfill: collapse duplicates per (revision_key, target_department).
DO $$
DECLARE
  _grp record;
  _keep uuid;
  _ids uuid[];
  _merged jsonb;
  _row jsonb;
  _it jsonb;
  _rows int;
  _cells int;
BEGIN
  FOR _grp IN
    SELECT revision_key, target_departments[1] AS dept,
           array_agg(id ORDER BY created_at ASC) AS ids
      FROM public.app_notifications
     WHERE revision_key IS NOT NULL
       AND target_departments IS NOT NULL
       AND array_length(target_departments,1) = 1
       AND NOT EXISTS (
         SELECT 1 FROM public.app_notification_reads r
          WHERE r.notification_id = app_notifications.id
            AND r.kind = 'ack'
       )
     GROUP BY revision_key, target_departments[1]
     HAVING count(*) > 1
  LOOP
    _ids := _grp.ids;
    _keep := _ids[1];
    _merged := '[]'::jsonb;
    FOR _row IN
      SELECT line_item_changes FROM public.app_notifications WHERE id = ANY(_ids) ORDER BY created_at ASC
    LOOP
      _merged := public._notif_merge_changes(_merged, _row);
    END LOOP;
    _rows := COALESCE(jsonb_array_length(_merged), 0);
    SELECT COALESCE(SUM(GREATEST(1, COALESCE(array_length(string_to_array(v->>'changed_fields',','),1),1))),0)::int
      INTO _cells
      FROM jsonb_array_elements(COALESCE(_merged,'[]'::jsonb)) v;

    UPDATE public.app_notifications
       SET line_item_changes = _merged,
           total_changed_rows = _rows,
           total_changed_cells = _cells,
           title = CASE
             WHEN _rows > 0 AND record_ref IS NOT NULL
             THEN record_ref || ' — ' || _rows || ' change' || CASE WHEN _rows=1 THEN '' ELSE 's' END
             ELSE title END
     WHERE id = _keep;

    DELETE FROM public.app_notifications
     WHERE id = ANY(_ids) AND id <> _keep;
  END LOOP;
END $$;

-- _notif_merge_changes expects (jsonb, jsonb) where both are arrays. The loop above
-- passes a single row's line_item_changes (already an array), so the call is valid.

-- 5. mark_notification_seen RPC
CREATE OR REPLACE FUNCTION public.mark_notification_seen(_notif_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _dept text;
  _name text;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF NOT public.can_ack_notification(_notif_id, _uid) THEN RETURN false; END IF;
  SELECT department, name INTO _dept, _name
    FROM public.notification_recipients
   WHERE user_id = _uid AND is_active = true LIMIT 1;
  INSERT INTO public.app_notification_reads
    (notification_id, user_id, user_name, department, kind)
  VALUES (_notif_id, _uid, _name, _dept, 'seen')
  ON CONFLICT (notification_id, user_id, kind) DO NOTHING;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.mark_notification_seen(uuid) TO authenticated;

-- 6. get_notification_tracking RPC for actor + admin
CREATE OR REPLACE FUNCTION public.get_notification_tracking(_notif_id uuid)
RETURNS TABLE (
  department text,
  seen_by text,
  seen_at timestamptz,
  ack_by text,
  ack_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _actor uuid;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  SELECT actor_user_id INTO _actor FROM public.app_notifications WHERE id = _notif_id;
  IF _actor IS DISTINCT FROM _uid AND NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH n AS (SELECT target_departments FROM public.app_notifications WHERE id = _notif_id)
  SELECT t::text AS department,
         (SELECT r.user_name FROM public.app_notification_reads r
            WHERE r.notification_id = _notif_id AND r.kind='seen'
              AND lower(regexp_replace(coalesce(r.department,''), '\s+', ' ', 'g'))
                = lower(regexp_replace(coalesce(t,''), '\s+', ' ', 'g'))
            ORDER BY r.seen_at ASC LIMIT 1) AS seen_by,
         (SELECT r.seen_at FROM public.app_notification_reads r
            WHERE r.notification_id = _notif_id AND r.kind='seen'
              AND lower(regexp_replace(coalesce(r.department,''), '\s+', ' ', 'g'))
                = lower(regexp_replace(coalesce(t,''), '\s+', ' ', 'g'))
            ORDER BY r.seen_at ASC LIMIT 1) AS seen_at,
         (SELECT r.user_name FROM public.app_notification_reads r
            WHERE r.notification_id = _notif_id AND r.kind='ack'
              AND lower(regexp_replace(coalesce(r.department,''), '\s+', ' ', 'g'))
                = lower(regexp_replace(coalesce(t,''), '\s+', ' ', 'g'))
            ORDER BY r.seen_at ASC LIMIT 1) AS ack_by,
         (SELECT r.seen_at FROM public.app_notification_reads r
            WHERE r.notification_id = _notif_id AND r.kind='ack'
              AND lower(regexp_replace(coalesce(r.department,''), '\s+', ' ', 'g'))
                = lower(regexp_replace(coalesce(t,''), '\s+', ' ', 'g'))
            ORDER BY r.seen_at ASC LIMIT 1) AS ack_at
    FROM n, unnest(n.target_departments) t;
END $$;

GRANT EXECUTE ON FUNCTION public.get_notification_tracking(uuid) TO authenticated;
