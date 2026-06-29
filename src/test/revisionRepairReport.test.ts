import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyRow, loadRevisionRepairReport } from "@/lib/boq/revisionRepairReport";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

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

describe("revisionRepairReport.loadRevisionRepairReport", () => {
  const writeMethods = ["insert", "update", "upsert", "delete"] as const;
  let writeCalls: string[] = [];

  function makeQuery(rows: unknown[]) {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    q.select = vi.fn(chain);
    q.order = vi.fn(chain);
    q.in = vi.fn(() => Promise.resolve({ data: rows }));
    q.then = (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data: rows });
    for (const m of writeMethods) {
      q[m] = vi.fn(() => {
        writeCalls.push(m);
        return q;
      });
    }
    return q;
  }

  beforeEach(() => {
    writeCalls = [];
  });

  it("classifies revisions correctly and performs no writes when invoked", async () => {
    const orders = [
      { id: "o1", oa_number: "OA/1", revision: 0, parent_order_id: null },
      { id: "o2", oa_number: "OA/1", revision: 1, parent_order_id: "o1" },
      { id: "o3", oa_number: "OA/2", revision: 0, parent_order_id: null },
    ];
    const boqs = [
      { id: "b1", source_order_id: "o1", revision: 0, boq_number: "B/1" },
      { id: "b2", source_order_id: "o2", revision: 1, boq_number: "B/1" },
      { id: "b3", source_order_id: "o3", revision: 0, boq_number: "B/2" },
    ];
    const snaps = [
      // o1/b1 native approved
      { boq_id: "b1", boq_revision: 0, boq_item_id: "i1", approval_status: "approved", source_snapshot_id: null },
      { boq_id: "b1", boq_revision: 0, boq_item_id: "i2", approval_status: "approved", source_snapshot_id: null },
      // o2/b2 inherited approved
      { boq_id: "b2", boq_revision: 1, boq_item_id: "i1", approval_status: "approved", source_snapshot_id: "s1" },
      { boq_id: "b2", boq_revision: 1, boq_item_id: "i2", approval_status: "approved", source_snapshot_id: "s2" },
      // o3/b3 pending, no ancestor approved
      { boq_id: "b3", boq_revision: 0, boq_item_id: "i9", approval_status: "pending", source_snapshot_id: null },
    ];
    const dss = [
      { boq_id: "b1", boq_revision: 0, status: "approved" },
      { boq_id: "b1", boq_revision: 0, status: "approved" },
    ];

    const tables: Record<string, unknown[]> = {
      orders,
      boqs,
      boq_revision_approval_snapshots: snaps,
      boq_item_design_status: dss,
    };
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (name: string) => makeQuery(tables[name] ?? [])
    );

    const rows = await loadRevisionRepairReport();

    expect(writeCalls).toEqual([]);

    const r1 = rows.find((r) => r.orderId === "o1")!;
    expect(r1.status).toBe("native_approved");
    expect(r1.boqId).toBe("b1");
    expect(r1.boqRevision).toBe(0);
    expect(r1.totalItems).toBe(2);
    expect(r1.approvedItems).toBe(2);
    expect(r1.inheritedRows).toBe(0);
    expect(r1.directRows).toBe(2);
    expect(r1.ancestorApproved).toBe(false);

    const r2 = rows.find((r) => r.orderId === "o2")!;
    expect(r2.status).toBe("repaired_inherited");
    expect(r2.inheritedRows).toBe(2);
    expect(r2.approvedItems).toBe(2);
    expect(r2.directRows).toBe(0);
    expect(r2.ancestorApproved).toBe(true);

    const r3 = rows.find((r) => r.orderId === "o3")!;
    expect(r3.status).toBe("not_approved_by_design");
    expect(r3.approvedItems).toBe(0);
    expect(r3.inheritedRows).toBe(0);
    expect(r3.ancestorApproved).toBe(false);
  });

  it("marks revision as needs_repair when ancestor approved but current is blank", async () => {
    const orders = [
      { id: "o1", oa_number: "OA/9", revision: 0, parent_order_id: null },
      { id: "o2", oa_number: "OA/9", revision: 1, parent_order_id: "o1" },
    ];
    const boqs = [
      { id: "b1", source_order_id: "o1", revision: 0, boq_number: "B/9" },
      { id: "b2", source_order_id: "o2", revision: 1, boq_number: "B/9" },
    ];
    const snaps = [
      { boq_id: "b1", boq_revision: 0, boq_item_id: "i1", approval_status: "approved", source_snapshot_id: null },
      { boq_id: "b2", boq_revision: 1, boq_item_id: "i1", approval_status: "pending", source_snapshot_id: null },
    ];
    const tables: Record<string, unknown[]> = {
      orders,
      boqs,
      boq_revision_approval_snapshots: snaps,
      boq_item_design_status: [],
    };
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (name: string) => makeQuery(tables[name] ?? [])
    );

    const rows = await loadRevisionRepairReport();
    expect(writeCalls).toEqual([]);

    const r2 = rows.find((r) => r.orderId === "o2")!;
    expect(r2.status).toBe("needs_repair");
    expect(r2.ancestorApproved).toBe(true);
    expect(r2.approvedItems).toBe(0);
  });
});