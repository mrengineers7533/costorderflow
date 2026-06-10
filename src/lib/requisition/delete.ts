import { supabase } from "@/integrations/supabase/client";
import type { RequisitionRecord } from "./types";

export class RequisitionDeleteBlockedError extends Error {
  poNumbers: string[];
  constructor(poNumbers: string[]) {
    super(
      `Cannot delete: referenced by active PO(s): ${poNumbers.join(", ")}. Cancel those POs first.`,
    );
    this.name = "RequisitionDeleteBlockedError";
    this.poNumbers = poNumbers;
  }
}

/**
 * Permanently delete a requisition and all its dependent rows.
 * Blocks the operation if any non-cancelled purchase order references it.
 */
export async function deleteRequisitionCascade(
  r: Pick<RequisitionRecord, "id" | "upload_file_path">,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // 1. Guard: active PO references
  const { data: poRows, error: poErr } = await sb
    .from("purchase_order_rows")
    .select("po_id, purchase_orders!inner(po_number, status)")
    .eq("requisition_id", r.id);
  if (poErr) throw new Error(poErr.message);
  const blocking = ((poRows as Array<{ purchase_orders: { po_number: string; status: string } }>) || [])
    .filter((x) => x.purchase_orders && x.purchase_orders.status !== "cancelled")
    .map((x) => x.purchase_orders.po_number);
  if (blocking.length) {
    throw new RequisitionDeleteBlockedError(Array.from(new Set(blocking)));
  }

  // 2. Clean dependent rows that don't cascade automatically.
  const steps: Array<{ table: string }> = [
    { table: "requisition_distribution_log" },
    { table: "purchase_order_rows" },
    { table: "requisition_raw_materials" },
    { table: "requisition_annexures" },
  ];
  for (const s of steps) {
    const { error } = await sb.from(s.table).delete().eq("requisition_id", r.id);
    if (error) throw new Error(`${s.table}: ${error.message}`);
  }

  // 3. Best-effort storage cleanup.
  if (r.upload_file_path) {
    try {
      await supabase.storage.from("requisition-uploads").remove([r.upload_file_path]);
    } catch {
      // ignore
    }
  }

  // 4. Delete the requisition (cascades requisition_items, requisition_lots).
  const { error } = await sb.from("requisitions").delete().eq("id", r.id);
  if (error) throw new Error(error.message);
}