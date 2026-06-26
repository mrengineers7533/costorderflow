CREATE TABLE IF NOT EXISTS public.boq_revision_approval_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id uuid NOT NULL REFERENCES public.boqs(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_revision integer NOT NULL DEFAULT 0,
  boq_revision integer NOT NULL DEFAULT 0,
  boq_item_id text NOT NULL,
  item_no text,
  item_signature text,
  description text,
  model_number text,
  approval_status text NOT NULL DEFAULT 'not_approved' CHECK (approval_status IN ('approved','not_approved')),
  approval_comment text,
  design_comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_by uuid,
  approved_by_name text,
  approved_by_department text,
  approved_at timestamptz,
  applied_to_oa_by uuid,
  applied_to_oa_at timestamptz,
  oa_revision_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  source_boq_id uuid REFERENCES public.boqs(id) ON DELETE SET NULL,
  source_snapshot_id uuid REFERENCES public.boq_revision_approval_snapshots(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boq_id, boq_revision, boq_item_id)
);

CREATE INDEX IF NOT EXISTS idx_boq_rev_approval_snapshots_boq
  ON public.boq_revision_approval_snapshots(boq_id, boq_revision);
CREATE INDEX IF NOT EXISTS idx_boq_rev_approval_snapshots_order
  ON public.boq_revision_approval_snapshots(order_id, order_revision);
