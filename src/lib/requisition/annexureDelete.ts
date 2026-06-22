import { supabase } from "@/integrations/supabase/client";

export class AnnexureDeleteBlockedError extends Error {
  poNumbers: string[];
  constructor(poNumbers: string[]) {
    super(
      `Cannot delete: referenced by active PO(s): ${poNumbers.join(", ")}. Delete or cancel those POs first.`,
    );
    this.name = "AnnexureDeleteBlockedError";
    this.poNumbers = poNumbers;
  }
}

/**
 * Permanently delete an annexure: clears its rows, releases the linked raw
 * materials so they become re-plannable, then removes the annexure itself.
 *
 * Blocked when an active (non-cancelled) Purchase Order references the
 * annexure id in its annexure_ids[] array.
 */
export async function deleteAnnexureCascade(annexureId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // Guard: any active PO referencing this annexure?
  const { data: pos, error: poErr } = await sb
    .from("purchase_orders")
    .select("po_number, status")
    .contains("annexure_ids", [annexureId]);
  if (poErr) throw new Error(poErr.message);
  const blocking = ((pos as Array<{ po_number: string; status: string }>) || [])
    .filter((p) => p.status !== "cancelled")
    .map((p) => p.po_number);
  if (blocking.length) throw new AnnexureDeleteBlockedError(Array.from(new Set(blocking)));

  // Free linked RMs (same effect as the existing Cancel flow).
  const { error: rmErr } = await sb
    .from("requisition_raw_materials")
    .update({ annexure_status: null, annexure_id: null })
    .eq("annexure_id", annexureId);
  if (rmErr) throw new Error(`requisition_raw_materials: ${rmErr.message}`);

  // Annexure rows.
  const { error: arErr } = await sb
    .from("requisition_annexure_rows")
    .delete()
    .eq("annexure_id", annexureId);
  if (arErr) throw new Error(`requisition_annexure_rows: ${arErr.message}`);

  // The annexure itself.
  const { error } = await sb.from("requisition_annexures").delete().eq("id", annexureId);
  if (error) throw new Error(error.message);
}