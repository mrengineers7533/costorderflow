import type { LineItem } from "./types";

/** Categories for Client Copy summarization. Order = priority (first match wins). */
type GroupKey = "MHE" | "MAGNET" | "FAN" | "SPOUTING";

const GROUP_LABEL: Record<GroupKey, string> = {
  MHE: "Material Handling Equipments (Conveyors, Elevators, VMC's) - approx*",
  MAGNET: "Magnets (J. K.)",
  FAN: "Centrifugal Fans (Ferrari)",
  SPOUTING: "Spouting, Aspiration Ducting & Pneumatic Manifold - approx*",
};

function detectGroup(desc: string): GroupKey | null {
  const d = (desc || "").toLowerCase();
  // Priority: spouting/ducting bucket first so "Fan Accessories" doesn't get caught by FAN.
  if (/\b(spouting|aspiration ducting|pneumatic manifold|ducting|manifold)\b/.test(d)) return "SPOUTING";
  if (/fan\s*accessor/.test(d)) return "SPOUTING";
  if (/\b(elevator|conveyor|vmc)\b/.test(d)) return "MHE";
  if (/\bmagnet/.test(d)) return "MAGNET";
  if (/\bfan\b/.test(d)) return "FAN";
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
  const passthrough: LineItem[] = [];

  for (const it of items) {
    const g = detectGroup(it.description);
    if (!g) {
      passthrough.push(it);
      continue;
    }
    const qty = Number(it.quantity) || 0;
    const amt = Number(it.amount) || qty * (Number(it.unit_rate) || 0);
    groups[g].qty += qty;
    groups[g].amount += amt;
    if (!groups[g].unit) groups[g].unit = it.unit;
  }

  // Fixed display order for Client Copy summary rows (spec).
  const FIXED_ORDER: GroupKey[] = ["MHE", "FAN", "MAGNET", "SPOUTING"];
  const summarized: LineItem[] = FIXED_ORDER
    .filter((g) => groups[g].amount > 0 || groups[g].qty > 0)
    .map((g, idx) => {
    const totalAmt = groups[g].amount;
    // Group 4 (Spouting bucket) is shown as Qty 1 per spec.
    const qty = g === "SPOUTING" ? 1 : groups[g].qty;
    const rate = qty > 0 ? totalAmt / qty : totalAmt;
    return {
      id: `client-copy-${g.toLowerCase()}-${idx}`,
      description: GROUP_LABEL[g],
      quantity: qty,
      unit: g === "SPOUTING" ? "Lot" : (groups[g].unit || "Nos"),
      unit_rate: rate,
      amount: totalAmt,
    };
  });

  // Non-grouped items first (original sequence), then summarized rows.
  return [...passthrough, ...summarized];
}
