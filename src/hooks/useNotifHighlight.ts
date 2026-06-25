import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchHighlightMap,
  type NotifHighlightMap,
} from "@/lib/notifications/highlight";

/**
 * Reads `?notif=<id>` from the current URL and returns the corresponding
 * change-highlight map. Used by module pages to paint changed cells.
 */
export function useNotifHighlight(): {
  notifId: string | null;
  rowFocus: string | null;
  map: NotifHighlightMap | null;
  loading: boolean;
} {
  const [params] = useSearchParams();
  const notifId = params.get("notif");
  const rowFocus = params.get("row");
  const [map, setMap] = useState<NotifHighlightMap | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!notifId) {
      setMap(null);
      return;
    }
    setLoading(true);
    fetchHighlightMap(notifId)
      .then((m) => {
        if (alive) setMap(m);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [notifId]);

  return { notifId, rowFocus, map, loading };
}