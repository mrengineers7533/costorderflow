
-- 1. Restrict anon callers of log_login_attempt to 'failed' status only
CREATE OR REPLACE FUNCTION public.log_login_attempt(_email text, _status text, _user_agent text DEFAULT NULL::text, _user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _status NOT IN ('success','failed') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF auth.uid() IS NULL AND _status = 'success' THEN
    RAISE EXCEPTION 'anonymous callers may only log failed attempts';
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
$function$;

-- 2. Restrict order_templates SELECT to authenticated only
DROP POLICY IF EXISTS templates_public_select ON public.order_templates;
CREATE POLICY templates_authenticated_select ON public.order_templates
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.order_templates FROM anon;

-- 3. Remove anon read access to boq-item-docs via open review.
-- Reviewers obtain files through sign_boq_item_doc_by_token RPC (SECURITY DEFINER, token-scoped).
DROP POLICY IF EXISTS "Anon read boq-item-docs via open review" ON storage.objects;
