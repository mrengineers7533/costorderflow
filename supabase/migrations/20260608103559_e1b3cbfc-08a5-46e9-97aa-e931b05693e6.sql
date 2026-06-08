
-- Per-item BOQ attachments table
CREATE TABLE public.boq_item_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id uuid NOT NULL REFERENCES public.boqs(id) ON DELETE CASCADE,
  boq_item_id text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes integer,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_boq_item_attachments_boq_item ON public.boq_item_attachments(boq_id, boq_item_id);

GRANT SELECT, INSERT, DELETE ON public.boq_item_attachments TO authenticated;
GRANT ALL ON public.boq_item_attachments TO service_role;

ALTER TABLE public.boq_item_attachments ENABLE ROW LEVEL SECURITY;

-- Mirror BOQ access: owner or admin can manage; everyone signed-in can read
CREATE POLICY "View attachments for accessible BOQs"
  ON public.boq_item_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.boqs b WHERE b.id = boq_id)
  );

CREATE POLICY "Insert attachments by authenticated users"
  ON public.boq_item_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.boqs b WHERE b.id = boq_id)
  );

CREATE POLICY "Delete own attachments or admin"
  ON public.boq_item_attachments FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );

-- Public RPC: list creator attachments for an open design-review token
CREATE OR REPLACE FUNCTION public.get_boq_item_attachments_by_token(_token uuid)
RETURNS SETOF public.boq_item_attachments
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.*
  FROM public.boq_item_attachments a
  JOIN public.boq_design_reviews r ON r.boq_id = a.boq_id
  WHERE r.token = _token
    AND r.status = 'sent'
    AND r.expires_at > now();
$$;

-- Public RPC: short-lived signed URL for a creator attachment, gated by token
CREATE OR REPLACE FUNCTION public.sign_boq_item_doc_by_token(_token uuid, _path text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _ok boolean;
  _signed jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.boq_item_attachments a
    JOIN public.boq_design_reviews r ON r.boq_id = a.boq_id
    WHERE r.token = _token
      AND r.status = 'sent'
      AND r.expires_at > now()
      AND a.file_path = _path
  ) INTO _ok;

  IF NOT _ok THEN
    RAISE EXCEPTION 'Not authorized for this file';
  END IF;

  -- Use storage.sign helper if available; fall back to building via storage extension
  SELECT storage.create_signed_url('boq-item-docs', _path, 600) INTO _signed;
  RETURN _signed->>'signedURL';
EXCEPTION WHEN undefined_function THEN
  -- Older storage extensions expose a different API; return path so client handles via signed-url RPC failure
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_boq_item_attachments_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_boq_item_doc_by_token(uuid, text) TO anon, authenticated;

-- Storage RLS for boq-item-docs bucket: authenticated users can manage their uploads
CREATE POLICY "Auth read boq-item-docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'boq-item-docs');

CREATE POLICY "Auth upload boq-item-docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'boq-item-docs' AND owner = auth.uid());

CREATE POLICY "Auth delete own boq-item-docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'boq-item-docs' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));
