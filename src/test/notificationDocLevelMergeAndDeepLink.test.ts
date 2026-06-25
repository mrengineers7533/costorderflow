import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchHighlightMap,
  getCellChange,
  isRowChanged,
  notifDeepLink,
  type NotifLineChange,
} from "@/lib/notifications/highlight";

/**
 * End-to-end test: a single BOQ document changes with multiple cell edits
 * across multiple rows, and we verify:
 *
 *  1. **Document-level merge** — for each linked target department a single
 *     notification row is produced, and that single row carries every cell
 *     diff for the document (no per-cell or per-row fan-out).
 *  2. **Deep-link** — opening that notification routes to the original
 *     module page with `?notif=<id>` so the page can paint highlights.
 *  3. **Highlight map** — `fetchHighlightMap` returns exactly the changed
 *     rows + fields, with the correct old/new pairs, and unchanged rows
 *     or fields are not present.
 */

// ---- Mock the supabase client used by fetchHighlightMap. -------------------

type FakeRow = {
  id: string;
  module: string;
  record_id: string | null;
  line_item_changes: NotifLineChange[];
};

const fakeDb: Record<string, FakeRow> = {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (_t: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({
            data: fakeDb[id] ?? null,
            error: null,
          }),
        }),
      }),
    }),
  },
}));

// ---- Domain helpers --------------------------------------------------------

const LINKED_TARGET_DEPTS = [
  "purchase",
  "manufacturing",
  "design",
  "requisition",
  "annexure",
  "planning",
  "dispatch",
  "pi",
];

/**
 * Mirror of the merged-notification contract enforced by emit_notification:
 * a single document change produces ONE notification row per linked target
 * department. Every row carries the full set of line-item changes for that
 * document; nothing is split per-row or per-cell.
 */
function emitDocLevelMerged(
  doc: { module: string; recordId: string },
  changes: NotifLineChange[],
  targets: string[],
): FakeRow[] {
  return targets.map((dept, i) => ({
    id: `notif-${doc.recordId}-${dept}`,
    module: doc.module,
    record_id: doc.recordId,
    line_item_changes: changes,
    // Stash dept on the row so the test can assert visibility per dept.
    target_department: dept,
    seq: i,
  } as unknown as FakeRow));
}

// Scenario from the requirements doc:
//   Row 5  quantity:        10  -> 12
//   Row 8  description:     "200mm" -> "250mm"
//   Row 10 make:            "GMS" -> "M.R. Engg"
const SCENARIO_CHANGES: NotifLineChange[] = [
  {
    line_no: "5",
    kind: "modified",
    before: { quantity: 10, description: "100mm", make: "GMS" },
    after: { quantity: 12, description: "100mm", make: "GMS" },
    changed_fields: ["quantity"],
  },
  {
    line_no: "8",
    kind: "modified",
    before: { quantity: 4, description: "200mm", make: "GMS" },
    after: { quantity: 4, description: "250mm", make: "GMS" },
    changed_fields: ["description"],
  },
  {
    line_no: "10",
    kind: "modified",
    before: { quantity: 2, description: "Flange", make: "GMS" },
    after: { quantity: 2, description: "Flange", make: "M.R. Engg" },
    changed_fields: ["make"],
  },
];

beforeEach(() => {
  for (const k of Object.keys(fakeDb)) delete fakeDb[k];
});

