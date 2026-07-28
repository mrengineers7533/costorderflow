import * as XLSX from "xlsx";

export const VENDOR_HEADERS = [
  "Name",
  "Categories",
  "GSTIN",
  "State Code",
  "Address",
  "Contact Person",
  "Phone",
  "Email",
  "Payment Terms",
  "Active",
] as const;

export const VENDOR_ITEM_HEADERS = [
  "Vendor Name",
  "Material",
  "Size/Model",
  "UOM",
  "Price",
  "Preferred",
  "Active",
  "Notes",
] as const;

export interface VendorRow {
  name: string;
  categories: string[];
  gstin: string | null;
  state_code: string | null;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  payment_terms: string | null;
  is_active: boolean;
}

export interface VendorItemRow {
  vendor_name: string;
  material: string;
  size_model: string | null;
  unit: string | null;
  price: number | null;
  is_preferred: boolean;
  is_active: boolean;
  notes: string | null;
}

/** A vendor-item row as parsed, together with any validation issues found. */
export interface VendorItemParsedRow extends VendorItemRow {
  /** Excel line number (header = 1). */
  row_no: number;
  /** Human readable reasons this row cannot be used as-is. Empty = valid. */
  issues: string[];
  /** Verbatim Excel cell values so the row can be corrected later. */
  source: Record<string, string>;
}

export interface ParseResult<T> {
  rows: T[];
  skipped: { row: number; reason: string }[];
  total: number;
}

export function exportVendorTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    VENDOR_HEADERS as unknown as string[],
    ["Shree Steel Traders", "steel", "27AAAAA0000A1Z5", "27", "Plot 12, MIDC, Pune", "Ramesh Patil", "9876543210", "sales@shreesteel.com", "NEFT/RTGS", "Yes"],
    ["Precision Machines Pvt Ltd", "machine, 3p", "24BBBBB1111B2Z6", "24", "Unit 4, GIDC, Rajkot", "Nikhil Shah", "9825011111", "nikhil@precision.com", "30 Days", "Yes"],
  ]);
  ws["!cols"] = [{ wch: 30 }, { wch: 22 }, { wch: 20 }, { wch: 10 }, { wch: 34 }, { wch: 20 }, { wch: 14 }, { wch: 26 }, { wch: 18 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, "Vendors");

  const inst = XLSX.utils.aoa_to_sheet([
    ["Vendor Master Template — Instructions"],
    [""],
    ["1. Use the 'Vendors' sheet. Do NOT rename or reorder the header row."],
    ["2. Required: Name only."],
    ["3. Categories are free text — put one or more, comma separated (e.g. steel, bearing, pulley)."],
    ["4. Active accepts Yes/No (blank = Yes)."],
    ["5. A vendor whose Name already exists will be UPDATED, otherwise created."],
    ["6. Supported formats: .xlsx, .xls"],
  ]);
  inst["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, inst, "Instructions");
  XLSX.writeFile(wb, "Vendor_Master_Template.xlsx");
}

export function exportVendorItemTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    VENDOR_ITEM_HEADERS as unknown as string[],
    ["Shree Steel Traders", "MS SHEET", "1250X2500X8MM", "NOS", 4250, "Yes", "Yes", "Rate valid till Mar"],
    ["Shree Steel Traders", "MS ANGLE", "32X3", "MTR", 185.5, "No", "Yes", ""],
    ["Precision Machines Pvt Ltd", "HAMMER MILL MOTOR", "15 HP", "NOS", 38000, "Yes", "Yes", ""],
  ]);
  ws["!cols"] = [{ wch: 30 }, { wch: 26 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws, "Vendor Items");

  const inst = XLSX.utils.aoa_to_sheet([
    ["Vendor Item Master Template — Instructions"],
    [""],
    ["1. Use the 'Vendor Items' sheet. Do NOT rename or reorder the header row."],
    ["2. Required: Vendor Name, Material."],
    ["3. Vendor Name must already exist in the Vendor Master — upload Vendors first."],
    ["4. Price must be a number (blank allowed)."],
    ["5. Preferred / Active accept Yes/No (blank Active = Yes)."],
    ["6. Vendor Name + Material + Size/Model identifies a row: existing rows are UPDATED."],
    ["7. Supported formats: .xlsx, .xls"],
  ]);
  inst["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, inst, "Instructions");
  XLSX.writeFile(wb, "Vendor_Item_Master_Template.xlsx");
}

const norm = (s: unknown) => String(s ?? "").trim();
const key = (s: unknown) => norm(s).toLowerCase().replace(/[\s._/-]+/g, "");

function yesNo(v: unknown, dflt: boolean): boolean {
  const s = norm(v).toLowerCase();
  if (!s) return dflt;
  return ["yes", "y", "true", "1", "active", "active "].includes(s);
}

function sheetRows(file: ArrayBuffer, preferred: string[]): Record<string, unknown>[] {
  const wb = XLSX.read(file, { type: "array" });
  const name = wb.SheetNames.find((n) => preferred.some((p) => key(n) === key(p))) || wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: "" });
  return raw.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) out[key(k)] = v;
    return out;
  });
}

