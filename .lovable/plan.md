
## Goal
Make the OA Live Preview, PDF Download, and Print output render an identical, professional table that reflows correctly whether 0, 1, or 2 columns are hidden. No data, calculation, or workflow changes.

## Root causes observed
1. `OrderPreview.tsx` uses per-column fixed Tailwind widths (`w-10`, `w-24`, etc.) on `<th>` cells. When columns are hidden, the remaining fixed widths don't expand to fill the row, and narrow amount/qty cells force number strings like `1,57,35,487.00` to wrap mid-number, causing the ugly split shown in the screenshot.
2. `oa-pdf.css` sets `word-break: break-word; overflow-wrap: anywhere;` globally on every `td/th`, which is what actually breaks the numeric totals into stacked fragments.
3. Cell alignment is inconsistent: description is top-aligned even for single-line rows, small columns aren't consistently center-aligned, and totals label cells span the whole row minus one — but the resulting label cell is not right-aligned in all branches.
4. There's no `table-layout` hint, so when hidden columns are removed the browser can't rebalance.

## Changes (presentation only)

### 1. `src/components/orders/OrderPreview.tsx`
- Replace fixed `w-*` classes on the item table `<th>` with proportional widths via a small helper that computes column widths from `visCols` (item_no ~6%, model ~14%, make ~12%, qty ~7%, unit ~7%, rate ~13%, amount ~15%, description = remainder). This guarantees the row always fills 100% regardless of which columns are hidden.
- Set the items table to `table-fixed` so widths are honoured and hidden columns don't leave gaps.
- Standardise cell alignment classes:
  - Header cells: `text-center` for item_no / make / qty / unit; `text-left` for model / description; `text-right` for rate / amount.
  - Body cells: same as header except description = `text-left align-middle`; numeric cells add `whitespace-nowrap tabular-nums` so amounts never wrap.
- Ensure all totals-row label cells use `text-right font-semibold pr-2` and their value cells use `text-right whitespace-nowrap tabular-nums`. Confirm every `colSpan` matches `visCols.length - 1` (already true) and the value cell aligns under the amount column.
- Add `align-middle` to numeric body cells so short rows look centred while long descriptions still top-align via a `align-top` class on the description cell only.

### 2. `src/styles/oa-pdf.css`
- Scope the aggressive wrapping rules so numeric cells are exempt:
  - Keep `word-break: break-word` for description/text cells only (`.oa-pdf-capture td.oa-cell-wrap`).
  - Add `.oa-pdf-capture td.oa-cell-nowrap, .oa-pdf-capture th.oa-cell-num { white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }`.
- Add `.oa-pdf-capture table.oa-items { table-layout: fixed; }` and consistent `padding: 4px 6px` on all th/td for uniform breathing room.
- Add print rules mirroring the same table-fixed + nowrap behaviour under `@media print` so the browser Print dialog matches the PDF.
- Keep existing page size / margin behaviour unchanged.

### 3. Class hooks
- In `OrderPreview.tsx`, tag the item table with `className="oa-items"`, tag numeric cells with `oa-cell-num` (headers) and `oa-cell-nowrap` (body), and tag description cells with `oa-cell-wrap`. These classes are only consumed by `oa-pdf.css` and print CSS — screen appearance stays visually identical apart from the fixes above.

## Out of scope
- `src/lib/orders/pdf.ts`, `previewPdf.ts` capture pipeline, page size, margins, column visibility logic, calc/formulas, approval/revision logic, and every other module.

## Verification
- Manually render the OA preview at `/orders/:id` with:
  - All columns visible
  - Make hidden
  - Make + Unit hidden
  - Model + Make hidden (GMS)
- Confirm: table always fills row width, Description expands, Qty/Rate/Amount stay on one line, totals grand row aligns under Amount, no cell overflow, Print Preview matches, downloaded PDF matches.
