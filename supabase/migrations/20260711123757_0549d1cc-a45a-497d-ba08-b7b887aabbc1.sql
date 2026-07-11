ALTER TABLE public.email_notification_config
  ADD COLUMN IF NOT EXISTS cron_secret text;

UPDATE public.email_notification_config
   SET cron_secret = encode(gen_random_bytes(32), 'hex')
 WHERE cron_secret IS NULL;

ALTER TABLE public.email_notification_config
  ALTER COLUMN cron_secret SET NOT NULL;

-- Trigger now passes the shared secret in an x-cron-secret header.
CREATE OR REPLACE FUNCTION public.notify_send_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT send_fn_url, cron_secret INTO v_url, v_secret
    FROM public.email_notification_config WHERE id=true;
  IF v_url IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM extensions.http_post(
      url := v_url,
      body := jsonb_build_object('notification_id', NEW.id, 'kind','initial'),
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret', coalesce(v_secret,'')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- Reschedule cron job with the secret header
DO $$
DECLARE v_url text; v_secret text;
BEGIN
  SELECT reminder_fn_url, cron_secret INTO v_url, v_secret
    FROM public.email_notification_config WHERE id=true;
  PERFORM cron.unschedule('notification-email-reminders')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='notification-email-reminders');
  PERFORM cron.schedule(
    'notification-email-reminders',
    '*/15 * * * *',
    format(
      $cron$SELECT extensions.http_post(url:=%L, body:='{}'::jsonb, headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L));$cron$,
      v_url, coalesce(v_secret,'')
    )
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;