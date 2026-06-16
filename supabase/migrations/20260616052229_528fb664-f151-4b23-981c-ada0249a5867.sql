
-- Fix 1: Restrict boq_item_design_status SELECT to owners/admins
DROP POLICY IF EXISTS "Authenticated can read design status" ON public.boq_item_design_status;

CREATE POLICY "Owners or admins can read design status"
ON public.boq_item_design_status
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.boqs b
    WHERE b.id = boq_item_design_status.boq_id
      AND b.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.notification_recipients nr
    WHERE nr.user_id = auth.uid()
      AND nr.is_active = true
      AND lower(nr.department) = 'design'
  )
);

-- Fix 2: Remove anonymous INSERT on login_activity and provide a
-- SECURITY DEFINER RPC for logging failed/successful attempts.
DROP POLICY IF EXISTS login_activity_insert_constrained ON public.login_activity;

CREATE POLICY login_activity_insert_authenticated
ON public.login_activity
FOR INSERT
TO authenticated
WITH CHECK (
  status = ANY (ARRAY['success','failed'])
  AND char_length(email) BETWEEN 3 AND 320
  AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND (user_agent IS NULL OR char_length(user_agent) <= 500)
  AND (ip IS NULL OR char_length(ip) <= 64)
);

CREATE OR REPLACE FUNCTION public.log_login_attempt(
  _email text,
  _status text,
  _user_agent text DEFAULT NULL,
  _user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status NOT IN ('success','failed') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF _email IS NULL OR char_length(_email) < 3 OR char_length(_email) > 320 THEN
    RAISE EXCEPTION 'invalid email';
  END IF;
  IF _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid email';
  END IF;

  INSERT INTO public.login_activity (email, status, user_agent, user_id)
  VALUES (
    lower(trim(_email)),
    _status,
    NULLIF(left(coalesce(_user_agent,''), 500), ''),
    _user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_login_attempt(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_login_attempt(text, text, text, uuid) TO anon, authenticated;
