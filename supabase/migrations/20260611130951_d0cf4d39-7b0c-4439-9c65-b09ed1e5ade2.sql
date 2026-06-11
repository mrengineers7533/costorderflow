ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_category_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_category_check
  CHECK (category = ANY (ARRAY['machine','3p','pipe','sheet_ss','sheet_ms','sheet_gi','structure','steel']));