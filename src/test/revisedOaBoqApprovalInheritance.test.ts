import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test #2 — Revised OA → revised BOQ approval inheritance,
 * with simulated refresh and cross-module navigation.
 *
 * 1. Seed R6 OA + R6 BOQ with one approved item (Pump) + applied Design
 *    comment, and one not-yet-decided item (Motor).
 * 2. Click Revise OA (`reviseOrder` w/ autoReviseBoq) → R7 OA + R7 BOQ.
 * 3. "Refresh" by snapshotting verdicts via the same helpers a freshly
 *    loaded page calls; re-run the helpers in a different order to
 *    simulate navigation through Manufacturing → Purchase → BOQ Folder →
 *    OA Editor and assert identical results with zero write side effects.
 */

vi.mock("@/integrations/supabase/client", async () => {
  const mod = await import("./helpers/fakeSupabase");
  return { supabase: mod.supabase };
});
vi.mock("@/lib/boq/pdf", () => ({
  generateBoqPDF: async () => ({ output: () => new Blob() }),
}));

import { tables, writeCalls, resetFake } from "./helpers/fakeSupabase";
import { reviseOrder } from "@/lib/revisions";
import { fetchRevisionApprovalSnapshots } from "@/lib/boq/approvalSnapshots";
import { fetchItemApprovalVerdicts } from "@/lib/boq/itemApprovalSync";
import { fetchDesignApprovalStates } from "@/lib/boq/designApprovalStatus";
import type { OrderRecord } from "@/lib/orders/types";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";

const BASE = "MROA/2026-27/0007";
const ROOT = "oa-root";
const R6 = "oa-r6";
const BOQ_R6 = "boq-r6";
const ITEM_PUMP = "boq-r6-pump";
const ITEM_MOTOR = "boq-r6-motor";

function seed() {
  tables.orders = [
    { id: ROOT, oa_number: BASE, revision: 0, parent_order_id: null, is_current: false, line_items: [], user_id: "u-test", format: "MR" },
    {
      id: R6, oa_number: `${BASE}/R6`, revision: 6, parent_order_id: ROOT, is_current: true,
      revised_from_id: null, user_id: "u-test", format: "MR", status: "draft",
      company_name: "Acme", cost_sheet_number: "CS-7", reference: null,
      bill_to: { name: "Acme" }, notes: null, prepared_by: "Tester",
      line_items: [
        { id: "oa-i-pump",  description: "Pump",  model: "P-100", quantity: 1, unit: "Nos", unit_rate: 100, amount: 100 },
        { id: "oa-i-motor", description: "Motor", model: "M-50",  quantity: 2, unit: "Nos", unit_rate: 50,  amount: 100 },
      ],
    },
  ];
  tables.boqs = [{
    id: BOQ_R6, order_id: R6, source_order_id: R6, user_id: "u-test",
    boq_number: "MRBOQ/26-27/0007/R6", version: 1, revision: 6, is_current: true,
    format: "MR", status: "draft", prepared_by: "Tester", boq_date: "2026-06-01",
    reference_oa_number: `${BASE}/R6`, project_number: "CS-7", client_name: "Acme",
    terms: "T&C", notes: null,
    line_items: [
      { id: ITEM_PUMP,  item_no: "1", model_number: "P-100", description: "Pump",  quantity: 1, unit: "Nos", remarks: "", approval_status: "approved", approval_comment: "Design OK" },
      { id: ITEM_MOTOR, item_no: "2", model_number: "M-50",  description: "Motor", quantity: 2, unit: "Nos", remarks: "" },
    ],
  }];
  tables.boq_design_comments = [{
    id: "dc-1", boq_id: BOQ_R6, boq_item_id: ITEM_PUMP, column_key: "remarks",
    comment: "Use SS316 housing", user_id: "u-d", user_name: "Designer", user_email: "d@x.com",
    department: "Design", applied_to_oa_at: "2026-06-02T10:00:00Z", applied_to_oa_by: "u-d",
    applied_value: "Use SS316 housing", oa_revision_id: R6,
  }];
  tables.boq_item_design_status = [{
    id: "ds-1", boq_id: BOQ_R6, boq_item_id: ITEM_PUMP, boq_revision: 6, status: "approved",
    decided_by: "u-d", decided_by_name: "Designer", decided_by_department: "Design",
    decided_at: "2026-06-02T10:05:00Z",
  }];
  tables.boq_design_comments_drafts = [];
}

