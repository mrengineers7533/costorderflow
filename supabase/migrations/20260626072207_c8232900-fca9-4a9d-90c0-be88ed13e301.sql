
DROP POLICY IF EXISTS "Design or admin can insert design status" ON public.boq_item_design_status;
DROP POLICY IF EXISTS "Design or admin can update design status" ON public.boq_item_design_status;
DROP POLICY IF EXISTS "Owners or admins can read design status" ON public.boq_item_design_status;

CREATE POLICY "design_status_select_module" ON public.boq_item_design_status
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_perm(auth.uid(), 'design', 'view')
    OR public.has_module_perm(auth.uid(), 'manufacturing', 'view')
    OR public.has_module_perm(auth.uid(), 'purchase', 'view')
    OR public.has_module_perm(auth.uid(), 'costing', 'view')
  );

CREATE POLICY "design_status_insert_module" ON public.boq_item_design_status
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_perm(auth.uid(), 'design', 'view')
  );

CREATE POLICY "design_status_update_module" ON public.boq_item_design_status
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_perm(auth.uid(), 'design', 'view')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_module_perm(auth.uid(), 'design', 'view')
  );
