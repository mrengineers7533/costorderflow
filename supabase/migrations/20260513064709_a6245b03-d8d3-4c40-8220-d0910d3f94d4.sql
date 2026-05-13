
ALTER TABLE public.boq_design_reviews
  ADD COLUMN IF NOT EXISTS reviewer_name text,
  ADD COLUMN IF NOT EXISTS reviewer_design_team text,
  ADD COLUMN IF NOT EXISTS reviewer_contact text;

UPDATE storage.buckets SET public = true WHERE id = 'design-review-docs';

DO $$ BEGIN
  CREATE POLICY "design_review_docs_public_read" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'design-review-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "design_review_docs_public_insert" ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'design-review-docs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP FUNCTION IF EXISTS public.submit_design_review_with_token(uuid, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.submit_design_review_with_token(
  _token uuid,
  _reviewer_email text,
  _items jsonb,
  _docs jsonb DEFAULT '[]'::jsonb,
  _reviewer_name text DEFAULT NULL,
  _reviewer_design_team text DEFAULT NULL,
  _reviewer_contact text DEFAULT NULL
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
