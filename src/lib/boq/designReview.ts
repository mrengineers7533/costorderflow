import { sortByItemNo } from "@/lib/boq/types";
import { supabase } from "@/integrations/supabase/client";
import type { BoqLineItem } from "@/lib/boq/types";

export type Decision = "pending" | "approved" | "change_required";
export type ReviewKind = "comment" | "approval";

export interface DesignReviewRow {
  id: string;
  boq_id: string;
  token: string;
  round_no: number;
  kind: ReviewKind;
  status: "sent" | "submitted" | "expired";
  expires_at: string;
  sent_at: string;
  submitted_at: string | null;
  submitted_by_email: string | null;
  reviewer_name: string | null;
  reviewer_design_team: string | null;
  reviewer_contact: string | null;
  overall_outcome: string | null;
  boq_snapshot: Record<string, unknown>;
}

export interface DesignReviewItemRow {
  id: string;
  review_id: string;
  boq_item_id: string;
  item_no: string | null;
  model_number: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  remarks: string | null;
  decision: Decision;
  comment: string | null;
  design_change_note: string | null;
  decided_at: string | null;
}

export interface DesignReviewDocRow {
  id: string;
  review_id: string;
  boq_item_id: string | null;
  source: "reviewer" | "internal";
  file_name: string;
  file_path: string;
  uploaded_by_email: string | null;
  created_at: string;
}

/** Create a new review round for a BOQ. Returns the inserted row. */
export async function createReviewRound(
  boq: { id: string; user_id: string | null; boq_number: string; client_name: string | null; project_number: string | null },
  items: BoqLineItem[],
  opts: { kind: ReviewKind; expiryDays?: number },
): Promise<DesignReviewRow> {
  const expiryDays = opts.expiryDays ?? 14;
  const kind = opts.kind;
  // Compute next round number
  const { data: prev } = await supabase
    .from("boq_design_reviews")
    .select("round_no")
    .eq("boq_id", boq.id)
    .order("round_no", { ascending: false })
    .limit(1);
  const nextRound = (prev?.[0]?.round_no || 0) + 1;

  const { data: userData } = await supabase.auth.getUser();
  const expiresAt = new Date(Date.now() + expiryDays * 86400_000).toISOString();

  const snapshot = {
    boq_number: boq.boq_number,
    client_name: boq.client_name,
    project_number: boq.project_number,
    item_count: items.length,
  };

  const { data: review, error } = await supabase
    .from("boq_design_reviews")
    .insert({
      boq_id: boq.id,
      user_id: userData.user?.id || boq.user_id,
      recipients: [],
      round_no: nextRound,
      status: "sent",
      expires_at: expiresAt,
      boq_snapshot: snapshot,
      kind,
    })
    .select("*")
    .single();
  if (error || !review) throw error || new Error("Failed to create review");

  if (items.length) {
    const rows = items.map((it) => ({
      review_id: review.id,
      boq_item_id: it.id,
      item_no: it.item_no,
      model_number: it.model_number,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      remarks: it.remarks,
      decision: "pending" as const,
    }));
    const { error: ie } = await supabase.from("boq_design_review_items").insert(rows);
    if (ie) throw ie;
  }

  await supabase
    .from("boqs")
    .update({ design_review_status: kind === "comment" ? "comment_sent" : "approval_sent" })
    .eq("id", boq.id);

  return review as unknown as DesignReviewRow;
}

export function reviewLink(token: string): string {
  return `${window.location.origin}/design-review/${token}`;
}

