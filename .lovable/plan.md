# Rebuild PI invoice calculation flow

Replace the current PI calculation (discount on Subtotal, advance % on Grand Total) with a clean invoice flow where **Discount applies only to Basic Amount** and **Advance is deducted at the very end**. Apply this across PI calc, editor UI, and the generated PDF.

## New calculation flow

```text
Basic Amount               (sum of line items)
(-) Discount Amount        (= Basic × Discount %)
= Basic After Discount

(+) P&F                    (% applied on Basic After Discount, or flat ₹)
(+) Insurance              (% applied on Basic After Discount, or flat ₹)
(+) Freight                (% applied on Basic After Discount, or flat ₹) — if enabled
(+) Other Charges          (flat ₹, new field)
= Taxable Value

(+) GST                    (= Taxable Value × GST %)
= Gross Invoice Total

(-) Advance Adjustment     (₹ flat OR % of Gross Invoice Total — user toggle)
= Net Payable
```

Rules:
- Discount % is applied **only** on Basic Amount, never on charges/taxes.
- All %-based charges (P&F, Insurance, Freight) recompute against **Basic After Discount**.
- Advance is **never** subtracted from Basic; only from the final Gross Invoice Total.

## Changes by file

**`src/lib/pi/types.ts`**
- Add to `PiRecord`:
  - `other_charges: number` (flat ₹, default 0)
  - `advance_mode: "amount" | "percent"` (default `"percent"` for back-compat)
  - `advance_amount: number` (₹, used when mode = amount)
  - Keep `advance_adjustment_percent` (used when mode = percent)
- Extend `PiTotals` with: `basic_after_discount`, `pf_amount`, `insurance_amount`, `freight_amount`, `other_charges_amount`, `taxable_value`, `gross_invoice_total`. Keep existing fields populated for back-compat (`subtotal` = taxable_value, `grand_total_pi` = gross_invoice_total, `net_payable_pi` = net payable).

**`src/lib/pi/calc.ts`**
- Rewrite `calcPiTotals` to follow the new flow above (do NOT call `calcTotals` from orders/calc; compute directly from `line_items` + `charges`).
- Signature becomes:
  ```ts
  calcPiTotals(items, charges, discountPct, advance: { mode: "amount" | "percent"; value: number })
  ```
- `%` charges resolved against `basic_after_discount`; flat ₹ charges pass through.
- GST base = `basic_after_discount + pf + insurance + freight + other_charges`.
- Advance amount = `value` (if mode=amount) or `gross × value/100` (if mode=percent), clamped to gross.

**`src/lib/pi/convert.ts`**
- Initialize new fields on new PIs and on revision clone (`other_charges: 0`, `advance_mode: "percent"`, `advance_amount: 0`).
- Update the `calcPiTotals` call sites to pass the new advance object.

**`src/pages/pi/PiEditor.tsx` — "PI adjustments" card**
- Inputs (grid):
  - Basic Amount (read-only, derived from line items)
  - Discount %
  - P&F (existing field; relabel hint "on Basic After Discount")
  - Insurance (existing)
  - Freight ₹ (existing)
  - Other Charges ₹ (new)
  - GST %
  - Advance: a small Tabs/Toggle — `₹ Amount` | `% of Gross` — plus the value input
- Breakdown rows shown below the inputs:
  ```
  Basic Amount               ₹ X
  (–) Discount @ d%          ₹ X
  Basic After Discount       ₹ X
  (+) P&F                    ₹ X
  (+) Insurance              ₹ X
  (+) Freight                ₹ X
  (+) Other Charges          ₹ X
  Taxable Value              ₹ X
  (+) GST @ g%               ₹ X
  Gross Invoice Total        ₹ X    (bold)
  (–) Advance Adjustment     ₹ X
  Net Payable                ₹ X    (bold, highlighted)
  ```
- Hide rows whose value is 0 (except Basic, Basic After Discount, Taxable, Gross, Net which are always shown).

**`src/lib/pi/pdf.ts`**
- Update `extraTotalsRows` to mirror the new breakdown order with the new labels (Discount on Basic, Other Charges, Gross Invoice Total, Advance Adjustment, Net Payable).
- Update label suffix from "(on Subtotal)" → "(on Basic Amount)" and "(on Grand Total)" → "(₹ flat)" / "(% of Gross)" depending on mode.

## Migration / back-compat

- The PI record is stored as JSON in Supabase; new fields default sensibly when missing (`other_charges = 0`, `advance_mode = "percent"`, `advance_amount = 0`), so existing draft/finalized PIs keep loading.
- Existing finalized PI totals stored on the row are not recomputed automatically — opening the PI re-derives totals via `calcPiTotals`, so the displayed totals will reflect the new flow. (User confirmed: "Replace existing PI calc".)
- No database migration required (all new fields live inside JSON).

## Out of scope

- OA (Order Acceptance) calculation in `src/lib/orders/calc.ts` is not touched. Only the PI/invoice flow changes.
- BOQ pricing is not affected.
