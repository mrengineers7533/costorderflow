ALTER TABLE public.vendor_item_prices
  ADD COLUMN IF NOT EXISTS import_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS import_issues text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_row jsonb,
  ADD COLUMN IF NOT EXISTS source_row_no integer,
  ADD COLUMN IF NOT EXISTS source_file text;

ALTER TABLE public.vendor_item_prices ALTER COLUMN material DROP NOT NULL;
ALTER TABLE public.vendor_item_prices ALTER COLUMN vendor_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS vendor_item_prices_import_status_idx ON public.vendor_item_prices (import_status);