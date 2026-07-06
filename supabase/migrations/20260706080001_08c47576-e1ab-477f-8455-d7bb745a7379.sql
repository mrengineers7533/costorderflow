
-- allowed_domains
DROP POLICY IF EXISTS domains_read_auth ON public.allowed_domains;
CREATE POLICY domains_read_admin ON public.allowed_domains FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- po_counters
DROP POLICY IF EXISTS "po_counters read" ON public.po_counters;
CREATE POLICY po_counters_read_admin ON public.po_counters FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- general_requisition_counters
DROP POLICY IF EXISTS "auth read general req counters" ON public.general_requisition_counters;
CREATE POLICY grc_read_admin ON public.general_requisition_counters FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- fg_raw_material_map
DROP POLICY IF EXISTS fgrmm_select_auth ON public.fg_raw_material_map;
CREATE POLICY fgrmm_select_scoped ON public.fg_raw_material_map FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_module_perm(auth.uid(), 'manufacturing', 'view'));

-- order_templates
DROP POLICY IF EXISTS templates_authenticated_select ON public.order_templates;
CREATE POLICY templates_select_scoped ON public.order_templates FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_module_perm(auth.uid(), 'costing', 'view'));

-- purchase_settings
DROP POLICY IF EXISTS psettings_select ON public.purchase_settings;
CREATE POLICY psettings_select_scoped ON public.purchase_settings FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_module_perm(auth.uid(), 'purchase', 'view'));

-- rm_master_uploads
DROP POLICY IF EXISTS rmu_select_auth ON public.rm_master_uploads;
CREATE POLICY rmu_select_scoped ON public.rm_master_uploads FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_module_perm(auth.uid(), 'raw_materials', 'view'));

-- Fix mutable search_path on notif_module_to_perm_module
ALTER FUNCTION public.notif_module_to_perm_module(text) SET search_path = public;
