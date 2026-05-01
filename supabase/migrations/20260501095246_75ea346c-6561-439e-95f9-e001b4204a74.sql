-- 1. Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Replace handle_new_user to capture email + assign admin to it@mrengineers.com
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  IF lower(NEW.email) = 'it@mrengineers.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill existing data
UPDATE public.profiles p
   SET email = u.email
  FROM auth.users u
 WHERE p.id = u.id AND p.email IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
  FROM auth.users u
 WHERE lower(u.email) = 'it@mrengineers.com'
   AND NOT EXISTS (
     SELECT 1 FROM public.user_roles r
      WHERE r.user_id = u.id AND r.role = 'admin'
   );

-- 4. App settings RLS — admins can write, anyone can read (already true)
DROP POLICY IF EXISTS app_settings_admin_insert ON public.app_settings;
DROP POLICY IF EXISTS app_settings_admin_update ON public.app_settings;

CREATE POLICY app_settings_admin_insert
  ON public.app_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY app_settings_admin_update
  ON public.app_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));