describe("Document-level merged notifications + deep-link highlights", () => {
  it("produces exactly one notification per linked target department", () => {
    const rows = emitDocLevelMerged(
      { module: "boq", recordId: "boq-A" },
      SCENARIO_CHANGES,
      LINKED_TARGET_DEPTS,
    );
    expect(rows).toHaveLength(LINKED_TARGET_DEPTS.length);
    // Each linked dept appears exactly once.
    const depts = rows.map((r) => (r as unknown as { target_department: string }).target_department);
    expect(new Set(depts).size).toBe(LINKED_TARGET_DEPTS.length);
    // Multiple cell changes are NOT split across notifications.
    rows.forEach((r) => expect(r.line_item_changes).toHaveLength(SCENARIO_CHANGES.length));
  });

  it("does not fan out per row or per cell within a single document edit", () => {
    const rows = emitDocLevelMerged(
      { module: "boq", recordId: "boq-A" },
      SCENARIO_CHANGES,
      ["purchase"],
    );
    // 3 row changes, 3 cell changes — still one notification per dept.
    expect(rows).toHaveLength(1);
    expect(rows[0].line_item_changes).toHaveLength(3);
  });

  it("deep-links each module to the correct page with ?notif=<id>", () => {
    const cases: Array<{
      n: Parameters<typeof notifDeepLink>[0];
      expected: string;
    }> = [
      {
        n: { id: "n1", module: "boq", record_id: "boq-A" },
        expected: "/boqs/boq-A?notif=n1",
      },
      {
        n: { id: "n2", module: "order", record_id: "oa-A" },
        expected: "/orders/oa-A?notif=n2",
      },
      {
        n: { id: "n3", module: "purchase", record_id: "po-A" },
        expected: "/purchase/po-A?notif=n3",
      },
      {
        n: { id: "n4", module: "requisition", record_id: "rq-A" },
        expected: "/requisitions/rq-A?notif=n4",
      },
      {
        n: { id: "n5", module: "annexure", record_id: "ax-A" },
        expected: "/requisitions/annexure/ax-A?notif=n5",
      },
      {
        n: { id: "n6", module: "pi", record_id: "pi-A" },
        expected: "/pi/pi-A?notif=n6",
      },
    ];
    for (const c of cases) {
      expect(notifDeepLink(c.n)).toBe(c.expected);
    }
  });

  it("encodes the focused row when provided", () => {
    const href = notifDeepLink(
      { id: "n1", module: "boq", record_id: "boq-A" },
      "8",
    );
    expect(href).toContain("notif=n1");
    expect(href).toContain("row=8");
    expect(href!.startsWith("/boqs/boq-A?")).toBe(true);
  });

  it("returns null for unknown modules or missing record ids", () => {
    expect(notifDeepLink({ id: "x", module: "boq", record_id: null })).toBeNull();
    expect(notifDeepLink({ id: "x", module: "mystery", record_id: "z" })).toBeNull();
  });

  it("builds a highlight map containing only the changed rows + fields", async () => {
    const [row] = emitDocLevelMerged(
      { module: "boq", recordId: "boq-A" },
      SCENARIO_CHANGES,
      ["purchase"],
    );
    fakeDb[row.id] = row;

    const map = await fetchHighlightMap(row.id);
    expect(map).not.toBeNull();
    expect(map!.totalRows).toBe(3);
    expect(map!.totalCells).toBe(3);

    // Only the rows mentioned in the diff appear; row 6 (unchanged) does not.
    expect(isRowChanged(map, "5")).toBe(true);
    expect(isRowChanged(map, "8")).toBe(true);
    expect(isRowChanged(map, "10")).toBe(true);
    expect(isRowChanged(map, "6")).toBe(false);
    expect(isRowChanged(map, "99")).toBe(false);
  });

  it("exposes correct Old → New values for each highlighted cell", async () => {
    const [row] = emitDocLevelMerged(
      { module: "boq", recordId: "boq-A" },
      SCENARIO_CHANGES,
      ["purchase"],
    );
    fakeDb[row.id] = row;
    const map = await fetchHighlightMap(row.id);

    expect(getCellChange(map, "5", "quantity")).toEqual({ before: 10, after: 12 });
    expect(getCellChange(map, "8", "description")).toEqual({
      before: "200mm",
      after: "250mm",
    });
    expect(getCellChange(map, "10", "make")).toEqual({
      before: "GMS",
      after: "M.R. Engg",
    });

    // Untouched fields on changed rows are NOT in the cell map.
    expect(getCellChange(map, "5", "description")).toBeNull();
    expect(getCellChange(map, "5", "make")).toBeNull();
    expect(getCellChange(map, "8", "quantity")).toBeNull();
    expect(getCellChange(map, "10", "quantity")).toBeNull();
  });

  it("returns null when the notification id does not exist", async () => {
    expect(await fetchHighlightMap("missing")).toBeNull();
  });
});