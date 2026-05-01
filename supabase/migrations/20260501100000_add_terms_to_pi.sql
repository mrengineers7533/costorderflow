-- Add editable Terms & Conditions field to Proforma Invoices
ALTER TABLE public.proforma_invoices
  ADD COLUMN IF NOT EXISTS terms text;
