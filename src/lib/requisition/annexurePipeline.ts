/**
 * Pure data transforms shared by:
 *  - the uploaded-requisition flow (Excel parser -> requisition_raw_materials)
 *  - the BOQ-generated-requisition flow (edge function -> requisition_raw_materials)
 *  - the annexure builder (Requisition Plan page)
 *  - the PO builder (PoCreateFromAnnexure page)
 *
 * Extracting these as pure functions lets us unit-test the end-to-end
 * pipeline (parsed data -> consolidated rows -> annexure rows -> PO totals)
 * without standing up React + Supabase. The page components keep their
 * existing inline copies of these transforms; this module is the
 * canonical, testable implementation.
 */

import {
  mapCategoryToPlanStatus,
  type ParsedRequisitionGroup,
  type PlanStatus,
} from "./parseUpload";
import { consolidateRawMaterialType } from "./rawMaterialType";

/** Minimum shape needed downstream — kept loose so both flows can feed it. */
export interface RmInputRow {
  id?: string;
  material: string;
  size_model: string | null;
  make: string | null;
  unit: string | null;
  lot_no: string | null;
  plan_status: PlanStatus | null;
  required_qty: number | null;
  fg_quantity?: number | null;
  /** Additive descriptive classification carried forward from Requisition. */
  raw_material_type?: string | null;
}

export interface ConsolidatedRow {
  key: string;
  material: string;
  size_model: string | null;
  make: string | null;
  unit: string | null;
  lot_no: string | null;
  plan_status: PlanStatus | null;
  total: number;
  sourceRmIds: string[];
  raw_material_type: string | null;
}

/**
 * Consolidate raw-material rows by (material, size, make, unit, lot, status).
 * Mirrors the grouping used by RequisitionPlan so the annexure folder shows
 * one line per distinct material+lot+status combination.
 */
export function consolidateRawMaterials(rms: RmInputRow[]): ConsolidatedRow[] {
  const map = new Map<string, ConsolidatedRow>();
  const typesByKey = new Map<string, Array<string | null | undefined>>();
  for (const rm of rms) {
    const key = [
      (rm.material || "").trim().toLowerCase(),
      (rm.size_model || "").trim().toLowerCase(),
      (rm.make || "").trim().toLowerCase(),
      (rm.unit || "").trim().toLowerCase(),
      (rm.lot_no || "").trim().toLowerCase(),
      (rm.plan_status || "").trim().toLowerCase(),
    ].join("|");
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        material: rm.material,
        size_model: rm.size_model,
        make: rm.make,
        unit: rm.unit,
        lot_no: rm.lot_no,
        plan_status: rm.plan_status,
        total: 0,
        sourceRmIds: [],
        raw_material_type: null,
      };
      map.set(key, row);
    }
    row.total += Number(rm.required_qty || 0);
    if (rm.id) row.sourceRmIds.push(rm.id);
    const list = typesByKey.get(key) || [];
    list.push(rm.raw_material_type);
    typesByKey.set(key, list);
  }
  // Only keep a type when every source row agrees; otherwise leave it unset.
  map.forEach((row, key) => {
    row.raw_material_type = consolidateRawMaterialType(typesByKey.get(key) || []);
  });
  return Array.from(map.values()).sort((a, b) => a.material.localeCompare(b.material));
}

export interface AnnexureRowInsert {
  lot_no: string;
  plan_status: PlanStatus;
  material: string;
  size_model: string | null;
  make: string | null;
  unit: string | null;
  total_qty: number;
  source_rm_ids: string[];
  raw_material_type: string | null;
}

/**
 * From consolidated rows, produce the insert payload for
 * `requisition_annexure_rows`. Rows missing a lot or plan_status are
 * filtered out (matches the validation in RequisitionPlan).
 */
export function buildAnnexureRowInserts(consolidated: ConsolidatedRow[]): AnnexureRowInsert[] {
  return consolidated
    .filter((c): c is ConsolidatedRow & { lot_no: string; plan_status: PlanStatus } =>
      !!c.lot_no && !!c.plan_status)
    .map((c) => ({
      lot_no: c.lot_no,
      plan_status: c.plan_status,
      material: c.material,
      size_model: c.size_model,
      make: c.make,
      unit: c.unit,
      total_qty: c.total,
      source_rm_ids: c.sourceRmIds,
      raw_material_type: c.raw_material_type ?? null,
    }));
}

export interface PoRowMeta {
  rate: number;
  discountPct?: number;
  gstPct?: number;
}

export interface PoLine {
  material: string;
  lot_no: string;
  qty: number;
  rate: number;
  discountPct: number;
  gstPct: number;
  basic: number;
  gstAmount: number;
  lineAmount: number;
}

