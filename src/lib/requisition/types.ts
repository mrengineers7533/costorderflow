export interface RequisitionRecord {
  id: string;
  requisition_number: string;
  order_root_id: string;
  boq_id: string;
  boq_revision: number;
  status: "draft" | "issued" | "in_purchase" | "closed";
  share_token: string;
  family_token: string | null;
  pdf_path: string | null;
  superseded_by_id: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequisitionItemRecord {
  id: string;
  requisition_id: string;
  boq_item_id: string;
  item_no: string | null;
  model_number: string | null;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  remarks: string | null;
  fg_snapshot: Record<string, unknown>;
  purchase_status: "pending" | "checked" | "lotted" | "ordered";
  lot_no: string | null;
  purchase_category: "steel" | "outside" | null;
  created_at: string;
  updated_at: string;
}

export interface RequisitionLotRecord {
  id: string;
  requisition_id: string;
  lot_no: string;
  category: "steel" | "outside";
  notes: string | null;
  created_at: string;
}