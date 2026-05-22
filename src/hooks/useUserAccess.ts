import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ModuleKey } from "@/lib/access/modules";

export function useUserAccess(userId: string | undefined | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [modules, setModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setIsAdmin(false);
      setModules(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: roles }, { data: access }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      // @ts-expect-error - types regenerated after migration
      supabase.from("user_module_access").select("module").eq("user_id", userId),
    ]);
    const admin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    setIsAdmin(admin);
    setModules(new Set(((access ?? []) as { module: string }[]).map((r) => r.module)));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const canAccess = useCallback(
    (m: ModuleKey) => isAdmin || modules.has(m),
    [isAdmin, modules],
  );

  return { isAdmin, modules, loading, canAccess, refresh: load };
}