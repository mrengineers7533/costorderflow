ALTER POLICY module_edit_gate_ins ON public.cost_sheets
  WITH CHECK (public.can_edit_module(auth.uid(), 'cost_sheets') OR public.can_edit_module(auth.uid(), 'costing'));

ALTER POLICY module_edit_gate_upd ON public.cost_sheets
  USING (public.can_edit_module(auth.uid(), 'cost_sheets') OR public.can_edit_module(auth.uid(), 'costing'))
  WITH CHECK (public.can_edit_module(auth.uid(), 'cost_sheets') OR public.can_edit_module(auth.uid(), 'costing'));

ALTER POLICY module_edit_gate_del ON public.cost_sheets
  USING (public.can_edit_module(auth.uid(), 'cost_sheets') OR public.can_edit_module(auth.uid(), 'costing'));