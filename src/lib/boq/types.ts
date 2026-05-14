import type { OrderFormat } from "@/lib/orders/types";

export interface BoqLineItem {
  id: string;
  item_no: string;       // editable; defaults to "1", "2", …
  model_number: string;
  description: string;
  quantity: number;
  unit: string;
  remarks: string;
  /** Senior approval state per line item. */
  approval_status?: "pending" | "approved" | "rejected";
  approval_comment?: string;
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
  /** OA-aligned revision number (matches the source OA revision). */
  revision?: number;
  /** Only one BOQ per OA family is current. */
  is_current?: boolean;
  /** The exact OA revision id this BOQ was generated from. */
  source_order_id?: string | null;
  revised_from_id?: string | null;
  /** 'approved' (default), 'pending_verification', or 'rejected'. */
  verification_status?: "approved" | "pending_verification" | "rejected";
  verification_token?: string | null;
  verification_requested_at?: string | null;
  verified_at?: string | null;
  verified_by_email?: string | null;
}

/** Derive BOQ number from an OA number. The BOQ number always mirrors
 *  the OA's revision suffix so OA Rn ⇒ BOQ Rn.
 *
 *  MROA/2026-27/0008/R4  -> MRBOQ/26-27/0008/R4
 *  MROA/2026-27/0008     -> MRBOQ/26-27/0008
 *  2025-26/GMS/0024/R2   -> 25-26/GMSBOQ/0024/R2
 *  2025-26/GMS/0024      -> 25-26/GMSBOQ/0024
 *  Fallback: BOQ-<trailing-digits>[/Rn]. */
export function deriveBoqNumber(oaNumber: string): string {
  if (!oaNumber) return "BOQ";
  const revMatch = oaNumber.match(/\/R(\d+)$/);
  const revSuffix = revMatch ? `/R${revMatch[1]}` : "";
  const base = oaNumber.replace(/\/R\d+$/, "");
  // MR: MROA/2026-27/0008 -> MRBOQ/26-27/0008
  let m = base.match(/^MROA\/(\d{2})(\d{2})-(\d{2})\/(.+)$/);
  if (m) return `MRBOQ/${m[2]}-${m[3]}/${m[4]}${revSuffix}`;
  // GMS: 2025-26/GMS/0024 -> 25-26/GMSBOQ/0024
  m = base.match(/^(\d{2})(\d{2})-(\d{2})\/GMS\/(.+)$/);
  if (m) return `${m[2]}-${m[3]}/GMSBOQ/${m[4]}${revSuffix}`;
  const num = base.match(/(\d+)\s*$/);
  return num ? `BOQ-${num[1]}${revSuffix}` : `BOQ-${base}${revSuffix}`;
}

export const DEFAULT_BOQ_TERMS = `1. Payment: 40% advance & balance against proforma invoice prior to dispatch.
2. Taxation: Extra as applicable at the time of dispatch.
3. Packing & Forwarding: Extra
4. Freight: Extra
5. Insurance: Extra
6. Delivery: 12-14 weeks after receipt of your purchase order & advance.
7. Exclusions: Any equipment and/or material and/or services not specifically mentioned in this BOQ.`;