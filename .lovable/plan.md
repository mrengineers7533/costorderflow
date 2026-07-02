## Goal
Make the exported PDF from **Review & Export → Live Preview** an exact visual match of what's shown on screen, without touching any data, calculation, approval, numbering, or workflow logic.

## Root cause
The current export path (`src/lib/orders/previewPdf.ts`) rasterises the preview DOM with `html2canvas` and re-paginates it into a jsPDF document. Even with `oa-pdf.css` normalisation, html2canvas re-parses CSS in a different engine than the browser, so:

- Fonts, letter-spacing and line-height shift slightly.
- Modern CSS tokens (`hsl(var(--…))`, `oklch`, `color-mix`, opacity variants like `bg-primary/90`) render subtly different from what the user sees.
- Tables, borders and page breaks are re-flowed inside a fixed 794px clone rather than the real live preview width, causing wrapping/row-height/margin drift.
- The slicing algorithm can still cut inside a `.pdf-keep` block, changing the appearance of Terms / Bank / Signature vs preview.

Result: PDF looks close but not identical to Live Preview.

## Fix (presentation-layer only)
Switch the export from "rasterise DOM → jsPDF" to "browser-native print → PDF", which guarantees pixel-parity because the same Chromium/Blink layout engine that draws the Live Preview also draws the PDF.

### Steps

1. **New helper** `src/lib/orders/previewPrint.ts`:
   - `exportPreviewAsPdf(root: HTMLElement, filename: string)` opens a hidden `<iframe>` sized to A4.
   - Deep-clones the preview node + inlines the app's stylesheets (`document.styleSheets` → `<style>` tags) and the existing `oa-pdf.css` scoped rules into the iframe.
   - Applies a small `@page { size: A4; margin: 8mm } @media print { .print\\:hidden{display:none} tr,.pdf-keep,.pdf-keep-group>*{page-break-inside:avoid} }` block so pagination snaps to safe boundaries the same way as the on-screen preview.
   - Waits for images/fonts to load (`document.fonts.ready`, `img.decode()`), sets `document.title = filename` so the browser's "Save as PDF" defaults to the right file name, then calls `iframe.contentWindow.print()`.
   - Cleans up the iframe after `afterprint`.

2. **Wire it into the existing export button** in `src/pages/orders/OrderEditor.tsx` (`downloadPDF`) and `src/pages/pi/PiEditor.tsx` (Export PI PDF):
   - Replace the `capturePreviewToPdf(...)` call with `exportPreviewAsPdf(root, filename)`.
   - Keep the existing `generateOrderPDF` / `generatePIPDF` fallback path untouched for the case where the preview DOM isn't mounted (programmatic downloads, tests).

3. **Keep** `src/styles/oa-pdf.css` and the `pdf-keep` / `pdf-keep-group` / `data-oa-preview-root` markers — they already give perfect break points; the new helper reuses them inside the print iframe.

4. **Remove nothing else.** `previewPdf.ts` stays for callers that still need a Blob (e.g. email attachments); only the user-facing "Export PDF" button switches to the print path.

### Scope guard (unchanged)
- No changes to OA/BOQ/PI data, calculations, GST, totals, amount in words, numbering, revision logic, Save Draft, Finalize, Convert to PI, Design/Manufacturing/Purchase workflow, approval logic, notifications, or access rules.
- No changes to `OrderPreview.tsx` content — only the export mechanism changes.

## Files touched
- **Add**: `src/lib/orders/previewPrint.ts`
- **Edit**: `src/pages/orders/OrderEditor.tsx` (swap export call in `downloadPDF`)
- **Edit**: `src/pages/pi/PiEditor.tsx` (swap export call in Export PI PDF handler)
- **Reuse (no edit)**: `src/components/orders/OrderPreview.tsx`, `src/styles/oa-pdf.css`

## Verification
- Open an OA (MR and GMS), click **Export PDF** from Review & Export → the browser's save dialog produces a PDF that is byte-for-byte the same layout the user sees in Live Preview (fonts, borders, table widths, row heights, page breaks, stamp position, Bank/Signature block).
- Same check for a PI in Review & Export.
- Confirm existing programmatic downloads (email/other callers) still work via the untouched `generateOrderPDF` / `generatePIPDF` path.
