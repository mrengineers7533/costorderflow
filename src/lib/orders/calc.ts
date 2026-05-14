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
  const gst = charges.gst_percent
    ? (subtotal * charges.gst_percent) / 100
    : (charges.gst_amount || 0);
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
  /** Discount on Landed Price (GMS rule). 0 when disabled. */
  landed_discount_amount: number;
  /** Net Landed = Landed - landed_discount_amount. Equals Landed if no discount. */
  net_landed: number;
  /** Grand Total = Net Landed + Insurance + P&F + Freight + GST. */
  grand_total: number;
  /** Advance Adjustment in ₹ (% of Grand Total or flat). */
  advance_amount: number;
  /** EXW Murthal "Amount in INR" rate (₹ per $) used to convert the USD
   *  Landed Price into INR. 0 when feature unused. */
  landed_inr_rate: number;
  /** Net Landed Price × landed_inr_rate. Always in ₹ when active. */
  amount_in_inr: number;
}

export function calcExMurthal(
  basicInInr: number,
  c: import("./types").Charges,
): ExMurthalBreakdown {
  const r = (n: number) => Math.round(n * 100) / 100;
  const base = basicInInr;
  const hike = c.hike_enabled ? (c.hike_amount || 0) : 0;
  const baseWithHike = base + hike;

  // Sea Freight (₹ or %)
  let seaFreight = 0;
  if (c.sea_freight_enabled) {
    const mode = c.murthal_sea_freight_mode || "percent";
    if (mode === "amount") {
      seaFreight = c.murthal_sea_freight_amount || 0;
    } else {
      // legacy `sea_freight` was already a percent of basic
      seaFreight = (baseWithHike * (c.sea_freight || 0)) / 100;
    }
  }

  // Custom Duty — % of (basic + sea) or % of landed
  const customBase1 = (c.murthal_custom_base || "basic") === "landed"
    ? baseWithHike
    : baseWithHike + seaFreight;
  const custom = c.custom_enabled ? (customBase1 * (c.custom_percent ?? 8.25)) / 100 : 0;

  // Clearing — % of (basic + sea) or % of landed
  const clearingBase = (c.murthal_clearing_base || "basic") === "landed"
    ? baseWithHike
    : baseWithHike + seaFreight;
  const clearing = c.clearing_enabled ? (clearingBase * (c.clearing_percent ?? 1.5)) / 100 : 0;

  // Landed Price = Base + Sea Freight + Custom + Clearing
  const landed = baseWithHike + seaFreight + custom + clearing;

  // Discount on Landed Price (GMS rule)
  let landedDiscount = 0;
  if (c.murthal_landed_discount_enabled) {
    if ((c.murthal_landed_discount_mode || "percent") === "percent") {
      landedDiscount = (landed * (c.murthal_landed_discount_percent || 0)) / 100;
    } else {
      landedDiscount = c.murthal_landed_discount_amount || 0;
    }
  }
  const netLanded = Math.max(0, landed - landedDiscount);

  // EXW Murthal — "Amount in INR" rate. When > 0, the user is in USD-
  // up-to-Landed mode: every value at and above Landed Price stays in the
  // input unit (typically USD), and downstream charges (Insurance, P&F,
  // Freight, GST, Discount, Advance, Grand Total, Net Payable) compute on
  // `amountInInr = netLanded × rate` instead of `netLanded`.
  const landedInrRate = c.murthal_landed_inr_rate || 0;
  const inrMode = landedInrRate > 0;
  const downstreamBase = inrMode ? netLanded * landedInrRate : netLanded;

  // Insurance — on downstream base (INR amount when inrMode, else Net Landed)
  let seaInsurance = 0;
  if (c.sea_insurance_enabled) {
    const mode = c.murthal_insurance_mode || "percent";
    if (mode === "amount") {
      seaInsurance = c.murthal_insurance_amount || 0;
    } else {
      // legacy `sea_insurance` was a percent of basic; new behavior uses Net Landed
      // (or `amountInInr` when inrMode)
      const insBase = (c.murthal_insurance_base || "basic") === "landed"
        ? downstreamBase
        : (inrMode ? baseWithHike * landedInrRate : baseWithHike);
      seaInsurance = (insBase * (c.sea_insurance || 0)) / 100;
    }
  }

  // P&F — on downstream base (or legacy basic)
  let pf = 0;
  if (c.murthal_pf_enabled) {
    if ((c.murthal_pf_mode || "percent") === "percent") {
      pf = (downstreamBase * (c.murthal_pf_percent ?? 1.5)) / 100;
    } else {
      pf = c.murthal_pf_amount || 0;
    }
  } else if (c.pf_amount > 0 || c.pf_percent > 0) {
    // legacy: still read pf_amount/pf_percent against basic
    const legacyBase = inrMode ? baseWithHike * landedInrRate : baseWithHike;
    pf = c.pf_amount > 0 ? c.pf_amount : (legacyBase * (c.pf_percent || 0)) / 100;
  }

  // Freight — flat ₹ (new). Legacy `freight_enabled` used % of basic; honor it
  // when the new `murthal_freight_enabled` toggle is unset.
  let freight = 0;
  if (c.murthal_freight_enabled) {
    freight = c.murthal_freight || 0;
  } else if (c.freight_enabled) {
    const legacyBase = inrMode ? baseWithHike * landedInrRate : baseWithHike;
    freight = (legacyBase * (c.freight || 0)) / 100;
  }

  // GST on (downstream base + Insurance + P&F + Freight)
  const gstBase = downstreamBase + seaInsurance + pf + freight;
  const gst = c.landed_gst_enabled ? (gstBase * (c.landed_gst_percent ?? 18)) / 100 : 0;

  // Grand Total = downstream base + Insurance + P&F + Freight + GST
  const grand = downstreamBase + seaInsurance + pf + freight + gst;

  // One-time Discount (after GST) — ₹ or % of Grand Total
  let discount = 0;
  if (c.landed_discount_enabled) {
    if ((c.murthal_one_time_discount_mode || "percent") === "percent") {
      discount = (grand * (c.landed_discount || 0)) / 100;
    } else {
      discount = c.murthal_one_time_discount_amount || 0;
    }
  }

  // Advance Adjustment
  let advance = 0;
  if (c.murthal_advance_enabled) {
    if ((c.murthal_advance_mode || "percent") === "percent") {
      advance = ((grand - discount) * (c.murthal_advance_percent || 0)) / 100;
    } else {
      advance = c.murthal_advance_amount || 0;
    }
  }

  const net = grand - discount - advance;

  return {
    base_amount: r(base),
    hike: r(hike),
    pf: r(pf),
    freight: r(freight),
    total_amount: r(landed),
    sea_freight: r(seaFreight),
    sea_insurance: r(seaInsurance),
    custom: r(custom),
    clearing: r(clearing),
    gst: r(gst),
    discount: r(discount),
    landed_discount_amount: r(landedDiscount),
    net_landed: r(netLanded),
    grand_total: r(grand),
    advance_amount: r(advance),
    net_payable: r(net),
    landed_inr_rate: landedInrRate,
    amount_in_inr: r(inrMode ? netLanded * landedInrRate : 0),
  };
}

