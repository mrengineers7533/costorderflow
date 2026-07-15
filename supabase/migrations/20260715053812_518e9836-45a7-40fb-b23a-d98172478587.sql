
-- 1. Add sender fields to email_notification_config
ALTER TABLE public.email_notification_config
  ADD COLUMN IF NOT EXISTS sender_email text NOT NULL DEFAULT 'pc.2@mrengineers.com',
  ADD COLUMN IF NOT EXISTS sender_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS sender_updated_by uuid;

-- 2. Add sender_email column to email_notification_log; allow null notification_id (for test emails)
ALTER TABLE public.email_notification_log
  ADD COLUMN IF NOT EXISTS sender_email text;

ALTER TABLE public.email_notification_log
  ALTER COLUMN notification_id DROP NOT NULL;

-- 3. Audit table for sender email changes
CREATE TABLE IF NOT EXISTS public.email_sender_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_sender text,
  new_sender text NOT NULL,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_sender_audit TO authenticated;
GRANT ALL ON public.email_sender_audit TO service_role;

ALTER TABLE public.email_sender_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read email_sender_audit" ON public.email_sender_audit;
CREATE POLICY "admins read email_sender_audit"
  ON public.email_sender_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Trigger: record sender email changes
CREATE OR REPLACE FUNCTION public.log_sender_email_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF NEW.sender_email IS DISTINCT FROM OLD.sender_email THEN
    BEGIN
      SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
    EXCEPTION WHEN OTHERS THEN v_email := NULL;
    END;
    INSERT INTO public.email_sender_audit (previous_sender, new_sender, changed_by, changed_by_email)
    VALUES (OLD.sender_email, NEW.sender_email, auth.uid(), v_email);
    NEW.sender_updated_at := now();
    NEW.sender_updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_sender_audit ON public.email_notification_config;
CREATE TRIGGER trg_email_sender_audit
  BEFORE UPDATE ON public.email_notification_config
  FOR EACH ROW
  EXECUTE FUNCTION public.log_sender_email_change();
