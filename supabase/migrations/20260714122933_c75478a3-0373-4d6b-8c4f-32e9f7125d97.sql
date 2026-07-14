CREATE OR REPLACE FUNCTION public.ensure_current_user_recipient()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _name text;
  _dept text;
  _existing text;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;

  SELECT department INTO _existing
    FROM public.notification_recipients
   WHERE user_id = _uid AND is_active = true
   LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  _name := split_part(COALESCE(_email,''), '@', 1);

  -- Derive department from module access; first match wins.
  SELECT CASE module
           WHEN 'design' THEN 'design'
           WHEN 'purchase' THEN 'purchase'
           WHEN 'grn' THEN 'purchase'
           WHEN 'requisitions' THEN 'production'
           WHEN 'annexures' THEN 'production'
           WHEN 'manufacturing' THEN 'production'
           WHEN 'costing' THEN 'costing'
           ELSE NULL
         END
    INTO _dept
    FROM public.user_module_access
   WHERE user_id = _uid
     AND module IN ('design','purchase','grn','requisitions','annexures','manufacturing','costing')
   ORDER BY CASE module
              WHEN 'design' THEN 1
              WHEN 'costing' THEN 2
              WHEN 'purchase' THEN 3
              WHEN 'grn' THEN 4
              WHEN 'requisitions' THEN 5
              WHEN 'annexures' THEN 6
              WHEN 'manufacturing' THEN 7
              ELSE 99
            END
   LIMIT 1;

  IF _dept IS NULL THEN _dept := 'Other'; END IF;

  -- Prefer linking an existing dept row that has no user yet (mirrors admin intent).
  UPDATE public.notification_recipients
     SET user_id = _uid, is_active = true, name = COALESCE(name, _name), email = COALESCE(email, _email)
   WHERE department = _dept AND user_id IS NULL
   RETURNING department INTO _existing;

  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  INSERT INTO public.notification_recipients (user_id, department, name, email, is_active)
  VALUES (_uid, _dept, _name, _email, true)
  ON CONFLICT DO NOTHING;

  RETURN _dept;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_current_user_recipient() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_current_user_recipient() TO authenticated, service_role;