
-- 1. is_active flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Allow admins to read & update any profile (in addition to existing own-row policies)
DROP POLICY IF EXISTS profiles_admin_select ON public.profiles;
CREATE POLICY profiles_admin_select ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. allowed_domains
CREATE TABLE IF NOT EXISTS public.allowed_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text UNIQUE NOT NULL,
  is_protected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.allowed_domains ENABLE ROW LEVEL SECURITY;

INSERT INTO public.allowed_domains (domain, is_protected) VALUES
  ('mrengineers.com', true),
  ('gmsdelhi.com', false),
  ('fmec.in', false)
ON CONFLICT (domain) DO NOTHING;

DROP POLICY IF EXISTS domains_read_auth ON public.allowed_domains;
CREATE POLICY domains_read_auth ON public.allowed_domains
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS domains_admin_write ON public.allowed_domains;
CREATE POLICY domains_admin_write ON public.allowed_domains
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. login_activity
CREATE TABLE IF NOT EXISTS public.login_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','failed')),
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.login_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS login_activity_insert_any ON public.login_activity;
CREATE POLICY login_activity_insert_any ON public.login_activity
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS login_activity_admin_read ON public.login_activity;
CREATE POLICY login_activity_admin_read ON public.login_activity
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS login_activity_created_at_idx ON public.login_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS login_activity_status_idx ON public.login_activity(status);

-- 4. is_domain_allowed RPC (safe for anonymous callers)
CREATE OR REPLACE FUNCTION public.is_domain_allowed(_domain text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.allowed_domains WHERE lower(domain) = lower(_domain));
$$;
REVOKE ALL ON FUNCTION public.is_domain_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_domain_allowed(text) TO anon, authenticated;
