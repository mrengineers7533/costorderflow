# MR PI — Discount on Basic Total

Scope: **MR-format PI only**. GMS PI (Turkey / Murthal / CIF Port), OA, BOQ, and all other modules stay exactly as today.

## Why

`calcPiTotals` already discounts on Basic Total and computes P&F / Insurance / GST on the after-discount value (via `one_time_discount_percent`). The MR PI page is currently exposing a *second*, gross-level discount (`discount_mode`/`discount_value`) labeled "Discount (deducted at the end) % of Gross" — that is the field producing the wrong `Discount @ 50000%` row. We simply need to point the MR PI's right-side discount input at the basic-level discount and tidy up the labels.

## Changes

### 1. `src/pages/pi/PiEditor.tsx` — MR PI only

- Replace the right-hand **Discount** card field (currently bound to `discount_mode` / `discount_value`) **when `pi.format === "MR"`** with:
  - Label: **"Discount on Basic Total"** (no "deducted at the end" hint).
  - Mode toggle kept: `%` (of Basic Total) and `₹ Amount`.
  - Writes to `one_time_discount_percent` and `apply_discount`:
    - `%` mode → `one_time_discount_percent = value`, `apply_discount = value > 0`.
    - `₹` mode → `one_time_discount_percent = basic > 0 ? (amount / basic) * 100 : 0`, `apply_discount = amount > 0`.
  - Force `discount_value = 0`, `discount_mode = "percent"` on MR so the gross-level PI discount stays out of the calc.
- GMS PI keeps the existing gross-level discount UI unchanged.
- Breakdown rows for MR (the non-GMS branch already covers this) just need the label tweak:
  - `Basic Total` → discount row (using `discount_label` or default "Discount on Basic Total") → **`After Discount Amount`** (rename from "After Discount") → `P&F` → `Insurance` → `GST @ x%` → `Grand Total` → (`Advance Adjustment` if any) → `Net Payable`.
- Since MR no longer uses `piDiscountAmt`, the trailing "Discount @ x%" row below Grand Total will naturally not render for MR (value is 0).

### 2. `src/lib/pi/pdf.ts` — MR only

- For `pi.format === "MR"`, when `showDiscount` is true, use labels:
  - Discount row: `"Discount on Basic Total"` (overrides `discount_label` default for MR).
  - After-discount row: `"After Discount Amount"`.
- Existing row order already matches the required print order (Basic → Discount → After Discount → P&F → Insurance → GST → Grand Total → Advance → Net Payable) via `generateOrderPDF` + `extraTotalsRows`.
- GMS/CIF branches untouched.

### 3. `src/lib/pi/excel.ts` — MR only

- In the MR/generic chain (the `else` branch), when discount applies and `pi.format === "MR"`, push:
  - `["Discount on Basic Total", fmt(tt.one_time_discount_amount)]`
  - `["After Discount Amount", fmt(tt.basic_after_discount)]`
- All other formats and rows unchanged.

## Out of scope

- `calcPiTotals` math, GMS modes, OA, BOQ, advance-adjustment behavior, currency conversion, `OrderPreview`, DB schema/migrations, save payload shape (uses existing fields), other PDF/Excel paths.

## Verification

On an MR PI:
1. Enter `10%` (or `₹1,500`) in the new "Discount on Basic Total" field. Editor breakdown shows: Basic Total ₹15,000 → Discount on Basic Total ₹1,500 → After Discount Amount ₹13,500 → P&F (on 13,500) → Insurance (on 13,500) → GST 18% (on after-discount + P&F + Insurance) → Grand Total → Advance Adjustment → Net Payable.
2. Download PDF and Excel — same rows in same order with the renamed labels.
3. Open a GMS PI — discount UI, math, PDF, Excel all unchanged.
