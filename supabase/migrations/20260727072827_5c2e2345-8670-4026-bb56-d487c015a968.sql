ALTER TABLE public.requisition_raw_materials
  ADD COLUMN IF NOT EXISTS rm_price numeric,
  ADD COLUMN IF NOT EXISTS vendor_name text;