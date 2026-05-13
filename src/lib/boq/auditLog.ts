import { supabase } from "@/integrations/supabase/client";

export interface RemarksAuditEntry {
  id: string;
  boq_id: string;
  item_id: string;
  item_no: string | null;
  model_number: string | null;
  old_remarks: string | null;
  new_remarks: string;
  changed_by: string | null;
  changed_by_email: string | null;
  changed_by_name: string | null;
  created_at: string;
}

export async function insertRemarksAuditLogs(
  entries: Omit<RemarksAuditEntry, "id" | "created_at">[],
): Promise<void> {
  if (!entries.length) return;
  const { error } = await supabase.from("boq_remarks_audit_log").insert(entries as never);
  if (error) throw error;
}

export async function fetchRemarksAuditLog(boqId: string): Promise<RemarksAuditEntry[]> {
  const { data, error } = await supabase
    .from("boq_remarks_audit_log")
    .select("*")
    .eq("boq_id", boqId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as RemarksAuditEntry[];
}
