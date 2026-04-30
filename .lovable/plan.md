# Fix: Grand Total = Subtotal + GST

## The Bug

In the live preview, totals show:
- Subtotal: ₹1,35,25,238.99
- GST (18%): ₹24,34,543.02
- **Grand Total: ₹1,35,25,238.99**  ← wrong, GST not added
- Net Payable: ₹1,35,25,238.99

Expected Grand Total: **₹1,59,59,782.01** (Subtotal + GST).

## Root Cause

In `src/lib/orders/calc.ts` (line 17), `calcTotals` computes GST as:

```ts
const gst = charges.gst_amount ?? (subtotal * (charges.gst_percent || 0)) / 100;
```

`charges.gst_amount` defaults to `0` (not `undefined`), and the nullish-coalescing `??` only falls back when the value is `null`/`undefined`. So `gst` becomes `0`, which makes `grand_total` and `net_payable` equal to `subtotal` — even though `gst_percent` is 18.

The `OrderPreview` component independently recomputes a display-only `gstAmount` from `gst_percent`, which is why the GST row shows the correct ₹24,34,543 — but the Grand Total / Net Payable values come from `calcTotals` and stay wrong.

## Fix

Change the GST resolution in `calcTotals` so a stored amount is only used when `gst_percent` is not provided (or both are zero, gracefully fall back). Concretely: prefer the percentage when present, otherwise use `gst_amount`.

```ts
const gstFromPercent = (subtotal * (charges.gst_percent || 0)) / 100;
const gst = charges.gst_percent
  ? gstFromPercent
  : (charges.gst_amount || 0);
```

This makes:
- `subtotal` = basic + P&F + insurance + freight
- `grand_total` = subtotal + gst
- `net_payable` = grand_total − discount

Result with the screenshot's data: Grand Total and Net Payable both become ₹1,59,59,782.01 (minus any discount).

## Files to Edit

- `src/lib/orders/calc.ts` — fix the `gst` line in `calcTotals`

No UI changes needed; `OrderPreview` already renders `p.totals.net_payable` for the Grand Total row, so it will reflect the corrected number automatically. The same fix also corrects the generated PDF totals (which use the same `calcTotals`).
