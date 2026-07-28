/**
 * Map an RM Category (the free-text / dropdown classification stored on
 * `requisition_raw_materials.material_category`) onto the annexure
 * `plan_status` bucket used by the Requisition Planning page.
 *
 * Used to auto-resolve rows that have a category but no plan status, so
 * annexure creation no longer hard-fails with "Status required".
 * Unmappable values return null and the row is simply skipped.
 */
export type PlanStatusValue =
  | "machine"
  | "3p"
  | "pipe"
  | "sheet_ss"
  | "sheet_ms"
  | "sheet_gi"
  | "structure"
  | "steel";

export function planStatusFromCategory(category: string | null | undefined): PlanStatusValue | null {
  const c = (category ?? "").trim().toLowerCase();
  if (!c) return null;
  if (c === "3p machine" || c === "machine") return "machine";
  if (c === "3p" || c === "3p iron") return "3p";
  if (c === "gi pipe" || c === "pipe") return "pipe";
  if (c === "sheets ss" || c === "sheet ss") return "sheet_ss";
  if (c === "sheets ms" || c === "sheet ms") return "sheet_ms";
  if (c === "gi sheets" || c === "gi sheet") return "sheet_gi";
  if (c === "structure" || c === "gms") return "structure";
  if (c === "steel") return "steel";
  return null;
}