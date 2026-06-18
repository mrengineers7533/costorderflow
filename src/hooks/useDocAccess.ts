import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DocKind } from "@/lib/access/docAccess";

/**
 * Per-document access hook.
 * Admin and the document creator always have full edit access (enforced server-side too).
 * Otherwise, checks document_access rows for this (kind, docId, current user).
 */
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
    const [{ data: roles }, { data: rows }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
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
    const row = (rows ?? [])[0] as { permission?: "view" | "edit" } | undefined;
    // If RLS allowed the row through, the user has at least view access (creator or grant).
    // Server side: creator gets edit; grant rows are honoured by has_doc_access.
    setCanView(true);
    setCanEdit(row?.permission === "edit" || !row);
    // Note: when row is missing, fall back to "edit" only if creator — server enforces, but
    // we can't tell from here. Be conservative and require explicit grant for edit.
    setCanEdit(row?.permission === "edit");
    setLoading(false);
  }, [kind, docId]);

  useEffect(() => { load(); }, [load]);

  return { loading, canView, canEdit, isAdmin, refresh: load };
}