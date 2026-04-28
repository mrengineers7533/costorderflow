## Restrict legacy "Charges & Totals" panel to MR Engineers only

The fields highlighted in your screenshot (P&F %, P&F Amount, Insurance %, Insurance Amount, Include Freight, GST %, Discount %, Discount Amount) belong to the MR Engineers flow. They should not appear or apply when the order's format is GMS — GMS has its own dedicated sections (EXW Turkey / EXW Murthal) that already cover all charges.

### Changes

**`src/pages/orders/OrderEditor.tsx`**
1. Wrap the entire legacy charge inputs block (P&F, Insurance, Freight toggle, GST %, Discount %, Discount Amount) inside a `format === "MR"` guard so they only render for MR orders.
2. Keep the GMS-specific UI inside the same card (GMS Pricing Mode selector, EXW Turkey block, EXW Murthal block) untouched and still visible for GMS.
3. Rename the card title to stay accurate in both modes (e.g. "Charges & Totals" stays, but the MR-only inputs are simply hidden for GMS).

**`src/components/orders/OrderPreview.tsx`**
- In the totals area, only render the legacy P&F / Insurance / Freight / GST / Discount rows when `format === "MR"`. For GMS without a `gms_mode` set, fall back to a clean Basic + Grand Total view (no P&F/GST rows). The existing EXW Turkey / EXW Murthal branches already handle GMS modes correctly and remain unchanged.

**`src/lib/orders/pdf.ts`**
- In the GMS PDF builder, skip pushing the legacy P&F / Insurance / GST / Discount rows when the order is GMS and no `gms_mode` is set. Keep them only for the MR PDF builder. The Turkey/Murthal branches stay as-is.

**`src/lib/orders/calc.ts`**
- `calcTotals` (used by MR) keeps applying P&F / Insurance / GST / Discount as today.
- For GMS orders, ensure these legacy fields are not added into the displayed grand total (UI/PDF guard above is sufficient since GMS uses its own breakdown calculators).

### Result
- MR Engineers orders: unchanged — all charge fields visible and applied as before.
- GMS orders: the P&F / Insurance / Freight / GST / Discount inputs disappear from the editor; the preview and PDF show only the GMS pricing breakdown (legacy or EXW Turkey / EXW Murthal depending on `gms_mode`). No stray GST/P&F lines leak into GMS documents.
