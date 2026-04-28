import type { Charges, LineItem, Totals } from "./types";

export function calcLineAmount(qty: number, rate: number) {
  return Math.round(qty * rate * 100) / 100;
}

export function calcTotals(items: LineItem[], charges: Charges): Totals {
  const basic = items.reduce((s, i) => s + (i.amount || 0), 0);
  const pf = charges.pf_percent
    ? (basic * charges.pf_percent) / 100
    : charges.pf_amount || 0;
  const freight = charges.freight_enabled ? charges.freight || 0 : 0;
  const insurance = charges.insurance_percent
    ? (basic * charges.insurance_percent) / 100
    : charges.insurance || 0;
  const subtotal = basic + pf + insurance + freight;
  const gst = charges.gst_amount ?? (subtotal * (charges.gst_percent || 0)) / 100;
  const grand = subtotal + gst;
  const discount = charges.discount_percent
    ? (grand * charges.discount_percent) / 100
    : charges.discount || 0;
  const net = grand - discount;
  return {
    basic_total: round(basic),
    subtotal: round(subtotal),
    grand_total: round(grand),
    net_payable: round(net),
  };
}

function round(n: number) { return Math.round(n * 100) / 100; }

export interface ExMurthalBreakdown {
  base_amount: number;     // basic_total in INR (FX-converted if applicable)
  hike: number;
  pf: number;
  freight: number;
  total_amount: number;    // 3. landed price (base + hike + pf + freight)
  sea_freight: number;
  sea_insurance: number;
  custom: number;          // 5. (base + sea_freight + sea_insurance) * custom%
  clearing: number;        // 6. (base + sea_freight + sea_insurance) * clearing%
  gst: number;             // 7. (base + sea + ins + custom + clearing) * gst%
  discount: number;        // 8. one-time
  net_payable: number;
}

export function calcExMurthal(
  basicInInr: number,
  c: import("./types").Charges,
): ExMurthalBreakdown {
  const r = (n: number) => Math.round(n * 100) / 100;
  const base = basicInInr;
  const hike = c.hike_enabled ? (c.hike_amount || 0) : 0;
  const pf = c.pf_amount > 0 ? c.pf_amount : (base * (c.pf_percent || 0)) / 100;
  const freight = c.freight_enabled ? (c.freight || 0) : 0;
  const total = base + hike + pf + freight;
  const seaFreight = c.sea_freight_enabled ? (c.sea_freight || 0) : 0;
  const seaInsurance = c.sea_insurance_enabled ? (c.sea_insurance || 0) : 0;
  const customBase = base + seaFreight + seaInsurance;
  const custom = c.custom_enabled ? (customBase * (c.custom_percent ?? 8.25)) / 100 : 0;
  const clearing = c.clearing_enabled ? (customBase * (c.clearing_percent ?? 1.5)) / 100 : 0;
  const gstBase = base + seaFreight + seaInsurance + custom + clearing;
  const gst = c.landed_gst_enabled ? (gstBase * (c.landed_gst_percent ?? 18)) / 100 : 0;
  const discount = c.landed_discount_enabled ? (c.landed_discount || 0) : 0;
  const net = total + seaFreight + seaInsurance + custom + clearing + gst - discount;
  return {
    base_amount: r(base), hike: r(hike), pf: r(pf), freight: r(freight),
    total_amount: r(total), sea_freight: r(seaFreight), sea_insurance: r(seaInsurance),
    custom: r(custom), clearing: r(clearing), gst: r(gst), discount: r(discount),
    net_payable: r(net),
  };
}

export interface ExTurkeyBreakdown {
  base_amount: number;       // 1. basic_total in INR (FX-converted if applicable)
  hike: number;              // 2. optional hike
  total_amount: number;      // 3. base + hike (landed price in INR)
  sea_freight: number;       // 4a
  insurance: number;         // 4b
  custom: number;            // 5. (base + sea_freight) * custom%
  local_freight: number;     // 5b
  gst: number;               // 6. (base + sea + ins + custom + local_freight) * gst%
  discount: number;          // 7. one-time, subtracted from grand total
  grand_total: number;       // total + sea + ins + custom + local + gst
  net_payable: number;       // grand_total - discount
}

