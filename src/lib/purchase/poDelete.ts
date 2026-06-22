import { supabase } from "@/integrations/supabase/client";

/**
 * Permanently delete a Purchase Order along with its dependent rows
 * (line items, send log, audit log) and release any RMs that were tied
 * to it via requisition_raw_materials.po_id.
 *
 * Works for both active and cancelled POs — used for cleaning up test or
 * mistakenly-created records.
 */
export async function deletePurchaseOrderCascade(poId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { error: rmErr } = await sb
    .from("requisition_raw_materials")
    .update({ po_id: null })
    .eq("po_id", poId);
  if (rmErr) throw new Error(`requisition_raw_materials: ${rmErr.message}`);

  for (const table of ["purchase_order_rows", "purchase_order_sends", "purchase_order_audit"]) {
    const { error } = await sb.from(table).delete().eq("po_id", poId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  const { error } = await sb.from("purchase_orders").delete().eq("id", poId);
  if (error) throw new Error(error.message);
}