/** Rows with normalised keys plus the verbatim original cells (for later correction). */
function sheetRowsWithSource(file: ArrayBuffer, preferred: string[]): { norm: Record<string, unknown>; source: Record<string, string> }[] {
  const wb = XLSX.read(file, { type: "array" });
  const name = wb.SheetNames.find((n) => preferred.some((p) => key(n) === key(p))) || wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: "" });
  return raw.map((r) => {
    const out: Record<string, unknown> = {};
    const src: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      out[key(k)] = v;
      src[String(k).trim()] = norm(v);
    }
    return { norm: out, source: src };
  });
}

export function parseVendorWorkbook(file: ArrayBuffer): ParseResult<VendorRow> {
  const rows: VendorRow[] = [];
  const skipped: { row: number; reason: string }[] = [];
  let total = 0;
  sheetRows(file, ["Vendors"]).forEach((r, i) => {
    const line = i + 2;
    const hasAny = Object.values(r).some((v) => norm(v));
    if (!hasAny) return;
    total++;
    const name = norm(r[key("Name")]);
    if (!name) {
      skipped.push({ row: line, reason: "Name is required" });
      return;
    }
    const cats = norm(r[key("Categories")])
      .split(/[,;/|]/)
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    rows.push({
      name,
      categories: Array.from(new Set(cats)),
      gstin: norm(r[key("GSTIN")]) || null,
      state_code: norm(r[key("State Code")]) || null,
      address: norm(r[key("Address")]) || null,
      contact_person: norm(r[key("Contact Person")]) || null,
      phone: norm(r[key("Phone")]) || null,
      email: norm(r[key("Email")]) || null,
      payment_terms: norm(r[key("Payment Terms")]) || null,
      is_active: yesNo(r[key("Active")], true),
    });
  });
  return { rows, skipped, total };
}

/**
 * Parses the Vendor Item sheet WITHOUT dropping any row.
 * Every non-empty Excel row comes back; unusable ones carry `issues` so they
 * can be stored as pending and corrected later.
 */
export function parseVendorItemWorkbook(file: ArrayBuffer): ParseResult<VendorItemParsedRow> {
  const rows: VendorItemParsedRow[] = [];
  let total = 0;
  const seen = new Map<string, number>();

  sheetRowsWithSource(file, ["Vendor Items", "VendorItems"]).forEach(({ norm: r, source }, i) => {
    const line = i + 2;
    const hasAny = Object.values(r).some((v) => norm(v));
    if (!hasAny) return;
    total++;

    const issues: string[] = [];
    const vendor_name = norm(r[key("Vendor Name")]);
    const material = norm(r[key("Material")]);
    if (!vendor_name) issues.push("Vendor name missing");
    if (!material) issues.push("Item code missing (Material)");

    const priceRaw = norm(r[key("Price")]).replace(/[,₹\s]/g, "");
    let price: number | null = null;
    if (priceRaw === "") issues.push("Price missing");
    else if (Number.isNaN(Number(priceRaw))) issues.push(`Invalid price format: ${norm(r[key("Price")])}`);
    else price = Number(priceRaw);

    const size_model = norm(r[key("Size/Model")]) || null;
    const unit = norm(r[key("UOM")]) || null;

    const dupKey = `${vendor_name.toLowerCase()}|${material.toLowerCase()}|${(size_model || "").toLowerCase()}`;
    if (vendor_name && material) {
      const prev = seen.get(dupKey);
      if (prev) issues.push(`Duplicate vendor-item combination (also on row ${prev})`);
      else seen.set(dupKey, line);
    }

    rows.push({
      row_no: line,
      issues,
      source,
      vendor_name,
      material,
      size_model,
      unit,
      price,
      is_preferred: yesNo(r[key("Preferred")], false),
      is_active: yesNo(r[key("Active")], true),
      notes: norm(r[key("Notes")]) || null,
    });
  });

  return { rows, skipped: [], total };
}
