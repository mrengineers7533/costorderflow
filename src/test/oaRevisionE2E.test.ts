import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * End-to-end test for the OA-revision + carry-forward flow described in
 * the requirements: open MROA/2026-27/0007/R6, apply a Design comment +
 * approval on the linked BOQ, then revise to R7 and verify that:
 *
 *   1. R7 is created from R6 (revised_from_id, parent_order_id, revision++).
 *   2. R7's OA number is MROA/2026-27/0007/R7.
 *   3. A fresh BOQ revision is auto-created tied to R7.
 *   4. The applied Design comment from R6's BOQ is carried forward to the
 *      new BOQ revision and points to the correct (description+model) row.
 *   5. The per-item Design approval status from R6's BOQ is carried
 *      forward to R7's BOQ so the OA still shows it as "Approved".
 */

// --- In-memory fake DB ------------------------------------------------------

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  orders: [],
  boqs: [],
  boq_design_comments: [],
  boq_item_design_status: [],
};
const rpcCalls: Array<{ name: string; args: unknown }> = [];

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

// Chainable query builder that supports the subset of methods the
// revision helpers use: select / eq / in / or / order / single /
// maybeSingle / insert / and direct await.
function buildQuery(table: string, mode: "select" | "insert" = "select", pending?: Row[]) {
  let rows: Row[] = mode === "insert" ? (pending || []) : [...(tables[table] || [])];
  const api: {
    select: (cols?: string) => typeof api;
    eq: (col: string, val: unknown) => typeof api;
    in: (col: string, arr: unknown[]) => typeof api;
    or: (str: string) => typeof api;
    order: (col: string, opts?: unknown) => typeof api;
    single: () => Promise<{ data: Row | null; error: null }>;
    maybeSingle: () => Promise<{ data: Row | null; error: null }>;
    then: (onF: (v: { data: Row[]; error: null }) => unknown) => Promise<unknown>;
  } = {
    select() { return api; },
    eq(col, val) { rows = rows.filter((r) => r[col] === val); return api; },
    in(col, arr) { rows = rows.filter((r) => arr.includes(r[col] as never)); return api; },
    or(str) {
      // Supports: "<col>.eq.<v>,<col>.like.<pattern>"
      const clauses = str.split(",").map((c) => c.trim());
      rows = rows.filter((r) => clauses.some((c) => {
        const [col, op, ...vparts] = c.split(".");
        const v = vparts.join(".");
        const cell = String(r[col] ?? "");
        if (op === "eq") return cell === v;
        if (op === "like") {
          const re = new RegExp("^" + v.replace(/[.*+?^${}()|[\]\\]/g, (m) => "\\" + m).replace(/%/g, ".*") + "$");
          return re.test(cell);
        }
        return false;
      }));
      return api;
    },
    order() { return api; },
    async single() {
      if (mode === "insert") {
        for (const r of pending || []) tables[table].push(clone(r));
        return { data: clone((pending || [])[0] || null), error: null };
      }
      return { data: rows[0] ? clone(rows[0]) : null, error: null };
    },
    async maybeSingle() { return api.single(); },
    then(onF) {
      if (mode === "insert") {
        for (const r of pending || []) tables[table].push(clone(r));
        return Promise.resolve(onF({ data: clone(pending || []), error: null }));
      }
      return Promise.resolve(onF({ data: clone(rows), error: null }));
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: null, error: null };
    },
    from(table: string) {
      return {
        select: (cols?: string) => buildQuery(table, "select"),
        insert: (payload: Row | Row[]) => {
          const arr = Array.isArray(payload) ? payload : [payload];
          const enriched = arr.map((r) => ({
            id: (r.id as string) || crypto.randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...r,
          }));
          return buildQuery(table, "insert", enriched);
        },
        update: (patch: Row) => {
          const filters: Array<(r: Row) => boolean> = [];
          const api = {
            eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return api; },
            in(col: string, arr: unknown[]) { filters.push((r) => arr.includes(r[col] as never)); return api; },
            then(onF: (v: { data: null; error: null }) => unknown) {
              for (const r of tables[table] || []) {
                if (filters.every((f) => f(r))) Object.assign(r, patch, { updated_at: new Date().toISOString() });
              }
              return Promise.resolve(onF({ data: null, error: null }));
            },
          };
          return api;
        },
      };
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  },
}));

