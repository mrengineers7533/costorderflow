import { describe, it, expect } from "vitest";
import {
  normalizeBaseQuantity,
  scaleQtyPerUnit,
  scaleRequiredQty,
  scaleBomForFg,
} from "@/lib/requisition/bomScaling";

// BOM defined for a batch of 10 finished goods.
const BATCH_BOM = [
  { material: "Steel Sheet 2mm", qty_per_unit: 50, unit: "kg" },   // 5 kg per FG
  { material: "M6 Bolt",         qty_per_unit: 120, unit: "nos" }, // 12 nos per FG
  { material: "Paint Primer",    qty_per_unit: 3.5, unit: "L" },   // 0.35 L per FG
];

describe("bomScaling — required = qty_per_unit × required_fg / base_quantity", () => {
  it("normalizes invalid base_quantity to 1 (legacy 1:1 BOMs)", () => {
    expect(normalizeBaseQuantity(undefined)).toBe(1);
    expect(normalizeBaseQuantity(null)).toBe(1);
    expect(normalizeBaseQuantity(0)).toBe(1);
    expect(normalizeBaseQuantity(-4)).toBe(1);
    expect(normalizeBaseQuantity("nope")).toBe(1);
    expect(normalizeBaseQuantity(10)).toBe(10);
  });

  it("scaleRequiredQty applies the formula for a non-1 base_quantity", () => {
    // qty_per_unit=50, base=10, fg=7  ->  50 * 7 / 10 = 35
    expect(scaleRequiredQty(50, 10, 7)).toBe(35);
    // qty_per_unit=3.5, base=10, fg=4 ->  3.5 * 4 / 10 = 1.4
    expect(scaleRequiredQty(3.5, 10, 4)).toBeCloseTo(1.4, 10);
  });

  it("scaleQtyPerUnit returns the per-FG-unit value (base normalization)", () => {
    expect(scaleQtyPerUnit(120, 10)).toBe(12);
    expect(scaleQtyPerUnit(50, 1)).toBe(50);
  });

  it("scales every BOM row when a non-1 base_quantity is selected", () => {
    const requiredFg = 7;
    const baseQuantity = 10;
    const rows = scaleBomForFg(BATCH_BOM, baseQuantity, requiredFg);

    expect(rows).toHaveLength(BATCH_BOM.length);
    for (let i = 0; i < rows.length; i++) {
      const src = BATCH_BOM[i];
      const expected = (src.qty_per_unit * requiredFg) / baseQuantity;
      expect(rows[i].material).toBe(src.material);
      expect(rows[i].fg_quantity).toBe(requiredFg);
      expect(rows[i].qty_per_unit).toBeCloseTo(src.qty_per_unit / baseQuantity, 10);
      expect(rows[i].required_qty).toBeCloseTo(expected, 10);
    }

    // Spot-check explicit expected values to lock the formula contract.
    expect(rows[0].required_qty).toBeCloseTo(35, 10);   // 50 * 7 / 10
    expect(rows[1].required_qty).toBeCloseTo(84, 10);   // 120 * 7 / 10
    expect(rows[2].required_qty).toBeCloseTo(2.45, 10); // 3.5 * 7 / 10
  });

  it("does not change BOM behavior for legacy base_quantity = 1", () => {
    const rowsLegacy = scaleBomForFg(BATCH_BOM, 1, 7);
    const rowsMissing = scaleBomForFg(BATCH_BOM, null, 7);
    for (let i = 0; i < BATCH_BOM.length; i++) {
      const expected = BATCH_BOM[i].qty_per_unit * 7;
      expect(rowsLegacy[i].required_qty).toBeCloseTo(expected, 10);
      expect(rowsMissing[i].required_qty).toBeCloseTo(expected, 10);
    }
  });

  it("yields zero required_qty when required_fg_qty is 0 or invalid", () => {
    const rows = scaleBomForFg(BATCH_BOM, 10, 0);
    for (const r of rows) expect(r.required_qty).toBe(0);

    const rowsNaN = scaleBomForFg(BATCH_BOM, 10, "x" as unknown as number);
    for (const r of rowsNaN) expect(r.required_qty).toBe(0);
  });
});