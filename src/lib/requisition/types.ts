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
  make?: string | null;
  size_model?: string | null;
  lot_no?: string | null;
  plan_status?: "machine" | "3p" | "steel" | null;
}

export interface AnnexureRecord {
  id: string;
  requisition_ids: string[];
  lot_numbers: string[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnexureRowRecord {
  id: string;
  annexure_id: string;
  lot_no: string;
  plan_status: "machine" | "3p" | "steel";
  material: string;
  size_model: string | null;
  make: string | null;
  unit: string | null;
  total_qty: number | null;
  source_rm_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface FgRawMaterialMapRow {
  id: string;
  model_number: string;
  is_direct_purchase: boolean;
  raw_materials: Array<{
    make?: string;
    material: string;
    qty_per_unit: number;
    size_model?: string;
    unit?: string;
    notes?: string;
  }>;
  notes: string | null;
  updated_at: string;
  fg_description_full?: string | null;
}

/**
 * Normalize a Finish Good Column A cell to a single short name.
 * Excel cells often contain "Name\n• long spec…" — keep only the first
 * meaningful line so it can be used as a matching key and a UI label.
 */
export function firstLine(raw: unknown): string {
  if (raw == null) return "";
  let s = String(raw).replace(/\r/g, "\n");
  // first non-empty line
  const line = s.split("\n").map((p) => p.trim()).find((p) => p.length > 0) ?? "";
  s = line;
  // cut on common spec/bullet separators that sometimes share the first line
  const cutMarkers = ["•", " :- ", ":- ", " - ", " – ", " — "];
  for (const m of cutMarkers) {
    const i = s.indexOf(m);
    if (i > 0) s = s.slice(0, i);
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 120) s = s.slice(0, 120).trim();
  return s;
}

export interface RmMasterUploadRow {
  id: string;
  file_path: string;
  original_filename: string;
  sheet_count: number;
  fg_count: number;
  row_count: number;
  uploaded_by: string | null;
  uploaded_by_email: string | null;
  created_at: string;
}