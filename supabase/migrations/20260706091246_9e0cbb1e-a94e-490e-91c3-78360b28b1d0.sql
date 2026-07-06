CREATE OR REPLACE FUNCTION public.has_doc_access(_user uuid, _kind doc_kind, _doc_id uuid, _need access_perm)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _creator uuid;
  _ok boolean;
BEGIN
  IF _user IS NULL OR _doc_id IS NULL THEN RETURN false; END IF;
  IF public.has_role(_user, 'admin') THEN RETURN true; END IF;

  -- Design team gets view access to every BOQ so they can review and comment.
  IF _kind = 'boq' AND _need = 'view'
     AND public.has_module_access(_user, 'design') THEN
    RETURN true;
  END IF;

  -- Creator always has edit
  CASE _kind
    WHEN 'order'          THEN SELECT user_id    INTO _creator FROM public.orders            WHERE id = _doc_id;
    WHEN 'boq'            THEN SELECT user_id    INTO _creator FROM public.boqs              WHERE id = _doc_id;
    WHEN 'pi'             THEN SELECT user_id    INTO _creator FROM public.proforma_invoices WHERE id = _doc_id;
    WHEN 'purchase_order' THEN SELECT created_by INTO _creator FROM public.purchase_orders   WHERE id = _doc_id;
    WHEN 'requisition'    THEN SELECT user_id    INTO _creator FROM public.requisitions      WHERE id = _doc_id;
  END CASE;

  IF _creator IS NOT NULL AND _creator = _user THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.document_access
     WHERE doc_kind = _kind AND doc_id = _doc_id AND user_id = _user
       AND (_need = 'view' OR permission = 'edit')
  ) INTO _ok;
  RETURN COALESCE(_ok, false);
END;
$function$;