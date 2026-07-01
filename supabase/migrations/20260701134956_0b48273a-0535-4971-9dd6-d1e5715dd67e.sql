
ALTER TABLE public.grn_receipts
  ADD COLUMN IF NOT EXISTS invoice_path text,
  ADD COLUMN IF NOT EXISTS invoice_file_name text,
  ADD COLUMN IF NOT EXISTS invoice_mime text,
  ADD COLUMN IF NOT EXISTS invoice_size bigint,
  ADD COLUMN IF NOT EXISTS invoice_uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS invoice_uploaded_at timestamptz;

CREATE POLICY "grn invoices read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'grn-invoices');

CREATE POLICY "grn invoices insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'grn-invoices');

CREATE POLICY "grn invoices update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'grn-invoices')
  WITH CHECK (bucket_id = 'grn-invoices');

CREATE POLICY "grn invoices delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'grn-invoices');
