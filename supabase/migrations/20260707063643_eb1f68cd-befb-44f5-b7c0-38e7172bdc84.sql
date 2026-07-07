
-- Extend email_notification_log with audit fields
ALTER TABLE public.email_notification_log
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_page text,
  ADD COLUMN IF NOT EXISTS source_doc_no text,
  ADD COLUMN IF NOT EXISTS notification_type text,
  ADD COLUMN IF NOT EXISTS created_by_user text,
  ADD COLUMN IF NOT EXISTS created_by_department text,
  ADD COLUMN IF NOT EXISTS target_department text,
  ADD COLUMN IF NOT EXISTS cc_emails text[],
  ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seen_status boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS ack_status boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ack_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_enl_created_at ON public.email_notification_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enl_module ON public.email_notification_log(source_module);
CREATE INDEX IF NOT EXISTS idx_enl_status ON public.email_notification_log(status);
CREATE INDEX IF NOT EXISTS idx_enl_recipient_user ON public.email_notification_log(recipient_user_id);

-- Tighten RLS: recipient can read their own; admin reads all (existing admin policy remains)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='email_notification_log'
      AND policyname='enl_recipient_read'
  ) THEN
    CREATE POLICY enl_recipient_read ON public.email_notification_log
      FOR SELECT TO authenticated
      USING (
        recipient_user_id = auth.uid()
        OR lower(recipient_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
      );
  END IF;
END $$;

-- Sync seen/ack from app_notification_reads into email_notification_log
CREATE OR REPLACE FUNCTION public.sync_email_log_reads()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind = 'seen' THEN
    UPDATE public.email_notification_log
       SET seen_status = true, seen_at = COALESCE(seen_at, NEW.seen_at, now())
     WHERE notification_id = NEW.notification_id
       AND (recipient_user_id = NEW.user_id
            OR (NEW.department IS NOT NULL AND recipient_department = NEW.department));
  ELSIF NEW.kind = 'ack' THEN
    UPDATE public.email_notification_log
       SET ack_status = true, ack_at = COALESCE(ack_at, NEW.seen_at, now()),
           seen_status = true, seen_at = COALESCE(seen_at, NEW.seen_at, now())
     WHERE notification_id = NEW.notification_id
       AND (recipient_user_id = NEW.user_id
            OR (NEW.department IS NOT NULL AND recipient_department = NEW.department));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_email_log_reads ON public.app_notification_reads;
CREATE TRIGGER trg_sync_email_log_reads
AFTER INSERT ON public.app_notification_reads
FOR EACH ROW EXECUTE FUNCTION public.sync_email_log_reads();
