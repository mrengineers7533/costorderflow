
-- ============================================================
-- carry_forward_boq_design_state: SECURITY DEFINER helper so
-- Costing users revising an OA can copy the prior BOQ's Design
-- approvals + applied comments onto the new BOQ revision.
-- Previously blocked by design:edit-only INSERT RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.carry_forward_boq_design_state(
  _prev_boq_id uuid,
  _new_boq_id  uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid       uuid := auth.uid();
  _new_rev   int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  -- Caller must have edit rights over the new BOQ (admin or costing:edit).
  IF NOT (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.can_edit_module(_uid, 'costing')
  ) THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  IF _prev_boq_id IS NULL OR _new_boq_id IS NULL OR _prev_boq_id = _new_boq_id THEN
    RETURN;
  END IF;

  SELECT revision INTO _new_rev FROM public.boqs WHERE id = _new_boq_id;
  IF _new_rev IS NULL THEN _new_rev := 0; END IF;

  -- ---- 1) Carry Design item status rows via description+model signature ----
  WITH prev_items AS (
    SELECT
      lower(btrim(coalesce(elem->>'description',''))) || '|' ||
        lower(btrim(coalesce(elem->>'model_number',''))) AS sig,
      (elem->>'id')::uuid AS item_id
    FROM public.boqs b, jsonb_array_elements(b.line_items) elem
    WHERE b.id = _prev_boq_id
  ),
  new_items AS (
    SELECT
      lower(btrim(coalesce(elem->>'description',''))) || '|' ||
        lower(btrim(coalesce(elem->>'model_number',''))) AS sig,
      (elem->>'id')::uuid AS item_id
    FROM public.boqs b, jsonb_array_elements(b.line_items) elem
    WHERE b.id = _new_boq_id
  ),
  prev_status_by_sig AS (
    SELECT DISTINCT ON (pi.sig)
      pi.sig,
      s.status, s.reason,
      s.decided_by, s.decided_by_name, s.decided_by_department, s.decided_at
    FROM public.boq_item_design_status s
    JOIN prev_items pi ON pi.item_id = s.boq_item_id
    WHERE s.boq_id = _prev_boq_id
    ORDER BY pi.sig,
      CASE WHEN s.status='approved' THEN 0 ELSE 1 END,
      s.decided_at DESC NULLS LAST
  ),
  prev_summary AS (
    SELECT
      COUNT(*) FILTER (WHERE status='approved') AS approved_ct,
      COUNT(*) FILTER (WHERE status IN ('not_approved','rejected','pending')) AS blocking_ct
    FROM public.boq_item_design_status
    WHERE boq_id = _prev_boq_id
  ),
  prev_rep AS (
    SELECT status, reason, decided_by, decided_by_name, decided_by_department, decided_at
    FROM public.boq_item_design_status
    WHERE boq_id = _prev_boq_id AND status='approved'
    ORDER BY decided_at DESC NULLS LAST
    LIMIT 1
  )
  INSERT INTO public.boq_item_design_status (
    boq_id, boq_item_id, boq_revision, status, reason,
    decided_by, decided_by_name, decided_by_department, decided_at
  )
  SELECT
    _new_boq_id,
    ni.item_id,
    _new_rev,
    COALESCE(
      ps.status,
      CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.status END
    ),
    COALESCE(ps.reason, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.reason END),
    COALESCE(ps.decided_by, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.decided_by END),
    COALESCE(ps.decided_by_name, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.decided_by_name END),
    COALESCE(ps.decided_by_department, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.decided_by_department END),
    COALESCE(ps.decided_at, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.decided_at END)
  FROM new_items ni
  LEFT JOIN prev_status_by_sig ps ON ps.sig = ni.sig
  CROSS JOIN prev_summary sm
  LEFT JOIN prev_rep pr ON true
  WHERE COALESCE(
    ps.status,
    CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.status END
  ) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.boq_item_design_status ex
    WHERE ex.boq_id = _new_boq_id AND ex.boq_item_id = ni.item_id
  );

  -- ---- 2) Carry applied Design comments (only ones already applied to OA) ----
  WITH prev_items AS (
    SELECT
      lower(btrim(coalesce(elem->>'description',''))) || '|' ||
        lower(btrim(coalesce(elem->>'model_number',''))) AS sig,
      (elem->>'id')::uuid AS item_id
    FROM public.boqs b, jsonb_array_elements(b.line_items) elem
    WHERE b.id = _prev_boq_id
  ),
  new_items AS (
    SELECT
      lower(btrim(coalesce(elem->>'description',''))) || '|' ||
        lower(btrim(coalesce(elem->>'model_number',''))) AS sig,
      (elem->>'id')::uuid AS item_id
    FROM public.boqs b, jsonb_array_elements(b.line_items) elem
    WHERE b.id = _new_boq_id
  ),
  new_by_sig AS (
    SELECT DISTINCT ON (sig) sig, item_id FROM new_items ORDER BY sig, item_id
  )
  INSERT INTO public.boq_design_comments (
    boq_id, boq_item_id, column_key, comment,
    user_id, user_name, user_email, department,
    applied_to_oa_at, applied_to_oa_by, applied_value, oa_revision_id
  )
  SELECT
    _new_boq_id,
    ns.item_id,
    c.column_key, c.comment,
    c.user_id, c.user_name, c.user_email, c.department,
    COALESCE(c.applied_to_oa_at, now()),
    c.applied_to_oa_by, c.applied_value, c.oa_revision_id
  FROM public.boq_design_comments c
  JOIN prev_items pi ON pi.item_id = c.boq_item_id
  JOIN new_by_sig ns ON ns.sig = pi.sig
  WHERE c.boq_id = _prev_boq_id
    AND c.applied_to_oa_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.boq_design_comments ex
      WHERE ex.boq_id = _new_boq_id
        AND ex.boq_item_id = ns.item_id
        AND COALESCE(ex.column_key,'') = COALESCE(c.column_key,'')
        AND ex.comment = c.comment
    );

  -- ---- 3) Patch new BOQ line_items with approval_status='approved' for carried items ----
  UPDATE public.boqs b
  SET line_items = COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN st.status = 'approved' THEN
          jsonb_set(
            jsonb_set(t.elem, '{approval_status}', to_jsonb('approved'::text)),
            '{approval_comment}',
            to_jsonb(COALESCE(st.reason, t.elem->>'approval_comment', ''))
          )
        ELSE t.elem
      END
      ORDER BY t.ord
    )
    FROM jsonb_array_elements(b.line_items) WITH ORDINALITY AS t(elem, ord)
    LEFT JOIN public.boq_item_design_status st
      ON st.boq_id = b.id
     AND st.boq_item_id = NULLIF(t.elem->>'id','')::uuid
  ), b.line_items)
  WHERE b.id = _new_boq_id;

  -- ---- 4) Refresh the revision-wise approval snapshot ----
  BEGIN
    PERFORM public.refresh_boq_revision_approval_snapshot(_new_boq_id);
  EXCEPTION WHEN OTHERS THEN
    -- non-fatal
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.carry_forward_boq_design_state(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carry_forward_boq_design_state(uuid, uuid) TO authenticated;

-- ============================================================
-- One-time backfill: repair every BOQ whose prior revision had
-- Design approvals/comments that failed to carry forward.
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS new_id, b.revised_from_id AS prev_id
    FROM public.boqs b
    WHERE b.revised_from_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.boq_item_design_status s WHERE s.boq_id = b.id
      )
      AND EXISTS (
        SELECT 1 FROM public.boq_item_design_status s WHERE s.boq_id = b.revised_from_id
      )
  LOOP
    BEGIN
      -- Reuse the function's logic but skip auth checks by inlining minimally:
      -- easiest is to just run the same INSERTs with SECURITY DEFINER context.
      -- We call a helper that mirrors the RPC body without auth gating.
      INSERT INTO public.boq_item_design_status (
        boq_id, boq_item_id, boq_revision, status, reason,
        decided_by, decided_by_name, decided_by_department, decided_at
      )
      WITH prev_items AS (
        SELECT
          lower(btrim(coalesce(elem->>'description',''))) || '|' ||
            lower(btrim(coalesce(elem->>'model_number',''))) AS sig,
          (elem->>'id')::uuid AS item_id
        FROM public.boqs b, jsonb_array_elements(b.line_items) elem
        WHERE b.id = r.prev_id
      ),
      new_items AS (
        SELECT
          lower(btrim(coalesce(elem->>'description',''))) || '|' ||
            lower(btrim(coalesce(elem->>'model_number',''))) AS sig,
          (elem->>'id')::uuid AS item_id
        FROM public.boqs b, jsonb_array_elements(b.line_items) elem
        WHERE b.id = r.new_id
      ),
      prev_status_by_sig AS (
        SELECT DISTINCT ON (pi.sig)
          pi.sig, s.status, s.reason,
          s.decided_by, s.decided_by_name, s.decided_by_department, s.decided_at
        FROM public.boq_item_design_status s
        JOIN prev_items pi ON pi.item_id = s.boq_item_id
        WHERE s.boq_id = r.prev_id
        ORDER BY pi.sig,
          CASE WHEN s.status='approved' THEN 0 ELSE 1 END,
          s.decided_at DESC NULLS LAST
      ),
      prev_summary AS (
        SELECT
          COUNT(*) FILTER (WHERE status='approved') AS approved_ct,
          COUNT(*) FILTER (WHERE status IN ('not_approved','rejected','pending')) AS blocking_ct
        FROM public.boq_item_design_status
        WHERE boq_id = r.prev_id
      ),
      prev_rep AS (
        SELECT status, reason, decided_by, decided_by_name, decided_by_department, decided_at
        FROM public.boq_item_design_status
        WHERE boq_id = r.prev_id AND status='approved'
        ORDER BY decided_at DESC NULLS LAST LIMIT 1
      )
      SELECT
        r.new_id, ni.item_id,
        COALESCE((SELECT revision FROM public.boqs WHERE id = r.new_id), 0),
        COALESCE(ps.status, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.status END),
        COALESCE(ps.reason, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.reason END),
        COALESCE(ps.decided_by, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.decided_by END),
        COALESCE(ps.decided_by_name, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.decided_by_name END),
        COALESCE(ps.decided_by_department, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.decided_by_department END),
        COALESCE(ps.decided_at, CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.decided_at END)
      FROM new_items ni
      LEFT JOIN prev_status_by_sig ps ON ps.sig = ni.sig
      CROSS JOIN prev_summary sm
      LEFT JOIN prev_rep pr ON true
      WHERE COALESCE(
        ps.status,
        CASE WHEN sm.approved_ct > 0 AND sm.blocking_ct = 0 THEN pr.status END
      ) IS NOT NULL;

      -- Also carry applied comments
      INSERT INTO public.boq_design_comments (
        boq_id, boq_item_id, column_key, comment,
        user_id, user_name, user_email, department,
        applied_to_oa_at, applied_to_oa_by, applied_value, oa_revision_id
      )
      WITH prev_items AS (
        SELECT
          lower(btrim(coalesce(elem->>'description',''))) || '|' ||
            lower(btrim(coalesce(elem->>'model_number',''))) AS sig,
          (elem->>'id')::uuid AS item_id
        FROM public.boqs b, jsonb_array_elements(b.line_items) elem
        WHERE b.id = r.prev_id
      ),
      new_items AS (
        SELECT
          lower(btrim(coalesce(elem->>'description',''))) || '|' ||
            lower(btrim(coalesce(elem->>'model_number',''))) AS sig,
          (elem->>'id')::uuid AS item_id
        FROM public.boqs b, jsonb_array_elements(b.line_items) elem
        WHERE b.id = r.new_id
      ),
      new_by_sig AS (
        SELECT DISTINCT ON (sig) sig, item_id FROM new_items ORDER BY sig, item_id
      )
      SELECT
        r.new_id, ns.item_id, c.column_key, c.comment,
        c.user_id, c.user_name, c.user_email, c.department,
        COALESCE(c.applied_to_oa_at, now()), c.applied_to_oa_by, c.applied_value, c.oa_revision_id
      FROM public.boq_design_comments c
      JOIN prev_items pi ON pi.item_id = c.boq_item_id
      JOIN new_by_sig ns ON ns.sig = pi.sig
      WHERE c.boq_id = r.prev_id
        AND c.applied_to_oa_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.boq_design_comments ex
          WHERE ex.boq_id = r.new_id
            AND ex.boq_item_id = ns.item_id
            AND COALESCE(ex.column_key,'') = COALESCE(c.column_key,'')
            AND ex.comment = c.comment
        );

      -- Patch line_items snapshot
      UPDATE public.boqs b
      SET line_items = COALESCE((
        SELECT jsonb_agg(
          CASE
            WHEN st.status = 'approved' THEN
              jsonb_set(
                jsonb_set(t.elem, '{approval_status}', to_jsonb('approved'::text)),
                '{approval_comment}',
                to_jsonb(COALESCE(st.reason, t.elem->>'approval_comment', ''))
              )
            ELSE t.elem
          END
          ORDER BY t.ord
        )
        FROM jsonb_array_elements(b.line_items) WITH ORDINALITY AS t(elem, ord)
        LEFT JOIN public.boq_item_design_status st
          ON st.boq_id = b.id
         AND st.boq_item_id = NULLIF(t.elem->>'id','')::uuid
      ), b.line_items)
      WHERE b.id = r.new_id;

      BEGIN
        PERFORM public.refresh_boq_revision_approval_snapshot(r.new_id);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'backfill failed for boq %: %', r.new_id, SQLERRM;
    END;
  END LOOP;
END $$;
