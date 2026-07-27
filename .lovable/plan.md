## Goal
Rename two column headers on the Requisition page shown in the screenshot (REQ/26-27/0003-R6/015 → Generated / Raw Materials tabs) — labels only, no behaviour change.

## Verified current state
`src/pages/requisitions/RequisitionDetail.tsx`:
- Generated tab header row: `Category` (line 561) and `RM Type` (line 567), in the order RM Qty · Weight · Category · RM Make · UOM · Price · Vendor · Lot · RM Type — already matching the requested final layout.
- Raw Materials tab header: `RM Type` (line 708).
- The `Category` dropdown already uses the 11 options (`MATERIAL_CATEGORIES`); the `RM Type` dropdown already uses In House / 3rd Party / Steel (`RAW_MATERIAL_TYPES`).
- A third `Category` header at line 801 belongs to the Items tab (`purchase_category`) and is unrelated — left untouched.

## Change (labels only)
- Generated tab: `Category` → **RM Category**, `RM Type` → **Status**.
- Raw Materials tab: `RM Type` → **Status** (same field, kept consistent on this page).
- Dropdown option lists, stored fields (`material_category`, `raw_material_type`), save paths, and column order stay exactly as they are.

## Not changed
Column order, dropdown options, data fields, Items tab Category, workflow/plan status, Annexure/PO/GRN carry-forward, PDFs, calculations, permissions, database.
