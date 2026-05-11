## Goal

Add a new **PU Dollar Rate (₹ per $)** input inside the EXW Turkey window of the PI editor (and matching OA editor), independent of the existing cost-sheet `fx_rate`. When this new rate is > 0, it overrides `fx_rate` for INR→USD conversion in the Turkey flow. Otherwise behavior is unchanged.

## Scope

PI editor only is required by the screenshot, but to keep PI/OA in sync (PI pre-fills from OA) the same field must also appear in the OA editor's EXW Turkey block. Calculations stay otherwise untouched.

## Changes

### 1. New charge field

`src/lib/orders/types.ts` (`Charges`)
- Add `turkey_pu_dollar_rate?: number` — independent ₹-per-$ rate used only by EXW Turkey. Documented as overriding `fx_rate` when > 0.
- No DB migration needed (charges is jsonb).

### 2. PI editor — show the field inside the Turkey window

`src/pages/pi/PiEditor.tsx`
- The current EXW Turkey block (`gms_mode === "EXW_TURKEY"`) is hidden behind `{false && …}` at line 597. Replace that gate with a real `gms_mode === "EXW_TURKEY"` render so the section actually appears, and inside it add a single input:
  - Label: **PU Dollar Rate (₹ per $)**
  - Bound to `charges.turkey_pu_dollar_rate`
  - Helper text: "Used only for EXW Turkey. When > 0, overrides the cost-sheet $ rate for INR→USD display."
- Keep the existing `fx_rate` input visible alongside it (as it does today), so the user can still see / set the cost-sheet rate.

### 3. OA editor — same field in the Turkey block

`src/pages/orders/OrderEditor.tsx`
- Mirror the same input inside the OA's EXW Turkey window so PI inherits the value via the existing pre-fill flow.

### 4. Conversion uses the new rate when present

The existing rule "EXW Turkey is always USD via `fx_rate`" becomes "EXW Turkey is always USD via `turkey_pu_dollar_rate` if > 0, else `fx_rate`". Implemented as a tiny helper:

```ts
const turkeyUsdRate = (c) => (c.turkey_pu_dollar_rate || 0) > 0
  ? c.turkey_pu_dollar_rate!
  : (c.fx_rate || 0);
```

Apply this helper in the existing Turkey USD branches only:
- `src/components/orders/OrderPreview.tsx` (`fxRate`/`turkeyAlwaysUSD` paths)
- `src/lib/orders/pdf.ts` (Turkey USD section)
- `src/lib/pi/excel.ts` (Turkey USD section)
- `src/lib/pi/convert.ts` (PI carry-over from OA, Turkey branch)

No formula, total, GST, custom, freight, insurance, P&F, advance or discount logic changes — only which `₹ per $` divisor is used.

### 5. Out of scope

- No change to `cif_pu_dollar_rate` (used by other GMS modes).
- No change to EXW Murthal, EXW CIF Port, MR flow, BOQ, or cost-sheet upload.
- No change to PDF layout, totals, or "amount in words".
- No DB migration.

## Result

In the GMS Charges card, when EXW Turkey is selected, a new "PU Dollar Rate (₹ per $)" input appears below the mode dropdown. Enter a value (e.g. 88.5) and every USD figure in the Turkey preview / PDF / Excel uses that rate instead of the cost-sheet `fx_rate`. Leave it blank/0 to keep current behavior.
