import type { Charges, LineItem } from "@/lib/orders/types";

export type CurrencyMode = "INR" | "USD";

/** Money fields on Charges that hold an INR-style flat amount and should
 *  be scaled when toggling currency. Percent fields, modes and toggles are
 *  intentionally excluded. `cif_sea_freight_usd` is also excluded — that
 *  value is already entered in USD by the user. */
const CHARGE_MONEY_FIELDS: (keyof Charges)[] = [
  "pf_amount",
  "insurance",
  "freight",
  "gst_amount",
  "discount",
  "hike_amount",
  "sea_freight",
  "sea_insurance",
  "landed_discount",
  "turkey_sea_freight",
  "turkey_insurance",
  "turkey_local_freight",
  "turkey_discount",
  "turkey_pf_amount",
  "turkey_freight",
  "turkey_advance_amount",
  "turkey_landed_discount_amount",
  "murthal_sea_freight_amount",
  "murthal_insurance_amount",
  "murthal_landed_discount_amount",
  "murthal_pf_amount",
  "murthal_freight",
  "murthal_one_time_discount_amount",
  "murthal_advance_amount",
  "mr_advance_amount",
];

function scale(n: unknown, factor: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return Number(n) || 0;
  return Math.round(v * factor * 100) / 100;
}

export function convertItems(items: LineItem[], factor: number): LineItem[] {
  return (items || []).map((it) => ({
    ...it,
    unit_rate: scale(it.unit_rate, factor),
    amount: scale(it.amount, factor),
  }));
}

export function convertCharges(charges: Charges, factor: number): Charges {
  const next: Charges = { ...charges };
  const bag = next as unknown as Record<string, unknown>;
  for (const k of CHARGE_MONEY_FIELDS) {
    const cur = bag[k as string];
    if (typeof cur === "number" && cur !== 0) {
      bag[k as string] = scale(cur, factor);
    }
  }
  return next;
}

/** Returns the multiplier that takes a value FROM `from` TO `to`.
 *  rate is ₹ per $ (must be > 0 when crossing currencies). */
export function conversionFactor(from: CurrencyMode, to: CurrencyMode, rate: number): number {
  if (from === to) return 1;
  if (!(rate > 0)) return 1;
  return from === "INR" ? 1 / rate : rate;
}

export function currencySymbol(mode: CurrencyMode): string {
  return mode === "USD" ? "$" : "₹";
}
