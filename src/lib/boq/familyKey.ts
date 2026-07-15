import type { BoqRecord } from "@/lib/boq/types";

/**
 * Strip a trailing `/R<digits>` suffix from a BOQ / OA number so that base
 * and revised documents share the same stem.
 * `26-27/GMSBOQ/0004/R1` → `26-27/GMSBOQ/0004`
 */
export function stripRevisionSuffix(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\/R\d+\s*$/i, "").trim();
}

/**
 * Resolve a stable family key for a BOQ row.
 *
 * Priority:
 *  1. OA family root via `orders.parent_order_id` (admin path — unchanged).
 *  2. `boq_number` stem (revision suffix stripped) — works for non-admin
 *     users whose `orders` RLS hides sibling revision rows.
 *  3. `reference_oa_number` stem.
 *  4. `order_id` or `id` as a last resort.
 */
export function boqFamilyKey(
  b: Pick<BoqRecord, "id" | "order_id" | "boq_number" | "reference_oa_number">,
  rootById: Map<string, string>,
): string {
  const root = b.order_id ? rootById.get(b.order_id) : undefined;
  if (root) return root;
  const stem = stripRevisionSuffix(b.boq_number);
  if (stem) return `boq:${stem}`;
  const oaStem = stripRevisionSuffix(b.reference_oa_number);
  if (oaStem) return `oa:${oaStem}`;
  return b.order_id || b.id;
}