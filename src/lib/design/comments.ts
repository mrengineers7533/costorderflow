import { supabase } from "@/integrations/supabase/client";

export interface DesignComment {
  id: string;
  boq_id: string;
  boq_item_id: string;
  column_key: string | null;
  comment: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  department: string | null;
  created_at: string;
}

export async function fetchDesignComments(boqId: string): Promise<DesignComment[]> {
  const { data, error } = await supabase
    .from("boq_design_comments" as never)
    .select("*")
    .eq("boq_id", boqId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as DesignComment[];
}

export async function addDesignComment(input: {
  boqId: string;
  itemId: string;
  columnKey?: string | null;
  comment: string;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  const name =
    (user?.user_metadata as { full_name?: string } | undefined)?.full_name ||
    user?.email ||
    "User";
  // Try to read user's department from notification_recipients (optional).
  let department: string | null = null;
  if (user?.id) {
    const { data: rec } = await supabase
      .from("notification_recipients")
      .select("department")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    department = (rec as { department?: string } | null)?.department || "Design";
  }
  const { error } = await supabase.from("boq_design_comments" as never).insert({
    boq_id: input.boqId,
    boq_item_id: input.itemId,
    column_key: input.columnKey || null,
    comment: input.comment,
    user_id: user?.id || null,
    user_name: name,
    user_email: user?.email || null,
    department,
  } as never);
  if (error) throw error;
}

/** Upsert the current user's draft comment for a given (boq, item, column).
 *  Empty/whitespace text deletes any existing draft instead of inserting. */
export async function upsertDesignComment(input: {
  boqId: string;
  itemId: string;
  columnKey?: string | null;
  comment: string;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.id) throw new Error("Auth required");
  const text = (input.comment || "").trim();
  const col = input.columnKey || null;

  let q = supabase
    .from("boq_design_comments" as never)
    .select("id")
    .eq("boq_id", input.boqId)
    .eq("boq_item_id", input.itemId)
    .eq("user_id", user.id);
  q = col === null ? q.is("column_key", null) : q.eq("column_key", col);
  const { data: existing } = await q.limit(1).maybeSingle();
  const existingId = (existing as { id?: string } | null)?.id || null;

  if (!text) {
    if (existingId) {
      await supabase.from("boq_design_comments" as never).delete().eq("id", existingId);
    }
    return;
  }

  if (existingId) {
    const { error } = await supabase
      .from("boq_design_comments" as never)
      .update({ comment: text, updated_at: new Date().toISOString() } as never)
      .eq("id", existingId);
    if (error) throw error;
    return;
  }

  await addDesignComment({
    boqId: input.boqId,
    itemId: input.itemId,
    columnKey: col,
    comment: text,
  });
}

/** Post-Submit: flip BOQ status so OA creator is notified to revise. */
export async function submitDesignComments(boqId: string): Promise<void> {
  const { error } = await supabase
    .from("boqs")
    .update({ design_review_status: "changes_requested" } as never)
    .eq("id", boqId);
  if (error) throw error;
}

/** Design approves the revised BOQ → unlocks Purchase & Manufacturing. */
export async function approveRevisedBoq(boqId: string): Promise<void> {
  const { error } = await supabase
    .from("boqs")
    .update({
      design_review_status: "design_approved",
      verification_status: "approved",
      is_current: true,
      status: "finalized",
      verified_at: new Date().toISOString(),
    } as never)
    .eq("id", boqId);
  if (error) throw error;
}