export async function fetchReviewsForBoq(boqId: string): Promise<DesignReviewRow[]> {
  const { data, error } = await supabase
    .from("boq_design_reviews")
    .select("*")
    .eq("boq_id", boqId)
    .order("round_no", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as DesignReviewRow[];
}

export async function fetchReviewItems(reviewId: string): Promise<DesignReviewItemRow[]> {
  const { data, error } = await supabase
    .from("boq_design_review_items")
    .select("*")
    .eq("review_id", reviewId);
  if (error) throw error;
  return sortByItemNo((data || []) as unknown as DesignReviewItemRow[]);
}

export async function fetchReviewDocs(reviewId: string): Promise<DesignReviewDocRow[]> {
  const { data, error } = await supabase
    .from("boq_design_review_documents")
    .select("*")
    .eq("review_id", reviewId);
  if (error) throw error;
  return (data || []) as unknown as DesignReviewDocRow[];
}

export function publicDocUrl(filePath: string): string {
  const { data } = supabase.storage.from("design-review-docs").getPublicUrl(filePath);
  return data.publicUrl;
}

/** Fetch latest submitted review round + its items for a BOQ. */
export async function fetchLatestSubmittedRound(boqId: string): Promise<{ round: DesignReviewRow; items: DesignReviewItemRow[]; docs: DesignReviewDocRow[] } | null> {
  const { data } = await supabase
    .from("boq_design_reviews")
    .select("*")
    .eq("boq_id", boqId)
    .eq("status", "submitted")
    .order("round_no", { ascending: false })
    .limit(1);
  const round = data?.[0] as unknown as DesignReviewRow | undefined;
  if (!round) return null;
  const [items, docs] = await Promise.all([fetchReviewItems(round.id), fetchReviewDocs(round.id)]);
  return { round, items, docs };
}

/** Mark a BOQ as Final and generate a share token for departments. */
export async function sendFinalBoq(boqId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("boqs")
    .select("final_share_token")
    .eq("id", boqId)
    .maybeSingle();
  let token = (existing as { final_share_token: string | null } | null)?.final_share_token || null;
  const patch: Record<string, unknown> = {
    design_review_status: "final_sent",
    final_sent_at: new Date().toISOString(),
  };
  if (!token) {
    token = (globalThis.crypto || crypto).randomUUID();
    patch.final_share_token = token;
  }
  const { error } = await supabase.from("boqs").update(patch as never).eq("id", boqId);
  if (error) throw error;
  return token!;
}

export function finalBoqLink(token: string): string {
  return `${window.location.origin}/boq/final/${token}`;
}

/** Snapshot the current BOQ state into boq_revisions. Returns the new revision label. */
export async function snapshotRevision(params: {
  boqId: string;
  lineItems: unknown[];
  designReviewStatus: string;
  reviewerOutcome?: string | null;
  roundNo?: number | null;
  reviewItems?: unknown[];
  note?: string;
}): Promise<string> {
  const { data: prev } = await supabase
    .from("boq_revisions")
    .select("revision_no")
    .eq("boq_id", params.boqId)
    .order("revision_no", { ascending: false })
    .limit(1);
  const nextNo = ((prev?.[0] as { revision_no?: number } | undefined)?.revision_no || 0) + 1;
  const label = `R${nextNo}`;
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("boq_revisions").insert({
    boq_id: params.boqId,
    revision_label: label,
    revision_no: nextNo,
    design_review_status: params.designReviewStatus,
    reviewer_outcome: params.reviewerOutcome ?? null,
    round_no: params.roundNo ?? null,
    line_items: params.lineItems as never,
    review_items: (params.reviewItems ?? []) as never,
    snapshot_note: params.note ?? null,
    created_by: auth.user?.id || null,
  } as never);
  if (error) throw error;
  return label;
}

export interface BoqRevisionRow {
  id: string;
  boq_id: string;
  revision_label: string;
  revision_no: number;
  design_review_status: string | null;
  reviewer_outcome: string | null;
  round_no: number | null;
  line_items: unknown[];
  review_items: unknown[];
  snapshot_note: string | null;
  created_at: string;
}

export async function fetchRevisions(boqId: string): Promise<BoqRevisionRow[]> {
  const { data, error } = await supabase
    .from("boq_revisions")
    .select("*")
    .eq("boq_id", boqId)
    .order("revision_no", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as BoqRevisionRow[];
}

export const DESIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent_to_design: "Comment Link Sent to Design",
  comment_sent: "Comment Link Sent to Design",
  review_received: "Design Comments Received",
  boq_updated: "BOQ Updated by Creator",
  approval_sent: "Approval Link Sent to Design",
  changes_required: "Changes Required",
  resubmitted: "Approval Link Sent to Design",
  design_approved: "Design Approved",
  final_sent: "Final BOQ",
  // legacy values
  sent: "Comment Link Sent to Design",
  approved_by_design: "Design Approved",
};

export function statusLabel(s?: string | null): string {
  if (!s) return "Draft";
  return DESIGN_STATUS_LABELS[s] || s;
}