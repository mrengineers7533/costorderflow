import { supabase } from "@/integrations/supabase/client";

export type ItemApprovalStatus = "approved" | "pending";

export interface ItemApproval {
  status: ItemApprovalStatus;
  decided_by_name: string | null;
  decided_by_department: string | null;
  decided_at: string | null;
}

export async function fetchItemApprovals(
  boqId: string,
  revision: number,
): Promise<Record<string, ItemApproval>> {
  const { data, error } = await supabase
    .from("boq_item_design_status")
    .select("boq_item_id, status, decided_by_name, decided_by_department, decided_at")
    .eq("boq_id", boqId)
    .eq("boq_revision", revision);
  if (error) throw error;
  const map: Record<string, ItemApproval> = {};
  for (const row of (data || []) as Array<{
    boq_item_id: string;
    status: string;
    decided_by_name: string | null;
    decided_by_department: string | null;
    decided_at: string | null;
  }>) {
    map[row.boq_item_id] = {
      status: (row.status === "approved" ? "approved" : "pending"),
      decided_by_name: row.decided_by_name,
      decided_by_department: row.decided_by_department,
      decided_at: row.decided_at,
    };
  }
  return map;
}

async function getActor(): Promise<{
  id: string;
  name: string;
  department: string | null;
}> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.id) throw new Error("Auth required");
  const name =
    (user.user_metadata as { full_name?: string } | undefined)?.full_name ||
    user.email ||
    "User";
  let department: string | null = "Design";
  const { data: rec } = await supabase
    .from("notification_recipients")
    .select("department")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (rec && (rec as { department?: string }).department) {
    department = (rec as { department?: string }).department || "Design";
  }
  return { id: user.id, name, department };
}

export async function setItemApproval(
  boqId: string,
  itemId: string,
  revision: number,
  status: ItemApprovalStatus,
): Promise<void> {
  const actor = await getActor();
  const { data: existing } = await supabase
    .from("boq_item_design_status")
    .select("id")
    .eq("boq_id", boqId)
    .eq("boq_item_id", itemId)
    .eq("boq_revision", revision)
    .limit(1)
    .maybeSingle();
  const existingId = (existing as { id?: string } | null)?.id || null;
  const decidedAt = new Date().toISOString();
  if (existingId) {
    const { error } = await supabase
      .from("boq_item_design_status")
      .update({
        status,
        decided_by: actor.id,
        decided_by_name: actor.name,
        decided_by_department: actor.department,
        decided_at: decidedAt,
        updated_at: decidedAt,
      })
      .eq("id", existingId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("boq_item_design_status").insert({
    boq_id: boqId,
    boq_item_id: itemId,
    boq_revision: revision,
    status,
    decided_by: actor.id,
    decided_by_name: actor.name,
    decided_by_department: actor.department,
    decided_at: decidedAt,
  });
  if (error) throw error;
}

export async function bulkSetItemApprovals(
  boqId: string,
  itemIds: string[],
  revision: number,
  status: ItemApprovalStatus,
): Promise<void> {
  for (const id of itemIds) {
    await setItemApproval(boqId, id, revision, status);
  }
}