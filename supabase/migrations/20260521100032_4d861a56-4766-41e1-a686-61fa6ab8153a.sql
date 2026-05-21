
-- =====================================================================
-- Manufacturing → Requisition → Purchase base tables
-- =====================================================================

-- 1. Finish Good → Raw Material map (placeholder; admin-editable)
CREATE TABLE public.fg_raw_material_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_number text NOT NULL UNIQUE,
  raw_materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fg_raw_material_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY fgrmm_select_auth ON public.fg_raw_material_map
  FOR SELECT TO authenticated USING (true);
CREATE POLICY fgrmm_admin_write ON public.fg_raw_material_map
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_fgrmm_updated_at
  BEFORE UPDATE ON public.fg_raw_material_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Requisitions
CREATE TABLE public.requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_number text NOT NULL UNIQUE,
  order_root_id uuid NOT NULL,
  boq_id uuid NOT NULL,
  boq_revision integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'issued',
  share_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  family_token uuid,
  pdf_path text,
  superseded_by_id uuid,
  notes text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_requisitions_root ON public.requisitions(order_root_id);
CREATE INDEX idx_requisitions_boq ON public.requisitions(boq_id);

CREATE POLICY requisitions_select_owned_or_admin ON public.requisitions
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(),'admin'));
CREATE POLICY requisitions_insert_own ON public.requisitions
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) OR has_role(auth.uid(),'admin'));
CREATE POLICY requisitions_update_owned_or_admin ON public.requisitions
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(),'admin'))
  WITH CHECK ((auth.uid() = user_id) OR has_role(auth.uid(),'admin'));
CREATE POLICY requisitions_delete_owned_or_admin ON public.requisitions
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_requisitions_updated_at
  BEFORE UPDATE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Requisition items (snapshot of BOQ Finish Good rows at generation time)
CREATE TABLE public.requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  boq_item_id text NOT NULL,
  item_no text,
  model_number text,
  description text,
  quantity numeric,
  unit text,
  remarks text,
  fg_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  purchase_status text NOT NULL DEFAULT 'pending',
  lot_no text,
  purchase_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.requisition_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_requisition_items_req ON public.requisition_items(requisition_id);

CREATE POLICY ri_select_owned_or_admin ON public.requisition_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.requisitions r
            WHERE r.id = requisition_items.requisition_id
              AND (r.user_id = auth.uid() OR has_role(auth.uid(),'admin')))
  );
CREATE POLICY ri_write_owned_or_admin ON public.requisition_items
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.requisitions r
            WHERE r.id = requisition_items.requisition_id
              AND (r.user_id = auth.uid() OR has_role(auth.uid(),'admin')))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.requisitions r
            WHERE r.id = requisition_items.requisition_id
              AND (r.user_id = auth.uid() OR has_role(auth.uid(),'admin')))
  );

CREATE TRIGGER trg_ri_updated_at
  BEFORE UPDATE ON public.requisition_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Requisition lots (Purchase-side groupings)
CREATE TABLE public.requisition_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  lot_no text NOT NULL,
  category text NOT NULL DEFAULT 'outside',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.requisition_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY rl_select_owned_or_admin ON public.requisition_lots
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.requisitions r
            WHERE r.id = requisition_lots.requisition_id
              AND (r.user_id = auth.uid() OR has_role(auth.uid(),'admin')))
  );
CREATE POLICY rl_write_owned_or_admin ON public.requisition_lots
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.requisitions r
            WHERE r.id = requisition_lots.requisition_id
              AND (r.user_id = auth.uid() OR has_role(auth.uid(),'admin')))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.requisitions r
            WHERE r.id = requisition_lots.requisition_id
              AND (r.user_id = auth.uid() OR has_role(auth.uid(),'admin')))
  );

-- 5. Distribution log
CREATE TABLE public.requisition_distribution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL,
  purchase_emails text[] NOT NULL DEFAULT '{}',
  message text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  sent_by uuid,
  sent_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.requisition_distribution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY rdl_select_owned_or_admin ON public.requisition_distribution_log
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(),'admin') OR EXISTS (
      SELECT 1 FROM public.requisitions r
      WHERE r.id = requisition_distribution_log.requisition_id AND r.user_id = auth.uid()
    )
  );
CREATE POLICY rdl_insert_owned_or_admin ON public.requisition_distribution_log
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(),'admin') OR EXISTS (
      SELECT 1 FROM public.requisitions r
      WHERE r.id = requisition_distribution_log.requisition_id AND r.user_id = auth.uid()
    )
  );

-- 6. Per-family requisition counter
CREATE TABLE public.requisition_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_root_id uuid NOT NULL UNIQUE,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.requisition_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY rc_no_access ON public.requisition_counters
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.next_requisition_number(_root uuid, _oa_number text, _revision integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
  _seq text;
  _fy text;
BEGIN
  INSERT INTO public.requisition_counters (order_root_id, last_number)
  VALUES (_root, 1)
  ON CONFLICT (order_root_id)
  DO UPDATE SET last_number = requisition_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO _next;

  -- Pull a short FY hint and sequence tail from the OA number when possible
  _seq := COALESCE(substring(_oa_number FROM '([0-9]+)(?:/R[0-9]+)?$'), 'X');
  _fy := COALESCE(substring(_oa_number FROM '(\d{2}-\d{2})'),
                  substring(_oa_number FROM '(\d{4}-\d{2})'),
                  'FY');
  -- Normalize 2026-27 → 26-27
  IF _fy ~ '^\d{4}-\d{2}$' THEN
    _fy := substring(_fy from 3);
  END IF;

  RETURN 'REQ/' || _fy || '/' || _seq || '-R' || _revision || '/' || lpad(_next::text, 3, '0');
END;
$$;

-- 7. Public lookup RPC — always resolves to the latest approved BOQ for the family
CREATE OR REPLACE FUNCTION public.get_requisition_by_token(_token uuid)
RETURNS TABLE (
  requisition_id uuid,
  requisition_number text,
  requisition_revision integer,
  requisition_status text,
  order_root_id uuid,
  current_boq_id uuid,
  current_boq_number text,
  current_boq_revision integer,
  client_name text,
  reference_oa_number text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH req AS (
    SELECT * FROM public.requisitions WHERE share_token = _token LIMIT 1
  ),
  latest AS (
    SELECT b.* FROM public.boqs b
    JOIN public.orders o ON o.id = b.order_id
    WHERE COALESCE(o.parent_order_id, o.id) = (SELECT order_root_id FROM req)
      AND b.verification_status = 'approved'
    ORDER BY b.revision DESC, b.updated_at DESC
    LIMIT 1
  )
  SELECT
    req.id, req.requisition_number, req.boq_revision, req.status,
    req.order_root_id,
    latest.id, latest.boq_number, latest.revision,
    latest.client_name, latest.reference_oa_number,
    req.created_at
  FROM req LEFT JOIN latest ON true;
$$;

-- Public read function for items
CREATE OR REPLACE FUNCTION public.get_requisition_items_by_token(_token uuid)
RETURNS SETOF public.requisition_items
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.* FROM public.requisition_items i
  JOIN public.requisitions r ON r.id = i.requisition_id
  WHERE r.share_token = _token;
$$;
