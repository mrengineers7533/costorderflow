ALTER TABLE public.proforma_invoices
  ADD COLUMN IF NOT EXISTS discount_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0;