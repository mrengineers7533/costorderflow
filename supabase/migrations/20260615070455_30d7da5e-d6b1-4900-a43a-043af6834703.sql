
-- 1) Linkage columns + line-item diff store
ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS related_order_root_id uuid,
  ADD COLUMN IF NOT EXISTS related_boq_id uuid,
  ADD COLUMN IF NOT EXISTS related_pi_id uuid,
  ADD COLUMN IF NOT EXISTS related_po_id uuid,
  ADD COLUMN IF NOT EXISTS related_requisition_id uuid,
  ADD COLUMN IF NOT EXISTS related_annexure_id uuid,
  ADD COLUMN IF NOT EXISTS line_item_changes jsonb;

CREATE INDEX IF NOT EXISTS idx_app_notif_rel_order  ON public.app_notifications(related_order_root_id);
CREATE INDEX IF NOT EXISTS idx_app_notif_rel_boq    ON public.app_notifications(related_boq_id);
CREATE INDEX IF NOT EXISTS idx_app_notif_rel_pi     ON public.app_notifications(related_pi_id);
CREATE INDEX IF NOT EXISTS idx_app_notif_rel_po     ON public.app_notifications(related_po_id);
CREATE INDEX IF NOT EXISTS idx_app_notif_rel_req    ON public.app_notifications(related_requisition_id);
CREATE INDEX IF NOT EXISTS idx_app_notif_rel_annex  ON public.app_notifications(related_annexure_id);

-- 2) Line-items diff helper (matches by id, else by item_no/line_no)
CREATE OR REPLACE FUNCTION public._line_items_diff(_old jsonb, _new jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _result jsonb := '[]'::jsonb;
  _old_map jsonb := '{}'::jsonb;
  _new_map jsonb := '{}'::jsonb;
  _it jsonb;
  _id text;
  _all_ids text[];
  _o jsonb; _n jsonb;
  _changed text[];
  _k text;
  _line_no text;
BEGIN
  IF _old IS NOT NULL AND jsonb_typeof(_old) = 'array' THEN
    FOR _it IN SELECT value FROM jsonb_array_elements(_old) LOOP
      _id := COALESCE(_it->>'id', _it->>'item_no', _it->>'line_no');
      IF _id IS NOT NULL THEN _old_map := _old_map || jsonb_build_object(_id, _it); END IF;
    END LOOP;
  END IF;
  IF _new IS NOT NULL AND jsonb_typeof(_new) = 'array' THEN
    FOR _it IN SELECT value FROM jsonb_array_elements(_new) LOOP
      _id := COALESCE(_it->>'id', _it->>'item_no', _it->>'line_no');
      IF _id IS NOT NULL THEN _new_map := _new_map || jsonb_build_object(_id, _it); END IF;
    END LOOP;
  END IF;

  SELECT array_agg(DISTINCT k) INTO _all_ids
  FROM (
    SELECT jsonb_object_keys(_old_map) AS k
    UNION
    SELECT jsonb_object_keys(_new_map) AS k
  ) t;

  IF _all_ids IS NULL THEN RETURN '[]'::jsonb; END IF;

  FOREACH _id IN ARRAY _all_ids LOOP
    _o := _old_map->_id;
    _n := _new_map->_id;
    _changed := ARRAY[]::text[];
    IF _o IS NULL AND _n IS NOT NULL THEN
      _line_no := COALESCE(_n->>'item_no', _n->>'line_no', _id);
      _result := _result || jsonb_build_array(jsonb_build_object(
        'line_no', _line_no, 'kind', 'added', 'before', NULL, 'after', _n,
        'changed_fields', _changed
      ));
    ELSIF _n IS NULL AND _o IS NOT NULL THEN
      _line_no := COALESCE(_o->>'item_no', _o->>'line_no', _id);
      _result := _result || jsonb_build_array(jsonb_build_object(
        'line_no', _line_no, 'kind', 'removed', 'before', _o, 'after', NULL,
        'changed_fields', _changed
      ));
    ELSIF _o IS NOT NULL AND _n IS NOT NULL THEN
      FOR _k IN
        SELECT key FROM (
          SELECT jsonb_object_keys(_o) AS key
          UNION
          SELECT jsonb_object_keys(_n) AS key
        ) s
      LOOP
        IF _k IN ('id','created_at','updated_at') THEN CONTINUE; END IF;
        IF COALESCE(_o->_k, 'null'::jsonb) IS DISTINCT FROM COALESCE(_n->_k, 'null'::jsonb) THEN
          _changed := array_append(_changed, _k);
        END IF;
      END LOOP;
      IF COALESCE(array_length(_changed, 1), 0) > 0 THEN
        _line_no := COALESCE(_n->>'item_no', _n->>'line_no', _o->>'item_no', _id);
        _result := _result || jsonb_build_array(jsonb_build_object(
          'line_no', _line_no, 'kind', 'modified', 'before', _o, 'after', _n,
          'changed_fields', _changed
        ));
      END IF;
    END IF;
  END LOOP;

  RETURN _result;
END $$;

-- 3) Extended emit_notification (replace existing 9-arg form)
DROP FUNCTION IF EXISTS public.emit_notification(text, text, uuid, text, text, text, text, jsonb, jsonb);

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

