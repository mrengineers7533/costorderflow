-- Add quantity, unit, remarks to design-review item snapshots so external reviewers see the full BOQ line
ALTER TABLE public.boq_design_review_items
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS remarks text;

-- Backfill existing review items from their parent BOQ line_items JSONB
UPDATE public.boq_design_review_items dri
SET
  quantity = COALESCE(
    (SELECT (li.value->>'quantity')::numeric FROM jsonb_array_elements((SELECT line_items FROM public.boqs WHERE id = (SELECT boq_id FROM public.boq_design_reviews WHERE id = dri.review_id))) AS li WHERE li.value->>'id' = dri.boq_item_id),
    0
  ),
  unit = COALESCE(
    (SELECT li.value->>'unit' FROM jsonb_array_elements((SELECT line_items FROM public.boqs WHERE id = (SELECT boq_id FROM public.boq_design_reviews WHERE id = dri.review_id))) AS li WHERE li.value->>'id' = dri.boq_item_id),
    'Nos'
  ),
  remarks = COALESCE(
    (SELECT li.value->>'remarks' FROM jsonb_array_elements((SELECT line_items FROM public.boqs WHERE id = (SELECT boq_id FROM public.boq_design_reviews WHERE id = dri.review_id))) AS li WHERE li.value->>'id' = dri.boq_item_id),
    ''
  );

-- Ensure design-review-docs bucket stays public
UPDATE storage.buckets SET public = true WHERE id = 'design-review-docs';

-- Add index for faster review-item lookups
CREATE INDEX IF NOT EXISTS idx_boq_design_review_items_review_id ON public.boq_design_review_items(review_id);
CREATE INDEX IF NOT EXISTS idx_boq_design_review_docs_review_id ON public.boq_design_review_documents(review_id);

-- Create index on boq_design_reviews token for fast lookup
CREATE INDEX IF NOT EXISTS idx_boq_design_reviews_token ON public.boq_design_reviews(token);
CREATE INDEX IF NOT EXISTS idx_boq_design_reviews_boq_id ON public.boq_design_reviews(boq_id);

-- Ensure boq_design_reviews has user_id column (nullable, for ownership)
ALTER TABLE public.boq_design_reviews
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add comment on new columns for documentation
COMMENT ON COLUMN public.boq_design_review_items.quantity IS 'Snapshot of BOQ line item quantity at review creation time';
COMMENT ON COLUMN public.boq_design_review_items.unit IS 'Snapshot of BOQ line item unit at review creation time';
COMMENT ON COLUMN public.boq_design_review_items.remarks IS 'Snapshot of BOQ line item remarks at review creation time';

-- Ensure boqs.design_review_status has a sensible default and exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'boqs' AND column_name = 'design_review_status'
  ) THEN
    ALTER TABLE public.boqs ADD COLUMN design_review_status text NOT NULL DEFAULT 'draft';
  END IF;
END
$$;

-- Re-create function to make sure it is current
CREATE OR REPLACE FUNCTION public.submit_design_review_with_token(
  _token uuid,
  _reviewer_email text,
  _items jsonb,
  _docs jsonb DEFAULT '[]'::jsonb,
  _reviewer_name text DEFAULT NULL::text,
  _reviewer_design_team text DEFAULT NULL::text,
  _reviewer_contact text DEFAULT NULL::text
)
RETURNS public.boq_design_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.boq_design_reviews;
  _it jsonb;
  _all_approved boolean := true;
  _any_change boolean := false;
  _outcome text;
  _doc jsonb;
BEGIN
  SELECT * INTO _row FROM public.boq_design_reviews
   WHERE token = _token AND status = 'sent' AND expires_at > now()
   LIMIT 1;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or already submitted review link';
  END IF;

  FOR _it IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    UPDATE public.boq_design_review_items
       SET decision = COALESCE(_it->>'decision', 'pending'),
           comment = _it->>'comment',
           design_change_note = _it->>'design_change_note',
           decided_at = now()
     WHERE review_id = _row.id AND boq_item_id = _it->>'boq_item_id';

    IF (_it->>'decision') = 'change_required' THEN
      _any_change := true; _all_approved := false;
    ELSIF (_it->>'decision') <> 'approved' THEN
      _all_approved := false;
    END IF;
  END LOOP;

  FOR _doc IN SELECT value FROM jsonb_array_elements(_docs)
  LOOP
    INSERT INTO public.boq_design_review_documents
      (review_id, boq_item_id, source, file_name, file_path, uploaded_by_email)
    VALUES
      (_row.id, _doc->>'boq_item_id', 'reviewer',
       _doc->>'file_name', _doc->>'file_path', _reviewer_email);
  END LOOP;

  IF _all_approved THEN _outcome := 'approved';
  ELSIF _any_change THEN _outcome := 'changes_required';
  ELSE _outcome := 'partial';
  END IF;

  UPDATE public.boq_design_reviews
     SET status = 'submitted',
         submitted_at = now(),
         submitted_by_email = _reviewer_email,
         reviewer_name = COALESCE(_reviewer_name, reviewer_name),
         reviewer_design_team = COALESCE(_reviewer_design_team, reviewer_design_team),
         reviewer_contact = COALESCE(_reviewer_contact, reviewer_contact),
         overall_outcome = _outcome,
         updated_at = now()
   WHERE id = _row.id
   RETURNING * INTO _row;

  UPDATE public.boqs
     SET design_review_status = CASE _outcome
       WHEN 'approved' THEN 'approved_by_design'
       WHEN 'changes_required' THEN 'changes_required'
       ELSE 'review_received' END,
         updated_at = now()
   WHERE id = _row.boq_id;

  RETURN _row;
END;
$function$;