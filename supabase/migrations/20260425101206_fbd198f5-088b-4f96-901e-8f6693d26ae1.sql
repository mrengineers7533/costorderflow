-- Cost sheets table
CREATE TABLE public.cost_sheets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  file_path text NOT NULL,
  original_filename text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | parsed | failed
  parse_error text,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_sheets_select_own" ON public.cost_sheets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "cost_sheets_insert_own" ON public.cost_sheets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cost_sheets_update_own" ON public.cost_sheets FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "cost_sheets_delete_own" ON public.cost_sheets FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_cost_sheets_updated_at
  BEFORE UPDATE ON public.cost_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_cost_sheets_user ON public.cost_sheets(user_id, created_at DESC);

-- Private storage bucket (per-user folders)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cost-sheets', 'cost-sheets', false)
ON CONFLICT (id) DO NOTHING;

-- Per-user storage policies (path must start with the user's UUID)
CREATE POLICY "cost_sheets_user_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'cost-sheets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cost_sheets_user_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'cost-sheets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cost_sheets_user_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'cost-sheets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cost_sheets_user_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'cost-sheets' AND auth.uid()::text = (storage.foldername(name))[1]);