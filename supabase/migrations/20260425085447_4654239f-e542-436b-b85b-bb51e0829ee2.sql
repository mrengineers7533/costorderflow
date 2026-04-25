-- Lock down oa_counters from direct client access
CREATE POLICY "oa_counters_no_access" ON public.oa_counters
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Fix mutable search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;