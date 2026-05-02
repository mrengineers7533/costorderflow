## GMS-only landed-cost calculation (EXW Turkey replacement)

New rule (GMS only — does NOT touch MR):

1. **Landed Price** = Base Total + Sea Freight + Custom Duty
2. **Insurance** — % (or flat ₹) of **Landed Price**
3. **P&F** — % (or flat ₹) of **Landed Price**
4. **GST** — on (Landed + P&F + Insurance + Freight)
5. **Grand Total** = Landed + Insurance + P&F + Freight + GST
6. **Net Payable** = Grand Total − One-time Discount − Advance Adjustment
    - Advance entered as % of Grand Total or flat ₹
7. PDF shows only enabled rows (advance/discount hidden when off).

### Implementation
- `src/lib/orders/types.ts` — added `turkey_pf_*`, `turkey_freight_*`, `turkey_advance_*` charge fields.
- `src/lib/orders/calc.ts::calcExTurkey` — rewritten so Landed = Base + Sea + Custom; Insurance & P&F resolve against Landed; GST on (Landed + P&F + Ins + Freight); Net = Grand − Discount − Advance.
- `src/lib/orders/pdf.ts` — EXW_TURKEY rows reordered (Base → Sea → Custom → **Landed** → Ins → P&F → Freight → GST → Grand → [Discount] → [Advance → Net]). Disabled rows are omitted.
- `src/components/orders/OrderPreview.tsx::ExTurkeyBlock` — same ordering & conditional rows.
- `src/pages/orders/OrderEditor.tsx` — added P&F (Landed), Freight, Advance Adjustment controls in the EXW Turkey block; removed legacy "Local Freight" inputs.
- MR format completely untouched.
