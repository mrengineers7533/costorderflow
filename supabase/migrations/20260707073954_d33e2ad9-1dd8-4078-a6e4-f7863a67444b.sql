DROP POLICY IF EXISTS "design users can insert comments" ON public.boq_design_comments;

CREATE POLICY "design users can insert comments"
ON public.boq_design_comments
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_module_access(auth.uid(), 'design'::text)
    AND has_doc_access(auth.uid(), 'boq'::doc_kind, boq_id, 'view'::access_perm)
  )
);