
-- 1) Extend has_doc_access to honor module-level view/edit permissions
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

  -- Module-level access: view perm sees all, edit perm can modify all
  IF _need = 'view' THEN
    CASE _kind
      WHEN 'order' THEN
        IF public.has_module_access(_user, 'costing')
           OR public.has_module_access(_user, 'manufacturing') THEN RETURN true; END IF;
      WHEN 'boq' THEN
        IF public.has_module_access(_user, 'costing')
           OR public.has_module_access(_user, 'design')
           OR public.has_module_access(_user, 'manufacturing') THEN RETURN true; END IF;
      WHEN 'pi' THEN
        IF public.has_module_access(_user, 'costing') THEN RETURN true; END IF;
      WHEN 'purchase_order' THEN
        IF public.has_module_access(_user, 'purchase') THEN RETURN true; END IF;
      WHEN 'requisition' THEN
        IF public.has_module_access(_user, 'requisitions')
           OR public.has_module_access(_user, 'manufacturing')
           OR public.has_module_access(_user, 'annexures') THEN RETURN true; END IF;
      ELSE NULL;
    END CASE;
  ELSE  -- edit
    CASE _kind
      WHEN 'order' THEN
        IF public.can_edit_module(_user, 'costing') THEN RETURN true; END IF;
      WHEN 'boq' THEN
        IF public.can_edit_module(_user, 'costing')
           OR public.can_edit_module(_user, 'design') THEN RETURN true; END IF;
      WHEN 'pi' THEN
        IF public.can_edit_module(_user, 'costing') THEN RETURN true; END IF;
      WHEN 'purchase_order' THEN
        IF public.can_edit_module(_user, 'purchase') THEN RETURN true; END IF;
      WHEN 'requisition' THEN
        IF public.can_edit_module(_user, 'requisitions') THEN RETURN true; END IF;
      ELSE NULL;
    END CASE;
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

-- 2) requisition_annexures: widen SELECT to include annexures/requisitions module view
DROP POLICY IF EXISTS annexures_select_owned_or_admin ON public.requisition_annexures;
CREATE POLICY annexures_select_scoped ON public.requisition_annexures
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR public.has_module_access(auth.uid(), 'annexures')
  OR public.has_module_access(auth.uid(), 'requisitions')
  OR public.has_module_access(auth.uid(), 'purchase')
);

DROP POLICY IF EXISTS annexure_rows_select_owned_or_admin ON public.requisition_annexure_rows;
CREATE POLICY annexure_rows_select_scoped ON public.requisition_annexure_rows
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR public.has_module_access(auth.uid(), 'annexures')
  OR public.has_module_access(auth.uid(), 'requisitions')
  OR public.has_module_access(auth.uid(), 'purchase')
  OR EXISTS (
    SELECT 1 FROM public.requisition_annexures a
    WHERE a.id = requisition_annexure_rows.annexure_id
      AND a.created_by = auth.uid()
  )
);

-- 3) cost_sheets: widen SELECT to include cost_sheets module view
DROP POLICY IF EXISTS cost_sheets_select_owned_or_admin ON public.cost_sheets;
CREATE POLICY cost_sheets_select_scoped ON public.cost_sheets
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = user_id
  OR public.has_module_access(auth.uid(), 'cost_sheets')
  OR public.has_module_access(auth.uid(), 'costing')
);
