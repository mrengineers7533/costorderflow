
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_public_select"
  ON public.app_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- No insert/update/delete policies → only service role can write.

INSERT INTO public.app_settings (key, value)
VALUES ('creator_credit', '{"visible": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.credit_removal_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL,
  action text,
  user_identifier text
);

ALTER TABLE public.credit_removal_attempts ENABLE ROW LEVEL SECURITY;

-- No policies at all → only service role can read/write.
