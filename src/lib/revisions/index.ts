import { supabase } from "@/integrations/supabase/client";
import type { OrderRecord, LineItem } from "@/lib/orders/types";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";
import { deriveBoqNumber, DEFAULT_BOQ_TERMS } from "@/lib/boq/types";
import { calcPiTotals } from "@/lib/pi/calc";
import { amountInWords, calcExTurkey, calcExMurthal } from "@/lib/orders/calc";
import type { PiRecord } from "@/lib/pi/types";

/** Strip an OrderRecord down to a payload safe for inserting a fresh revision row. */
function stripOrderForInsert(o: OrderRecord) {
  const {
    id: _id, created_at: _c, updated_at: _u,
    revision: _r, is_current: _ic, parent_order_id: _p, revised_from_id: _rf,
    ...rest
  } = o as OrderRecord & Record<string, unknown>;
  // Sanitize empty-string uuid fields to null (Postgres rejects "" for uuid).
  const cleaned: Record<string, unknown> = { ...rest };
  for (const k of Object.keys(cleaned)) {
    if (cleaned[k] === "" && (k === "user_id" || k.endsWith("_id"))) {
      cleaned[k] = null;
    }
  }
  return cleaned as Omit<OrderRecord, "id" | "created_at" | "updated_at" | "revision" | "is_current" | "parent_order_id" | "revised_from_id">;
}

/** Resolve the family root (parent_order_id). Falls back to the row's own id. */
function rootOf(o: Pick<OrderRecord, "id" | "parent_order_id">) {
  return o.parent_order_id || o.id;
}

function baseOaNumberOf(oaNumber: string) {
  return (oaNumber || "").replace(/\/R\d+$/, "");
}

