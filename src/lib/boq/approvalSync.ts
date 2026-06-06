import { fetchLatestApprovalRound } from "@/lib/boq/designReview";
import type { BoqLineItem } from "@/lib/boq/types";
import { supabase } from "@/integrations/supabase/client";

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
  let changed = false;
  const next = items.map((it) => {
    const r = byId.get(it.id) || byDesc.get(norm(it.description));
    if (!r) return it;
    const ns = mapDecision(r.decision);
    if ((it as BoqLineItem & { approval_status?: string }).approval_status === ns) return it;
    changed = true;
    return { ...it, approval_status: ns } as BoqLineItem;
  });
  // Heal the stored snapshot so on-screen tables, Excel, distribution PDF,
  // and revision rows reflect the same decision. Best-effort: a write
  // failure (e.g. RLS for a viewer with only SELECT) must not break PDF.
  if (changed) {
    try {
      await supabase.from("boqs").update({ line_items: next } as never).eq("id", boqId);
    } catch (e) {
      console.warn("[approvalSync] write-through failed", e);
    }
  }
  return next;
}