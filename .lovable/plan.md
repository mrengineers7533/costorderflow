## Goal

In the BOQ PDF/print flow only, make the **Approved by Design** column hidden by default, with a user-toggleable checkbox whose choice is remembered locally. No changes to OA, PI, BOQ on-screen editor table, calculations, totals, or any other column.

## Scope

Affected only:
- BOQ PDF generator (`src/lib/boq/pdf.ts`)
- BOQ print preview component inside the editor (`BoqDocPreview` in `src/pages/boqs/BoqEditor.tsx`)
- BOQ list downloads (`src/pages/boqs/BoqList.tsx`)
- Final/public BOQ download page (`src/pages/boqs/FinalBoq.tsx`)
- BOQ distribution PDF wrapper (`src/lib/boq/pdfDistribution.ts`) — pass-through only

Not touched: OA flow, PI flow, BOQ on-screen item grid, calculations, GST/totals, Make column behavior, other PDFs.

## Changes

1. **`src/lib/boq/pdf.ts`**
   - Extend `BoqPdfOptions` with `showApproval?: boolean` (default `false`).
   - When `showApproval` is `false`: do not add the "Approved by Design" header, do not append the approval cell to each row, and skip the `didParseCell` color rule for that column. Column widths for the other columns stay unchanged (the existing `"auto"` Description width absorbs the freed space; this matches how the Make column toggle already works).
   - When `true`: identical to today's output (byte-equivalent).

2. **`src/pages/boqs/BoqEditor.tsx`**
   - Add `const [showApproval, setShowApproval] = useColumnToggle("boq.pdf.approval", false);` (separate localStorage key, default hidden).
   - Add a small toolbar checkbox/button next to the existing "Show/Hide Make column" control, labelled "Show 'Approved by Design' in PDF". Visual style matches the existing toggle.
   - Pass `showApproval` into `generateBoqPDF(..., { showMake, showApproval })` for both download and print actions.
   - Pass `showApproval` into `<BoqDocPreview rec={...} showMake={showMake} showApproval={showApproval} />`.
   - Update `BoqDocPreview` signature and rendering: when `showApproval` is false, omit the "Approved by Design" header cell, the per-row approval cell, and adjust the `colSpan` for the empty-state row. The on-screen editor item grid above is **not** modified.

3. **`src/pages/boqs/BoqList.tsx` & `src/pages/boqs/FinalBoq.tsx`**
   - When invoking `generateBoqPDF(b)` for downloads, read the saved preference from localStorage (`window.localStorage.getItem("boq.pdf.approval") === "1"`) and pass `{ showApproval }`. Default remains hidden when nothing is stored. Keeps the single source of truth so the toggle works wherever the user downloads.

4. **`src/lib/boq/pdfDistribution.ts`**
   - Accept and forward `showApproval` in its options to `generateBoqPDF`. Callers that don't pass it get the default (hidden).

## Persistence

- Reuse the existing `useColumnToggle` hook with key `"boq.pdf.approval"` and default `false`. This satisfies "save the user's last choice locally" and ensures the default state is hidden.

## Verification

- Open a BOQ → PDF preview/download → "Approved by Design" column absent.
- Toggle "Show 'Approved by Design' in PDF" → preview and downloaded PDF show the column with the existing colored status text.
- Refresh the page → toggle state is restored.
- Download from BOQ list and Final BOQ page → respects the saved preference.
- BOQ on-screen item editor grid, OA, PI, BOQ totals, GST: all unchanged.
