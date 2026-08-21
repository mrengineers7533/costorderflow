import { supabase } from "@/integrations/supabase/client";

/**
 * Read-only dependency inspection used by delete confirmation dialogs.
 *
 * This module NEVER writes. It only counts what a delete would take with it
 * (through existing database cascade rules) and reports a block reason when a
 * live downstream document would be corrupted.
 */

export type DeleteKind = "order" | "pi" | "boq";

export type DeleteImpact = {
  /** Human readable "X BOQ(s), Y PI(s)" style list of what gets removed too. */
  dependents: string[];
  /** Non-null when the delete must be blocked. */
  blockReason: string | null;
  loading?: boolean;
};

export const EMPTY_IMPACT: DeleteImpact = { dependents: [], blockReason: null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function label(n: number, singular: string) {
  return `${n} ${singular}${n === 1 ? "" : "s"}`;
}

/** Ids of an OA revision family: the row itself plus every descendant revision. */
async function orderFamilyIds(orderId: string, includeFamily: boolean): Promise<string[]> {
  if (!includeFamily) return [orderId];
  const ids = new Set<string>([orderId]);
  const { data } = await sb.from("orders").select("id,parent_order_id").eq("parent_order_id", orderId);
  ((data as Array<{ id: string }>) || []).forEach((r) => ids.add(r.id));
  return Array.from(ids);
}

async function piFamilyIds(piId: string, includeFamily: boolean): Promise<string[]> {
  if (!includeFamily) return [piId];
  const ids = new Set<string>([piId]);
  const { data } = await sb.from("proforma_invoices").select("id").eq("parent_pi_id", piId);
  ((data as Array<{ id: string }>) || []).forEach((r) => ids.add(r.id));
  return Array.from(ids);
}

async function inspectOrder(orderId: string, includeFamily: boolean): Promise<DeleteImpact> {
  const ids = await orderFamilyIds(orderId, includeFamily);
  const [boqRes, piRes] = await Promise.all([
    sb.from("boqs").select("id,boq_number,approval_status").in("order_id", ids),
    sb.from("proforma_invoices").select("id,pi_number").in("reference_oa_id", ids),
  ]);
  const boqs = (boqRes.data as Array<{ id: string; approval_status: string | null }>) || [];
  const pis = (piRes.data as Array<{ id: string; pi_number: string }>) || [];

  const dependents: string[] = [];
  if (ids.length > 1) dependents.push(label(ids.length - 1, "revision"));
  if (boqs.length) dependents.push(label(boqs.length, "linked BOQ"));

  // Blocked when a live downstream document exists.
  if (pis.length) {
    return {
      dependents,
      blockReason: `Referenced by ${label(pis.length, "Proforma Invoice")} (${pis
        .map((p) => p.pi_number)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ")}). Delete those first.`,
    };
  }
  const boqIds = boqs.map((b) => b.id);
  if (boqIds.length) {
    const blocked = await boqDownstreamBlock(boqIds);
    if (blocked) return { dependents, blockReason: blocked };
  }
  return { dependents, blockReason: null };
}

/** Requisitions / POs hanging off the given BOQ ids block the delete. */
async function boqDownstreamBlock(boqIds: string[]): Promise<string | null> {
  const { data: reqs } = await sb
    .from("requisitions")
    .select("id,requisition_number")
    .in("current_boq_id", boqIds);
  const list = (reqs as Array<{ id: string; requisition_number: string }>) || [];
  if (!list.length) return null;

  const { data: rms } = await sb
    .from("requisition_raw_materials")
    .select("po_id")
    .in("requisition_id", list.map((r) => r.id))
    .not("po_id", "is", null);
  const poIds = Array.from(
    new Set(((rms as Array<{ po_id: string | null }>) || []).map((r) => r.po_id).filter(Boolean) as string[]),
  );
  if (poIds.length) {
    const { data: pos } = await sb.from("purchase_orders").select("po_number,status").in("id", poIds);
    const active = ((pos as Array<{ po_number: string; status: string }>) || []).filter(
      (p) => p.status !== "cancelled",
    );
    if (active.length) {
      return `Referenced by active Purchase Order(s): ${Array.from(new Set(active.map((p) => p.po_number)))
        .slice(0, 3)
        .join(", ")}. Cancel or delete those first.`;
    }
  }
  return `Referenced by ${label(list.length, "requisition")} (${list
    .map((r) => r.requisition_number)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ")}). Delete those first.`;
}

async function inspectBoq(boqId: string): Promise<DeleteImpact> {
  const dependents: string[] = [];
  const [statusRes, commentRes, attachRes] = await Promise.all([
    sb.from("boq_item_design_status").select("id", { count: "exact", head: true }).eq("boq_id", boqId),
    sb.from("boq_design_comments").select("id", { count: "exact", head: true }).eq("boq_id", boqId),
    sb.from("boq_item_attachments").select("id", { count: "exact", head: true }).eq("boq_id", boqId),
  ]);
  if (statusRes.count) dependents.push(label(statusRes.count as number, "design status row"));
  if (commentRes.count) dependents.push(label(commentRes.count as number, "design comment"));
  if (attachRes.count) dependents.push(label(attachRes.count as number, "item attachment"));

  const blockReason = await boqDownstreamBlock([boqId]);
  return { dependents, blockReason };
}

async function inspectPi(piId: string, includeFamily: boolean): Promise<DeleteImpact> {
  const ids = await piFamilyIds(piId, includeFamily);
  const dependents: string[] = [];
  if (ids.length > 1) dependents.push(label(ids.length - 1, "revision"));
  const { count } = await sb
    .from("proforma_invoice_documents")
    .select("id", { count: "exact", head: true })
    .in("pi_id", ids);
  if (count) dependents.push(label(count as number, "attached document"));
  return { dependents, blockReason: null };
}

export async function inspectDelete(
  kind: DeleteKind,
  id: string,
  includeFamily = false,
): Promise<DeleteImpact> {
  try {
    if (kind === "order") return await inspectOrder(id, includeFamily);
    if (kind === "boq") return await inspectBoq(id);
    return await inspectPi(id, includeFamily);
  } catch {
    // Never block the UI on an inspection failure — the delete itself still
    // runs against the existing database rules.
    return EMPTY_IMPACT;
  }
}
