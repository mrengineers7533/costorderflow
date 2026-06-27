import { supabase } from "@/integrations/supabase/client";

/**
 * Per-revision approval snapshot rows. Each row is the frozen, item-level
 * approval/comment state for one (boq_id, boq_revision, boq_item_id) tuple,
 * maintained by DB triggers (`trg_refresh_approval_snapshot_from_*`).
 *
 * These rows are the source of truth for badges and Design comments shown on
 * OA, BOQ, Design BOQ, Manufacturing and Purchase screens — including their
 * history views — so an older revision keeps its own Approved + comment
 * forever, even after newer revisions are created.
 */
export type ApprovalSnapshotRow = {
  boq_id: string;
  boq_revision: number;
  boq_item_id: string;
  description?: string | null;
  model_number?: string | null;
  approval_status: "approved" | "not_approved";
  approval_comment: string | null;
  design_comments: unknown;
  approved_by?: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  approved_by_department?: string | null;
  applied_to_oa_at: string | null;
};

export async function fetchRevisionApprovalSnapshots(
  boqIds: string[],
): Promise<Map<string, ApprovalSnapshotRow[]>> {
  const out = new Map<string, ApprovalSnapshotRow[]>();
  if (!boqIds.length) return out;
  const { data, error } = await supabase
    .from("boq_revision_approval_snapshots")
    .select(
      "boq_id,boq_revision,boq_item_id,description,model_number,approval_status,approval_comment,design_comments,approved_by,approved_at,approved_by_name,approved_by_department,applied_to_oa_at",
    )
    .in("boq_id", boqIds);
  if (error || !data) return out;
  for (const r of data as ApprovalSnapshotRow[]) {
    const arr = out.get(r.boq_id) || [];
    arr.push(r);
    out.set(r.boq_id, arr);
  }
  return out;
}

/**
 * Returns "approved" iff the snapshot for this (boq, revision) contains at
 * least one item row and every row is approval_status="approved". Returns
 * null when no snapshot rows exist (caller should fall back to live lookup).
 */
export function evaluateSnapshotApproval(
  rows: ApprovalSnapshotRow[] | undefined,
  revision: number,
): "approved" | "not_approved" | null {
  if (!rows || !rows.length) return null;
  const scoped = rows.filter((r) => r.boq_revision === revision);
  if (!scoped.length) return null;
  return scoped.every((r) => r.approval_status === "approved")
    ? "approved"
    : "not_approved";
}

/** Map snapshot rows to a per-item verdict map for a given revision. */
export function mapSnapshotItems(
  rows: ApprovalSnapshotRow[] | undefined,
  revision: number,
): Map<string, "approved" | "not_approved"> {
  const map = new Map<string, "approved" | "not_approved">();
  if (!rows) return map;
  for (const r of rows) {
    if (r.boq_revision !== revision) continue;
    map.set(r.boq_item_id, r.approval_status);
  }
  return map;
}