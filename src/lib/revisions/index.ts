import { supabase } from "@/integrations/supabase/client";
import type { OrderRecord, LineItem } from "@/lib/orders/types";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";
import { deriveBoqNumber, DEFAULT_BOQ_TERMS } from "@/lib/boq/types";
import { calcPiTotals } from "@/lib/pi/calc";
import { amountInWords, calcExTurkey, calcExMurthal } from "@/lib/orders/calc";
import type { PiRecord } from "@/lib/pi/types";
import { generateBoqPDF } from "@/lib/boq/pdf";

/** Toggle the per-connection "suppress cascaded notifications" flag.
 *  Used so that BOQ/PI rows auto-created or auto-synced as a side effect of
 *  an OA save / revise do not emit their own duplicate notifications. */
async function setNotifSuppress(on: boolean): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)("set_notif_suppress", { p_on: on });
  } catch (e) {
    console.warn(`set_notif_suppress(${on}) failed`, e);
  }
}

async function withNotifSuppress<T>(fn: () => Promise<T>): Promise<T> {
  await setNotifSuppress(true);
  try {
    return await fn();
  } finally {
    await setNotifSuppress(false);
  }
}

/** Snapshot the given BOQ as a PDF in the `boq-documents` bucket under a
 *  history/ prefix so it is never overwritten by future revisions. Best
 *  effort — failures are logged but never break the revision flow. */
