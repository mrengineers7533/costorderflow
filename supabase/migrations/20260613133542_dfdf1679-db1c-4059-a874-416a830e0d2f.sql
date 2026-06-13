ALTER TABLE public.boq_design_review_items
  ADD COLUMN IF NOT EXISTS motor text,
  ADD COLUMN IF NOT EXISTS motor_quantity numeric;