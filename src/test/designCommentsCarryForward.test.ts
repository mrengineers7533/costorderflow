import { describe, it, expect } from "vitest";
import {
  buildAppliedCommentInserts,
  buildBoqItemIdRemap,
  type DesignCommentCarry,
} from "@/lib/revisions/carryForward";
import type { BoqLineItem } from "@/lib/boq/types";
import type { LineItem } from "@/lib/orders/types";

/**
 * Regression coverage for the Design-comments carry-over that runs whenever
 * an OA is revised (`reviseBoqFromOrder`) or auto-cascades a pending BOQ
 * (`createPendingBoqRevision`).
 *
 * What this guards:
 *   1. Applied/approved comments on the previous BOQ revision must end up
 *      on the freshly inserted BOQ revision (so the latest revised OA and
 *      BOQ both keep showing them).
 *   2. They must stay linked to the correct line / motor / quantity /
 *      remarks row — i.e. mapped by description+model, not by raw item id.
 *   3. Draft / pending / never-applied comments must NOT be copied (so old
 *      drafts don't leak into the revised revision).
 *   4. Old revisions still own their old comments (no destructive moves) —
 *      the helper produces *insert* payloads, never deletes.
 */

function oaItem(partial: Partial<LineItem> & { description: string; model?: string }): LineItem {
  return {
    id: partial.id ?? crypto.randomUUID(),
    description: partial.description,
    quantity: partial.quantity ?? 1,
    unit: partial.unit ?? "Nos",
    unit_rate: partial.unit_rate ?? 0,
    amount: partial.amount ?? 0,
    ...partial,
  };
}

function boqItem(partial: Partial<BoqLineItem> & { id: string; description: string; model_number: string }): BoqLineItem {
  return {
    item_no: partial.item_no ?? "1",
    quantity: partial.quantity ?? 1,
    unit: partial.unit ?? "Nos",
    remarks: partial.remarks ?? "",
    ...partial,
  } as BoqLineItem;
}

describe("Design comments carry-forward on OA revision", () => {
  it("maps prev BOQ item ids to new BOQ item ids by description+model", () => {
    const orderItems = [
      oaItem({ description: "Pump", model: "P-100" }),
      oaItem({ description: "Motor", model: "M-50" }),
    ];
    const prevBoqItems = [
      boqItem({ id: "prev-pump", description: "Pump", model_number: "P-100" }),
      boqItem({ id: "prev-motor", description: "Motor", model_number: "M-50" }),
    ];
    const newBoqItems = [{ id: "new-pump" }, { id: "new-motor" }];
    const map = buildBoqItemIdRemap(orderItems, prevBoqItems, newBoqItems, "desc-model");
    expect(map.get("prev-pump")).toBe("new-pump");
    expect(map.get("prev-motor")).toBe("new-motor");
  });

  it("ignores case and surrounding whitespace when matching desc+model", () => {
    const orderItems = [oaItem({ description: "  Pump  ", model: "p-100" })];
    const prevBoqItems = [boqItem({ id: "prev-1", description: "pump", model_number: "P-100" })];
    const newBoqItems = [{ id: "new-1" }];
    const map = buildBoqItemIdRemap(orderItems, prevBoqItems, newBoqItems, "desc-model");
    expect(map.get("prev-1")).toBe("new-1");
  });

  it("falls back to hsn_code when an OA item has no `model`", () => {
    const orderItems = [oaItem({ description: "Valve", hsn_code: "V-9" })];
    const prevBoqItems = [boqItem({ id: "prev-valve", description: "Valve", model_number: "V-9" })];
    const newBoqItems = [{ id: "new-valve" }];
    const map = buildBoqItemIdRemap(orderItems, prevBoqItems, newBoqItems, "desc-model");
    expect(map.get("prev-valve")).toBe("new-valve");
  });

  it("model-only mode (pending BOQ revision path) maps by model alone", () => {
    const orderItems = [oaItem({ description: "Renamed Pump", model: "P-100" })];
    const prevBoqItems = [boqItem({ id: "prev-1", description: "Old Pump", model_number: "P-100" })];
    const newBoqItems = [{ id: "new-1" }];
    const map = buildBoqItemIdRemap(orderItems, prevBoqItems, newBoqItems, "model");
    expect(map.get("prev-1")).toBe("new-1");
  });

  it("returns no mapping for OA rows that have no matching prev BOQ row", () => {
    const orderItems = [oaItem({ description: "Brand new", model: "X-1" })];
    const prevBoqItems = [boqItem({ id: "prev-old", description: "Old", model_number: "O-1" })];
    const newBoqItems = [{ id: "new-1" }];
    const map = buildBoqItemIdRemap(orderItems, prevBoqItems, newBoqItems, "desc-model");
    expect(map.size).toBe(0);
  });
});

