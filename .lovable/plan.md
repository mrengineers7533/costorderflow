# Verify OA export centering (MR + GMS, new and old OAs)

Run a real export pass in the preview and show the resulting PDF pages, so the vertical centering fix can be visually confirmed instead of assumed.

## What this does

- Open the app in an authenticated browser session and export the OA PDF from the Order page for:
  - the currently open MR OA (`/orders/209a9633-...`),
  - one GMS OA,
  - one older/legacy OA revision (created before the fix) to confirm old records export the same way.
- Also trigger the Orders-list / Revisions download path for the same orders, since that route uses the jsPDF table builder rather than the preview rasteriser.
- Render each generated PDF page to images and place them side by side with a screenshot of the Live Preview table for the same order.
- Measure, per item and totals row, the pixel gap above and below the text baseline block in the exported page and report the top/bottom difference. Rows where the gap difference exceeds ~1px are flagged.

## What gets reported back

- Preview vs export image pairs for MR, GMS and the old OA.
- A short per-row table of top gap / bottom gap / delta for item rows and for Basic Total, P&F, Subtotal, GST and Grand Total.
- A clear pass/fail verdict. If any row still sits low, the exact rows and the measured offset are named, plus the follow-up fix needed.

## What does NOT change

No source files are modified in this pass. Live Preview, column widths, values, totals, taxes, currency, numbering, terms/bank/signature blocks and every other module and PDF stay exactly as they are. This is verification only; any code change would be proposed separately after the measurements.

## Technical notes

- Playwright drives `http://localhost:8080` with the injected session; downloads are captured via `page.expect_download()` into a temp folder.
- PDFs are rasterised page-by-page for the image comparison and for the gap measurement (row borders detected from the dark horizontal rules, text extent from the ink bounding box between them).
- Paths exercised: `capturePreviewToPdf` in `src/lib/orders/previewPdf.ts` (Order page Download) and the `autoTable` builder in `src/lib/orders/pdf.ts` (list/revision download).
