## Goal
Replace the row-level **Status** column in the Requisition raw-material tables with a new editable **Raw Material Type** dropdown, and carry that value forward to Annexure, Purchase, PO and GRN views. No document/workflow status is touched.

## Verified current state
- `src/pages/requisitions/RequisitionDetail.tsx` renders two row-level Status dropdowns (Generated tab and Raw Materials tab). Both write `requisition_raw_materials.purchase_status` (`pending` / `ordered` / `received`, shown as Pending / Inhouse / Outside Purchase). That column is a real workflow field, so it stays.
- `requisition_raw_materials` also has `plan_status` (machine/3p/pipe/sheet_ss/sheet_ms/sheet_gi/structure/steel) which drives the Purchase Planning page (`RequisitionPlan.tsx`) and annexure consolidation (`annexurePipeline.ts` → `requisition_annexure_rows.plan_status`). This is separate planning logic and will not be repurposed.
- Downstream tables `requisition_annexure_rows` and `purchase_order_rows` have no type field today; `grn_receipts` links to `purchase_order_rows` via `po_row_id`, so GRN can read the type through that link with no new GRN column.

## Database (single additive migration)
Add a nullable text column `raw_material_type` to:
- `public.requisition_raw_materials`
- `public.requisition_annexure_rows`
- `public.purchase_order_rows`

No defaults, no backfill, no renames, no drops. Existing rows stay `NULL` and open normally.

## Shared option list
New `src/lib/requisition/rawMaterialType.ts` exporting the ordered options: 3P, 3P Iron, Pipe, Sheets, Structure, GMS, 3P Machine, Sheets MS, Sheets SS, GI Pipe, GI Sheets — plus a label helper and a "Select type" placeholder for blank values.

## Requisition detail page
- Generated table: header `Status` → `Raw Material Type`; the Pending/Inhouse/Outside dropdown is replaced by the Raw Material Type dropdown bound to `r.raw_material_type`, saved per row through the existing `updateRm(r.id, …)` (independent per row, stable row id, no duplicate inserts).
- Raw Materials indent table: same column rename and dropdown swap.
- Blank when unset — no auto-assignment.
- All other editable cells (Raw Material, Size, Qty, Weight, Category, Make, UOM, Price, Vendor, Lot) unchanged; FG name/qty/make stay read-only.
- Requisition PDF: the row-level `Status` column label becomes `Raw Material Type` and prints the saved value (blank when unset).

## Carry forward
- Annexure creation (`annexurePipeline.ts` / `RequisitionPlan.tsx`): when consolidating source RM rows into an annexure row, copy `raw_material_type` when every source row shares the same value, otherwise leave it null. Grouping keys, quantities and existing `plan_status` logic are unchanged.
- PO creation from annexure (`PoCreateFromAnnexure.tsx`): copy the annexure row's `raw_material_type` onto the created `purchase_order_rows` row.
- Display as a read-only **Raw Material Type** column in: Annexure Folder rows, Purchase material/review tables, PO row table and PO PDF, and the GRN list (read via the linked PO row). Where a row-level Status column exists in these item tables it is relabelled; document-level statuses (PO status, GRN status, approvals) are untouched.

## Summary grouping
In Annexure and Purchase summary areas, add an *additional* type-wise summary block (total qty and total price per Raw Material Type). Existing quantity, price, tax, GST, freight, discount, subtotal and grand-total calculations are not modified.

## Not changed
Requisition creation, Manual Select & Create, RM Master auto-generation, BOM scaling, `purchase_status`, `plan_status`, annexure/purchase/PO/GRN workflow, numbering, approvals, notifications, permissions/RLS, BOQ/OA revision logic, routes.
