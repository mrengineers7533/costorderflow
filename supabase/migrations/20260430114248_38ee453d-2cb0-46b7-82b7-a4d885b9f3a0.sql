-- BOQ table linked to orders. Multiple BOQs allowed per order (versions).
CREATE TABLE public.boqs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID,
  boq_number TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  format public.order_format NOT NULL,
  status public.order_status NOT NULL DEFAULT 'draft',
  -- Editable header fields snapshotted from order at creation time
  prepared_by TEXT,
  boq_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_oa_number TEXT,
  project_number TEXT,
  client_name TEXT,
  -- Items: array of { item_no, model_number, description, quantity, unit, remarks }
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  terms TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_boqs_order_id ON public.boqs(order_id);
CREATE INDEX idx_boqs_created_at ON public.boqs(created_at DESC);

ALTER TABLE public.boqs ENABLE ROW LEVEL SECURITY;

-- Mirror the existing public-access policy style used by orders/cost_sheets
-- (the app currently runs without per-user auth; tighten later when auth gate is added).
CREATE POLICY "boqs_public_select" ON public.boqs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "boqs_public_insert" ON public.boqs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "boqs_public_update" ON public.boqs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "boqs_public_delete" ON public.boqs FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER set_boqs_updated_at
BEFORE UPDATE ON public.boqs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Separate storage buckets: OA folder (existing 'order-templates' is for templates only).
-- Create dedicated buckets for finalized OA and BOQ PDF artifacts so they live in separate folders.
INSERT INTO storage.buckets (id, name, public)
VALUES ('oa-documents', 'oa-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('boq-documents', 'boq-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Public-style policies on storage.objects for these two buckets (consistent with existing app posture).
CREATE POLICY "oa_docs_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'oa-documents');
CREATE POLICY "oa_docs_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'oa-documents');
CREATE POLICY "oa_docs_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'oa-documents');
CREATE POLICY "oa_docs_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'oa-documents');

CREATE POLICY "boq_docs_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'boq-documents');
CREATE POLICY "boq_docs_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'boq-documents');
CREATE POLICY "boq_docs_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'boq-documents');
CREATE POLICY "boq_docs_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'boq-documents');