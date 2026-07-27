## Goal
On the Requisition detail page ("Generated requisition" table), every Raw Material row becomes independently editable — including its own Lot. Finished Good Name, Qty and Make stay read-only.

## Current state (verified)
- `src/pages/requisitions/RequisitionDetail.tsx` renders the Generated table. The **Lot** cell is rendered once per Finished Good group with `rowSpan` and saves to `requisition_items.lot_no` — so all RM rows under one FG share one Lot. That is the reported bug.
- Only **Status** is editable per RM row today (`updateRm`). Raw Material, Size, RM Qty, Weight, Category, RM Make, UOM, Price, Vendor are plain read-only text.
- `requisition_raw_materials` already has the needed per-row columns: `material`, `size_model`, `required_qty`, `rm_weight`, `material_category`, `make`, `unit`, `rm_price`, `vendor_name`, `lot_no`, `purchase_status`. No migration needed.
- Downstream (`RequisitionPlan.tsx`, `annexurePipeline.ts`, Annexure/PO) already consolidates on **`requisition_raw_materials.lot_no`**, not the FG-level lot — so moving the Lot editor to the row level makes the detail page consistent with what Purchase already consumes; carry-forward works with no downstream changes.

## Changes (single file: `src/pages/requisitions/RequisitionDetail.tsx`)
1. **Per-row Lot**: remove the `rowSpan` FG-level Lot cell; render one Lot input in each RM row bound to `r.lot_no`, saved on blur via the existing `updateRm(r.id, { lot_no })`. Blank allowed (saved as `null`); older rows with no lot render an empty input.
2. **Editable RM cells**: convert the remaining columns to inline editors, each saving only its own row through `updateRm`:
   - Text inputs: Raw Material (`material`), Size (`size_model`), RM Make (`make`), Vendor (`vendor_name`)
   - Numeric inputs: RM Qty (`required_qty`), Weight (`rm_weight`), Price (`rm_price`) — reuse existing numeric parsing/decimal rules, no new negative-value rules
   - Category (`material_category`) and UOM (`unit`): editable using the options already used elsewhere in the app, free-text fallback when no option matches
   - Status: unchanged (already editable)
   - Save on blur (and on select change), skipping the write when the value is unchanged, matching the current pattern so no scroll/render churn is introduced.
3. **Row-level validation**: invalid numeric entry shows an inline message on that row and reverts that cell only; other rows untouched.
4. **Read-only FG columns**: Finished Good name/description, Make and Qty keep their existing `rowSpan` cells and existing source logic (BOQ/OA resolver) — unchanged.
5. **PDF**: `buildGeneratedRows()` currently reads `lot: it?.lot_no`; switch it to the row's own `r.lot_no` so the generated PDF shows the same per-row lot. Falls back to the FG lot when the row lot is blank, so existing records print as before.

## Price / Vendor default priority
Keep the existing behaviour of only writing what the user types. Display priority stays: saved row value → existing linked value → master default → blank. Manual edits are written only to that `requisition_raw_materials` row and never back to Raw Material Master, and a non-empty saved value is never overwritten by a master default on reload.

## Not changed
No migration, no RLS/permission change, no changes to requisition creation, Create Requisition dialog, BOM scaling, annexure/purchase/PO logic, numbering, approvals, notifications, totals/tax math, or any other page.
