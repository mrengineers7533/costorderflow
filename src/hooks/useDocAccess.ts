import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DocKind } from "@/lib/access/docAccess";

/**
 * Per-document access hook.
 *
 * Access sources, in priority order:
 *   1. Admin role — full view/edit.
 *   2. Module permissions in `user_module_access` for the doc kind:
 *        - order / pi           → costing (view/edit)
 *        - boq                  → costing OR design for view;
 *                                 costing ONLY for edit (Design is view-only on BOQ items)
 *        - purchase_order       → purchase (view/edit)
 *        - requisition          → requisitions (view/edit)
 *   3. Per-document `document_access` rows (creator or explicit share).
 *
 * RLS remains the authority for writes; this hook only drives UI gating so
 * users with valid module permissions can see and use Save / Comment /
 * Approve / Apply / Revise controls without needing per-doc sharing.
 */

type ModuleMap = { view: string[]; edit: string[] };
const MODULE_MAP: Record<DocKind, ModuleMap> = {
  order:          { view: ["costing"],           edit: ["costing"] },
  pi:             { view: ["costing"],           edit: ["costing"] },
  boq:            { view: ["costing", "design"], edit: ["costing"] },
  purchase_order: { view: ["purchase"],          edit: ["purchase"] },
  requisition:    { view: ["requisitions"],      edit: ["requisitions"] },
};

export function useDocAccess(kind: DocKind, docId: string | undefined | null) {
  const [loading, setLoading] = useState(true);
  const [canView, setCanView] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    if (!docId) { setLoading(false); return; }
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) {
      setCanView(false); setCanEdit(false); setLoading(false); return;
    }
    const [{ data: roles }, { data: mods }, { data: rows }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("user_module_access").select("module, permission").eq("user_id", uid),
      supabase
        .from("document_access")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("permission" as any)
        .eq("doc_kind", kind)
        .eq("doc_id", docId)
        .eq("user_id", uid),
    ]);
    const admin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    setIsAdmin(admin);
    if (admin) { setCanView(true); setCanEdit(true); setLoading(false); return; }

    const map = MODULE_MAP[kind];
    const modPerms = new Map<string, "view" | "edit">();
    ((mods ?? []) as { module: string; permission?: "view" | "edit" | null }[]).forEach((r) => {
      modPerms.set(r.module, (r.permission as "view" | "edit") ?? "edit");
    });
    const moduleView = map.view.some((m) => modPerms.has(m));
    const moduleEdit = map.edit.some((m) => modPerms.get(m) === "edit");

    const row = (rows ?? [])[0] as { permission?: "view" | "edit" } | undefined;
    const rowView = !!row;
    const rowEdit = row?.permission === "edit";

    setCanView(moduleView || rowView);
    setCanEdit(moduleEdit || rowEdit);
    setLoading(false);
  }, [kind, docId]);

  useEffect(() => { load(); }, [load]);

  return { loading, canView, canEdit, isAdmin, refresh: load };
}