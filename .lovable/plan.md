## Goal
MR Advance Adjustment % base:
- Discount applied → calculate on **Discounted Basic Total** (Basic − Discount)
- No discount → calculate on **Basic Total**

Applies only to MR (OA + PI). Flat-₹ advance mode and all other modules unchanged.

Since `basic_after_discount` already equals `basic_total` when no discount, switching the base to the discounted value naturally handles both cases.

## Files to change

1. **`src/pages/orders/OrderEditor.tsx`** (MR OA live breakdown, ~line 1846)
   - Advance base → `totals.basic_total - (showDisc ? rawDisc : 0)` (both already computed at ~1804).

2. **`src/components/orders/OrderPreview.tsx`** (MR OA Review/Export, ~line 402)
   - Advance base → `p.totals.basic_total - discountAmount` (already computed at line 139).

3. **`src/lib/orders/pdf.ts`** (MR OA PDF, ~line 303)
   - Advance base → `t.basic_total - (showDiscount ? rawDiscount : 0)` (already in scope at line 253).

4. **`src/pages/pi/PiEditor.tsx`** (MR PI `piAdvanceAmt`)
   - Advance base → `totals.basic_after_discount` instead of `totals.basic_total`.

5. **`src/lib/pi/pdf.ts`** (MR PI PDF, `piAdvOnGrand`)
   - Advance base → `t.basic_after_discount`.

6. **`src/lib/pi/excel.ts`** (MR PI Excel, ~line 139)
   - Advance base → `tt.basic_after_discount`.

## Verification
- With discount (user example): Basic 23,000; Discount 10% = 2,300; Discounted Basic 20,700; Advance 10% = **2,070**; Net Payable = Grand − 2,070.
- Without discount: Basic 23,000; Advance 10% = **2,300** (unchanged from current behavior).
- Check MR OA live, OA Review/Export, OA PDF, MR PI live, PI PDF, PI Excel.
- GMS Turkey/Murthal/CIF, BOQ, discount UI, OA→PI charges carryover: unchanged.