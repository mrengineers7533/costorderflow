-- Templates table: stores one record per format (MR / GMS) globally
CREATE TABLE public.order_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  format public.order_format NOT NULL UNIQUE,
  file_path text NOT NULL,
  page_count integer NOT NULL DEFAULT 1,
  field_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_templates ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read templates (needed to render their orders)
CREATE POLICY "templates_select_authenticated"
  ON public.order_templates FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "templates_admin_insert"
  ON public.order_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "templates_admin_update"
  ON public.order_templates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "templates_admin_delete"
  ON public.order_templates FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_order_templates_updated_at
  BEFORE UPDATE ON public.order_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for template PDFs (public read so frontend can fetch with pdf-lib)
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-templates', 'order-templates', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read template files
CREATE POLICY "order_templates_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'order-templates');

-- Only admins can upload / update / delete
CREATE POLICY "order_templates_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'order-templates' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "order_templates_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'order-templates' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "order_templates_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'order-templates' AND public.has_role(auth.uid(), 'admin'));