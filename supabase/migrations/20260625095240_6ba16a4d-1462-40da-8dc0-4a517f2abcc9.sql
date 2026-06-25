
-- 1. Fan-out emit_notification: one row per target department, no merging.
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

  -- Fan out: one notification row per target department. No merge / no dedupe.
  FOREACH _dept IN ARRAY _targets LOOP
    BEGIN
      INSERT INTO public.app_notifications
        (module, event_type, record_id, record_ref, client_name,
         title, summary, old_value, new_value,
         actor_user_id, actor_user_name, actor_department, target_departments,
         related_order_root_id, related_boq_id, related_pi_id, related_po_id,
         related_requisition_id, related_annexure_id, line_item_changes,
         dedupe_key, merge_meta)
      VALUES
        (_module, _event, _record_id, _record_ref, _client,
         _title, _summary, _old, _new,
         _actor_uid, _actor_name, _actor_dept, ARRAY[_dept],
         _order_root, _boq, _pi, _po, _req, _annex, _line_changes,
         _module || ':' || _event || ':'
           || COALESCE(_record_id::text, '-') || ':'
           || COALESCE(_actor_uid::text, '-') || ':' || _dept
           || ':' || extract(epoch from clock_timestamp())::text,
         jsonb_build_object('merge_count', 1,
                            'first_created_at', now()::text,
                            'last_merged_at', now()::text));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'emit_notification per-dept insert failed (%): %', _dept, SQLERRM;
    END;
  END LOOP;
END $function$;

-- 2. can_ack_notification helper.
CREATE OR REPLACE FUNCTION public.can_ack_notification(_notif_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.app_notifications n
      JOIN public.notification_recipients nr
        ON nr.user_id = _user_id AND nr.is_active = true
     WHERE n.id = _notif_id
       AND n.actor_user_id IS DISTINCT FROM _user_id
       AND EXISTS (
         SELECT 1
           FROM unnest(n.target_departments) t
          WHERE lower(regexp_replace(regexp_replace(coalesce(t,''), '\s+team$', '', 'i'), '\s+', ' ', 'g')) =
                lower(regexp_replace(regexp_replace(coalesce(nr.department,''), '\s+team$', '', 'i'), '\s+', ' ', 'g'))
       )
  );
$$;

-- 3. Tighten reads INSERT policy: must be self + can_ack.
DROP POLICY IF EXISTS "user acknowledges own" ON public.app_notification_reads;
CREATE POLICY "user acknowledges own"
ON public.app_notification_reads
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_ack_notification(notification_id, auth.uid())
);

-- 4. Tighten app_notifications SELECT: target dept only (admins / notifications module still see all).
DROP POLICY IF EXISTS "anyone with notifications access can read" ON public.app_notifications;
CREATE POLICY "notifications scoped read"
ON public.app_notifications
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_module_access(auth.uid(), 'notifications')
  OR actor_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
      FROM public.notification_recipients nr
     WHERE nr.user_id = auth.uid()
       AND nr.is_active = true
       AND EXISTS (
         SELECT 1
           FROM unnest(app_notifications.target_departments) t
          WHERE lower(regexp_replace(regexp_replace(coalesce(t,''), '\s+team$', '', 'i'), '\s+', ' ', 'g')) =
                lower(regexp_replace(regexp_replace(coalesce(nr.department,''), '\s+team$', '', 'i'), '\s+', ' ', 'g'))
       )
  )
);
