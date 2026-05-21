## Scope

Add delete + edit capabilities to **Raw Material Master** for admins. No schema changes — existing requisitions already store their own `requisition_items` + `requisition_raw_materials` snapshot rows, so deleting a mapping or upload record has zero impact on past requisitions.

## Changes — all confined to `src/pages/RawMaterialMaster.tsx`

### 1. Row-level actions column (FG mappings table)

Add a right-aligned **Actions** cell per row with three icon buttons:

- **View** — opens the existing detail Sheet (replaces the current row-click trigger).
- **Edit** — opens an editable Sheet (new mode of the existing Sheet) where admin can:
  - Toggle `is_direct_purchase`
  - Edit `notes`
  - Edit each raw-material row inline: `make`, `material`, `size_model`, `qty_per_unit`, `unit`
  - Add a new RM row, remove an RM row
  - Save → `update fg_raw_material_map set raw_materials, is_direct_purchase, notes, updated_at=now() where id=?`
- **Delete** — confirm dialog → `delete from fg_raw_material_map where id=?`, then refresh.

Non-admins see View only; Edit/Delete hidden.

### 2. Upload history with delete

Replace the single "Latest" info strip with a small **Upload history** card listing recent rows from `rm_master_uploads` (descending). Each row shows filename / date / uploader / counts and a **Delete** button (admin only) that removes the audit record (`delete from rm_master_uploads where id=?`). Deleting an upload record does **not** touch `fg_raw_material_map` — it only clears the history entry; a banner under the action button explains this.

### 3. Replace Excel button

Already exists ("Replace Excel" / "Upload Excel"). Leave behavior unchanged; reword the helper text to mention that replace upserts by Finish Good name and does not delete existing FG rows that aren't in the new file. Admin can use row-level Delete (or a future bulk action) for those.

### 4. Bulk wipe (optional, behind confirm)

Add a small **Delete all mappings** button next to Replace Excel (admin only, double-confirm dialog) that runs `delete from fg_raw_material_map`. Useful when a fully clean re-import is wanted. Existing requisitions still unaffected.

## Safety notes

- `requisition_raw_materials` and `requisition_items` are independent tables — they snapshot the FG/RM data at the time of requisition creation. No FK from those tables to `fg_raw_material_map`. Confirmed via existing schema.
- All write operations gated by `isAdmin` state and by the existing `fgrmm_admin_write` / `rmu_admin_write` RLS policies.
- Toast confirmations on every destructive action; AlertDialog (shadcn) for delete confirmations.

## Not changed

OA, BOQ, approvals, revisions, pricing, calculations, requisition creation flow, requisition list, PDF, share links, sidebar, edge functions.