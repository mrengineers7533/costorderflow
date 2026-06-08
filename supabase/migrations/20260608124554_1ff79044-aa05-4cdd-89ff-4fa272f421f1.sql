CREATE OR REPLACE FUNCTION public.has_open_review_for_boq(_boq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boq_design_reviews
    WHERE boq_id = _boq_id
      AND status = 'sent'
      AND expires_at > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_open_review_for_boq(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Anon read boq-item-docs via open review" ON storage.objects;

CREATE POLICY "Anon read boq-item-docs via open review"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'boq-item-docs'
  AND public.has_open_review_for_boq((split_part(name, '/', 1))::uuid)
);