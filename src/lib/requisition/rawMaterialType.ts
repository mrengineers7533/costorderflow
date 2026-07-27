/**
 * RM Type — a purely descriptive, row-level classification for
 * requisition raw-material rows. It is stored in the additive, nullable
 * `raw_material_type` column and is NOT a workflow status: document and
 * row workflow statuses (`purchase_status`, `plan_status`, PO/GRN status)
 * are untouched by this field.
 */
export const RAW_MATERIAL_TYPES = [
  "In House",
  "3rd Party",
  "Steel",
] as const;

export type RawMaterialType = (typeof RAW_MATERIAL_TYPES)[number];

export const RAW_MATERIAL_TYPE_PLACEHOLDER = "Select RM type";

/** Legacy / related category options used by the Material Category dropdown. */
export const MATERIAL_CATEGORIES = [
  "3P",
,  "3P Iron",
  "Pipe",
  "Sheets",
  "Structure",
  "GMS",
  "3P Machine",
  "Sheets MS",
  "Sheets SS",
  "GI Pipe",
  "GI Sheets",
] as const;

/** Display label for a stored value; blank rows show an em dash. */
export function rawMaterialTypeLabel(v?: string | null): string {
  const s = (v ?? "").trim();
  return s || "—";
}

/**
 * Consolidate the type of several source rows: keep the value only when all
 * non-empty source rows agree, otherwise leave it unset.
 */
export function consolidateRawMaterialType(values: Array<string | null | undefined>): string | null {
  const set = new Set(values.map((v) => (v ?? "").trim()).filter(Boolean));
  return set.size === 1 ? Array.from(set)[0] : null;
}
