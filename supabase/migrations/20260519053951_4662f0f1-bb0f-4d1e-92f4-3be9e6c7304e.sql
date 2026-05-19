-- Helpers to gate storage access by review token validity / ownership.
CREATE OR REPLACE FUNCTION public.is_open_design_review(_review_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boq_design_reviews
    WHERE id::text = _review_id
      AND status = 'sent'
      AND expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_design_review_owner(_review_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boq_design_reviews r
    WHERE r.id::text = _review_id
      AND (r.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_open_design_review(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_design_review_owner(text) TO authenticated;

-- Make the bucket private
UPDATE storage.buckets SET public = false WHERE id = 'design-review-docs';

-- Drop the unrestricted public policies
DROP POLICY IF EXISTS design_review_docs_public_read ON storage.objects;
DROP POLICY IF EXISTS design_review_docs_public_upload ON storage.objects;
DROP POLICY IF EXISTS design_review_docs_public_insert ON storage.objects;
DROP POLICY IF EXISTS design_review_docs_owner_all ON storage.objects;

-- Token-scoped read (anon reviewers + signed URLs while review is open)
CREATE POLICY design_review_docs_select_token ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'design-review-docs'
    AND public.is_open_design_review((storage.foldername(name))[1])
  );

-- Owner / admin read (always)
CREATE POLICY design_review_docs_select_owner ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'design-review-docs'
    AND public.is_design_review_owner((storage.foldername(name))[1])
  );

-- Token-scoped upload (anon reviewers can only upload into an open review's folder)
CREATE POLICY design_review_docs_insert_token ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'design-review-docs'
    AND public.is_open_design_review((storage.foldername(name))[1])
  );

-- Owner / admin full management of their own review files
CREATE POLICY design_review_docs_modify_owner ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'design-review-docs'
    AND public.is_design_review_owner((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'design-review-docs'
    AND public.is_design_review_owner((storage.foldername(name))[1])
  );