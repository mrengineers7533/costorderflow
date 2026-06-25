import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface TrackingRow {
  department: string;
  seen_by: string | null;
  seen_at: string | null;
  ack_by: string | null;
  ack_at: string | null;
}

interface Props {
  notificationId: string | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Per-department Seen / Acknowledged tracking for the actor or admin.
 * Server-side RPC `get_notification_tracking` enforces access.
 */
export function NotificationTrackingDialog({ notificationId, onOpenChange }: Props) {
  const [rows, setRows] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!notificationId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc("get_notification_tracking", {
        _notif_id: notificationId,
      });
      if (cancelled) return;
      setRows(((data as TrackingRow[]) || []).slice().sort((a, b) =>
        (a.department || "").localeCompare(b.department || ""),
      ));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [notificationId]);

  return (
    <Dialog open={!!notificationId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Notification tracking</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No target departments.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Seen</th>
                  <th className="px-3 py-2">Acknowledged</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.department}>
                    <td className="px-3 py-2 font-medium">{r.department}</td>
                    <td className="px-3 py-2">
                      {r.ack_at ? (
                        <Badge>Acknowledged</Badge>
                      ) : r.seen_at ? (
                        <Badge variant="secondary">Seen</Badge>
                      ) : (
                        <Badge variant="outline">Sent</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.seen_at
                        ? `${r.seen_by || "—"} · ${new Date(r.seen_at).toLocaleString()}`
                        : "Not seen"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.ack_at
                        ? `${r.ack_by || "—"} · ${new Date(r.ack_at).toLocaleString()}`
                        : "Not acknowledged"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default NotificationTrackingDialog;