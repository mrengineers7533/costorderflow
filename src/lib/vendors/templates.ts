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

export interface ParseResult<T> {
  rows: T[];
  skipped: { row: number; reason: string }[];
}

const CATS = ["steel", "machine", "3p"];

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
    ["2. Required: Name, Categories."],
    ["3. Categories must be one or more of: steel, machine, 3p (comma separated)."],
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

export function parseVendorWorkbook(file: ArrayBuffer): ParseResult<VendorRow> {
  const rows: VendorRow[] = [];
  const skipped: { row: number; reason: string }[] = [];
  sheetRows(file, ["Vendors"]).forEach((r, i) => {
    const line = i + 2;
    const name = norm(r[key("Name")]);
    if (!name) {
      if (Object.values(r).some((v) => norm(v))) skipped.push({ row: line, reason: "Name is required" });
      return;
    }
    const cats = norm(r[key("Categories")])
      .split(/[,;/|]/)
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    const bad = cats.filter((c) => !CATS.includes(c));
    if (bad.length) { skipped.push({ row: line, reason: `Invalid category: ${bad.join(", ")}` }); return; }
    if (!cats.length) { skipped.push({ row: line, reason: "At least one category required (steel / machine / 3p)" }); return; }
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
  return { rows, skipped };
}

export function parseVendorItemWorkbook(file: ArrayBuffer): ParseResult<VendorItemRow> {
  const rows: VendorItemRow[] = [];
  const skipped: { row: number; reason: string }[] = [];
  sheetRows(file, ["Vendor Items", "VendorItems"]).forEach((r, i) => {
    const line = i + 2;
    const vendor_name = norm(r[key("Vendor Name")]);
    const material = norm(r[key("Material")]);
    if (!vendor_name && !material) {
      if (Object.values(r).some((v) => norm(v))) skipped.push({ row: line, reason: "Vendor Name and Material are required" });
      return;
    }
    if (!vendor_name) { skipped.push({ row: line, reason: "Vendor Name is required" }); return; }
    if (!material) { skipped.push({ row: line, reason: "Material is required" }); return; }
    const priceRaw = norm(r[key("Price")]);
    if (priceRaw && Number.isNaN(Number(priceRaw))) { skipped.push({ row: line, reason: `Price is not a number: ${priceRaw}` }); return; }
    rows.push({
      vendor_name,
      material,
      size_model: norm(r[key("Size/Model")]) || null,
      unit: norm(r[key("UOM")]) || null,
      price: priceRaw === "" ? null : Number(priceRaw),
      is_preferred: yesNo(r[key("Preferred")], false),
      is_active: yesNo(r[key("Active")], true),
      notes: norm(r[key("Notes")]) || null,
    });
  });
  return { rows, skipped };
}
