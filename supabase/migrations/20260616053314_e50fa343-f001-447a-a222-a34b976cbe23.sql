ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notification_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications;
ALTER TABLE public.app_notification_reads REPLICA IDENTITY FULL;
ALTER TABLE public.app_notifications REPLICA IDENTITY FULL;