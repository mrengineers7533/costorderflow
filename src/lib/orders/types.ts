export type OrderFormat = "MR" | "GMS";

export interface Address {
  name?: string;
  address?: string;
  gstin?: string;
  state?: string;
  state_code?: string;
}

export interface LineItem {
  id: string;
  description: string;
  hsn_code?: string;
  quantity: number;
  unit_rate: number;
  amount: number;
}

export interface Charges {
  pf_percent: number;
  pf_amount: number;
  insurance: number;
  freight_enabled: boolean;
  freight: number;
  gst_percent: number;
  gst_amount: number;
  discount: number;
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
