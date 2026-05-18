
CREATE OR REPLACE FUNCTION public.orders_keep_single_current()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_current = TRUE AND NEW.parent_order_id IS NOT NULL THEN
    UPDATE public.orders
       SET is_current = FALSE
     WHERE (parent_order_id = NEW.parent_order_id OR id = NEW.parent_order_id)
       AND id <> NEW.id
       AND is_current = TRUE;
  END IF;
  RETURN NEW;
END;
$function$;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY COALESCE(parent_order_id, id)
           ORDER BY revision DESC, created_at DESC
         ) AS rn
  FROM public.orders
)
UPDATE public.orders o
   SET is_current = (r.rn = 1)
  FROM ranked r
 WHERE o.id = r.id
   AND o.is_current <> (r.rn = 1);
