export type OrderFormat = "MR" | "GMS";

export interface Address {
  name?: string;
  address?: string;
  gstin?: string;
  state?: string;
  state_code?: string;
  contact_person?: string;
  contact_number?: string;
  email?: string;
}

export interface LineItem {
  id: string;
  description: string;
  hsn_code?: string;
  quantity: number;
  /** Unit of measure (Nos, Set, Kg, Mtr, etc.). Defaults to "Nos". */
  unit?: string;
  unit_rate: number;
  amount: number;
  /** Which company makes this item. Drives MR vs GMS OA split. */
  make?: "MR" | "GMS" | "OTHER";
}

export interface Charges {
  pf_percent: number;
  pf_amount: number;
  insurance: number;
  insurance_percent: number;
  freight_enabled: boolean;
  freight: number;
  gst_percent: number;
  gst_amount: number;
  discount: number;
  discount_percent: number;
  /** Ex-works foreign-currency fields (used by GMS Turkey-style orders).
   *  When `currency` is set and not "INR", `unit_rate`/`amount` on line items
   *  represent the foreign-currency value and `fx_rate` converts to INR. */
  currency?: string;       // e.g. "USD", "EUR"; undefined or "INR" = domestic
  currency_symbol?: string; // e.g. "$", "€"; defaults derived from currency
  fx_rate?: number;        // 1 unit foreign = X INR (e.g. 81.85)
  advance_percent?: number; // e.g. 40 for "Advance Required @ 40%"
  /** Ex-works Murthal (GMS imports landed-cost) breakdown.
   *  Each toggle hides the line from the preview & total. Percentages are
   *  applied against (basic_total + sea_freight + insurance) per the spec. */
  ex_murthal_enabled?: boolean;
  hike_enabled?: boolean;
  hike_amount?: number;       // optional manual hike on basic
  sea_freight_enabled?: boolean;
  sea_freight?: number;       // INR
  sea_insurance_enabled?: boolean;
  sea_insurance?: number;     // INR
  custom_enabled?: boolean;
  custom_percent?: number;    // default 8.25
  clearing_enabled?: boolean;
  clearing_percent?: number;  // default 1.5
  landed_gst_enabled?: boolean;
  landed_gst_percent?: number; // default 18
  landed_discount_enabled?: boolean;
  landed_discount?: number;    // one-time INR

  /** GMS pricing mode. When set, the GMS preview/PDF uses the
   *  EXW-Turkey or EXW-Murthal landed-cost layout. Leave undefined
   *  to keep the legacy GMS totals (Ex-works Murthal Price + P&F + GST). */
  gms_mode?: "EXW_TURKEY" | "EXW_MURTHAL" | "EXW_CIF_PORT";

  /** EXW CIF Port (GMS only). USD-only flow.
   *  Calculation: Basic Total (USD) + Sea Freight (USD) = Grand Total (USD).
   *  No GST / P&F / insurance / freight / discount / advance.
   *  `cif_pu_dollar_rate` is the user-entered "PU Dollar Rate" used to
   *  convert the INR cost-sheet item totals to USD for display & PDF. */
  cif_pu_dollar_rate?: number;     // 1 USD = X INR
  cif_sea_freight_usd?: number;    // entered directly in USD

  /** EXW-Turkey landed-cost rows (each toggle hides the line).
   *  Sea Freight & Insurance are flat INR. Custom is a % applied to
   *  (basic + sea_freight). Local Freight can be flat ₹ or % of basic.
   *  Landed GST applies to (basic + sea_freight + insurance + custom + local_freight).
   *  One-time discount is subtracted from the Grand Total (after GST). */
  turkey_sea_freight_enabled?: boolean;
  turkey_sea_freight?: number;          // INR
  turkey_sea_freight_mode?: "amount" | "percent"; // default "amount"
  turkey_sea_freight_percent?: number;  // % of basic (if percent)
  turkey_sea_freight_base?: "basic" | "landed"; // default "basic"
  turkey_insurance_enabled?: boolean;
  turkey_insurance?: number;            // INR
  turkey_insurance_mode?: "amount" | "percent"; // default "amount"
  turkey_insurance_percent?: number;    // % of basic (if percent)
  turkey_insurance_base?: "basic" | "landed"; // default "basic"
  turkey_custom_enabled?: boolean;
  turkey_custom_percent?: number;       // default 10
  turkey_custom_base?: "basic" | "landed"; // default "basic" (was: basic + sea_freight)
  turkey_local_freight_enabled?: boolean;
  turkey_local_freight_mode?: "amount" | "percent"; // default "amount"
  turkey_local_freight?: number;        // INR (if amount)
  turkey_local_freight_percent?: number;// % of basic (if percent)
  turkey_local_freight_base?: "basic" | "landed"; // default "basic"
  turkey_gst_enabled?: boolean;
  turkey_gst_percent?: number;          // default 18
  turkey_discount_enabled?: boolean;
  turkey_discount?: number;             // one-time INR

