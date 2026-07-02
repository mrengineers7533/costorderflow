## Goal
Exported OA/PI PDF must match the on-screen Live Preview exactly — no clipped totals, amounts, borders, item text, or bottom rows — for 5-, 6-, and 7-column layouts. No changes to Live Preview design, calculations, data, numbering, GST/P&F/Insurance, or workflow.

## Root cause
`capturePreviewToPdf` clones the Live Preview into a **fixed 794px-wide** off-screen host and rasterises with `html2canvas` at that exact width. In 5/6-column layouts (Rate/Amount hidden), the totals column becomes narrow and its no-wrap amounts (e.g. "1,88,59,552.00") overflow past 794px. Anything past that boundary is silently cut from the canvas, so the exported PDF loses the right-most totals, borders, or GST rows even though the on-screen preview shows them fine.

Vertical clipping can happen the same way if the cloned content's real `scrollHeight` exceeds what we measured before slicing pages.

## Fix (export-only, single file)

**File:** `src/lib/orders/previewPdf.ts`

1. Render the clone into the off-screen host at the nominal 794px width (unchanged — this preserves the exact Live Preview layout: fonts, spacing, column proportions, totals position).
2. After images/fonts settle, measure the **real content extent**:
   - `capW = max(794, host.scrollWidth, max(el.getBoundingClientRect().right) across descendants)`
   - `capH = max(host.scrollHeight, max(el.getBoundingClientRect().bottom))`
   This catches no-wrap totals that overflow their parent cell.
3. If `capW > 794`, expand the host width to `capW` and wait one animation frame. This does **not** re-flow the preview design — it only widens the invisible off-screen capture container so overflowing content lands inside the canvas.
4. Pass `windowWidth: capW` **and** `width: capW` to `html2canvas` so the rasterised canvas actually includes the overflow region (currently only `windowWidth` is set, which is why content past 794px is dropped).
5. Update the CSS-px → mm mapping used for A4 pagination:
   - `cssPxToMm = printableW / capW` (was `/ 794`).
   - `pageCssPx = printableH / cssPxToMm` — recomputed from the new mapping so page slicing uses the true content width.
6. Keep the existing safe-break logic (never slice across `<tr>` or `.pdf-keep`) and multi-page loop. Because pagination is driven by `pageCssPx` derived from the measured width, tall documents continue to paginate safely — the bottom is never cut.
7. Readability guardrail: content is only widened by the actual overflow ratio (typically <5%), so the A4 scale-down is minor and text stays readable. No forced shrink-to-fit.

## Scope guarantees
- **Both OA and PI** go through `capturePreviewToPdf` from their Review & Export screens (`OrderEditor.downloadPDF`, `PiEditor.downloadPdf`) and OA list/revision downloads via `exportOrderPreviewPdf` — all fixed by this single change.
- **PI list download** still uses the legacy `generatePiPDF` path; not touched here to avoid altering PI totals/docMeta assembly (out of scope for this fix, and the primary export path users hit is Review & Export).
- **Live Preview UI is not touched.** Only the off-screen capture container's width and the html2canvas parameters change. `OrderPreview.tsx`, CSS, columns, fonts, and totals layout are unchanged.
- No calculation, GST/P&F/Insurance, data, numbering, approval, or workflow changes.

## Files changed
- `src/lib/orders/previewPdf.ts` — overflow-safe measured capture width + width mapping.

## Verification
- OA in a 5-column layout (screenshot): download PDF, confirm Basic Total, P&F, Insurance, GST, Grand Total, and the right border are fully visible and not clipped.
- Repeat with 6-column and 7-column layouts.
- Long OA (>1 page): confirm rows and totals blocks are not cut mid-row and paginate onto page 2 cleanly.
- PI Review & Export download: confirm output matches on-screen preview exactly.