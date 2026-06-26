CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _domain text;
  _allowed boolean;
BEGIN
  _domain := lower(split_part(NEW.email, '@', 2));
  IF _domain IS NULL OR _domain = '' THEN
    RAISE EXCEPTION 'Email domain is required' USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.allowed_domains WHERE lower(domain) = _domain)
    INTO _allowed;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'Email domain "%" is not permitted', _domain USING ERRCODE = '22023';
  END IF;

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