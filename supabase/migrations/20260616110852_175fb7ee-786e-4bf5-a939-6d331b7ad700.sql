-- A) Backfill module on existing notification_recipients rows
UPDATE public.notification_recipients SET module = 'design'::notif_module
 WHERE module IS NULL AND lower(department) = 'design';
UPDATE public.notification_recipients SET module = 'purchase'::notif_module
 WHERE module IS NULL AND lower(department) = 'purchase';
UPDATE public.notification_recipients SET module = 'manufacturing'::notif_module
 WHERE module IS NULL AND lower(department) = 'manufacturing';

-- For Costing rows, replace each with three module-specific rows (oa, boq, pi)
-- so the same user receives notifications for all three sub-modules but is
-- excluded only from the sub-module that performed the action.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM public.notification_recipients
     WHERE module IS NULL AND lower(department) = 'costing'
  LOOP
    INSERT INTO public.notification_recipients
      (department, module, user_id, email, name, channels, is_active)
    SELECT r.department, m::notif_module, r.user_id, r.email, r.name, r.channels, r.is_active
      FROM unnest(ARRAY['oa','boq','pi']) m
     WHERE NOT EXISTS (
       SELECT 1 FROM public.notification_recipients x
        WHERE x.department = r.department
          AND COALESCE(x.email,'') = COALESCE(r.email,'')
          AND x.module::text = m
     );
    DELETE FROM public.notification_recipients WHERE id = r.id;
  END LOOP;
END $$;

-- B) Tighten emit_notification: pure module-driven exclusion with a
-- Manufacturing override based on the actor's recipient module.
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
BEGIN
  IF _event LIKE '%line_items_changed%' AND
     (_line_changes IS NULL OR jsonb_typeof(_line_changes) <> 'array' OR jsonb_array_length(_line_changes) = 0) THEN
    RETURN;
  END IF;

  -- Resolve the actor's recipient modules to refine the source module
  -- for generic purchase/requisition/grn/annexure events. This lets a
  -- Manufacturing user editing a PO/Requisition be recognised as a
  -- Manufacturing-sourced change so Manufacturing recipients are excluded.
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