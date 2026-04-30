import type { OrderFormat } from "@/lib/orders/types";

export interface BoqLineItem {
  id: string;
  item_no: string;       // editable; defaults to "1", "2", …
  model_number: string;
  description: string;
  quantity: number;
  unit: string;
  remarks: string;
}

export interface BoqRecord {
  id: string;
  order_id: string;
  user_id: string | null;
  boq_number: string;             // e.g. BOQ-0036 (derived from OA last segment)
  version: number;
  format: OrderFormat;
  status: "draft" | "finalized";
  prepared_by: string | null;
  boq_date: string;
  reference_oa_number: string | null;
  project_number: string | null;
  client_name: string | null;
  line_items: BoqLineItem[];
  terms: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Derive BOQ number from an OA number.
 *  MROA/2025-26/0036 -> BOQ-0036
 *  2025-26/GMS/0024  -> BOQ-0024
 *  Falls back to BOQ-<oa> when no trailing number found. */
export function deriveBoqNumber(oaNumber: string): string {
  const m = oaNumber.match(/(\d+)\s*$/);
  return m ? `BOQ-${m[1]}` : `BOQ-${oaNumber}`;
}

export const DEFAULT_BOQ_TERMS = `1. Payment: 40% advance & balance against proforma invoice prior to dispatch.
2. Taxation: Extra as applicable at the time of dispatch.
3. Packing & Forwarding: Extra
4. Freight: Extra
5. Insurance: Extra
6. Delivery: 12-14 weeks after receipt of your purchase order & advance.
7. Exclusions: Any equipment and/or material and/or services not specifically mentioned in this BOQ.`;