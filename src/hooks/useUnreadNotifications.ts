import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Live-ish unread count for the sidebar bell. Polls every 60s. */
export function useUnreadNotifications(userId: string | undefined | null) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    let cancelled = false;

    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("count_unread_notifications");
      if (cancelled) return;
      if (error) {
        setCount(0);
        return;
      }
      setCount(typeof data === "number" ? data : 0);
    }

    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [userId]);

  return count;
}