  /** EXW-Turkey extras (new GMS rule):
   *  Insurance & P&F are computed on the Landed Price (base + sea_freight + custom).
   *  Freight is an optional flat ₹ that joins the GST base.
   *  Advance Adjustment is subtracted from the Grand Total to produce Net Payable. */
  turkey_pf_enabled?: boolean;
  turkey_pf_mode?: "amount" | "percent"; // default "percent"
  turkey_pf_percent?: number;            // default 1.5
  turkey_pf_amount?: number;             // flat ₹
  turkey_freight_enabled?: boolean;
  turkey_freight?: number;               // flat ₹
  turkey_advance_enabled?: boolean;
  turkey_advance_mode?: "amount" | "percent"; // default "percent"
  turkey_advance_percent?: number;       // % of Grand Total
  turkey_advance_amount?: number;        // flat ₹

  /** Discount on Landed Price (GMS Turkey only).
   *  When enabled, Discount Amount = Landed × % (or flat ₹).
   *  Net Landed Price = Landed - Discount Amount.
   *  All downstream charges (Insurance, P&F, GST) compute on Net Landed Price. */
  turkey_landed_discount_enabled?: boolean;
  turkey_landed_discount_mode?: "amount" | "percent"; // default "percent"
  turkey_landed_discount_percent?: number;            // % of Landed Price
  turkey_landed_discount_amount?: number;             // flat ₹

  /** EXW Murthal extras — mirror of the EXW Turkey controls so each
   *  Murthal row can be enabled/disabled, switched between flat ₹ and %,
   *  and (where relevant) target either the basic or the landed base. The
   *  legacy `sea_freight`, `sea_insurance`, `custom_percent`, `clearing_percent`,
   *  `landed_gst_percent`, `landed_discount` fields stay for back-compat
   *  and are still read when the new `*_mode` / `*_amount` fields are unset. */
  murthal_sea_freight_mode?: "amount" | "percent"; // default "percent"
  murthal_sea_freight_amount?: number;             // flat ₹ (when mode="amount")
  murthal_sea_freight_base?: "basic" | "landed";   // default "basic"
  murthal_insurance_mode?: "amount" | "percent";   // default "percent"
  murthal_insurance_amount?: number;
  murthal_insurance_base?: "basic" | "landed";     // default "basic"
  murthal_custom_base?: "basic" | "landed";        // default "basic" (basic + sea)
  murthal_clearing_base?: "basic" | "landed";      // default "basic" (basic + sea)
  murthal_landed_discount_enabled?: boolean;
  murthal_landed_discount_mode?: "amount" | "percent"; // default "percent"
  murthal_landed_discount_percent?: number;
  murthal_landed_discount_amount?: number;
  murthal_pf_enabled?: boolean;
  murthal_pf_mode?: "amount" | "percent";          // default "percent"
  murthal_pf_percent?: number;                     // default 1.5
  murthal_pf_amount?: number;
  murthal_freight_enabled?: boolean;
  murthal_freight?: number;                        // flat ₹ — joins GST base
  murthal_one_time_discount_mode?: "amount" | "percent"; // default "percent"
  murthal_one_time_discount_amount?: number;
  murthal_advance_enabled?: boolean;
  murthal_advance_mode?: "amount" | "percent";     // default "percent"
  murthal_advance_percent?: number;
  murthal_advance_amount?: number;

  /** When false, the OA discount row is hidden in the editor breakdown and
   *  omitted from the PDF (even if a discount value was entered). Default true
   *  if any discount is set, undefined otherwise. */
  apply_discount?: boolean;
  /** Custom label for the discount line in the editor & PDF. Default
   *  "One Time Very Special Discount". */
  discount_label?: string;

  /** MR Advance Adjustment (deducted from Grand Total to produce Net Payable).
   *  Mirrors the GMS Turkey/Murthal advance behaviour so MR OAs can show an
   *  advance line and a Net Payable row. */
  mr_advance_enabled?: boolean;
  mr_advance_mode?: "amount" | "percent"; // default "percent"
  mr_advance_percent?: number;            // % of Grand Total
  mr_advance_amount?: number;             // flat ₹

