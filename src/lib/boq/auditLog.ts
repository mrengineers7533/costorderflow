import { supabase } from "@/integrations/supabase/client";
import type { BoqLineItem } from "@/lib/boq/types";

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

/** Persist Remarks changes for a BOQ's line items and append matching
 *  audit-log entries. Shared by the BOQ editor and the Design Review panel
 *  so both surfaces stay in sync (single writer, single audit format). */
export async function saveBoqRemarks(
  boqId: string,
  items: BoqLineItem[],
  originalItems: BoqLineItem[],
): Promise<void> {
  const originalMap = new Map(originalItems.map((it) => [it.id, it]));
  const changed = items
    .map((it) => {
      const orig = originalMap.get(it.id);
      if (!orig) return null;
      if ((orig.remarks || "").trim() === (it.remarks || "").trim()) return null;
      return { item: it, oldRemarks: orig.remarks || "" };
    })
    .filter(Boolean) as { item: BoqLineItem; oldRemarks: string }[];

  if (changed.length) {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    const userName =
      (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() || "";
    const auditEntries = changed.map((c) => ({
      boq_id: boqId,
      item_id: c.item.id,
      item_no: c.item.item_no,
      model_number: c.item.model_number,
      old_remarks: c.oldRemarks,
      new_remarks: c.item.remarks || "",
      changed_by: user?.id || null,
      changed_by_email: user?.email || null,
      changed_by_name: userName || null,
    }));
    await insertRemarksAuditLogs(auditEntries);
  }

  const { error } = await supabase
    .from("boqs")
    .update({ line_items: items } as never)
    .eq("id", boqId);
  if (error) throw error;
}
