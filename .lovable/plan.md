## Add "EXW CIF Port" GMS pricing mode

Add a third GMS mode alongside the existing **Legacy**, **EXW Turkey**, and **EXW Murthal** options. It is a USD-only, ultra-simple pricing flow:

```
Grand Total (USD) = Basic Total (USD) + Sea Freight (USD)
```

No GST, no P&F, no insurance, no freight, no discount, no advance — none of the existing extras apply in this mode. Strictly GMS-only (OA editor, OA preview/PDF, PI editor, PI PDF, and "Client Copy GMS"). MR OA and Client Copy MR are untouched. Existing **Legacy / EXW Turkey / EXW Murthal** flows continue to work exactly as today.

### 1. Type change — `src/lib/orders/types.ts`

Extend the `gms_mode` union and add one new field:

```ts
gms_mode?: "EXW_TURKEY" | "EXW_MURTHAL" | "EXW_CIF_PORT";

/** EXW CIF Port (GMS only). USD-only flow.
 *  Calculation: Basic + Sea Freight = Grand Total. No taxes/extras.
 *  `cif_pu_dollar_rate` is the user-entered "PU Dollar Rate" used to
 *  convert the INR cost-sheet figures to USD for display/PDF. */
cif_sea_freight_usd?: number;     // entered directly in USD
cif_pu_dollar_rate?: number;      // 1 USD = X INR; converts INR item totals → USD
```

No DB migration needed — `charges` is a JSONB column.

### 2. OA editor — `src/pages/orders/OrderEditor.tsx`

- Add a fourth `<SelectItem value="EXW_CIF_PORT">EXW CIF Port (USD only)</SelectItem>` to the GMS Pricing Mode select (line ~803).
- When selected, render a small block (replacing the Turkey/Murthal blocks for this mode):
  - **PU Dollar Rate** number input → writes `charges.cif_pu_dollar_rate`.
  - **Sea Freight (USD)** number input → writes `charges.cif_sea_freight_usd`.
  - Read-only display: Basic Total (USD) = `basic_total_inr / pu_dollar_rate`, Grand Total (USD) = Basic + Sea Freight.
- Hide the existing Turkey / Murthal extras blocks when `gms_mode === "EXW_CIF_PORT"`.
- Keep all existing GMS/MR fields untouched for the other modes.

### 3. Live preview — `src/components/orders/OrderPreview.tsx`

Add a new conditional branch (alongside the Turkey & Murthal blocks):

```tsx
const isCifPort = p.format === "GMS" && p.charges.gms_mode === "EXW_CIF_PORT";
```

When true, render a USD-only items table + totals:
- Item unit price & amount columns labelled `UNIT PRICE (USD)` / `AMOUNT (USD)`.
- Each value = `inr / cif_pu_dollar_rate`, formatted with `$` symbol.
- Totals block shows only **Basic Total ($)**, **Sea Freight ($)**, **Grand Total ($)** — no GST/P&F/insurance/freight/discount rows.
- Suppress the Net Payable / advance line and the existing Turkey/Murthal totals tables.

### 4. PDF — `src/lib/orders/pdf.ts`

Add a parallel branch to the existing `gms_mode === "EXW_TURKEY"` / `EXW_MURTHAL` blocks (around line 540 / 561 / 601):
- Header columns switch to USD.
- Item rows print converted USD values using `cif_pu_dollar_rate`.
- Totals table prints only the three rows (Basic, Sea Freight, Grand Total) in `$`.
- Skip the Terms-style GST/P&F/etc rows entirely.
- "Amount in words" → USD words (e.g. "US Dollar Fifty Three Thousand Only") via existing words helper but with "US Dollar" prefix.

### 5. PI editor + PI PDF — `src/pages/pi/PiEditor.tsx`, `src/lib/pi/convert.ts`, `src/lib/pi/pdf.ts`

- Add the same `EXW_CIF_PORT` SelectItem and the same PU Dollar Rate + Sea Freight (USD) inputs in the GMS PI editor block.
- In `convert.ts`, when copying OA → PI, propagate `cif_pu_dollar_rate` and `cif_sea_freight_usd` and skip the Turkey/Murthal landed-cost overrides for this mode.
- In `pi/pdf.ts`, when `pi.charges.gms_mode === "EXW_CIF_PORT"`, suppress all `extraTotalsRows` (discount / advance / other charges) — the OA PDF branch above already prints the correct USD totals.
- PI totals (`calcPiTotals` / stored `totals`): set `basic_total = basic_inr`, `grand_total = (basic_inr / rate) + sea_usd` rendered for display only; underlying INR storage unchanged so existing reports still work.

### 6. Client Copy GMS

Client Copy GMS already reuses the GMS OA preview + PDF pipeline, so the changes in steps 3 and 4 automatically flow through. Verify the Client Copy editor doesn't strip the new mode (it currently passes `charges` through verbatim).

### 7. MR safety

- The new SelectItem only renders inside the existing `format === "GMS"` block, so MR editors and PDFs are untouched.
- `EXW_CIF_PORT` checks are always gated by `p.format === "GMS"`.

### 8. Acceptance check (manual)

After implementation, on `/orders/...`:
1. Switch GMS Pricing Mode → **EXW CIF Port**. PU Dollar Rate + Sea Freight (USD) inputs appear; Turkey/Murthal blocks hide.
2. Enter PU Dollar Rate `83`, Sea Freight `3000`. With cost-sheet basic ₹41,50,000 the preview shows Basic `$50,000`, Sea Freight `$3,000`, Grand Total `$53,000`.
3. PDF renders the same three USD rows, no GST/P&F.
4. Switch back to Legacy / EXW Turkey / EXW Murthal → totals revert exactly to current behaviour.
5. Open an MR OA → "EXW CIF Port" is **not** in the dropdown (MR doesn't show GMS mode at all).

### Files touched

- `src/lib/orders/types.ts` (type extension only)
- `src/pages/orders/OrderEditor.tsx`
- `src/components/orders/OrderPreview.tsx`
- `src/lib/orders/pdf.ts`
- `src/pages/pi/PiEditor.tsx`
- `src/lib/pi/convert.ts`
- `src/lib/pi/pdf.ts`

No DB migration. No changes to MR code paths. No changes to existing GMS Legacy / Turkey / Murthal logic.