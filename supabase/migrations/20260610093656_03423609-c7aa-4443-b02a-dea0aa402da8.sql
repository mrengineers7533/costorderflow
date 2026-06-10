ALTER TABLE public.requisition_raw_materials
  ADD COLUMN IF NOT EXISTS annexure_status text,
  ADD COLUMN IF NOT EXISTS annexure_id uuid REFERENCES public.requisition_annexures(id) ON DELETE SET NULL;

ALTER TABLE public.requisition_raw_materials
  DROP CONSTRAINT IF EXISTS requisition_raw_materials_annexure_status_check;

ALTER TABLE public.requisition_raw_materials
  ADD CONSTRAINT requisition_raw_materials_annexure_status_check
  CHECK (annexure_status IS NULL OR annexure_status IN ('created'));

CREATE INDEX IF NOT EXISTS idx_requisition_raw_materials_annexure_id
  ON public.requisition_raw_materials(annexure_id);