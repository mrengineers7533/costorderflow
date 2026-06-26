import type { BoqLineItem } from "@/lib/boq/types";
import type { LineItem } from "@/lib/orders/types";

/** Resolve the "model" used for matching a freshly-revised OA line against
 *  the previous BOQ revision. Mirrors the inline logic used by the BOQ
 *  revision builders so the carry-forward map matches what gets inserted. */
function modelKeyFromOa(it: LineItem): string {
  const m = (it as unknown as { model?: string }).model;
  return (m || "").trim() || it.hsn_code || "";
}

/** Build the prev-BOQ-item-id → new-BOQ-item-id mapping used when carrying
 *  forward applied Design comments onto a fresh BOQ revision.
 *
 *  - `mode: "desc-model"` (used by `reviseBoqFromOrder`) matches on the
 *    description+model pair, mirroring the line-item carry-over.
 *  - `mode: "model"` (used by `createPendingBoqRevision`) matches on model
 *    alone, again mirroring the line-item carry-over there.
 *
 *  `newBoqItems[i]` must correspond positionally to `orderItems[i]` — that
 *  is the same invariant both revision builders already rely on. */
export function buildBoqItemIdRemap(
  orderItems: LineItem[],
  prevBoqItems: BoqLineItem[],
  newBoqItems: Pick<BoqLineItem, "id">[],
  mode: "desc-model" | "model",
): Map<string, string> {
  const out = new Map<string, string>();
  if (!orderItems.length || !prevBoqItems.length || !newBoqItems.length) return out;
  const keyOfPrev = (it: BoqLineItem) =>
    mode === "desc-model"
      ? `${(it.description || "").trim().toLowerCase()}|${(it.model_number || "").trim().toLowerCase()}`
      : (it.model_number || "").trim().toLowerCase();
  const keyOfOa = (it: LineItem) =>
    mode === "desc-model"
      ? `${(it.description || "").trim().toLowerCase()}|${modelKeyFromOa(it).trim().toLowerCase()}`
      : modelKeyFromOa(it).trim().toLowerCase();
  const prevByKey = new Map<string, BoqLineItem>();
  for (const p of prevBoqItems) prevByKey.set(keyOfPrev(p), p);
  orderItems.forEach((it, i) => {
    const prev = prevByKey.get(keyOfOa(it));
    const newId = newBoqItems[i]?.id;
    if (prev?.id && newId) out.set(prev.id, newId);
  });
  return out;
}

/** Minimal shape of a `boq_design_comments` row that the carry-forward
 *  uses. Kept local so tests don't have to depend on supabase types. */
export interface DesignCommentCarry {
  boq_item_id: string;
  column_key: string | null;
  comment: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  department: string | null;
  applied_to_oa_at: string | null;
  applied_to_oa_by: string | null;
  applied_value: string | null;
  oa_revision_id: string | null;
}

/** Turn previous-revision Design comments into insert payloads for a fresh
 *  BOQ revision. A comment is only carried forward when:
 *    1. it was already applied to the OA (`applied_to_oa_at` is not null), and
 *    2. its `boq_item_id` has a mapping into the new revision.
 *  Drafts / pending / unmapped comments are skipped. */
export function buildAppliedCommentInserts(
  prevComments: DesignCommentCarry[],
  oldToNewItemId: Map<string, string>,
  newBoqId: string,
  /** Optional: extra "(boq_item_id|column_key)" keys that should be
   *  treated as applied even when `applied_to_oa_at` is null. Lets the
   *  caller carry forward comments the user applied in the editor when
   *  the apply-stamp RPC didn't fire (e.g. offline / permission hiccup). */
  extraAppliedKeys?: Set<string>,
): Array<Record<string, unknown>> {
  if (!prevComments.length || !oldToNewItemId.size) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const r of prevComments) {
    const isApplied = !!r.applied_to_oa_at
      || !!(extraAppliedKeys && extraAppliedKeys.has(`${r.boq_item_id}|${r.column_key ?? ""}`));
    if (!isApplied) continue;
    const newItemId = oldToNewItemId.get(r.boq_item_id);
    if (!newItemId) continue;
    out.push({
      boq_id: newBoqId,
      boq_item_id: newItemId,
      column_key: r.column_key,
      comment: r.comment,
      user_id: r.user_id,
      user_name: r.user_name,
      user_email: r.user_email,
      department: r.department,
      applied_to_oa_at: r.applied_to_oa_at ?? new Date().toISOString(),
      applied_to_oa_by: r.applied_to_oa_by,
      applied_value: r.applied_value,
      oa_revision_id: r.oa_revision_id,
    });
  }
  return out;
}