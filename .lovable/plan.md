# Plan: Combined Requisition view in the requested 10-column format

## What the user wants

When a requisition is "generated", it should display (and export) in this exact column order, one row per raw material grouped under its Finish Good:

```text
1 Finished Good | 2 Make | 3 Qty | 4 Raw Material | 5 Size | 6 RM Qty | 7 (extra) | 8 UOM | 9 Lot (editable, autosave) | 10 Status (Outside Purchase / Inhouse / Pending)
```

- Columns 1–3 (FG, Make, FG Qty) come from BOQ (Make resolved via existing OA→BOQ resolver).
- Columns 4–8 (RM description, Size, RM Qty, UOM) come from `requisition_raw_materials`.
- Column 9 Lot is editable inline with autosave to `requisition_items.lot_no` (per FG group).
- Column 10 Status is a dropdown saved to `requisition_raw_materials.purchase_status` with values: Pending / Inhouse / Outside Purchase.

Column 7 in the user's list is unlabeled. We will use it for **Make of Raw Material** (`requisition_raw_materials.make`) since that field already exists and fits between Size and UOM. Confirm during review if a different label is preferred.

## Approach (no existing feature changes)

Add a new **"Generated"** tab inside `RequisitionDetail.tsx` that renders the 10-column unified table. All other tabs (Raw Materials, Items, Steel, Outside) stay as-is. PDF export gets a parallel "Generated format" option that uses the same layout; the current PDF stays unchanged by default.

No DB schema changes. Status enum on `requisition_raw_materials.purchase_status` today is `pending|ordered|received`; we will **map** UI labels:
- "Pending" → `pending`
- "Inhouse" → `received` (display-only relabel for this view)
- "Outside Purchase" → `ordered`

This avoids a migration and preserves every existing screen's semantics. If the user wants a true new enum, that's a follow-up.

## Changes

### 1. `src/pages/requisitions/RequisitionDetail.tsx`
- Add a new tab `Generated` (made the default) before `Raw Materials`.
- Render a single table with the 10 columns above, FG cell merged with `rowSpan` across its RM rows (same grouping logic as `rmGroups`).
- FG Make uses `resolveReqMake(it)` (already implemented).
- Lot input bound to the FG's `requisition_items.lot_no`, autosaves on blur via existing `updateItem`.
- Status `<Select>` with the three labels above, mapped to existing enum via `updateRm`.
- All existing tabs untouched.

### 2. `src/lib/requisition/pdf.ts`
- Add an optional `format: "default" | "generated"` flag to `RequisitionPdfContext`.
- When `generated`, emit a single 10-column autoTable matching the on-screen layout (FG/Make/Qty merged across RM rows). Default path unchanged.

### 3. `src/pages/requisitions/RequisitionDetail.tsx` — PDF button
- Add a small dropdown next to the existing PDF button: "PDF (current)" and "PDF (generated format)". Current button keeps current behavior byte-identical.

## Out of scope
- No changes to OA / BOQ / PI / Purchase / Manufacturing pages.
- No DB migrations, RLS, edge functions, calculations, or notifications.
- No changes to the public requisition share view (existing layout preserved). Can be extended later if needed.
- No changes to existing tabs, columns, toggles, or PDF default output.