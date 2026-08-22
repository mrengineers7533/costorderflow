# OA Export PDF: cell alignment + signature name

Two corrections, both limited to the OA Download/Export PDF path (the off-screen capture clone). No data, calculations, numbering, approval, workflow or other modules touched.

## 1. Table text vertical centering / no overlap in the exported PDF

Problem: in the exported PDF, item and totals rows show text drifting onto the row borders and overlapping neighbouring lines, while the Live Preview renders correctly.

Cause: the item tables center their content with an `inline-block` `.oa-cell-inner` plus `vertical-align: middle`. The browser resolves this correctly, but html2canvas (used to rasterise the export clone) mis-resolves inline-block baseline/middle alignment, so text is painted a few pixels off its cell box.

Fix (capture-scope CSS only, in `src/styles/oa-pdf.css` under `.oa-pdf-capture`):
- Render item/total cells as block content with an explicit fixed line-height instead of relying on inline-block middle alignment.
- Keep `vertical-align: middle` on the `td`/`th` themselves (table-cell alignment is handled correctly by html2canvas) and drop the inline-block trick inside the capture clone only.
- Set consistent vertical padding and a minimum row height so single-line rows keep the same height as the preview and multi-line descriptions grow the row instead of spilling.
- Keep numeric cells no-wrap; keep existing column-width and page-break logic in `src/lib/orders/previewPdf.ts` untouched.

The on-screen Live Preview styles (`.order-preview-body …`) stay exactly as they are.

## 2. Hide the creator name in the signature block (PDF only)

In the MR signature area the name currently prints under "M.R. ENGINEERS". Per your answer, it should disappear only in the exported/downloaded PDF and remain visible in the Live Preview.

- Add a marker class (e.g. `oa-sig-prepared-by`) to that one line in `src/components/orders/OrderPreview.tsx` — presentation only, no logic change.
- Hide it in `src/styles/oa-pdf.css` with `.oa-pdf-capture .oa-sig-prepared-by { display: none !important; }`.

"Prepared By: Ajit" in the header table is a different element and stays unchanged, in both preview and PDF.

## Verification

Export the OA shown in your screenshot and compare the generated PDF page against the Live Preview: every row's text vertically centered inside its borders, no overlap in the item/totals table or Terms block, and the signature area showing only "Yours faithfully / stamp / M.R. ENGINEERS".

## Files touched

- `src/styles/oa-pdf.css`
- `src/components/orders/OrderPreview.tsx` (one class name on the signature line)
