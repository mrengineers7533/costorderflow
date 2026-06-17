## Goal
On the Manufacturing and Purchase BOQ details page only, add Motor and Motor Qty columns to the "Approved BOQ items (read-only)" table — placed after the existing Remarks column.

## Scope
Single file: `src/pages/modules/ApprovedBoqModule.tsx` (shared by `ManufacturingDetail` and `PurchaseDetail`).

No other surface changes: list page, PDFs, Excel, OA/BOQ/Design pages, save/revised/auto-BOQ logic, notifications, acknowledgements, calculations — all untouched.

## Changes
In `ApprovedBoqDetailPage`'s items table:

1. Add two `<th>` headers after the existing Remarks header:
   - `Motor`
   - `Motor Qty` (right-aligned)

2. Add two `<td>` cells per row after the Remarks cell, reading from existing `BoqLineItem` fields:
   - `it.motor || "—"`
   - `it.motor_quantity ?? "—"` (right-aligned)

3. Update the empty-state `colSpan` to account for the two new columns (currently `showMake ? 7 : 6` → `showMake ? 9 : 8`).

## Final column order
`# | Description | Model | [Make?] | Qty | Unit | Remarks | Motor | Motor Qty`

## Data source
Already present on `BoqLineItem` (`motor`, `motor_quantity` in `src/lib/boq/types.ts`) — same fields used by Design/BOQ/OA pages. No schema, query, or types changes needed.
