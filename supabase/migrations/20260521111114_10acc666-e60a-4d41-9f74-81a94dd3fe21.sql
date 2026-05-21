
CREATE TABLE public.rm_master_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL,
  original_filename text NOT NULL,
  sheet_count int NOT NULL DEFAULT 0,
  fg_count int NOT NULL DEFAULT 0,
  row_count int NOT NULL DEFAULT 0,
  uploaded_by uuid,
  uploaded_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rm_master_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY rmu_select_auth ON public.rm_master_uploads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY rmu_admin_write ON public.rm_master_uploads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.requisition_raw_materials
  ADD COLUMN IF NOT EXISTS make text,
  ADD COLUMN IF NOT EXISTS size_model text;
