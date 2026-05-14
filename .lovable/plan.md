# Reflect converted currency in GMS OA & PI Preview/PDF

Scope: only the GMS format (OA + PI). MR format and existing PU-Dollar-Rate / EXW-Turkey behavior stay exactly as-is. No calculation, layout, or workflow changes.

## Problem
The toolbar already converts the underlying line-item rates / amounts and charges in state. But:
- The items table header in Preview and PDF is still hard-tied to the old PU-Dollar-Rate logic (`displayUSDItems` / `usdDisplay`), so it shows `UNIT PRICE (INR)` / `AMOUNT (INR)` even after a USD conversion.
- The "Amount in Words" line stays in INR / Rupees.

The new `currency_mode` (`"INR" | "USD"`) saved on `orders` and `proforma_invoices` is never read by `OrderPreview` or `generateOrderPDF`.

## Fix (GMS only)
Plumb `currencyMode` into the preview + PDF and use it purely for **labels and amount-in-words formatting**. The numeric values are already in the correct currency (toolbar did the math), so we must NOT re-divide.

### 1. `src/components/orders/OrderPreview.tsx`
- Add `currencyMode?: "INR" | "USD"` to `Props`.
- Define `forcedUsd = format === "GMS" && currencyMode === "USD"`.
- Treat header label as USD when `displayUSDItems || forcedUsd`:
  - `itemCurLabel = (displayUSDItems || forcedUsd) ? "USD" : "INR"`
- Update `itemFmt` / `totalFmt` so that when `forcedUsd` is true (and the existing PU-rate branches are not), values are rendered with `$` + `en-US` formatting **without** dividing by any rate.
- Amount in Words block: when `forcedUsd` (and not already on the Turkey/CIF/Murthal USD branches that already use `amountInWordsUSD`), render with `amountInWordsUSD(p.totals.net_payable)` instead of the INR string.
- Do not touch the Turkey, CIF Port, Murthal-USD, or FX (cost-sheet) branches; their existing logic stays.

### 2. `src/lib/orders/pdf.ts`
- Extend the `opts` object on `generateOrderPDF` with `currencyMode?: "INR" | "USD"`.
- Compute `forcedUsd = c.format === "GMS" /* via order.format */ && opts?.currencyMode === "USD"`.
- Header cells: `UNIT PRICE\n(${(usdDisplay || forcedUsd) ? "USD" : "INR"})` and same for `AMOUNT`.
- New formatter `fmtForcedUsd(n) = "$ " + n.toLocaleString("en-US", {2,2})`.
- `fmtTotal`: if `usdDisplay` keep existing (divides by rate); else if `forcedUsd` use `fmtForcedUsd`; else `fmt`.
- Amount-in-words below the totals: when `forcedUsd` and not already in the CIF/Murthal-USD branches, print `amountInWordsUSD(t.net_payable)` (or `t.grand_total` for OA) using existing helper.

### 3. Wire it from the editors
- `src/pages/orders/OrderEditor.tsx`: pass `currencyMode={currencyMode}` to `<OrderPreview …/>` and to `generateOrderPDF(order, { …, currencyMode })`.
- `src/pages/pi/PiEditor.tsx`: pass `currencyMode={currencyMode}` to `<OrderPreview …/>`. PI PDF goes through `generatePiPDF` → `generateOrderPDF`; thread `currencyMode` through `generatePiPDF`'s `opts` and forward to `generateOrderPDF`.
- `src/lib/pi/pdf.ts`: add `currencyMode` to its `opts` and forward.

### Out of scope / unchanged
- All numeric calculations (`recalc`, `calcPiTotals`, Turkey/Murthal/CIF math).
- Existing PU-Dollar-Rate, EXW Turkey, EXW CIF Port, EXW Murthal USD displays.
- MR format preview/PDF.
- Database schema, RLS, OA→PI carry-forward (already handled).
- Convert toolbar logic itself.

## Acceptance
- GMS OA in INR mode → headers `UNIT PRICE (INR)` / `AMOUNT (INR)`, words in Rupees (unchanged).
- Click `INR → USD` → Preview & PDF headers flip to `(USD)`, values shown with `$` and en-US formatting using already-converted numbers, words in Dollars.
- Click `USD → INR` → headers flip back to `(INR)`, words in Rupees.
- Same behavior on the GMS PI page and its PDF.
- MR OA / MR PI and all PU-Dollar-Rate driven views render exactly as before.
