import { supabase } from "@/integrations/supabase/client";
import { getFinancialYear, calcTotals, amountInWords, calcExTurkey, calcExMurthal } from "@/lib/orders/calc";
import type { LineItem, OrderRecord } from "@/lib/orders/types";
import type { PiRecord } from "./types";
import { calcPiTotals } from "./calc";

export interface OaItemPiStatus {
  done: boolean;
  pi_number?: string;
  pi_id?: string;
}

/**
 * For a given OA, returns a map of `lineItem.id` → which current PI (if any)
 * already contains it. Used to disable already-converted items in the
 * OA → PI selection dialog and to guard against duplicate PI generation.
 */
export async function fetchOaItemPiStatus(
  oaId: string,
): Promise<Record<string, OaItemPiStatus>> {
  const { data, error } = await supabase
    .from("proforma_invoices")
    .select("id, pi_number, line_items, status")
    .eq("reference_oa_id", oaId)
    .eq("is_current", true);
  if (error) throw error;
  const map: Record<string, OaItemPiStatus> = {};
  for (const pi of ((data || []) as unknown) as Array<{
    id: string;
    pi_number: string;
    line_items: LineItem[] | null;
    status: string;
  }>) {
    // Skip cancelled PIs once that status exists. For now status is
    // 'draft' | 'finalized' so this is a no-op.
    if ((pi.status as string) === "cancelled") continue;
    for (const item of pi.line_items || []) {
      if (!item?.id) continue;
      if (!map[item.id]) {
        map[item.id] = { done: true, pi_number: pi.pi_number, pi_id: pi.id };
      }
    }
  }
  return map;
}

/**
 * Creates a PI from a subset of OA line items. Each call allocates a fresh
 * unique PI number. Throws if any selected item is already part of a current
 * PI for the same OA (server-side duplicate guard).
 */
export async function createPiFromOaItems(
  oa: OrderRecord,
  selectedItemIds: string[],
): Promise<PiRecord> {
  if (!selectedItemIds || selectedItemIds.length === 0) {
    throw new Error("Select at least one item to generate a PI.");
  }

  // Re-check status server-side to prevent races / duplicates.
  const status = await fetchOaItemPiStatus(oa.id);
  const conflict = selectedItemIds.find((id) => status[id]?.done);
  if (conflict) {
    throw new Error(
      `Item is already part of PI ${status[conflict]?.pi_number}. Refresh and try again.`,
    );
  }

  const wantedIds = new Set(selectedItemIds);
  const filteredItems = (oa.line_items || []).filter((it) => wantedIds.has(it.id));
  if (filteredItems.length === 0) {
    throw new Error("Selected items were not found on this OA.");
  }

  const fy = getFinancialYear(new Date());
  const { data: piNum, error: numErr } = await supabase.rpc("next_pi_number", {
    _format: oa.format,
    _financial_year: fy,
  });
  if (numErr || !piNum) throw numErr || new Error("Failed to allocate PI number");

  const totals = calcPiTotals(filteredItems, oa.charges, 0, { mode: "percent", value: 0 }, 0);

  const insertRow = {
    pi_number: piNum as string,
    base_pi_number: piNum as string,
    revision: 0,
    is_current: true,
    parent_pi_id: null,
    revised_from_id: null,
    reference_oa_id: oa.id,
    reference_oa_number: oa.oa_number,
    format: oa.format,
    status: "draft" as const,
    pi_date: new Date().toISOString().slice(0, 10),
    prepared_by: oa.prepared_by,
    company_name: oa.company_name,
    bill_to: oa.bill_to,
    ship_to: oa.ship_to,
    line_items: filteredItems,
    charges: oa.charges,
    totals: {
      basic_total: totals.basic_total,
      subtotal: totals.subtotal,
      grand_total: totals.grand_total_pi,
      net_payable: totals.net_payable_pi,
    },
    amount_in_words: amountInWords(totals.net_payable_pi),
    notes: oa.notes,
    one_time_discount_percent: 0,
    advance_adjustment_percent: 0,
    other_charges: 0,
    advance_mode: "percent",
    advance_amount: 0,
  };

  const { data, error } = await supabase
    .from("proforma_invoices")
    .insert(insertRow as any)
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Failed to create PI");

  await supabase.from("proforma_invoices").update({ parent_pi_id: data.id }).eq("id", data.id);
  return { ...(data as any), parent_pi_id: data.id } as PiRecord;
}

/**
 * Compatibility wrapper: creates a PI from every still-pending OA item
 * (i.e. items not already in a current PI). Prefer the dialog-driven
 * `createPiFromOaItems` for new flows.
 */
