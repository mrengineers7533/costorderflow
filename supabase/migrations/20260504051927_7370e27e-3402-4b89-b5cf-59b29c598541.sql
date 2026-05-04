
ALTER TABLE public.proforma_invoices
  ADD COLUMN IF NOT EXISTS advance_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS advance_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_charges numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apply_discount boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discount_label text;
