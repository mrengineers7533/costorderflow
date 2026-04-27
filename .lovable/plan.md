## Problem

The GMS logo (and Uğur logo) in the PDF header look distorted/squished because they're drawn into fixed mm boxes whose aspect ratio doesn't match the source images:

- `gms-logo.png` is **589×343 px** (aspect ≈ 1.72) but is drawn at **55×18 mm** (aspect ≈ 3.05) → stretched wide / squashed vertically.
- `ugur-logo.png` is similarly forced into **45×18 mm** without preserving aspect ratio.

The redundant bold caption `GRAIN MILLING SOLUTIONS PRIVATE LIMITED` rendered directly under the GMS logo also clashes visually because the logo wordmark already says "GMS" — the uploaded screenshot shows them stacked awkwardly.

## Fix

Edit only `src/lib/orders/pdf.ts` — `drawHeader` inside `renderGmsPdf`:

1. **Preserve aspect ratio for both logos.** Instead of hardcoded width × height, fit each logo into a bounding box and compute the drawn `w × h` from the image's natural dimensions so it never stretches.
   - Add a small helper `fitInBox(natW, natH, maxW, maxH) → { w, h }` (contain-style fit).
   - Read natural dimensions from the cached image (create an `Image` once during `loadLogo` and store `width`/`height` alongside the data URL, or load via `new Image()` inside `drawHeader`).
   - Target box for GMS logo: **max 50 mm wide × 22 mm tall**, vertically centered in the header band.
   - Target box for Uğur logo: **max 45 mm wide × 22 mm tall**, right-aligned, vertically centered.

2. **Tighten the captions** so the header reads cleanly:
   - Keep `GRAIN MILLING SOLUTIONS PRIVATE LIMITED` but render it slightly smaller (9pt) and position it just below the actual drawn logo height (using the computed `h`), not at a fixed `y = 25`.
   - Same treatment for `UGUR MACHINE, TURKEY` + the italic tagline on the right — anchor them under the actual drawn Uğur logo height.

3. **Bump `GMS_HEADER_H` from 32 → 34 mm** so the taller (correctly-proportioned) logos plus their captions fit without colliding with the grey `ORDER ACCEPTANCE` bar below.

No changes to MR header, table layout, footer, T&C page, defaults, or any other file.

## Files to edit

- `src/lib/orders/pdf.ts` — adjust `loadLogo` to also expose natural dimensions, add `fitInBox`, rewrite the two `addImage` calls in `drawHeader` and re-anchor the caption text.
