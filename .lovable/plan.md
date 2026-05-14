## Goal

Add a non-invasive currency conversion feature on the OA and PI editor pages so users can flip all rate/amount values between INR and USD using a user-entered exchange rate. The chosen currency persists with the record and carries from OA → PI. No existing calculations, validations, layouts, totals, PDF, Excel, or workflow rules change.

## Scope (what changes)

- OA editor page (`src/pages/orders/OrderEditor.tsx`) — new toolbar block.
- PI editor page (`src/pages/pi/PiEditor.tsx`) — new toolbar block.
- OA → PI conversion (`src/lib/pi/convert.ts`) — carry currency state forward.
- DB: store currency state on `orders` and `proforma_invoices`.

Out of scope (explicitly unchanged):
- All existing calc functions in `src/lib/orders/calc.ts` and `src/lib/pi/calc.ts`.
- Print/PDF/Excel renderers (they already display the stored numbers; once values are converted the same renderer just shows USD numbers — but no template, layout, formula, GST, P&F, advance, discount, or label logic changes).
- Existing GMS Turkey/CIF/Murthal `display_currency`, `turkey_pu_dollar_rate`, `cif_pu_dollar_rate`, `fx_rate` fields — left untouched. The new feature is a separate top-level toggle that converts the underlying stored numbers.
- Permissions, RLS, OA numbering, revision flow.

## UI

A small block added near the top of OA and PI editors:

```text
Currency: [INR ▾]   1 USD = [ 83.50 ] INR
[ Convert INR → USD ]   [ Convert USD → INR ]
```

- A read-only `Currency` chip showing the current state (INR or USD).
- An exchange rate input (number, default 83). User can edit before clicking convert.
- Two buttons. Behaviour:
  - `Convert INR → USD`: if state is already USD → toast "Amount is already in Dollar." and do nothing. Else divide every rate/amount by rate, set state = USD.
  - `Convert USD → INR`: mirror; toast "Amount is already in INR." if already INR.
- A small "$" / "₹" symbol is shown next to rate/amount inputs in the editor by reading the currency state. (No layout reflow — symbol replaces the existing prefix.)

## Conversion logic

A pure helper `src/lib/currency/convert.ts` exporting:

```ts
export type CurrencyMode = "INR" | "USD";
export function convertOrderCurrency(order, from, to, rate) { … }
export function convertPiCurrency(pi, from, to, rate) { … }
```

For each line item: `unit_rate` and `amount` are divided/multiplied by `rate`.
For charges: every numeric ₹ field that represents a money amount is converted — `pf_amount`, `insurance`, `freight`, `discount`, `gst_amount`, `turkey_*` flat amounts, `murthal_*` flat amounts, `mr_advance_amount`, `cif_sea_freight_usd` (left as-is, it's already USD), `other_charges` (PI), `advance_amount` (PI), `discount_value` when `discount_mode==="amount"`.
Percent fields, mode flags, booleans, and labels are left untouched.
Totals are recomputed by re-running the existing `recalc(...)` / PI calc on the converted values, so totals stay consistent without duplicating math.

Re-conversion guard: state machine of `currency_mode`. Buttons no-op + toast when already in the requested mode. The exchange rate used for the last conversion is also persisted so a subsequent reverse-convert uses the user-visible rate.

## Persistence

New columns (nullable, default `'INR'`):

- `orders.currency_mode text` — `'INR' | 'USD'`
- `orders.exchange_rate numeric` — last rate used (₹ per $)
- `proforma_invoices.currency_mode text`
- `proforma_invoices.exchange_rate numeric`

Both default to `'INR'` / `null` so all existing rows behave identically. On save, the editor writes the current state alongside the existing payload.

## OA → PI carry-forward

In `src/lib/pi/convert.ts` (`orderToPi(...)`), copy `currency_mode` and `exchange_rate` from the source OA into the new PI draft. Line items and charges are already cloned from the OA, so if the OA was already in USD the PI naturally opens in USD with matching numbers. No re-conversion happens automatically.

## Edge cases

- Exchange rate `<= 0`, blank, or NaN → block conversion with a toast "Enter a valid exchange rate".
- Fractional rounding: store full precision, display rounded as today.
- Reopening / refresh: editor reads `currency_mode` + `exchange_rate` from the record on load; symbol and toolbar reflect saved state.
- Print preview / PDF: render numbers as stored; only the currency symbol comes from `currency_mode`. (Existing GMS Turkey / CIF dollar rendering remains driven by their own fields and is not affected.)

## Files touched

- New: `src/lib/currency/convert.ts`
- New: `src/components/common/CurrencyToolbar.tsx` (the toolbar + buttons)
- Edit: `src/pages/orders/OrderEditor.tsx` — mount toolbar, pass state, persist on save, show symbol on item rows.
- Edit: `src/pages/pi/PiEditor.tsx` — same.
- Edit: `src/lib/pi/convert.ts` — propagate `currency_mode` + `exchange_rate`.
- Migration: add columns to `orders` and `proforma_invoices`.

## Acceptance check

1. OA editor shows the toolbar; INR↔USD buttons convert all visible rates/amounts; totals update via existing recalc.
2. PI editor shows the same toolbar and works independently.
3. Saving and reopening preserves the currency state and converted values.
4. Creating a PI from a USD-mode OA opens the PI in USD with matching numbers.
5. Re-clicking the same direction shows the "already in X" toast and does not double-convert.
6. All other OA/PI features (GMS Turkey display toggle, CIF PU rate, GST, advance, discount, revisions, PDF/Excel, validations) behave exactly as before for INR-mode records.
