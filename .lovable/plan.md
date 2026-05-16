## Goal

Make the **Legacy (use simple PI charges above)** GMS Pricing Mode behave identically to **EXW Murthal (full landed cost)** in both OA and PI — same charges UI, same calculation, same preview/PDF rendering. EXW Turkey, EXW CIF Port, MR, and all non‑GMS flows are untouched.

## Approach

The calculation, preview, PDF, Excel, convert‑to‑PI, and revision layers already gate Murthal logic on `(charges.gms_mode === "EXW_MURTHAL" || charges.ex_murthal_enabled)`. So the entire change reduces to:

1. When the user picks Legacy in the GMS Pricing Mode dropdown, automatically set `ex_murthal_enabled: true` (with the same sensible defaults the Murthal path uses).
2. Render the EXW Murthal charges UI for Legacy mode the same way it renders for `EXW_MURTHAL`.

No changes to `calc.ts`, `pdf.ts`, `OrderPreview.tsx`, `convert.ts`, `excel.ts`, or `revisions/index.ts` — those already handle the dual condition.

## Files to edit

### `src/pages/pi/PiEditor.tsx`

- **GMS Pricing Mode `onValueChange` (≈ line 580):** when `mode === undefined` (Legacy / "NONE"), set `ex_murthal_enabled: true` instead of preserving the previous value, and seed Murthal defaults (`custom_percent ?? 8.25`, `clearing_percent ?? 1.5`, `landed_gst_percent ?? 18`, `murthal_pf_percent ?? 1.5`, `murthal_pf_mode ?? "percent"`, `murthal_advance_mode ?? "percent"`). When switching to Turkey / CIF, keep the existing reset to `false`.
- **EXW Murthal Charges section (≈ line 828):** change the gate from `pi.charges.gms_mode === "EXW_MURTHAL"` to `pi.charges.gms_mode === "EXW_MURTHAL" || (!pi.charges.gms_mode && pi.charges.ex_murthal_enabled)`. Same JSX, same fields, no duplication.
- **CurrencyToolbar visibility (PI side):** extend the existing `gms_mode === "EXW_MURTHAL"` condition to also accept Legacy with `ex_murthal_enabled`, so the "Amount in INR" / PU Dollar Rate UX is identical.

### `src/pages/orders/OrderEditor.tsx`

- **GMS Pricing Mode `onValueChange` (≈ line 1000):** mirror the PI change — when `mode === undefined`, set `ex_murthal_enabled: true` and seed the same Murthal defaults.
- **CurrencyToolbar gate (line 714) and "Amount in INR" panel gate (line 857):** change `charges.gms_mode === "EXW_MURTHAL"` to `charges.gms_mode === "EXW_MURTHAL" || (!charges.gms_mode && charges.ex_murthal_enabled)`.
- **Existing "Ex-works Murthal (Landed Cost)" block (lines 1290–1530):** keep as-is. It already renders for Legacy when `ex_murthal_enabled` is true; the Pricing-Mode change will flip that on automatically for new Legacy selections. The manual switch stays so legacy OAs in the wild can still be toggled.

## Out of scope (do not touch)

- `src/lib/orders/calc.ts`, `pdf.ts`, `OrderPreview.tsx`, `pi/convert.ts`, `pi/excel.ts`, `revisions/index.ts`, `clientCopyExcel.ts` — already correct.
- EXW Turkey, EXW CIF Port, MR format, GST rules, OA→PI flow, DB schema, saved Murthal data, layout/design.

## Verification

- In PI editor: select **Legacy** → the full EXW Murthal Charges card (Amount in INR, Sea Freight, Custom, Clearing, Discount on Landed, Insurance, P&F, Local Freight, GST, One‑time Discount, Advance Adjustment) appears, identical to what EXW Murthal shows. Editing values updates totals/preview/PDF the same way.
- In OA editor: same behavior — selecting Legacy auto‑enables the Murthal panel and the Amount‑in‑INR/PU‑Dollar‑Rate toolbar.
- Selecting EXW Turkey, EXW CIF Port, or staying on MR shows no change vs. today.
