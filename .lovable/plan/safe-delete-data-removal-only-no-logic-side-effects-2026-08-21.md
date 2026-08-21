# Safe Delete: data-removal only, no logic side-effects

Goal: make every Delete action in the app a pure data-removal operation — remove the selected record (plus records that belong exclusively to it), never touch business logic, formulas, numbering, approvals, snapshots or unrelated rows. No refactor of working features.

## What I checked

Existing delete paths: Orders, PI, BOQ, Requisition, Annexure, Purchase Order, Notifications (single + delete all), Cost Sheets, Raw Material master/maps, Vendor Item Master, BOQ item attachments, Design comments, Admin access rows. Requisition, Annexure and PO already have dedicated cascade helpers with PO-reference guards; the rest are direct table deletes relying on database cascade rules.

## Issues found (only these get fixed)

1. **PO delete leaves stale purchase state.** `deletePurchaseOrderCascade` clears `po_id` on the linked raw materials but leaves `po_status` as "created". After deleting a PO, the Annexure Folder "PO Created / Balance Pending" counts stay wrong and those items can never be re-POed. Fix: also reset `po_status` (and any PO-linked stamp on those rows) back to the pre-PO value — no change to how the counts are computed.

2. **Notification "Delete All" is global.** It deletes every row in `app_notifications` regardless of the module / department / date filters shown on screen. Fix: restrict the bulk delete to exactly the records currently in scope (the filtered list the user is looking at), by id. Notification creation, seen/ack, routing and count logic stay untouched — counts simply recompute from what remains.

3. **Raw Material map "wipe all"** deletes the whole `fg_raw_material_map` table. Keep the feature, but scope it to the current filter/upload selection and label the confirmation with the exact number of rows that will go.

4. **Order / PI / BOQ delete has no dependency check.** Deleting an OA silently cascades its BOQs (and their design comments, item status and approval snapshots) through database rules. Fix: before deleting, count dependents (BOQs, PIs, requisitions, POs) and either
   - show them in the confirmation dialog so the delete is explicit, or
   - block with a clear message when an active downstream document exists (approved BOQ, non-cancelled PO, PI already issued).
   No change to cascade rules themselves, no change to revision/approval logic.

## Shared approach

- Add one small helper module `src/lib/delete/guards.ts` that, given a record kind + id, returns its dependent counts and a block reason. Used only by the confirmation dialogs — it does not run any business logic.
- Every delete stays "selected record + rows that exist only for that record". No new cascades, no `neq(id, ...)` table wipes, no updates to master data, no rewriting of saved document snapshots (`line_items`, approval snapshots, PDFs).
- Numbering counters (`oa_counters`, `pi_counters`, `po_counters`, requisition counters) are never decremented or reset on delete.
- Access control unchanged, except existing RLS delete policies are verified to allow the delete the UI already offers (no widening of read/write access).

## Regression checks

- Run the full test suite (currently 138 tests) plus new focused tests:
  - deleting a PO restores the raw-material rows to "pending PO" and the Annexure Folder counts move by exactly that PO's item count;
  - filtered notification bulk delete removes only the filtered ids;
  - order/PI/BOQ delete guards return the right block reasons and delete nothing when blocked.
- Manual spot check in preview: OA totals, PI amounts, requisition/annexure/PO flow, approval badges and notification counts unchanged after each delete; refresh and re-login show the same state.

## Out of scope

No changes to calculations, tax/P&F/freight/discount/currency, approval or revision behaviour, notification generation, PDF/Excel output, or any module workflow.
