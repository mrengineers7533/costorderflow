import { supabase } from "@/integrations/supabase/client";
import type { OrderRecord, LineItem } from "@/lib/orders/types";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";
import { deriveBoqNumber, DEFAULT_BOQ_TERMS } from "@/lib/boq/types";

/** Strip an OrderRecord down to a payload safe for inserting a fresh revision row. */
function stripOrderForInsert(o: OrderRecord) {
  const {
    id: _id, created_at: _c, updated_at: _u,
    revision: _r, is_current: _ic, parent_order_id: _p, revised_from_id: _rf,
    ...rest
  } = o as OrderRecord & Record<string, unknown>;
  // user_id can be null in this app
  return rest as Omit<OrderRecord, "id" | "created_at" | "updated_at" | "revision" | "is_current" | "parent_order_id" | "revised_from_id">;
}

/** Resolve the family root (parent_order_id). Falls back to the row's own id. */
function rootOf(o: Pick<OrderRecord, "id" | "parent_order_id">) {
  return o.parent_order_id || o.id;
}

/** Clone an OA into a new revision row (revision = max+1, is_current = true).
 *  Returns the new OrderRecord. The previous current row is auto-superseded
 *  by the DB trigger.
 *
 *  If `autoReviseBoq` is true and a current BOQ exists for the family, a
 *  matching BOQ revision is also created — pulling the **updated** OA item
 *  data while preserving the previous BOQ's manually edited Remarks (matched
 *  by item description/model) and the previous T&C/Notes. */
export async function reviseOrder(
  source: OrderRecord,
  opts: { autoReviseBoq?: boolean } = { autoReviseBoq: true },
): Promise<{ order: OrderRecord; boq: BoqRecord | null }> {
  const root = rootOf(source);

  // Find current max revision in the family.
  const { data: family, error: famErr } = await supabase
    .from("orders").select("id,revision").eq("parent_order_id", root);
  if (famErr) throw famErr;
  const nextRev = (family?.reduce((m, r) => Math.max(m, (r as { revision: number }).revision ?? 0), 0) || 0) + 1;

  // Insert a new OA row carrying the same content, bumped revision.
  const base = stripOrderForInsert(source);
  const insertPayload = {
    ...base,
    parent_order_id: root,
    revision: nextRev,
    is_current: true,
    revised_from_id: source.id,
    status: "draft" as const, // new revision starts as a draft
  };
  const { data: newOrder, error: insErr } = await supabase
    .from("orders").insert(insertPayload as never).select().single();
  if (insErr) throw insErr;
  const newOrderRec = newOrder as unknown as OrderRecord;

  // Auto-revise BOQ if a current one exists for this family.
  let newBoq: BoqRecord | null = null;
  if (opts.autoReviseBoq) {
    // Find the current BOQ tied to any order in this family.
    const familyIds = (family || []).map((r) => (r as { id: string }).id).concat(source.id);
    const { data: existingBoqs } = await supabase
      .from("boqs").select("*").in("order_id", familyIds);
    const currentBoq = (existingBoqs as unknown as BoqRecord[] | null)?.find((b) => b.is_current);
    if (currentBoq) {
      newBoq = await reviseBoqFromOrder(newOrderRec, currentBoq);
    }
  }

  return { order: newOrderRec, boq: newBoq };
}

/** Build a new BOQ revision from a (possibly new) OA revision, optionally
 *  carrying over remarks/terms/notes from a previous BOQ revision.
 *  Always inserts a fresh row, marks it current, links source_order_id to
 *  the OA revision passed in. */
export async function reviseBoqFromOrder(
  orderRev: OrderRecord,
  prevBoq: BoqRecord | null,
): Promise<BoqRecord> {
  // Determine next BOQ revision number — match the OA revision number.
  const nextRev = orderRev.revision ?? 0;

  // Build items from the OA revision; preserve Remarks from prevBoq when the
  // description+model line up (case-insensitive, trimmed match).
  const prevByKey = new Map<string, BoqLineItem>();
  prevBoq?.line_items.forEach((it) => {
    const k = `${(it.description || "").trim().toLowerCase()}|${(it.model_number || "").trim().toLowerCase()}`;
    prevByKey.set(k, it);
  });

  const items: BoqLineItem[] = (orderRev.line_items || []).map((it: LineItem, i: number) => {
    const desc = it.description || "";
    const model = it.hsn_code || "";
    const key = `${desc.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
    const prev = prevByKey.get(key);
    return {
      id: crypto.randomUUID(),
      item_no: String(i + 1),
      model_number: model,
      description: desc,
      quantity: Number(it.quantity) || 0,
      unit: it.unit || "Nos",
      remarks: prev?.remarks || "",
    };
  });

  const payload = {
    order_id: orderRev.id,
    source_order_id: orderRev.id,
    revised_from_id: prevBoq?.id || null,
    boq_number: prevBoq?.boq_number || deriveBoqNumber(orderRev.oa_number),
    version: 1, // legacy column; we use revision for ordering now
    revision: nextRev,
    is_current: true,
    format: orderRev.format,
    status: "draft" as const,
    prepared_by: orderRev.prepared_by || prevBoq?.prepared_by || null,
    boq_date: new Date().toISOString().slice(0, 10),
    reference_oa_number: orderRev.oa_number,
    project_number: orderRev.cost_sheet_number || orderRev.reference || prevBoq?.project_number || null,
    client_name: orderRev.company_name || orderRev.bill_to?.name || prevBoq?.client_name || null,
    line_items: items,
    terms: prevBoq?.terms || DEFAULT_BOQ_TERMS,
    notes: prevBoq?.notes || orderRev.notes || null,
  };
  const { data, error } = await supabase.from("boqs").insert(payload as never).select().single();
  if (error) throw error;
  return data as unknown as BoqRecord;
}

/** Fetch all OA revisions in a family, newest first, with linked current BOQ ids. */
export async function fetchOrderFamily(rootId: string) {
  const { data, error } = await supabase
    .from("orders").select("*")
    .eq("parent_order_id", rootId)
    .order("revision", { ascending: false });
  if (error) throw error;
  return (data as unknown as OrderRecord[]) || [];
}

/** Fetch all BOQ revisions tied to any OA in the family, newest first. */
export async function fetchBoqsForFamily(orderIds: string[]) {
  if (!orderIds.length) return [];
  const { data, error } = await supabase
    .from("boqs").select("*")
    .in("order_id", orderIds)
    .order("revision", { ascending: false });
  if (error) throw error;
  return (data as unknown as BoqRecord[]) || [];
}