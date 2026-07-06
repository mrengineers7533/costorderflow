
CREATE OR REPLACE FUNCTION public.notif_module_to_perm_module(_notif_module text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(_notif_module,''))
    WHEN 'boq' THEN 'costing'
    WHEN 'oa' THEN 'costing'
    WHEN 'order' THEN 'costing'
    WHEN 'pi' THEN 'costing'
    WHEN 'design' THEN 'design'
    WHEN 'design_comment' THEN 'design'
    WHEN 'purchase' THEN 'purchase'
    WHEN 'grn' THEN 'grn'
    WHEN 'requisition' THEN 'requisitions'
    WHEN 'annexure' THEN 'annexures'
    WHEN 'manufacturing' THEN 'manufacturing'
    ELSE lower(coalesce(_notif_module,''))
  END;
$$;

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
         OR public.has_module_perm(
              _user_id,
              public.notif_module_to_perm_module(n.module),
              'view'::access_perm
            )
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
