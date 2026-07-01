## Goal
Make MR **and** GMS OA PDF output render exactly like the on-screen Live Preview by hardening the existing DOM-capture pipeline. No changes to OA/BOQ data, calculations, GST, numbering, approval flow, Save Draft, Finalize, Convert to PI, Manufacturing/Purchase workflow, or any existing feature.

## Root causes in the current capture pipeline
Files: `src/lib/orders/previewPdf.ts`, `src/components/orders/OrderPreview.tsx`.

1. **CSS variables / modern color functions mis-rendered by html2canvas.** Preview uses design tokens (`border-foreground`, `bg-primary/90`, `bg-muted/*`, `text-primary-foreground`) that resolve to `hsl(var(--…))` or `oklch(...)`. html2canvas 1.x mishandles these → thin/missing borders, washed backgrounds, and text that visually spills past cells.
2. **Capture runs on the live node.** The preview lives inside a Card with scroll containers, sticky headers, and `space-y-4`. Temporarily setting `width:900px` in place doesn't neutralize the surrounding layout, so wrapping in the PDF drifts vs what's on screen.
3. **Pagination snap set is too coarse.** Boundaries include only `tr, .pdf-keep`. When a `.pdf-keep` block (Terms) is taller than a page, the loop hard-slices it. Bank/Signature/yellow footer can also fall on unsafe cuts because they aren't grouped.
4. **Stamp not guaranteed decoded before capture.** `<img src={mrStamp}>` may still be loading when html2canvas snapshots → stamp missing near "Yours faithfully / M.R. ENGINEERS".
5. **`page-break-before` / print-only CSS is ignored** by html2canvas.

## Fix (rendering layer only)

### 1. Off-screen clone with normalized styles — `src/lib/orders/previewPdf.ts`
- Deep-clone `[data-oa-preview-root]` into a fixed off-screen container:
  `position:fixed; left:-10000px; top:0; width:794px;` (A4 @ 96dpi minus margins).
- Wrap in `<div class="oa-pdf-capture">` so the scoped stylesheet applies.
- Preload images: `await Promise.all([...clone.querySelectorAll('img')].map(img => img.decode().catch(()=>{})))` — guarantees stamp/logos are ready.
- Capture the clone, then remove it. Live UI is never mutated (also removes the existing `element.style.width` side-effect).

### 2. Scoped print-safe stylesheet — new `src/styles/oa-pdf.css`
Imported only by `previewPdf.ts`; all rules under `.oa-pdf-capture` so app UI is untouched:
- Force explicit hex tokens: `--foreground:#000; --border:#000; --muted:#f3f4f6; --primary:#facc15; --primary-foreground:#111;`, and map `bg-primary/90`, `bg-muted/40`, etc. to solid hex.
- Normalize: `border-collapse:collapse`, cell padding, `font-family:'Inter',Arial,sans-serif`, `font-size:11px`, `line-height:1.35`.
- `td,th,div{word-break:break-word; overflow-wrap:anywhere}` — Terms/Bank never overflow.
- Kill web-only affordances: `.print\:hidden{display:none!important}`, `box-shadow:none`, `.animate-*{animation:none}`.

### 3. Smarter pagination
- Expand boundaries to include: every `<tr>`, every `.pdf-keep`, direct children inside `.pdf-keep` (Terms paragraph, Bank grid, Signature row, footer strip), and every `<p>/<div>` line inside Terms.
- If a keep-block is taller than a page, allow inner (line-level) boundaries so it flows across pages instead of being sliced mid-glyph.
- Keep the "min 40% page advance" rule to prevent sliver pages.

### 4. Stamp + signature grouping — `src/components/orders/OrderPreview.tsx`
- Wrap the MR post-items block (Terms + Bank/Signature + M.R. label + yellow footer) in a single `<div class="pdf-keep-group">`; pagination prefers to keep it together but children remain individually keep-able.
- On the stamp `<img>`: `loading="eager"`, replace tailwind `opacity-90` with an inline rgba filter that html2canvas composites correctly.
- Symmetric grouping for the GMS T&C / Bank / Exclusions block so GMS behaves the same.

### 5. No behaviour changes
- `downloadPDF()` in `src/pages/orders/OrderEditor.tsx` unchanged — still calls `capturePreviewToPdf` first, falls back to legacy `generateOrderPDF`.
- Legacy `src/lib/orders/pdf.ts` untouched.
- Save Draft, Finalize, Convert to PI, revisions, approvals, notifications, numbering — untouched.

## Files touched
- `src/lib/orders/previewPdf.ts` — clone + decode + smarter pagination.
- `src/styles/oa-pdf.css` — new scoped stylesheet.
- `src/components/orders/OrderPreview.tsx` — `pdf-keep-group` wrappers + stamp opacity swap. No data/totals/logic touched.

## Verification (must pass before "done")
Via Playwright against `http://localhost:8080`:
1. Open MR OA `MROA/2026-27/0007/R7` preview → screenshot `preview-mr.png`.
2. Trigger Download PDF → rasterize with `pdftoppm -r 150` → `pdf-mr-p*.png`.
3. Visual checklist:
   - Terms cell auto-heights; no text outside borders.
   - Bank Details + "Yours faithfully / M.R. ENGINEERS" + stamp on same page.
   - Yellow footer address strip full width, present.
   - Mohar visible next to signature block.
   - Column widths, row heights, font sizes match preview.
4. Repeat for a GMS OA (e.g. `2026-27/GMS/0002/R9`) → `preview-gms.png` vs `pdf-gms-p*.png`.
5. `git diff --stat` lists only the 3 files above — proof no other logic changed.

Preview vs PDF screenshots delivered inline in the completion message.
