export type PdfColumnKey =
  | "item_no"
  | "model_number"
  | "description"
  | "make"
  | "qty"
  | "unit"
  | "rate"
  | "amount";

export interface PdfColumnDef {
  key: PdfColumnKey;
  label: string;
  /** Visible in this format. */
  formats: ("MR" | "GMS")[];
  /** Cannot be hidden. */
  required?: boolean;
}

export const PDF_COLUMN_DEFS: PdfColumnDef[] = [
  { key: "item_no",      label: "Item No / S. No.",  formats: ["MR", "GMS"], required: true },
  { key: "model_number", label: "Model Number",      formats: ["GMS"] },
  { key: "description",  label: "Description",       formats: ["MR", "GMS"], required: true },
  { key: "qty",          label: "Qty",               formats: ["MR", "GMS"] },
  { key: "make",         label: "Make",              formats: ["MR", "GMS"] },
  { key: "unit",         label: "Unit",              formats: ["MR", "GMS"] },
  { key: "rate",         label: "Unit Price / Rate", formats: ["MR", "GMS"] },
  { key: "amount",       label: "Amount",            formats: ["MR", "GMS"] },
];

export function isColumnVisible(
  key: PdfColumnKey,
  format: "MR" | "GMS",
  hidden?: PdfColumnKey[],
): boolean {
  const def = PDF_COLUMN_DEFS.find((d) => d.key === key);
  if (!def) return false;
  if (!def.formats.includes(format)) return false;
  if (def.required) return true;
  return !(hidden || []).includes(key);
}

export function visibleColumns(
  format: "MR" | "GMS",
  hidden?: PdfColumnKey[],
): PdfColumnKey[] {
  return PDF_COLUMN_DEFS
    .filter((d) => d.formats.includes(format))
    .filter((d) => d.required || !(hidden || []).includes(d.key))
    .map((d) => d.key);
}
