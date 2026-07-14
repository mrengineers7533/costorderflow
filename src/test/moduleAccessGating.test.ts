import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
const state: {
  uid: string | null;
  roles: Row[];
  modules: Row[];
  docAccess: Row[];
} = { uid: null, roles: [], modules: [], docAccess: [] };

vi.mock("@/integrations/supabase/client", () => {
  const build = (rows: Row[]) => {
    const chain: any = {
      _rows: rows,
      select() { return chain; },
      eq(_col: string, _val: unknown) {
        chain._rows = chain._rows.filter((r) => r[_col] === _val);
        return chain;
      },
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        resolve({ data: chain._rows, error: null });
      },
    };
    return chain;
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: state.uid ? { id: state.uid } : null } }) },
      from(table: string) {
        if (table === "user_roles") return build([...state.roles]);
        if (table === "user_module_access") return build([...state.modules]);
        if (table === "document_access") return build([...state.docAccess]);
        return build([]);
      },
    },
  };
});

import { renderHook, waitFor } from "@testing-library/react";
import { useDocAccess } from "@/hooks/useDocAccess";

beforeEach(() => {
  state.uid = "user-1";
  state.roles = [];
  state.modules = [];
  state.docAccess = [];
});

async function run(kind: Parameters<typeof useDocAccess>[0], docId = "doc-1") {
  const { result } = renderHook(() => useDocAccess(kind, docId));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result.current;
}

describe("useDocAccess module-based gating", () => {
  it("Design user can view BOQ but cannot edit it", async () => {
    state.modules = [{ user_id: "user-1", module: "design", permission: "edit" }];
    const r = await run("boq");
    expect(r.canView).toBe(true);
    expect(r.canEdit).toBe(false);
  });

  it("Office costing:edit user can view and edit order/BOQ/PI without a share row", async () => {
    state.modules = [{ user_id: "user-1", module: "costing", permission: "edit" }];
    for (const kind of ["order", "boq", "pi"] as const) {
      const r = await run(kind);
      expect(r.canView, kind).toBe(true);
      expect(r.canEdit, kind).toBe(true);
    }
  });

  it("costing:view user can view but cannot edit", async () => {
    state.modules = [{ user_id: "user-1", module: "costing", permission: "view" }];
    const r = await run("order");
    expect(r.canView).toBe(true);
    expect(r.canEdit).toBe(false);
  });

  it("No role, no module, no share row → no access", async () => {
    const r = await run("boq");
    expect(r.canView).toBe(false);
    expect(r.canEdit).toBe(false);
  });

  it("Admin short-circuit still grants full access", async () => {
    state.roles = [{ user_id: "user-1", role: "admin" }];
    const r = await run("boq");
    expect(r.isAdmin).toBe(true);
    expect(r.canView).toBe(true);
    expect(r.canEdit).toBe(true);
  });

  it("Explicit document_access edit row still grants edit", async () => {
    state.docAccess = [{ user_id: "user-1", doc_kind: "boq", doc_id: "doc-1", permission: "edit" }];
    const r = await run("boq");
    expect(r.canView).toBe(true);
    expect(r.canEdit).toBe(true);
  });

  it("Purchase edit user can view and edit any purchase_order", async () => {
    state.modules = [{ user_id: "user-1", module: "purchase", permission: "edit" }];
    const r = await run("purchase_order");
    expect(r.canView).toBe(true);
    expect(r.canEdit).toBe(true);
  });

  it("Requisitions edit user can view and edit any requisition", async () => {
    state.modules = [{ user_id: "user-1", module: "requisitions", permission: "edit" }];
    const r = await run("requisition");
    expect(r.canView).toBe(true);
    expect(r.canEdit).toBe(true);
  });

  it("Design view user can view BOQ (module-level, no per-doc share)", async () => {
    state.modules = [{ user_id: "user-1", module: "design", permission: "view" }];
    const r = await run("boq");
    expect(r.canView).toBe(true);
    expect(r.canEdit).toBe(false);
  });
});