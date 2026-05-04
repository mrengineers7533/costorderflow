REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_oa_number(public.order_format, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_pi_number(public.order_format, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_oa_number(public.order_format, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_pi_number(public.order_format, text) TO authenticated;

DROP POLICY IF EXISTS "order_templates_public_read" ON storage.objects;
DROP POLICY IF EXISTS "order_templates_authenticated_read" ON storage.objects;
CREATE POLICY "order_templates_authenticated_read"
ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'order-templates');

DROP POLICY IF EXISTS credit_attempts_no_client_access ON public.credit_removal_attempts;
CREATE POLICY credit_attempts_no_client_access
ON public.credit_removal_attempts
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);