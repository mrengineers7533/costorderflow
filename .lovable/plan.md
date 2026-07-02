## Goal
Fix PDF text alignment, wrapping, row height, and page-break issues consistently across every PDF export (OA, PI, BOQ, Requisition, PO, Design Review, BOQ Distribution) by introducing one shared jsPDF/autoTable configuration and applying it in every existing PDF generator.

## Root cause
Every PDF module (`src/lib/orders/pdf.ts`, `src/lib/pi/pdf.ts` via OA, `src/lib/boq/pdf.ts`, `src/lib/boq/pdfDistribution.ts`, `src/lib/boq/designReviewExport.ts`, `src/lib/requisition/pdf.ts`, `src/lib/purchase/poPdf.ts`) builds its own `autoTable` call with different `cellPadding`, missing `overflow: 'linebreak'`, missing `rowPageBreak: 'avoid'`, and inconsistent `valign`/`halign`. Result: text touches borders, wraps oddly, and rows get cut across pages.

Note: `src/lib/orders/previewPdf.ts` is DOM-capture (html2canvas) and is only used for OA Live-Preview mode. It has its own layout system (`src/styles/oa-pdf.css`, pagination in code) — it will NOT be changed to keep OA Live-Preview parity intact. This fix targets the autoTable pipeline used by every other PDF (and the fallback OA path).

## New shared module
Add `src/lib/pdf/tableStyles.ts` exporting:

- `PDF_BASE_STYLES` — `{ fontSize: 8.5, cellPadding: 2.2, lineHeightFactor: 1.25, valign: 'top', overflow: 'linebreak', lineColor: [0,0,0], lineWidth: 0.2 }`
- `PDF_HEAD_STYLES` — `{ fontStyle: 'bold', halign: 'center', fillColor: [55,65,81], textColor: 255 }` (callers can override `fillColor` to preserve existing accent colors)
- `PDF_TABLE_DEFAULTS` — `{ theme: 'grid', styles: PDF_BASE_STYLES, headStyles: PDF_HEAD_STYLES, rowPageBreak: 'avoid', showHead: 'everyPage' }`
- `alignFor(key)` — returns `{ halign, overflow }` for common column semantic keys: `sno/qty/unit → center`, `rate/amount/tax/gst/total → right (nowrap via overflow: 'ellipsize' only when width tight, else linebreak)`, `description/model/remarks/scope → left linebreak`, default left.
- `applyAutoTable(doc, options)` — thin wrapper that deep-merges `PDF_TABLE_DEFAULTS` with the caller's options so callers don't accidentally lose the shared defaults.

## Files to update (apply shared defaults, no business-logic changes)
1. `src/lib/orders/pdf.ts` — every `autoTable(doc, …)` call (MR items table + totals, GMS items table, terms/bank/signature blocks) uses `applyAutoTable`. Keep existing column widths, colors, colSpans, and totals rows unchanged; only merge in `overflow: 'linebreak'`, `valign: 'top'`, `cellPadding: 2.2`, `rowPageBreak: 'avoid'`, and normalize `halign` per column semantics (Description left, Qty/Unit center, Rate/Amount right, S.No center).
2. `src/lib/boq/pdf.ts` — BOQ items table: same treatment; ensure Description is left+linebreak, Qty/Unit centered, S.No centered.
3. `src/lib/boq/pdfDistribution.ts` — Remarks Summary, Design Comments, Change Log tables.
4. `src/lib/boq/designReviewExport.ts` — Design review items table.
5. `src/lib/requisition/pdf.ts` — Requisition items table + header/footer blocks.
6. `src/lib/purchase/poPdf.ts` — PO items table + totals.
7. `src/lib/pi/pdf.ts` — no direct table code (delegates to `orders/pdf.ts`), so it inherits the fix automatically.

## What is NOT touched
- No changes to totals math, GST, discount/advance logic, amount-in-words, numbering, approval, notification, DB schema, storage, or UI pages.
- No changes to OA Live-Preview DOM-capture (`previewPdf.ts`, `oa-pdf.css`) — behavior stays identical there.
- Column widths, colors, and section ordering preserved exactly.

## Technical details
- `rowPageBreak: 'avoid'` prevents mid-row splits; `showHead: 'everyPage'` repeats the header on new pages.
- `overflow: 'linebreak'` + `valign: 'top'` + higher `cellPadding` gives clean wrapping without borders touching text; autoTable already recomputes row height from wrapped content.
- Column-level overrides continue to work because `columnStyles` is passed through unchanged; `applyAutoTable` merges but does not overwrite explicit caller keys.

## Verification
1. `tsgo` typecheck on updated files.
2. Manual PDF checks: OA with long descriptions (MROA sample), MR PI, GMS OA, BOQ multi-page, PO with many rows, Requisition PDF — confirm no text overlaps borders, no rows split across pages, header repeats, alignment matches column type.
3. Confirm OA Live-Preview PDF path (html2canvas) still produces the same output (unchanged code path).

## Deliverables
- New file: `src/lib/pdf/tableStyles.ts`
- Edits: the 6 PDF generators listed above (autoTable calls only)
- No migrations, no route changes, no UI changes.