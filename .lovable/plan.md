## Problem

Saving a new OA fails with `infinite recursion detected in policy for relation "orders"`.

Root cause: the SELECT policy `orders_select_module_for_approved_boq` (added by the recent model-wise access migration) contains an `EXISTS (... FROM boqs b JOIN orders o2 ...)` subquery. When Postgres evaluates the policy for the `orders` table, the join back to `orders` re-triggers the same SELECT policies → infinite recursion. This fires on `INSERT ... RETURNING`, so the OA save bombs.

The other policies (`orders_select_doc_access`, insert/update/delete via `has_doc_access`) are fine — those helpers are `SECURITY DEFINER` and don't recurse.

## Fix

Single migration, scoped only to RLS — no app code, no workflow/calc/PDF changes.

1. Create a `SECURITY DEFINER` helper that encapsulates the cross-module visibility check so it bypasses RLS on `orders`/`boqs`:

   ```sql
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
   ```

2. Drop and recreate `orders_select_module_for_approved_boq` using the helper (no self-reference to `orders` in the policy expression):

   ```sql
   drop policy if exists orders_select_module_for_approved_boq on public.orders;
   create policy orders_select_module_for_approved_boq on public.orders
   for select to authenticated
   using (
     (has_module_perm(auth.uid(),'purchase','view')
      or has_module_perm(auth.uid(),'manufacturing','view')
      or has_module_perm(auth.uid(),'design','view'))
     and public.order_visible_via_approved_boq(id)
   );
   ```

That removes the recursion while preserving identical access semantics (Purchase/Manufacturing/Design users still see orders that have an approved + design-approved BOQ anywhere in the family; creators/admins/document-access users continue via the other policies).

## Out of scope

No changes to UI, save payload, calc, approvals, notifications, revisions, auto-BOQ, PDF, Purchase/Manufacturing, or any other policy.
