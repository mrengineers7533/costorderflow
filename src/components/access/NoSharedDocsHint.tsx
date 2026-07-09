import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Small helper shown inside empty-state cells on document list pages.
 * Non-admin users only see documents that have been explicitly shared with
 * them (or that they created). If a user with module access sees an empty
 * list, it's almost always because no documents have been shared yet — this
 * one-line hint explains that without adding any real behavior.
 */
export function NoSharedDocsHint({ module }: { module?: string } = {}) {
  const [show, setShow] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { if (!cancelled) setShow(false); return; }
      const [{ data: roles }, { data: mods }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("user_module_access").select("module").eq("user_id", uid),
      ]);
      if (cancelled) return;
      const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
      const mkeys = new Set((mods ?? []).map((m: { module: string }) => m.module));
      // Hide hint for admins and for users who already hold module-level access
      // for this list (they see everything in the module by design).
      if (isAdmin) { setShow(false); return; }
      if (module && mkeys.has(module)) { setShow(false); return; }
      setShow(true);
    })();
    return () => { cancelled = true; };
  }, [module]);

  if (!show) return null;
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      No documents have been shared with you yet. Ask an admin to grant access
      in <span className="font-medium">Admin → Document Access</span>.
    </div>
  );
}