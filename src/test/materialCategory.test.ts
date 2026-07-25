import { describe, it, expect } from "vitest";
import { resolveMaterialCategory } from "@/lib/requisition/materialCategory";

const rules = [
  { pattern: "MS SHEET", category: "MS Sheet", priority: 10, active: true },
  { pattern: "SS SHEET", category: "SS Sheet", priority: 10, active: true },
  { pattern: "PIPE", category: "Pipe", priority: 20, active: true },
  { pattern: "SHEET", category: "MS Sheet", priority: 100, active: true },
];

describe("resolveMaterialCategory", () => {
  it("prefers BOM over master and rules", () => {
    const r = resolveMaterialCategory({
      bomCategory: "Custom",
      itemMasterCategory: "MS Sheet",
      material: "MS SHEET",
      rules,
    });
    expect(r).toEqual({ category: "Custom", source: "bom" });
  });

  it("falls back to master when BOM missing", () => {
    const r = resolveMaterialCategory({
      itemMasterCategory: "SS Sheet",
      material: "MS SHEET",
      rules,
    });
    expect(r).toEqual({ category: "SS Sheet", source: "master" });
  });

  it("applies keyword rule when no explicit category is set", () => {
    const r = resolveMaterialCategory({ material: "MS SHEET", sizeModel: "8MM", rules });
    expect(r).toEqual({ category: "MS Sheet", source: "rule" });
  });

  it("prefers higher-priority rule (lower number)", () => {
    const r = resolveMaterialCategory({ material: "SS SHEET 10MM", rules });
    expect(r).toEqual({ category: "SS Sheet", source: "rule" });
  });

  it("returns null when nothing matches", () => {
    const r = resolveMaterialCategory({ material: "Unicorn Dust", rules });
    expect(r).toEqual({ category: null, source: null });
  });
});