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
      const { data: notifs } = await supabase
        .from("app_notifications" as never)
        .select("id")
        .order("created_at", { ascending: false })
        .limit(500);
      const ids = ((notifs || []) as { id: string }[]).map((n) => n.id);
      if (!ids.length) {
        if (!cancelled) setCount(0);
        return;
      }
      const { data: reads } = await supabase
        .from("app_notification_reads" as never)
        .select("notification_id")
        .eq("user_id", userId)
        .in("notification_id", ids);
      const seen = new Set(((reads || []) as { notification_id: string }[]).map((r) => r.notification_id));
      if (!cancelled) setCount(ids.filter((i) => !seen.has(i)).length);
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