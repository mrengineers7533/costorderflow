
CREATE OR REPLACE FUNCTION public.can_ack_notification(_notif_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.app_notifications n
     WHERE n.id = _notif_id
       AND n.actor_user_id IS DISTINCT FROM _user_id
       AND (
         public.has_role(_user_id, 'admin'::app_role)
         OR public.has_module_perm(_user_id, n.module, 'view'::access_perm)
         OR EXISTS (
           SELECT 1
             FROM public.notification_recipients nr
            WHERE nr.user_id = _user_id
              AND nr.is_active = true
              AND EXISTS (
                SELECT 1
                  FROM unnest(n.target_departments) t
                 WHERE lower(regexp_replace(regexp_replace(coalesce(t,''), '\s+team$', '', 'i'), '\s+', ' ', 'g')) =
                       lower(regexp_replace(regexp_replace(coalesce(nr.department,''), '\s+team$', '', 'i'), '\s+', ' ', 'g'))
              )
         )
       )
  );
$function$;
