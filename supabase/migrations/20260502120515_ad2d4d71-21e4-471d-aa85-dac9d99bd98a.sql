-- Lock down order_templates: drop overly permissive public write/delete policies.
-- Keep public SELECT (templates are needed by the open app) but restrict writes to admins only.
DROP POLICY IF EXISTS "templates_public_update" ON public.order_templates;
DROP POLICY IF EXISTS "templates_public_delete" ON public.order_templates;
DROP POLICY IF EXISTS "templates_public_insert" ON public.order_templates;

CREATE POLICY "templates_admin_insert" ON public.order_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "templates_admin_update" ON public.order_templates
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "templates_admin_delete" ON public.order_templates
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));