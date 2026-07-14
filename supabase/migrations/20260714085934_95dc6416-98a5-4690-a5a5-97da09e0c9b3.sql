
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
CREATE POLICY orders_insert_own ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_edit_module(auth.uid(), 'costing')
  );

DROP POLICY IF EXISTS boqs_insert_own ON public.boqs;
CREATE POLICY boqs_insert_own ON public.boqs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_edit_module(auth.uid(), 'costing')
  );

DROP POLICY IF EXISTS pi_insert_own ON public.proforma_invoices;
CREATE POLICY pi_insert_own ON public.proforma_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_edit_module(auth.uid(), 'costing')
  );
