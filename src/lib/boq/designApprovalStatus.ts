import { supabase } from "@/integrations/supabase/client";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";

export type DesignApprovalState = "approved" | "not_approved";

type BoqInput = Pick<BoqRecord, "id" | "revision" | "line_items">;

/**
 * Returns map<boqId, "approved" | "not_approved">.
 *
 * A BOQ is reported "approved" only when BOTH are true:
 *  1. Design BOQ approved: at least one row in `boq_item_design_status` with
 *     status='approved' for this boq at its current revision, and no row with
 *     status='rejected' or 'pending' for items in the current snapshot.
 *  2. Linked OA approved: every item in line_items has approval_status === 'approved'
 *     (this is the mirror OrderEditor reads for the "Approved by Design" column).
 *
 * Display-only helper — never mutates data.
 */
export async function fetchDesignApprovalStates(
  boqs: BoqInput[],
): Promise<Map<string, DesignApprovalState>> {
  const out = new Map<string, DesignApprovalState>();
  if (!boqs.length) return out;

  const ids = boqs.map((b) => b.id);
  let statuses: Array<{ boq_id: string; boq_item_id: string; status: string; boq_revision: number | null }> = [];
  try {
    const { data } = await supabase
      .from("boq_item_design_status")
      .select("boq_id,boq_item_id,status,boq_revision")
      .in("boq_id", ids);
    statuses = ((data || []) as unknown) as typeof statuses;
  } catch {
    statuses = [];
  }

  const byBoq = new Map<string, typeof statuses>();
  for (const r of statuses) {
    const arr = byBoq.get(r.boq_id) || [];
    arr.push(r);
    byBoq.set(r.boq_id, arr);
  }

  for (const b of boqs) {
    const items = (Array.isArray(b.line_items) ? b.line_items : []) as BoqLineItem[];
    const itemIds = new Set(items.map((it) => it.id).filter(Boolean));
    const rev = b.revision ?? 0;
    const rows = (byBoq.get(b.id) || []).filter(
      (r) => (r.boq_revision ?? rev) === rev,
    );
    const relevant = rows.filter((r) => itemIds.has(r.boq_item_id));
    const hasApproved = relevant.some((r) => r.status === "approved");
    const hasBlocking = relevant.some(
      (r) => r.status === "rejected" || r.status === "pending",
    );
    const designOk = hasApproved && !hasBlocking;

    const oaOk =
      items.length > 0 &&
      items.every(
        (it) =>
          (it as unknown as { approval_status?: string }).approval_status ===
          "approved",
      );

    out.set(b.id, designOk && oaOk ? "approved" : "not_approved");
  }
  return out;
}