  /** Phase 1 — GMS Turkey USD/INR display toggle.
   *  When set to "USD" and `fx_rate` (cost-sheet $ rate) > 0, the EXW Turkey
   *  totals block in the live preview and PDF is rendered in USD by dividing
   *  each INR value by `fx_rate`. The underlying calculations stay in INR so
   *  no existing math is disturbed — this is a presentation-only switch. */
  display_currency?: "INR" | "USD";
}

export interface Totals {
  basic_total: number;
  subtotal: number;
  grand_total: number;
  net_payable: number;
}

export interface OrderRecord {
  id: string;
  user_id: string;
  oa_number: string;
  format: OrderFormat;
  status: "draft" | "finalized";
  company_name: string | null;
  bill_to: Address;
  ship_to: Address;
  reference: string | null;
  cost_sheet_number: string | null;
  order_date: string;
  prepared_by: string | null;
  line_items: LineItem[];
  charges: Charges;
  totals: Totals;
  /** Independent GMS-side charges for mixed-make OAs. When the OA contains
   *  both MR and GMS items, `charges` holds the MR side and `charges_gms`
   *  holds the GMS side. Single-make OAs leave this null/undefined. */
  charges_gms?: Charges | null;
  amount_in_words: string | null;
  notes: string | null;
  /** Optional free-form note shown on the PDF inside the Terms & Conditions
   *  block (separate from the internal-only `notes` field). */
  tc_note?: string | null;
  created_at: string;
  updated_at: string;
  /** Family root — same value across every revision of an OA. */
  parent_order_id?: string;
  /** 0 = original; 1, 2, … = revision number. */
  revision?: number;
  /** Only one row per family is true. */
  is_current?: boolean;
  /** The id of the immediately previous revision (null for rev 0). */
  revised_from_id?: string | null;
}

/** A single placement on a template page. Coordinates are normalized 0..1
 * relative to the page (origin top-left). */
export interface FieldPlacement {
  page: number;          // 1-based page index
  x: number;             // 0..1 (left)
  y: number;             // 0..1 (top)
  width?: number;        // 0..1 (optional, used for wrapping/tables)
  fontSize?: number;     // points; default 10
  align?: "left" | "right" | "center";
  bold?: boolean;
}

/** Keys map to data extracted from an OrderRecord; "items_table" is special. */
export type FieldMapKey =
  | "oa_number"
  | "order_date"
  | "reference"
  | "cost_sheet_number"
  | "prepared_by"
  | "company_name"
  | "bill_to_name" | "bill_to_address" | "bill_to_gstin" | "bill_to_state"
  | "ship_to_name" | "ship_to_address" | "ship_to_gstin" | "ship_to_state"
  | "items_table"
  | "basic_total" | "pf_amount" | "insurance" | "freight"
  | "subtotal" | "gst_amount" | "grand_total" | "discount" | "net_payable"
  | "amount_in_words"
  | "notes";

export type FieldMap = Partial<Record<FieldMapKey, FieldPlacement>>;

export interface OrderTemplate {
  id: string;
  format: OrderFormat;
  file_path: string;
  page_count: number;
  field_map: FieldMap;
  updated_at: string;
}

export const FIELD_LABELS: Record<FieldMapKey, string> = {
  oa_number: "OA Number",
  order_date: "Order Date",
  reference: "Reference",
  cost_sheet_number: "Cost Sheet No.",
  prepared_by: "Prepared By",
  company_name: "Company Name",
  bill_to_name: "Bill To · Name",
  bill_to_address: "Bill To · Address",
  bill_to_gstin: "Bill To · GSTIN",
  bill_to_state: "Bill To · State",
  ship_to_name: "Ship To · Name",
  ship_to_address: "Ship To · Address",
  ship_to_gstin: "Ship To · GSTIN",
  ship_to_state: "Ship To · State",
  items_table: "Line Items Table",
  basic_total: "Basic Total",
  pf_amount: "P&F Amount",
  insurance: "Insurance",
  freight: "Freight",
  subtotal: "Subtotal",
  gst_amount: "GST Amount",
  grand_total: "Grand Total",
  discount: "Discount",
  net_payable: "Net Payable",
  amount_in_words: "Amount in Words",
  notes: "Notes",
};
