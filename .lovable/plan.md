## Goal
When a cost sheet (uploaded or manually filled) contains items from **both makes** (MR Engg + GMS / Ugur), the system should:
1. Auto-tag each item's `make` (already partially in place via AI extractor + `inferItemMake`).
2. Keep a **single OA record** holding all items.
3. At download time, generate **two separate PDFs** — one with only MR items (using MR template) and one with only GMS items (using GMS template) — and trigger both downloads automatically.
4. Manual entry: keep the inline `make` dropdown per row (current UX) — but make sure changing it instantly re-triggers split detection.

## Files to change

### 1. `src/lib/orders/calc.ts`
- Add helper `splitItemsByMake(items)` returning `{ mr: LineItem[], gms: LineItem[], other: LineItem[] }`. "OTHER" items stick with the dominant/selected format (default MR) so nothing is lost.

### 2. `src/pages/orders/OrderEditor.tsx`
- Replace `downloadPDF()` so it:
  - Detects splitMode (`hasMR && hasGMS`).
  - **Single-make case**: behave as today.
  - **Split case**: build **two `OrderRecord`s** — one filtered to MR items + MR template + MR terms/bank, one filtered to GMS items + GMS template + GMS terms. Recompute `totals` and `amount_in_words` per subset. Generate both PDFs sequentially and download both with filenames like `{OA}-MR.pdf` and `{OA}-GMS.pdf`.
  - Show a single toast: "Generated 2 PDFs (MR + GMS)".
- Update the existing **Format dropdown** label/help text to clarify it now only controls *which subset you're previewing on screen* — both PDFs are always produced on download when split is detected.
- Add a small **"Download both PDFs"** primary button next to the existing Download button when `splitMode` is true (the regular Download still produces both; this is just clearer signaling).
- Keep the `make` per-row dropdown unchanged (user's choice).

### 3. `src/components/orders/OrderPreview.tsx`
- Add a small banner inside the preview when `splitMode` is true: "This OA contains MR + GMS items — preview shows {format} only. Both PDFs will be downloaded together." (Replaces / supplements the current message in the editor so it's also visible in the preview area.)

### 4. `src/components/orders/CostSheetPicker.tsx` *(no change needed)* — extractor already returns `make` per item; `applyCostSheet` in `OrderEditor` already maps it.

## What stays the same
- DB schema (`orders` table) — single record per OA, unchanged.
- OA numbering — still one number per saved order.
- Templates table & per-format `field_map` — used as-is, one PDF picks MR template, the other GMS.
- Existing `splitMode` filtering for on-screen preview & charges totals.

## Out of scope
- Creating two separate `orders` rows (rejected by user).
- Changing the per-row Make UX to badges (rejected by user).

## Acceptance
- Upload a cost sheet with mixed MR + GMS items → preview shows current format's items, banner notes the split.
- Click Download → browser downloads two files: `{OA}-MR.pdf` (MR items only, MR template + terms/bank) and `{OA}-GMS.pdf` (GMS items only, GMS template + GMS terms).
- Single-make cost sheet → only one PDF downloads (current behavior preserved).
- Manually flipping a row's Make from MR→GMS instantly toggles the editor into split mode and a second PDF will be produced on next download.
