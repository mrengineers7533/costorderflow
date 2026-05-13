
-- Add design review status column to boqs (does NOT touch existing columns)
ALTER TABLE public.boqs
  ADD COLUMN IF NOT EXISTS design_review_status text NOT NULL DEFAULT 'draft';

-- ============ Tables ============
CREATE TABLE public.boq_design_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id uuid NOT NULL,
  user_id uuid,                                  -- BOQ owner, copied for RLS
  round_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'sent',           -- sent | submitted | expired | cancelled
  sent_by uuid,
  sent_by_email text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_message text,
  recipients text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  submitted_at timestamptz,
  submitted_by_email text,
  overall_outcome text,                          -- approved | changes_required | partial
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  boq_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bdr_boq ON public.boq_design_reviews(boq_id);
CREATE INDEX idx_bdr_token ON public.boq_design_reviews(token);

CREATE TABLE public.boq_design_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.boq_design_reviews(id) ON DELETE CASCADE,
  boq_item_id text NOT NULL,
  item_no text,
  model_number text,
  description text,
  decision text NOT NULL DEFAULT 'pending',      -- pending | approved | change_required
  comment text,
  design_change_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bdri_review ON public.boq_design_review_items(review_id);

CREATE TABLE public.boq_design_review_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.boq_design_reviews(id) ON DELETE CASCADE,
  boq_item_id text,
  source text NOT NULL,                          -- sender | reviewer
  file_name text NOT NULL,
  file_path text NOT NULL,
  uploaded_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bdrd_review ON public.boq_design_review_documents(review_id);

CREATE TABLE public.boq_design_review_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid REFERENCES public.boq_design_reviews(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  subject text,
  gmail_message_id text,
  status text NOT NULL,                          -- sent | failed
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bdr_updated BEFORE UPDATE ON public.boq_design_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RLS ============
ALTER TABLE public.boq_design_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boq_design_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boq_design_review_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boq_design_review_email_log ENABLE ROW LEVEL SECURITY;

-- Reviews: owners + admins full; anon SELECT when valid unexpired token
CREATE POLICY bdr_select_owned_or_admin ON public.boq_design_reviews
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY bdr_insert_own ON public.boq_design_reviews
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY bdr_update_owned_or_admin ON public.boq_design_reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY bdr_delete_owned_or_admin ON public.boq_design_reviews
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY bdr_select_by_token ON public.boq_design_reviews
  FOR SELECT TO anon, authenticated
  USING (status = 'sent' AND expires_at > now());

-- Items: owner via review; anon can read when parent review is token-readable
CREATE POLICY bdri_select_owned_or_admin ON public.boq_design_review_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boq_design_reviews r
                  WHERE r.id = review_id AND (r.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));
CREATE POLICY bdri_select_by_token ON public.boq_design_review_items
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.boq_design_reviews r
                  WHERE r.id = review_id AND r.status = 'sent' AND r.expires_at > now()));
CREATE POLICY bdri_write_owned_or_admin ON public.boq_design_review_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boq_design_reviews r
                  WHERE r.id = review_id AND (r.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.boq_design_reviews r
                       WHERE r.id = review_id AND (r.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

-- Documents: owner full; anon SELECT + INSERT via valid token
CREATE POLICY bdrd_select_owned_or_admin ON public.boq_design_review_documents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boq_design_reviews r
                  WHERE r.id = review_id AND (r.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));
CREATE POLICY bdrd_select_by_token ON public.boq_design_review_documents
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.boq_design_reviews r
                  WHERE r.id = review_id AND r.status = 'sent' AND r.expires_at > now()));
CREATE POLICY bdrd_insert_owned_or_admin ON public.boq_design_review_documents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.boq_design_reviews r
                       WHERE r.id = review_id AND (r.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));
CREATE POLICY bdrd_insert_by_token ON public.boq_design_review_documents
  FOR INSERT TO anon, authenticated
  WITH CHECK (source = 'reviewer' AND EXISTS (
      SELECT 1 FROM public.boq_design_reviews r
       WHERE r.id = review_id AND r.status = 'sent' AND r.expires_at > now()));

-- Email log: owner read, no client write (function uses service role)
CREATE POLICY bdrel_select_owned_or_admin ON public.boq_design_review_email_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.boq_design_reviews r
                  WHERE r.id = review_id AND (r.user_id = auth.uid() OR has_role(auth.uid(), 'admin'))));

-- ============ Storage bucket ============
INSERT INTO storage.buckets (id, name, public)
  VALUES ('design-review-docs', 'design-review-docs', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "design_review_docs_owner_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'design-review-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin')))
  WITH CHECK (bucket_id = 'design-review-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin')));

CREATE POLICY "design_review_docs_public_upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'design-review-docs' AND (storage.foldername(name))[1] = 'reviewer');

-- ============ Submit RPC ============
CREATE OR REPLACE FUNCTION public.submit_design_review_with_token(
  _token uuid,
  _reviewer_email text,
  _items jsonb,
  _docs jsonb DEFAULT '[]'::jsonb
) RETURNS public.boq_design_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.submit_design_review_with_token(uuid, text, jsonb, jsonb) TO anon, authenticated;
