## Goal

1. Stop the Requisition detail page from shifting/jumping while it loads.
2. Show the Price and Vendor values (already captured in Create Requisition) on the Requisition detail page and in downstream views.
3. Change nothing about existing calculations, workflows, PO/GRN logic, numbering, permissions, or PDFs.

## 1. Layout stability — `src/pages/requisitions/RequisitionDetail.tsx`

Current causes of the jump:
- While `loading` is true the page renders a bare `<div className="p-6 …">Loading…</div>`, then swaps to a `container mx-auto px-4 lg:px-6 py-5` shell — different width/padding, and the vertical scrollbar appears once content lands, shifting everything horizontally.
- `EntityActivityBanner` and `ModuleNotifications` mount async above the header, pushing the whole page down after first paint.
- Tables use default auto layout, so column widths re-flow when longer strings arrive.

Fixes (presentation only):
- Render the loading and "not found" states inside the *same* container shell used for the loaded state, so padding/width never change.
- Reserve vertical space for the two async banners (fixed min-height wrapper) so their arrival doesn't push content.
- Add `scrollbar-gutter: stable` on the app main scroll container so the scrollbar appearing doesn't shift width; add `overflow-anchor: none` on the detail page container to stop scroll anchoring jumps.
- Give the data tables `table-fixed` with explicit column widths (plus `overflow-x-auto` wrappers already present) so columns don't re-flow once rows render.

## 2. Price and Vendor on the Requisition detail page

`requisition_raw_materials` already has `rm_price` and `vendor_name` (written by the create-requisition function), so no schema change and no migration is needed. Old rows simply return `null`.

- Include `rm_price, vendor_name` in the raw-material select on the detail page and add them to `RequisitionRawMaterialRecord` in `src/lib/requisition/types.ts`.
- Add two right-side columns — **Price** (right-aligned, existing app number/currency formatting, blank when null) and **Vendor** (blank when null) — to:
  - the "Generated" table (Finished Good / RM grid)
  - the "Raw Materials" table
- Values are display-only; not fed into any total, tax, or amount calculation.

## 3. Downstream visibility (display-only carry-forward)

No new columns in downstream tables; values are looked up item-wise from the originating requisition raw-material rows.

- **Annexure rows** (`src/pages/requisitions/AnnexureFolder.tsx`): each annexure row already stores `source_rm_ids`; fetch the source RM rows and show Price/Vendor from them (when a merged row has conflicting values, show the first non-empty and mark multiples with `—`/tooltip).
- **Purchase Planning / Purchase Material** (`src/pages/requisitions/RequisitionPlan.tsx`, `src/pages/purchase/PurchaseMaterial.tsx`): add read-only "Req Price" and "Req Vendor" reference columns next to the existing Rate/Vendor fields. The existing purchase Rate and vendor-selection fields keep their own values and logic untouched.
- **PO create from annexure** (`src/pages/purchase/PoCreateFromAnnexure.tsx`): show the same two reference columns in the editable grid only (not in the printed PO layout), purely as a buying reference. PO rate/GST/amount logic unchanged.
- **GRN** (`src/pages/grn/GrnList.tsx`): show the requisition reference Price/Vendor alongside the existing PO Rate/Vendor columns.

Every one of these is an additional display column; no writes, no changes to selection, totals, or PDF output.

## 4. Explicitly unchanged

Order, PI, Design, Manufacturing, Purchase and Requisition business logic; quantity/price/tax/discount formulas; vendor and rate selection during purchase; PO generation and numbering; design approval and BOQ carry-forward; notifications, permissions, and all PDF/Excel exports.

## Technical notes

- Files touched: `RequisitionDetail.tsx`, `AnnexureFolder.tsx`, `RequisitionPlan.tsx`, `PurchaseMaterial.tsx`, `PoCreateFromAnnexure.tsx`, `GrnList.tsx`, `src/lib/requisition/types.ts`, plus a small CSS/layout tweak in the app shell.
- No database migration required — `rm_price` and `vendor_name` already exist on `requisition_raw_materials`.
- Nulls render as blank, never `0` or `NaN`.
