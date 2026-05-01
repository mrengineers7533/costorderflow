import { calcTotals } from "@/lib/orders/calc";
import type { Charges, LineItem } from "@/lib/orders/types";
import type { PiTotals } from "./types";

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * PI calculation — same OA logic, then:
 *   - One-Time Discount % is applied on the **Subtotal** (pre-GST).
 *   - GST is recomputed on the post-discount taxable amount.
 *   - Advance Adjustment % is applied on the **Grand Total** (post-GST).
 */
export function calcPiTotals(
  items: LineItem[],
  charges: Charges,
  oneTimeDiscountPct: number,
  advanceAdjustmentPct: number,
): PiTotals {
  const base = calcTotals(items, charges);

  // Components from base OA logic
  const subtotal = base.subtotal; // basic + pf + insurance + freight
  const gstPct = charges.gst_percent || 0;

  const discountAmt = (subtotal * (oneTimeDiscountPct || 0)) / 100;
  const taxable = Math.max(0, subtotal - discountAmt);
  const gstAmt = (taxable * gstPct) / 100;
  const grand = taxable + gstAmt;

  const advanceAmt = (grand * (advanceAdjustmentPct || 0)) / 100;
  const net = Math.max(0, grand - advanceAmt);

  return {
    basic_total: base.basic_total,
    subtotal: r(subtotal),
    grand_total: r(grand),
    net_payable: r(net),
    one_time_discount_amount: r(discountAmt),
    taxable_after_discount: r(taxable),
    gst_amount: r(gstAmt),
    grand_total_pi: r(grand),
    advance_adjustment_amount: r(advanceAmt),
    net_payable_pi: r(net),
  };
}

/** Build the next revision PI number from a base, e.g. MRPI/2026-27/001 → MRPI/2026-27/001/R3. */
export function nextRevisionPiNumber(base: string, nextRevision: number): string {
  if (nextRevision <= 0) return base;
  return `${base}/R${nextRevision}`;
}