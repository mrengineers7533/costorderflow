
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('steel','machine','3p')),
  vendor_name text NOT NULL,
  vendor_contact text,
  lot_numbers text[] NOT NULL DEFAULT '{}',
  requisition_ids uuid[] NOT NULL DEFAULT '{}',
  annexure_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  notes text,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  cancel_reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PO read all auth" ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "PO insert own" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "PO update own or admin" ON public.purchase_orders FOR UPDATE TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "PO delete admin" ON public.purchase_orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_po_status ON public.purchase_orders(status);
CREATE INDEX idx_po_created_by ON public.purchase_orders(created_by);

CREATE TABLE public.purchase_order_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  raw_material_id uuid,
  lot_no text,
  material text NOT NULL,
  size_model text,
  make text,
  unit text,
  qty numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_rows TO authenticated;
GRANT ALL ON public.purchase_order_rows TO service_role;
ALTER TABLE public.purchase_order_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PO rows read all auth" ON public.purchase_order_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY "PO rows write via parent" ON public.purchase_order_rows FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND (p.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = po_id AND (p.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE TRIGGER trg_po_rows_updated BEFORE UPDATE ON public.purchase_order_rows FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_po_rows_po ON public.purchase_order_rows(po_id);
CREATE INDEX idx_po_rows_rm ON public.purchase_order_rows(raw_material_id);

CREATE TABLE public.po_counters (
  financial_year text PRIMARY KEY,
  last_number int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.po_counters TO authenticated;
GRANT ALL ON public.po_counters TO service_role;
ALTER TABLE public.po_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_counters read" ON public.po_counters FOR SELECT TO authenticated USING (true);

ALTER TABLE public.requisition_raw_materials
  ADD COLUMN IF NOT EXISTS po_status text CHECK (po_status IN ('created')),
  ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_rrm_po ON public.requisition_raw_materials(po_id);

CREATE OR REPLACE FUNCTION public.next_po_number(_fy text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
BEGIN
  INSERT INTO public.po_counters(financial_year, last_number)
  VALUES (_fy, 1)
  ON CONFLICT (financial_year)
  DO UPDATE SET last_number = po_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO _next;
  RETURN 'PO/' || _fy || '/' || lpad(_next::text, 4, '0');
END;
$$;
