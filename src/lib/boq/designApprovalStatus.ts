import { supabase } from "@/integrations/supabase/client";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";
import {
  fetchRevisionApprovalSnapshots,
  evaluateSnapshotApproval,
} from "@/lib/boq/approvalSnapshots";

export type DesignApprovalState = "approved" | "not_approved";

type BoqInput = Pick<BoqRecord, "id" | "revision" | "line_items">;

/**
 * Returns map<boqId, "approved" | "not_approved">.
 *
 * A BOQ is reported "approved" using whichever signal is present (so MR and
 * GMS revisions behave identically regardless of whether the line_items
 * mirror or the design-status rows are the source of truth for a given
 * record):
 *
 *  1. Direct: `boq_item_design_status` has at least one row with
 *     status='approved' for this boq+revision and no row with status
 *     'rejected'|'pending' for items in the current snapshot.
 *  2. Inherited: if no design-status rows exist for this revision, walk
 *     `revised_from_id` (and sibling BOQs in the same OA family) to the
 *     nearest ancestor with rows, remap by description+model to the current
 *     `line_items`, and apply the same rule. This mirrors the carry-forward
 *     already used by the Design BOQ comment/approval panel so revised BOQs
 *     keep showing the inherited Approved state until Design issues a new
 *     round.
 *  3. OA mirror gate: every line item must have approval_status === 'approved'
 *     (the mirror OrderEditor reads). If `approval_status` is absent on every
 *     row but the inherited design check passed, treat the gate as satisfied
 *     (matches the resilient carry-forward in src/lib/revisions/index.ts).
 *
 * Display-only helper — never mutates data.
 */
