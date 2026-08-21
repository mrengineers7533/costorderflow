import type { LineItem } from "./types";

/** Categories for Client Copy summarization. Order = priority (first match wins). */
type GroupKey = "MHE" | "MAGNET" | "FAN" | "SPOUTING";

const GROUP_LABEL: Record<GroupKey, string> = {
  MHE: "Material Handling Equipments (Conveyors, Elevators, VMC's) - approx*",
  MAGNET: "Magnets (J. K.)",
  FAN: "Centrifugal Fans (Ferrari)",
  SPOUTING: "Spouting, Aspiration Ducting & Pneumatic Manifold - approx*",
};

const GROUP_MAKE: Record<GroupKey, string> = {
  MHE: "M.R. Engg",
  SPOUTING: "M.R. Engg",
  FAN: "Ferrari",
  MAGNET: "J. K.",
};

export function detectGroup(desc: string): GroupKey | null {
  const d = (desc || "").toLowerCase();
  // Priority: spouting/ducting bucket first so "Fan Accessories" doesn't get caught by FAN.
  if (/\b(spouting|aspiration ducting|pneumatic manifold|ducting|manifold)\b/.test(d)) return "SPOUTING";
  if (/fan\s*accessor/.test(d)) return "SPOUTING";
  if (/\b(elevator|conveyor|vmc)\b/.test(d)) return "MHE";
  if (/\bmagnet/.test(d)) return "MAGNET";
  // FAN: only true Ferrari-style centrifugal fans. Match "fan" as a whole word
  // but explicitly exclude accessories / fan-cooled / fan-out style mentions.
  // Common forms: "Fan complete w/o ...", "HP Fan complete ...", "Centrifugal Fan ...".
  if (/\bfans?\b/.test(d) && !/fan\s*(accessor|cooled|guard|cowl)/.test(d)) return "FAN";
  return null;
}

/** Build a summarized line-items list for the Client Copy.
 *  - Items in known categories are collapsed into a single labelled row per category.
 *  - All other items pass through unchanged.
 *  Σ(qty × rate) of the synthesized rows equals Σ(amount) of the originals so
 *  downstream charges/totals stay consistent. */
export function buildClientCopyItems(items: LineItem[]): LineItem[] {
  const groups: Record<GroupKey, { qty: number; amount: number; unit?: string }> = {
    MHE: { qty: 0, amount: 0 },
    MAGNET: { qty: 0, amount: 0 },
    FAN: { qty: 0, amount: 0 },
    SPOUTING: { qty: 0, amount: 0 },
  };
  // Consolidate non-grouped duplicates by normalized description.
  // Preserve first-seen order so the OA item sequence is respected.
  const passOrder: string[] = [];
  const passMap = new Map<string, {
    first: LineItem;
    qty: number;
    amount: number;
    rates: Set<number>;
  }>();

  for (const it of items) {
    const g = detectGroup(it.description);
    if (!g) {
      const key = (it.description || "").trim().toLowerCase();
      const qty = Number(it.quantity) || 0;
      const rate = Number(it.unit_rate) || 0;
      const amt = Number(it.amount) || qty * rate;
      let bucket = passMap.get(key);
      if (!bucket) {
        bucket = { first: it, qty: 0, amount: 0, rates: new Set() };
        passMap.set(key, bucket);
        passOrder.push(key);
      }
      bucket.qty += qty;
      bucket.amount += amt;
      bucket.rates.add(rate);
      continue;
    }
    const qty = Number(it.quantity) || 0;
    // Always recompute from qty × rate so a stale `amount` field can never
    // inflate (or under-count) the grouped Client Copy total.
    const rate = Number(it.unit_rate) || 0;
    const amt = qty * rate;
    groups[g].qty += qty;
    groups[g].amount += amt;
    if (!groups[g].unit) groups[g].unit = it.unit;
  }

  const passthrough: LineItem[] = passOrder.map((key) => {
    const b = passMap.get(key)!;
    // If every contributing row had the same rate, keep that rate.
    // Otherwise show effective rate = totalAmount / totalQty.
    const sameRate = b.rates.size === 1;
    const effectiveRate = sameRate
      ? [...b.rates][0]
      : (b.qty > 0 ? b.amount / b.qty : 0);
    return {
      ...b.first,
      quantity: b.qty,
      unit_rate: effectiveRate,
      amount: b.amount,
    };
  });

  // Fixed display order for Client Copy summary rows (spec).
  const FIXED_ORDER: GroupKey[] = ["MHE", "FAN", "MAGNET", "SPOUTING"];
  const summarized: LineItem[] = FIXED_ORDER
    .filter((g) => groups[g].amount > 0 || groups[g].qty > 0)
    .map((g) => {
    const totalAmt = groups[g].amount;
    return {
      // Stable ID (no index suffix) so partial-PI tracking can accumulate
      // across multiple PIs against the same Client Copy group row.
      id: `client-copy-${g.toLowerCase()}`,
      description: GROUP_LABEL[g],
      make_label: GROUP_MAKE[g],
      quantity: 1,
      unit: "Set",
      // qty = 1 Set, so unit_rate equals the grouped total. Keeps
      // qty × rate === amount consistent for any downstream re-calc.
      unit_rate: totalAmt,
      amount: totalAmt,
    };
  });

  // Non-grouped items first (original sequence), then summarized rows.
  return [...passthrough, ...summarized];
}
