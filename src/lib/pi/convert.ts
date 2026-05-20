import { supabase } from "@/integrations/supabase/client";
import { getFinancialYear, calcTotals, amountInWords, calcExTurkey, calcExMurthal } from "@/lib/orders/calc";
import type { LineItem, OrderRecord } from "@/lib/orders/types";
import { buildClientCopyItems } from "@/lib/orders/clientCopy";
import type { PiRecord } from "./types";
import { calcPiTotals } from "./calc";

export interface OaItemPiStatus {
  done: boolean;
  pi_number?: string;
  pi_id?: string;
  /** Sum of quantities for this OA line item across all current PIs. */
  pi_qty: number;
  /** Sum of amounts (qty × rate) for this OA line item across all current PIs. */
  pi_amount: number;
  /** All PI numbers that include this item (most recent first not guaranteed). */
  pi_numbers: string[];
}

/**
 * For a given OA, returns a map of `lineItem.id` → which current PI (if any)
 * already contains it. Used to disable already-converted items in the
 * OA → PI selection dialog and to guard against duplicate PI generation.
 */
export async function fetchOaItemPiStatus(
  oaId: string,
): Promise<Record<string, OaItemPiStatus>> {
  // Resolve OA family (root + all revisions) so PI quantities created
  // against earlier revisions are carried forward when the OA is revised.
  const { data: oaRow } = await supabase
    .from("orders")
    .select("id, parent_order_id")
    .eq("id", oaId)
    .maybeSingle();
  const root = (oaRow?.parent_order_id as string | null) || oaId;
  const { data: family } = await supabase
    .from("orders")
    .select("id")
    .or(`id.eq.${root},parent_order_id.eq.${root}`);
  const familyIds = ((family || []) as { id: string }[]).map((r) => r.id);
  if (familyIds.length === 0) familyIds.push(oaId);

  const { data, error } = await supabase
    .from("proforma_invoices")
    .select("id, pi_number, line_items, status")
    .in("reference_oa_id", familyIds)
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
      const qty = Number(item.quantity) || 0;
      const amt = Number(item.amount) || qty * (Number(item.unit_rate) || 0);
      const existing = map[item.id];
      if (!existing) {
        map[item.id] = {
          done: true,
          pi_number: pi.pi_number,
          pi_id: pi.id,
          pi_qty: qty,
          pi_amount: amt,
          pi_numbers: [pi.pi_number],
        };
      } else {
        existing.pi_qty += qty;
        existing.pi_amount += amt;
        if (!existing.pi_numbers.includes(pi.pi_number)) {
          existing.pi_numbers.push(pi.pi_number);
        }
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
  /** Optional partial quantities keyed by line item id. Defaults to the
   *  remaining balance qty for each selected item. */
  qtyOverrides?: Record<string, number>,
  /** Optional partial amounts (₹) keyed by line item id. Takes precedence
   *  over `qtyOverrides`. Used by the MR Client-Copy partial-PI flow where
   *  the user enters an amount rather than a qty. */
  amountOverrides?: Record<string, number>,
): Promise<PiRecord> {
  if (!selectedItemIds || selectedItemIds.length === 0) {
    throw new Error("Select at least one item to generate a PI.");
  }

  // Re-check status server-side to validate balance per item.
  const status = await fetchOaItemPiStatus(oa.id);

  const wantedIds = new Set(selectedItemIds);
  // For MR format, partial-PI selection happens against the Client Copy
  // grouped rows (MHE/Fan/Magnet/Spouting + passthrough). Build that view
  // here so synthesized IDs (e.g. `client-copy-mhe`) resolve correctly.
  const sourcePool: LineItem[] =
    oa.format === "MR"
      ? buildClientCopyItems(oa.line_items || [])
      : (oa.line_items || []);
  const sourceItems = sourcePool.filter((it) => wantedIds.has(it.id));
  const filteredItems: LineItem[] = sourceItems.map((it) => {
    const oaQty = Number(it.quantity) || 0;
    const rate = Number(it.unit_rate) || 0;
    const totalAmt = (Number(it.amount) || oaQty * rate);
    const alreadyAmt = status[it.id]?.pi_amount || 0;
    const balanceAmt = Math.max(0, totalAmt - alreadyAmt);
    const alreadyQty = status[it.id]?.pi_qty || 0;
    const balanceQty = Math.max(0, oaQty - alreadyQty);

    const amtReq = amountOverrides?.[it.id];
    let piQty: number;
    let piAmt: number;
    if (amtReq != null) {
      piAmt = Number(amtReq);
      if (!(piAmt > 0)) {
        throw new Error(`Invalid PI amount for "${it.description}".`);
      }
      if (piAmt > balanceAmt + 1e-6) {
        throw new Error(
          `PI amount ${piAmt} exceeds balance ${balanceAmt} for "${it.description}".`,
        );
      }
      piQty = rate > 0 ? piAmt / rate : oaQty;
    } else {
      const requested = qtyOverrides?.[it.id];
      piQty = requested == null ? balanceQty : Number(requested);
      if (!(piQty > 0)) {
        throw new Error(`Invalid PI quantity for "${it.description}".`);
      }
      if (piQty > balanceQty + 1e-9) {
        throw new Error(
          `PI qty ${piQty} exceeds balance ${balanceQty} for "${it.description}".`,
        );
      }
      piAmt = piQty * rate;
    }
    return {
      ...it,
      quantity: piQty,
      amount: piAmt,
    };
  });
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

  // GMS landed-cost overrides — when the OA uses an EXW Turkey/Murthal/CIF
  // breakdown, the PI must carry the exact same calculation chain & totals
  // from the selected OA revision (incl. USD for EXW CIF Port).
  let savedGrand = totals.grand_total_pi;
  let savedNet = totals.net_payable_pi;
  if (oa.format === "GMS") {
    const c = oa.charges;
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
      const grandInr = grandUsd * (rate || 1);
      savedGrand = grandInr;
      savedNet = grandInr;
    }
  }

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
      grand_total: savedGrand,
      net_payable: savedNet,
    },
    amount_in_words: amountInWords(savedNet),
    notes: oa.notes,
    one_time_discount_percent: 0,
    advance_adjustment_percent: 0,
    other_charges: 0,
    advance_mode: "percent",
    advance_amount: 0,
    // Carry currency state from the OA so the PI opens in the same mode.
    currency_mode: ((oa as unknown as { currency_mode?: string }).currency_mode === "USD" ? "USD" : "INR"),
    exchange_rate: ((oa as unknown as { exchange_rate?: number | null }).exchange_rate) ?? null,
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
    .filter((it) => {
      const oaQty = Number(it.quantity) || 0;
      const alreadyQty = status[it.id]?.pi_qty || 0;
      return it.id && oaQty - alreadyQty > 0;
    })
    .map((it) => it.id);
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