export function calcExTurkey(
  basicInInr: number,
  c: import("./types").Charges,
): ExTurkeyBreakdown {
  const r = (n: number) => Math.round(n * 100) / 100;
  const base = basicInInr;
  const hike = c.hike_enabled ? (c.hike_amount || 0) : 0;
  const total = base + hike;
  const landed = total; // "Landed Price" base for % charges (basic + hike)
  const baseFor = (sel?: "basic" | "landed") => (sel === "landed" ? landed : base);
  let seaFreight = 0;
  if (c.turkey_sea_freight_enabled) {
    if ((c.turkey_sea_freight_mode || "amount") === "percent") {
      seaFreight = (baseFor(c.turkey_sea_freight_base) * (c.turkey_sea_freight_percent || 0)) / 100;
    } else {
      seaFreight = c.turkey_sea_freight || 0;
    }
  }
  let insurance = 0;
  if (c.turkey_insurance_enabled) {
    if ((c.turkey_insurance_mode || "amount") === "percent") {
      insurance = (baseFor(c.turkey_insurance_base) * (c.turkey_insurance_percent || 0)) / 100;
    } else {
      insurance = c.turkey_insurance || 0;
    }
  }
  const customBase = c.turkey_custom_base === "landed" ? landed : (base + seaFreight);
  const custom = c.turkey_custom_enabled ? (customBase * (c.turkey_custom_percent ?? 10)) / 100 : 0;
  let localFreight = 0;
  if (c.turkey_local_freight_enabled) {
    if ((c.turkey_local_freight_mode || "amount") === "percent") {
      localFreight = (baseFor(c.turkey_local_freight_base) * (c.turkey_local_freight_percent || 0)) / 100;
    } else {
      localFreight = c.turkey_local_freight || 0;
    }
  }
  const gstBase = base + seaFreight + insurance + custom + localFreight;
  const gst = c.turkey_gst_enabled ? (gstBase * (c.turkey_gst_percent ?? 18)) / 100 : 0;
  const discount = c.turkey_discount_enabled ? (c.turkey_discount || 0) : 0;
  const grand = total + seaFreight + insurance + custom + localFreight + gst;
  const net = grand - discount;
  return {
    base_amount: r(base), hike: r(hike), total_amount: r(total),
    sea_freight: r(seaFreight), insurance: r(insurance),
    custom: r(custom), local_freight: r(localFreight),
    gst: r(gst), discount: r(discount),
    grand_total: r(grand), net_payable: r(net),
  };
}

export function getFinancialYear(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan
  // FY April–March: 2024-25 if Apr 2024–Mar 2025
  const start = m >= 3 ? y : y - 1;
  const end = (start + 1) % 100;
  return `${start}-${String(end).padStart(2, "0")}`;
}

// Auto-detect format from company name and/or line items.
// Rule: if any item is explicitly tagged make=GMS → GMS. Otherwise if any
// item is tagged make=MR → MR. Otherwise fall back to substring scan
// (company name, descriptions, HSN codes) for "GMS"; default MR.
export function detectFormat(
  company: string,
  items?: Array<{ description?: string; hsn_code?: string; make?: "MR" | "GMS" | "OTHER" }>,
): "MR" | "GMS" {
  if (items?.some((i) => i.make === "GMS")) return "GMS";
  if (items?.some((i) => i.make === "MR")) return "MR";
  const haystack = [
    company || "",
    ...(items?.flatMap((i) => [i.description || "", i.hsn_code || ""]) ?? []),
  ]
    .join(" ")
    .toUpperCase();
  if (/\bGMS\b/.test(haystack) || haystack.includes("GMS")) return "GMS";
  return "MR"; // MR Engineers default
}

/** Heuristic make tag for an item that the AI didn't classify. Looks at
 * description + HSN for MR / MR-prefixed model codes vs GMS markers. */
export function inferItemMake(it: { description?: string; hsn_code?: string }): "MR" | "GMS" | "OTHER" {
  const s = `${it.description || ""} ${it.hsn_code || ""}`.toUpperCase();
  if (/\bGMS\b/.test(s)) return "GMS";
  if (/\bM\.?R\.?\b/.test(s) || /\bMR[A-Z]{2,}/.test(s) || s.includes("FOWLER WESTRUP")) return "MR";
  return "OTHER";
}

/** Split a flat item list into the two OA buckets (MR vs GMS).
 *  "OTHER" items are attached to whichever bucket the caller treats as
 *  primary; default is MR so nothing silently disappears. Returns empty
 *  arrays for buckets with no items. */
export function splitItemsByMake(
  items: LineItem[],
  otherGoesTo: "MR" | "GMS" = "MR",
): { mr: LineItem[]; gms: LineItem[] } {
  const mr: LineItem[] = [];
  const gms: LineItem[] = [];
  for (const it of items) {
    const make = it.make || inferItemMake(it);
    if (make === "GMS") gms.push(it);
    else if (make === "MR") mr.push(it);
    else (otherGoesTo === "GMS" ? gms : mr).push(it);
  }
  return { mr, gms };
}

// Number to Indian words (rupees)
const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigit(n: number): string {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
}
function threeDigit(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return (h ? ones[h] + " Hundred" + (r ? " " : "") : "") + (r ? twoDigit(r) : "");
}
export function amountInWords(num: number): string {
  const n = Math.floor(num);
  if (n === 0) return "Zero Rupees Only";
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thou = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(twoDigit(crore) + " Crore");
  if (lakh) parts.push(twoDigit(lakh) + " Lakh");
  if (thou) parts.push(twoDigit(thou) + " Thousand");
  if (rest) parts.push(threeDigit(rest));
  return "INR " + parts.join(" ").trim() + " Only";
}