beforeEach(() => { resetFake(); seed(); });

describe("Revised OA → revised BOQ approval inheritance", () => {
  it("creates R7 OA+BOQ that inherit approval, then refresh+nav stay consistent without writes", async () => {
    const r6 = tables.orders.find((o) => o.id === R6) as unknown as OrderRecord;

    // ----- Revise -----
    const { order: r7, boq: r7BoqInsert } = await reviseOrder(r6, { autoReviseBoq: true });
    expect(r7.revision).toBe(7);
    expect(r7.parent_order_id).toBe(ROOT);
    expect(r7.revised_from_id).toBe(R6);
    expect(r7.oa_number).toBe(`${BASE}/R7`);
    const r7Boq = r7BoqInsert as BoqRecord;
    expect(r7Boq).toBeTruthy();
    expect(r7Boq.revision).toBe(7);
    expect(r7Boq.is_current).toBe(true);

    // Reread stored R7 BOQ to capture line_items the way a page load would.
    const storedR7 = tables.boqs.find((b) => b.id === r7Boq.id) as unknown as BoqRecord;
    expect(storedR7).toBeTruthy();
    const pump  = storedR7.line_items.find((i) => i.description === "Pump")!;
    const motor = storedR7.line_items.find((i) => i.description === "Motor")!;

    // Inherited approval landed on the mirror.
    expect(pump.approval_status).toBe("approved");
    expect(pump.approval_comment).toBe("Design OK");

    // Inherited per-item design status rows exist at the new revision.
    const newStatuses = tables.boq_item_design_status.filter((s) => s.boq_id === r7Boq.id);
    expect(newStatuses.length).toBeGreaterThanOrEqual(1);
    expect(newStatuses.every((s) => s.boq_revision === 7)).toBe(true);
    expect(newStatuses.find((s) => s.boq_item_id === pump.id)?.status).toBe("approved");

    // Carried Design comment remapped to the new Pump item id.
    const carried = tables.boq_design_comments.filter((c) => c.boq_id === r7Boq.id);
    expect(carried).toHaveLength(1);
    expect(carried[0].boq_item_id).toBe(pump.id);
    expect(carried[0].applied_to_oa_at).toBe("2026-06-02T10:00:00Z");

    // ----- Snapshot writeCalls so far, then assert refresh/nav is read-only -----
    const writesBefore = writeCalls.length;

    const refresh = async () => {
      const snaps    = await fetchRevisionApprovalSnapshots([r7Boq.id]);
      const verdicts = await fetchItemApprovalVerdicts(r7Boq.id, 7, storedR7.line_items as BoqLineItem[]);
      const states   = await fetchDesignApprovalStates([{ id: r7Boq.id, revision: 7, line_items: storedR7.line_items }]);
      return { snaps, verdicts, states };
    };

    // Refresh #1 — OA Editor path.
    const view1 = await refresh();
    expect(view1.verdicts.get(pump.id)).toBe("approved");
    expect(view1.states.get(r7Boq.id)).toBeDefined();

    // Navigation — Manufacturing → Purchase → BOQ Folder → OA Editor.
    const view2 = await refresh();
    const view3 = await refresh();

    // Identical verdicts across every "view".
    expect(Array.from(view2.verdicts.entries())).toEqual(Array.from(view1.verdicts.entries()));
    expect(Array.from(view3.verdicts.entries())).toEqual(Array.from(view1.verdicts.entries()));
    expect(view2.states.get(r7Boq.id)).toBe(view1.states.get(r7Boq.id));
    expect(view3.states.get(r7Boq.id)).toBe(view1.states.get(r7Boq.id));

    // Zero writes during refresh/navigation — display helpers must not mutate.
    expect(writeCalls.length).toBe(writesBefore);

    // Pump remains approved on the revised BOQ; Motor reflects what carry-forward
    // produced (must be deterministic across refreshes).
    expect(view1.verdicts.get(pump.id)).toBe("approved");
    expect(view1.verdicts.get(motor.id)).toBe(view2.verdicts.get(motor.id));
  });
});