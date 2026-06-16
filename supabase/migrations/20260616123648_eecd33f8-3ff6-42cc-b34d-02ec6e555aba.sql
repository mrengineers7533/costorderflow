
CREATE OR REPLACE FUNCTION public.sync_design_status_to_boq_line_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _boq record;
  _items jsonb;
  _new_items jsonb := '[]'::jsonb;
  _it jsonb;
  _target_desc text;
  _target_status text;
  _changed boolean := false;
  _root uuid;
  _sib record;
  _sib_items jsonb;
  _sib_new jsonb;
  _sib_changed boolean;
  _norm text;
BEGIN
  _target_status := CASE WHEN NEW.status = 'approved' THEN 'approved' ELSE 'pending' END;

  SELECT b.id, b.order_id, b.revision, b.line_items
    INTO _boq
    FROM public.boqs b
   WHERE b.id = NEW.boq_id
   LIMIT 1;

  IF _boq.id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(_boq.revision, 0) <> COALESCE(NEW.boq_revision, 0) THEN
    -- only sync the matching revision snapshot
    RETURN NEW;
  END IF;

  _items := COALESCE(_boq.line_items, '[]'::jsonb);
  IF jsonb_typeof(_items) <> 'array' THEN RETURN NEW; END IF;

  -- Capture target description for sibling propagation by normalized desc.
  FOR _it IN SELECT value FROM jsonb_array_elements(_items) LOOP
    IF _it->>'id' = NEW.boq_item_id THEN
      _target_desc := _it->>'description';
      IF COALESCE(_it->>'approval_status','pending') IS DISTINCT FROM _target_status THEN
        _changed := true;
        _new_items := _new_items || jsonb_build_array(_it || jsonb_build_object('approval_status', _target_status));
      ELSE
        _new_items := _new_items || jsonb_build_array(_it);
      END IF;
    ELSE
      _new_items := _new_items || jsonb_build_array(_it);
    END IF;
  END LOOP;

  IF _changed THEN
    UPDATE public.boqs SET line_items = _new_items, updated_at = now() WHERE id = _boq.id;
  END IF;

  -- Propagate to sibling BOQs in the same OA family by normalized description.
  IF _target_desc IS NOT NULL AND _target_desc <> '' THEN
    SELECT COALESCE(o.parent_order_id, o.id) INTO _root FROM public.orders o WHERE o.id = _boq.order_id;
    IF _root IS NOT NULL THEN
      _norm := lower(regexp_replace(trim(_target_desc), '\s+', ' ', 'g'));
      FOR _sib IN
        SELECT b.id, b.line_items
          FROM public.boqs b
          JOIN public.orders o ON o.id = b.order_id
         WHERE COALESCE(o.parent_order_id, o.id) = _root
           AND b.id <> _boq.id
      LOOP
        _sib_items := COALESCE(_sib.line_items, '[]'::jsonb);
        IF jsonb_typeof(_sib_items) <> 'array' THEN CONTINUE; END IF;
        _sib_new := '[]'::jsonb;
        _sib_changed := false;
        FOR _it IN SELECT value FROM jsonb_array_elements(_sib_items) LOOP
          IF _it->>'description' IS NOT NULL
             AND lower(regexp_replace(trim(_it->>'description'), '\s+', ' ', 'g')) = _norm
             AND COALESCE(_it->>'approval_status','pending') IS DISTINCT FROM _target_status
          THEN
            _sib_changed := true;
            _sib_new := _sib_new || jsonb_build_array(_it || jsonb_build_object('approval_status', _target_status));
          ELSE
            _sib_new := _sib_new || jsonb_build_array(_it);
          END IF;
        END LOOP;
        IF _sib_changed THEN
          UPDATE public.boqs SET line_items = _sib_new, updated_at = now() WHERE id = _sib.id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_sync_design_status_to_boq_line_items ON public.boq_item_design_status;
CREATE TRIGGER trg_sync_design_status_to_boq_line_items
AFTER INSERT OR UPDATE ON public.boq_item_design_status
FOR EACH ROW EXECUTE FUNCTION public.sync_design_status_to_boq_line_items();

-- Backfill existing rows so historical Design approvals show up on BOQ/print immediately.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.boq_item_design_status ORDER BY updated_at ASC LOOP
    UPDATE public.boq_item_design_status SET updated_at = updated_at WHERE id = r.id;
  END LOOP;
END $$;
