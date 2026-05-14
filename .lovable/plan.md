## EXW MURTHAL — USD up to Landed Price, then "Amount in INR @ rate"

Apply only when `format === "GMS"` and `charges.gms_mode === "EXW_MURTHAL"`. Mirror the change in **GMS OA** (`OrderEditor`) and **GMS PI** (`PiEditor`), plus Preview and PDF. No other format/mode is touched.

### New mental model

```
Items (USD)            ← entered/converted via PU Dollar Rate (₹ per $)
  ↓
Basic Total (USD)
  + Sea Freight / Custom / Clearing (USD)   ← stay in USD
  ↓
Landed Price (USD)
─────────────────────────────────────────────
Amount in INR @ <landedRate>   ← Landed Price USD × landedRate
  + P&F, Local Insurance, Freight, GST, Discount, Advance  (INR)
  ↓
Grand Total / Net Payable (INR)
```

`landedRate` (the new "Amount in INR" rate) is **separate** from the PU Dollar Rate (`exchange_rate`/`fx_rate`). Editing it must only update the "Amount in INR" row and everything below — never touch item rates, basic totals, or USD charges.

### Schema

`src/lib/orders/types.ts` — add to `Charges`:
- `murthal_landed_inr_rate?: number` — INR per 1 USD used for the "Amount in INR @ rate" row. Default 0 (row hidden until user enters one).

Persisted on the existing `charges` JSON column — no migration needed.

### Calc — `src/lib/orders/calc.ts` `calcExMurthal`

Add an optional second arg or read `c.murthal_landed_inr_rate`. New behaviour, gated on `landedRate > 0`:

1. Compute `landed` exactly as today, but treat the input `basicInInr` as **USD** when the caller is in USD mode (the editor passes the USD basic total — math is identical, just unit-agnostic).
2. `amount_in_inr = netLanded * landedRate`.
3. Compute Insurance, P&F, Freight, GST, one-time Discount, Advance on `amount_in_inr` (and downstream values) **instead of** `netLanded`.
4. Extend `ExMurthalBreakdown` with:
   - `landed_inr_rate: number`
   - `amount_in_inr: number`
   - All charges below are in INR (already are; semantics unchanged).
5. When `landedRate <= 0`, behaviour is unchanged (back-compat for any existing saved data).

### OA editor — `src/pages/orders/OrderEditor.tsx`

1. **Remove the duplicate INR↔USD toolbar.** Keep exactly one `CurrencyToolbar` at the top of the OA editor, gated by EXW Murthal. Remove the second occurrence so the user only sees one INR → USD / USD → INR control.
2. Re-label the rate input shown next to the toolbar to **"PU Dollar Rate (₹ per $)"** for EXW Murthal only (label change only — wires to existing `exchangeRate`).
3. The Landed Price panel inside Charges & Totals card stays where the previous task put it, but is **repurposed**:
   - Rename the input label to **"Amount in INR Rate (₹ per $)"** and the button to **"Calculate Amount in INR"**.
   - Bind the input to `charges.murthal_landed_inr_rate` (replacing the local-only `landedRate` state).
   - Click handler now only `setCharges({ ...charges, murthal_landed_inr_rate: <value> })`. It does **not** call `applyCurrencyConversion` or touch items/exchange_rate.
   - Helper text: "Converts Landed Price (USD) into INR. P&F, Insurance, GST, etc. calculate on this INR value. Does not change PU Dollar Rate."
   - Disabled (with toast) unless `currencyMode === "USD"`.
4. The Charges & Totals breakdown rows render with the right symbol:
   - Up to Landed Price → `$`
   - "Amount in INR @ <rate>" row inserted right after Landed Price (only when `murthal_landed_inr_rate > 0`)
   - From there down (P&F, Insurance, Freight, GST, Discount, Advance, Grand Total, Net Payable) → `₹`

### PI editor — `src/pages/pi/PiEditor.tsx`

Same three changes as OA: single INR↔USD toolbar, repurposed Landed-Price-INR panel bound to `charges.murthal_landed_inr_rate`, and breakdown that switches symbol after the Amount in INR row. PI's discount/advance overrides continue to work — they apply on INR values (after the conversion row), which matches the existing semantics.

### Preview — `src/components/orders/OrderPreview.tsx`

In the `MurthalBlock` (around line 620–660), when `c.murthal_landed_inr_rate > 0`:
- Render `Landed Price` and any `Net Landed Price` rows with `$`.
- Insert a new bold row: `Amount in INR @ ${rate}` showing `m.amount_in_inr` with `₹`.
- Render P&F / Insurance / Freight / GST / Discount / Advance / Grand Total / Net Payable with `₹`.

`AMOUNT (IN WORDS)` for EXW Murthal now keys off whether `amount_in_inr` is active:
- If `landedRate > 0` → words in INR (`amountInWords(...).replace(/^INR\s*/i, "RS. ")`)
- Else fall back to existing USD/INR branches.

### PDF — `src/lib/orders/pdf.ts` (EXW Murthal branch ~line 695)

Mirror the preview row order and symbols. Insert "Amount in INR @ <rate>" row right after `Net Landed Price` (or `Landed Price` when no landed discount) when `murthal_landed_inr_rate > 0`. Use `₹` for everything below it; `$` for everything at and above it. Update the AMOUNT IN WORDS line accordingly (INR words when landed-INR rate is active).

### Out of scope (do NOT change)

- All non-EXW-Murthal formats and gms_modes (Turkey, CIF Port, MR, etc.).
- `CurrencyToolbar` component itself.
- `convertItems` / `convertCharges` semantics.
- GST math, OA→PI flow, PI calc beyond reading the new `amount_in_inr`, saved DB rows, layout/design system, column visibility, revisions logic.
- Any other card on the page.

### Acceptance

- For GMS + EXW Murthal: only one INR↔USD toolbar visible. After clicking INR→USD, items / Basic / Sea Freight / Custom / Clearing / Landed Price all show with `$`.
- Entering a value in **Amount in INR Rate** and clicking the button inserts an "Amount in INR @ <rate>" row in INR right after Landed Price; P&F, Insurance, GST, Grand Total, Net Payable all recompute in INR on that value. PU Dollar Rate is unchanged.
- Changing only the Amount-in-INR rate updates the INR row + downstream totals; items and Basic stay in USD.
- Preview and PDF mirror the editor exactly. Amount-in-words follows the final Net Payable currency (INR when the conversion row is active, USD otherwise).
- Any other format/mode renders identically to today.

### Files touched

- `src/lib/orders/types.ts`
- `src/lib/orders/calc.ts`
- `src/pages/orders/OrderEditor.tsx`
- `src/pages/pi/PiEditor.tsx`
- `src/components/orders/OrderPreview.tsx`
- `src/lib/orders/pdf.ts`
- `.lovable/plan.md` (replace with this plan)
