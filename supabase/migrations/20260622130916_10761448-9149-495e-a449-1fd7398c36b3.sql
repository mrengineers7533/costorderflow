
-- 1. needs_refresh flag on annexures
ALTER TABLE public.requisition_annexures
  ADD COLUMN IF NOT EXISTS needs_refresh boolean NOT NULL DEFAULT false;

-- 2. Safety-net trigger function: when a BOQ is approved at a higher revision
--    than its previous state, flag every open requisition in the same family
--    that's on an older revision (set superseded_by_id), and mark active
--    annexures whose rows don't yet appear on any PO as needs_refresh = true.
CREATE OR REPLACE FUNCTION public.flag_descendants_on_boq_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _root uuid;
BEGIN
  -- only act when verification_status transitions to 'approved'
  IF NEW.verification_status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.verification_status = 'approved'
     AND COALESCE(NEW.revision, 0) = COALESCE(OLD.revision, 0) THEN
    RETURN NEW;
  END IF;

  -- resolve order family root for this BOQ
  SELECT COALESCE(o.parent_order_id, o.id)
    INTO _root
    FROM public.orders o
   WHERE o.id = NEW.order_id;

  IF _root IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only act if this BOQ is the highest-revision approved one in the family.
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

  -- Flag older-revision open requisitions as superseded by this BOQ.
  -- (We point superseded_by_id at the BOQ id; client code already understands
  --  the requisition needs regeneration when this is set.)
  UPDATE public.requisitions r
     SET superseded_by_id = NEW.id,
         updated_at = now()
   WHERE r.order_root_id = _root
     AND r.status IN ('draft','issued','in_purchase')
     AND COALESCE(r.boq_revision, 0) < COALESCE(NEW.revision, 0)
     AND (r.superseded_by_id IS DISTINCT FROM NEW.id);

  -- Flag annexures of those requisitions (active, no PO yet) for refresh.
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
         FROM public.requisition_annexure_rows ar
         JOIN public.purchase_order_rows por
           ON por.requisition_annexure_row_id = ar.id
        WHERE ar.annexure_id = a.id
     );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_descendants_on_boq_approval ON public.boqs;
CREATE TRIGGER trg_flag_descendants_on_boq_approval
AFTER INSERT OR UPDATE OF verification_status, revision ON public.boqs
FOR EACH ROW
EXECUTE FUNCTION public.flag_descendants_on_boq_approval();
