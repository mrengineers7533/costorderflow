import { describe, it, expect } from "vitest";

/**
 * Mirrors the `public.emit_notification` exclusion rule so we can lock the
 * contract in TS without round-tripping the DB. Source of truth lives in the
 * latest Supabase migration; keep this helper in sync if that rule changes.
 */
type Recipient = {
  department: string;
  module: string | null;
  user_id?: string | null;
};

function pickTargets(
  recipients: Recipient[],
  actor: { uid?: string | null; department: string; modules: string[] },
  srcModule: string | null,
): string[] {
  const out = new Set<string>();
  for (const r of recipients) {
    if (actor.uid && r.user_id && r.user_id === actor.uid) continue;
    const excludedByModule =
      !!r.module && !!srcModule && r.module === srcModule;
    const excludedByDept =
      r.module === null && !!srcModule && r.department === actor.department;
    if (excludedByModule || excludedByDept) continue;
    out.add(r.department);
  }
  return Array.from(out).sort();
}

const recipients: Recipient[] = [
  { department: "Costing", module: "oa" },
  { department: "Costing", module: "boq" },
  { department: "Costing", module: "pi" },
  { department: "design", module: "design" },
  { department: "purchase", module: "purchase" },
  { department: "manufacturing", module: "manufacturing" },
  { department: "CRM Team", module: null },
];

describe("notification source-module exclusion", () => {
  it("OA create notifies design/purchase/manufacturing + BOQ/PI, excludes OA", () => {
    const targets = pickTargets(recipients, { department: "Costing", modules: ["oa"] }, "oa");
    expect(targets).toContain("design");
    expect(targets).toContain("purchase");
    expect(targets).toContain("manufacturing");
    // Costing remains because BOQ + PI sub-rows are still eligible
    expect(targets).toContain("Costing");
  });

  it("Design item status change excludes design", () => {
    const targets = pickTargets(recipients, { department: "design", modules: ["design"] }, "design");
    expect(targets).not.toContain("design");
    expect(targets).toContain("purchase");
    expect(targets).toContain("manufacturing");
    expect(targets).toContain("Costing");
  });

  it("Purchase edit does not notify purchase", () => {
    const targets = pickTargets(recipients, { department: "purchase", modules: ["purchase"] }, "purchase");
    expect(targets).not.toContain("purchase");
    expect(targets).toContain("manufacturing");
    expect(targets).toContain("design");
  });

  it("Manufacturing edit does not notify manufacturing", () => {
    const targets = pickTargets(
      recipients,
      { department: "manufacturing", modules: ["manufacturing"] },
      "manufacturing",
    );
    expect(targets).not.toContain("manufacturing");
    expect(targets).toContain("purchase");
  });

  it("BOQ edit excludes only BOQ sub-module of Costing, keeps OA/PI eligible", () => {
    // Costing still appears (because the OA + PI sub-rows pass).
    const targets = pickTargets(recipients, { department: "Costing", modules: ["boq"] }, "boq");
    expect(targets).toContain("Costing");
    expect(targets).toContain("design");
    expect(targets).toContain("purchase");
    expect(targets).toContain("manufacturing");
    // Confirm the BOQ sub-row itself is excluded by checking with only that row present.
    const justBoq = pickTargets(
      [{ department: "Costing", module: "boq" }],
      { department: "Costing", modules: ["boq"] },
      "boq",
    );
    expect(justBoq).toEqual([]);
  });

  it("OA revision excludes OA sub-module but not BOQ/PI sub-modules", () => {
    const justOa = pickTargets(
      [{ department: "Costing", module: "oa" }],
      { department: "Costing", modules: ["oa"] },
      "oa",
    );
    expect(justOa).toEqual([]);
    const otherSub = pickTargets(
      [
        { department: "Costing", module: "boq" },
        { department: "Costing", module: "pi" },
      ],
      { department: "Costing", modules: ["oa"] },
      "oa",
    );
    expect(otherSub).toEqual(["Costing"]);
  });
});