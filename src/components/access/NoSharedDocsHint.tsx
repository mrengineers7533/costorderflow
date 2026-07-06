import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Small helper shown inside empty-state cells on document list pages.
 * Non-admin users only see documents that have been explicitly shared with
 * them (or that they created). If a user with module access sees an empty
 * list, it's almost always because no documents have been shared yet — this
 * one-line hint explains that without adding any real behavior.
 */
export function NoSharedDocsHint() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { if (!cancelled) setIsAdmin(false); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      if (cancelled) return;
      setIsAdmin((data ?? []).some((r: { role: string }) => r.role === "admin"));
    })();
    return () => { cancelled = true; };
  }, []);

  if (isAdmin !== false) return null;
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      No documents have been shared with you yet. Ask an admin to grant access
      in <span className="font-medium">Admin → Document Access</span>.
    </div>
  );
}