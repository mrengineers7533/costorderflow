import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useProfileName(user: User | null | undefined) {
  const metaName =
    (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() || "";
  const [name, setName] = useState<string>(metaName);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const n = (data?.full_name || "").trim();
      if (n) setName(n);
      else if (metaName) setName(metaName);
    })();
    return () => { cancelled = true; };
  }, [user?.id, metaName]);

  return name || metaName || user?.email || "";
}