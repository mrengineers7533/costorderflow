
-- 1. Remove anonymous INSERT on boq_design_review_documents.
--    Inserts now flow exclusively through SECURITY DEFINER RPC
--    submit_design_review_with_token, which validates the token.
DROP POLICY IF EXISTS "bdrd_insert_by_token" ON public.boq_design_review_documents;

-- 2. Remove anonymous INSERT on storage bucket design-review-docs.
--    Anonymous reviewer uploads now go through edge function
--    design-review-upload-url which validates the token and returns
--    a short-lived signed upload URL.
DROP POLICY IF EXISTS "design_review_docs_insert_token" ON storage.objects;
DROP POLICY IF EXISTS "design_review_docs_select_token" ON storage.objects;
