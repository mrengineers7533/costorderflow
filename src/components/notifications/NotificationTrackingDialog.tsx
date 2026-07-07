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

interface EmailLogRow {
  id: string;
  recipient_email: string;
  recipient_department: string | null;
  kind: string;
  status: string;
  subject: string | null;
  gmail_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  reminder_sent?: boolean;
  reminder_sent_at?: string | null;
  reminder_count?: number;
  seen_status?: boolean;
  ack_status?: boolean;
  cc_emails?: string[] | null;
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
  const [emails, setEmails] = useState<EmailLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!notificationId) {
      setRows([]);
      setEmails([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [{ data }, { data: emailData }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("get_notification_tracking", { _notif_id: notificationId }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("email_notification_log")
          .select("*")
          .eq("notification_id", notificationId)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setRows(((data as TrackingRow[]) || []).slice().sort((a, b) =>
        (a.department || "").localeCompare(b.department || ""),
      ));
      setEmails((emailData as EmailLogRow[]) || []);
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
        {emails.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Emails</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">Recipient</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Reminder</th>
                    <th className="px-3 py-2">Seen / Ack</th>
                    <th className="px-3 py-2">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {emails.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2">
                        <div>{e.recipient_email}</div>
                        {e.recipient_department && (
                          <div className="text-xs text-muted-foreground capitalize">{e.recipient_department}</div>
                        )}
                        {e.cc_emails && e.cc_emails.length > 0 && (
                          <div className="text-[10px] text-muted-foreground">CC: {e.cc_emails.join(", ")}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs capitalize">{e.kind}</td>
                      <td className="px-3 py-2">
                        {e.status === "sent" ? (
                          <Badge>Sent</Badge>
                        ) : e.status === "failed" ? (
                          <Badge variant="destructive" title={e.error || ""}>Failed</Badge>
                        ) : (
                          <Badge variant="outline">{e.status}</Badge>
                        )}
                        {e.status === "failed" && e.error && (
                          <div className="text-xs text-destructive mt-1 max-w-xs truncate" title={e.error}>{e.error}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {e.reminder_sent ? (
                          <div>
                            <Badge variant="secondary">Yes ({e.reminder_count || 1})</Badge>
                            {e.reminder_sent_at && (
                              <div className="text-[10px] text-muted-foreground mt-1">{new Date(e.reminder_sent_at).toLocaleString()}</div>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline">No</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {e.ack_status ? (
                          <Badge>Acknowledged</Badge>
                        ) : e.seen_status ? (
                          <Badge variant="secondary">Seen</Badge>
                        ) : (
                          <Badge variant="outline">—</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(e.sent_at || e.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default NotificationTrackingDialog;