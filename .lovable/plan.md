## Goal

For **GMS format only**, the P&F % input should live inside the **Ex-works Murthal (Landed Cost)** panel — not in the top "Charges & Totals" inputs column. MR stays exactly as it is today.

Today, the left column of "Charges & Totals" already only renders P&F / Insurance / Freight / Discount inputs when `format === "MR"` (`src/pages/orders/OrderEditor.tsx` line 642). For GMS, the column shows **GMS Pricing Mode → EXW Turkey block → Foreign Currency → Ex-works Murthal panel**, with no P&F input — but `charges.pf_percent` is still read by the GMS preview/PDF (defaulting to whatever value the record holds, e.g. the seeded 1.5).

So this change is really: **add a P&F % row inside the Ex-works Murthal panel**, and make sure the GMS view never surfaces a stray P&F input outside it.

## Changes

**`src/pages/orders/OrderEditor.tsx` — Ex-works Murthal panel (around lines 852–886)**

Add a new toggleable row at the top of the panel (above "Sea Freight % (of Basic)"), driven by the existing `pf_percent` / `pf_amount` fields:

```text
[switch]  P&F %                         [number input]
```

Behaviour:
- When the switch is OFF: set `pf_percent: 0` and `pf_amount: 0` so no P&F line appears in the preview / PDF.
- When ON: input edits `pf_percent` (default 1.5 on first enable). Keep using the existing `ToggleNumberRow` component for visual consistency with Sea Freight / Custom Duty / Clearing / GST rows.
- Initial enabled state on existing records: `(pf_percent > 0 || pf_amount > 0)`.
- No P&F-Amount-override input here (kept simple, matching the % style of the rest of the Murthal panel). If the record already has `pf_amount > 0`, the row is enabled and shows the % field; switching ON later will start with `pf_percent = 1.5, pf_amount = 0`.

No other GMS-only changes are needed in the Charges & Totals column — it already does not render a P&F input for GMS.

**MR is untouched.** The existing `{format === "MR" && ...}` block keeps the P&F %, P&F Amount override, Insurance, Freight, GST, and Discount inputs exactly as today.

## Out of scope

- No changes to MR layout.
- No changes to `OrderPreview.tsx`, `pdf.ts`, `calc.ts`, or the PI editor — they already read `pf_percent`/`pf_amount` and will reflect whatever the editor sets.
- Data model unchanged (reuses existing `pf_percent` / `pf_amount` fields).
