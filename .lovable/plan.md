## Problem

In the PDF, the GST row shows **0.00** even though `GST @ 18%` is selected, and the Grand Total ends up inconsistent with the Live Preview.

Comparing your two screenshots:

| Row | Live Preview | PDF |
|---|---|---|
| GST @ 18% | 35,90,006.68 | **0.00** ← wrong |
| Grand Total | 2,35,34,488.24 | 2,49,91,910.21 (silently includes GST) |

So the PDF is *internally* adding GST into the Grand Total but *displaying* the GST line as 0 — totals don't add up on the page.

## Root Cause

In `src/lib/orders/pdf.ts` (MR totals block), GST is computed as:

```ts
const gst = c.gst_amount ?? (taxable * (c.gst_percent || 0)) / 100;
```

`??` (nullish coalescing) only falls back when the value is `null` / `undefined`. Saved orders almost always have `gst_amount = 0` (the default field value), so this expression returns **0** instead of computing 18% of the taxable amount.

Meanwhile the Grand Total uses `t.net_payable` (precomputed by `calcTotals`, which does use the percent correctly), so the displayed GST row and the Grand Total disagree.

The Live Preview does it correctly:
```ts
const gstShown = (taxableShown * (p.charges.gst_percent || 0)) / 100;
```

A second, smaller inconsistency: in the no-discount path the PDF mixes `t.subtotal` / `t.net_payable` (from stored totals) with row-by-row recomputed values. If charges differ between MR/GMS sides, this can drift.

## Fix

In `src/lib/orders/pdf.ts`, MR totals section (around lines 246–256):

1. Compute GST the same way the Live Preview does — prefer the percent when `gst_percent > 0`, otherwise use `gst_amount`:
   ```ts
   const gst = (c.gst_percent || 0) > 0
     ? (taxable * c.gst_percent) / 100
     : (c.gst_amount || 0);
   ```
2. Compute the Grand Total directly from the rows shown (`taxable + gst - any one-time discount already handled above`) for both the discount and no-discount paths, so the printed rows always add up to the printed Grand Total.
3. Apply the same correction to the GMS PDF totals path if it uses the same pattern (will verify and patch in the same edit).

No data, schema, preview, or calc-library changes are required — only `src/lib/orders/pdf.ts`.

## Acceptance Check

After the fix, generating the PDF for the order in the screenshot should show:

- Basic Total: 1,96,36,000.00
- P&F @ 1.5%: 2,94,540.00
- Insurance @ 0.071%: 13,941.56
- Subtotal: 1,99,44,481.56
- **GST @ 18%: 35,90,006.68**
- **Grand Total: 2,35,34,488.24**

— identical to the Live Preview, and rows add up correctly.
