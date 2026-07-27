import { supabase } from "@/integrations/supabase/client";

/**
 * Display-only helpers for the requisition reference Price / Vendor fields.
 * These values are captured on Create Requisition and are carried forward to
 * downstream views purely as a buying reference — they never take part in any
 * purchase, PO, tax or total calculation.
 */

export interface RmPriceVendor {
  rm_price: number | null;
  vendor_name: string | null;
}

/** Format a reference price with the app's standard Indian number formatting. */
export function formatReqPrice(v: number | null | undefined): string {
  if (v == null || v === ("" as unknown as number)) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatReqVendor(v: string | null | undefined): string {
  return v && String(v).trim() ? String(v) : "—";
}

/** Fetch price/vendor for a set of requisition_raw_materials ids. */
export async function fetchRmPriceVendor(ids: string[]): Promise<Map<string, RmPriceVendor>> {
  const out = new Map<string, RmPriceVendor>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return out;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data } = await sb
    .from("requisition_raw_materials")
    .select("id, rm_price, vendor_name")
    .in("id", unique);
  for (const r of (data as Array<{ id: string; rm_price: number | null; vendor_name: string | null }>) || []) {
    out.set(r.id, { rm_price: r.rm_price ?? null, vendor_name: r.vendor_name ?? null });
  }
  return out;
}

/**
 * Merge price/vendor for an aggregated (annexure / PO) row that came from
 * several requisition raw-material rows: use the first non-empty value.
 */
export function mergePriceVendor(
  sourceIds: string[],
  map: Map<string, RmPriceVendor>,
): RmPriceVendor {
  let rm_price: number | null = null;
  let vendor_name: string | null = null;
  for (const id of sourceIds) {
    const v = map.get(id);
    if (!v) continue;
    if (rm_price == null && v.rm_price != null) rm_price = v.rm_price;
    if (!vendor_name && v.vendor_name) vendor_name = v.vendor_name;
  }
  return { rm_price, vendor_name };
}
