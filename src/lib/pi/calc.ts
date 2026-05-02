import type { Charges, LineItem } from "@/lib/orders/types";
import type { PiTotals } from "./types";

const r = (n: number) => Math.round(n * 100) / 100;

export interface AdvanceInput {
  mode: "amount" | "percent";
  value: number;
}

/**
 * Invoice / PI calculation — flow:
 *   Basic Amount
 *   (-) Discount Amount        (Discount % × Basic — applies ONLY on basic)
 *   = Basic After Discount
 *   (+) P&F                    (% on basic_after_discount, or flat ₹)
 *   (+) Insurance              (% on basic_after_discount, or flat ₹)
 *   (+) Freight                (% on basic_after_discount, or flat ₹) — if enabled
 *   (+) Other Charges          (flat ₹)
 *   = Taxable Value
 *   (+) GST                    (GST % × Taxable Value)
 *   = Gross Invoice Total
 *   (-) Advance Adjustment     (flat ₹ or % of Gross Invoice Total)
 *   = Net Payable
 */
export function calcPiTotals(
  items: LineItem[],
  charges: Charges,
  oneTimeDiscountPct: number,
  advance: AdvanceInput | number,
  otherCharges: number = 0,
): PiTotals {
  const basic = items.reduce((s, i) => s + (i.amount || 0), 0);
  const discountPct = oneTimeDiscountPct || 0;
  const discountAmt = (basic * discountPct) / 100;
  const basicAfterDiscount = Math.max(0, basic - discountAmt);

  // P&F: if percent set use it on basic_after_discount, else flat amount
  const pfAmt = charges.pf_percent
    ? (basicAfterDiscount * charges.pf_percent) / 100
    : (charges.pf_amount || 0);
  // Insurance: percent on basic_after_discount, else flat amount
  const insAmt = charges.insurance_percent
    ? (basicAfterDiscount * charges.insurance_percent) / 100
    : (charges.insurance || 0);
  // Freight: kept as-is (its OA semantics: flat ₹ when freight_enabled)
  const frtAmt = charges.freight_enabled ? (charges.freight || 0) : 0;
  const otherAmt = Math.max(0, otherCharges || 0);

  const taxable = basicAfterDiscount + pfAmt + insAmt + frtAmt + otherAmt;
  const gstPct = charges.gst_percent || 0;
  const gstAmt = (taxable * gstPct) / 100;
  const gross = taxable + gstAmt;

  // Advance — backwards-compat: a bare number is treated as percent.
  const adv: AdvanceInput =
    typeof advance === "number" ? { mode: "percent", value: advance } : advance;
  const advanceAmt =
    adv.mode === "amount"
      ? Math.max(0, adv.value || 0)
      : (gross * (adv.value || 0)) / 100;
  const advanceClamped = Math.min(advanceAmt, gross);
  const net = Math.max(0, gross - advanceClamped);

  return {
    basic_total: r(basic),
    subtotal: r(taxable), // back-compat: previous "subtotal" field
    grand_total: r(gross),
    net_payable: r(net),
    one_time_discount_amount: r(discountAmt),
    basic_after_discount: r(basicAfterDiscount),
    pf_amount: r(pfAmt),
    insurance_amount: r(insAmt),
    freight_amount: r(frtAmt),
    other_charges_amount: r(otherAmt),
    taxable_value: r(taxable),
    taxable_after_discount: r(taxable),
    gst_amount: r(gstAmt),
    gross_invoice_total: r(gross),
    grand_total_pi: r(gross),
    advance_adjustment_amount: r(advanceClamped),
    net_payable_pi: r(net),
  };
}

/** Build the next revision PI number from a base, e.g. MRPI/2026-27/001 → MRPI/2026-27/001/R3. */
export function nextRevisionPiNumber(base: string, nextRevision: number): string {
  if (nextRevision <= 0) return base;
  return `${base}/R${nextRevision}`;
}