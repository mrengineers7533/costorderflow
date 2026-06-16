
-- Helper: format human-readable per-field change block for a line-items diff.
CREATE OR REPLACE FUNCTION public._format_boq_item_changes(_diff jsonb, _oa text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _entry jsonb;
  _kind text;
  _line text;
  _model text;
  _desc text;
  _fields text[];
  _f text;
  _label text;
  _old text;
  _new text;
  _out text := '';
  _blocks int := 0;
  _max_blocks int := 25;
BEGIN
  IF _diff IS NULL OR jsonb_typeof(_diff) <> 'array' THEN RETURN NULL; END IF;

  FOR _entry IN SELECT value FROM jsonb_array_elements(_diff) LOOP
    EXIT WHEN _blocks >= _max_blocks;
    _kind := _entry->>'kind';
    _line := COALESCE(_entry->>'line_no', '');
    _model := COALESCE(_entry->'after'->>'model_number',
                       _entry->'after'->>'model',
                       _entry->'before'->>'model_number',
                       _entry->'before'->>'model', '');
    _desc  := COALESCE(_entry->'after'->>'description',
                       _entry->'before'->>'description', '');

    IF _kind = 'added' THEN
      _out := _out
        || E'\n'
        || (CASE WHEN _oa IS NOT NULL AND _oa <> '' THEN 'OA No.: ' || _oa || E'\n' ELSE '' END)
        || 'Line Item: ' || _line || E'\n'
        || (CASE WHEN _model <> '' THEN 'Model: ' || _model || E'\n' ELSE '' END)
        || (CASE WHEN _desc  <> '' THEN 'Description: ' || _desc || E'\n' ELSE '' END)
        || 'Field / Option Changed: Line item' || E'\n'
        || 'Old Value: blank' || E'\n'
        || 'Current Value: Added';
      _blocks := _blocks + 1;
      CONTINUE;
    ELSIF _kind = 'removed' THEN
      _out := _out
        || E'\n'
        || (CASE WHEN _oa IS NOT NULL AND _oa <> '' THEN 'OA No.: ' || _oa || E'\n' ELSE '' END)
        || 'Line Item: ' || _line || E'\n'
        || (CASE WHEN _model <> '' THEN 'Model: ' || _model || E'\n' ELSE '' END)
        || (CASE WHEN _desc  <> '' THEN 'Description: ' || _desc || E'\n' ELSE '' END)
        || 'Field / Option Changed: Line item' || E'\n'
        || 'Old Value: Existed' || E'\n'
        || 'Current Value: blank';
      _blocks := _blocks + 1;
      CONTINUE;
    END IF;

    -- modified
    SELECT array_agg(elem #>> '{}') INTO _fields
      FROM jsonb_array_elements(COALESCE(_entry->'changed_fields', '[]'::jsonb)) elem;
    IF _fields IS NULL THEN CONTINUE; END IF;

    FOREACH _f IN ARRAY _fields LOOP
      EXIT WHEN _blocks >= _max_blocks;
      _label := CASE _f
        WHEN 'approval_status' THEN 'Approve'
        WHEN 'model_number'    THEN 'Model'
        WHEN 'model'           THEN 'Model'
        WHEN 'description'     THEN 'Description'
        WHEN 'quantity'        THEN 'Qty'
        WHEN 'unit'            THEN 'Unit'
        WHEN 'motor'           THEN 'Motor'
        WHEN 'motor_quantity'  THEN 'Motor Qty'
        WHEN 'remarks'         THEN 'Remarks'
        ELSE NULL
      END;
      IF _label IS NULL THEN CONTINUE; END IF;

      _old := COALESCE(NULLIF(_entry->'before'->>_f, ''), 'blank');
      _new := COALESCE(NULLIF(_entry->'after'->>_f, ''), 'blank');
      IF _old = _new THEN CONTINUE; END IF;

      _out := _out
        || E'\n'
        || (CASE WHEN _oa IS NOT NULL AND _oa <> '' THEN 'OA No.: ' || _oa || E'\n' ELSE '' END)
        || 'Line Item: ' || _line || E'\n'
        || (CASE WHEN _model <> '' THEN 'Model: ' || _model || E'\n' ELSE '' END)
        || (CASE WHEN _desc  <> '' THEN 'Description: ' || _desc || E'\n' ELSE '' END)
        || 'Field / Option Changed: ' || _label || E'\n'
        || 'Old Value: ' || _old || E'\n'
        || 'Current Value: ' || _new;
      _blocks := _blocks + 1;
    END LOOP;
  END LOOP;

  IF _blocks = 0 THEN RETURN NULL; END IF;
  RETURN ltrim(_out, E'\n');
END;
$$;

-- Design item approve/unapprove trigger: rich per-item notification.
CREATE OR REPLACE FUNCTION public.notif_on_design_item_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bnum text;
  _client text;
  _root uuid;
  _oa text;
  _item jsonb;
  _line_no text;
  _model text;
  _desc text;
  _old_status text;
  _old_label text;
  _new_label text;
  _actor_name text;
  _actor_email text;
  _summary text;
  _new_payload jsonb;
BEGIN
  SELECT b.boq_number, b.client_name, COALESCE(o.parent_order_id, o.id), o.oa_number
    INTO _bnum, _client, _root, _oa
    FROM public.boqs b
    LEFT JOIN public.orders o ON o.id = b.order_id
   WHERE b.id = NEW.boq_id;

  -- Resolve item details from the BOQ snapshot.
  SELECT value INTO _item
    FROM public.boqs b, jsonb_array_elements(COALESCE(b.line_items, '[]'::jsonb)) value
   WHERE b.id = NEW.boq_id AND value->>'id' = NEW.boq_item_id
   LIMIT 1;

  _line_no := COALESCE(_item->>'item_no', _item->>'line_no', '');
  _model   := COALESCE(_item->>'model_number', _item->>'model', '');
  _desc    := COALESCE(_item->>'description', '');

  IF TG_OP = 'UPDATE' THEN
    _old_status := OLD.status;
  ELSE
    _old_status := NULL;
  END IF;

  _old_label := CASE
    WHEN _old_status IS NULL OR _old_status = '' OR _old_status = 'pending' THEN 'blank'
    WHEN _old_status = 'approved' THEN 'Approved'
    WHEN _old_status = 'not_approved' THEN 'Not Approved'
    ELSE _old_status
  END;
  _new_label := CASE NEW.status
    WHEN 'approved' THEN 'Approved'
    WHEN 'not_approved' THEN 'Not Approved'
    WHEN 'pending' THEN 'Pending'
    ELSE NEW.status
  END;

  -- Don't notify if nothing actually changed.
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status,'') = COALESCE(NEW.status,'') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, NEW.decided_by_name), p.email
    INTO _actor_name, _actor_email
    FROM public.profiles p
   WHERE p.id = NEW.decided_by;

  _summary :=
    (CASE WHEN _oa IS NOT NULL AND _oa <> '' THEN 'OA No.: ' || _oa || E'\n' ELSE '' END)
    || 'Line Item: ' || _line_no || E'\n'
    || (CASE WHEN _model <> '' THEN 'Model: ' || _model || E'\n' ELSE '' END)
    || (CASE WHEN _desc  <> '' THEN 'Description: ' || _desc || E'\n' ELSE '' END)
    || 'Field / Option Changed: Approve' || E'\n'
    || 'Old Value: ' || _old_label || E'\n'
    || 'Current Value: ' || _new_label
    || (CASE WHEN NEW.status = 'not_approved' AND NEW.reason IS NOT NULL AND NEW.reason <> ''
             THEN E'\nReason: ' || LEFT(NEW.reason, 240) ELSE '' END);

  _new_payload := jsonb_build_object(
    'oa_number', _oa,
    'boq_number', _bnum,
    'boq_revision', NEW.boq_revision,
    'line_item_no', _line_no,
    'model', _model,
    'description', _desc,
    'field_changed', 'Approve',
    'old_value', _old_label,
    'current_value', _new_label,
    'edited_by_name', _actor_name,
    'edited_by_email', _actor_email,
    'edited_at', COALESCE(NEW.decided_at, now()),
    'source_module', 'design',
    'reason', NEW.reason,
    'status', NEW.status,
    'boq_item_id', NEW.boq_item_id
  );

  PERFORM public.emit_notification(
    'boq',
    'design_item_status_changed',
    NEW.boq_id,
    _bnum,
    _client,
    'Design item updated',
    _summary,
    CASE WHEN TG_OP = 'UPDATE'
         THEN jsonb_build_object('status', OLD.status, 'old_value', _old_label)
         ELSE jsonb_build_object('old_value', _old_label) END,
    _new_payload,
    _root, NEW.boq_id, NULL, NULL, NULL, NULL, NULL
  );
  RETURN NEW;