CREATE INDEX IF NOT EXISTS idx_boq_rev_approval_snapshots_status
  ON public.boq_revision_approval_snapshots(approval_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boq_revision_approval_snapshots TO authenticated;
GRANT ALL ON public.boq_revision_approval_snapshots TO service_role;

ALTER TABLE public.boq_revision_approval_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval snapshots readable by linked users" ON public.boq_revision_approval_snapshots;
CREATE POLICY "approval snapshots readable by linked users"
ON public.boq_revision_approval_snapshots
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_module_access(auth.uid(), 'boqs')
  OR public.has_module_access(auth.uid(), 'design')
  OR public.has_module_access(auth.uid(), 'purchase')
  OR public.has_module_access(auth.uid(), 'manufacturing')
  OR EXISTS (
    SELECT 1
    FROM public.boqs b
    LEFT JOIN public.orders o ON o.id = COALESCE(b.source_order_id, b.order_id)
    WHERE b.id = boq_revision_approval_snapshots.boq_id
      AND (b.user_id = auth.uid() OR o.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "approval snapshots writable by approvers" ON public.boq_revision_approval_snapshots;
CREATE POLICY "approval snapshots writable by approvers"
ON public.boq_revision_approval_snapshots
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_module_access(auth.uid(), 'design')
  OR public.has_module_access(auth.uid(), 'boqs')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_module_access(auth.uid(), 'design')
  OR public.has_module_access(auth.uid(), 'boqs')
);

CREATE OR REPLACE FUNCTION public.refresh_boq_revision_approval_snapshot_internal(_boq_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _b record;
  _count integer := 0;
BEGIN
  SELECT
    b.id,
    b.order_id,
    COALESCE(b.source_order_id, b.order_id) AS snapshot_order_id,
    COALESCE(o.revision, b.revision, 0) AS order_revision,
    COALESCE(b.revision, 0) AS boq_revision,
    b.line_items,
    b.design_review_status,
    b.verification_status,
    b.revised_from_id
  INTO _b
  FROM public.boqs b
  LEFT JOIN public.orders o ON o.id = COALESCE(b.source_order_id, b.order_id)
  WHERE b.id = _boq_id
  LIMIT 1;

  IF _b.id IS NULL THEN
    RETURN 0;
  END IF;

  IF COALESCE(jsonb_typeof(_b.line_items), 'null') <> 'array' THEN
    DELETE FROM public.boq_revision_approval_snapshots
    WHERE boq_id = _boq_id
      AND boq_revision = COALESCE(_b.boq_revision, 0);
    RETURN 0;
  END IF;

  WITH item_rows AS (
    SELECT
      li.value AS item,
      li.ord,
      li.value->>'id' AS item_id,
      li.value->>'item_no' AS item_no,
      li.value->>'description' AS description,
      li.value->>'model_number' AS model_number,
      li.value->>'approval_status' AS line_approval_status,
      li.value->>'approval_comment' AS line_approval_comment
    FROM jsonb_array_elements(COALESCE(_b.line_items, '[]'::jsonb)) WITH ORDINALITY li(value, ord)
    WHERE COALESCE(li.value->>'id', '') <> ''
  ),
  status_rows AS (
    SELECT DISTINCT ON (s.boq_item_id)
      s.id,
      s.boq_item_id,
      s.status,
      s.reason,
      s.decided_by,
      s.decided_by_name,
      s.decided_by_department,
      s.decided_at,
      s.updated_at
    FROM public.boq_item_design_status s
    WHERE s.boq_id = _boq_id
      AND COALESCE(s.boq_revision, _b.boq_revision) = _b.boq_revision
    ORDER BY s.boq_item_id, s.decided_at DESC NULLS LAST, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
  ),
  blocking_rows AS (
    SELECT count(*) AS n
    FROM status_rows
    WHERE status IN ('pending','not_approved','rejected')
  ),
  comment_rows AS (
    SELECT
      c.boq_item_id,
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'column_key', c.column_key,
          'comment', c.comment,
          'user_id', c.user_id,
          'user_name', c.user_name,
          'user_email', c.user_email,
          'department', c.department,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'applied_to_oa_at', c.applied_to_oa_at,
          'applied_to_oa_by', c.applied_to_oa_by,
          'applied_value', c.applied_value,
          'oa_revision_id', c.oa_revision_id
        ) ORDER BY c.created_at ASC, c.id ASC
      ) AS comments,
      (array_agg(c.applied_to_oa_at ORDER BY c.applied_to_oa_at DESC NULLS LAST))[1] AS latest_applied_at,
      (array_agg(c.applied_to_oa_by ORDER BY c.applied_to_oa_at DESC NULLS LAST))[1] AS latest_applied_by,
      (array_agg(c.oa_revision_id ORDER BY c.applied_to_oa_at DESC NULLS LAST))[1] AS latest_oa_revision_id
    FROM public.boq_design_comments c
    WHERE c.boq_id = _boq_id
    GROUP BY c.boq_item_id
  ),
  upserted AS (
    INSERT INTO public.boq_revision_approval_snapshots (
      boq_id,
      order_id,
      order_revision,
      boq_revision,
      boq_item_id,
      item_no,
      item_signature,
      description,
      model_number,
      approval_status,
      approval_comment,
      design_comments,
      approved_by,
      approved_by_name,
      approved_by_department,
      approved_at,
      applied_to_oa_by,
      applied_to_oa_at,
      oa_revision_id,
      source_boq_id,
      updated_at
    )
    SELECT
      _b.id,
      _b.snapshot_order_id,
      _b.order_revision,
      _b.boq_revision,
      i.item_id,
      i.item_no,
      lower(regexp_replace(trim(COALESCE(i.description, '')), '\s+', ' ', 'g')) || '|' ||
        lower(regexp_replace(trim(COALESCE(i.model_number, '')), '\s+', ' ', 'g')),
      i.description,
      i.model_number,
      CASE
        WHEN sr.status = 'approved' THEN 'approved'
        WHEN i.line_approval_status = 'approved' THEN 'approved'
        WHEN _b.design_review_status IN ('design_approved','final_sent')
             AND COALESCE(_b.verification_status, 'approved') = 'approved'
             AND (SELECT n FROM blocking_rows) = 0 THEN 'approved'
        ELSE 'not_approved'
      END,
      COALESCE(i.line_approval_comment, sr.reason),
      COALESCE(cr.comments, '[]'::jsonb),
      CASE WHEN sr.status = 'approved' OR i.line_approval_status = 'approved' THEN sr.decided_by ELSE NULL END,
      CASE WHEN sr.status = 'approved' OR i.line_approval_status = 'approved' THEN sr.decided_by_name ELSE NULL END,
      CASE WHEN sr.status = 'approved' OR i.line_approval_status = 'approved' THEN sr.decided_by_department ELSE NULL END,
      CASE WHEN sr.status = 'approved' OR i.line_approval_status = 'approved' THEN sr.decided_at ELSE NULL END,
      cr.latest_applied_by,
      cr.latest_applied_at,
      cr.latest_oa_revision_id,
      _b.revised_from_id,
      now()
    FROM item_rows i
    LEFT JOIN status_rows sr ON sr.boq_item_id = i.item_id
    LEFT JOIN comment_rows cr ON cr.boq_item_id = i.item_id
    ON CONFLICT (boq_id, boq_revision, boq_item_id)
    DO UPDATE SET
      order_id = EXCLUDED.order_id,
      order_revision = EXCLUDED.order_revision,
      item_no = EXCLUDED.item_no,
      item_signature = EXCLUDED.item_signature,
      description = EXCLUDED.description,
      model_number = EXCLUDED.model_number,
      approval_status = EXCLUDED.approval_status,
      approval_comment = EXCLUDED.approval_comment,
      design_comments = EXCLUDED.design_comments,
      approved_by = EXCLUDED.approved_by,
      approved_by_name = EXCLUDED.approved_by_name,
      approved_by_department = EXCLUDED.approved_by_department,
      approved_at = EXCLUDED.approved_at,
      applied_to_oa_by = EXCLUDED.applied_to_oa_by,
      applied_to_oa_at = EXCLUDED.applied_to_oa_at,
      oa_revision_id = EXCLUDED.oa_revision_id,
      source_boq_id = EXCLUDED.source_boq_id,
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM upserted;

  DELETE FROM public.boq_revision_approval_snapshots s
  WHERE s.boq_id = _boq_id
    AND s.boq_revision = _b.boq_revision
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(_b.line_items, '[]'::jsonb)) li(value)
      WHERE li.value->>'id' = s.boq_item_id
    );

  RETURN _count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_boq_revision_approval_snapshot(_boq_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required';
  END IF;

  SELECT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_module_access(auth.uid(), 'design')
    OR public.has_module_access(auth.uid(), 'boqs')
    OR EXISTS (
      SELECT 1
      FROM public.boqs b
      LEFT JOIN public.orders o ON o.id = COALESCE(b.source_order_id, b.order_id)
      WHERE b.id = _boq_id
        AND (b.user_id = auth.uid() OR o.user_id = auth.uid())
    )
  ) INTO _allowed;

  IF NOT COALESCE(_allowed, false) THEN
    RAISE EXCEPTION 'Not allowed to refresh approval snapshot';
  END IF;

  RETURN public.refresh_boq_revision_approval_snapshot_internal(_boq_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_refresh_boq_revision_approval_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _boq_id uuid;
BEGIN
  _boq_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.boq_id ELSE NEW.boq_id END;
  IF _boq_id IS NOT NULL THEN
    PERFORM public.refresh_boq_revision_approval_snapshot_internal(_boq_id);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_snapshot_from_design_status ON public.boq_item_design_status;
CREATE TRIGGER trg_refresh_snapshot_from_design_status
AFTER INSERT OR UPDATE OR DELETE ON public.boq_item_design_status
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_boq_revision_approval_snapshot();

DROP TRIGGER IF EXISTS trg_refresh_snapshot_from_design_comments ON public.boq_design_comments;
CREATE TRIGGER trg_refresh_snapshot_from_design_comments
AFTER INSERT OR UPDATE OR DELETE ON public.boq_design_comments
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_boq_revision_approval_snapshot();

CREATE OR REPLACE FUNCTION public.trg_refresh_boq_snapshot_from_boq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.refresh_boq_revision_approval_snapshot_internal(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_approval_snapshot_from_boq ON public.boqs;
CREATE TRIGGER trg_refresh_approval_snapshot_from_boq
AFTER INSERT OR UPDATE OF line_items, design_review_status, verification_status, source_order_id, order_id, revision ON public.boqs
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_boq_snapshot_from_boq();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.boqs ORDER BY created_at ASC LOOP
    PERFORM public.refresh_boq_revision_approval_snapshot_internal(r.id);
  END LOOP;
END $$;