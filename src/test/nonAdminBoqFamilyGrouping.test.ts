import { describe, expect, it } from "vitest";
import { groupBoqsByFamily, pickLatestApprovedBoqsPerFamily } from "@/lib/boq/familyKey";
import type { BoqRecord } from "@/lib/boq/types";

function boq(partial: Partial<BoqRecord> & Pick<BoqRecord, "id" | "order_id" | "boq_number">): BoqRecord {
  return {
    user_id: null,
    version: 1,
    format: "GMS",
    status: "draft",
    prepared_by: null,
    boq_date: "2026-07-15",
    reference_oa_number: null,
    project_number: null,
    client_name: "GRAIN MILLING SOLUTION PVT LTD",
    line_items: [],
    terms: null,
    notes: null,
    created_at: "2026-07-15T07:30:00.000Z",
    updated_at: "2026-07-15T07:30:00.000Z",
    ...partial,
  };
}

describe("non-admin BOQ family grouping", () => {
  const base = boq({
    id: "boq-gms-0004-r0",
    order_id: "oa-gms-0004-r0",
    source_order_id: "oa-gms-0004-r0",
    revised_from_id: null,
    boq_number: "26-27/GMSBOQ/0004",
    reference_oa_number: "2026-27/GMS/0004",
    revision: 0,
    is_current: false,
    verification_status: "approved",
  });

  const revised = boq({
    id: "boq-gms-0004-r1",
    order_id: "oa-gms-0004-r1",
    source_order_id: "oa-gms-0004-r1",
    revised_from_id: "boq-gms-0004-r0",
    boq_number: "26-27/GMSBOQ/0004/R1",
    reference_oa_number: "2026-27/GMS/0004/R1",
    revision: 1,
    is_current: true,
    verification_status: "approved",
    created_at: "2026-07-15T09:43:31.000Z",
    updated_at: "2026-07-15T09:43:32.000Z",
  });

  it("collapses design@mrengineers.com partial orders to the latest visible revision", () => {
    const designVisibleOrders = [
      { id: "oa-gms-0004-r1", parent_order_id: "oa-gms-0004-r0" },
    ];

    const firstLogin = groupBoqsByFamily([base, revised], designVisibleOrders);
    const afterRefresh = groupBoqsByFamily([base, revised], designVisibleOrders);
    const afterRelogin = groupBoqsByFamily([base, revised], designVisibleOrders);

    for (const grouped of [firstLogin, afterRefresh, afterRelogin]) {
      expect(grouped.rows).toHaveLength(1);
      expect(grouped.rows[0].boq_number).toBe("26-27/GMSBOQ/0004/R1");
      expect(grouped.familyIdsByLatestId.get("boq-gms-0004-r1")?.sort()).toEqual([
        "boq-gms-0004-r0",
        "boq-gms-0004-r1",
      ]);
    }
  });

  it("keeps admin root-based grouping unchanged", () => {
    const adminVisibleOrders = [
      { id: "oa-gms-0004-r0", parent_order_id: null },
      { id: "oa-gms-0004-r1", parent_order_id: "oa-gms-0004-r0" },
    ];

    const grouped = groupBoqsByFamily([base, revised], adminVisibleOrders);

    expect(grouped.rows).toHaveLength(1);
    expect(grouped.rows[0].id).toBe("boq-gms-0004-r1");
  });

  it("uses grouped family counts/search data after approved filtering", () => {
    const designVisibleOrders = [
      { id: "oa-gms-0004-r1", parent_order_id: "oa-gms-0004-r0" },
    ];

    const rows = pickLatestApprovedBoqsPerFamily([base, revised], designVisibleOrders);
    const tabCount = rows.filter((r) => r.format === "GMS").length;
    const searchHits = rows.filter((r) =>
      [r.boq_number, r.client_name, r.reference_oa_number, r.project_number]
        .some((v) => (v || "").toLowerCase().includes("gmsboq/0004")),
    );

    expect(tabCount).toBe(1);
    expect(searchHits.map((r) => r.boq_number)).toEqual(["26-27/GMSBOQ/0004/R1"]);
  });
});