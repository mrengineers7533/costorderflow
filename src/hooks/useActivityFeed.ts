import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listEvents, listReadIds, markRead } from "@/lib/activity/api";
import type { ActivityEvent } from "@/lib/activity/types";

export function useActivityFeed(opts: { orderRootId?: string; enabled?: boolean } = {}) {
  const { orderRootId, enabled = true } = opts;
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const [evs, reads] = await Promise.all([
        listEvents({ orderRootId, limit: 100 }),
        listReadIds(),
      ]);
      setEvents(evs);
      setReadIds(reads);
    } finally {
      setLoading(false);
    }
  }, [orderRootId, enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(`activity_events_${orderRootId ?? "all"}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "activity_events" },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh, orderRootId, enabled]);

  const unreadCount = events.filter((e) => !readIds.has(e.id)).length;

  const markAllRead = useCallback(async () => {
    const ids = events.filter((e) => !readIds.has(e.id)).map((e) => e.id);
    if (!ids.length) return;
    await markRead(ids);
    setReadIds((prev) => { const next = new Set(prev); ids.forEach((i) => next.add(i)); return next; });
  }, [events, readIds]);

  return { events, readIds, unreadCount, loading, refresh, markAllRead };
}