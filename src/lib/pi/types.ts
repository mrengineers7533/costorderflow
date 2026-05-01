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

  created_at: string;
  updated_at: string;
}

export interface PiTotals extends Totals {
  one_time_discount_amount: number;
  /** Subtotal after one-time discount (before GST). */
  taxable_after_discount: number;
  /** GST recomputed on the post-discount taxable amount. */
  gst_amount: number;
  /** Sum of post-discount taxable + GST + freight (the "Grand Total"). */
  grand_total_pi: number;
  advance_adjustment_amount: number;
  net_payable_pi: number;
}