export interface ExTurkeyBreakdown {
  base_amount: number;       // 1. basic_total in INR (FX-converted if applicable)
  hike: number;              // 2. optional hike
  /** Landed Price = base + sea_freight + custom (per new GMS rule). */
  total_amount: number;
  sea_freight: number;
  custom: number;            // % of base (default 10)
  /** Discount on Landed Price (GMS rule). 0 if disabled. */
  landed_discount: number;
  /** Net Landed Price = Landed - landed_discount. Equals Landed when no discount. */
  net_landed: number;
  /** Insurance computed on Landed Price (% or flat ₹). */
  insurance: number;
  /** P&F computed on Landed Price (% or flat ₹). */
  pf: number;
  /** Optional flat freight that participates in GST base. */
  freight: number;
  /** Local freight (legacy field, kept for back-compat; no longer in totals chain). */
  local_freight: number;
  /** GST = (Landed + P&F + Insurance + Freight) × gst%. */
  gst: number;
  /** Grand Total = Landed + Insurance + P&F + Freight + GST. */
  grand_total: number;
  /** One-time discount (legacy, kept for back-compat — subtracted before advance). */
  discount: number;
  /** Advance adjustment in ₹ (% of Grand Total or flat). */
  advance_amount: number;
  /** Net Payable = Grand Total - discount - advance. */
  net_payable: number;
}

