## Problem

In the OA Live Preview and exported PDF, when the Description wraps to 2 lines, the other columns (Item No, Make, Qty, Unit, Unit Price, Amount) stick to the top of the row instead of sitting in the vertical middle. The Bill To / Ship To header labels also read as top-aligned.

The cells already use Tailwind's `align-middle`, but html2canvas / print sometimes drops it on wrapping rows, and the `<th>` cells never had a vertical-align rule at all.

## Fix (CSS + minimal markup only, no logic changes)

Scope: `src/styles/oa-pdf.css` and one small className adjustment in `src/components/orders/OrderPreview.tsx`. No calculations, numbering, approval or data logic is touched.

1. `src/styles/oa-pdf.css` — add hard vertical-align rules that apply both to the PDF capture container and to the on-screen `.order-preview-body` so Live Preview and PDF match:
   - `.oa-pdf-capture table.oa-items th`, `.oa-pdf-capture table.oa-items td` → `vertical-align: middle !important;`
   - Same rule mirrored under `.order-preview-body table.oa-items th/td` (outside `@media print` so it also applies in the on-screen preview).
   - Keep existing padding, wrapping and `page-break-inside: avoid` rules.
   - Add `line-height: 1.35` on items table cells so multi-line descriptions breathe evenly and the centered single-line cells sit visually on the same baseline.
2. `src/components/orders/OrderPreview.tsx` — change the `BILL TO` / `SHIP TO` header row from `align-top` to `align-middle` (labels only). The address cells below keep `align-top` so multi-line addresses still start from the top, which is the expected invoice convention.
3. Keep every column's horizontal alignment as it is today (Description left, numeric right, small columns center) per the earlier requirement.

## Verification

- Open the OA Live Preview for the same order in the screenshot and confirm Item 1/2/3 rows show Item No / Make / Qty / Unit / Prices centered vertically against the 2-line Description.
- Export the PDF and confirm the same alignment; also confirm nothing else (page breaks, totals row, stamp clip) regresses.

## Out of scope

No changes to column widths, hidden-column reflow, currency formatting, totals, page size, margins, or any business logic.
