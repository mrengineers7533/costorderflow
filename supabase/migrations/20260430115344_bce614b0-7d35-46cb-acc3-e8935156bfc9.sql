-- ===== ORDERS: revision columns =====
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS parent_order_id UUID,
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS revised_from_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

-- Backfill: each existing order is its own root, rev 0, current.
UPDATE public.orders SET parent_order_id = id WHERE parent_order_id IS NULL;

-- Self-FK so root_id is enforced
ALTER TABLE public.orders
  ADD CONSTRAINT orders_parent_fk FOREIGN KEY (parent_order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_orders_parent ON public.orders(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_current ON public.orders(is_current) WHERE is_current = TRUE;

-- Keep only one current row per family (orders).
CREATE OR REPLACE FUNCTION public.orders_keep_single_current()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_current = TRUE AND NEW.parent_order_id IS NOT NULL THEN
    UPDATE public.orders
       SET is_current = FALSE
     WHERE parent_order_id = NEW.parent_order_id
       AND id <> NEW.id
       AND is_current = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_single_current ON public.orders;
CREATE TRIGGER trg_orders_single_current
AFTER INSERT OR UPDATE OF is_current ON public.orders
FOR EACH ROW
WHEN (NEW.is_current = TRUE)
EXECUTE FUNCTION public.orders_keep_single_current();

-- ===== BOQS: revision columns =====
ALTER TABLE public.boqs
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS source_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revised_from_id UUID REFERENCES public.boqs(id) ON DELETE SET NULL;

-- Backfill source_order_id for existing BOQs (they all came from their order_id)
UPDATE public.boqs SET source_order_id = order_id WHERE source_order_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_boqs_source_order ON public.boqs(source_order_id);
CREATE INDEX IF NOT EXISTS idx_boqs_current ON public.boqs(is_current) WHERE is_current = TRUE;

-- Keep only one current BOQ per parent order family.
CREATE OR REPLACE FUNCTION public.boqs_keep_single_current()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _root UUID;
BEGIN
  IF NEW.is_current = TRUE THEN
    -- Find the root order (parent_order_id) of the OA this BOQ belongs to.
    SELECT parent_order_id INTO _root FROM public.orders WHERE id = NEW.order_id;
    IF _root IS NULL THEN _root := NEW.order_id; END IF;

    UPDATE public.boqs b
       SET is_current = FALSE
     WHERE b.id <> NEW.id
       AND b.is_current = TRUE
       AND COALESCE((SELECT parent_order_id FROM public.orders WHERE id = b.order_id), b.order_id) = _root;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_boqs_single_current ON public.boqs;
CREATE TRIGGER trg_boqs_single_current
AFTER INSERT OR UPDATE OF is_current ON public.boqs
FOR EACH ROW
WHEN (NEW.is_current = TRUE)
EXECUTE FUNCTION public.boqs_keep_single_current();