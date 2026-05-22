import { useCallback, useEffect, useState } from "react";
import {
  getRevisionNotificationsForOrder,
  listPendingRevisionNotifications,
  type OrderRevisionNotification,
} from "@/lib/notifications/orderRevision";

export function useOrderRevisionNotifications(orderId?: string) {
  const [items, setItems] = useState<OrderRevisionNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = orderId
        ? await getRevisionNotificationsForOrder(orderId)
        : await listPendingRevisionNotifications();
      setItems(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, loading, error, refresh };
}