## Root cause

The `src/assets/mr-stamp.png` asset has the words **"Yours faithfully"** baked into the top ~22% of the image (confirmed by inspecting the PNG). The preview already renders its own italic "Yours faithfully" label above the stamp, so the baked-in text renders a second time and, because the stamp is positioned absolutely inside a limited-height cell, its top edge gets clipped by the row bottom — producing the "half-cut duplicate" the user is seeing in both Live Preview and the exported PDF.

## Fix (UI-only, minimal)

Hide only the top strip of the stamp image (where the duplicate text lives) using CSS `clip-path`. This affects rendering only — no data, PDF pipeline, layout, or asset file is changed, and the correct top-left "Yours faithfully" text stays exactly as-is.

### File to change

- `src/components/orders/OrderPreview.tsx` (the `<img className="oa-pdf-stamp ...">` at line 885)
  - Add inline style: `style={{ clipPath: "inset(22% 0 0 0)" }}`
  - Slightly nudge the stamp position (`top-6` → `top-4`) so the visible circular part still sits nicely under the "Yours faithfully" label after clipping.

- `src/styles/oa-pdf.css`
  - Add the same `clip-path` rule scoped to `.oa-pdf-stamp` so the html-to-canvas PDF export honors the crop (html2canvas respects `clip-path: inset(...)`).

This same `OrderPreview` component is what the PI preview reuses for the MR format, so fixing it here resolves the duplicate in both OA and PI simultaneously. Nothing else is touched.

## Verification

1. Open an OA in Live Preview → only one "Yours faithfully" visible; circular stamp intact.
2. Export the OA PDF → matches Live Preview, no half-cut text.
3. Open a PI that uses the MR letterhead preview → same result.
4. Confirm no regressions to Terms & Conditions, Bank block, footer, or page-break behavior.
