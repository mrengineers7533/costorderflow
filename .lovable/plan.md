## Move "Landed Price" conversion next to Charges & Totals

Currently the Landed Price panel sits at the very top of the OA editor right under the `CurrencyToolbar` (lines ~714–767 of `src/pages/orders/OrderEditor.tsx`). The user wants it relocated inside the **Charges & Totals** card (CardHeader at line 892), since it conceptually belongs with the final total/landed calculation.

### Change scope (single file)

`src/pages/orders/OrderEditor.tsx`

1. **Top toolbar block (line 714–767):**
   - Keep the `CurrencyToolbar` (INR → USD / USD → INR) exactly as today — it stays at the top, gated by `format === "GMS" && charges.gms_mode === "EXW_MURTHAL"`.
   - Remove the inner `Landed Price` panel (the `<div>` containing the helper text, "Current USD = ₹" input, and "Convert USD → INR (Landed Price)" button) from this block.

2. **Charges & Totals card (CardContent under the header at line 892):**
   - Insert the same Landed Price panel as the first row inside that card's `CardContent`, wrapped in the same `format === "GMS" && charges.gms_mode === "EXW_MURTHAL"` guard so it only renders for EXW Murthal. For every other GMS mode / MR format, the panel is not rendered at all (cleaner than disabling).
   - Reuse the existing `landedRate` state, `setLandedRate` setter, and the existing button click handler verbatim — no logic changes:
     - Validates `currencyMode === "USD"` (toast otherwise)
     - Validates `landedRate > 0` (toast otherwise)
     - Calls `applyCurrencyConversion("INR", landedRate)` then `setExchangeRate(landedRate)` and shows the success toast.
   - Keep the helper copy ("Re-price items from USD to INR using the current dollar rate. Basic Total USD stays intact until you click.") so the user has the same context.

### Out of scope / unchanged

- `CurrencyToolbar` behaviour, INR→USD / USD→INR item conversion, and `applyCurrencyConversion`.
- `Charges` schema, `calcTotals`, GST/tax math, OA/PI flow, PDF/Preview rendering, persisted data.
- Any other card, format, or `gms_mode` branch.
- No new state or props are introduced.

### Acceptance

- For GMS + EXW Murthal: the top area shows only the INR↔USD toolbar; the Landed Price input + button now appears at the top of the **Charges & Totals** card.
- For any non-EXW-Murthal selection: the Landed Price panel is not visible anywhere.
- Clicking "Convert USD → INR (Landed Price)" still re-prices items at the entered current USD rate exactly as before; Basic Total USD is preserved until the click.
- All other features, totals, and PDFs render identically.
