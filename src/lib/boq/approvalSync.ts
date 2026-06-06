import { fetchLatestApprovalRound } from "@/lib/boq/designReview";
import type { BoqLineItem } from "@/lib/boq/types";

const norm = (s: string | null | undefined) =>
  (s || "").trim().toLowerCase().replace(/\s+/g, " ");

const mapDecision = (d: string | null | undefined): "approved" | "rejected" | "pending" =>
  d === "approved" ? "approved" : d === "change_required" ? "rejected" : "pending";

/** Returns a new line-items array with `approval_status` overridden from the
 *  latest approval round for this BOQ. Used by PDF generation so the
 *  "Approved by Design" column reflects current decisions even when the
 *  on-disk `boqs.line_items` snapshot is stale. Read-only — no DB writes. */
export async function resolveLatestApprovalStatuses(
  boqId: string,
  items: BoqLineItem[],
): Promise<BoqLineItem[]> {
  if (!boqId || !items?.length) return items;
  const latest = await fetchLatestApprovalRound(boqId);
  if (!latest || !latest.items?.length) return items;
  const byId = new Map(latest.items.map((r) => [r.boq_item_id, r]));
  const byDesc = new Map<string, typeof latest.items[number]>();
  latest.items.forEach((r) => {
    const k = norm(r.description);
    if (k && !byDesc.has(k)) byDesc.set(k, r);
  });
  return items.map((it) => {
    const r = byId.get(it.id) || byDesc.get(norm(it.description));
    if (!r) return it;
    const ns = mapDecision(r.decision);
    if ((it as BoqLineItem & { approval_status?: string }).approval_status === ns) return it;
    return { ...it, approval_status: ns } as BoqLineItem;
  });
}