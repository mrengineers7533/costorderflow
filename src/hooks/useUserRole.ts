import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "user" | null;

export function useUserRole(userId: string | undefined | null) {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId) { setRole(null); setLoading(false); return; }
    setLoading(true);
    supabase.from("user_roles").select("role").eq("user_id", userId).then(({ data }) => {
      if (cancelled) return;
      const roles = (data || []).map((r: { role: string }) => r.role);
      setRole(roles.includes("admin") ? "admin" : roles.length ? "user" : "user");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return { role, loading, isAdmin: role === "admin" };
}