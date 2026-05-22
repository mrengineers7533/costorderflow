import type { LineItem } from "@/lib/orders/types";

/** Build a resolver that returns the best Make string for a BOQ item.
 *  Priority:
 *   1. `boqItem.make` (trimmed)
 *   2. OA line whose trimmed/lowercased description + model/hsn match
 *   3. OA line at the same row index
 *   4. "" (empty)
 *
 *  Pure / read-only — used to surface OA Make on BOQ-derived rows whose
 *  `make` field was not yet captured at the time the BOQ was created.
 */
export function buildMakeResolver(orderLineItems: LineItem[] | null | undefined) {
  const items = Array.isArray(orderLineItems) ? orderLineItems : [];
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const byKey = new Map<string, string>();
  items.forEach((it) => {
    const model = (it.model || it.hsn_code || "").toString();
    const k = `${norm(it.description)}|${norm(model)}`;
    const m = (it.make_label || "").trim();
    if (m && !byKey.has(k)) byKey.set(k, m);
  });

  return function resolveMake(
    boqItem: { make?: string; description?: string; model_number?: string } | null | undefined,
    index?: number,
  ): string {
    const own = (boqItem?.make || "").trim();
    if (own) return own;
    const k = `${norm(boqItem?.description)}|${norm(boqItem?.model_number)}`;
    const hit = byKey.get(k);
    if (hit) return hit;
    if (typeof index === "number" && index >= 0 && index < items.length) {
      return (items[index].make_label || "").trim();
    }
    return "";
  };
}