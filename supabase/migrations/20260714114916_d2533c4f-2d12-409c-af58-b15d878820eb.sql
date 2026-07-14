
DROP POLICY IF EXISTS domains_read_admin ON public.allowed_domains;
CREATE POLICY domains_read_admin ON public.allowed_domains
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "actor read own notification email logs" ON public.email_notification_log;
CREATE POLICY "actor read own notification email logs" ON public.email_notification_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_notifications n
    WHERE n.id = email_notification_log.notification_id AND n.actor_user_id = auth.uid()));

DROP POLICY IF EXISTS "admin read all email logs" ON public.email_notification_log;
CREATE POLICY "admin read all email logs" ON public.email_notification_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin manage email_notification_config" ON public.email_notification_config;
CREATE POLICY "admin manage email_notification_config" ON public.email_notification_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS po_counters_read_admin ON public.po_counters;
CREATE POLICY po_counters_read_admin ON public.po_counters
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
