# OA PDF table alignment to match Live Preview

Make the downloaded/exported OA PDF item + totals table look like the Live Preview: text vertically centered inside each row, comfortable padding, no text touching or crossing row borders.

## What changes

- Item rows (S. No., Item Description, Qty., Unit, Rate, Amount): text vertically centered in the row instead of pinned to the top.
- Totals rows (Basic Total, P&F, Subtotal, GST, Grand Total, and MR advance/net rows): same vertical centering, consistent row height.
- Slightly increased cell padding and a minimum row height so single-line rows match the Preview's breathing room, and wrapped multi-line descriptions still stay clear of the borders.
- Applies to both MR and GMS OA formats so the two exports look identical in behaviour.

## What does NOT change

- Column widths, horizontal alignment, fonts, colours and the yellow Grand Total highlight.
- Any values, totals, taxes, currency conversion, numbering, terms/bank/signature blocks.
- Live Preview itself, Excel export, PI/BOQ/PO/Requisition PDFs, and every other module.

## Technical notes

- File: `src/lib/orders/pdf.ts` — the MR items `autoTable` call (`styles.valign: "top"` → `"middle"`, add `minCellHeight`, bump `cellPadding`) and the matching GMS items table (already `middle`; align padding/min height).
- Totals rows are appended into the same table body, so the shared `styles` change covers them; per-cell style overrides for the bold/highlight rows are kept as-is.
- `src/lib/pdf/tableStyles.ts` shared defaults stay untouched so other modules' PDFs are unaffected; the change is made only in the OA table options.
