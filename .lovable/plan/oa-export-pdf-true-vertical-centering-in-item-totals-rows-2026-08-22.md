# OA export PDF: true vertical centering in item + totals rows

The OA Download/Export from the order page does not use the jsPDF table builder — it rasterises the Live Preview DOM (`capturePreviewToPdf`). So the row text sitting low is a rasteriser artefact: html2canvas does not honour `vertical-align: middle` on the inline-block cell content, and pushes text toward the bottom border. Editing table `styles.valign` in the jsPDF builder cannot fix this path (that builder is used only by the list/revision downloads).

## What changes

- In the off-screen capture clone only (Live Preview untouched), measure each OA item/totals row and re-balance the cell padding so the text lands exactly midway between the top and bottom border.
- Enforce a consistent minimum row height and equal top/bottom padding for item and totals rows in the clone, so single-line rows match the Preview's spacing.
- Applies to both MR and GMS OA tables (`table.oa-items-mr`, `table.oa-items-gms`).
- The jsPDF OA builder (used by Orders list / Revisions download) keeps `valign: "middle"` with matching padding and min row height so both routes look the same.

## What does NOT change

- Live Preview appearance, column widths, fonts, colours, the yellow Grand Total highlight.
- Any values, totals, taxes, currency conversion, numbering, terms/bank/signature blocks.
- PI, BOQ, PO, Requisition PDFs, Excel exports, and every other module.

## Technical notes

- `src/lib/orders/previewPdf.ts`: after the clone is attached and layout settles (the same point where the last `<col>` width is measured), iterate `clone.querySelectorAll("table.oa-items tr")`; for each `td`/`th`, set `vertical-align: top`, then set `padding-top`/`padding-bottom` to `(rowHeight - contentHeight) / 2` clamped to a minimum (keeps the existing 4-5px base padding as the floor). Content height comes from the `.oa-cell-inner` wrapper's `getBoundingClientRect()`.
- Row height is read once per row before mutating, so multi-line description rows keep their natural height and still centre.
- `src/styles/oa-pdf.css`: drop the reliance on `vertical-align: middle` inside `.oa-pdf-capture` item tables (the JS padding takes over) and add a `min-height`-equivalent via padding floor; the `.order-preview-body` (Live Preview / print) rules stay exactly as they are.
- `src/lib/orders/pdf.ts`: no functional change needed beyond the already-applied `valign: "middle"` / `minCellHeight` on the MR and GMS item tables; verify no `didParseCell`/`willDrawCell` in the OA item tables overrides valign (the only `didParseCell` is on the terms table).
