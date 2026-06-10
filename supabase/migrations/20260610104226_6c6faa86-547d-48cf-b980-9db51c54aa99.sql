
-- VENDORS
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  categories text[] NOT NULL DEFAULT '{}',
  address text,
  gstin text,
  state_code text,
  contact_person text,
  phone text,
  email text,
  payment_terms text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors_select_auth" ON public.vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendors_admin_write" ON public.vendors FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "vendors_admin_update" ON public.vendors FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "vendors_admin_delete" ON public.vendors FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER vendors_updated BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PURCHASE SETTINGS (singleton)
CREATE TABLE public.purchase_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  buyer_block jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_terms text,
  default_dispatch text,
  default_destination text,
  default_payment_mode text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purchase_settings TO authenticated;
GRANT INSERT, UPDATE ON public.purchase_settings TO authenticated;
GRANT ALL ON public.purchase_settings TO service_role;
ALTER TABLE public.purchase_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psettings_select" ON public.purchase_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "psettings_admin_write" ON public.purchase_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "psettings_admin_update" ON public.purchase_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER psettings_updated BEFORE UPDATE ON public.purchase_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.purchase_settings (id, buyer_block, default_terms, default_dispatch, default_destination, default_payment_mode)
VALUES (
  1,
  jsonb_build_object(
    'invoice_to', jsonb_build_object(
      'name','GRAIN MILLING GROUPS PRIVATE LIMITED',
      'address','Shed No.19 HSIIDC Ind. Area Murthal, Sonepat, Sonepat, Haryana 131027',
      'gstin','06AALCG0511C1Z9',
      'email','account.2@mrengineers.com',
      'state_code','06'
    ),
    'ship_to', jsonb_build_object(
      'name','GRAIN MILLING GROUPS PRIVATE LIMITED',
      'address','Shed No.19 HSIIDC Ind. Area Murthal, Sonepat, Sonepat, Haryana 131027',
      'gstin','06AALCG0511C1Z9',
      'email','account.2@mrengineers.com',
      'state_code','06'
    ),
    'courier_address','5A & 5B, Ground Floor, Trapezoid IT Park, Plot No C-27, Sector 62, Noida 201309'
  ),
  E'Freight:- Extra At Actual\nPkg. & Fwd:-Nil.\nPayment :-30 Days After Delivery\nDelivery:- 12 - 15 Days\nKINDLY COURIER A COPY OF BILL AT : 5A & 5B, Ground Floor, Trapezoid IT Park, Plot No C-27, Sector 62, Noida 201309',
  'Transport BY ROAD',
  'MURTHAL/SONIPAT',
  'NEFT/RTGS'
)
ON CONFLICT (id) DO NOTHING;

-- EXTEND purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buyer_block jsonb,
  ADD COLUMN IF NOT EXISTS terms text,
  ADD COLUMN IF NOT EXISTS dispatch_through text,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS payment_mode text,
  ADD COLUMN IF NOT EXISTS subtotal numeric,
  ADD COLUMN IF NOT EXISTS tax_total numeric,
  ADD COLUMN IF NOT EXISTS grand_total numeric,
  ADD COLUMN IF NOT EXISTS amount_in_words text,
  ADD COLUMN IF NOT EXISTS prepared_by_name text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- EXTEND purchase_order_rows
ALTER TABLE public.purchase_order_rows
  ADD COLUMN IF NOT EXISTS due_on date,
  ADD COLUMN IF NOT EXISTS rate numeric,
  ADD COLUMN IF NOT EXISTS discount_pct numeric,
  ADD COLUMN IF NOT EXISTS gst_pct numeric,
  ADD COLUMN IF NOT EXISTS gst_amount numeric,
  ADD COLUMN IF NOT EXISTS line_amount numeric;

-- AUDIT
CREATE TABLE public.purchase_order_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.purchase_order_audit TO authenticated;
GRANT ALL ON public.purchase_order_audit TO service_role;
ALTER TABLE public.purchase_order_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_audit_select_auth" ON public.purchase_order_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_audit_insert_auth" ON public.purchase_order_audit FOR INSERT TO authenticated WITH CHECK (true);

-- SENDS
CREATE TABLE public.purchase_order_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  cc text,
  subject text,
  message text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.purchase_order_sends TO authenticated;
GRANT ALL ON public.purchase_order_sends TO service_role;
ALTER TABLE public.purchase_order_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_sends_select_auth" ON public.purchase_order_sends FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_sends_insert_auth" ON public.purchase_order_sends FOR INSERT TO authenticated WITH CHECK (true);

-- CANCEL FUNCTION
CREATE OR REPLACE FUNCTION public.cancel_purchase_order(_po_id uuid, _reason text)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.purchase_orders;
  _uid uuid := auth.uid();
BEGIN
  SELECT * INTO _row FROM public.purchase_orders WHERE id = _po_id LIMIT 1;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'PO not found';
  END IF;
  IF _row.status = 'cancelled' THEN
    RETURN _row;
  END IF;
  IF _uid IS NULL OR (_row.created_by IS DISTINCT FROM _uid AND NOT public.has_role(_uid, 'admin')) THEN
    RAISE EXCEPTION 'Not allowed to cancel this PO';
  END IF;

  UPDATE public.purchase_orders
     SET status = 'cancelled',
         cancelled_by = _uid,
         cancelled_at = now(),
         cancel_reason = _reason,
         updated_at = now()
   WHERE id = _po_id
   RETURNING * INTO _row;

  UPDATE public.requisition_raw_materials
     SET po_status = NULL, po_id = NULL
   WHERE po_id = _po_id;

  INSERT INTO public.purchase_order_audit(po_id, action, actor, notes)
  VALUES (_po_id, 'cancelled', _uid, _reason);

  RETURN _row;
END;
$$;