-- 4) RPC: get notifications related to whatever record a page is showing
CREATE OR REPLACE FUNCTION public.get_related_notifications(
  p_order_root uuid DEFAULT NULL,
  p_boq uuid DEFAULT NULL,
  p_pi uuid DEFAULT NULL,
  p_po uuid DEFAULT NULL,
  p_req uuid DEFAULT NULL,
  p_annex uuid DEFAULT NULL,
  p_record_id uuid DEFAULT NULL,
  p_modules text[] DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS SETOF public.app_notifications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.*
  FROM public.app_notifications n
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
  ORDER BY n.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_related_notifications(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text[],integer) TO authenticated;

-- 5) Updated triggers — set link columns and line-item diff
CREATE OR REPLACE FUNCTION public.notif_on_orders() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _root uuid; _diff jsonb; _prev jsonb;
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
      PERFORM public.emit_notification('order','line_items_changed',NEW.id,NEW.oa_number,NEW.company_name,
        'OA '||COALESCE(NEW.oa_number,'')||': line items updated',
        jsonb_array_length(_diff)||' line item(s) changed',
        NULL, NULL,
        _root, NULL, NULL, NULL, NULL, NULL, _diff);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notif_on_boqs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _root uuid; _diff jsonb;
BEGIN
  SELECT COALESCE(o.parent_order_id, o.id) INTO _root FROM public.orders o WHERE o.id = NEW.order_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('boq','created',NEW.id,NEW.boq_number,NEW.client_name,
      'BOQ created: '||COALESCE(NEW.boq_number,''),
      NEW.client_name, NULL, to_jsonb(NEW),
      _root, NEW.id, NULL, NULL, NULL, NULL, NULL);
  ELSIF TG_OP = 'UPDATE' THEN
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
    IF jsonb_array_length(COALESCE(_diff,'[]'::jsonb)) > 0 THEN
      PERFORM public.emit_notification('boq','line_items_changed',NEW.id,NEW.boq_number,NEW.client_name,
        'BOQ '||COALESCE(NEW.boq_number,'')||': line items updated',
        jsonb_array_length(_diff)||' line item(s) changed',
        NULL, NULL,
        _root, NEW.id, NULL, NULL, NULL, NULL, _diff);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notif_on_pi() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _root uuid; _diff jsonb;
