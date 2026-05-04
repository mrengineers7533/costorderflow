## Goal

Bring the **EXW Murthal** charges block to feature parity with **EXW Turkey** (every row enable/disable + Flat ₹ / % mode where relevant + base selector where relevant + Discount on Landed + Advance Adjustment), and add a free-form **Additional Note** field inside the **Terms & Conditions** card (both MR and GMS) that prints in the PDF.

This change applies only to the GMS format. MR is untouched except for the new T&C note field.

---

## 1. EXW Murthal — mirror EXW Turkey UI

**File:** `src/pages/orders/OrderEditor.tsx` (lines ~960–1005, the `ex_murthal_enabled` block)

Replace the current `ToggleNumberRow`-only layout with the same row components used by EXW Turkey so every charge gets:
- enable/disable Switch
- Flat ₹ / % mode select (where applicable)
- "on Basic" / "on Landed" base select (where applicable)
- value input

New rows (each independently toggleable, mirroring the Turkey panel):

| Row | Mode (₹ / %) | Base selector | Notes |
|---|---|---|---|
| Sea Freight | yes | Basic / Landed | replaces "% of Basic" only |
| Insurance | yes | Basic / Landed | replaces "% of Basic" only |
| Custom Duty | % only | Basic+Sea / Landed | already had base; keep |
| Clearing (CHA & Port) | % only | Basic+Sea / Landed | new base option |
| **Discount on Landed Price** | yes | — | **new**; same rule as Turkey |
| P&F (on Landed) | yes | — | replaces fixed P&F % field |
| Freight (flat ₹) — joins GST base | flat ₹ | — | new |
| GST % | % only | — | keep |
| One-time Discount | yes | — | replaces "% of Grand Total" only |
| **Advance Adjustment** | yes | — | **new**; same rule as Turkey |

The `ex_murthal_enabled` master toggle stays.

### Type additions (`src/lib/orders/types.ts`)

Add to `Charges` (mirroring the `turkey_*` fields):

```ts
murthal_sea_freight_mode?: "amount" | "percent";
murthal_sea_freight_amount?: number;
murthal_sea_freight_base?: "basic" | "landed";

murthal_insurance_mode?: "amount" | "percent";
murthal_insurance_amount?: number;
murthal_insurance_base?: "basic" | "landed";

murthal_custom_base?: "basic" | "landed";
murthal_clearing_base?: "basic" | "landed";

murthal_landed_discount_enabled?: boolean;
murthal_landed_discount_mode?: "amount" | "percent";
murthal_landed_discount_percent?: number;
murthal_landed_discount_amount?: number;

murthal_pf_enabled?: boolean;
murthal_pf_mode?: "amount" | "percent";
murthal_pf_percent?: number;
murthal_pf_amount?: number;

murthal_freight_enabled?: boolean;
murthal_freight?: number;

murthal_one_time_discount_mode?: "amount" | "percent";
murthal_one_time_discount_amount?: number;

murthal_advance_enabled?: boolean;
murthal_advance_mode?: "amount" | "percent";
murthal_advance_percent?: number;
murthal_advance_amount?: number;
```

Existing `sea_freight`, `sea_insurance`, `custom_percent`, `clearing_percent`, `landed_gst_percent`, `landed_discount` fields are kept for back-compat; new `*_mode` / `*_amount` fields override when set so old saved orders keep rendering correctly.

### Calc updates (`src/lib/orders/calc.ts` → `calcExMurthal`)

Update to apply the same GMS rule chain Turkey already uses:

```text
Landed Price        = Base + Hike + Sea Freight + Custom + Clearing
                       (Sea Freight & Insurance honor their base selector;
                        Custom/Clearing honor their base selector; rows can
                        be ₹ or %.)
Discount on Landed  = Landed × % (or flat ₹)        ← optional
Net Landed          = Landed − Discount on Landed
Insurance           = on Net Landed (₹ or %)
P&F                 = on Net Landed (₹ or %)
Freight (flat ₹)    = adds to GST base
GST                 = (Net Landed + Insurance + P&F + Freight) × %
Grand Total         = Net Landed + Insurance + P&F + Freight + GST
One-time Discount   = subtracted from Grand Total
Advance Adjustment  = subtracted from (Grand Total − One-time Discount)
Net Payable         = Grand Total − One-time Discount − Advance
```

Return shape extends `ExMurthalBreakdown` with `landed_discount_amount`, `net_landed`, `advance_amount`, `net_payable` so the preview/PDF can render them.

### Preview & PDF rendering

- `src/components/orders/OrderPreview.tsx` and `src/lib/orders/pdf.ts` already render the EXW Turkey breakdown rows. Extend the EXW Murthal rendering (currently shows fixed rows) to:
  - Skip any row whose toggle is off.
  - Show **Landed Price → Discount → Net Landed Price → Insurance → P&F → Freight → GST → Grand Total → One-time Discount → Advance Adjustment → Net Payable** (skipping disabled rows).
- Reuse the same number-formatting helpers already used for Turkey rows.

---

## 2. Additional Note inside Terms & Conditions

**File:** `src/pages/orders/OrderEditor.tsx`

Add a new state `const [tcNote, setTcNote] = useState("")` and persist it on the order row.

- Inside the **MR** "Terms & Conditions" Card (line ~1055): add a labeled `Textarea` "Additional Note (optional)" below the existing terms textarea.
- Inside the **GMS** "GMS Terms & Conditions" Card (line ~1081): add the same "Additional Note (optional)" textarea at the bottom.

This is separate from the existing top-level **Notes** card (which is internal/order-level). The new note prints inside the T&C block on the PDF.

### Persistence

Add `tc_note` (text, nullable) to the `orders` table via migration, and include it in the `payload` on save / load. Default empty string.

### PDF output

- `src/lib/orders/pdf.ts`: where MR terms and GMS terms are rendered, append the `tc_note` (if non-empty) as an extra paragraph titled **"Note:"** under the terms list — so it only appears when the user actually wrote one (matches the "if not applied, do not show" pattern already used for discount).

---

## Files touched

- `src/lib/orders/types.ts` — extend `Charges` with `murthal_*` fields; add `tc_note` to `OrderRecord`.
- `src/lib/orders/calc.ts` — rewrite `calcExMurthal` per new chain; export `landed_discount_amount`, `net_landed`, `advance_amount`, `net_payable`.
- `src/pages/orders/OrderEditor.tsx` — replace EXW Murthal panel rows with `ModeToggleRow` / mirrored controls; add T&C Note textarea (MR + GMS); load/save `tc_note`.
- `src/components/orders/OrderPreview.tsx` — render new Murthal rows + T&C note.
- `src/lib/orders/pdf.ts` — render new Murthal rows + T&C note under terms.
- `supabase/migrations/<new>.sql` — `ALTER TABLE public.orders ADD COLUMN tc_note text;`

No changes to MR calculation logic. PI conversion already passes the full `charges` object through, so the new fields flow into PI without further work.
