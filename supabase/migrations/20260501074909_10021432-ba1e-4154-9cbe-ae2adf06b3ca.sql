-- ============ Proforma Invoice (PI) module ============

-- Counters per format/financial year (separate from oa_counters).
CREATE TABLE IF NOT EXISTS public.pi_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  format public.order_format NOT NULL,
  financial_year text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (format, financial_year)
);
ALTER TABLE public.pi_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pi_counters_no_access" ON public.pi_counters FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Atomic counter bump → returns next formatted PI number for the *base* (no revision suffix).
-- MR  → MRPI/{FY}/{NNN}            e.g. MRPI/2026-27/001
-- GMS → {YY-YY}/GMS/UGUR-{NNNN}    e.g. 25-26/GMS/UGUR-0022
CREATE OR REPLACE FUNCTION public.next_pi_number(_format public.order_format, _financial_year text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
  _formatted text;
  _short text;
BEGIN
  INSERT INTO public.pi_counters (format, financial_year, last_number)
  VALUES (_format, _financial_year, 1)
  ON CONFLICT (format, financial_year)
  DO UPDATE SET last_number = pi_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO _next;

  IF _format = 'MR' THEN
    _formatted := 'MRPI/' || _financial_year || '/' || LPAD(_next::text, 3, '0');
  ELSE
    -- GMS: short FY (e.g. 2025-26 → 25-26), zero-padded 4 digits
    _short := substring(_financial_year from 3 for 2) || substring(_financial_year from 5);
    _formatted := _short || '/GMS/UGUR-' || LPAD(_next::text, 4, '0');
  END IF;

  RETURN _formatted;
END;
$$;

-- Main PI table. One row per *revision* (originals + R1, R2…).
CREATE TABLE IF NOT EXISTS public.proforma_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  -- Numbering
  pi_number text NOT NULL,            -- e.g. MRPI/2026-27/001 or with /R1 suffix for revisions
  base_pi_number text NOT NULL,       -- always the original, no /Rn — used to group revisions
  revision integer NOT NULL DEFAULT 0,
  is_current boolean NOT NULL DEFAULT true,
  revised_from_id uuid,
  parent_pi_id uuid,                  -- root id of the family (id of revision 0)
  -- OA reference
  reference_oa_id uuid,
  reference_oa_number text,
  -- Snapshot of the OA at conversion time (independent of OA edits)
  format public.order_format NOT NULL,
  status public.order_status NOT NULL DEFAULT 'draft',
  pi_date date NOT NULL DEFAULT CURRENT_DATE,
  prepared_by text,
  company_name text,
  bill_to jsonb NOT NULL DEFAULT '{}'::jsonb,
  ship_to jsonb NOT NULL DEFAULT '{}'::jsonb,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  charges jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  amount_in_words text,
  notes text,
  -- PI-only adjustments
  one_time_discount_percent numeric(8,4) NOT NULL DEFAULT 0,
  advance_adjustment_percent numeric(8,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pi_base ON public.proforma_invoices (base_pi_number);
CREATE INDEX IF NOT EXISTS idx_pi_parent ON public.proforma_invoices (parent_pi_id);
CREATE INDEX IF NOT EXISTS idx_pi_oa ON public.proforma_invoices (reference_oa_id);

ALTER TABLE public.proforma_invoices ENABLE ROW LEVEL SECURITY;

-- Open RLS to match existing orders/boqs project conventions.
CREATE POLICY "pi_public_select" ON public.proforma_invoices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pi_public_insert" ON public.proforma_invoices FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "pi_public_update" ON public.proforma_invoices FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pi_public_delete" ON public.proforma_invoices FOR DELETE TO anon, authenticated USING (true);

-- updated_at trigger
CREATE TRIGGER trg_pi_updated_at
BEFORE UPDATE ON public.proforma_invoices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Keep only one is_current=true per family (parent_pi_id).
CREATE OR REPLACE FUNCTION public.pi_keep_single_current()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_current = TRUE AND NEW.parent_pi_id IS NOT NULL THEN
    UPDATE public.proforma_invoices
       SET is_current = FALSE
     WHERE parent_pi_id = NEW.parent_pi_id
       AND id <> NEW.id
       AND is_current = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pi_single_current
AFTER INSERT OR UPDATE OF is_current ON public.proforma_invoices
FOR EACH ROW EXECUTE FUNCTION public.pi_keep_single_current();

-- Documents (PDF copies, attachments later).
CREATE TABLE IF NOT EXISTS public.proforma_invoice_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id uuid NOT NULL,
  parent_pi_id uuid,                 -- family id, denormalized for folder grouping
  document_type text NOT NULL,       -- 'pdf' | 'attachment'
  file_name text NOT NULL,
  file_path text NOT NULL,           -- storage path inside pi-documents bucket
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pi_docs_pi ON public.proforma_invoice_documents (pi_id);
CREATE INDEX IF NOT EXISTS idx_pi_docs_family ON public.proforma_invoice_documents (parent_pi_id);
ALTER TABLE public.proforma_invoice_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pi_docs_public_select" ON public.proforma_invoice_documents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "pi_docs_public_insert" ON public.proforma_invoice_documents FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "pi_docs_public_update" ON public.proforma_invoice_documents FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pi_docs_public_delete" ON public.proforma_invoice_documents FOR DELETE TO anon, authenticated USING (true);

-- Storage bucket for generated PI PDFs and (later) attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('pi-documents', 'pi-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pi_docs_storage_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'pi-documents');
CREATE POLICY "pi_docs_storage_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'pi-documents');
CREATE POLICY "pi_docs_storage_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'pi-documents') WITH CHECK (bucket_id = 'pi-documents');
CREATE POLICY "pi_docs_storage_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'pi-documents');