BEGIN
  IF NEW.reference_oa_id IS NOT NULL THEN
    SELECT COALESCE(o.parent_order_id, o.id) INTO _root FROM public.orders o WHERE o.id = NEW.reference_oa_id;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('pi','created',NEW.id,NEW.pi_number,NEW.company_name,
      'PI created: '||COALESCE(NEW.pi_number,''), NEW.company_name, NULL, to_jsonb(NEW),
      _root, NULL, NEW.id, NULL, NULL, NULL, NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.emit_notification('pi','status_changed',NEW.id,NEW.pi_number,NEW.company_name,
        'PI '||COALESCE(NEW.pi_number,'')||' status: '||COALESCE(NEW.status::text,''),
        NULL, jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status),
        _root, NULL, NEW.id, NULL, NULL, NULL, NULL);
    END IF;
    _diff := public._line_items_diff(OLD.line_items, NEW.line_items);
    IF jsonb_array_length(COALESCE(_diff,'[]'::jsonb)) > 0 THEN
      PERFORM public.emit_notification('pi','line_items_changed',NEW.id,NEW.pi_number,NEW.company_name,
        'PI '||COALESCE(NEW.pi_number,'')||': line items updated',
        jsonb_array_length(_diff)||' line item(s) changed',
        NULL, NULL,
        _root, NULL, NEW.id, NULL, NULL, NULL, _diff);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notif_on_po() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _req uuid; _boq uuid; _root uuid;
BEGIN
  IF NEW.requisition_ids IS NOT NULL AND array_length(NEW.requisition_ids,1) >= 1 THEN
    _req := NEW.requisition_ids[1];
    SELECT r.boq_id, r.order_root_id INTO _boq, _root FROM public.requisitions r WHERE r.id = _req;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('purchase','created',NEW.id,NEW.po_number,NEW.vendor_name,
      'PO created: '||COALESCE(NEW.po_number,''), NEW.vendor_name, NULL, to_jsonb(NEW),
      _root, _boq, NULL, NEW.id, _req, NULL, NULL);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_notification('purchase','status_changed',NEW.id,NEW.po_number,NEW.vendor_name,
      'PO '||COALESCE(NEW.po_number,'')||' status: '||COALESCE(NEW.status::text,''),
      NULL, jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status),
      _root, _boq, NULL, NEW.id, _req, NULL, NULL);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notif_on_req() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('requisition','created',NEW.id,NEW.requisition_number,NULL,
      'Requisition created: '||COALESCE(NEW.requisition_number,''), NULL, NULL, to_jsonb(NEW),
      NEW.order_root_id, NEW.boq_id, NULL, NULL, NEW.id, NULL, NULL);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_notification('requisition','status_changed',NEW.id,NEW.requisition_number,NULL,
      'Requisition '||COALESCE(NEW.requisition_number,'')||' status: '||COALESCE(NEW.status::text,''),
      NULL, jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status),
      NEW.order_root_id, NEW.boq_id, NULL, NULL, NEW.id, NULL, NULL);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notif_on_grn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _req uuid; _boq uuid; _root uuid;
BEGIN
  SELECT r.id, r.boq_id, r.order_root_id INTO _req, _boq, _root
    FROM public.purchase_orders p
    LEFT JOIN public.requisitions r ON r.id = ANY(p.requisition_ids)
   WHERE p.id = NEW.po_id
   LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('grn','created',NEW.id,NEW.po_id::text,NULL,
      'GRN received', 'Received qty: '||COALESCE(NEW.received_qty::text,''), NULL, to_jsonb(NEW),
      _root, _boq, NULL, NEW.po_id, _req, NULL, NULL);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notif_on_design_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bnum text; _client text; _root uuid;
BEGIN
  SELECT b.boq_number, b.client_name, COALESCE(o.parent_order_id, o.id)
    INTO _bnum, _client, _root
    FROM public.boqs b
    LEFT JOIN public.orders o ON o.id = b.order_id
   WHERE b.id = NEW.boq_id;
  PERFORM public.emit_notification('design_comment','comment_added',NEW.boq_id,_bnum,_client,
    'Design comment on '||COALESCE(_bnum,'BOQ'),
    LEFT(NEW.comment, 200), NULL,
    jsonb_build_object('item_id',NEW.boq_item_id,'column',NEW.column_key,'comment',NEW.comment),
    _root, NEW.boq_id, NULL, NULL, NULL, NULL, NULL);
  RETURN NEW;
END $$;

