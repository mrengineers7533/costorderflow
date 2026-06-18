
## Problem

The recent per-document RLS migration replaced the old BOQ SELECT policy with `has_doc_access(auth.uid(), 'boq', id, 'view')`. That function only returns true for:

- Admin
- The BOQ creator
- Users explicitly listed in `document_access` for that BOQ

The Purchase and Manufacturing list pages (`ApprovedBoqModule`, `BoqFolder`, `DesignBoqList`, etc.) do `supabase.from("boqs").select("*")` and the same for `orders`. Non-admin Purchase/Manufacturing users are no longer in `document_access` for those BOQs (backfill only granted the creator), so the lists come back empty — even though the existing workflow has always shown approved BOQs to anyone with Purchase or Manufacturing module access.

The same hides parent `orders` rows that those pages need to resolve format / family / make.

## Fix (RLS only, no app/workflow changes)

Add **PERMISSIVE** SELECT policies on `boqs` and `orders` so a user can also view a row when both are true:

1. They have module access (`has_module_perm(uid, 'purchase'|'manufacturing'|'design', 'view')`), AND
2. The BOQ is approved & design-approved/final-sent (the same gate the lists already use), i.e. `verification_status = 'approved' AND design_review_status IN ('design_approved','final_sent')`.

For `orders`, mirror it: a user with `purchase`/`manufacturing`/`design` view access can SELECT an order if any BOQ in its family (`parent_order_id || id`) is approved + design-approved. This keeps the parent-OA lookup working without exposing unrelated orders.

This is **not** department-wide open access:
- Only approved + design-approved BOQs become visible (the rows already meant to flow downstream).
- Module access is still required — users without Purchase/Manufacturing/Design module permission see nothing extra.
- Edit/insert/update/delete on BOQs and Orders remain unchanged (per-document `has_doc_access ... 'edit'`).
- `document_access` table itself, creators, admins, and all other tables (PO, GRN, requisitions, PI) are untouched.

## Out of scope

No changes to: features, calculations, approval flow, notifications, acknowledgement, revised logic, auto-BOQ logic, PDF/print, data-saving, Purchase Order / GRN / Requisition / PI RLS, or any frontend code.

## Technical details

New policies (added; existing per-doc policies kept):

```sql
-- BOQs: module users can view approved + design-approved BOQs
CREATE POLICY boqs_select_module_approved ON public.boqs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    verification_status = 'approved'
    AND design_review_status IN ('design_approved','final_sent')
    AND (
      public.has_module_perm(auth.uid(), 'purchase',      'view')
      OR public.has_module_perm(auth.uid(), 'manufacturing','view')
      OR public.has_module_perm(auth.uid(), 'design',      'view')
    )
  );

-- Orders: same module users can view orders whose family has such a BOQ
CREATE POLICY orders_select_module_for_approved_boq ON public.orders
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      public.has_module_perm(auth.uid(), 'purchase',      'view')
      OR public.has_module_perm(auth.uid(), 'manufacturing','view')
      OR public.has_module_perm(auth.uid(), 'design',      'view')
    )
    AND EXISTS (
      SELECT 1 FROM public.boqs b
      JOIN public.orders o2 ON o2.id = b.order_id
      WHERE COALESCE(o2.parent_order_id, o2.id) = COALESCE(orders.parent_order_id, orders.id)
        AND b.verification_status = 'approved'
        AND b.design_review_status IN ('design_approved','final_sent')
    )
  );
```

Admin and creator paths continue to work via the existing `*_select_doc_access` policies (PERMISSIVE policies OR together).

## Risk

Low. Restores pre-change behavior for the Purchase/Manufacturing/Design lists. Users without any of those three module permissions see no extra rows. Edit permissions unchanged.
