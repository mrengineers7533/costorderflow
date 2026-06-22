## Goal
Add delete capability (single + bulk) to **Annexure Folder**, **Requisitions List**, and **PO Folder**. No changes to existing rules, workflows, calculations, or other UI.

## Permissions & safety
- **Admin-only.** Match the existing pattern used for requisition delete (`isAdmin || owner`) but for bulk delete keep it **admin-only** to avoid accidents.
- **Single delete:** `AlertDialog` confirmation showing the record identifier.
- **Bulk delete:**
  - Two modes per page: **Delete Selected** (acts on row checkboxes) and **Delete All Filtered** (acts on the rows currently visible after filters).
  - Confirmation requires typing the literal word **`DELETE`** before the destructive button enables.
  - Shows count + list preview (first 5 IDs/numbers, "+N more").
- Buttons only render for admins. Existing Cancel actions stay as-is.

## 1. Annexure Folder (`src/pages/requisitions/AnnexureFolder.tsx`)
- Add row checkbox column + header "select all (filtered)" checkbox.
- Per-row **Delete** button (trash icon) next to Cancel/Recreate.
- Toolbar: **Delete Selected** (disabled when 0 selected) and **Delete All Filtered** (admin only) buttons.
- Delete helper (new `src/lib/requisition/annexureDelete.ts`):
  1. Delete `requisition_annexure_rows` where `annexure_id = ?`.
  2. Null out `annexure_status` + `annexure_id` on `requisition_raw_materials` matching the annexure (frees the RM for re-planning — same effect as Cancel's cleanup).
  3. Delete the `requisition_annexures` row.
  - Block delete if any active `purchase_orders` reference the annexure id (check `annexure_ids` array contains). Show toast listing blocking PO numbers; suggest cancelling/deleting those POs first.
- Bulk variants loop the same helper, surface a summary toast ("Deleted X, skipped Y blocked").

## 2. Requisitions List (`src/pages/requisitions/RequisitionsList.tsx`)
- Single delete + confirm already exist — leave untouched.
- Add **Delete Selected** button in the header strip near "Open Plan" (admin only, uses existing `selected` set).
- Add **Delete All Filtered** button (admin only).
- Both call existing `deleteRequisitionCascade` in sequence; show progress and a summary toast.
- Reuses the existing `RequisitionDeleteBlockedError` to skip + report active-PO references.

## 3. PO Folder (`src/pages/purchase/PoFolder.tsx`)
- Add row checkbox column + select-all.
- Per-row **Delete** button (admin only). Allowed for both active and cancelled POs (testing/mistakes).
- Toolbar: **Delete Selected** and **Delete All Filtered** (admin only).
- Delete helper (new `src/lib/purchase/poDelete.ts`):
  1. Delete from `purchase_order_rows` where `po_id = ?`.
  2. Delete from `purchase_order_sends` where `po_id = ?` (audit/log child).
  3. Delete from `purchase_order_audit` where `po_id = ?`.
  4. Null out `po_id` on `requisition_raw_materials` rows that point to this PO (only when PO is still active — this matches what cancel does so the RM is freed).
  5. Delete the `purchase_orders` row.
- All steps in one helper; bulk variants loop it.

## Confirmation dialog
A single shared component `src/components/common/ConfirmBulkDeleteDialog.tsx`:
- Title, description, count, preview list.
- Input that must equal `DELETE` to enable the red action button.
- Used by all three pages for bulk; single-row deletes keep the lightweight AlertDialog.

## What is NOT changing
- No schema migration, no RLS changes — existing RLS already permits owners/admins to delete these rows.
- No edits to PDF generation, PO numbering, requisition counters, cancel flows, calculations, validations, or notifications.
- Existing Cancel buttons and their behavior stay intact.
- No changes to permissions/module access wiring.

## Files touched
- New: `src/lib/requisition/annexureDelete.ts`
- New: `src/lib/purchase/poDelete.ts`
- New: `src/components/common/ConfirmBulkDeleteDialog.tsx`
- Edit: `src/pages/requisitions/AnnexureFolder.tsx`
- Edit: `src/pages/requisitions/RequisitionsList.tsx`
- Edit: `src/pages/purchase/PoFolder.tsx`