export async function fetchDesignApprovalStates(
  boqs: BoqInput[],
): Promise<Map<string, DesignApprovalState>> {
  const out = new Map<string, DesignApprovalState>();
  if (!boqs.length) return out;

  const ids = boqs.map((b) => b.id);

  // Primary source: revision-wise approval snapshots (frozen per revision).
  // When a snapshot exists for a (boq, revision), it is the verdict — even if
  // newer revisions exist or live tables have since changed.
  const snapshots = await fetchRevisionApprovalSnapshots(ids);
  const stillUnresolved: BoqInput[] = [];
  for (const b of boqs) {
    const verdict = evaluateSnapshotApproval(snapshots.get(b.id), b.revision ?? 0);
    if (verdict) out.set(b.id, verdict);
    else stillUnresolved.push(b);
  }
  if (!stillUnresolved.length) return out;

  let statuses: Array<{ boq_id: string; boq_item_id: string; status: string; boq_revision: number | null }> = [];
  try {
    const { data } = await supabase
      .from("boq_item_design_status")
      .select("boq_id,boq_item_id,status,boq_revision")
      .in("boq_id", stillUnresolved.map((b) => b.id));
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

  for (const b of stillUnresolved) {
    const items = (Array.isArray(b.line_items) ? b.line_items : []) as BoqLineItem[];
    const itemIds = new Set(items.map((it) => it.id).filter(Boolean));
    const rev = b.revision ?? 0;
    const rows = (byBoq.get(b.id) || []).filter(
      (r) => (r.boq_revision ?? rev) === rev,
    );
    const relevant = rows.filter((r) => itemIds.has(r.boq_item_id));
    let hasApproved = relevant.some((r) => r.status === "approved");
    let hasBlocking = relevant.some(
      (r) => r.status === "not_approved" || r.status === "rejected" || r.status === "pending",
    );
    let inherited = false;

    if (!hasApproved && !hasBlocking && items.length) {
      const ancestor = await findInheritedApproval(b.id, items);
      if (ancestor) {
        hasApproved = ancestor.approved;
        hasBlocking = ancestor.blocking;
        inherited = ancestor.approved && !ancestor.blocking;
      }
    }
    const designOk = hasApproved && !hasBlocking;

    const approvalStatuses = items.map(
      (it) => (it as unknown as { approval_status?: string | null }).approval_status,
    );
    const hasAnyApprovalField = approvalStatuses.some((s) => s != null);
    const oaMirrorOk = items.length > 0 && approvalStatuses.every((s) => s === "approved");
    // When inherited approval applies and the line_items snapshot was created
    // without an `approval_status` field (older revised BOQs), accept the
    // inherited verdict instead of forcing a backfill.
    const oaOk = oaMirrorOk || (inherited && !hasAnyApprovalField);

    out.set(b.id, designOk && oaOk ? "approved" : "not_approved");
  }
  return out;
}

/** Walk revised_from_id (and OA-family siblings) to the nearest BOQ that has
 *  `boq_item_design_status` rows, then evaluate approval against the current
 *  BOQ's line_items remapped by description+model.  Returns null if no
 *  ancestor has any rows.  Read-only helper for {@link fetchDesignApprovalStates}. */
async function findInheritedApproval(
  boqId: string,
  currentItems: BoqLineItem[],
): Promise<{ approved: boolean; blocking: boolean } | null> {
  const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
  type DescKey = string;
  const currentDescKeys = new Set<DescKey>();
  for (const it of currentItems) {
    const k = `${norm(it.description)}|${norm(it.model_number)}`;
    currentDescKeys.add(k);
    currentDescKeys.add(norm(it.description));
  }

  const seen = new Set<string>();
  let cursor: string | null = boqId;
  let orderId: string | null = null;
  let firstHop = true;

  const evaluate = async (id: string) => {
    const { data: rows } = await supabase
      .from("boq_item_design_status")
      .select("boq_item_id,status,boq_revision")
      .eq("boq_id", id);
    const list = ((rows || []) as Array<{ boq_item_id: string; status: string; boq_revision: number | null }>);
    if (!list.length) return null;
    // Look up the ancestor's line_items to remap ids → desc/model
    const { data: anc } = await supabase.from("boqs").select("line_items").eq("id", id).maybeSingle();
    const ancItems = ((anc as unknown as { line_items?: BoqLineItem[] } | null)?.line_items) || [];
    const idToKey = new Map<string, string>();
    for (const it of ancItems) {
      idToKey.set(it.id, `${norm(it.description)}|${norm(it.model_number)}`);
    }
    let approved = false;
    let blocking = false;
    for (const r of list) {
      const k = idToKey.get(r.boq_item_id);
      if (!k) continue;
      // Only count rows whose item is still present in the current snapshot
      const descOnly = k.split("|")[0];
      if (!currentDescKeys.has(k) && !currentDescKeys.has(descOnly)) continue;
      if (r.status === "approved") approved = true;
      else if (r.status === "not_approved" || r.status === "rejected" || r.status === "pending") blocking = true;
    }
    if (!approved && !blocking) return null;
    return { approved, blocking };
  };

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (!firstHop) {
      const verdict = await evaluate(cursor);
      if (verdict) return verdict;
    }
    firstHop = false;
    const { data: row } = await supabase
      .from("boqs").select("revised_from_id,order_id").eq("id", cursor).maybeSingle();
    const next = (row as { revised_from_id: string | null; order_id: string | null } | null);
    if (next?.order_id && !orderId) orderId = next.order_id;
    cursor = next?.revised_from_id || null;
  }

  // Sibling fallback: any BOQ tied to an OA in the same family.
  if (orderId) {
    const { data: oaRow } = await supabase
      .from("orders").select("id,parent_order_id").eq("id", orderId).maybeSingle();
    const root = (oaRow as { id: string; parent_order_id: string | null } | null)?.parent_order_id
      || (oaRow as { id: string } | null)?.id || orderId;
    const { data: fam } = await supabase
      .from("orders").select("id").or(`id.eq.${root},parent_order_id.eq.${root}`);
    const familyIds = ((fam || []) as Array<{ id: string }>).map((r) => r.id);
    if (familyIds.length) {
      const { data: sibs } = await supabase
        .from("boqs").select("id,revision").in("order_id", familyIds)
        .order("revision", { ascending: false });
      for (const s of ((sibs || []) as Array<{ id: string }>)) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        const verdict = await evaluate(s.id);
        if (verdict) return verdict;
      }
    }
  }
  return null;
}