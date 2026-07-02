## Problem

In the GMS OA Live Preview / exported PDF, the right-side header block ("UGUR MACHINE, TURKEY" + tagline under the Uğur logo) grows tall enough to overflow into the grey "ORDER ACCEPTANCE" title bar sitting directly below it. When exported, the same overlap is captured into the PDF, and on long OAs the overlap area also gets pushed near a page break.

## Root cause

In `src/components/orders/OrderPreview.tsx` (`GMSHeader`):
- The right column contains a `h-14` Uğur logo plus two caption lines, but the row wrapping the two logo columns has no minimum bottom clearance before the grey title bar.
- The grey "ORDER ACCEPTANCE" bar uses only `mt-2`, so when the right column's caption lines render at their natural height, they visually collide with the bar.
- The pagination logic in `src/lib/orders/previewPdf.ts` treats the header block as one big node and only snaps to `tr / .pdf-keep` boundaries, so a page break can land inside the header/meta block.

## Changes (UI/PDF layout only — no data or business logic)

1. `src/components/orders/OrderPreview.tsx` — `GMSHeader`
   - Wrap the dual-logo row with `pdf-keep` and add explicit bottom spacing so the caption lines can never touch the grey bar.
   - Reduce the Uğur logo to `h-12` (matching GMS visual weight) and tighten the caption stack (`leading-tight`, small `mt-1`).
   - Align both columns with `items-end` so the caption baseline sits above the bar consistently regardless of logo aspect ratio.
   - Give the grey "ORDER ACCEPTANCE" bar `mt-3` and mark it `pdf-keep` so it's treated as an atomic break boundary.
   - Wrap the customer/OA meta grid in `pdf-keep` so the header + meta block is preserved as one unit at page top.

2. `src/styles/oa-pdf.css`
   - Add scoped rules under `.oa-pdf-capture` to enforce the same clearance during html2canvas capture (fixed min-height on the logo row, guaranteed margin above the grey bar) so the printed layout matches the on-screen fix even if fonts render slightly larger during capture.

3. `src/lib/orders/previewPdf.ts`
   - Add the header/meta wrappers to the boundary collection so page breaks never land inside them.
   - Keep the existing auto-pagination loop (already adds pages as needed) but ensure the first page always starts at boundary 0 with the full header intact, and subsequent pages resume after a safe boundary.

## Out of scope

No changes to totals, terms, calculations, workflow, MR template, or any non-GMS export path.
