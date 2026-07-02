## Diagnosis from the attached PDF

Zooming into the items table shows the row height is driven by the 2-line Description, but the single-line cells (Item No, Make, Qty, Unit, Prices) sit slightly above the row's true vertical center because the Description text is anchored to the top of its cell and the row grows downward from `leading-snug` (1.375) inherited from the preview root. `vertical-align: middle` on the `td` only centers each cell's content against the row's baseline — it does not equalise the padding above/below the wrapped Description, so the visual center of the row drifts down.

## Fix — deterministic flex-center per cell (no logic changes)

Replace the fragile `vertical-align: middle` approach with the "table row auto-height + inner flex" pattern. This guarantees every cell — single-line or wrapped — is perfectly centered vertically and pads evenly, matching between Live Preview and exported PDF.

### Files touched

1. `src/components/orders/OrderPreview.tsx` — items table only (header row + body rows + totals rows already using `TotalsRow`):
   - Wrap every `<th>` and `<td>` child in a new element `<div className="oa-cell-inner">…</div>`.
   - Keep existing alignment classes on the cell (`text-left|center|right`) — the inner div reads them via `justify-content` from CSS so no per-cell prop is needed.
   - No change to widths, column visibility, description/make/qty logic, currency, totals, or ordering.
2. `src/styles/oa-pdf.css` — add rules scoped to `.order-preview-body table.oa-items` and `.oa-pdf-capture table.oa-items` (so Live Preview and PDF share behaviour):
   - `th, td { height: 1px; padding: 6px 6px; vertical-align: middle; line-height: 1.35; }` (`height:1px` is the standard trick that lets `.oa-cell-inner { min-height: 100% }` stretch to the actual row height).
   - `.oa-cell-inner { min-height: 100%; display: flex; align-items: center; }`
   - `td.text-left .oa-cell-inner, th.text-left .oa-cell-inner { justify-content: flex-start; }`
   - `td.text-center .oa-cell-inner, th.text-center .oa-cell-inner { justify-content: center; }`
   - `td.text-right .oa-cell-inner, th.text-right .oa-cell-inner { justify-content: flex-end; }`
   - Keep existing wrap rules (`oa-cell-wrap`, `oa-cell-nowrap`) — they still apply to the inner div via inheritance.
   - Keep the `oa-cell-top` escape hatch for the Bill To / Ship To address cells.
3. `TotalsRow` cells (last rows: Ex-works, Grand Total) already use `text-right align-middle`; they get the same wrapper so the totals label and amount sit on the same visual baseline as the item rows.

### Why this fixes it

- The items table stays `table-layout: fixed` and auto-adjusts row height to the tallest cell.
- Every cell's content is inside a flex container that fills the row (`min-height: 100%`), so single-line cells are dead-center against the wrapped Description automatically — no more asymmetric padding.
- Horizontal alignment is preserved by mapping the existing Tailwind alignment classes to `justify-content`.

### Out of scope

No changes to calculations, numbering, approval workflow, column widths, hidden-column reflow, page size, margins, page breaks, stamp clipping, address block, terms & conditions, bank details, or any non-items-table markup.

### Verification

- Reopen the same OA in Live Preview: Items 1/2/3 rows show Item No, Make, Qty, Unit, Prices dead-centered against the 2-line Description.
- Export the PDF and re-check the same rows plus the Ex-works / Grand Total rows.
- Toggle a hidden column (e.g. hide Make) and re-export to confirm reflow still centers correctly.
