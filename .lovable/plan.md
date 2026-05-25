## Goal

Make Advance Adjustment % calculate on the **discounted applicable amount** (Net Landed Price) — falls back to original Landed Price when no Landed Discount is applied — across all three GMS pricing modes (OA + PI):

- **EXW Murthal** — ✅ already done in the previous turn (`downstreamBase` = INR Net Landed).
- **EXW CIF Port** — ✅ covered by the same `calcExMurthal` function (CIF flows through Murthal with `cif_pu_dollar_rate`). No additional change needed.
- **EXW Turkey** — ❌ still computes `advance = (grand - discount) × %`. **This is the only remaining change.**

Net Payable formula stays `Grand Total − one_time_discount − Advance` (unchanged). All MR flows, BOQ, and other modules untouched.

## File to change

**`src/lib/orders/calc.ts`** — `calcExTurkey`, the Advance Adjustment block (~line 304):

```ts
// 9. Advance Adjustment — base on Net Landed Price (discount-aware via netLanded).
let advance = 0;
if (c.turkey_advance_enabled) {
  if ((c.turkey_advance_mode || "percent") === "percent") {
    // OLD: advance = ((grand - discount) * (c.turkey_advance_percent || 0)) / 100;
    // NEW: base on Net Landed Price (= landed when no landed_discount).
    advance = (netLanded * (c.turkey_advance_percent || 0)) / 100;
  } else {
    advance = c.turkey_advance_amount || 0;
  }
}
```

`netLanded` is already defined in the function as `landed − turkey_landed_discount_amount` (equals `landed` when the landed discount toggle is off), so the "if discount applied → discounted; else original" rule is satisfied automatically.

## Why only one file

All GMS Turkey surfaces (`OrderEditor`, `OrderPreview`, `orders/pdf.ts`, `PiEditor`, `pi/pdf.ts`, `pi/excel.ts`, `pi/convert.ts`, `revisions/index.ts`) call `calcExTurkey()` and read `t.advance_amount`. Updating the function propagates to OA live, OA Review, OA PDF, PI live, PI PDF, PI Excel.

CIF Port shares `calcExMurthal()` (which already uses `downstreamBase`), so no separate edit needed.

## Verification

- EXW Turkey, no landed discount: Advance % × Landed Price. Net Payable = Grand − one-time-discount − Advance.
- EXW Turkey, landed discount applied: Advance % × Net Landed (post landed discount).
- EXW Turkey, flat ₹ advance mode: unchanged.
- EXW Murthal & CIF Port: already correct from previous change.
- MR OA/PI: unaffected.
