export type BoqPdfColumnKey =
  | "item_no"
  | "quantity"
  | "unit"
  | "make"
  | "model_number"
  | "description"
  | "remarks";

export interface BoqPdfColumnDef {
  key: BoqPdfColumnKey;
  label: string;
  /** Cannot be hidden. */
  required?: boolean;
}

/** Display order for the BOQ items table.
 *  Item → Qty → Unit → Make → Model → Description → Remarks. */
export const BOQ_PDF_COLUMN_DEFS: BoqPdfColumnDef[] = [
  { key: "item_no",      label: "Item No",      required: true },
  { key: "quantity",     label: "Qty" },
  { key: "unit",         label: "Unit" },
  { key: "make",         label: "Make" },
  { key: "model_number", label: "Model Number" },
  { key: "description",  label: "Description",  required: true },
  { key: "remarks",      label: "Remarks" },
];

export function visibleBoqColumns(hidden?: BoqPdfColumnKey[]): BoqPdfColumnKey[] {
  return BOQ_PDF_COLUMN_DEFS
    .filter((d) => d.required || !(hidden || []).includes(d.key))
    .map((d) => d.key);
}

export function isBoqColumnVisible(key: BoqPdfColumnKey, hidden?: BoqPdfColumnKey[]): boolean {
  const def = BOQ_PDF_COLUMN_DEFS.find((d) => d.key === key);
  if (!def) return false;
  if (def.required) return true;
  return !(hidden || []).includes(key);
}