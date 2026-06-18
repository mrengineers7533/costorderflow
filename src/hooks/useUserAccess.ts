import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ModuleKey } from "@/lib/access/modules";

export type Perm = "view" | "edit";

export function useUserAccess(userId: string | undefined | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [modules, setModules] = useState<Map<string, Perm>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setIsAdmin(false);
      setModules(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: roles }, { data: access }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("user_module_access").select("module, permission").eq("user_id", userId),
    ]);
    const admin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    setIsAdmin(admin);
    const m = new Map<string, Perm>();
    ((access ?? []) as { module: string; permission?: Perm | null }[]).forEach((r) => {
      m.set(r.module, (r.permission as Perm) ?? "edit");
    });
    setModules(m);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const canAccess = useCallback(
    (m: ModuleKey) => isAdmin || modules.has(m),
    [isAdmin, modules],
  );

  const canEdit = useCallback(
    (m: ModuleKey) => isAdmin || modules.get(m) === "edit",
    [isAdmin, modules],
  );

  return { isAdmin, modules, loading, canAccess, canEdit, refresh: load };
}