// reviseBoqFromOrder snapshots the previous BOQ to PDF; mock the heavy
// PDF generator so the test doesn't pull jspdf into jsdom.
vi.mock("@/lib/boq/pdf", () => ({
  generateBoqPDF: async () => ({ output: () => new Blob() }),
}));

// Import the system under test AFTER the mocks are registered.
import { reviseOrder } from "@/lib/revisions";
import type { OrderRecord } from "@/lib/orders/types";
import type { BoqRecord } from "@/lib/boq/types";

// --- Fixtures ---------------------------------------------------------------

const BASE_OA = "MROA/2026-27/0007";
const ROOT_OA_ID = "oa-root";
const R6_ID = "oa-r6";
const BOQ_R6_ID = "boq-r6";
const BOQ_ITEM_PUMP = "boq-r6-pump";
const BOQ_ITEM_MOTOR = "boq-r6-motor";

function seed() {
  // R0 (root) ... R5 placeholders + R6 active
  tables.orders.push(
    { id: ROOT_OA_ID, oa_number: BASE_OA, revision: 0, parent_order_id: null, is_current: false, line_items: [], user_id: null, format: "MR" },
    { id: "oa-r1", oa_number: `${BASE_OA}/R1`, revision: 1, parent_order_id: ROOT_OA_ID, is_current: false, line_items: [], user_id: null, format: "MR" },
    { id: "oa-r5", oa_number: `${BASE_OA}/R5`, revision: 5, parent_order_id: ROOT_OA_ID, is_current: false, line_items: [], user_id: null, format: "MR" },
    {
      id: R6_ID,
      oa_number: `${BASE_OA}/R6`,
      revision: 6,
      parent_order_id: ROOT_OA_ID,
      is_current: true,
      revised_from_id: "oa-r5",
      user_id: null,
      format: "MR",
      status: "draft",
      company_name: "Acme",
      cost_sheet_number: "CS-7",
      reference: null,
      bill_to: { name: "Acme" },
      notes: null,
      prepared_by: "Tester",
      line_items: [
        { id: "oa-i-pump", description: "Pump",  model: "P-100", quantity: 1, unit: "Nos", unit_rate: 100, amount: 100 },
        { id: "oa-i-motor", description: "Motor", model: "M-50", quantity: 2, unit: "Nos", unit_rate: 50, amount: 100 },
      ],
    },
  );
  tables.boqs.push({
    id: BOQ_R6_ID,
    order_id: R6_ID,
    source_order_id: R6_ID,
    user_id: null,
    boq_number: `MRBOQ/26-27/0007/R6`,
    version: 1,
    revision: 6,
    is_current: true,
    format: "MR",
    status: "draft",
    prepared_by: "Tester",
    boq_date: "2026-06-01",
    reference_oa_number: `${BASE_OA}/R6`,
    project_number: "CS-7",
    client_name: "Acme",
    terms: "T&C", notes: null,
    line_items: [
      { id: BOQ_ITEM_PUMP,  item_no: "1", model_number: "P-100", description: "Pump",  quantity: 1, unit: "Nos", remarks: "", approval_status: "approved", approval_comment: "Design OK" },
      { id: BOQ_ITEM_MOTOR, item_no: "2", model_number: "M-50",  description: "Motor", quantity: 2, unit: "Nos", remarks: "" },
    ],
  });
  // Applied Design comment on R6's BOQ (must carry forward).
  tables.boq_design_comments.push({
    id: "dc-1",
    boq_id: BOQ_R6_ID,
    boq_item_id: BOQ_ITEM_PUMP,
    column_key: "remarks",
    comment: "Use SS316 housing",
    user_id: "u-designer",
    user_name: "Designer",
    user_email: "d@example.com",
    department: "Design",
    applied_to_oa_at: "2026-06-02T10:00:00Z",
    applied_to_oa_by: "u-designer",
    applied_value: "Use SS316 housing",
    oa_revision_id: R6_ID,
  });
  // Draft / never-applied comment that must NOT carry forward.
  tables.boq_design_comments.push({
    id: "dc-draft",
    boq_id: BOQ_R6_ID,
    boq_item_id: BOQ_ITEM_MOTOR,
    column_key: "remarks",
    comment: "draft only — do not carry",
    user_id: "u-designer", user_name: "Designer", user_email: "d@example.com",
    department: "Design",
    applied_to_oa_at: null, applied_to_oa_by: null, applied_value: null, oa_revision_id: null,
  });
  // Per-item Design approval status row for the Pump item.
  tables.boq_item_design_status.push({
    id: "ds-1",
    boq_id: BOQ_R6_ID,
    boq_item_id: BOQ_ITEM_PUMP,
    boq_revision: 6,
    status: "approved",
    decided_by: "u-designer",
    decided_by_name: "Designer",
    decided_by_department: "Design",
    decided_at: "2026-06-02T10:05:00Z",
  });
}

