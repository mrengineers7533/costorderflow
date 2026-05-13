import { supabase } from "@/integrations/supabase/client";
import type { BoqLineItem } from "@/lib/boq/types";

export type Decision = "pending" | "approved" | "change_required";

export interface DesignReviewRow {
  id: string;
  boq_id: string;
  token: string;
  round_no: number;
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
  expiryDays = 14,
): Promise<DesignReviewRow> {
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
      decision: "pending" as const,
    }));
    const { error: ie } = await supabase.from("boq_design_review_items").insert(rows);
    if (ie) throw ie;
  }

  await supabase
    .from("boqs")
    .update({ design_review_status: "sent" })
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
    .eq("review_id", reviewId)
    .order("item_no", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as DesignReviewItemRow[];
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