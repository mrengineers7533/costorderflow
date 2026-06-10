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

  // 1. Guard: active PO references via requisition_raw_materials.po_id
  const { data: rmPo, error: rmErr } = await sb
    .from("requisition_raw_materials")
    .select("id, po_id")
    .eq("requisition_id", r.id)
    .not("po_id", "is", null);
  if (rmErr) throw new Error(rmErr.message);
  const poIds = Array.from(
    new Set(((rmPo as Array<{ po_id: string | null }>) || []).map((x) => x.po_id).filter(Boolean) as string[]),
  );
  const rmIds = ((rmPo as Array<{ id: string }>) || []).map((x) => x.id);
  if (poIds.length) {
    const { data: pos, error: poErr } = await sb
      .from("purchase_orders").select("po_number, status").in("id", poIds);
    if (poErr) throw new Error(poErr.message);
    const blocking = ((pos as Array<{ po_number: string; status: string }>) || [])
      .filter((p) => p.status !== "cancelled")
      .map((p) => p.po_number);
    if (blocking.length) {
      throw new RequisitionDeleteBlockedError(Array.from(new Set(blocking)));
    }
  }

  // 2. Clean dependent rows that don't cascade automatically.
  // Remove PO rows tied to this requisition's raw materials (all referenced POs are cancelled at this point).
  if (rmIds.length) {
    const { error: porErr } = await sb
      .from("purchase_order_rows").delete().in("raw_material_id", rmIds);
    if (porErr) throw new Error(`purchase_order_rows: ${porErr.message}`);
  }
  const steps = [
    "requisition_distribution_log",
    "requisition_raw_materials",
    "requisition_annexures",
  ];
  for (const table of steps) {
    const { error } = await sb.from(table).delete().eq("requisition_id", r.id);
    if (error) throw new Error(`${table}: ${error.message}`);
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