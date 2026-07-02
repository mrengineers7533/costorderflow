# Remove trailing `.00` from amounts (OA + PI, Live Preview + PDF)

## Goal
Display amounts like `1,88,59,552` instead of `1,88,59,552.00` when the fractional part is zero. Keep 2-decimal display for amounts with real decimals (e.g. `1,234.50` stays). Indian grouping (en-IN) remains for INR; US grouping remains for USD. No calculation, DB, or logic changes — display only.

## Scope
Both OA and PI PDF exports render the shared `OrderPreview` component, so a single formatting change flows through Live Preview and PDF for both.

Applies to:
- Item Amount cells
- Basic Total, P&F, Insurance, Freight, Discount
- Subtotal, GST, Grand Total / Net Payable
- CIF panel amounts, INR/Advance panels, Ex-works/EXW FX lines
- All numeric cells rendered via the shared `NumCell` in `OrderPreview.tsx`

Out of scope (unchanged):
- `amount_in_words` text (already integer words)
- Rate/Unit-Rate columns (rates typically have real decimals; keep 2-dp for consistency — matches current behavior)
- List-page currency badges (`OrdersList`, `PiList`, `GlobalSearch`) — not part of preview/PDF
- Any calculation, GST/P&F/Insurance/discount formula, saved data, numbering, approvals, workflow

## Implementation

1. Add a shared display helper `fmtMoney(n, locale)` in a small util (e.g. extend `src/lib/utils.ts`):
   - Format with `toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })` first (preserves current rounding), then strip a trailing `.00` suffix only.
   - This keeps Indian/US grouping intact and only removes `.00` — never `.50`, `.25`, etc.

   ```ts
   export function fmtMoney(n: number, locale: "en-IN" | "en-US" = "en-IN") {
     const s = (Number(n) || 0).toLocaleString(locale, {
       minimumFractionDigits: 2, maximumFractionDigits: 2,
     });
     return s.endsWith(".00") ? s.slice(0, -3) : s;
   }
   ```

2. Update `src/components/orders/OrderPreview.tsx` to replace the inline `toLocaleString(..., { minimumFractionDigits: 2, maximumFractionDigits: 2 })` calls used for amount fields with `fmtMoney(value, locale)`:
   - `fmtINR`, `fmtUSD`, `fmtCIF`, `fmtItem` helpers at top of file
   - CIF panel rows (basic/sea/grand)
   - USD/INR/Advance panel rows
   - `NumCell` default formatter
   - Ex-works / EXW Turkey / EXW Murthal FX display lines
   - Keep rate cell formatting (rates) as-is so rate decimals stay visible

3. No changes to:
   - `previewPdf.ts` / `previewExport.tsx` (PDF still captures the same preview DOM)
   - Any calc file (`lib/orders/calc.ts`, `lib/pi/calc.ts`)
   - Legacy `lib/orders/pdf.ts` (unused for preview-based export path; leave untouched)

## Verification
- OA Review & Export: item amounts, totals, taxes show without `.00` when integer; `.50` etc. still shown.
- Download OA PDF: matches Live Preview.
- Same checks on PI Review & Export + PDF.
- 5-, 6-, and 7-column layouts unaffected (formatting change only).
