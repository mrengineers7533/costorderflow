## Delete Requisition — Requisitions Page

Add a Delete action to each requisition row on `/requisitions` (and a matching button on the requisition detail page). No other existing behavior changes.

### User flow
1. On the requisitions table, a new red trash-icon button appears at the end of the Actions cell (after View / Download / Copy link / Send to Purchase).
2. Clicking it opens a confirm dialog (`AlertDialog`) showing the requisition number and a warning that the requisition and all its items, raw-material rows, annexures, and the uploaded source file (if any) will be permanently removed.
3. On confirm:
   - If the requisition is referenced by any **non-cancelled** purchase order row, the delete is blocked with a toast explaining which PO(s) reference it. The user must cancel those POs first. (Protects existing PO workflow.)
   - Otherwise the requisition is deleted (see Technical scope) and the list refreshes.
4. Same Delete button is added on `RequisitionDetail.tsx` header; after success it toasts and navigates back to `/requisitions`.

### Visibility / permissions
- Button shown to the requisition owner and to admins only (mirrors existing `requisitions_delete_owned_or_admin` RLS policy). Non-owners see no button.
- No schema changes, no RLS changes, no counter rollback (requisition numbers stay monotonic — same as how OA/BOQ/PI handle deletions today).

### Technical scope (client-side only)

In `src/pages/requisitions/RequisitionsList.tsx`:
- Import `Trash2` from lucide, `AlertDialog*` from `@/components/ui/alert-dialog`.
- Add `deleteId` state + `confirmingId` state. Render `<AlertDialog>` once at the bottom.
- New `deleteRequisition(r)` async handler performing, in order:
  1. `select id, po_number, status from purchase_order_rows pr join purchase_orders po on po.id=pr.po_id where pr.requisition_id = r.id and po.status <> 'cancelled'` — if any rows, toast error and abort.
  2. `delete from requisition_distribution_log where requisition_id = r.id`.
  3. `delete from requisition_raw_materials where requisition_id = r.id` (also cascades any leftover annexure_id SET NULL).
  4. `delete from requisition_annexures where requisition_id = r.id` (cascades `requisition_annexure_rows`).
  5. `delete from purchase_order_rows where requisition_id = r.id` (only cancelled-PO rows remain at this point).
  6. If `r.upload_file_path`, `storage.from('requisition-uploads').remove([r.upload_file_path])` (best-effort, ignore not-found).
  7. `delete from requisitions where id = r.id` (cascades `requisition_items` and `requisition_lots`).
  8. On success: toast, remove from `rows` state, clear selection.
- Owner/admin visibility: reuse the existing user id + `useUserRole` hook already imported (or fetch `auth.uid()` once on mount).

In `src/pages/requisitions/RequisitionDetail.tsx`:
- Add the same Delete button in the header card, sharing a small helper or duplicating the same delete routine; on success `navigate('/requisitions')`.

### Out of scope / unchanged
- No DB migration, no edge function, no RLS changes.
- Requisition counter (`next_requisition_number`) is not rewound.
- `CreateRequisitionDialog`, `create-requisition` edge function, Annexure / Plan / PO flows, BOQ/OA logic, manufacturing — untouched.
- Existing columns, filters, badges, status, View/Download/Copy/Send actions — untouched.

### Files to change
- `src/pages/requisitions/RequisitionsList.tsx` — add Delete button, confirm dialog, delete handler.
- `src/pages/requisitions/RequisitionDetail.tsx` — add Delete button in header, same handler.
