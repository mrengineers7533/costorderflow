
ALTER TABLE public.requisition_raw_materials
  ADD COLUMN IF NOT EXISTS lot_no text NULL,
  ADD COLUMN IF NOT EXISTS plan_status text NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'requisition_raw_materials_plan_status_check'
  ) THEN
    ALTER TABLE public.requisition_raw_materials
      ADD CONSTRAINT requisition_raw_materials_plan_status_check
      CHECK (plan_status IS NULL OR plan_status IN ('machine','3p','steel'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.requisition_annexures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_ids uuid[] NOT NULL DEFAULT '{}',
  lot_numbers text[] NOT NULL DEFAULT '{}',
  notes text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisition_annexures TO authenticated;
GRANT ALL ON public.requisition_annexures TO service_role;
ALTER TABLE public.requisition_annexures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can read annexures" ON public.requisition_annexures
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert annexures" ON public.requisition_annexures
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update annexures" ON public.requisition_annexures
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete annexures" ON public.requisition_annexures
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_requisition_annexures_updated_at
  BEFORE UPDATE ON public.requisition_annexures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.requisition_annexure_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annexure_id uuid NOT NULL REFERENCES public.requisition_annexures(id) ON DELETE CASCADE,
  lot_no text NOT NULL,
  plan_status text NOT NULL CHECK (plan_status IN ('machine','3p','steel')),
  material text NOT NULL,
  size_model text NULL,
  make text NULL,
  unit text NULL,
  total_qty numeric NULL,
  source_rm_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisition_annexure_rows TO authenticated;
GRANT ALL ON public.requisition_annexure_rows TO service_role;
ALTER TABLE public.requisition_annexure_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can read annexure rows" ON public.requisition_annexure_rows
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth can insert annexure rows" ON public.requisition_annexure_rows
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth can update annexure rows" ON public.requisition_annexure_rows
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth can delete annexure rows" ON public.requisition_annexure_rows
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_requisition_annexure_rows_updated_at
  BEFORE UPDATE ON public.requisition_annexure_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_annexure_rows_annexure ON public.requisition_annexure_rows(annexure_id);
