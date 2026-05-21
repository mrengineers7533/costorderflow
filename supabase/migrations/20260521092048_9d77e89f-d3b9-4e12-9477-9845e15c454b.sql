
-- 1. Family share tokens (one per OA family)
CREATE TABLE public.boq_family_share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_root_id uuid NOT NULL UNIQUE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

ALTER TABLE public.boq_family_share_tokens ENABLE ROW LEVEL SECURITY;

-- Owner = anyone who owns a BOQ under this order family, or admin
CREATE POLICY bfst_select_owned_or_admin ON public.boq_family_share_tokens
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.boqs b
    JOIN public.orders o ON o.id = b.order_id
    WHERE COALESCE(o.parent_order_id, o.id) = boq_family_share_tokens.order_root_id
      AND b.user_id = auth.uid()
  )
);

CREATE POLICY bfst_insert_owned_or_admin ON public.boq_family_share_tokens
FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.boqs b
    JOIN public.orders o ON o.id = b.order_id
    WHERE COALESCE(o.parent_order_id, o.id) = boq_family_share_tokens.order_root_id
      AND b.user_id = auth.uid()
  )
);

CREATE POLICY bfst_update_owned_or_admin ON public.boq_family_share_tokens
FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.boqs b
    JOIN public.orders o ON o.id = b.order_id
    WHERE COALESCE(o.parent_order_id, o.id) = boq_family_share_tokens.order_root_id
      AND b.user_id = auth.uid()
  )
);

-- 2. Distribution log
CREATE TABLE public.boq_distribution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id uuid NOT NULL,
  order_root_id uuid NOT NULL,
  family_token uuid NOT NULL,
  revision integer NOT NULL,
  purchase_emails text[] NOT NULL DEFAULT '{}',
  factory_emails text[] NOT NULL DEFAULT '{}',
  message text,
  sent_by uuid,
  sent_by_email text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bdl_boq ON public.boq_distribution_log(boq_id);
CREATE INDEX idx_bdl_root ON public.boq_distribution_log(order_root_id);

ALTER TABLE public.boq_distribution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY bdl_select_owned_or_admin ON public.boq_distribution_log
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.boqs b
    WHERE b.id = boq_distribution_log.boq_id
      AND (b.user_id = auth.uid())
  )
);

CREATE POLICY bdl_insert_owned_or_admin ON public.boq_distribution_log
FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.boqs b
    WHERE b.id = boq_distribution_log.boq_id
      AND (b.user_id = auth.uid())
  )
);

-- 3. RPC: latest approved BOQ for a family token
CREATE OR REPLACE FUNCTION public.get_latest_approved_boq_by_family_token(_token uuid)
RETURNS public.boqs
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.*
  FROM public.boq_family_share_tokens t
  JOIN public.boqs b ON b.order_id IN (
    SELECT o.id FROM public.orders o
    WHERE COALESCE(o.parent_order_id, o.id) = t.order_root_id
  )
  WHERE t.token = _token
    AND t.revoked_at IS NULL
    AND b.verification_status = 'approved'
  ORDER BY b.revision DESC, b.updated_at DESC
  LIMIT 1;
$$;
