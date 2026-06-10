ALTER TABLE public.requisition_raw_materials DROP CONSTRAINT IF EXISTS requisition_raw_materials_plan_status_check;
ALTER TABLE public.requisition_raw_materials ADD CONSTRAINT requisition_raw_materials_plan_status_check CHECK (plan_status IS NULL OR plan_status IN ('machine','3p','pipe','sheet_ss','sheet_ms','sheet_gi','structure','steel'));

ALTER TABLE public.requisition_annexure_rows DROP CONSTRAINT IF EXISTS requisition_annexure_rows_plan_status_check;
ALTER TABLE public.requisition_annexure_rows ADD CONSTRAINT requisition_annexure_rows_plan_status_check CHECK (plan_status IN ('machine','3p','pipe','sheet_ss','sheet_ms','sheet_gi','structure','steel'));