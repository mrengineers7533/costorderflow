import * as XLSX from "xlsx";

export interface ParsedRequisitionItem {
  s_no: number | null;
  description: string;
  make: string | null;
  size_model: string | null;
  material: string | null;
  qty: number | null;
  unit: string | null;
  required_date: string | null;
  purpose: string | null;
  remarks: string | null;
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) map.set(norm(k), v);
  for (const k of keys) {
    const v = map.get(norm(k));
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export async function parseRequisitionExcel(file: File): Promise<ParsedRequisitionItem[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("requisition")) ||
    wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  const out: ParsedRequisitionItem[] = [];
  for (const r of rows) {
    const description = pick(r, ["Item Description", "Description", "Item"]);
    const qtyStr = pick(r, ["Qty", "Quantity"]);
    if (!description && !qtyStr) continue;
    if (!description) continue;
    const sNoStr = pick(r, ["S.No", "SNo", "Sr No", "Sl No"]);
    out.push({
      s_no: sNoStr ? Number(sNoStr) || null : null,
      description,
      make: pick(r, ["Make"]) || null,
      size_model: pick(r, ["Size / Model", "Size", "Model", "Size Model"]) || null,
      material: pick(r, ["Material"]) || null,
      qty: qtyStr ? Number(qtyStr) || null : null,
      unit: pick(r, ["Unit", "UOM"]) || null,
      required_date: pick(r, ["Required Date", "Need By", "Required By", "Due Date"]) || null,
      purpose: pick(r, ["Purpose / Department", "Purpose", "Department", "For"]) || null,
      remarks: pick(r, ["Remarks", "Notes"]) || null,
    });
  }
  return out;
}