import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Check, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Notif {
  id: string;
  module: string;
  event_type: string;
  record_id: string | null;
  record_ref: string | null;
  client_name: string | null;
  title: string;
  summary: string | null;
  actor_user_name: string | null;
  actor_department: string | null;
  target_departments: string[];
  created_at: string;
}

interface Props {
  /** notification module key, e.g. "boq" | "order" | "pi" | "purchase" | "grn" | "requisition" */
  modules: string | string[];
  /** restrict to a specific record (table PK) */
  recordId?: string | null;
  /** optional limit (default 5) */
  limit?: number;
  className?: string;
}

/**
 * Compact notification banner for module pages. Read-only display of recent
 * cross-department changes with per-user Acknowledge buttons. Reuses the
 * existing app_notifications / app_notification_reads tables so status
 * stays in sync with the Notification Dashboard.
 */
export function ModuleNotifications({ modules, recordId, limit = 5, className }: Props) {
  const mods = Array.isArray(modules) ? modules : [modules];
  const [rows, setRows] = useState<Notif[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<{ id: string; name: string; department: string } | null>(null);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    let myDept = "Other";
    let myName = auth.user?.email || "User";
    if (uid) {
      const { data: rec } = await supabase
        .from("notification_recipients")
        .select("department,name")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();
      myDept = (rec as { department?: string } | null)?.department || "Other";
      myName = (rec as { name?: string } | null)?.name || myName;
    }
    setMe(uid ? { id: uid, name: myName, department: myDept } : null);

    let q = supabase
      .from("app_notifications" as never)
      .select("*")
      .in("module", mods as never)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (recordId) q = q.eq("record_id", recordId);
    const { data } = await q;
    const list = ((data || []) as unknown as Notif[]);
    setRows(list);

    if (uid && list.length) {
      const { data: r } = await supabase
        .from("app_notification_reads" as never)
        .select("notification_id")
        .eq("user_id", uid)
        .in("notification_id", list.map((n) => n.id));
      setSeenIds(new Set(((r || []) as { notification_id: string }[]).map((x) => x.notification_id)));
    } else {
      setSeenIds(new Set());
    }
    setLoading(false);
  }, [mods.join(","), recordId, limit]);

  useEffect(() => { load(); }, [load]);

  async function ack(n: Notif) {
    if (!me) return;
    const { error } = await supabase.from("app_notification_reads" as never).insert({
      notification_id: n.id,
      user_id: me.id,
      user_name: me.name,
      department: me.department,
    } as never);
    if (error) {
      toast({ title: "Could not acknowledge", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Acknowledged" });
    setSeenIds((s) => new Set([...s, n.id]));
  }

  if (loading || rows.length === 0) return null;
  const unread = rows.filter((n) => !seenIds.has(n.id)).length;

  return (
    <div className={`rounded-md border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 print:hidden ${className || ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
          <Bell className="h-4 w-4" /> Notifications
          <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
          {unread > 0 && <Badge variant="destructive">{unread} new</Badge>}
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="divide-y divide-amber-400/30 border-t border-amber-400/30">
          {rows.map((n) => {
            const seen = seenIds.has(n.id);
            return (
              <div key={n.id} className="px-3 py-2 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="uppercase text-[10px]">{n.module}</Badge>
                    {n.record_ref && <span className="font-mono font-medium">{n.record_ref}</span>}
                    {n.client_name && <span className="text-muted-foreground">· {n.client_name}</span>}
                    {seen
                      ? <Badge className="text-[10px]">Seen</Badge>
                      : <Badge variant="destructive" className="text-[10px]">New</Badge>}
                  </div>
                  <div className="font-medium truncate mt-0.5">{n.title}</div>
                  <div className="text-muted-foreground">
                    {n.actor_user_name || "—"}
                    {n.actor_department ? ` (${n.actor_department})` : ""}
                    {" · "}
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {!seen && (
                    <Button size="sm" className="h-7" onClick={() => ack(n)}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Acknowledge
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost" className="h-6 text-[11px]">
                    <Link to="/notifications">Details</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ModuleNotifications;