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
  included_in_requisition?: boolean;
}

export interface RequisitionLotRecord {
  id: string;
  requisition_id: string;
  lot_no: string;
  category: "steel" | "outside";
  notes: string | null;
  created_at: string;
}

export interface RequisitionRawMaterialRecord {
  id: string;
  requisition_id: string;
  requisition_item_id: string | null;
  model_number: string | null;
  material: string;
  qty_per_unit: number | null;
  fg_quantity: number | null;
  required_qty: number | null;
  unit: string | null;
  source: "mapped" | "manual" | "unmapped_placeholder";
  purchase_status: "pending" | "ordered" | "received";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FgRawMaterialMapRow {
  id: string;
  model_number: string;
  is_direct_purchase: boolean;
  raw_materials: Array<{
    material: string;
    qty_per_unit: number;
    unit?: string;
    notes?: string;
  }>;
  notes: string | null;
  updated_at: string;
}