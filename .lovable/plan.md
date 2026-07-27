## Goal
On the Requisition detail page (Generated tab raw-material table), replace the free-text **Category** cell with a dropdown limited to exactly: 3P, 3P Iron, Pipe, Sheets, Structure, GMS, 3P Machine, Sheets MS, Sheets SS, GI Pipe, GI Sheets.

## Verified current state
- `src/pages/requisitions/RequisitionDetail.tsx` (line ~607) renders Category as a `TextCell` bound to `r.material_category`, saving `material_category` plus `material_category_source: "manual"`, with a small `(rule)` / `(master)` source hint next to it.
- The same 11 options already exist as `RAW_MATERIAL_TYPES` in `src/lib/requisition/rawMaterialType.ts`, used by the adjacent Raw Material Type dropdown.
- Auto-classification (`src/lib/requisition/materialCategory.ts`, rules table) writes values like "MS Sheet" that are not in this list.

## Change (frontend only)
- Swap the Category `TextCell` for a `Select` using the shared 11-option list, bound to `r.material_category`, saving through the existing `updateRm(r.id, { material_category, material_category_source: "manual" })` — same write path, same per-row behaviour.
- Keep the `(rule)` / `(master)` / `(manual)` source hint exactly as today.
- Legacy/auto values not in the list (e.g. "MS Sheet") are still shown as the selected value so no existing data is hidden or silently cleared; picking a new option overwrites it with one of the 11.
- Blank rows show a "Select category" placeholder.

## Not changed
Status / Raw Material Type columns, auto-classification rules and edge-function logic, other editable cells, PDF exports, Annexure/Purchase/PO/GRN carry-forward, database schema.
