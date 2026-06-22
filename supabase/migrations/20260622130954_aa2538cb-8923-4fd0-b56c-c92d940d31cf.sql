
CREATE OR REPLACE FUNCTION public.flag_descendants_on_boq_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _root uuid;
BEGIN
  IF NEW.verification_status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.verification_status = 'approved'
     AND COALESCE(NEW.revision, 0) = COALESCE(OLD.revision, 0) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(o.parent_order_id, o.id)
    INTO _root
    FROM public.orders o
   WHERE o.id = NEW.order_id;

  IF _root IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.boqs b2
      JOIN public.orders o2 ON o2.id = b2.order_id
     WHERE COALESCE(o2.parent_order_id, o2.id) = _root
       AND b2.verification_status = 'approved'
       AND b2.id <> NEW.id
       AND COALESCE(b2.revision, 0) > COALESCE(NEW.revision, 0)
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.requisitions r
     SET superseded_by_id = NEW.id,
         updated_at = now()
   WHERE r.order_root_id = _root
     AND r.status IN ('draft','issued','in_purchase')
     AND COALESCE(r.boq_revision, 0) < COALESCE(NEW.revision, 0)
     AND (r.superseded_by_id IS DISTINCT FROM NEW.id);

  -- Annexure rows reference raw materials via source_rm_ids (uuid[]).
  -- An annexure is considered "PO-issued" if any of its rows' source_rm_ids
  -- appear as raw_material_id on any purchase_order_rows.
  UPDATE public.requisition_annexures a
     SET needs_refresh = true,
         updated_at = now()
   WHERE COALESCE(a.status, 'active') = 'active'
     AND a.needs_refresh = false
     AND EXISTS (
       SELECT 1 FROM public.requisitions r
        WHERE r.id = ANY(a.requisition_ids)
          AND r.order_root_id = _root
          AND COALESCE(r.boq_revision, 0) < COALESCE(NEW.revision, 0)
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.requisition_annexure_rows ar,
              unnest(ar.source_rm_ids) rm_id
         JOIN public.purchase_order_rows por
           ON por.raw_material_id = rm_id::uuid
        WHERE ar.annexure_id = a.id
     );

  RETURN NEW;
END;
$$;
