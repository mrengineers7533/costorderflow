
-- 1. Extend FG → RM mapping
ALTER TABLE public.fg_raw_material_map
  ADD COLUMN IF NOT EXISTS is_direct_purchase boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS fg_raw_material_map_model_lower_uniq
  ON public.fg_raw_material_map ((lower(model_number)));

-- 2. Requisition items: track inclusion
ALTER TABLE public.requisition_items
  ADD COLUMN IF NOT EXISTS included_in_requisition boolean NOT NULL DEFAULT true;

-- 3. New table: requisition_raw_materials
CREATE TABLE IF NOT EXISTS public.requisition_raw_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL,
  requisition_item_id uuid,
  model_number text,
  material text NOT NULL,
  qty_per_unit numeric,
  fg_quantity numeric,
  required_qty numeric,
  unit text,
  source text NOT NULL DEFAULT 'mapped',
  purchase_status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.requisition_raw_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY rrm_select_owned_or_admin ON public.requisition_raw_materials
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.requisitions r
    WHERE r.id = requisition_raw_materials.requisition_id
      AND (r.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY rrm_write_owned_or_admin ON public.requisition_raw_materials
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.requisitions r
    WHERE r.id = requisition_raw_materials.requisition_id
      AND (r.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.requisitions r
    WHERE r.id = requisition_raw_materials.requisition_id
      AND (r.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE TRIGGER trg_rrm_updated_at
  BEFORE UPDATE ON public.requisition_raw_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS rrm_requisition_idx ON public.requisition_raw_materials(requisition_id);

-- 4. Public RPC for requisition share link
CREATE OR REPLACE FUNCTION public.get_requisition_raw_materials_by_token(_token uuid)
RETURNS SETOF public.requisition_raw_materials
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT rm.* FROM public.requisition_raw_materials rm
  JOIN public.requisitions r ON r.id = rm.requisition_id
  WHERE r.share_token = _token;
$$;