export interface PoTotals {
  lines: PoLine[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  totalQty: number;
}

/**
 * Compute PO line totals from annexure rows plus per-row pricing meta.
 * Mirrors PoCreateFromAnnexure: basic = qty * rate * (1 - discount%); GST
 * applies on basic; line = basic + gst. Rows without meta are skipped.
 */
export function computePoTotals(
  annexureRows: Pick<AnnexureRowInsert, "material" | "lot_no" | "total_qty">[],
  metaByMaterial: Record<string, PoRowMeta>,
): PoTotals {
  const lines: PoLine[] = [];
  for (const r of annexureRows) {
    const meta = metaByMaterial[r.material];
    if (!meta) continue;
    const qty = Number(r.total_qty || 0);
    const rate = Number(meta.rate || 0);
    const discountPct = Number(meta.discountPct || 0);
    const gstPct = Number(meta.gstPct || 0);
    const gross = qty * rate;
    const basic = gross * (1 - discountPct / 100);
    const gstAmount = basic * (gstPct / 100);
    lines.push({
      material: r.material,
      lot_no: r.lot_no,
      qty,
      rate,
      discountPct,
      gstPct,
      basic,
      gstAmount,
      lineAmount: basic + gstAmount,
    });
  }
  const subtotal = lines.reduce((s, x) => s + x.basic, 0);
  const taxTotal = lines.reduce((s, x) => s + x.gstAmount, 0);
  return {
    lines,
    subtotal,
    taxTotal,
    grandTotal: subtotal + taxTotal,
    totalQty: lines.reduce((s, x) => s + x.qty, 0),
  };
}

/**
 * Convert parsed Excel groups (uploaded requisition flow) into the same
 * RmInputRow shape used by the consolidation/annexure pipeline. Mirrors
 * the mapping that `persistUploadedRequisitionRows` writes to the
 * `requisition_raw_materials` table.
 */
export function buildUploadedRmInputs(groups: ParsedRequisitionGroup[]): RmInputRow[] {
  const out: RmInputRow[] = [];
  groups.forEach((g, gi) => {
    g.raw_materials.forEach((rm, ri) => {
      if (!rm.material && !rm.qty) return;
      out.push({
        id: `upl-${gi + 1}-${ri + 1}`,
        material: rm.material || "(Unspecified)",
        size_model: rm.size_model,
        make: rm.party_name,
        unit: rm.unit,
        lot_no: rm.lot,
        plan_status: mapCategoryToPlanStatus(rm.category),
        required_qty: rm.qty,
        fg_quantity: g.fg_quantity,
      });
    });
  });
  return out;
}

/**
 * Mirror of the BOQ -> requisition_raw_materials mapping that the
 * `create-requisition` edge function performs. Given BOQ line items and
 * the FG -> raw-material master, returns RmInputRows in the shape the
 * rest of the pipeline expects. Used for parity testing only.
 */
export interface BoqLineItemLite {
  id: string;
  model_number?: string | null;
  description?: string | null;
  quantity?: number | null;
}
export interface FgRmMapLite {
  model_number: string;
  is_direct_purchase: boolean;
  raw_materials: Array<{
    make?: string | null;
    material: string;
    size_model?: string | null;
    qty_per_unit: number;
    unit?: string | null;
  }>;
}
export interface BoqRmOptions {
  defaultLot?: string;
  defaultPlanStatus?: PlanStatus | null;
}
export function buildBoqRequisitionRmInputs(
  lineItems: BoqLineItemLite[],
  fgMaps: FgRmMapLite[],
  opts: BoqRmOptions = {},
): RmInputRow[] {
  const byLower = new Map(fgMaps.map((m) => [m.model_number.trim().toLowerCase(), m]));
  const out: RmInputRow[] = [];
  for (const it of lineItems) {
    const key = (it.model_number || "").trim().toLowerCase();
    const fg = byLower.get(key);
    if (!fg || fg.is_direct_purchase) continue;
    const fgQty = Number(it.quantity || 0);
    fg.raw_materials.forEach((rm, idx) => {
      const per = Number(rm.qty_per_unit || 0);
      out.push({
        id: `${it.id}-rm-${idx + 1}`,
        material: rm.material,
        size_model: rm.size_model ?? null,
        make: rm.make ?? null,
        unit: rm.unit ?? null,
        lot_no: opts.defaultLot ?? null,
        plan_status: opts.defaultPlanStatus ?? null,
        required_qty: per * fgQty,
        fg_quantity: fgQty,
      });
    });
  }
  return out;
}