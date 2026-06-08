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
  column_comments?: Partial<Record<ColKey, string>> | null;
}

export type ColKey = "model" | "description" | "quantity" | "unit" | "remarks";

const LEGACY_LABELS: Record<string, ColKey> = {
  model: "model",
  description: "description",
  qty: "quantity",
  quantity: "quantity",
  unit: "unit",
  remarks: "remarks",
};

/** Returns a per-column map of design suggestions for a review item.
 *  Prefers `column_comments` jsonb; falls back to parsing legacy
 *  "Model: X\nDescription: Y\n..." text stored in `comment`. */
export function parseColumnComments(it: DesignReviewItemRow): Partial<Record<ColKey, string>> {
  const cc = (it.column_comments || {}) as Partial<Record<ColKey, string>>;
  const hasAny = (["model","description","quantity","unit","remarks"] as ColKey[])
    .some((k) => (cc[k] || "").trim() !== "");
  if (hasAny) return cc;
  const raw = (it.comment || "").trim();
  if (!raw) return {};
  const out: Partial<Record<ColKey, string>> = {};
  const lines = raw.split(/\r?\n/);
  let current: ColKey | null = null;
  for (const ln of lines) {
    const m = ln.match(/^\s*([A-Za-z]+)\s*:\s*(.*)$/);
    if (m && LEGACY_LABELS[m[1].toLowerCase()]) {
      current = LEGACY_LABELS[m[1].toLowerCase()];
      out[current] = m[2];
    } else if (current) {
      out[current] = ((out[current] || "") + "\n" + ln).trim();
    }
  }
  return out;
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

  const snapshot: Record<string, unknown> = {
    boq_number: boq.boq_number,
    client_name: boq.client_name,
    project_number: boq.project_number,
    item_count: items.length,
    // Persist a stable baseline of the BOQ at the moment this link was
    // generated. Used by the Approval link to render "Previous → Updated"
    // even if items were later added/removed.
    line_items: items,
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
      boq_snapshot: snapshot as never,
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

/** Public-link variant: fetch review items by the secret review token via
 *  a SECURITY DEFINER RPC. Used on the anonymous /design-review/:token page. */
export async function fetchReviewItemsByToken(token: string): Promise<DesignReviewItemRow[]> {
  const { data, error } = await supabase
    .rpc("get_design_review_items_by_token", { _token: token });
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

/**
 * Bucket "design-review-docs" is private. Use a short-lived signed URL.
 * Returns "" on failure (caller can decide how to render).
 */
export async function signedDocUrl(filePath: string, ttlSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from("design-review-docs")
    .createSignedUrl(filePath, ttlSeconds);
  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
}

/** Creator-uploaded BOQ item instruction attachments fetched via the review
 *  token. Returns a map keyed by boq_item_id. */
export interface BoqItemAttachmentRow {
  id: string;
  boq_id: string;
  boq_item_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export async function fetchCreatorAttachmentsByToken(
  token: string,
): Promise<Record<string, BoqItemAttachmentRow[]>> {
  const { data, error } = await supabase.rpc("get_boq_item_attachments_by_token", { _token: token });
  if (error) return {};
  const out: Record<string, BoqItemAttachmentRow[]> = {};
  for (const r of (data || []) as unknown as BoqItemAttachmentRow[]) {
    (out[r.boq_item_id] ||= []).push(r);
  }
  return out;
}

/** Short-lived signed URL for a creator-uploaded BOQ item attachment.
 *  Anonymous reviewers are allowed via an RLS policy on storage.objects
 *  scoped to the parent BOQ having an open design review. */
export async function signedCreatorDocUrl(filePath: string, ttlSeconds = 600): Promise<string> {
  const { data, error } = await supabase.storage
    .from("boq-item-docs")
    .createSignedUrl(filePath, ttlSeconds);
  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
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

/** Fetch latest approval round (any status) + its items for a BOQ.
 *  Used so per-item decisions made by the designer reflect in the editor
 *  Approval column even before the round is formally submitted. */
export async function fetchLatestApprovalRound(boqId: string): Promise<{ round: DesignReviewRow; items: DesignReviewItemRow[]; docs: DesignReviewDocRow[] } | null> {
  const { data } = await supabase
    .from("boq_design_reviews")
    .select("*")
    .eq("boq_id", boqId)
    .eq("kind", "approval")
    .order("round_no", { ascending: false })
    .limit(1);
  const round = data?.[0] as unknown as DesignReviewRow | undefined;
  if (!round) return null;
  const [items, docs] = await Promise.all([fetchReviewItems(round.id), fetchReviewDocs(round.id)]);
  return { round, items, docs };
}

/** Fetch the baseline BOQ snapshot from the latest **comment** review round.
 *  Items are the BOQ state at the moment that comment link was generated —
 *  i.e. "Previous Data" before the creator applied any updates. */
export async function fetchLatestCommentBaseline(boqId: string): Promise<{ round: DesignReviewRow; items: DesignReviewItemRow[] } | null> {
  const { data } = await supabase
    .from("boq_design_reviews")
    .select("*")
    .eq("boq_id", boqId)
    .eq("kind", "comment")
    .order("round_no", { ascending: false })
    .limit(1);
  const round = data?.[0] as unknown as DesignReviewRow | undefined;
  if (!round) return null;
  // Prefer the line_items snapshot stored on boq_snapshot (survives item
  // add/remove). Fall back to boq_design_review_items for legacy rounds.
  const snap = (round.boq_snapshot || {}) as { line_items?: Array<Record<string, unknown>> };
  if (Array.isArray(snap.line_items) && snap.line_items.length) {
    const items = snap.line_items.map((it) => ({
      id: String(it.id ?? ""),
      review_id: round.id,
      boq_item_id: String(it.id ?? ""),
      item_no: (it.item_no as string) ?? null,
      model_number: (it.model_number as string) ?? null,
      description: (it.description as string) ?? null,
      quantity: (it.quantity as number) ?? null,
      unit: (it.unit as string) ?? null,
      remarks: (it.remarks as string) ?? null,
      decision: "pending" as Decision,
      comment: null,
      design_change_note: null,
      decided_at: null,
      column_comments: null,
    })) as DesignReviewItemRow[];
    return { round, items };
  }
  const items = await fetchReviewItems(round.id);
  return { round, items };
}

export type DiffField = "model_number" | "description" | "quantity" | "unit" | "remarks";
export const DIFF_FIELDS: { key: DiffField; label: string }[] = [
  { key: "model_number", label: "Model" },
  { key: "description", label: "Description" },
  { key: "quantity", label: "Qty" },
  { key: "unit", label: "Unit" },
  { key: "remarks", label: "Remarks" },
];

export interface ItemDiff {
  itemId: string;
  item_no: string | null;
  model_number: string | null;
  changes: { field: DiffField; label: string; from: string; to: string }[];
}

function norm(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Compute per-item before/after diff between a baseline snapshot (e.g.
 *  the latest comment-round items) and the current BOQ line items. Only
 *  Model / Description / Qty / Unit / Remarks are compared. Items absent
 *  from one side are skipped. */
export function diffItemsAgainstBaseline(
  baseline: DesignReviewItemRow[],
  current: Array<{ id: string; item_no?: string; model_number?: string; description?: string; quantity?: number; unit?: string; remarks?: string }>,
): ItemDiff[] {
  const baseById = new Map(baseline.map((b) => [b.boq_item_id, b]));
  const out: ItemDiff[] = [];
  for (const it of current) {
    const b = baseById.get(it.id);
    if (!b) continue;
    const changes: ItemDiff["changes"] = [];
    for (const { key, label } of DIFF_FIELDS) {
      const baseVal = (b as unknown as Record<string, unknown>)[key];
      const curVal = (it as unknown as Record<string, unknown>)[key];
      if (norm(baseVal) !== norm(curVal)) {
        changes.push({ field: key, label, from: norm(baseVal), to: norm(curVal) });
      }
    }
    if (changes.length) {
      out.push({ itemId: it.id, item_no: it.item_no ?? null, model_number: it.model_number ?? null, changes });
    }
  }
  return out;
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

export interface RevisionChange {
  item_id: string;
  item_no: string | null;
  model_number: string | null;
  field: DiffField;
  label: string;
  old_value: string;
  new_value: string;
  changed_by: string | null;
  changed_at: string;
}

/** Build a flat change-log from a per-item diff array. */
export function buildChangeLog(diffs: ItemDiff[], changedBy: string | null): RevisionChange[] {
  const now = new Date().toISOString();
  const out: RevisionChange[] = [];
  for (const d of diffs) {
    for (const c of d.changes) {
      out.push({
        item_id: d.itemId,
        item_no: d.item_no,
        model_number: d.model_number,
        field: c.field,
        label: c.label,
        old_value: c.from,
        new_value: c.to,
        changed_by: changedBy,
        changed_at: now,
      });
    }
  }
  return out;
}

export function summarizeChanges(changes: RevisionChange[]): string {
  if (!changes.length) return "—";
  const items = new Set(changes.map((c) => c.item_id));
  return `${changes.length} field${changes.length === 1 ? "" : "s"} across ${items.size} item${items.size === 1 ? "" : "s"}`;
}

/** Snapshot the current BOQ state into boq_revisions. Returns the new revision label. */
export async function snapshotRevision(params: {
  boqId: string;
  lineItems: unknown[];
  designReviewStatus: string;
  reviewerOutcome?: string | null;
  roundNo?: number | null;
  reviewItems?: unknown[];
  changes?: RevisionChange[];
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
  // Embed `changes` alongside the per-item decisions inside review_items
  // (jsonb column — accepts any shape). Stored as
  //   { items: [...], changes: [...] }
  // when a change log is provided, otherwise as a plain array (legacy).
  const reviewItemsPayload = params.changes && params.changes.length
    ? { items: params.reviewItems ?? [], changes: params.changes }
    : (params.reviewItems ?? []);
  const { error } = await supabase.from("boq_revisions").insert({
    boq_id: params.boqId,
    revision_label: label,
    revision_no: nextNo,
    design_review_status: params.designReviewStatus,
    reviewer_outcome: params.reviewerOutcome ?? null,
    round_no: params.roundNo ?? null,
    line_items: params.lineItems as never,
    review_items: reviewItemsPayload as never,
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
  review_items: unknown[] | { items: unknown[]; changes: RevisionChange[] };
  snapshot_note: string | null;
  created_at: string;
  created_by: string | null;
}

/** Helpers to read the new `review_items` shape safely. */
export function getRevisionItems(r: BoqRevisionRow): unknown[] {
  const ri = r.review_items as unknown;
  if (Array.isArray(ri)) return ri;
  if (ri && typeof ri === "object" && Array.isArray((ri as { items?: unknown[] }).items)) {
    return (ri as { items: unknown[] }).items;
  }
  return [];
}

export function getRevisionChanges(r: BoqRevisionRow): RevisionChange[] {
  const ri = r.review_items as unknown;
  if (ri && typeof ri === "object" && !Array.isArray(ri) && Array.isArray((ri as { changes?: unknown[] }).changes)) {
    return (ri as { changes: RevisionChange[] }).changes;
  }
  return [];
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