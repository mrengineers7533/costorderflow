ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS currency_mode text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric;

ALTER TABLE public.proforma_invoices
  ADD COLUMN IF NOT EXISTS currency_mode text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_currency_mode_chk CHECK (currency_mode IN ('INR','USD'));

ALTER TABLE public.proforma_invoices
  ADD CONSTRAINT pi_currency_mode_chk CHECK (currency_mode IN ('INR','USD'));