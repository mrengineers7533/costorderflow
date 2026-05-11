-- Permanently remove two user accounts and all related app data
DO $$
DECLARE
  uids uuid[];
BEGIN
  SELECT array_agg(id) INTO uids FROM auth.users
   WHERE lower(email) IN ('pc.1@mrengineers.com', 'it@mrengineers.com');

  IF uids IS NULL THEN
    RAISE NOTICE 'No matching users found';
    RETURN;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = ANY(uids);
  DELETE FROM public.profiles  WHERE id = ANY(uids);
  DELETE FROM auth.users       WHERE id = ANY(uids);
END $$;