beforeEach(() => {
  for (const k of Object.keys(tables)) tables[k].length = 0;
  rpcCalls.length = 0;
  seed();
});

// --- The test ---------------------------------------------------------------

describe("OA revision E2E — R6 → R7 carries Design comment + approval", () => {
  it("creates R7 from R6 with carry-forward of applied comment and approval", async () => {
    const r6 = tables.orders.find((o) => o.id === R6_ID) as unknown as OrderRecord;

    const { order: r7, boq: r7Boq } = await reviseOrder(r6, { autoReviseBoq: true });

    // 1. R7 was created from R6.
    expect(r7).toBeTruthy();
    expect(r7.revision).toBe(7);
    expect(r7.oa_number).toBe(`${BASE_OA}/R7`);
    expect(r7.parent_order_id).toBe(ROOT_OA_ID);
    expect(r7.revised_from_id).toBe(R6_ID);
    expect(r7.is_current).toBe(true);
    // OA content (line items) is carried over.
    expect(r7.line_items).toHaveLength(2);
    expect(r7.line_items.map((i) => i.description)).toEqual(["Pump", "Motor"]);

    // 2. A new BOQ revision was auto-created tied to R7.
    expect(r7Boq).toBeTruthy();
    const newBoq = r7Boq as BoqRecord;
    expect(newBoq.order_id).toBe(r7.id);
    expect(newBoq.revision).toBe(7);
    expect(newBoq.is_current).toBe(true);
    expect(newBoq.reference_oa_number).toBe(`${BASE_OA}/R7`);
    expect(newBoq.line_items).toHaveLength(2);

    // 3. Per-item approval snapshot carried forward into the new BOQ items.
    const pumpItem = newBoq.line_items.find((i) => i.description === "Pump")!;
    expect(pumpItem.approval_status).toBe("approved");
    expect(pumpItem.approval_comment).toBe("Design OK");

    // 4. Applied Design comment carried over and remapped to the new Pump
    //    item id; draft comment dropped.
    const carried = tables.boq_design_comments.filter((c) => c.boq_id === newBoq.id);
    expect(carried).toHaveLength(1);
    expect(carried[0].boq_item_id).toBe(pumpItem.id);
    expect(carried[0].comment).toBe("Use SS316 housing");
    expect(carried[0].column_key).toBe("remarks");
    expect(carried[0].applied_to_oa_at).toBe("2026-06-02T10:00:00Z");

    // 5. Per-item Design status row carried forward to the new BOQ revision.
    //    Pump matches R6's explicit status row by description+model. Motor
    //    is also stamped 'approved' via the bulk-approved inference (R6
    //    had only 'approved' statuses recorded and no 'rejected'), so the
    //    OA's "Approved by Design" column stays correct on R7.
    const newStatuses = tables.boq_item_design_status.filter((s) => s.boq_id === newBoq.id);
    expect(newStatuses).toHaveLength(2);
    const newStatusByItem = new Map(newStatuses.map((s) => [s.boq_item_id, s]));
    const motorItem = newBoq.line_items.find((i) => i.description === "Motor")!;
    expect(newStatusByItem.get(pumpItem.id)?.status).toBe("approved");
    expect(newStatusByItem.get(pumpItem.id)?.boq_revision).toBe(7);
    expect(newStatusByItem.get(motorItem.id)?.status).toBe("approved");
    // Mirrored onto new BOQ line_items so OA/folder display matches.
    expect(pumpItem.approval_status).toBe("approved");
    expect(motorItem.approval_status).toBe("approved");

    // 6. Notification cascades from the BOQ auto-revise were suppressed.
    const suppressOn  = rpcCalls.filter((c) => c.name === "set_notif_suppress" && (c.args as { p_on: boolean }).p_on === true).length;
    const suppressOff = rpcCalls.filter((c) => c.name === "set_notif_suppress" && (c.args as { p_on: boolean }).p_on === false).length;
    expect(suppressOn).toBeGreaterThanOrEqual(1);
    expect(suppressOn).toBe(suppressOff);
  });
});
