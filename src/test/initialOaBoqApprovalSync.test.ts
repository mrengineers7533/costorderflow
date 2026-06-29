import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test #1 — Initial OA creation, auto BOQ approval sync.
 *
 * Mirrors the live flow:
 *   1. Save a fresh OA (R0) → `createInitialBoqForOrder` auto-creates BOQ.
 *   2. Design approves items via `setItemApproval` / `bulkSetItemApprovals`
 *      and mirrors the verdict onto the BOQ snapshot via
 *      `syncApprovalToBoqSnapshot` (same calls OrderEditor / DesignBoqView make).
 *   3. OA editor + Manufacturing + Purchase views all read the same
 *      verdict via the shared helpers.
 *
 * Locks in: per-item Design approval propagates to `boqs.line_items`,
 * `boq_item_design_status`, and through every display helper for the same
 * revision — no helpers, snapshots, or BOQ rows are touched here that
 * weren't created by the production code paths themselves.
 */

vi.mock("@/integrations/supabase/client", async () => {
  const mod = await import("./helpers/fakeSupabase");
  return { supabase: mod.supabase };
});
vi.mock("@/lib/boq/pdf", () => ({
  generateBoqPDF: async () => ({ output: () => new Blob() }),
}));

import { tables, rpcCalls, resetFake } from "./helpers/fakeSupabase";
import { createInitialBoqForOrder } from "@/lib/revisions";
import {
  setItemApproval,
  bulkSetItemApprovals,
  syncApprovalToBoqSnapshot,
} from "@/lib/design/itemApprovals";
import { fetchItemApprovalVerdicts } from "@/lib/boq/itemApprovalSync";
import { fetchDesignApprovalStates } from "@/lib/boq/designApprovalStatus";
import type { OrderRecord } from "@/lib/orders/types";
import type { BoqRecord } from "@/lib/boq/types";

const OA_ID = "oa-fresh";
const OA_NUMBER = "MROA/2026-27/0099";

function seedFreshOA() {
  tables.orders = [{
    id: OA_ID,
    oa_number: OA_NUMBER,
    revision: 0,
    parent_order_id: null,
    is_current: true,
    user_id: "u-test",
    format: "MR",
    status: "draft",
    company_name: "Acme",
    cost_sheet_number: "CS-99",
    reference: null,
    bill_to: { name: "Acme" },
    notes: null,
    prepared_by: "Tester",
    line_items: [
      { id: "oa-pump", description: "Pump",  model: "P-100", quantity: 1, unit: "Nos", unit_rate: 100, amount: 100 },
      { id: "oa-motor", description: "Motor", model: "M-50",  quantity: 2, unit: "Nos", unit_rate: 50,  amount: 100 },
    ],
  }];
}

beforeEach(() => {
  resetFake();
  seedFreshOA();
});

describe("Initial OA → auto BOQ approval sync", () => {
  it("auto-creates the BOQ, propagates per-item Design approval, and reports approved everywhere", async () => {
    const order = tables.orders[0] as unknown as OrderRecord;

    // 1. Auto-create initial BOQ.
    const boq = (await createInitialBoqForOrder(order)) as BoqRecord;
    expect(boq).toBeTruthy();
    expect(boq.order_id).toBe(OA_ID);
    expect(boq.revision).toBe(0);
    expect(boq.is_current).toBe(true);
    expect(boq.reference_oa_number).toBe(OA_NUMBER);
    expect(boq.line_items).toHaveLength(2);
    const pump  = boq.line_items.find((i) => i.description === "Pump")!;
    const motor = boq.line_items.find((i) => i.description === "Motor")!;
    // Mirror is initially absent — Design has not yet decided.
    expect(pump.approval_status).toBeUndefined();
    expect(motor.approval_status).toBeUndefined();

    // 2. Design approves Pump per-item, then bulk-approves the rest.
    await setItemApproval(boq.id, pump.id, 0, "approved");
    await syncApprovalToBoqSnapshot(boq.id, [pump.id], "approved");
    await bulkSetItemApprovals(boq.id, [motor.id], 0, "approved");
    await syncApprovalToBoqSnapshot(boq.id, [motor.id], "approved");

    // 3. boq_item_design_status has both rows at the correct revision.
    const statusRows = tables.boq_item_design_status.filter((r) => r.boq_id === boq.id);
    expect(statusRows).toHaveLength(2);
    for (const r of statusRows) {
      expect(r.status).toBe("approved");
      expect(r.boq_revision).toBe(0);
    }

    // 4. line_items mirror was written by syncApprovalToBoqSnapshot.
    const stored = tables.boqs.find((b) => b.id === boq.id) as unknown as BoqRecord;
    const storedPump  = stored.line_items.find((i) => i.id === pump.id)!;
    const storedMotor = stored.line_items.find((i) => i.id === motor.id)!;
    expect(storedPump.approval_status).toBe("approved");
    expect(storedMotor.approval_status).toBe("approved");

    // 5. fetchItemApprovalVerdicts (Manufacturing items table) → both approved.
    const verdicts = await fetchItemApprovalVerdicts(boq.id, 0, stored.line_items);
    expect(verdicts.get(pump.id)).toBe("approved");
    expect(verdicts.get(motor.id)).toBe("approved");

    // 6. fetchDesignApprovalStates (Design list / Manufacturing / Purchase badge).
    const states = await fetchDesignApprovalStates([{ id: boq.id, revision: 0, line_items: stored.line_items }]);
    expect(states.get(boq.id)).toBe("approved");

    // 7. Cascaded BOQ creation suppressed its own notifications.
    const onCount  = rpcCalls.filter((c) => c.name === "set_notif_suppress" && (c.args as { p_on: boolean }).p_on === true).length;
    const offCount = rpcCalls.filter((c) => c.name === "set_notif_suppress" && (c.args as { p_on: boolean }).p_on === false).length;
    expect(onCount).toBeGreaterThanOrEqual(1);
    expect(onCount).toBe(offCount);
  });
});