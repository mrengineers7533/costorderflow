
-- Extensions for HTTP + cron
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Config table (single row) to hold the edge function URL
CREATE TABLE IF NOT EXISTS public.email_notification_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  send_fn_url text NOT NULL,
  reminder_fn_url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_notification_config TO authenticated;
GRANT ALL ON public.email_notification_config TO service_role;
ALTER TABLE public.email_notification_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage email_notification_config"
  ON public.email_notification_config FOR ALL
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.email_notification_config(id, send_fn_url, reminder_fn_url)
VALUES (
  true,
  'https://cpskacavawoupsisfwvz.supabase.co/functions/v1/send-notification-email',
  'https://cpskacavawoupsisfwvz.supabase.co/functions/v1/notification-email-reminders'
)
ON CONFLICT (id) DO NOTHING;

-- Log table
CREATE TABLE public.email_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.app_notifications(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_department text,
  recipient_user_id uuid,
  kind text NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial','reminder')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  email_from text,
  subject text,
  gmail_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, recipient_email, kind)
);
CREATE INDEX ON public.email_notification_log(notification_id);
CREATE INDEX ON public.email_notification_log(kind, status, created_at);

GRANT SELECT ON public.email_notification_log TO authenticated;
GRANT ALL ON public.email_notification_log TO service_role;
ALTER TABLE public.email_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read all email logs"
  ON public.email_notification_log FOR SELECT
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "actor read own notification email logs"
  ON public.email_notification_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.app_notifications n
    WHERE n.id = email_notification_log.notification_id
      AND n.actor_user_id = auth.uid()
  ));

-- Trigger: fire edge function on new notification
CREATE OR REPLACE FUNCTION public.notify_send_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
BEGIN
  SELECT send_fn_url INTO v_url FROM public.email_notification_config WHERE id=true;
  IF v_url IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM extensions.http_post(
      url := v_url,
      body := jsonb_build_object('notification_id', NEW.id, 'kind','initial'),
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never break the main workflow
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_notifications_email ON public.app_notifications;
CREATE TRIGGER trg_app_notifications_email
AFTER INSERT ON public.app_notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_send_notification_email();

-- Cron: reminders every 15 minutes
DO $$
DECLARE v_url text;
BEGIN
  SELECT reminder_fn_url INTO v_url FROM public.email_notification_config WHERE id=true;
  PERFORM cron.unschedule('notification-email-reminders')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='notification-email-reminders');
  PERFORM cron.schedule(
    'notification-email-reminders',
    '*/15 * * * *',
    format($cron$SELECT extensions.http_post(url:=%L, body:='{}'::jsonb, headers:='{"Content-Type":"application/json"}'::jsonb);$cron$, v_url)
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
