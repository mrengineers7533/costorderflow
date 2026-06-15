
CREATE POLICY "admins can delete notifications"
  ON public.app_notifications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete notification reads"
  ON public.app_notification_reads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
