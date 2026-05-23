
# MR PI — Fix Review & Export row order only

## Problem

In the MR PI editor's Review & Export panel, `OrderPreview` is given `charges: { ...pi.charges, discount_percent: 0 }`. With `discount_percent = 0`, `showDiscount` is false, so the native totals section renders `Basic Total → P&F → Insurance → Subtotal → GST` and then appends the `extraTotalsRows` (which carry Discount + After Discount + Grand Total + Advance + Net Payable). Result: discount rows appear *after* GST and a duplicate Grand Total shows up.

Download PDF and the editor's top breakdown are already correct and must stay untouched.

## Scope

- **Only** `src/pages/pi/PiEditor.tsx` (the `<OrderPreview …>` props for MR PI).
- No changes to `OrderPreview` component, `pdf.ts`, `excel.ts`, `calcPiTotals`, GMS PI, OA, BOQ, or any other module.

## Change

In `PiEditor.tsx`, the `<OrderPreview>` props (around lines 1217–1278), branch on `pi.format === "MR"`:

1. **Charges prop (MR only):** pass discount through so the native totals path renders it in correct order:
   - `apply_discount: !!pi.apply_discount && totals.one_time_discount_amount > 0`
   - `discount_percent: pi.one_time_discount_percent`
   - `discount_label: "Discount on Basic Total"`
   - Leave every other `pi.charges` field untouched.

   GMS PI keeps the existing `{ ...pi.charges, discount_percent: 0 }` behavior.

2. **extraTotalsRows (MR only):** drop the discount / after-discount entries (now rendered natively). Keep the existing block for advance:
   - When `totals.advance_adjustment_amount > 0`, push `Grand Total` → `Advance Adjustment …` → `Net Payable` (unchanged).
   - Keep `Other Charges` entry as today.

3. **hideDefaultGrandTotal (MR only):** add `hideDefaultGrandTotal: true` to `docMeta` when the MR `extraTotalsRows` already include a Grand Total row (i.e. when advance > 0), to avoid a duplicate trailing Grand Total. When there is no advance, leave it false so the native Grand Total renders after GST.

Net result for MR PI Review & Export, matching Download / top display:

```
Sub Total
Discount on Basic Total
After Discount Amount
P&F
Insurance
GST
Grand Total
Advance Adjustment
Net Payable
```

The "After Discount" label rendered by `OrderPreview` currently reads `After Discount` (not `After Discount Amount`). The user explicitly only requires the *order* to match — Download PDF already renders `After Discount Amount` — but the Review panel will say `After Discount`. If they want the label tweak too, that's a one-line follow-up; not changing `OrderPreview` keeps this fix scoped to the editor file only.

## Verification

MR PI with `1 × ₹15,000`, Discount 10%, P&F 1.5%, Insurance 0.071%, GST 18%, Advance 10%:
- Review & Export shows: Sub Total ₹15,000 → Discount on Basic Total ₹1,500 → After Discount ₹13,500 → P&F (on 13,500) → Insurance (on 13,500) → GST 18% → Grand Total → Advance Adjustment @10% → Net Payable. No duplicate Grand Total.
- Top calculation display: unchanged.
- Download PDF: unchanged.
- GMS PI Review & Export: unchanged.
- OA / BOQ: unchanged.
