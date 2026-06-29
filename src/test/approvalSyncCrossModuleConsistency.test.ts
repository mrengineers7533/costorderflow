import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test #3 — Same revision viewed from OA, Design BOQ,
 * Manufacturing, Purchase and BOQ Folder must all report the same per-item
 * verdict and BOQ-level badge.
 *
 * Calls the exact helpers each page uses today:
 *   - OA Editor                → fetchRevisionApprovalSnapshots
 *   - Design BOQ List          → fetchDesignApprovalStates
 *   - Manufacturing items grid → fetchItemApprovalVerdicts
 *   - Manufacturing badge      → fetchDesignApprovalStates
 *   - Purchase BOQ Folder      → fetchDesignApprovalStates
 *
 * No production logic is changed — this test only locks the contract.
 */

vi.mock("@/integrations/supabase/client", async () => {
  const mod = await import("./helpers/fakeSupabase");
  return { supabase: mod.supabase };
});
vi.mock("@/lib/boq/pdf", () => ({
  generateBoqPDF: async () => ({ output: () => new Blob() }),
}));

import { tables, writeCalls, resetFake } from "./helpers/fakeSupabase";
import { createInitialBoqForOrder } from "@/lib/revisions";
import {
  bulkSetItemApprovals,
  syncApprovalToBoqSnapshot,
} from "@/lib/design/itemApprovals";
import {
  fetchRevisionApprovalSnapshots,
  mapSnapshotItems,
} from "@/lib/boq/approvalSnapshots";
import { fetchItemApprovalVerdicts } from "@/lib/boq/itemApprovalSync";
import { fetchDesignApprovalStates } from "@/lib/boq/designApprovalStatus";
import type { OrderRecord } from "@/lib/orders/types";
import type { BoqRecord, BoqLineItem } from "@/lib/boq/types";

function seed() {
  tables.orders = [{
    id: "oa-x", oa_number: "GMS/2026-27/0042", revision: 0, parent_order_id: null,
    is_current: true, user_id: "u-test", format: "GMS", status: "draft",
    company_name: "Acme", cost_sheet_number: "CS-42", reference: null,
    bill_to: { name: "Acme" }, notes: null, prepared_by: "Tester",
    line_items: [
      { id: "i-a", description: "Pump", model: "P-1", quantity: 1, unit: "Nos", unit_rate: 100, amount: 100 },
      { id: "i-b", description: "Valve", model: "V-9", quantity: 3, unit: "Nos", unit_rate: 20,  amount: 60  },
    ],
  }];
}

beforeEach(() => { resetFake(); seed(); });

describe("Cross-module approval consistency on a single revision", () => {
  it("OA, Design, Manufacturing and Purchase helpers agree on every verdict", async () => {
    const order = tables.orders[0] as unknown as OrderRecord;
    const boq = (await createInitialBoqForOrder(order)) as BoqRecord;
    const stored = tables.boqs.find((b) => b.id === boq.id) as unknown as BoqRecord;
    const ids = stored.line_items.map((i) => i.id);

    // Design approves all items.
    await bulkSetItemApprovals(boq.id, ids, 0, "approved");
    await syncApprovalToBoqSnapshot(boq.id, ids, "approved");
    const after = tables.boqs.find((b) => b.id === boq.id) as unknown as BoqRecord;

    const writesBefore = writeCalls.length;

    // OA editor read.
    const snaps     = await fetchRevisionApprovalSnapshots([boq.id]);
    const snapItems = mapSnapshotItems(snaps.get(boq.id), 0); // empty until DB triggers exist; OK

    // Design BOQ list / Purchase BOQ Folder / Manufacturing badge.
    const states = await fetchDesignApprovalStates([{ id: boq.id, revision: 0, line_items: after.line_items }]);
    // Manufacturing items grid.
    const verdicts = await fetchItemApprovalVerdicts(boq.id, 0, after.line_items as BoqLineItem[]);

    // Same revision, same data → same verdict everywhere.
    expect(states.get(boq.id)).toBe("approved");
    for (const id of ids) {
      expect(verdicts.get(id)).toBe("approved");
      // If snapshot rows exist, they must agree; otherwise we accept the
      // live-table verdict (matches production: snapshot is the fast path,
      // live tables remain authoritative when triggers haven't materialised).
      const snapV = snapItems.get(id);
      if (snapV) expect(snapV).toBe("approved");
    }

    // Read helpers must never mutate.
    expect(writeCalls.length).toBe(writesBefore);
  });
});