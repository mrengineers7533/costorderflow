import type { Address, Charges, LineItem, OrderFormat, Totals } from "@/lib/orders/types";

export type PiStatus = "draft" | "finalized";

export interface PiRecord {
  id: string;
  user_id: string | null;
  pi_number: string;        // e.g. MRPI/2026-27/001 or with /R1 suffix
  base_pi_number: string;   // never has /Rn — groups family
  revision: number;         // 0 = original
  is_current: boolean;
  revised_from_id: string | null;
  parent_pi_id: string | null;

  reference_oa_id: string | null;
  reference_oa_number: string | null;

  format: OrderFormat;
  status: PiStatus;
  pi_date: string;
  prepared_by: string | null;
  company_name: string | null;
  bill_to: Address;
  ship_to: Address;
  line_items: LineItem[];
  charges: Charges;
  totals: Totals;
  amount_in_words: string | null;
  notes: string | null;

  one_time_discount_percent: number;
  advance_adjustment_percent: number;

  /** Flat ₹ "other charges" line added to the taxable value. */
  other_charges: number;
  /** Advance entry mode: flat rupee amount or percent of Gross Invoice Total. */
  advance_mode: "amount" | "percent";
  /** Advance amount in ₹ (used when advance_mode === "amount"). */
  advance_amount: number;

  created_at: string;
  updated_at: string;
}

export interface PiTotals extends Totals {
  one_time_discount_amount: number;
  /** Basic amount after subtracting the discount (= Basic × (1 - d%)). */
  basic_after_discount: number;
  /** Resolved P&F amount in ₹ (computed against basic_after_discount when %). */
  pf_amount: number;
  /** Resolved insurance amount in ₹. */
  insurance_amount: number;
  /** Resolved freight amount in ₹. */
  freight_amount: number;
  /** Other charges in ₹ (flat). */
  other_charges_amount: number;
  /** Taxable value = basic_after_discount + pf + insurance + freight + other. */
  taxable_value: number;
  /** Subtotal after one-time discount (before GST). Alias for taxable_value (back-compat). */
  taxable_after_discount: number;
  /** GST computed on the taxable value. */
  gst_amount: number;
  /** Gross invoice total = taxable_value + GST. */
  gross_invoice_total: number;
  /** Alias for gross_invoice_total (back-compat). */
  grand_total_pi: number;
  advance_adjustment_amount: number;
  net_payable_pi: number;
}