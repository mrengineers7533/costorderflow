import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guards that an OA revision keeps showing the inherited Design comment and
 * approved-item status consistently across every consumer view:
 *   - OA page              → reads `boqs.line_items[].approval_status`
 *   - Design BOQ           → reads `fetchLatestSubmittedRound` / `fetchLatestApprovalRound`
 *   - Manufacturing folder → reads `fetchDesignApprovalStates`
 *   - Purchase / BOQ Folder→ reads `fetchDesignApprovalStates`
 *
 * All five views must agree for a revised BOQ even when the new revision
 * has no design-review round of its own yet — the data must inherit from
 * the previous revision in the same OA family.
 */

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  boqs: [],
  orders: [],
  boq_item_design_status: [],
  boq_design_reviews: [],
  boq_design_review_items: [],
  boq_design_review_documents: [],
};

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function buildQuery(table: string) {
  let rows: Row[] = [...(tables[table] || [])];
  const api: Record<string, unknown> = {};
  Object.assign(api, {
    select() { return api; },
    eq(col: string, v: unknown) { rows = rows.filter((r) => r[col] === v); return api; },
    in(col: string, arr: unknown[]) { rows = rows.filter((r) => arr.includes(r[col] as never)); return api; },
    or(str: string) {
      const clauses = str.split(",").map((c) => c.trim());
      rows = rows.filter((r) => clauses.some((c) => {
        const [col, op, ...vparts] = c.split(".");
        const v = vparts.join(".");
        return op === "eq" && String(r[col] ?? "") === v;
      }));
      return api;
    },
    order() { return api; },
    limit() { return api; },
    async single() { return { data: rows[0] ? clone(rows[0]) : null, error: null }; },
    async maybeSingle() { return { data: rows[0] ? clone(rows[0]) : null, error: null }; },
    then(onF: (v: { data: Row[]; error: null }) => unknown) {
      return Promise.resolve(onF({ data: clone(rows), error: null }));
    },
  });
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      return { select: () => buildQuery(table) };
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

import { fetchDesignApprovalStates } from "@/lib/boq/designApprovalStatus";
import {
  fetchLatestSubmittedRound,
  fetchLatestApprovalRound,
} from "@/lib/boq/designReview";

const OA_ROOT = "oa-root";
const OA_R6 = "oa-r6";
const OA_R7 = "oa-r7";
const BOQ_R6 = "boq-r6";
const BOQ_R7 = "boq-r7";
const PUMP_OLD = "pump-old";
const MOTOR_OLD = "motor-old";
const PUMP_NEW = "pump-new";
const MOTOR_NEW = "motor-new";

function reset() {
  for (const k of Object.keys(tables)) tables[k] = [];
}

function seed({ withR7DesignStatus }: { withR7DesignStatus: boolean }) {
  tables.orders.push(
    { id: OA_ROOT, parent_order_id: null },
    { id: OA_R6, parent_order_id: OA_ROOT },
    { id: OA_R7, parent_order_id: OA_ROOT },
  );
  tables.boqs.push(
    {
      id: BOQ_R6, order_id: OA_R6, revised_from_id: null, revision: 6,
      line_items: [
        { id: PUMP_OLD, description: "Pump", model_number: "P-100", approval_status: "approved" },
        { id: MOTOR_OLD, description: "Motor", model_number: "M-50", approval_status: "approved" },
      ],
    },
    {
      id: BOQ_R7, order_id: OA_R7, revised_from_id: BOQ_R6, revision: 7,
      line_items: [
        { id: PUMP_NEW, description: "Pump", model_number: "P-100", approval_status: "approved" },
        { id: MOTOR_NEW, description: "Motor", model_number: "M-50", approval_status: "approved" },
      ],
    },
  );
  // R6 has design-status rows + a submitted+approval round; R7 has them
  // only when explicitly carried-forward.
  tables.boq_item_design_status.push(
    { boq_id: BOQ_R6, boq_item_id: PUMP_OLD, status: "approved", boq_revision: 6 },
    { boq_id: BOQ_R6, boq_item_id: MOTOR_OLD, status: "approved", boq_revision: 6 },
  );
  if (withR7DesignStatus) {
    tables.boq_item_design_status.push(
      { boq_id: BOQ_R7, boq_item_id: PUMP_NEW, status: "approved", boq_revision: 7 },
      { boq_id: BOQ_R7, boq_item_id: MOTOR_NEW, status: "approved", boq_revision: 7 },
    );
  }
  tables.boq_design_reviews.push(
    {
      id: "rev-r6-submit", boq_id: BOQ_R6, round_no: 1, status: "submitted",
      kind: "comment", boq_snapshot: {},
    },
    {
      id: "rev-r6-approval", boq_id: BOQ_R6, round_no: 2, status: "sent",
      kind: "approval", boq_snapshot: {},
    },
  );
  tables.boq_design_review_items.push(
    { id: "rri-1", review_id: "rev-r6-submit", boq_item_id: PUMP_OLD, description: "Pump", model_number: "P-100", item_no: "1", decision: "approved", comment: "Use SS316" },
    { id: "rri-2", review_id: "rev-r6-submit", boq_item_id: MOTOR_OLD, description: "Motor", model_number: "M-50", item_no: "2", decision: "approved", comment: null },
    { id: "rri-3", review_id: "rev-r6-approval", boq_item_id: PUMP_OLD, description: "Pump", model_number: "P-100", item_no: "1", decision: "approved", comment: null },
    { id: "rri-4", review_id: "rev-r6-approval", boq_item_id: MOTOR_OLD, description: "Motor", model_number: "M-50", item_no: "2", decision: "approved", comment: null },
  );
}

describe("Revised BOQ — inherited Design approval & comment consistency", () => {
  beforeEach(() => reset());

  it("OA / Manufacturing / Purchase / BOQ Folder all see R7 as Approved when line_items mirror + design status carried forward", async () => {
    seed({ withR7DesignStatus: true });
    const map = await fetchDesignApprovalStates([
      { id: BOQ_R6, revision: 6, line_items: tables.boqs[0].line_items as never },
      { id: BOQ_R7, revision: 7, line_items: tables.boqs[1].line_items as never },
    ]);
    expect(map.get(BOQ_R6)).toBe("approved");
    expect(map.get(BOQ_R7)).toBe("approved");
  });

  it("MR-style: R7 with NO design-status rows of its own inherits Approved from R6 via revised_from_id (no per-record backfill needed)", async () => {
    seed({ withR7DesignStatus: false });
    const map = await fetchDesignApprovalStates([
      { id: BOQ_R7, revision: 7, line_items: tables.boqs[1].line_items as never },
    ]);
    expect(map.get(BOQ_R7)).toBe("approved");
  });

  it("Inherited negative state surfaces explicitly: ancestor has a rejection → revised BOQ reads Not Approved (never blank)", async () => {
    seed({ withR7DesignStatus: false });
    // Flip one R6 row to rejected
    (tables.boq_item_design_status[0] as { status: string }).status = "rejected";
    // Strip approval_status mirror on R7 so we exercise the inheritance path
    for (const it of tables.boqs[1].line_items as Array<{ approval_status?: string }>) {
      delete it.approval_status;
    }
    const map = await fetchDesignApprovalStates([
      { id: BOQ_R7, revision: 7, line_items: tables.boqs[1].line_items as never },
    ]);
    expect(map.get(BOQ_R7)).toBe("not_approved");
  });

  it("GMS-style parity: both line_items mirror and own design-status rows present → Approved (no regression)", async () => {
    seed({ withR7DesignStatus: true });
    const map = await fetchDesignApprovalStates([
      { id: BOQ_R6, revision: 6, line_items: tables.boqs[0].line_items as never },
    ]);
    expect(map.get(BOQ_R6)).toBe("approved");
  });

  it("Design BOQ view: fetchLatestSubmittedRound inherits R6's round on R7 and remaps item ids to R7's line_items", async () => {
    seed({ withR7DesignStatus: true });
    const got = await fetchLatestSubmittedRound(BOQ_R7);
    expect(got).not.toBeNull();
    expect(got!.round.id).toBe("rev-r6-submit");
    const ids = got!.items.map((i) => i.boq_item_id).sort();
    expect(ids).toEqual([MOTOR_NEW, PUMP_NEW].sort());
    const pump = got!.items.find((i) => i.boq_item_id === PUMP_NEW)!;
    expect(pump.comment).toBe("Use SS316");
  });

  it("Design BOQ view: fetchLatestApprovalRound inherits R6's approval round on R7 with remapped ids", async () => {
    seed({ withR7DesignStatus: true });
    const got = await fetchLatestApprovalRound(BOQ_R7);
    expect(got).not.toBeNull();
    expect(got!.round.id).toBe("rev-r6-approval");
    const ids = got!.items.map((i) => i.boq_item_id).sort();
    expect(ids).toEqual([MOTOR_NEW, PUMP_NEW].sort());
    for (const it of got!.items) expect(it.decision).toBe("approved");
  });
});