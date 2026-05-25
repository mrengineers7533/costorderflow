## Goal
GMS **EXW Murthal** Advance Adjustment % base:
- Change from `Grand Total − one-time-discount` → **Landed Price in INR** (= `net_landed` after Landed Discount, converted via `murthal_landed_inr_rate` when USD-to-Landed mode is active).
- "If discount applied → discounted Landed; else original Landed" is satisfied automatically because `net_landed = landed − landed_discount` (equals landed when no discount).

EXW Turkey advance, flat-₹ Murthal advance mode, Net Payable formula (`grand − one_time_discount − advance`), and all other modules unchanged.

## File to change

**`src/lib/orders/calc.ts`** — `calcExMurthal`, inside the Advance Adjustment block (~line 186):

```ts
if (c.murthal_advance_enabled) {
  if ((c.murthal_advance_mode || "percent") === "percent") {
    // OLD: advance = ((grand - discount) * (c.murthal_advance_percent || 0)) / 100;
    // NEW: base on Landed Price (INR) — already discount-aware via net_landed
    advance = (downstreamBase * (c.murthal_advance_percent || 0)) / 100;
  } else {
    advance = c.murthal_advance_amount || 0;
  }
}
```

`downstreamBase` is already defined just above as `inrMode ? usdLanded * landedInrRate : netLanded` — i.e. the INR Landed Price (post Landed Discount). Same value shown in the "Net Landed Price" / "Amount in INR @ rate" row.

## Why only one file

All GMS Murthal surfaces (`OrderEditor`, `OrderPreview`, `orders/pdf.ts`, `PiEditor`, `pi/pdf.ts`, `pi/excel.ts`, `pi/convert.ts`, `revisions/index.ts`) call `calcExMurthal()` and read `m.advance_amount`. Updating the function propagates to every surface.

EXW Turkey path (`calcExTurkey`) is untouched → existing Basic/Discounted-Basic rule preserved.

## Verification
- EXW Murthal, no landed discount, rate set: Advance % × `amount_in_inr` (Landed × rate). Net Payable = Grand − one_time_disc − Advance.
- EXW Murthal, landed discount applied: Advance % × `net_landed` (or its INR equivalent).
- EXW Murthal, flat ₹ advance mode: unchanged.
- EXW Turkey OA + PI: unchanged.
- Non-Murthal MR flows: unaffected.
