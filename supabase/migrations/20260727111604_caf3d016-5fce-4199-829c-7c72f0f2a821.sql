ALTER TABLE public.requisition_raw_materials ADD COLUMN IF NOT EXISTS raw_material_type text;
ALTER TABLE public.requisition_annexure_rows ADD COLUMN IF NOT EXISTS raw_material_type text;
ALTER TABLE public.purchase_order_rows ADD COLUMN IF NOT EXISTS raw_material_type text;