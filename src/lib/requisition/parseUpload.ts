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

/** Raw-material row parsed from a grouped requisition upload. */
export interface ParsedRequisitionRm {
  material: string;
  size_model: string | null;
  qty: number | null;
  unit: string | null;
  party_name: string | null;
  remarks: string | null;
  lot: string | null;
  category: string | null; // free text; mapped to plan_status downstream
}

/** A Finished Good group: one FG + 1..n raw-material rows below it. */
export interface ParsedRequisitionGroup {
  s_no: number | null;
  fg_description: string;
  fg_quantity: number | null;
  fg_unit: string | null;
  raw_materials: ParsedRequisitionRm[];
}

/** Allowed plan_status enum values in DB. */
export type PlanStatus =
  | "machine" | "3p" | "pipe"
  | "sheet_ss" | "sheet_ms" | "sheet_gi"
  | "structure" | "steel";

/** Map free-text Raw Material Category to a known plan_status (or null). */
export function mapCategoryToPlanStatus(raw: string | null | undefined): PlanStatus | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s === "SHEET SS" || s === "SS SHEET" || s === "STAINLESS SHEET") return "sheet_ss";
  if (s === "SHEET MS" || s === "MS SHEET") return "sheet_ms";
  if (s === "SHEET GI" || s === "GI SHEET") return "sheet_gi";
  if (s === "SHEET") return "sheet_ms";
  if (s === "PIPE") return "pipe";
  if (s === "STEEL") return "steel";
  if (s === "STRUCTURE" || s === "STRUCTURAL") return "structure";
  if (s === "MACHINE" || s === "MACHINED" || s === "MACHINING") return "machine";
  if (s === "3P" || s === "THIRD PARTY" || s === "3 P") return "3p";
  return null;
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

/**
 * Parse the grouped Requisition Excel format. Columns (in order):
 * Sr. No., Finished Good, Quantity Finished Good, UOM Finish Good,
 * Raw Material, Raw Material Size/ Model, Raw Material Reqd Qty,
 * Raw Material Unit, PARTY NAME, REMARKS, LOT, Raw Material Category.
 *
 * Forward-fills the Finished Good columns: blank FG cells inherit the
 * previous FG group, so multiple raw-material rows under one FG stay
 * grouped. Accepts the common typo "Catagpry".
 */
export async function parseGroupedRequisitionExcel(file: File): Promise<ParsedRequisitionGroup[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  const groups: ParsedRequisitionGroup[] = [];
  let current: ParsedRequisitionGroup | null = null;

  for (const r of rows) {
    const sNoStr = pick(r, ["Sr. No.", "S.No", "Sr No", "SrNo", "S No", "Sl No"]);
    const fgDesc = pick(r, ["Finished Good", "FinishedGood", "FG", "Item Description", "Description", "Item"]);
    const fgQty = pick(r, ["Quantity Finished Good", "FG Qty", "FG Quantity", "Qty Finished Good"]);
    const fgUnit = pick(r, ["UOM Finish Good", "UOM Finished Good", "FG Unit", "FG UOM"]);

    const rmMat = pick(r, ["Raw Material", "RawMaterial", "Material"]);
    const rmSize = pick(r, ["Raw Material Size/ Model", "Raw Material Size/Model", "Raw Material Size", "RM Size", "Size / Model", "Size", "Model"]);
    const rmQty = pick(r, ["Raw Material Reqd Qty", "RM Reqd Qty", "Raw Material Qty", "RM Qty", "Qty", "Quantity"]);
    const rmUnit = pick(r, ["Raw Material Unit", "RM Unit", "Unit"]);
    const party = pick(r, ["PARTY NAME", "Party Name", "Party", "Make"]);
    const remarks = pick(r, ["REMARKS", "Remarks", "Notes"]);
    const lot = pick(r, ["LOT", "Lot", "Lot No", "Lot Number"]);
    const category = pick(r, [
      "Raw Material Category",
      "Raw Material Catagpry",
      "RM Category",
      "Category",
    ]);

    const isNewFg = !!fgDesc || !!sNoStr;
    if (isNewFg) {
      if (current) groups.push(current);
      current = {
        s_no: sNoStr ? Number(sNoStr) || null : null,
        fg_description: fgDesc,
        fg_quantity: fgQty ? Number(fgQty) || null : null,
        fg_unit: fgUnit || null,
        raw_materials: [],
      };
    }

    if (rmMat || rmQty) {
      if (!current) {
        current = {
          s_no: null,
          fg_description: "(Unassigned)",
          fg_quantity: null,
          fg_unit: null,
          raw_materials: [],
        };
      }
      current.raw_materials.push({
        material: rmMat,
        size_model: rmSize || null,
        qty: rmQty ? Number(rmQty) || null : null,
        unit: rmUnit || null,
        party_name: party || null,
        remarks: remarks || null,
        lot: lot || null,
        category: category || null,
      });
    }
  }
  if (current) groups.push(current);
  return groups.filter((g) => g.fg_description || g.raw_materials.length > 0);
}

/**
 * Legacy flat-item parser retained for back-compat. Derives a flat list
 * from the grouped parser; falls back to the very old item-only format
 * if no FG/RM headers are detected.
 */
export async function parseRequisitionExcel(file: File): Promise<ParsedRequisitionItem[]> {
  const groups = await parseGroupedRequisitionExcel(file);
  if (groups.length) {
    const out: ParsedRequisitionItem[] = [];
    let sno = 1;
    for (const g of groups) {
      if (g.raw_materials.length === 0) {
        out.push({
          s_no: g.s_no ?? sno++,
          description: g.fg_description,
          make: null,
          size_model: null,
          material: null,
          qty: g.fg_quantity,
          unit: g.fg_unit,
          required_date: null,
          purpose: null,
          remarks: null,
        });
      } else {
        for (const rm of g.raw_materials) {
          out.push({
            s_no: sno++,
            description: g.fg_description || rm.material,
            make: rm.party_name,
            size_model: rm.size_model,
            material: rm.material,
            qty: rm.qty,
            unit: rm.unit,
            required_date: null,
            purpose: null,
            remarks: [
              rm.remarks,
              rm.lot ? `Lot: ${rm.lot}` : null,
              rm.category ? `Cat: ${rm.category}` : null,
            ].filter(Boolean).join(" · ") || null,
          });
        }
      }
    }
    return out;
  }
  return parseLegacyItemExcel(file);
}

async function parseLegacyItemExcel(file: File): Promise<ParsedRequisitionItem[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const out: ParsedRequisitionItem[] = [];
  for (const r of rows) {
    const description = pick(r, ["Item Description", "Description", "Item"]);
    const qtyStr = pick(r, ["Qty", "Quantity"]);
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