END $function$;

-- BOQ trigger: enrich line_items_changed summary with per-field detail.
CREATE OR REPLACE FUNCTION public.notif_on_boqs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _root uuid;
  _diff jsonb;
  _is_revision boolean;
  _title text;
  _event text;
  _oa text;
  _detail text;
  _summary text;
BEGIN
  SELECT COALESCE(o.parent_order_id, o.id), o.oa_number
    INTO _root, _oa
    FROM public.orders o WHERE o.id = NEW.order_id;

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
    _detail := public._format_boq_item_changes(_diff, _oa);
    _summary := 'BOQ '||COALESCE(NEW.boq_number,'')||': '
                || jsonb_array_length(_diff)||' line item(s) changed'
                || CASE WHEN _detail IS NOT NULL THEN E'\n\n'||_detail ELSE '' END;
    PERFORM public.emit_notification('boq','line_items_changed',NEW.id,NEW.boq_number,NEW.client_name,
      'BOQ '||COALESCE(NEW.boq_number,'')||': line items updated',
      _summary,
      NULL, jsonb_build_object('oa_number', _oa, 'detail', _detail),
      _root, NEW.id, NULL, NULL, NULL, NULL, _diff);
  END IF;
  RETURN NEW;
END $function$;

-- Order trigger: enrich line_items_changed summary with per-field detail.
CREATE OR REPLACE FUNCTION public.notif_on_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _root uuid; _diff jsonb; _detail text; _summary text;
BEGIN
  _root := COALESCE(NEW.parent_order_id, NEW.id);
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.revision,0) > 0 THEN
      _diff := NULL;
      IF NEW.revised_from_id IS NOT NULL THEN
        SELECT public._line_items_diff(o.line_items, NEW.line_items)
          INTO _diff FROM public.orders o WHERE o.id = NEW.revised_from_id;
      END IF;
      PERFORM public.emit_notification('order','revision_created',NEW.id,NEW.oa_number,NEW.company_name,
        'OA Revised: '||COALESCE(NEW.oa_number,'')||' (Rev '||NEW.revision||')',
        'Revision '||NEW.revision, NULL, to_jsonb(NEW),
        _root, NULL, NULL, NULL, NULL, NULL, _diff);
    ELSE
      PERFORM public.emit_notification('order','created',NEW.id,NEW.oa_number,NEW.company_name,
        'Order created: '||COALESCE(NEW.oa_number,''), NEW.company_name, NULL, to_jsonb(NEW),
        _root, NULL, NULL, NULL, NULL, NULL, NULL);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.emit_notification('order','status_changed',NEW.id,NEW.oa_number,NEW.company_name,
        'Order '||COALESCE(NEW.oa_number,'')||' status: '||COALESCE(NEW.status::text,''),
        NULL, jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status),
        _root, NULL, NULL, NULL, NULL, NULL, NULL);
    END IF;
    _diff := public._line_items_diff(OLD.line_items, NEW.line_items);
    IF jsonb_array_length(COALESCE(_diff,'[]'::jsonb)) > 0 THEN
      _detail := public._format_boq_item_changes(_diff, NEW.oa_number);
      _summary := 'OA '||COALESCE(NEW.oa_number,'')||': '
                  || jsonb_array_length(_diff)||' line item(s) changed'
                  || CASE WHEN _detail IS NOT NULL THEN E'\n\n'||_detail ELSE '' END;
      PERFORM public.emit_notification('order','line_items_changed',NEW.id,NEW.oa_number,NEW.company_name,
        'OA '||COALESCE(NEW.oa_number,'')||': line items updated',
        _summary,
        NULL, jsonb_build_object('oa_number', NEW.oa_number, 'detail', _detail),
        _root, NULL, NULL, NULL, NULL, NULL, _diff);
    END IF;
  END IF;
  RETURN NEW;
END $function$;
