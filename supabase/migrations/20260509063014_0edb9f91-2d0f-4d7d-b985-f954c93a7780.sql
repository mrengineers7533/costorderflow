-- Create client_copies table to persist generated Client Copy PDFs against an OA.
CREATE TABLE public.client_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  user_id uuid,
  version_label text NOT NULL,
  format order_format NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  charges jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_copies_order_id ON public.client_copies(order_id);

ALTER TABLE public.client_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_copies_select_owned_or_admin"
  ON public.client_copies FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_copies_insert_own"
  ON public.client_copies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_copies_update_owned_or_admin"
  ON public.client_copies FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_copies_delete_owned_or_admin"
  ON public.client_copies FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Storage policies on the existing 'oa-documents' bucket so authenticated users
-- can upload/read their client copies under client-copies/{rootOrderId}/...
DO $$ BEGIN
  CREATE POLICY "oa_docs_authenticated_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'oa-documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "oa_docs_authenticated_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'oa-documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "oa_docs_authenticated_update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'oa-documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;