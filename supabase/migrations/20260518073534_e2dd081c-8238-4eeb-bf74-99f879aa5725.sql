
-- 1. BOQ columns for final share
ALTER TABLE public.boqs
  ADD COLUMN IF NOT EXISTS final_share_token uuid,
  ADD COLUMN IF NOT EXISTS final_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_boqs_final_share_token ON public.boqs(final_share_token) WHERE final_share_token IS NOT NULL;

-- Public select policy by share token (effectively unguessable uuid)
DROP POLICY IF EXISTS boqs_select_by_final_token ON public.boqs;
CREATE POLICY boqs_select_by_final_token ON public.boqs
  FOR SELECT TO anon, authenticated
  USING (final_share_token IS NOT NULL AND design_review_status = 'final_sent');

-- 2. Revisions table
CREATE TABLE IF NOT EXISTS public.boq_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id uuid NOT NULL REFERENCES public.boqs(id) ON DELETE CASCADE,
  revision_label text NOT NULL,
  revision_no integer NOT NULL,
  design_review_status text,
  reviewer_outcome text,
  round_no integer,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boq_revisions_boq ON public.boq_revisions(boq_id, revision_no DESC);

ALTER TABLE public.boq_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS boq_revisions_select_owner_or_admin ON public.boq_revisions;
CREATE POLICY boq_revisions_select_owner_or_admin ON public.boq_revisions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boqs b WHERE b.id = boq_revisions.boq_id AND (b.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS boq_revisions_insert_owner_or_admin ON public.boq_revisions;
CREATE POLICY boq_revisions_insert_owner_or_admin ON public.boq_revisions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.boqs b WHERE b.id = boq_revisions.boq_id AND (b.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS boq_revisions_select_by_final_token ON public.boq_revisions;
CREATE POLICY boq_revisions_select_by_final_token ON public.boq_revisions
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.boqs b WHERE b.id = boq_revisions.boq_id AND b.final_share_token IS NOT NULL AND b.design_review_status = 'final_sent'));

-- 3. Update submit RPC to use cleaner status values
CREATE OR REPLACE FUNCTION public.submit_design_review_with_token(_token uuid, _reviewer_email text, _items jsonb, _docs jsonb DEFAULT '[]'::jsonb, _reviewer_name text DEFAULT NULL::text, _reviewer_design_team text DEFAULT NULL::text, _reviewer_contact text DEFAULT NULL::text)
 RETURNS boq_design_reviews
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
       WHEN 'approved' THEN 'design_approved'
       WHEN 'changes_required' THEN 'changes_required'
       ELSE 'review_received' END,
         updated_at = now()
   WHERE id = _row.boq_id;

  RETURN _row;
END;
$function$;
