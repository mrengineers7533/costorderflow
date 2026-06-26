
-- Module-level visibility for BOQs, Orders, Requisitions, Purchase Orders.
-- Removes approval-status gate so module-assigned users see relevant records.

-- BOQs
DROP POLICY IF EXISTS boqs_select_module_approved ON public.boqs;
CREATE POLICY boqs_select_module_perm ON public.boqs
  FOR SELECT
  USING (
    public.has_module_perm(auth.uid(), 'design', 'view')
    OR public.has_module_perm(auth.uid(), 'manufacturing', 'view')
    OR public.has_module_perm(auth.uid(), 'purchase', 'view')
    OR public.has_module_perm(auth.uid(), 'costing', 'view')
  );

-- Orders
DROP POLICY IF EXISTS orders_select_module_for_approved_boq ON public.orders;
CREATE POLICY orders_select_module_perm ON public.orders
  FOR SELECT
  USING (
    public.has_module_perm(auth.uid(), 'design', 'view')
    OR public.has_module_perm(auth.uid(), 'manufacturing', 'view')
    OR public.has_module_perm(auth.uid(), 'purchase', 'view')
    OR public.has_module_perm(auth.uid(), 'costing', 'view')
  );

-- Requisitions
CREATE POLICY requisitions_select_module_perm ON public.requisitions
  FOR SELECT
  USING (
    public.has_module_perm(auth.uid(), 'requisitions', 'view')
    OR public.has_module_perm(auth.uid(), 'annexures', 'view')
    OR public.has_module_perm(auth.uid(), 'manufacturing', 'view')
    OR public.has_module_perm(auth.uid(), 'purchase', 'view')
  );

-- Purchase Orders
CREATE POLICY po_select_module_perm ON public.purchase_orders
  FOR SELECT
  USING (
    public.has_module_perm(auth.uid(), 'purchase', 'view')
    OR public.has_module_perm(auth.uid(), 'manufacturing', 'view')
  );
