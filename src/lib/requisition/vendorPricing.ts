/**
 * Vendor Item Master lookup helpers.
 *
 * Pure matching/selection logic so the Requisition Planning page and any
 * future consumer share the same vendor auto-fill behaviour:
 *   1. Preferred active entry wins
 *   2. else lowest active price
 *   3. tie-break on earliest created
 *
 * Matching is done on material + size (case/space-insensitive); when no
 * size match exists we fall back to material-only entries.
 */

export interface VendorItemPrice {
  id: string;
  vendor_id: string | null;
  vendor_name: string;
  material: string;
  size_model: string | null;
  unit: string | null;
  price: number | null;
  is_preferred: boolean;
  is_active: boolean;
  created_at?: string;
}

export function normKey(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Pick the best entry from a candidate list per the documented priority. */
export function pickBestPrice(candidates: VendorItemPrice[]): VendorItemPrice | null {
  const active = candidates.filter((c) => c.is_active !== false);
  if (active.length === 0) return null;
  const preferred = active.filter((c) => c.is_preferred);
  const pool = preferred.length ? preferred : active;
  return pool.slice().sort((a, b) => {
    const pa = a.price == null ? Number.POSITIVE_INFINITY : Number(a.price);
    const pb = b.price == null ? Number.POSITIVE_INFINITY : Number(b.price);
    if (pa !== pb) return pa - pb;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  })[0];
}

export interface VendorPriceIndex {
  /** material+size -> entries */
  bySize: Map<string, VendorItemPrice[]>;
  /** material -> entries */
  byMaterial: Map<string, VendorItemPrice[]>;
}

export function buildVendorPriceIndex(rows: VendorItemPrice[]): VendorPriceIndex {
  const bySize = new Map<string, VendorItemPrice[]>();
  const byMaterial = new Map<string, VendorItemPrice[]>();
  for (const r of rows) {
    const mat = normKey(r.material);
    if (!mat) continue;
    const sizeKey = `${mat}|${normKey(r.size_model)}`;
    if (!bySize.has(sizeKey)) bySize.set(sizeKey, []);
    bySize.get(sizeKey)!.push(r);
    if (!byMaterial.has(mat)) byMaterial.set(mat, []);
    byMaterial.get(mat)!.push(r);
  }
  return { bySize, byMaterial };
}

/** Look up the vendor/price to auto-fill for a raw-material row. */
export function lookupVendorPrice(
  index: VendorPriceIndex,
  material: string | null | undefined,
  sizeModel: string | null | undefined,
): VendorItemPrice | null {
  const mat = normKey(material);
  if (!mat) return null;
  const exact = index.bySize.get(`${mat}|${normKey(sizeModel)}`);
  const hit = exact ? pickBestPrice(exact) : null;
  if (hit) return hit;
  const any = index.byMaterial.get(mat);
  return any ? pickBestPrice(any) : null;
}