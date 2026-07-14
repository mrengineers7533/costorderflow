DROP POLICY IF EXISTS app_settings_authenticated_select ON public.app_settings;
CREATE POLICY app_settings_admin_select ON public.app_settings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));