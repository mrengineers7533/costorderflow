import { supabase } from "@/integrations/supabase/client";
import { getFinancialYear, calcTotals, amountInWords } from "@/lib/orders/calc";
import type { OrderRecord } from "@/lib/orders/types";
import type { PiRecord } from "./types";
import { calcPiTotals } from "./calc";

/**
 * Creates a new PI (revision 0) from a source OA. Returns the inserted PI row.
 * Multiple PIs can be created from the same OA — each gets a fresh PI number.
 */
export async function createPiFromOa(oa: OrderRecord): Promise<PiRecord> {
  const fy = getFinancialYear(new Date());
  const { data: piNum, error: numErr } = await supabase.rpc("next_pi_number", {
    _format: oa.format,
    _financial_year: fy,
  });
  if (numErr || !piNum) throw numErr || new Error("Failed to allocate PI number");

  // PI starts with no discount/advance — same totals as OA.
  const totals = calcPiTotals(oa.line_items || [], oa.charges, 0, 0);

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
    line_items: oa.line_items,
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
  };

  const { data, error } = await supabase
    .from("proforma_invoices")
    .insert(insertRow as any)
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Failed to create PI");

  // Self-reference parent_pi_id to its own id (root of family).
  await supabase.from("proforma_invoices").update({ parent_pi_id: data.id }).eq("id", data.id);
  return { ...(data as any), parent_pi_id: data.id } as PiRecord;
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
    next.advance_adjustment_percent,
  );

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
      grand_total: totals.grand_total_pi,
      net_payable: totals.net_payable_pi,
    },
    amount_in_words: amountInWords(totals.net_payable_pi),
    notes: next.notes,
    one_time_discount_percent: next.one_time_discount_percent,
    advance_adjustment_percent: next.advance_adjustment_percent,
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