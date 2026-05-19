-- Restrict app_settings public SELECT to non-sensitive keys only.
-- The 'boq_verifier' key contains an internal staff email and must not be
-- readable by anonymous users.
DROP POLICY IF EXISTS app_settings_public_select ON public.app_settings;

CREATE POLICY app_settings_public_select_safe ON public.app_settings
  FOR SELECT
  TO anon, authenticated
  USING (key IN ('creator_credit'));

CREATE POLICY app_settings_authenticated_select ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);