function revisionFromOaNumber(oaNumber: string) {
  return Number(oaNumber.match(/\/R(\d+)$/)?.[1] || 0);
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
  const sourceRoot = rootOf(source);
  const sourceBaseOaNumber = baseOaNumberOf(source.oa_number);

  // Find the whole revision family by OA number first. This keeps revising
  // legacy rows safe even if parent_order_id was not populated correctly.
  const { data: oaFamily, error: oaFamErr } = await supabase
    .from("orders")
    .select("id,oa_number,revision,parent_order_id")
    .or(`oa_number.eq.${sourceBaseOaNumber},oa_number.like.${sourceBaseOaNumber}/R%`);
  if (oaFamErr) throw oaFamErr;

  const rootRow = (oaFamily || []).find((r) => revisionFromOaNumber((r as { oa_number: string }).oa_number) === 0);
  const root = (rootRow as { id?: string } | undefined)?.id || sourceRoot;
  const family = (oaFamily?.length ? oaFamily : [{ id: source.id, oa_number: source.oa_number, revision: source.revision ?? revisionFromOaNumber(source.oa_number), parent_order_id: source.parent_order_id }]) as Array<{ id: string; oa_number: string; revision?: number | null; parent_order_id?: string | null }>;

  // Find current max revision in the family.
  const { data: linkedFamily, error: famErr } = await supabase
    .from("orders").select("id,oa_number,revision,parent_order_id").eq("parent_order_id", root);
  if (famErr) throw famErr;

  const allFamilyRows = [...family, ...(linkedFamily || [])];
  const maxRevision = allFamilyRows.reduce((m, r) => {
    const row = r as { oa_number?: string; revision?: number | null };
    return Math.max(m, row.revision ?? 0, revisionFromOaNumber(row.oa_number || ""));
  }, 0);
  const nextRev = maxRevision + 1;

  // Derive the revised OA number: <baseOaNumber>/R<nextRev>.
  const baseOaNumber = (rootRow as { oa_number?: string } | undefined)?.oa_number || sourceBaseOaNumber;
  const revisedOaNumber = `${baseOaNumber}/R${nextRev}`;

  // Insert a new OA row carrying the same content, bumped revision.
  const base = stripOrderForInsert(source);
  const insertPayload = {
    ...base,
    oa_number: revisedOaNumber,
    parent_order_id: root,
    revision: nextRev,
    is_current: true,
    revised_from_id: source.id || null,
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
    const familyIds = Array.from(new Set(allFamilyRows.map((r) => (r as { id: string }).id).concat(source.id)));
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

/** New OA-driven model: when an OA is saved, every linked BOQ and PI in
 *  its revision family must auto-update. BOQs keep manually edited
 *  Description (and Remarks); PIs preserve their Advance Adjustment fields
 *  but recompute everything else from the OA. */
export async function syncBoqsAndPisForOrder(order: OrderRecord): Promise<void> {
  // Resolve family ids (root + all revisions).
  const root = order.parent_order_id || order.id;
  const { data: famRows } = await supabase
    .from("orders").select("id").or(`id.eq.${root},parent_order_id.eq.${root}`);
  const familyIds = Array.from(new Set([
    order.id,
    root,
    ...((famRows || []) as Array<{ id: string }>).map((r) => r.id),
  ].filter(Boolean)));

  // ---- Sync BOQs ----
  const { data: boqs } = await supabase
    .from("boqs").select("*").in("order_id", familyIds);
  for (const raw of (boqs || []) as unknown as BoqRecord[]) {
    const prevByModel = new Map<string, BoqLineItem>();
    (raw.line_items || []).forEach((it) => {
      const k = `${(it.model_number || "").trim().toLowerCase()}`;
      if (k) prevByModel.set(k, it);
    });
    const items: BoqLineItem[] = (order.line_items || []).map((it: LineItem, i: number) => {
      const model = it.hsn_code || "";
      const prev = prevByModel.get(model.trim().toLowerCase());
      return {
        id: prev?.id || crypto.randomUUID(),
        item_no: String(i + 1),
        model_number: model,
        // OA description always wins unless the user edited the BOQ description.
        description: prev?.description || it.description || "",
        quantity: Number(it.quantity) || 0,
        unit: it.unit || "Nos",
        remarks: prev?.remarks || "",
      };
    });
    await supabase.from("boqs").update({
      line_items: items,
      reference_oa_number: order.oa_number,
      project_number: order.cost_sheet_number || order.reference || raw.project_number,
      client_name: order.company_name || order.bill_to?.name || raw.client_name,
      format: order.format,
    } as never).eq("id", raw.id);
  }

  // ---- Sync PIs (current rows only) ----
  const { data: pis } = await supabase
    .from("proforma_invoices").select("*")
    .in("reference_oa_id", familyIds)
    .eq("is_current", true);
  for (const raw of (pis || []) as unknown as PiRecord[]) {
    // Keep only the OA items that this PI originally selected (match by id).
    const wanted = new Set((raw.line_items || []).map((it) => it.id).filter(Boolean));
    const items: LineItem[] = (order.line_items || [])
      .filter((it) => wanted.has(it.id))
      // Fallback: if no ids matched (legacy PI), keep PI's own items.
      .map((it) => ({ ...it }));
    const finalItems = items.length ? items : raw.line_items;
    const charges = order.charges; // mirror OA charges exactly

    const advMode = raw.advance_mode || "percent";
    const advValue = advMode === "amount"
      ? (raw.advance_amount || 0)
      : (raw.advance_adjustment_percent || 0);
    const totals = calcPiTotals(
      finalItems,
      charges,
      raw.one_time_discount_percent || 0,
      { mode: advMode, value: advValue },
      raw.other_charges || 0,
    );
    let savedGrand = totals.grand_total_pi;
    let savedNet = totals.net_payable_pi;
    if (order.format === "GMS") {
      if (charges.gms_mode === "EXW_TURKEY") {
        const tk = calcExTurkey(totals.basic_total, charges);
        savedGrand = tk.grand_total; savedNet = tk.net_payable;
      } else if (charges.gms_mode === "EXW_MURTHAL" || charges.ex_murthal_enabled) {
        const m = calcExMurthal(totals.basic_total, charges);
        savedGrand = m.grand_total; savedNet = m.net_payable;
      }
    }
    await supabase.from("proforma_invoices").update({
      line_items: finalItems,
      charges,
      reference_oa_number: order.oa_number,
      bill_to: order.bill_to,
      ship_to: order.ship_to,
      company_name: order.company_name,
      format: order.format,
      totals: {
        basic_total: totals.basic_total,
        subtotal: totals.subtotal,
        grand_total: savedGrand,
        net_payable: savedNet,
      },
      amount_in_words: amountInWords(savedNet),
    } as never).eq("id", raw.id);
  }
}