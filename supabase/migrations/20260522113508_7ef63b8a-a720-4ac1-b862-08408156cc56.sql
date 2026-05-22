
DROP VIEW IF EXISTS public.v_entity_pending_state;

CREATE VIEW public.v_entity_pending_state
WITH (security_invoker = true) AS
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