export async function createPiFromOa(oa: OrderRecord): Promise<PiRecord> {
  const status = await fetchOaItemPiStatus(oa.id);
  const pendingIds = (oa.line_items || [])
    .map((it) => it.id)
    .filter((id) => id && !status[id]?.done);
  if (pendingIds.length === 0) {
    throw new Error("All items on this OA already have a PI generated.");
  }
  return createPiFromOaItems(oa, pendingIds);
}

/**
 * Creates a new revision of an existing PI. Original is kept unchanged and
 * marked is_current = false (handled by trigger). New row gets /R{n} suffix
 * and shares the same parent_pi_id (family root).
 */
export async function createPiRevision(
  current: PiRecord,
  patch: Partial<PiRecord>,
): Promise<PiRecord> {
  const familyRoot = current.parent_pi_id || current.id;

  // Find the highest revision in this family.
  const { data: family, error: famErr } = await supabase
    .from("proforma_invoices")
    .select("id, revision")
    .eq("parent_pi_id", familyRoot)
    .order("revision", { ascending: false })
    .limit(1);
  if (famErr) throw famErr;
  const maxRev = family && family[0] ? (family[0].revision as number) : current.revision;
  const nextRev = (maxRev || 0) + 1;

  const next = { ...current, ...patch };
  const newPiNumber = `${next.base_pi_number}/R${nextRev}`;
  const totals = calcPiTotals(
    next.line_items,
    next.charges,
    next.one_time_discount_percent,
    {
      mode: next.advance_mode || "percent",
      value: (next.advance_mode || "percent") === "amount"
        ? (next.advance_amount || 0)
        : (next.advance_adjustment_percent || 0),
    },
    next.other_charges || 0,
  );

  // GMS landed-cost overrides — when the PI charges have a gms_mode set,
  // the saved grand/net should come from the EXW Turkey/Murthal breakdown
  // so list views & PDFs match the editor.
  let savedGrand = totals.grand_total_pi;
  let savedNet = totals.net_payable_pi;
  if (next.format === "GMS") {
    const c = next.charges;
    if (c.gms_mode === "EXW_TURKEY") {
      const tk = calcExTurkey(totals.basic_total, c);
      savedGrand = tk.grand_total;
      savedNet = tk.net_payable;
    } else if (c.gms_mode === "EXW_MURTHAL" || c.ex_murthal_enabled) {
      const m = calcExMurthal(totals.basic_total, c);
      savedGrand = m.grand_total;
      savedNet = m.net_payable;
    } else if (c.gms_mode === "EXW_CIF_PORT") {
      const rate = c.cif_pu_dollar_rate || 0;
      const basicUsd = rate > 0 ? totals.basic_total / rate : 0;
      const seaUsd = (c.cif_sea_freight_mode || "amount") === "percent"
        ? (basicUsd * (c.cif_sea_freight_percent || 0)) / 100
        : (c.cif_sea_freight_usd || 0);
      const grandUsd = basicUsd + seaUsd;
      // Persist INR-equivalent so the PI list / reports show consistent values.
      const grandInr = grandUsd * (rate || 1);
      savedGrand = grandInr;
      savedNet = grandInr;
    }
  }

  const row = {
    pi_number: newPiNumber,
    base_pi_number: next.base_pi_number,
    revision: nextRev,
    is_current: true,
    parent_pi_id: familyRoot,
    revised_from_id: current.id,
    reference_oa_id: next.reference_oa_id,
    reference_oa_number: next.reference_oa_number,
    format: next.format,
    status: "draft" as const,
    pi_date: next.pi_date,
    prepared_by: next.prepared_by,
    company_name: next.company_name,
    bill_to: next.bill_to,
    ship_to: next.ship_to,
    line_items: next.line_items,
    charges: next.charges,
    totals: {
      basic_total: totals.basic_total,
      subtotal: totals.subtotal,
      grand_total: savedGrand,
      net_payable: savedNet,
    },
    amount_in_words: amountInWords(savedNet),
    notes: next.notes,
    one_time_discount_percent: next.one_time_discount_percent,
    advance_adjustment_percent: next.advance_adjustment_percent,
    other_charges: next.other_charges || 0,
    advance_mode: next.advance_mode || "percent",
    advance_amount: next.advance_amount || 0,
  };
  const { data, error } = await supabase
    .from("proforma_invoices")
    .insert(row as any)
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Failed to create PI revision");
  return data as any as PiRecord;
}

/** Pull a PI family (original + every revision) ordered by revision asc. */
export async function fetchPiFamily(parentPiId: string): Promise<PiRecord[]> {
  const { data } = await supabase
    .from("proforma_invoices")
    .select("*")
    .eq("parent_pi_id", parentPiId)
    .order("revision", { ascending: true });
  return ((data || []) as any) as PiRecord[];
}

/** Avoid unused imports if `calcTotals` lint flags. */
export const _keep = calcTotals;