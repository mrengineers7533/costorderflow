
-- 1) boq_design_comments SELECT: scope to per-doc access on boq_id
DROP POLICY IF EXISTS "read comments if has boq/design/notifications access" ON public.boq_design_comments;
CREATE POLICY "read comments if has doc access"
  ON public.boq_design_comments
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_doc_access(auth.uid(), 'boq'::doc_kind, boq_id, 'view'::access_perm)
  );

-- 2) boq_item_design_status INSERT: require edit permission and authenticated role
DROP POLICY IF EXISTS "design_status_insert_module" ON public.boq_item_design_status;
CREATE POLICY "design_status_insert_module"
  ON public.boq_item_design_status
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_module_perm(auth.uid(), 'design'::text, 'edit'::access_perm)
  );

-- 3) boq_revision_approval_snapshots SELECT: scope to per-doc access on boq_id
DROP POLICY IF EXISTS "approval snapshots readable by linked users" ON public.boq_revision_approval_snapshots;
CREATE POLICY "approval snapshots readable by linked users"
  ON public.boq_revision_approval_snapshots
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_doc_access(auth.uid(), 'boq'::doc_kind, boq_id, 'view'::access_perm)
    OR EXISTS (
      SELECT 1 FROM public.boqs b
      LEFT JOIN public.orders o ON o.id = COALESCE(b.source_order_id, b.order_id)
      WHERE b.id = boq_revision_approval_snapshots.boq_id
        AND (b.user_id = auth.uid() OR o.user_id = auth.uid())
    )
  );

-- 4) Restrict public-role policies to authenticated role (best practice)
DROP POLICY IF EXISTS "psettings_select_scoped" ON public.purchase_settings;
CREATE POLICY "psettings_select_scoped" ON public.purchase_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_module_perm(auth.uid(), 'purchase'::text, 'view'::access_perm));

DROP POLICY IF EXISTS "templates_select_scoped" ON public.order_templates;
CREATE POLICY "templates_select_scoped" ON public.order_templates
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_module_perm(auth.uid(), 'costing'::text, 'view'::access_perm));

DROP POLICY IF EXISTS "fgrmm_select_scoped" ON public.fg_raw_material_map;
CREATE POLICY "fgrmm_select_scoped" ON public.fg_raw_material_map
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_module_perm(auth.uid(), 'manufacturing'::text, 'view'::access_perm));

DROP POLICY IF EXISTS "rmu_select_scoped" ON public.rm_master_uploads;
CREATE POLICY "rmu_select_scoped" ON public.rm_master_uploads
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_module_perm(auth.uid(), 'raw_materials'::text, 'view'::access_perm));

DROP POLICY IF EXISTS "grc_read_admin" ON public.general_requisition_counters;
CREATE POLICY "grc_read_admin" ON public.general_requisition_counters
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "design_status_update_module" ON public.boq_item_design_status;
CREATE POLICY "design_status_update_module" ON public.boq_item_design_status
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_module_perm(auth.uid(), 'design'::text, 'view'::access_perm))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_module_perm(auth.uid(), 'design'::text, 'view'::access_perm));
