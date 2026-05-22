
CREATE TABLE IF NOT EXISTS public.user_module_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid,
  PRIMARY KEY (user_id, module)
);

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY uma_select_own_or_admin ON public.user_module_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY uma_admin_insert ON public.user_module_access
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY uma_admin_update ON public.user_module_access
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY uma_admin_delete ON public.user_module_access
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_module_access(_user uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_module_access
        WHERE user_id = _user AND module = _module
      );
$$;

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

  IF lower(NEW.email) IN ('it@mrengineers.com', 'pc.2@mrengineers.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure pc.2 admin role if user already exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users
WHERE lower(email) IN ('it@mrengineers.com', 'pc.2@mrengineers.com')
ON CONFLICT DO NOTHING;

-- Seed module access for named users (if they exist)
INSERT INTO public.user_module_access (user_id, module)
SELECT id, 'purchase' FROM auth.users WHERE lower(email) = 'purchase1@mrengineers.com'
ON CONFLICT DO NOTHING;

INSERT INTO public.user_module_access (user_id, module)
SELECT id, 'manufacturing' FROM auth.users WHERE lower(email) = 'office.5@mrengineers.com'
ON CONFLICT DO NOTHING;
