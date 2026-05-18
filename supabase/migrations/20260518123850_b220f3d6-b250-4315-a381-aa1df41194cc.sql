
-- 1. Drop public token-less SELECT policies on design review tables
DROP POLICY IF EXISTS bdr_select_by_token ON public.boq_design_reviews;
DROP POLICY IF EXISTS bdri_select_by_token ON public.boq_design_review_items;
DROP POLICY IF EXISTS bdrd_select_by_token ON public.boq_design_review_documents;

-- 2. Create SECURITY DEFINER RPCs that require the secret token
CREATE OR REPLACE FUNCTION public.get_design_review_by_token(_token uuid)
RETURNS public.boq_design_reviews
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.boq_design_reviews
  WHERE token = _token AND status = 'sent' AND expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_design_review_items_by_token(_token uuid)
RETURNS SETOF public.boq_design_review_items
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.* FROM public.boq_design_review_items i
  JOIN public.boq_design_reviews r ON r.id = i.review_id
  WHERE r.token = _token AND r.status = 'sent' AND r.expires_at > now();
$$;

CREATE OR REPLACE FUNCTION public.get_design_review_docs_by_token(_token uuid)
RETURNS SETOF public.boq_design_review_documents
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.* FROM public.boq_design_review_documents d
  JOIN public.boq_design_reviews r ON r.id = d.review_id
  WHERE r.token = _token AND r.status = 'sent' AND r.expires_at > now();
$$;

GRANT EXECUTE ON FUNCTION public.get_design_review_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_design_review_items_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_design_review_docs_by_token(uuid) TO anon, authenticated;

-- 3. Drop overly permissive oa-documents storage policies
DROP POLICY IF EXISTS oa_docs_authenticated_select ON storage.objects;
DROP POLICY IF EXISTS oa_docs_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS oa_docs_authenticated_update ON storage.objects;

-- 4. Drop unrestricted public INSERT on design-review-docs (keep reviewer/-prefixed policy)
DROP POLICY IF EXISTS design_review_docs_public_insert ON storage.objects;