export function calcExTurkey(
  basicInInr: number,
  c: import("./types").Charges,
): ExTurkeyBreakdown {
  const r = (n: number) => Math.round(n * 100) / 100;
  const base = basicInInr;
  const hike = c.hike_enabled ? (c.hike_amount || 0) : 0;
  const baseWithHike = base + hike;

  // 1. Sea Freight (flat ₹ or % of base)
  let seaFreight = 0;
  if (c.turkey_sea_freight_enabled) {
    if ((c.turkey_sea_freight_mode || "amount") === "percent") {
      seaFreight = (baseWithHike * (c.turkey_sea_freight_percent || 0)) / 100;
    } else {
      seaFreight = c.turkey_sea_freight || 0;
    }
  }

  // 2. Custom Duty: % of base (or base + sea, configurable)
  const customBase = c.turkey_custom_base === "landed"
    ? baseWithHike
    : (baseWithHike + seaFreight);
  const custom = c.turkey_custom_enabled
    ? (customBase * (c.turkey_custom_percent ?? 10)) / 100
    : 0;

  // 3. Landed Price = Base + Sea Freight + Custom
  const landed = baseWithHike + seaFreight + custom;

  // 3b. Discount on Landed Price (GMS rule) — applied BEFORE downstream charges.
  let landedDiscount = 0;
  if (c.turkey_landed_discount_enabled) {
    if ((c.turkey_landed_discount_mode || "percent") === "percent") {
      landedDiscount = (landed * (c.turkey_landed_discount_percent || 0)) / 100;
    } else {
      landedDiscount = c.turkey_landed_discount_amount || 0;
    }
  }
  const netLanded = Math.max(0, landed - landedDiscount);

  // 4. Insurance — on Net Landed Price
  let insurance = 0;
  if (c.turkey_insurance_enabled) {
    if ((c.turkey_insurance_mode || "amount") === "percent") {
      insurance = (netLanded * (c.turkey_insurance_percent || 0)) / 100;
    } else {
      insurance = c.turkey_insurance || 0;
    }
  }

  // 5. P&F — on Net Landed Price
  let pf = 0;
  if (c.turkey_pf_enabled) {
    if ((c.turkey_pf_mode || "percent") === "percent") {
      pf = (netLanded * (c.turkey_pf_percent ?? 0)) / 100;
    } else {
      pf = c.turkey_pf_amount || 0;
    }
  }

  // 6. Freight (optional flat ₹) — included in GST base
  const freight = c.turkey_freight_enabled ? (c.turkey_freight || 0) : 0;

  // 7. GST on (Net Landed + P&F + Insurance + Freight)
  const gstBase = netLanded + pf + insurance + freight;
  const gst = c.turkey_gst_enabled ? (gstBase * (c.turkey_gst_percent ?? 18)) / 100 : 0;

  // 8. Grand Total = Net Landed + Insurance + P&F + Freight + GST
  const grand = netLanded + insurance + pf + freight + gst;

  // Legacy one-time discount (subtracted from Grand Total before advance)
  const discount = c.turkey_discount_enabled ? (c.turkey_discount || 0) : 0;

  // 9. Advance Adjustment
  let advance = 0;
  if (c.turkey_advance_enabled) {
    if ((c.turkey_advance_mode || "percent") === "percent") {
      advance = ((grand - discount) * (c.turkey_advance_percent || 0)) / 100;
    } else {
      advance = c.turkey_advance_amount || 0;
    }
  }

  const net = grand - discount - advance;

  // Local freight kept at 0 — field is legacy and no longer part of the chain.
  const localFreight = 0;

  return {
    base_amount: r(base),
    hike: r(hike),
    total_amount: r(landed),
    sea_freight: r(seaFreight),
    custom: r(custom),
    landed_discount: r(landedDiscount),
    net_landed: r(netLanded),
    insurance: r(insurance),
    pf: r(pf),
    freight: r(freight),
    local_freight: r(localFreight),
    gst: r(gst),
    grand_total: r(grand),
    discount: r(discount),
    advance_amount: r(advance),
    net_payable: r(net),
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

/** Display label for the OA "Make" column. Prefers the verbatim string
 *  captured from the cost sheet (e.g. "GMS (Ugur)", "M.R. Engg. (Halmark)").
 *  Falls back to a friendly default derived from the MR/GMS routing enum so
 *  pre-existing items don't render an empty cell. */
export function displayMake(it: { make_label?: string; make?: "MR" | "GMS" | "OTHER" }): string {
  const lbl = (it.make_label || "").trim();
  if (lbl) return lbl;
  if (it.make === "MR") return "M.R. Engineers";
  if (it.make === "GMS") return "GMS";
  return "";
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

/** USD amount in words using the international (short-scale) numbering
 *  system: Billion / Million / Thousand. Includes cents when fractional. */
export function amountInWordsUSD(num: number): string {
  const whole = Math.floor(num);
  const cents = Math.round((num - whole) * 100);
  if (whole === 0 && cents === 0) return "US Dollar Zero Only";
  const billion = Math.floor(whole / 1_000_000_000);
  const million = Math.floor((whole % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((whole % 1_000_000) / 1000);
  const rest = whole % 1000;
  const parts: string[] = [];
  if (billion) parts.push(threeDigit(billion) + " Billion");
  if (million) parts.push(threeDigit(million) + " Million");
  if (thousand) parts.push(threeDigit(thousand) + " Thousand");
  if (rest) parts.push(threeDigit(rest));
  let s = "US Dollar " + (parts.join(" ").trim() || "Zero");
  if (cents > 0) s += " and " + twoDigit(cents) + " Cents";
  return s + " Only";
}
