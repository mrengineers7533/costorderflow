# Module-Level Access Fix

## Root cause

The `boqs` table currently has two SELECT policies (RLS is OR'd across policies):

1. `boqs_select_doc_access` — only rows the user has explicit per-document access to.
2. `boqs_select_module_approved` — only rows where `verification_status='approved' AND design_review_status IN ('design_approved','final_sent')`, gated on Design/Manufacturing/Purchase module perm.

`design@mrengineers.com` has **module perm = design** but no per-document grants, and the BOQs visible to admin (`MRBOQ/26-27/0007/R7`, `…/0006`) are in `draft` status. Neither policy matches, so the Design page shows zero rows. The same pattern blocks Orders (`orders_select_module_for_approved_boq` is also gated on approval).

This is exactly the "old document-level access filter" the user wants removed: module access should be sufficient to see that module's records.

## Fix (SQL migration only, no app/UI changes)

Replace the approval-gated module SELECT policies with module-perm SELECT policies that don't require approval status:

**`boqs`** — add policy so anyone with `design`, `manufacturing`, or `purchase` module view perm can SELECT all BOQs:
- Drop `boqs_select_module_approved`.
- Create `boqs_select_module_perm`: `USING (has_module_perm(auth.uid(),'design','view') OR has_module_perm(auth.uid(),'manufacturing','view') OR has_module_perm(auth.uid(),'purchase','view') OR has_module_perm(auth.uid(),'costing','view'))`.
- Keep `boqs_select_doc_access` as a fallback for users without module perm but with explicit grants.

**`orders`** — same pattern:
- Drop `orders_select_module_for_approved_boq`.
- Create `orders_select_module_perm` allowing the same module perms (costing/design/manufacturing/purchase) to SELECT all orders.

**`requisitions`** and **`purchase_orders`** — add equivalent module-perm SELECT policies:
- `requisitions_select_module_perm`: requires `requisitions` or `annexures` module perm.
- `po_select_module_perm`: requires `purchase` module perm.

Edit/Insert/Delete policies (`module_edit_gate_*`, `*_update_doc_access`, etc.) stay unchanged — write access still flows through existing module-edit and per-doc rules. Only SELECT visibility broadens to match module assignment.

## Behavior after fix

- Sidebar visibility (already module-perm via `useUserAccess`) is unchanged.
- A user assigned only `design` sees all BOQs in `/design` and the linked OAs in any deep-link, can comment/approve per existing Design rules.
- A user assigned only `manufacturing` sees BOQs in Manufacturing module; same for Purchase.
- Users with no module perm and only per-document grants continue to see only those documents.
- No change to calculations, numbering, workflow, notifications, UI, or any approval/edit logic.

## Verification

After migration:
1. Re-query `pg_policies` to confirm new policies exist.
2. Log in as `design@mrengineers.com` → `/design` shows both MR BOQs.
3. Log in as admin → list unchanged.
4. Run existing test suite (revision/notifications tests) to ensure no regressions.
