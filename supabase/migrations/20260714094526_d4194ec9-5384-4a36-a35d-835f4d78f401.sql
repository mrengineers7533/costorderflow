
-- boq_item_attachments: module-based access
DROP POLICY IF EXISTS "View own attachments or admin" ON public.boq_item_attachments;
DROP POLICY IF EXISTS "Insert attachments on own boq or admin" ON public.boq_item_attachments;
DROP POLICY IF EXISTS "Delete own attachments or admin" ON public.boq_item_attachments;

CREATE POLICY "attachments_select_module"
  ON public.boq_item_attachments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_doc_access(auth.uid(), 'boq'::doc_kind, boq_id, 'view'::access_perm)
  );

CREATE POLICY "attachments_insert_module"
  ON public.boq_item_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.can_edit_doc(auth.uid(), 'boq', boq_id, 'costing')
    )
  );

CREATE POLICY "attachments_delete_module"
  ON public.boq_item_attachments FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR uploaded_by = auth.uid()
    OR public.can_edit_doc(auth.uid(), 'boq', boq_id, 'costing')
  );

-- boq_design_reviews: allow any BOQ viewer to SELECT
DROP POLICY IF EXISTS "bdr_select_owned_or_admin" ON public.boq_design_reviews;
CREATE POLICY "bdr_select_module"
  ON public.boq_design_reviews FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_doc_access(auth.uid(), 'boq'::doc_kind, boq_id, 'view'::access_perm)
  );

-- boq_design_review_items: mirror parent
DROP POLICY IF EXISTS "bdri_select_owned_or_admin" ON public.boq_design_review_items;
CREATE POLICY "bdri_select_module"
  ON public.boq_design_review_items FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.boq_design_reviews r
      WHERE r.id = boq_design_review_items.review_id
        AND public.has_doc_access(auth.uid(), 'boq'::doc_kind, r.boq_id, 'view'::access_perm)
    )
  );

-- boq_design_review_documents: mirror parent (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='boq_design_review_documents') THEN
    EXECUTE 'DROP POLICY IF EXISTS "bdrd_select_owned_or_admin" ON public.boq_design_review_documents';
    EXECUTE 'DROP POLICY IF EXISTS "bdrd_select_module" ON public.boq_design_review_documents';
    EXECUTE $p$
      CREATE POLICY "bdrd_select_module"
        ON public.boq_design_review_documents FOR SELECT TO authenticated
        USING (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (
            SELECT 1 FROM public.boq_design_reviews r
            WHERE r.id = boq_design_review_documents.review_id
              AND public.has_doc_access(auth.uid(), 'boq'::doc_kind, r.boq_id, 'view'::access_perm)
          )
        )
    $p$;
  END IF;
END $$;

-- boq_design_review_email_log: mirror parent (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='boq_design_review_email_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS "bdrel_select_owned_or_admin" ON public.boq_design_review_email_log';
    EXECUTE 'DROP POLICY IF EXISTS "bdrel_select_module" ON public.boq_design_review_email_log';
    EXECUTE $p$
      CREATE POLICY "bdrel_select_module"
        ON public.boq_design_review_email_log FOR SELECT TO authenticated
        USING (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (
            SELECT 1 FROM public.boq_design_reviews r
            WHERE r.id = boq_design_review_email_log.review_id
              AND public.has_doc_access(auth.uid(), 'boq'::doc_kind, r.boq_id, 'view'::access_perm)
          )
        )
    $p$;
  END IF;
END $$;

-- boq_design_comments: fix public role -> authenticated
DROP POLICY IF EXISTS "design users can insert comments" ON public.boq_design_comments;
CREATE POLICY "design users can insert comments"
  ON public.boq_design_comments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.has_module_access(auth.uid(), 'design') AND public.has_doc_access(auth.uid(), 'boq'::doc_kind, boq_id, 'view'::access_perm))
  );

-- boq_item_design_status: tighten UPDATE to design:edit
DROP POLICY IF EXISTS "design_status_update_module" ON public.boq_item_design_status;
CREATE POLICY "design_status_update_module"
  ON public.boq_item_design_status FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_perm(auth.uid(), 'design', 'edit'::access_perm)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_perm(auth.uid(), 'design', 'edit'::access_perm)
  );
