
ALTER TABLE public.requisition_raw_materials
  ADD COLUMN IF NOT EXISTS rm_weight numeric,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS material_category text,
  ADD COLUMN IF NOT EXISTS material_category_source text;

ALTER TABLE public.requisition_raw_materials
  DROP CONSTRAINT IF EXISTS requisition_raw_materials_material_category_source_check;
ALTER TABLE public.requisition_raw_materials
  ADD CONSTRAINT requisition_raw_materials_material_category_source_check
  CHECK (material_category_source IS NULL OR material_category_source IN ('bom','master','rule','manual'));

ALTER TABLE public.requisition_items
  ADD COLUMN IF NOT EXISTS fg_make text,
  ADD COLUMN IF NOT EXISTS fg_uom text;

CREATE TABLE IF NOT EXISTS public.rm_category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  category text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rm_category_rules TO authenticated;
GRANT ALL ON public.rm_category_rules TO service_role;

ALTER TABLE public.rm_category_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rm_cat_rules_select ON public.rm_category_rules;
CREATE POLICY rm_cat_rules_select ON public.rm_category_rules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rm_cat_rules_admin_write ON public.rm_category_rules;
CREATE POLICY rm_cat_rules_admin_write ON public.rm_category_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_rm_category_rules_updated_at ON public.rm_category_rules;
CREATE TRIGGER trg_rm_category_rules_updated_at
  BEFORE UPDATE ON public.rm_category_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.rm_category_rules (pattern, category, priority) VALUES
  ('MS SHEET', 'MS Sheet', 10),
  ('GI SHEET', 'GI Sheet', 10),
  ('SS SHEET', 'SS Sheet', 10),
  ('PIPE', 'Pipe', 20),
  ('MOTOR', 'Motor', 20),
  ('PULLEY', 'Pulley', 20),
  ('FLAT', 'Flat', 30),
  ('BOLT', 'Bolt/Fastener', 30),
  ('SHAFT', 'Shaft', 30),
  ('BEARING', 'Bearing', 30)
ON CONFLICT DO NOTHING;
