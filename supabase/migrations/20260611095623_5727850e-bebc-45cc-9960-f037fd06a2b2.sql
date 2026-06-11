
ALTER TABLE public.requisitions ALTER COLUMN order_root_id DROP NOT NULL;
ALTER TABLE public.requisitions ALTER COLUMN boq_id DROP NOT NULL;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'project';
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.requisitions DROP CONSTRAINT IF EXISTS requisitions_kind_check;
ALTER TABLE public.requisitions ADD CONSTRAINT requisitions_kind_check CHECK (kind IN ('project','general'));

CREATE TABLE IF NOT EXISTS public.general_requisition_counters (
  financial_year text PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.general_requisition_counters TO authenticated;
GRANT ALL ON public.general_requisition_counters TO service_role;
ALTER TABLE public.general_requisition_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read general req counters" ON public.general_requisition_counters;
CREATE POLICY "auth read general req counters" ON public.general_requisition_counters
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.next_general_requisition_number(_fy text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _next int;
BEGIN
  INSERT INTO public.general_requisition_counters (financial_year, last_number)
  VALUES (_fy, 1)
  ON CONFLICT (financial_year)
  DO UPDATE SET last_number = general_requisition_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO _next;
  RETURN 'REQ/GEN/' || _fy || '/' || lpad(_next::text, 4, '0');
END;
$$;
