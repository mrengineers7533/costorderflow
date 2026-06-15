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