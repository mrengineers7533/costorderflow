-- Replace the always-true insert policy on login_activity with a constrained one.
DROP POLICY IF EXISTS login_activity_insert_any ON public.login_activity;

CREATE POLICY "login_activity_insert_constrained"
ON public.login_activity
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status IN ('success', 'failed')
  AND char_length(email) BETWEEN 3 AND 320
  AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND (user_agent IS NULL OR char_length(user_agent) <= 500)
  AND (ip IS NULL OR char_length(ip) <= 64)
);