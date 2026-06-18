create or replace function public.order_visible_via_approved_boq(_order_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.boqs b
    join public.orders o2 on o2.id = b.order_id
    join public.orders o1 on o1.id = _order_id
    where coalesce(o2.parent_order_id, o2.id) = coalesce(o1.parent_order_id, o1.id)
      and b.verification_status = 'approved'
      and b.design_review_status in ('design_approved','final_sent')
  );
$$;

drop policy if exists orders_select_module_for_approved_boq on public.orders;

create policy orders_select_module_for_approved_boq on public.orders
for select to authenticated
using (
  (has_module_perm(auth.uid(),'purchase','view')
   or has_module_perm(auth.uid(),'manufacturing','view')
   or has_module_perm(auth.uid(),'design','view'))
  and public.order_visible_via_approved_boq(id)
);