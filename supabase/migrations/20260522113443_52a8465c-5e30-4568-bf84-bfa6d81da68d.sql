
-- activity_events
CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'info',
  module text NOT NULL,
  title text NOT NULL,
  message text,
  order_root_id uuid,
  order_id uuid,
  boq_id uuid,
  pi_id uuid,
  requisition_id uuid,
  actor_id uuid,
  actor_email text,
  actor_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_events_root_created ON public.activity_events (order_root_id, created_at DESC);
CREATE INDEX idx_activity_events_module_status ON public.activity_events (module, status);
CREATE INDEX idx_activity_events_created ON public.activity_events (created_at DESC);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Helper: a user can see an event if they own any linked entity (or are admin).
CREATE POLICY ae_select_owner_or_admin ON public.activity_events
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = activity_events.order_id AND o.user_id = auth.uid()))
  OR (order_root_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders o WHERE COALESCE(o.parent_order_id, o.id) = activity_events.order_root_id AND o.user_id = auth.uid()))
  OR (boq_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.boqs b WHERE b.id = activity_events.boq_id AND b.user_id = auth.uid()))
  OR (pi_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.proforma_invoices p WHERE p.id = activity_events.pi_id AND p.user_id = auth.uid()))
  OR (requisition_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = activity_events.requisition_id AND r.user_id = auth.uid()))
  OR actor_id = auth.uid()
);

CREATE POLICY ae_insert_authenticated ON public.activity_events
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR actor_id = auth.uid()
  OR (order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = activity_events.order_id AND o.user_id = auth.uid()))
  OR (boq_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.boqs b WHERE b.id = activity_events.boq_id AND b.user_id = auth.uid()))
  OR (pi_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.proforma_invoices p WHERE p.id = activity_events.pi_id AND p.user_id = auth.uid()))
  OR (requisition_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.requisitions r WHERE r.id = activity_events.requisition_id AND r.user_id = auth.uid()))
);

-- activity_event_reads (per-user read state)
CREATE TABLE public.activity_event_reads (
  event_id uuid NOT NULL REFERENCES public.activity_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE public.activity_event_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY aer_select_own ON public.activity_event_reads
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY aer_insert_own ON public.activity_event_reads
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY aer_delete_own ON public.activity_event_reads
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- View: per-OA-family pending state. Used to drive banners and chips.
CREATE OR REPLACE VIEW public.v_entity_pending_state AS
WITH families AS (
  SELECT DISTINCT COALESCE(parent_order_id, id) AS order_root_id FROM public.orders
),
latest_boq AS (
  SELECT COALESCE(o.parent_order_id, o.id) AS order_root_id,
         b.id AS boq_id, b.revision AS boq_revision,
         b.design_review_status, b.verification_status,
         row_number() OVER (PARTITION BY COALESCE(o.parent_order_id, o.id) ORDER BY b.revision DESC, b.updated_at DESC) AS rn
  FROM public.boqs b
  JOIN public.orders o ON o.id = b.order_id
),
req_stale AS (
  SELECT r.order_root_id, bool_or(r.boq_revision < lb.boq_revision) AS has_stale_req
  FROM public.requisitions r
  JOIN latest_boq lb ON lb.order_root_id = r.order_root_id AND lb.rn = 1
  GROUP BY r.order_root_id
)
SELECT f.order_root_id,
       lb.boq_id AS latest_boq_id,
       lb.boq_revision AS latest_boq_revision,
       lb.design_review_status,
       lb.verification_status,
       COALESCE(rs.has_stale_req, false) AS has_stale_requisition
FROM families f
LEFT JOIN latest_boq lb ON lb.order_root_id = f.order_root_id AND lb.rn = 1
LEFT JOIN req_stale rs ON rs.order_root_id = f.order_root_id;

GRANT SELECT ON public.v_entity_pending_state TO authenticated;
