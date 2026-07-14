DROP POLICY IF EXISTS "approval snapshots writable by approvers" ON public.boq_revision_approval_snapshots;
CREATE POLICY "approval snapshots writable by approvers"
ON public.boq_revision_approval_snapshots
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_module_access(auth.uid(), 'design')
  OR public.has_module_access(auth.uid(), 'costing')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_module_access(auth.uid(), 'design')
  OR public.has_module_access(auth.uid(), 'costing')
);