CREATE TABLE public.vendor_item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  vendor_name text NOT NULL,
  material text NOT NULL,
  size_model text,
  unit text,
  price numeric,
  is_preferred boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_item_prices TO authenticated;
GRANT ALL ON public.vendor_item_prices TO service_role;

ALTER TABLE public.vendor_item_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vip_select_scoped" ON public.vendor_item_prices
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_module_perm(auth.uid(), 'purchase'::text, 'view'::access_perm)
    OR has_module_perm(auth.uid(), 'requisitions'::text, 'view'::access_perm)
    OR has_module_perm(auth.uid(), 'annexures'::text, 'view'::access_perm)
    OR has_module_perm(auth.uid(), 'manufacturing'::text, 'view'::access_perm)
  );

CREATE POLICY "vip_admin_insert" ON public.vendor_item_prices
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "vip_admin_update" ON public.vendor_item_prices
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "vip_admin_delete" ON public.vendor_item_prices
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER vendor_item_prices_updated
  BEFORE UPDATE ON public.vendor_item_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_vip_material ON public.vendor_item_prices (lower(material));
CREATE INDEX idx_vip_active ON public.vendor_item_prices (is_active);