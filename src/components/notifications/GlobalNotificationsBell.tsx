import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { normalizeDept } from "@/lib/notifications/dept";
import { DeptNotificationsDialog } from "./DeptNotificationsDialog";
import { getPersonalSeen, onPersonalSeenChange } from "@/lib/notifications/personalSeen";

interface NotifRow {
  id: string;
  module: string;
  title: string;
  actor_user_name: string | null;
  actor_department: string | null;
  target_departments: string[];
  created_at: string;
  actor_user_id?: string | null;
  event_type?: string | null;
  line_item_changes?: unknown;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  record_ref?: string | null;
  record_id?: string | null;
  revision_key?: string | null;
}

interface ReadRow {
  notification_id: string;
  department: string | null;
}

function hasRealChange(n: NotifRow): boolean {
  if (n.event_type && n.event_type.endsWith("line_items_changed")) {
    return Array.isArray(n.line_item_changes) && n.line_item_changes.length > 0;
  }
  if (n.event_type === "comment_added" || n.event_type === "comment_updated") {
    const nv = (n.new_value || {}) as Record<string, unknown>;
    const ov = (n.old_value || {}) as Record<string, unknown>;
    const next = String(nv.new_comment ?? "").trim();
    const prev = String(ov.old_comment ?? "").trim();
    return next.length > 0 && next !== prev;
  }
  return true;
}

/**
 * Global header bell that lists the current user's department notifications
 * and surfaces the per-row Seen button (via DeptNotificationsDialog). Mounted
 * once in AppLayout so the Seen action is reachable from every page.
 *
 * Does NOT alter any workflow, notification creation, or existing data — only
 * reads from app_notifications + app_notification_reads.
 */
export function GlobalNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [dept, setDept] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [personalSeen, setPersonalSeen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const currentUid = auth.user?.id;
    setUid(currentUid || null);
    if (!currentUid) {
      setRows([]);
      setReads([]);
      setDept(null);
      return;
    }
    const { data: rec } = await supabase
      .from("notification_recipients")
      .select("department")
      .eq("user_id", currentUid)
      .limit(1)
      .maybeSingle();
    const myDept = (rec as { department?: string } | null)?.department || "Other";
    setDept(myDept);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: n } = await (supabase as any)
      .from("app_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    const list = ((n || []) as NotifRow[]).filter(hasRealChange);
    setRows(list);

    if (list.length) {
      const { data: r } = await supabase
        .from("app_notification_reads" as never)
        .select("notification_id,department")
        .in("notification_id", list.map((x) => x.id));
      setReads(((r || []) as ReadRow[]));
    } else {
      setReads([]);
    }
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("global-notif-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_notifications" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_notification_reads" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    const refresh = () => setPersonalSeen(getPersonalSeen(uid));
    refresh();
    return onPersonalSeenChange(refresh);
  }, [uid]);

  const readsByNotif = useMemo(() => {
    const m: Record<string, ReadRow[]> = {};
    for (const r of reads) {
      (m[r.notification_id] ||= []).push(r);
    }
    return m;
  }, [reads]);

  const deptKey = normalizeDept(dept);
  const unseen = useMemo(() => {
    if (!deptKey) return 0;
    let c = 0;
    for (const n of rows) {
      if (!n.target_departments?.some((d) => normalizeDept(d) === deptKey)) continue;
      if (personalSeen.has(n.id)) continue;
      const seen = (readsByNotif[n.id] || []).some(
        (r) => normalizeDept(r.department) === deptKey,
      );
      if (!seen) c++;
    }
    return c;
  }, [rows, readsByNotif, deptKey, personalSeen]);

  if (!dept) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label="Notifications"
        onClick={() => setOpen(true)}
      >
        <Inbox className="h-4 w-4" />
        {unseen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </Button>
      <DeptNotificationsDialog
        department={dept}
        mode="all"
        rows={rows}
        readsByNotif={readsByNotif}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export default GlobalNotificationsBell;