async function snapshotPreviousBoqPdf(prevBoq: BoqRecord): Promise<void> {
  try {
    let uid: string | null = prevBoq.user_id ?? null;
    if (!uid) {
      const { data: auth } = await supabase.auth.getUser();
      uid = auth.user?.id ?? null;
    }
    if (!uid) return; // no owner -> RLS would reject; skip silently
    const doc = await generateBoqPDF(prevBoq);
    const blob = doc.output("blob");
    const safe = (prevBoq.boq_number || "BOQ").replace(/[/\\]/g, "_");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `${uid}/${prevBoq.order_id}/history/${safe}-R${prevBoq.revision ?? 0}-${stamp}.pdf`;
    const { error } = await supabase.storage
      .from("boq-documents")
      .upload(path, blob, { upsert: false, contentType: "application/pdf" });
    if (error) console.warn("Snapshot previous BOQ PDF failed", error);
  } catch (e) {
    console.warn("Snapshot previous BOQ PDF threw", e);
  }
}

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
  // Preserve the previous BOQ PDF as a history snapshot BEFORE we create
  // the new revision row, so the old document is never lost/overwritten.
  if (prevBoq) await snapshotPreviousBoqPdf(prevBoq);

  // Determine next BOQ revision number — match the OA revision number.
  const nextRev = orderRev.revision ?? 0;

  // Resolve the user_id we will stamp on the new BOQ row. RLS requires this
  // to match the authenticated user (or be inserted by an admin); otherwise
  // the new BOQ won't show up in the user's BOQ list.
  let ownerId: string | null = orderRev.user_id ?? prevBoq?.user_id ?? null;
  if (!ownerId) {
    const { data: auth } = await supabase.auth.getUser();
    ownerId = auth.user?.id ?? null;
  }

  // Build items from the OA revision; preserve Remarks from prevBoq when the
  // description+model line up (case-insensitive, trimmed match).
  const prevByKey = new Map<string, BoqLineItem>();
  prevBoq?.line_items.forEach((it) => {
    const k = `${(it.description || "").trim().toLowerCase()}|${(it.model_number || "").trim().toLowerCase()}`;
    prevByKey.set(k, it);
  });

  const items: BoqLineItem[] = (orderRev.line_items || []).map((it: LineItem, i: number) => {
    const desc = it.description || "";
    const model = ((it as unknown as { model?: string }).model || "").trim() || it.hsn_code || "";
    const key = `${desc.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
    const prev = prevByKey.get(key);
    const ext = it as unknown as { motor?: string; motor_quantity?: number; motor_price?: number; remarks?: string };
    const prevExt = (prev || {}) as { motor?: string; motor_quantity?: number; motor_price?: number };
    return {
      id: crypto.randomUUID(),
      item_no: String(i + 1),
      model_number: model,
      description: desc,
      quantity: Number(it.quantity) || 0,
      unit: it.unit || "Nos",
      remarks: (ext.remarks || "").trim() || prev?.remarks || "",
      make: (it.make_label || "").trim() || prev?.make || "",
      motor: (ext.motor || "").trim() || prevExt.motor,
      motor_quantity: ext.motor_quantity != null ? Number(ext.motor_quantity) : prevExt.motor_quantity,
      motor_price: ext.motor_price != null ? Number(ext.motor_price) : prevExt.motor_price,
    };
  });

  const payload = {
    order_id: orderRev.id,
    source_order_id: orderRev.id,
    revised_from_id: prevBoq?.id || null,
    user_id: ownerId,
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

  // Suppress notifications generated by the cascaded BOQ/PI updates below.
  // The originating OA save already emits ONE consolidated notification per
  // related department; cascades would otherwise create duplicates.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)("set_notif_suppress", { p_on: true });
  } catch (e) {
    console.warn("set_notif_suppress(true) failed", e);
  }
  try {
  // ---- Sync BOQs ----
  const { data: boqs } = await supabase
    .from("boqs").select("*").in("order_id", familyIds);
  const allBoqs = (boqs || []) as unknown as BoqRecord[];
  // A pending or rejected BOQ blocks new revision creation. Pending = senior
  // is still reviewing. Rejected = user is correcting OA, BOQ will be reset
  // back to pending (in-place below) instead of inserting another revision.
  const hasOpen = allBoqs.some(
    (b) =>
      b.verification_status === "pending_verification" ||
      b.verification_status === "rejected",
  );
  // Decide whether the OA bumped past the current BOQ revision → new pending row.
  const currentBoq = allBoqs.find((b) => b.is_current && b.verification_status !== "pending_verification") || null;
  const oaRev = order.revision ?? 0;
  const shouldCreatePending =
    !hasOpen && !!currentBoq && (currentBoq.revision ?? 0) < oaRev;

  if (shouldCreatePending) {
    await createPendingBoqRevision(order, currentBoq);
  }

  // In-place sync for every existing BOQ row (current + already pending)
  // so descriptions/remarks etc. stay aligned with the latest OA data.
  for (const raw of allBoqs) {
    const prevByModel = new Map<string, BoqLineItem>();
    (raw.line_items || []).forEach((it) => {
      const k = `${(it.model_number || "").trim().toLowerCase()}`;
      if (k) prevByModel.set(k, it);
    });
    const isOpen =
      raw.verification_status === "pending_verification" ||
      raw.verification_status === "rejected";
    const items: BoqLineItem[] = (order.line_items || []).map((it: LineItem, i: number) => {
      const model = ((it as unknown as { model?: string }).model || "").trim() || it.hsn_code || "";
      const prev = prevByModel.get(model.trim().toLowerCase());
      const ext = it as unknown as { motor?: string; motor_quantity?: number; motor_price?: number; remarks?: string };
      const prevExt = (prev || {}) as { motor?: string; motor_quantity?: number; motor_price?: number };
      return {
        id: prev?.id || crypto.randomUUID(),
        item_no: String(i + 1),
        model_number: model,
        // BOQ data always comes from latest OA (no manual description edits).
        description: it.description || "",
        quantity: Number(it.quantity) || 0,
        unit: it.unit || "Nos",
        remarks: (ext.remarks || "").trim() || prev?.remarks || "",
        make: (it.make_label || "").trim() || prev?.make || "",
        motor: (ext.motor || "").trim() || prevExt.motor,
        motor_quantity: ext.motor_quantity != null ? Number(ext.motor_quantity) : prevExt.motor_quantity,
        motor_price: ext.motor_price != null ? Number(ext.motor_price) : prevExt.motor_price,
        // Reset per-item approval whenever OA changes (sync resets review).
        approval_status: isOpen ? "pending" : prev?.approval_status,
        approval_comment: isOpen ? "" : prev?.approval_comment,
      };
    });
    const update: Record<string, unknown> = {
      line_items: items,
      boq_number: deriveBoqNumber(order.oa_number),
      reference_oa_number: order.oa_number,
      project_number: order.cost_sheet_number || order.reference || raw.project_number,
      client_name: order.company_name || order.bill_to?.name || raw.client_name,
      format: order.format,
    };
    let resentToken: string | null = null;
    // If the BOQ was rejected and the user is re-saving the OA at the same
    // revision, treat it as a correction: flip back to pending + new token
    // and re-fire the verification email.
    if (raw.verification_status === "rejected") {
      resentToken = crypto.randomUUID();
      update.verification_status = "pending_verification";
      update.verification_token = resentToken;
      update.verification_requested_at = new Date().toISOString();
      update.verified_at = null;
    }
    await supabase.from("boqs").update(update as never).eq("id", raw.id);
    if (resentToken) {
      try {
        const verificationUrl = `${window.location.origin}/boq-verify/${resentToken}`;
        await supabase.functions.invoke("send-boq-verification", {
          body: {
            boq_id: raw.id,
            boq_number: deriveBoqNumber(order.oa_number),
            oa_number: order.oa_number,
            revision: raw.revision,
            verification_url: verificationUrl,
          },
        });
      } catch (e) {
        console.warn("send-boq-verification (re-submit) invoke failed", e);
      }
    }
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
  } finally {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("set_notif_suppress", { p_on: false });
    } catch (e) {
      console.warn("set_notif_suppress(false) failed", e);
    }
  }
}

/** Insert a new BOQ revision row in 'pending_verification' state.
 *  The previous current BOQ stays current until the senior approves the new
 *  revision via the verification link. */
export async function createPendingBoqRevision(
  orderRev: OrderRecord,
  prevBoq: BoqRecord,
): Promise<BoqRecord | null> {
  // Snapshot the current BOQ PDF before creating a new pending revision so
  // the prior document remains downloadable from history.
  await snapshotPreviousBoqPdf(prevBoq);

  const prevByModel = new Map<string, BoqLineItem>();
  (prevBoq.line_items || []).forEach((it) => {
    const k = (it.model_number || "").trim().toLowerCase();
    if (k) prevByModel.set(k, it);
  });
  const items: BoqLineItem[] = (orderRev.line_items || []).map((it: LineItem, i: number) => {
    const model = ((it as unknown as { model?: string }).model || "").trim() || it.hsn_code || "";
    const prev = prevByModel.get(model.trim().toLowerCase());
    const ext = it as unknown as { motor?: string; motor_quantity?: number; motor_price?: number; remarks?: string };
    const prevExt = (prev || {}) as { motor?: string; motor_quantity?: number; motor_price?: number };
    return {
      id: crypto.randomUUID(),
      item_no: String(i + 1),
      model_number: model,
      description: it.description || "",
      quantity: Number(it.quantity) || 0,
      unit: it.unit || "Nos",
      remarks: (ext.remarks || "").trim() || prev?.remarks || "",
      make: (it.make_label || "").trim() || prev?.make || "",
      motor: (ext.motor || "").trim() || prevExt.motor,
      motor_quantity: ext.motor_quantity != null ? Number(ext.motor_quantity) : prevExt.motor_quantity,
      motor_price: ext.motor_price != null ? Number(ext.motor_price) : prevExt.motor_price,
    };
  });
  const token = crypto.randomUUID();
  const payload = {
    order_id: orderRev.id,
    source_order_id: orderRev.id,
    revised_from_id: prevBoq.id,
    user_id: orderRev.user_id ?? null,
    boq_number: prevBoq.boq_number || deriveBoqNumber(orderRev.oa_number),
    version: 1,
    revision: orderRev.revision ?? 0,
    is_current: false, // pending — previous BOQ stays active until approval
    format: orderRev.format,
    status: "draft" as const,
    prepared_by: orderRev.prepared_by || prevBoq.prepared_by || null,
    boq_date: new Date().toISOString().slice(0, 10),
    reference_oa_number: orderRev.oa_number,
    project_number: orderRev.cost_sheet_number || orderRev.reference || prevBoq.project_number || null,
    client_name: orderRev.company_name || orderRev.bill_to?.name || prevBoq.client_name || null,
    line_items: items,
    terms: prevBoq.terms || DEFAULT_BOQ_TERMS,
    notes: prevBoq.notes || orderRev.notes || null,
    verification_status: "pending_verification",
    verification_token: token,
    verification_requested_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("boqs").insert(payload as never).select().single();
  if (error) {
    console.warn("Failed to create pending BOQ revision", error);
    return null;
  }
  const newBoq = data as unknown as BoqRecord;
  // Fire-and-forget verification email (no-op if recipient not configured).
  try {
    const verificationUrl = `${window.location.origin}/boq-verify/${token}`;
    await supabase.functions.invoke("send-boq-verification", {
      body: {
        boq_id: newBoq.id,
        boq_number: newBoq.boq_number,
        oa_number: orderRev.oa_number,
        revision: newBoq.revision,
        verification_url: verificationUrl,
      },
    });
  } catch (e) {
    console.warn("send-boq-verification invoke failed", e);
  }
  return newBoq;
}

/** Auto-create the initial BOQ for an OA if none exists in its revision family.
 *  Used so that saving an OA (MR or GMS) automatically produces a matching BOQ
 *  row in the BOQ folder — same mapping the manual "Create BOQ from this OA"
 *  button uses. Idempotent: if any BOQ already exists in the family, no-op. */
export async function createInitialBoqForOrder(order: OrderRecord): Promise<BoqRecord | null> {
  // Resolve family ids (root + all revisions).
  const root = order.parent_order_id || order.id;
  const { data: famRows } = await supabase
    .from("orders").select("id").or(`id.eq.${root},parent_order_id.eq.${root}`);
  const familyIds = Array.from(new Set([
    order.id,
    root,
    ...((famRows || []) as Array<{ id: string }>).map((r) => r.id),
  ].filter(Boolean)));

  const { data: existing } = await supabase
    .from("boqs").select("id").in("order_id", familyIds).limit(1);
  if ((existing || []).length > 0) return null;

  let ownerId: string | null = order.user_id ?? null;
  if (!ownerId) {
    const { data: auth } = await supabase.auth.getUser();
    ownerId = auth.user?.id ?? null;
  }

  const items: BoqLineItem[] = (order.line_items || []).map((it: LineItem, i: number) => {
    const ext = it as unknown as { motor?: string; motor_quantity?: number; motor_price?: number; remarks?: string; model?: string };
    return {
      id: crypto.randomUUID(),
      item_no: String(i + 1),
      model_number: (ext.model || "").trim() || it.hsn_code || "",
      description: it.description || "",
      quantity: Number(it.quantity) || 0,
      unit: it.unit || "Nos",
      remarks: (ext.remarks || "").trim(),
      make: (it.make_label || "").trim() || "",
      motor: (ext.motor || "").trim() || undefined,
      motor_quantity: ext.motor_quantity != null ? Number(ext.motor_quantity) : undefined,
      motor_price: ext.motor_price != null ? Number(ext.motor_price) : undefined,
    };
  });

  const payload = {
    order_id: order.id,
    source_order_id: order.id,
    user_id: ownerId,
    boq_number: deriveBoqNumber(order.oa_number),
    version: 1,
    revision: order.revision ?? 0,
    is_current: true,
    format: order.format,
    status: "draft" as const,
    prepared_by: order.prepared_by || null,
    boq_date: new Date().toISOString().slice(0, 10),
    reference_oa_number: order.oa_number,
    project_number: order.cost_sheet_number || order.reference || null,
    client_name: order.company_name || order.bill_to?.name || null,
    line_items: items,
    terms: DEFAULT_BOQ_TERMS,
    notes: order.notes || null,
  };
  const { data, error } = await supabase.from("boqs").insert(payload as never).select().single();
  if (error) {
    console.warn("createInitialBoqForOrder failed", error);
    return null;
  }
  return data as unknown as BoqRecord;
}