import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Safe-delete regression tests: deletes must remove only the selected record
 * (plus rows that exist exclusively for it) and must not leave stale state
 * behind that would change downstream counts or logic.
 */

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };
const calls: Call[] = [];

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  const b: Record<string, unknown> = {};
  const chain = (op?: string) => (...args: unknown[]) => {
    if (op) call.op = op;
    if (op === "update" || op === "insert") call.payload = args[0];
    return b;
  };
  b.select = chain("select");
  b.delete = () => { call.op = "delete"; calls.push(call); return b; };
  b.update = (p: unknown) => { call.op = "update"; call.payload = p; calls.push(call); return b; };
  b.eq = (c: string, v: unknown) => { call.filters.push([c, v]); return b; };
  b.in = (c: string, v: unknown) => { call.filters.push([c, v]); return b; };
  b.not = () => b;
  b.contains = () => b;
  b.then = (res: (v: { data: unknown[]; error: null }) => unknown) => res({ data: [], error: null });
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => makeBuilder(t) },
}));

import { deletePurchaseOrderCascade } from "@/lib/purchase/poDelete";

describe("deletePurchaseOrderCascade", () => {
  beforeEach(() => { calls.length = 0; });

  it("releases raw materials by clearing both po_status and po_id", async () => {
    await deletePurchaseOrderCascade("po-1");
    const rmUpdate = calls.find((c) => c.table === "requisition_raw_materials" && c.op === "update");
    expect(rmUpdate).toBeTruthy();
    expect(rmUpdate?.payload).toEqual({ po_status: null, po_id: null });
    expect(rmUpdate?.filters).toEqual([["po_id", "po-1"]]);
  });

  it("deletes only rows scoped to this PO and the PO itself", async () => {
    await deletePurchaseOrderCascade("po-1");
    const deletes = calls.filter((c) => c.op === "delete");
    expect(deletes.map((d) => d.table)).toEqual([
      "purchase_order_rows",
      "purchase_order_sends",
      "purchase_order_audit",
      "purchase_orders",
    ]);
    // Every delete is filtered — no unscoped table wipes.
    for (const d of deletes) expect(d.filters.length).toBeGreaterThan(0);
    expect(deletes.at(-1)?.filters).toEqual([["id", "po-1"]]);
  });

  it("never touches requisitions, annexures or counters", async () => {
    await deletePurchaseOrderCascade("po-1");
    const touched = new Set(calls.map((c) => c.table));
    for (const t of ["requisitions", "requisition_annexures", "po_counters", "orders", "boqs"]) {
      expect(touched.has(t)).toBe(false);
    }
  });
});
