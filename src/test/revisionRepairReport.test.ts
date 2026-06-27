import { describe, it, expect } from "vitest";
import { classifyRow } from "@/lib/boq/revisionRepairReport";

describe("revisionRepairReport.classifyRow", () => {
  it("no boq", () => {
    expect(classifyRow({ hasBoq: false, totalItems: 0, approvedItems: 0, directRows: 0, inheritedRows: 0, ancestorApproved: false })).toBe("no_boq");
  });

  it("native approved when all items approved with direct rows", () => {
    expect(classifyRow({ hasBoq: true, totalItems: 5, approvedItems: 5, directRows: 5, inheritedRows: 0, ancestorApproved: false })).toBe("native_approved");
  });

  it("repaired inherited when all approved via inherited snapshots", () => {
    expect(classifyRow({ hasBoq: true, totalItems: 5, approvedItems: 5, directRows: 0, inheritedRows: 5, ancestorApproved: true })).toBe("repaired_inherited");
  });

  it("needs repair when ancestor approved but current is partial/blank", () => {
    expect(classifyRow({ hasBoq: true, totalItems: 5, approvedItems: 0, directRows: 0, inheritedRows: 0, ancestorApproved: true })).toBe("needs_repair");
    expect(classifyRow({ hasBoq: true, totalItems: 5, approvedItems: 2, directRows: 0, inheritedRows: 2, ancestorApproved: true })).toBe("needs_repair");
  });

  it("not approved by design when no ancestor was approved", () => {
    expect(classifyRow({ hasBoq: true, totalItems: 5, approvedItems: 0, directRows: 0, inheritedRows: 0, ancestorApproved: false })).toBe("not_approved_by_design");
  });
});