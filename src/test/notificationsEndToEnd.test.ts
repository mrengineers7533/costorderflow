import { describe, it, expect } from "vitest";
import { canAckClient, matchTargetDept, normalizeDept } from "@/lib/notifications/dept";

/**
 * End-to-end-style test: simulates a Design/OA Creator (Costing dept) making a
 * single change, fans it out to linked departments using the same exclusion
 * rules enforced by `public.emit_notification`, and asserts:
 *   1. One notification row is produced per linked department (no merging).
 *   2. The actor's own department is NOT in the recipients list.
 *   3. Per-row visibility honors the RLS contract — the actor cannot see his
 *      own notifications, and non-target departments cannot see them either.
 *   4. `canAckClient` (mirror of `can_ack_notification`) blocks the actor and
 *      every non-target department from acknowledging.
 */

type Recipient = { department: string; module: string | null; user_id?: string | null };
type Notif = {
  id: string;
  actor_user_id: string;
  source_module: string;
  target_departments: string[];
  change_seq: number;
};

const recipients: Recipient[] = [
  { department: "Costing", module: "oa", user_id: "u-costing" },
  { department: "design", module: "design", user_id: "u-design" },
  { department: "purchase", module: "purchase", user_id: "u-purchase" },
  { department: "manufacturing", module: "manufacturing", user_id: "u-mfg" },
  { department: "CRM Team", module: null, user_id: "u-crm" },
];

function pickTargets(actor: { uid: string; department: string }, srcModule: string): string[] {
  const out = new Set<string>();
  for (const r of recipients) {
    if (r.user_id === actor.uid) continue;
    const excludedByModule = !!r.module && r.module === srcModule;
    const excludedByDept = r.module === null && r.department === actor.department;
    if (excludedByModule || excludedByDept) continue;
    out.add(r.department);
  }
  return Array.from(out);
}

function fanOut(actor: { uid: string; department: string }, srcModule: string, changeSeq: number): Notif[] {
  return pickTargets(actor, srcModule).map((dept, i) => ({
    id: `n-${changeSeq}-${i}`,
    actor_user_id: actor.uid,
    source_module: srcModule,
    target_departments: [dept],
    change_seq: changeSeq,
  }));
}

// Mirror of the RLS SELECT contract on app_notifications.
function canSee(notif: Notif, viewer: { uid: string; department: string }): boolean {
  if (notif.actor_user_id === viewer.uid) return false;
  return !!matchTargetDept(viewer.department, notif.target_departments);
}

describe("Design/OA Creator notification fan-out + visibility", () => {
  const actor = { uid: "u-costing", department: "Costing" };

  it("fans out one row per linked department, never to the actor's department", () => {
    const rows = fanOut(actor, "oa", 1);
    const depts = rows.map((r) => r.target_departments[0]).sort();
    expect(depts).toEqual(["CRM Team", "design", "manufacturing", "purchase"]);
    rows.forEach((r) => expect(r.target_departments).toHaveLength(1));
    expect(depts).not.toContain("Costing");
  });

  it("does NOT merge: N changes => N rows per linked department", () => {
    const batches = [1, 2, 3, 4].flatMap((seq) => fanOut(actor, "oa", seq));
    expect(batches).toHaveLength(16);
    const designRows = batches.filter((b) => b.target_departments[0] === "design");
    expect(designRows).toHaveLength(4);
    expect(new Set(designRows.map((r) => r.id)).size).toBe(4);
  });

  it("actor cannot see or acknowledge own notifications", () => {
    const rows = fanOut(actor, "oa", 1);
    for (const r of rows) {
      expect(canSee(r, actor)).toBe(false);
      expect(
        canAckClient(
          { actor_user_id: r.actor_user_id, target_departments: r.target_departments },
          { id: actor.uid, department: actor.department },
        ),
      ).toBe(false);
    }
  });

  it("only the targeted department can see + ack its own row", () => {
    const rows = fanOut(actor, "oa", 7);
    const viewers = [
      { uid: "u-design", department: "design" },
      { uid: "u-purchase", department: "Purchase Team" },
      { uid: "u-mfg", department: "manufacturing" },
      { uid: "u-crm", department: "CRM Team" },
    ];
    for (const v of viewers) {
      const visible = rows.filter((r) => canSee(r, v));
      expect(visible).toHaveLength(1);
      expect(normalizeDept(visible[0].target_departments[0])).toBe(normalizeDept(v.department));
      expect(
        canAckClient(
          { actor_user_id: visible[0].actor_user_id, target_departments: visible[0].target_departments },
          { id: v.uid, department: v.department },
        ),
      ).toBe(true);
    }
  });

  it("non-target departments cannot see or ack the notification", () => {
    const rows = fanOut(actor, "oa", 9);
    const designRow = rows.find((r) => r.target_departments[0] === "design")!;
    const outsiders = [
      { uid: "u-purchase", department: "purchase" },
      { uid: "u-mfg", department: "manufacturing" },
      { uid: "u-crm", department: "CRM Team" },
      { uid: "u-other", department: "Other" },
    ];
    for (const o of outsiders) {
      expect(canSee(designRow, o)).toBe(false);
      expect(
        canAckClient(
          { actor_user_id: designRow.actor_user_id, target_departments: designRow.target_departments },
          { id: o.uid, department: o.department },
        ),
      ).toBe(false);
    }
  });

  it("Design actor editing a design item excludes Design, fans to others only", () => {
    const designActor = { uid: "u-design", department: "design" };
    const rows = fanOut(designActor, "design", 1);
    const depts = rows.map((r) => r.target_departments[0]).sort();
    expect(depts).toEqual(["CRM Team", "Costing", "manufacturing", "purchase"]);
    rows.forEach((r) => expect(canSee(r, designActor)).toBe(false));
  });
});
