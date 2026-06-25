// Pure helpers for BOM → Requisition quantity scaling.
//
// Formula (mirrors supabase/functions/create-requisition/index.ts):
//   required_qty   = qty_per_unit × required_fg_qty / base_quantity
//   effective_per  = qty_per_unit / base_quantity        (per 1 FG unit)
//
// base_quantity falls back to 1 when null / 0 / negative / NaN so existing
// BOMs (defined per 1 FG) continue to behave unchanged.

export function normalizeBaseQuantity(base: unknown): number {
  const n = Number(base);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function scaleQtyPerUnit(qtyPerUnit: unknown, baseQuantity: unknown): number {
  const per = Number(qtyPerUnit) || 0;
  return per / normalizeBaseQuantity(baseQuantity);
}

export function scaleRequiredQty(
  qtyPerUnit: unknown,
  baseQuantity: unknown,
  requiredFgQty: unknown,
): number {
  const fg = Number(requiredFgQty) || 0;
  return scaleQtyPerUnit(qtyPerUnit, baseQuantity) * fg;
}

export interface BomItem {
  material: string;
  qty_per_unit: number;
  unit?: string | null;
}

export interface ScaledRmRow extends BomItem {
  qty_per_unit: number;   // effective per 1 FG, after base scaling
  fg_quantity: number;
  required_qty: number;
}

export function scaleBomForFg(
  bom: BomItem[],
  baseQuantity: unknown,
  requiredFgQty: unknown,
): ScaledRmRow[] {
  const base = normalizeBaseQuantity(baseQuantity);
  const fg = Number(requiredFgQty) || 0;
  return bom.map((item) => {
    const effPer = (Number(item.qty_per_unit) || 0) / base;
    return {
      ...item,
      qty_per_unit: effPer,
      fg_quantity: fg,
      required_qty: effPer * fg,
    };
  });
}