
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS po_date date,
  ADD COLUMN IF NOT EXISTS due_on date;

UPDATE public.purchase_orders SET po_date = created_at::date WHERE po_date IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_po_number_key ON public.purchase_orders (po_number);

CREATE OR REPLACE FUNCTION public.peek_next_po_number(_fy text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _counter int;
  _max_existing int;
  _next int;
BEGIN
  SELECT COALESCE(last_number, 0) INTO _counter FROM public.po_counters WHERE financial_year = _fy;
  IF _counter IS NULL THEN _counter := 0; END IF;

  SELECT COALESCE(MAX((regexp_match(po_number, '/(\d+)$'))[1]::int), 0)
    INTO _max_existing
    FROM public.purchase_orders
   WHERE po_number LIKE 'PO/' || _fy || '/%';

  _next := GREATEST(_counter, _max_existing) + 1;
  RETURN 'PO/' || _fy || '/' || lpad(_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_po_counter(_fy text, _used_number int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.po_counters (financial_year, last_number)
  VALUES (_fy, _used_number)
  ON CONFLICT (financial_year)
  DO UPDATE SET last_number = GREATEST(po_counters.last_number, _used_number),
                updated_at = now();
END;
$$;
