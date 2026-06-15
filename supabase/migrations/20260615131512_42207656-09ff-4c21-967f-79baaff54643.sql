
-- Short-circuit emit_notification for empty line-item-change events
CREATE OR REPLACE FUNCTION public.emit_notification(
  _module text, _event text, _record_id uuid, _record_ref text, _client text,
  _title text, _summary text, _old jsonb, _new jsonb,
  _order_root uuid DEFAULT NULL,
  _boq uuid DEFAULT NULL,
  _pi uuid DEFAULT NULL,
  _po uuid DEFAULT NULL,
  _req uuid DEFAULT NULL,
  _annex uuid DEFAULT NULL,
  _line_changes jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_dept text := public.current_user_department();
  _actor_name text := public.current_user_name();
  _targets text[];
BEGIN
  -- Skip empty line-item-change events outright.
  IF _event LIKE '%line_items_changed%' AND
     (_line_changes IS NULL OR jsonb_typeof(_line_changes) <> 'array' OR jsonb_array_length(_line_changes) = 0) THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT department), ARRAY[]::text[])
    INTO _targets
  FROM public.notification_recipients
  WHERE is_active = true
    AND department IS DISTINCT FROM _actor_dept;

  INSERT INTO public.app_notifications
    (module, event_type, record_id, record_ref, client_name,
     title, summary, old_value, new_value,
     actor_user_id, actor_user_name, actor_department, target_departments,
     related_order_root_id, related_boq_id, related_pi_id, related_po_id,
     related_requisition_id, related_annexure_id, line_item_changes)
  VALUES
    (_module, _event, _record_id, _record_ref, _client,
     _title, _summary, _old, _new,
     auth.uid(), _actor_name, _actor_dept, _targets,
     _order_root, _boq, _pi, _po, _req, _annex, _line_changes);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'emit_notification failed: %', SQLERRM;
END $$;

-- BOQ INSERT: single notification, label depending on revision/auto-create context.
CREATE OR REPLACE FUNCTION public.notif_on_boqs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _root uuid;
  _diff jsonb;
  _is_revision boolean;
  _title text;
  _event text;
BEGIN
  SELECT COALESCE(o.parent_order_id, o.id) INTO _root FROM public.orders o WHERE o.id = NEW.order_id;

  IF TG_OP = 'INSERT' THEN
    _is_revision := COALESCE(NEW.revision, 0) > 0 OR NEW.revised_from_id IS NOT NULL;
    IF _is_revision THEN
      _event := 'revision_created';
      _title := 'Revised BOQ Created: ' || COALESCE(NEW.boq_number, '');
    ELSE
      _event := 'auto_created_from_oa';
      _title := 'BOQ Created from OA' ||
                CASE WHEN NEW.boq_number IS NOT NULL THEN ': ' || NEW.boq_number ELSE '' END;
    END IF;
    PERFORM public.emit_notification('boq', _event, NEW.id, NEW.boq_number, NEW.client_name,
      _title, NEW.client_name, NULL, NULL,
      _root, NEW.id, NULL, NULL, NULL, NULL, NULL);
    RETURN NEW;
  END IF;

  -- UPDATE: only fire when something actually changed.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_notification('boq','status_changed',NEW.id,NEW.boq_number,NEW.client_name,
      'BOQ '||COALESCE(NEW.boq_number,'')||' status changed',
      'Status: '||COALESCE(OLD.status::text,'')||' → '||COALESCE(NEW.status::text,''),
      jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status),
      _root, NEW.id, NULL, NULL, NULL, NULL, NULL);
  END IF;
  IF NEW.design_review_status IS DISTINCT FROM OLD.design_review_status THEN
    PERFORM public.emit_notification('boq','design_status_changed',NEW.id,NEW.boq_number,NEW.client_name,
      'BOQ '||COALESCE(NEW.boq_number,'')||' design status: '||COALESCE(NEW.design_review_status,''),
      NULL,
      jsonb_build_object('design_review_status',OLD.design_review_status),
      jsonb_build_object('design_review_status',NEW.design_review_status),
      _root, NEW.id, NULL, NULL, NULL, NULL, NULL);
  END IF;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    PERFORM public.emit_notification('boq','verification_changed',NEW.id,NEW.boq_number,NEW.client_name,
      'BOQ '||COALESCE(NEW.boq_number,'')||' verification: '||COALESCE(NEW.verification_status,''),
      NULL,
      jsonb_build_object('verification_status',OLD.verification_status),
      jsonb_build_object('verification_status',NEW.verification_status),
      _root, NEW.id, NULL, NULL, NULL, NULL, NULL);
  END IF;
  _diff := public._line_items_diff(OLD.line_items, NEW.line_items);
  IF _diff IS NOT NULL AND jsonb_typeof(_diff) = 'array' AND jsonb_array_length(_diff) > 0 THEN
    PERFORM public.emit_notification('boq','line_items_changed',NEW.id,NEW.boq_number,NEW.client_name,
      'BOQ '||COALESCE(NEW.boq_number,'')||': line items updated',
      jsonb_array_length(_diff)||' line item(s) changed',
      NULL, NULL,
      _root, NEW.id, NULL, NULL, NULL, NULL, _diff);
  END IF;
  RETURN NEW;
END $$;

-- Design comment trigger: also fire on UPDATE, capture old/new comment, skip when unchanged.
CREATE OR REPLACE FUNCTION public.notif_on_design_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bnum text; _client text; _root uuid;
  _old_comment text;
  _new_comment text;
BEGIN
  _new_comment := COALESCE(NEW.comment, '');
  IF TG_OP = 'UPDATE' THEN
    _old_comment := COALESCE(OLD.comment, '');
    IF _old_comment = _new_comment THEN
      RETURN NEW;
    END IF;
  ELSE
    _old_comment := '';
    IF _new_comment = '' THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT b.boq_number, b.client_name, COALESCE(o.parent_order_id, o.id)
    INTO _bnum, _client, _root
    FROM public.boqs b
    LEFT JOIN public.orders o ON o.id = b.order_id
   WHERE b.id = NEW.boq_id;

  PERFORM public.emit_notification(
    'design_comment',
    CASE WHEN TG_OP = 'UPDATE' THEN 'comment_updated' ELSE 'comment_added' END,
    NEW.boq_id, _bnum, _client,
    'Design comment on '||COALESCE(_bnum,'BOQ'),
    LEFT(_new_comment, 200),
    jsonb_build_object(
      'boq_item_id', NEW.boq_item_id,
      'column_key', NEW.column_key,
      'old_comment', _old_comment
    ),
    jsonb_build_object(
      'boq_item_id', NEW.boq_item_id,
      'column_key', NEW.column_key,
      'new_comment', _new_comment,
      'commented_by', NEW.user_name,
      'commented_at', COALESCE(NEW.updated_at, NEW.created_at)
    ),
    _root, NEW.boq_id, NULL, NULL, NULL, NULL, NULL);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notif_design_comment ON public.boq_design_comments;
CREATE TRIGGER trg_notif_design_comment
AFTER INSERT OR UPDATE ON public.boq_design_comments
FOR EACH ROW EXECUTE FUNCTION public.notif_on_design_comment();
