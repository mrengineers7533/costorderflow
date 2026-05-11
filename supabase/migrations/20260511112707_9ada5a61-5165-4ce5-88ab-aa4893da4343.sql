-- Recreate it@mrengineers.com as a confirmed auth user.
-- The on_auth_user_created trigger (handle_new_user) will create
-- the profile row and assign the 'admin' role automatically.
DO $$
DECLARE
  _uid uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'it@mrengineers.com') THEN
    RAISE NOTICE 'User already exists, skipping';
    RETURN;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    _uid,
    'authenticated',
    'authenticated',
    'it@mrengineers.com',
    crypt('Admin@12345', gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('full_name','IT Admin'),
    now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    _uid,
    jsonb_build_object('sub', _uid::text, 'email', 'it@mrengineers.com', 'email_verified', true),
    'email',
    _uid::text,
    now(), now(), now()
  );
END $$;