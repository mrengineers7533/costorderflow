import { supabase } from "@/integrations/supabase/client";
import type { BoqLineItem } from "@/lib/boq/types";

export type ItemApprovalVerdict = "approved" | "not_approved";

/**
 * Per-item approval verdict for a BOQ — display only, never mutates data.
 *
 * For every item in `boq.line_items`, returns "approved" iff any of these
 * sources says so (preserving item-wise sync between BOQ ↔ Design ↔
 * Manufacturing/Purchase):
 *
 *   1. `line_items[].approval_status === "approved"` (the mirror BoqEditor
 *      writes when Design approves an item).
 *   2. A row in `boq_item_design_status` with status="approved" for this
 *      boq+revision and this item id.
 *   3. Inherited: an ancestor BOQ (revised_from_id chain or sibling in the
 *      same OA family) has an approved row whose item maps to this item by
 *      description + model — so revised BOQs continue showing Approved
 *      until Design changes its mind, matching the BOQ-level helper in
 *      designApprovalStatus.ts.
 *
 * Items whose ancestor row is "rejected" / "pending" report "not_approved".
 */
export async function fetchItemApprovalVerdicts(
  boqId: string,
  revision: number,
  items: BoqLineItem[],
): Promise<Map<string, ItemApprovalVerdict>> {
  const verdicts = new Map<string, ItemApprovalVerdict>();
  if (!items.length) return verdicts;

  // 1) line_items mirror
  for (const it of items) {
    if (!it.id) continue;
    const s = (it as unknown as { approval_status?: string }).approval_status;
    verdicts.set(it.id, s === "approved" ? "approved" : "not_approved");
  }

  // 2) direct boq_item_design_status rows for this revision
  const { data: direct } = await supabase
    .from("boq_item_design_status")
    .select("boq_item_id,status,boq_revision")
    .eq("boq_id", boqId);
  const directRows = ((direct || []) as Array<{ boq_item_id: string; status: string; boq_revision: number | null }>)
    .filter((r) => (r.boq_revision ?? revision) === revision);
  const directIds = new Set<string>();
  for (const r of directRows) {
    directIds.add(r.boq_item_id);
    if (!items.some((it) => it.id === r.boq_item_id)) continue;
    if (r.status === "approved") verdicts.set(r.boq_item_id, "approved");
    else verdicts.set(r.boq_item_id, "not_approved");
  }

  // 3) inherited per-item for any item still showing not_approved
  const unresolved = items.filter((it) => it.id && verdicts.get(it.id) !== "approved");
  if (unresolved.length) {
    const inherited = await findInheritedItemApprovals(boqId, unresolved);
    for (const [itemId, v] of inherited) {
      if (v === "approved") verdicts.set(itemId, "approved");
    }
  }
  return verdicts;
}

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
const keyOf = (it: { description?: string | null; model_number?: string | null }) =>
  `${norm(it.description)}|${norm(it.model_number)}`;

async function findInheritedItemApprovals(
  boqId: string,
  unresolvedItems: BoqLineItem[],
): Promise<Map<string, ItemApprovalVerdict>> {
  const out = new Map<string, ItemApprovalVerdict>();
  const keyToCurrentId = new Map<string, string>();
  for (const it of unresolvedItems) {
    if (it.id) {
      keyToCurrentId.set(keyOf(it), it.id);
      keyToCurrentId.set(norm(it.description), it.id);
    }
  }

  const evaluate = async (ancestorId: string) => {
    const { data: rows } = await supabase
      .from("boq_item_design_status")
      .select("boq_item_id,status")
      .eq("boq_id", ancestorId);
    const list = ((rows || []) as Array<{ boq_item_id: string; status: string }>);
    if (!list.length) return;
    const { data: anc } = await supabase.from("boqs").select("line_items").eq("id", ancestorId).maybeSingle();
    const ancItems = ((anc as unknown as { line_items?: BoqLineItem[] } | null)?.line_items) || [];
    const idToKey = new Map<string, string>();
    for (const it of ancItems) idToKey.set(it.id, keyOf(it));
    for (const r of list) {
      const k = idToKey.get(r.boq_item_id);
      if (!k) continue;
      const currentId = keyToCurrentId.get(k) || keyToCurrentId.get(k.split("|")[0]);
      if (!currentId || out.has(currentId)) continue;
      if (r.status === "approved") out.set(currentId, "approved");
      else out.set(currentId, "not_approved");
    }
  };

  const seen = new Set<string>([boqId]);
  let cursor: string | null = boqId;
  let orderId: string | null = null;
  while (cursor) {
    const { data: row } = await supabase
      .from("boqs").select("revised_from_id,order_id").eq("id", cursor).maybeSingle();
    const next = (row as { revised_from_id: string | null; order_id: string | null } | null);
    if (next?.order_id && !orderId) orderId = next.order_id;
    cursor = next?.revised_from_id || null;
    if (!cursor || seen.has(cursor)) break;
    seen.add(cursor);
    await evaluate(cursor);
    if (out.size >= unresolvedItems.length) return out;
  }

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
        await evaluate(s.id);
        if (out.size >= unresolvedItems.length) break;
      }
    }
  }
  return out;
}