describe("Design comments carry-forward — insert payload builder", () => {
  const baseRow: Omit<DesignCommentCarry, "boq_item_id" | "column_key" | "comment" | "applied_to_oa_at"> = {
    user_id: "u-1",
    user_name: "Designer",
    user_email: "d@example.com",
    department: "Design",
    applied_to_oa_by: "u-1",
    applied_value: null,
    oa_revision_id: null,
  };

  it("carries applied comments and remaps boq_item_id + boq_id, including motor_quantity & remarks columns", () => {
    const map = new Map([
      ["prev-pump", "new-pump"],
      ["prev-motor", "new-motor"],
    ]);
    const prevComments: DesignCommentCarry[] = [
      { ...baseRow, boq_item_id: "prev-pump", column_key: "remarks", comment: "Use SS housing", applied_to_oa_at: "2025-01-01T00:00:00Z" },
      { ...baseRow, boq_item_id: "prev-motor", column_key: "motor_quantity", comment: "Increase to 2", applied_to_oa_at: "2025-01-02T00:00:00Z", applied_value: "2" },
    ];
    const inserts = buildAppliedCommentInserts(prevComments, map, "new-boq-id");
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({
      boq_id: "new-boq-id",
      boq_item_id: "new-pump",
      column_key: "remarks",
      comment: "Use SS housing",
      applied_to_oa_at: "2025-01-01T00:00:00Z",
    });
    expect(inserts[1]).toMatchObject({
      boq_id: "new-boq-id",
      boq_item_id: "new-motor",
      column_key: "motor_quantity",
      comment: "Increase to 2",
      applied_value: "2",
    });
  });

  it("skips draft / pending / never-applied comments", () => {
    const map = new Map([["prev-1", "new-1"]]);
    const prevComments: DesignCommentCarry[] = [
      { ...baseRow, boq_item_id: "prev-1", column_key: "remarks", comment: "draft only", applied_to_oa_at: null },
    ];
    const inserts = buildAppliedCommentInserts(prevComments, map, "new-boq-id");
    expect(inserts).toEqual([]);
  });

  it("skips applied comments whose boq_item_id no longer maps (item removed in revision)", () => {
    const map = new Map([["prev-keep", "new-keep"]]);
    const prevComments: DesignCommentCarry[] = [
      { ...baseRow, boq_item_id: "prev-removed", column_key: "remarks", comment: "stale", applied_to_oa_at: "2025-01-01T00:00:00Z" },
      { ...baseRow, boq_item_id: "prev-keep", column_key: "remarks", comment: "keep me", applied_to_oa_at: "2025-01-01T00:00:00Z" },
    ];
    const inserts = buildAppliedCommentInserts(prevComments, map, "new-boq-id");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ boq_item_id: "new-keep", comment: "keep me" });
  });

  it("keeps motor + remarks comments attached to the right row when multiple motors share a description", () => {
    // Two OA rows with the same description but different models — the
    // desc+model mapping must keep each row's remarks linked correctly.
    const orderItems = [
      oaItem({ description: "Pump", model: "P-100" }),
      oaItem({ description: "Pump", model: "P-200" }),
    ];
    const prevBoqItems = [
      boqItem({ id: "prev-100", description: "Pump", model_number: "P-100" }),
      boqItem({ id: "prev-200", description: "Pump", model_number: "P-200" }),
    ];
    const newBoqItems = [{ id: "new-100" }, { id: "new-200" }];
    const map = buildBoqItemIdRemap(orderItems, prevBoqItems, newBoqItems, "desc-model");

    const prevComments: DesignCommentCarry[] = [
      { ...baseRow, boq_item_id: "prev-100", column_key: "motor", comment: "Motor A only", applied_to_oa_at: "2025-01-01T00:00:00Z" },
      { ...baseRow, boq_item_id: "prev-200", column_key: "remarks", comment: "200 needs derating", applied_to_oa_at: "2025-01-01T00:00:00Z" },
    ];
    const inserts = buildAppliedCommentInserts(prevComments, map, "new-boq-id");
    expect(inserts).toHaveLength(2);
    expect(inserts.find((r) => r.boq_item_id === "new-100")).toMatchObject({ column_key: "motor", comment: "Motor A only" });
    expect(inserts.find((r) => r.boq_item_id === "new-200")).toMatchObject({ column_key: "remarks", comment: "200 needs derating" });
  });

  it("returns empty when prev comments list is empty (no spurious inserts)", () => {
    const map = new Map([["prev-1", "new-1"]]);
    expect(buildAppliedCommentInserts([], map, "new-boq-id")).toEqual([]);
  });
});