-- 6) New triggers: annexure header + rows
CREATE OR REPLACE FUNCTION public.notif_on_annexure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _req uuid; _boq uuid; _root uuid;
BEGIN
  IF NEW.requisition_ids IS NOT NULL AND array_length(NEW.requisition_ids,1) >= 1 THEN
    _req := NEW.requisition_ids[1];
    SELECT r.boq_id, r.order_root_id INTO _boq, _root FROM public.requisitions r WHERE r.id = _req;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_notification('annexure','created',NEW.id, NULL, NULL,
      'Annexure created',
      CASE WHEN array_length(NEW.lot_numbers,1) IS NULL THEN NULL
           ELSE 'Lots: '||array_to_string(NEW.lot_numbers, ', ') END,
      NULL, to_jsonb(NEW),
      _root, _boq, NULL, NULL, _req, NEW.id, NULL);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.emit_notification('annexure','status_changed',NEW.id, NULL, NULL,
      'Annexure status: '||COALESCE(NEW.status,''),
      NULL, jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status),
      _root, _boq, NULL, NULL, _req, NEW.id, NULL);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notif_on_annexure_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _annex uuid := COALESCE(NEW.annexure_id, OLD.annexure_id);
  _req uuid; _boq uuid; _root uuid; _ann_row record; _first_req uuid;
  _title text; _summary text; _event text;
  _diff jsonb;
BEGIN
  SELECT * INTO _ann_row FROM public.requisition_annexures WHERE id = _annex;
  IF _ann_row.requisition_ids IS NOT NULL AND array_length(_ann_row.requisition_ids,1) >= 1 THEN
    _first_req := _ann_row.requisition_ids[1];
    SELECT r.boq_id, r.order_root_id INTO _boq, _root FROM public.requisitions r WHERE r.id = _first_req;
    _req := _first_req;
  END IF;
  IF TG_OP = 'INSERT' THEN
    _event := 'row_added';
    _title := 'Annexure row added';
    _summary := COALESCE(NEW.material,'')||' / '||COALESCE(NEW.size_model,'');
    _diff := jsonb_build_array(jsonb_build_object(
      'line_no', NEW.lot_no, 'kind', 'added', 'before', NULL,
      'after', to_jsonb(NEW), 'changed_fields', ARRAY[]::text[]));
    PERFORM public.emit_notification('annexure',_event,_annex, NULL, NULL,
      _title, _summary, NULL, to_jsonb(NEW),
      _root, _boq, NULL, NULL, _req, _annex, _diff);
  ELSIF TG_OP = 'UPDATE' THEN
    _diff := public._line_items_diff(jsonb_build_array(to_jsonb(OLD)), jsonb_build_array(to_jsonb(NEW)));
    IF jsonb_array_length(COALESCE(_diff,'[]'::jsonb)) > 0 THEN
      _title := 'Annexure row updated';
      _summary := COALESCE(NEW.material,'')||' / '||COALESCE(NEW.size_model,'');
      PERFORM public.emit_notification('annexure','row_updated',_annex, NULL, NULL,
        _title, _summary, to_jsonb(OLD), to_jsonb(NEW),
        _root, _boq, NULL, NULL, _req, _annex, _diff);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    _diff := jsonb_build_array(jsonb_build_object(
      'line_no', OLD.lot_no, 'kind', 'removed',
      'before', to_jsonb(OLD), 'after', NULL, 'changed_fields', ARRAY[]::text[]));
    PERFORM public.emit_notification('annexure','row_removed',_annex, NULL, NULL,
      'Annexure row removed',
      COALESCE(OLD.material,'')||' / '||COALESCE(OLD.size_model,''),
      to_jsonb(OLD), NULL,
      _root, _boq, NULL, NULL, _req, _annex, _diff);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_notif_annexure ON public.requisition_annexures;
CREATE TRIGGER trg_notif_annexure AFTER INSERT OR UPDATE ON public.requisition_annexures
FOR EACH ROW EXECUTE FUNCTION public.notif_on_annexure();

DROP TRIGGER IF EXISTS trg_notif_annexure_row ON public.requisition_annexure_rows;
CREATE TRIGGER trg_notif_annexure_row AFTER INSERT OR UPDATE OR DELETE ON public.requisition_annexure_rows
FOR EACH ROW EXECUTE FUNCTION public.notif_on_annexure_row();
