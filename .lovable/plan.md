## Problem

In the exported GMS OA/PI PDF, the items table has misaligned columns:

- Header labels **"ITEM NO"** and **"MODEL NUMBER"** collide and render as `ITEM NOMODEL NUMBER` because their fixed widths (14mm / 24mm) are narrower than the label text at the current font size / padding.
- **MODEL NUMBER** column is always empty in current data (it isn't stored separately), yet it still reserves 24mm of width and squeezes every other column.
- The table doesn't auto-fit the page width — remaining columns don't reflow when a column is hidden or empty.
- Numeric cells (Qty, Unit, Rate, Amount) are vertically centered but sometimes drift because `valign` mixes with `top` inheritance from shared defaults.

## Fix (GMS PDF layout only — no data / logic changes)

Edit **`src/lib/orders/pdf.ts`** inside `renderGmsPdf`:

1. **Auto-hide the Model Number column when every row is empty.** Since GMS line items don't store a separate model number, drop the column from `gmsCols` when all resolved cells are blank. This alone eliminates the header collision in the attached PDF.
2. **Widen minimum column widths** so header labels never overlap even when Model Number is present:
   - `item_no`: 14 → 16mm
   - `model_number`: 24 → 30mm
   - `make`: 30 → 26mm
   - Keep `description: "auto"` so it absorbs remaining width.
3. **Force table to fill page width** by adding `tableWidth: W - M * 2` to the autoTable call, so remaining columns reflow proportionally when any column is hidden.
4. **Consistent vertical + horizontal alignment**:
   - Base `styles.valign: "middle"` (already set) — explicitly re-apply on `columnStyles` so shared defaults don't override to `top`.
   - Numeric columns (`qty`, `unit`, `item_no`) center-aligned; `rate`, `amount` right-aligned; `description` left + middle.
5. **Header cell padding**: bump `headStyles.cellPadding` to `{ top: 2, right: 2, bottom: 2, left: 2 }` and set `minCellHeight: 8` so two-line headers like `UNIT PRICE\n(INR)` render cleanly without clipping.
6. **Totals rows**: keep existing `colSpan` logic; ensure the label cell uses `valign: "middle"` for vertical alignment with the value.

## Files changed

- `src/lib/orders/pdf.ts` — `renderGmsPdf` only (column widths, auto-hide empty Model Number, `tableWidth`, alignment styles, header padding).

## Not changed

- No changes to MR PDF, PI PDF, BOQ PDF, calculations, totals logic, currency handling, or Live Preview.
- No DB / schema changes.

## Verification

- Regenerate the same OA (`2026-27/GMS/0003`) as PDF, convert to image via `pdftoppm`, and visually confirm:
  - Header labels are fully readable and non-overlapping.
  - Table fills page width with description expanding.
  - Numeric cells are centered / right-aligned as expected.
  - Totals rows align with the Amount column.
- Also test one GMS OA that *does* have Make + long descriptions to confirm reflow still works.
