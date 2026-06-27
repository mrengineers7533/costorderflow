CREATE OR REPLACE FUNCTION public._boq_item_signature(_description text, _model text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT lower(regexp_replace(trim(COALESCE(_description, '')), '\s+', ' ', 'g')) || '|' ||
         lower(regexp_replace(trim(COALESCE(_model, '')), '\s+', ' ', 'g'));
$$;

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

  WITH item_rows_raw AS (
    SELECT
      li.value AS item,
      li.ord,
      li.value->>'id' AS item_id,
      li.value->>'item_no' AS item_no,
      li.value->>'description' AS description,
      li.value->>'model_number' AS model_number,
      li.value->>'approval_status' AS line_approval_status,
      li.value->>'approval_comment' AS line_approval_comment,
      public._boq_item_signature(li.value->>'description', li.value->>'model_number') AS item_signature,
      lower(regexp_replace(trim(COALESCE(li.value->>'description', '')), '\s+', ' ', 'g')) AS desc_signature
    FROM jsonb_array_elements(COALESCE(_b.line_items, '[]'::jsonb)) WITH ORDINALITY li(value, ord)
    WHERE COALESCE(li.value->>'id', '') <> ''
  ),
  item_rows AS (
    SELECT DISTINCT ON (item_id) *
    FROM item_rows_raw
    ORDER BY item_id, ord
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
  current_status_counts AS (
    SELECT
      count(*) FILTER (WHERE status = 'approved') AS approved_count,
      count(*) FILTER (WHERE status IN ('pending','not_approved','rejected')) AS blocking_count
    FROM status_rows
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
      AND c.applied_to_oa_at IS NOT NULL
    GROUP BY c.boq_item_id
  ),
  source_items AS (
    SELECT
      li.value->>'id' AS source_item_id,
      public._boq_item_signature(li.value->>'description', li.value->>'model_number') AS source_signature,
      lower(regexp_replace(trim(COALESCE(li.value->>'description', '')), '\s+', ' ', 'g')) AS source_desc_signature
    FROM public.boqs pb
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pb.line_items, '[]'::jsonb)) li(value)
    WHERE pb.id = _b.revised_from_id
      AND COALESCE(li.value->>'id', '') <> ''
  ),
  source_status_by_signature AS (
    SELECT DISTINCT ON (si.source_signature)
      si.source_signature,
      si.source_desc_signature,
      s.status,
      s.reason,
      s.decided_by,
      s.decided_by_name,
      s.decided_by_department,
      s.decided_at,
      s.updated_at,
      s.created_at
    FROM source_items si
    JOIN public.boq_item_design_status s
      ON s.boq_id = _b.revised_from_id
     AND s.boq_item_id = si.source_item_id
    ORDER BY si.source_signature, s.decided_at DESC NULLS LAST, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
  ),
  source_status_counts AS (
    SELECT
      count(*) FILTER (WHERE s.status = 'approved') AS approved_count,
      count(*) FILTER (WHERE s.status IN ('pending','not_approved','rejected')) AS blocking_count
    FROM public.boq_item_design_status s
    WHERE s.boq_id = _b.revised_from_id
  ),
  source_snapshot_counts AS (
    SELECT
      count(*) FILTER (WHERE ss.approval_status = 'approved') AS approved_count,
      count(*) FILTER (WHERE ss.approval_status <> 'approved') AS blocking_count
    FROM public.boq_revision_approval_snapshots ss
    WHERE ss.boq_id = _b.revised_from_id
  ),
  source_representative_approval AS (
    SELECT
      COALESCE(s.decided_by, ss.approved_by) AS decided_by,
      COALESCE(s.decided_by_name, ss.approved_by_name) AS decided_by_name,
      COALESCE(s.decided_by_department, ss.approved_by_department) AS decided_by_department,
      COALESCE(s.decided_at, ss.approved_at) AS decided_at
    FROM public.boqs pb
    LEFT JOIN public.boq_item_design_status s ON s.boq_id = pb.id AND s.status = 'approved'
    LEFT JOIN public.boq_revision_approval_snapshots ss ON ss.boq_id = pb.id AND ss.approval_status = 'approved'
    WHERE pb.id = _b.revised_from_id
    ORDER BY COALESCE(s.decided_at, ss.approved_at) DESC NULLS LAST, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST, ss.updated_at DESC NULLS LAST
    LIMIT 1
  ),
  prepared AS (
    SELECT
      i.*,
      sr.status AS direct_status,
      sr.reason AS direct_reason,
      sr.decided_by AS direct_decided_by,
      sr.decided_by_name AS direct_decided_by_name,
      sr.decided_by_department AS direct_decided_by_department,
      sr.decided_at AS direct_decided_at,
      cr.comments,
      cr.latest_applied_by,
      cr.latest_applied_at,
      cr.latest_oa_revision_id,
      ss.id AS source_snapshot_id,
      ss.approval_status AS source_snapshot_status,
      ss.approval_comment AS source_snapshot_comment,
      ss.design_comments AS source_snapshot_comments,
      ss.approved_by AS source_snapshot_approved_by,
      ss.approved_by_name AS source_snapshot_approved_by_name,
      ss.approved_by_department AS source_snapshot_approved_by_department,
      ss.approved_at AS source_snapshot_approved_at,
      ss.applied_to_oa_by AS source_snapshot_applied_by,
      ss.applied_to_oa_at AS source_snapshot_applied_at,
      ss.oa_revision_id AS source_snapshot_oa_revision_id,
      ih.status AS inherited_status,
      ih.reason AS inherited_reason,
      ih.decided_by AS inherited_decided_by,
      ih.decided_by_name AS inherited_decided_by_name,
      ih.decided_by_department AS inherited_decided_by_department,
      ih.decided_at AS inherited_decided_at
    FROM item_rows i
    LEFT JOIN status_rows sr ON sr.boq_item_id = i.item_id
    LEFT JOIN comment_rows cr ON cr.boq_item_id = i.item_id
    LEFT JOIN LATERAL (
      SELECT ss.*
      FROM public.boq_revision_approval_snapshots ss
      WHERE ss.boq_id = _b.revised_from_id
        AND (ss.item_signature = i.item_signature OR lower(regexp_replace(trim(COALESCE(ss.description, '')), '\s+', ' ', 'g')) = i.desc_signature)
      ORDER BY CASE WHEN ss.item_signature = i.item_signature THEN 0 ELSE 1 END,
               ss.updated_at DESC NULLS LAST,
               ss.created_at DESC NULLS LAST
      LIMIT 1
    ) ss ON true
    LEFT JOIN LATERAL (
      SELECT ih.*
      FROM source_status_by_signature ih
      WHERE ih.source_signature = i.item_signature OR ih.source_desc_signature = i.desc_signature
      ORDER BY CASE WHEN ih.source_signature = i.item_signature THEN 0 ELSE 1 END,
               ih.decided_at DESC NULLS LAST,
               ih.updated_at DESC NULLS LAST,
               ih.created_at DESC NULLS LAST
      LIMIT 1
    ) ih ON true
  ),
  upserted AS (
    INSERT INTO public.boq_revision_approval_snapshots (
      boq_id, order_id, order_revision, boq_revision, boq_item_id,
      item_no, item_signature, description, model_number,
      approval_status, approval_comment, design_comments,
      approved_by, approved_by_name, approved_by_department, approved_at,
      applied_to_oa_by, applied_to_oa_at, oa_revision_id,
      source_boq_id, source_snapshot_id, updated_at
    )
    SELECT
      _b.id,
      _b.snapshot_order_id,
      _b.order_revision,
      _b.boq_revision,
      p.item_id,
      p.item_no,
      p.item_signature,
      p.description,
      p.model_number,
      CASE
        WHEN p.direct_status = 'approved' THEN 'approved'
        WHEN p.direct_status IN ('pending','not_approved','rejected') THEN 'not_approved'
        WHEN p.line_approval_status = 'approved' THEN 'approved'
        WHEN p.source_snapshot_status = 'approved' THEN 'approved'
        WHEN p.inherited_status = 'approved' THEN 'approved'
        WHEN (SELECT approved_count FROM source_status_counts) > 0
             AND (SELECT blocking_count FROM source_status_counts) = 0 THEN 'approved'
        WHEN (SELECT approved_count FROM source_snapshot_counts) > 0
             AND (SELECT blocking_count FROM source_snapshot_counts) = 0 THEN 'approved'
        WHEN _b.design_review_status IN ('design_approved','final_sent')
             AND COALESCE(_b.verification_status, 'approved') = 'approved'
             AND (SELECT blocking_count FROM current_status_counts) = 0 THEN 'approved'
        ELSE 'not_approved'
      END,
      COALESCE(p.line_approval_comment, p.direct_reason, p.source_snapshot_comment, p.inherited_reason),
      COALESCE(p.comments, p.source_snapshot_comments, '[]'::jsonb),
      COALESCE(
        CASE WHEN p.direct_status = 'approved' THEN p.direct_decided_by END,
        CASE WHEN p.line_approval_status = 'approved' THEN p.direct_decided_by END,
        CASE WHEN p.source_snapshot_status = 'approved' THEN p.source_snapshot_approved_by END,
        CASE WHEN p.inherited_status = 'approved' THEN p.inherited_decided_by END,
        (SELECT decided_by FROM source_representative_approval)
      ),
      COALESCE(
        CASE WHEN p.direct_status = 'approved' THEN p.direct_decided_by_name END,
        CASE WHEN p.line_approval_status = 'approved' THEN p.direct_decided_by_name END,
        CASE WHEN p.source_snapshot_status = 'approved' THEN p.source_snapshot_approved_by_name END,
        CASE WHEN p.inherited_status = 'approved' THEN p.inherited_decided_by_name END,
        (SELECT decided_by_name FROM source_representative_approval)
      ),
      COALESCE(
        CASE WHEN p.direct_status = 'approved' THEN p.direct_decided_by_department END,
        CASE WHEN p.line_approval_status = 'approved' THEN p.direct_decided_by_department END,
        CASE WHEN p.source_snapshot_status = 'approved' THEN p.source_snapshot_approved_by_department END,
        CASE WHEN p.inherited_status = 'approved' THEN p.inherited_decided_by_department END,
        (SELECT decided_by_department FROM source_representative_approval)
      ),
      COALESCE(
        CASE WHEN p.direct_status = 'approved' THEN p.direct_decided_at END,
        CASE WHEN p.line_approval_status = 'approved' THEN p.direct_decided_at END,
        CASE WHEN p.source_snapshot_status = 'approved' THEN p.source_snapshot_approved_at END,
        CASE WHEN p.inherited_status = 'approved' THEN p.inherited_decided_at END,
        (SELECT decided_at FROM source_representative_approval)
      ),
      COALESCE(p.latest_applied_by, p.source_snapshot_applied_by),
      COALESCE(p.latest_applied_at, p.source_snapshot_applied_at),
      COALESCE(p.latest_oa_revision_id, p.source_snapshot_oa_revision_id),
      _b.revised_from_id,
      p.source_snapshot_id,
      now()
    FROM prepared p
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
      source_snapshot_id = EXCLUDED.source_snapshot_id,
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

DROP TRIGGER IF EXISTS trg_refresh_snapshot_from_design_status ON public.boq_item_design_status;
DROP TRIGGER IF EXISTS trg_refresh_approval_snapshot_from_status ON public.boq_item_design_status;
CREATE TRIGGER trg_refresh_approval_snapshot_from_status
AFTER INSERT OR UPDATE OR DELETE ON public.boq_item_design_status
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_boq_revision_approval_snapshot();

DROP TRIGGER IF EXISTS trg_refresh_snapshot_from_design_comments ON public.boq_design_comments;
DROP TRIGGER IF EXISTS trg_refresh_approval_snapshot_from_comments ON public.boq_design_comments;
CREATE TRIGGER trg_refresh_approval_snapshot_from_comments
AFTER INSERT OR UPDATE OR DELETE ON public.boq_design_comments
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_boq_revision_approval_snapshot();

DROP TRIGGER IF EXISTS trg_refresh_approval_snapshot_from_boq ON public.boqs;
CREATE TRIGGER trg_refresh_approval_snapshot_from_boq
AFTER INSERT OR UPDATE OF line_items, design_review_status, verification_status, source_order_id, order_id, revision, revised_from_id ON public.boqs
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_boq_snapshot_from_boq();

CREATE OR REPLACE FUNCTION public.repair_inherited_boq_approval_snapshots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  _fixed integer := 0;
  _new_items jsonb;
BEGIN
  FOR r IN
    WITH child AS (
      SELECT b.*,
             jsonb_array_length(COALESCE(b.line_items,'[]'::jsonb)) AS child_item_count,
             (SELECT count(*) FROM jsonb_array_elements(COALESCE(b.line_items,'[]'::jsonb)) li WHERE li.value->>'approval_status' = 'approved') AS child_line_approved,
             (SELECT count(*) FROM public.boq_item_design_status s WHERE s.boq_id = b.id AND s.status = 'approved') AS child_status_approved,
             (SELECT count(*) FROM public.boq_item_design_status s WHERE s.boq_id = b.id AND s.status IN ('pending','not_approved','rejected')) AS child_blocking
      FROM public.boqs b
      WHERE b.revised_from_id IS NOT NULL
    ), source_ok AS (
      SELECT c.*,
             pb.line_items AS source_line_items,
             pb.verification_status AS source_verification_status,
             pb.design_review_status AS source_design_review_status,
             pb.verified_at AS source_verified_at,
             pb.verified_by_email AS source_verified_by_email,
             (SELECT count(*) FROM public.boq_item_design_status s WHERE s.boq_id = pb.id AND s.status = 'approved') AS source_approved,
             (SELECT count(*) FROM public.boq_item_design_status s WHERE s.boq_id = pb.id AND s.status IN ('pending','not_approved','rejected')) AS source_blocking,
             (SELECT count(*) FROM public.boq_revision_approval_snapshots sn WHERE sn.boq_id = pb.id AND sn.approval_status = 'approved') AS source_snapshot_approved,
             (SELECT count(*) FROM public.boq_revision_approval_snapshots sn WHERE sn.boq_id = pb.id AND sn.approval_status <> 'approved') AS source_snapshot_blocking,
             (SELECT count(*) FROM jsonb_array_elements(COALESCE(pb.line_items,'[]'::jsonb)) li WHERE li.value->>'approval_status' = 'approved') AS source_line_approved
      FROM child c
      JOIN public.boqs pb ON pb.id = c.revised_from_id
      WHERE c.child_item_count > 0
        AND c.child_blocking = 0
        AND (c.child_line_approved < c.child_item_count OR c.child_status_approved = 0)
    )
    SELECT * FROM source_ok
    WHERE (source_approved > 0 AND source_blocking = 0)
       OR (source_snapshot_approved > 0 AND source_snapshot_blocking = 0)
       OR source_line_approved > 0
    ORDER BY created_at ASC
  LOOP
    WITH source_items AS (
      SELECT
        li.value->>'id' AS source_item_id,
        public._boq_item_signature(li.value->>'description', li.value->>'model_number') AS sig,
        lower(regexp_replace(trim(COALESCE(li.value->>'description','')), '\s+', ' ', 'g')) AS desc_sig,
        li.value->>'approval_comment' AS line_comment
      FROM jsonb_array_elements(COALESCE(r.source_line_items, '[]'::jsonb)) li(value)
    ), child_items AS (
      SELECT
        li.value,
        li.ord,
        li.value->>'id' AS child_item_id,
        public._boq_item_signature(li.value->>'description', li.value->>'model_number') AS sig,
        lower(regexp_replace(trim(COALESCE(li.value->>'description','')), '\s+', ' ', 'g')) AS desc_sig
      FROM jsonb_array_elements(COALESCE(r.line_items, '[]'::jsonb)) WITH ORDINALITY li(value, ord)
    ), patched AS (
      SELECT jsonb_agg(
        CASE
          WHEN COALESCE(ds.status, ss.approval_status, CASE WHEN r.source_line_approved > 0 THEN 'approved' END) = 'approved'
          THEN ci.value || jsonb_build_object('approval_status','approved','approval_comment',COALESCE(ci.value->>'approval_comment', ss.approval_comment, ds.reason, si.line_comment, ''))
          ELSE ci.value
        END
        ORDER BY ci.ord
      ) AS items
      FROM child_items ci
      LEFT JOIN source_items si ON si.sig = ci.sig OR si.desc_sig = ci.desc_sig
      LEFT JOIN LATERAL (
        SELECT s.* FROM public.boq_item_design_status s
        WHERE s.boq_id = r.revised_from_id
          AND s.boq_item_id = si.source_item_id
        ORDER BY s.decided_at DESC NULLS LAST, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
        LIMIT 1
      ) ds ON true
      LEFT JOIN LATERAL (
        SELECT ss.* FROM public.boq_revision_approval_snapshots ss
        WHERE ss.boq_id = r.revised_from_id
          AND (ss.item_signature = ci.sig OR lower(regexp_replace(trim(COALESCE(ss.description,'')), '\s+', ' ', 'g')) = ci.desc_sig)
        ORDER BY CASE WHEN ss.item_signature = ci.sig THEN 0 ELSE 1 END,
                 ss.updated_at DESC NULLS LAST,
                 ss.created_at DESC NULLS LAST
        LIMIT 1
      ) ss ON true
    )
    SELECT items INTO _new_items FROM patched;

    IF _new_items IS NOT NULL THEN
      UPDATE public.boqs
         SET line_items = _new_items,
             verification_status = CASE
               WHEN r.source_verification_status = 'approved' THEN 'approved'
               ELSE verification_status
             END,
             design_review_status = CASE
               WHEN r.source_design_review_status IN ('design_approved','final_sent') THEN r.source_design_review_status
               ELSE design_review_status
             END,
             verified_at = COALESCE(verified_at, r.source_verified_at),
             verified_by_email = COALESCE(verified_by_email, r.source_verified_by_email),
             updated_at = now()
       WHERE id = r.id;
    END IF;

    WITH child_items AS (
      SELECT
        li.value->>'id' AS child_item_id,
        public._boq_item_signature(li.value->>'description', li.value->>'model_number') AS sig,
        lower(regexp_replace(trim(COALESCE(li.value->>'description','')), '\s+', ' ', 'g')) AS desc_sig
      FROM jsonb_array_elements(COALESCE(_new_items, r.line_items, '[]'::jsonb)) li(value)
    ), source_items AS (
      SELECT
        li.value->>'id' AS source_item_id,
        public._boq_item_signature(li.value->>'description', li.value->>'model_number') AS sig,
        lower(regexp_replace(trim(COALESCE(li.value->>'description','')), '\s+', ' ', 'g')) AS desc_sig
      FROM jsonb_array_elements(COALESCE(r.source_line_items, '[]'::jsonb)) li(value)
    ), rep AS (
      SELECT COALESCE(s.decided_by, ss.approved_by) AS decided_by,
             COALESCE(s.decided_by_name, ss.approved_by_name) AS decided_by_name,
             COALESCE(s.decided_by_department, ss.approved_by_department) AS decided_by_department,
             COALESCE(s.decided_at, ss.approved_at, now()) AS decided_at
      FROM public.boqs pb
      LEFT JOIN public.boq_item_design_status s ON s.boq_id = pb.id AND s.status = 'approved'
      LEFT JOIN public.boq_revision_approval_snapshots ss ON ss.boq_id = pb.id AND ss.approval_status = 'approved'
      WHERE pb.id = r.revised_from_id
      ORDER BY COALESCE(s.decided_at, ss.approved_at) DESC NULLS LAST, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST, ss.updated_at DESC NULLS LAST
      LIMIT 1
    ), matched AS (
      SELECT DISTINCT ON (ci.child_item_id)
        ci.child_item_id,
        COALESCE(ds.status, ss.approval_status, CASE WHEN r.source_line_approved > 0 THEN 'approved' END) AS status,
        COALESCE(ds.reason, ss.approval_comment) AS reason,
        COALESCE(ds.decided_by, ss.approved_by, rep.decided_by) AS decided_by,
        COALESCE(ds.decided_by_name, ss.approved_by_name, rep.decided_by_name) AS decided_by_name,
        COALESCE(ds.decided_by_department, ss.approved_by_department, rep.decided_by_department) AS decided_by_department,
        COALESCE(ds.decided_at, ss.approved_at, rep.decided_at, now()) AS decided_at
      FROM child_items ci
      LEFT JOIN source_items si ON si.sig = ci.sig OR si.desc_sig = ci.desc_sig
      LEFT JOIN LATERAL (
        SELECT s.* FROM public.boq_item_design_status s
        WHERE s.boq_id = r.revised_from_id AND s.boq_item_id = si.source_item_id
        ORDER BY s.decided_at DESC NULLS LAST, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
        LIMIT 1
      ) ds ON true
      LEFT JOIN LATERAL (
        SELECT ss.* FROM public.boq_revision_approval_snapshots ss
        WHERE ss.boq_id = r.revised_from_id
          AND (ss.item_signature = ci.sig OR lower(regexp_replace(trim(COALESCE(ss.description,'')), '\s+', ' ', 'g')) = ci.desc_sig)
        ORDER BY CASE WHEN ss.item_signature = ci.sig THEN 0 ELSE 1 END,
                 ss.updated_at DESC NULLS LAST,
                 ss.created_at DESC NULLS LAST
        LIMIT 1
      ) ss ON true
      LEFT JOIN rep ON true
      WHERE ci.child_item_id IS NOT NULL
      ORDER BY ci.child_item_id
    )
    INSERT INTO public.boq_item_design_status (
      boq_id, boq_item_id, boq_revision, status, reason,
      decided_by, decided_by_name, decided_by_department, decided_at
    )
    SELECT r.id, child_item_id, COALESCE(r.revision, 0), 'approved',
           reason, decided_by, decided_by_name, decided_by_department, decided_at
    FROM matched m
    WHERE status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.boq_item_design_status existing
        WHERE existing.boq_id = r.id
          AND existing.boq_item_id = m.child_item_id
          AND COALESCE(existing.boq_revision, COALESCE(r.revision, 0)) = COALESCE(r.revision, 0)
      );

    WITH child_items AS (
      SELECT
        li.value->>'id' AS child_item_id,
        public._boq_item_signature(li.value->>'description', li.value->>'model_number') AS sig,
        lower(regexp_replace(trim(COALESCE(li.value->>'description','')), '\s+', ' ', 'g')) AS desc_sig
      FROM jsonb_array_elements(COALESCE(_new_items, r.line_items, '[]'::jsonb)) li(value)
    ), source_items AS (
      SELECT
        li.value->>'id' AS source_item_id,
        public._boq_item_signature(li.value->>'description', li.value->>'model_number') AS sig,
        lower(regexp_replace(trim(COALESCE(li.value->>'description','')), '\s+', ' ', 'g')) AS desc_sig
      FROM jsonb_array_elements(COALESCE(r.source_line_items, '[]'::jsonb)) li(value)
    ), matched_comments AS (
      SELECT DISTINCT ON (ci.child_item_id, c.column_key, c.comment)
        ci.child_item_id,
        c.column_key,
        c.comment,
        c.user_id,
        c.user_name,
        c.user_email,
        c.department,
        c.applied_to_oa_at,
        c.applied_to_oa_by,
        c.applied_value,
        c.oa_revision_id
      FROM child_items ci
      JOIN source_items si ON si.sig = ci.sig OR si.desc_sig = ci.desc_sig
      JOIN public.boq_design_comments c ON c.boq_id = r.revised_from_id AND c.boq_item_id = si.source_item_id
      WHERE c.applied_to_oa_at IS NOT NULL
      ORDER BY ci.child_item_id, c.column_key, c.comment, c.created_at DESC
    )
    INSERT INTO public.boq_design_comments (
      boq_id, boq_item_id, column_key, comment, user_id, user_name, user_email, department,
      applied_to_oa_at, applied_to_oa_by, applied_value, oa_revision_id
    )
    SELECT r.id, child_item_id, column_key, comment, user_id, user_name, user_email, department,
           applied_to_oa_at, applied_to_oa_by, applied_value, oa_revision_id
    FROM matched_comments mc
    WHERE NOT EXISTS (
      SELECT 1 FROM public.boq_design_comments existing
      WHERE existing.boq_id = r.id
        AND existing.boq_item_id = mc.child_item_id
        AND existing.column_key IS NOT DISTINCT FROM mc.column_key
        AND existing.comment IS NOT DISTINCT FROM mc.comment
    );

    PERFORM public.refresh_boq_revision_approval_snapshot_internal(r.revised_from_id);
    PERFORM public.refresh_boq_revision_approval_snapshot_internal(r.id);
    _fixed := _fixed + 1;
  END LOOP;

  RETURN _fixed;
END;
$function$;

REVOKE ALL ON FUNCTION public.repair_inherited_boq_approval_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_inherited_boq_approval_snapshots() TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.boqs ORDER BY created_at ASC LOOP
    PERFORM public.refresh_boq_revision_approval_snapshot_internal(r.id);
  END LOOP;
  PERFORM public.repair_inherited_boq_approval_snapshots();
END $$;