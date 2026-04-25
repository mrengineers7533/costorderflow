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
  amount_in_words: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
