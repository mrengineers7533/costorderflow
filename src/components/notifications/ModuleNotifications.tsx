import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Check, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { NotificationDetailDialog, type NotifFull } from "./NotificationDetailDialog";

/** Set of related-record ids for the page the banner is mounted on. */
export interface NotifLinks {
  orderRootId?: string | null;
  boqId?: string | null;
  piId?: string | null;
  poId?: string | null;
  requisitionId?: string | null;
  annexureId?: string | null;
  /** Fallback when the page only knows the row's primary key. */
  recordId?: string | null;
}

interface Props {
  /** Optional module filter (e.g. "boq", ["boq","design_comment"]) */
  module?: string | string[];
  /** Related ids — banner shows notifications linked to ANY of them. */
  links?: NotifLinks;
  /** @deprecated kept for back-compat; same as `module` */
  modules?: string | string[];
  /** @deprecated kept for back-compat; same as `links.recordId` */
  recordId?: string | null;
  /** optional limit (default 8) */
  limit?: number;
  className?: string;
}

/**
 * Compact notification banner for module pages. Lists notifications that are
 * linked to any of the page's related records (OA family, BOQ, PI, PO,
 * Requisition, Annexure) via the get_related_notifications RPC. Status is
 * shared with the Notification Dashboard through app_notification_reads.
 */
export function ModuleNotifications({
  module,
  modules,
  links,
  recordId,
  limit = 8,
  className,
}: Props) {
  const effectiveModule = module ?? modules;
  const modsKey = Array.isArray(effectiveModule)
    ? effectiveModule.slice().sort().join(",")
    : effectiveModule || "";

  const mergedLinks = useMemo<NotifLinks>(
    () => ({
      ...(links || {}),
      recordId: links?.recordId ?? recordId ?? null,
    }),
    [links, recordId],
  );
  const linksKey = JSON.stringify(mergedLinks);

  const [rows, setRows] = useState<NotifFull[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<{ id: string; name: string; department: string } | null>(null);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const hasAnyLink = useMemo(() => {
    const l = mergedLinks;
    return !!(
      l.orderRootId ||
      l.boqId ||
      l.piId ||
      l.poId ||
      l.requisitionId ||
      l.annexureId ||
      l.recordId
    );
  }, [mergedLinks]);

  const load = useCallback(async () => {
    if (!hasAnyLink) {
      setRows([]);
      setLoading(false);
      return;
    }
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

    const modsArr = modsKey ? modsKey.split(",") : null;
    const l = mergedLinks;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("get_related_notifications", {
      p_order_root: l.orderRootId ?? null,
      p_boq: l.boqId ?? null,
      p_pi: l.piId ?? null,
      p_po: l.poId ?? null,
      p_req: l.requisitionId ?? null,
      p_annex: l.annexureId ?? null,
      p_record_id: l.recordId ?? null,
      p_modules: modsArr,
      p_limit: limit,
    });
    if (error) {
      console.warn("get_related_notifications failed", error.message);
      setRows([]);
      setSeenIds(new Set());
      setLoading(false);
      return;
    }
    const list = (data || []) as NotifFull[];
    setRows(list);

    if (uid && list.length) {
      const { data: r } = await supabase
        .from("app_notification_reads" as never)
        .select("notification_id")
        .eq("user_id", uid)
        .in("notification_id", list.map((n) => n.id));
      setSeenIds(
        new Set(
          ((r || []) as { notification_id: string }[]).map((x) => x.notification_id),
        ),
      );
    } else {
      setSeenIds(new Set());
    }
    setLoading(false);
  }, [modsKey, linksKey, limit, hasAnyLink, mergedLinks]);

  useEffect(() => {
    load();
  }, [load]);

  async function ack(n: NotifFull) {
    if (!me) return;
    const { error } = await supabase.from("app_notification_reads" as never).insert({
      notification_id: n.id,
      user_id: me.id,
      user_name: me.name,
      department: me.department,
    } as never);
    if (error) {
      toast({
        title: "Could not acknowledge",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Acknowledged" });
    setSeenIds((s) => new Set([...s, n.id]));
  }

  if (loading || rows.length === 0) return null;
  const unread = rows.filter((n) => !seenIds.has(n.id)).length;

  return (
    <div
      className={`rounded-md border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 print:hidden ${
        className || ""
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
          <Bell className="h-4 w-4" /> Notifications
          <Badge variant="secondary" className="ml-1">
            {rows.length}
          </Badge>
          {unread > 0 && <Badge variant="destructive">{unread} new</Badge>}
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="divide-y divide-amber-400/30 border-t border-amber-400/30">
          {rows.map((n) => {
            const seen = seenIds.has(n.id);
            const lineCount = Array.isArray(n.line_item_changes)
              ? n.line_item_changes.length
              : 0;
            return (
              <div
                key={n.id}
                className="px-3 py-2 flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {n.module}
                    </Badge>
                    {n.record_ref && (
                      <span className="font-mono font-medium">{n.record_ref}</span>
                    )}
                    {n.client_name && (
                      <span className="text-muted-foreground">· {n.client_name}</span>
                    )}
                    {lineCount > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {lineCount} line(s)
                      </Badge>
                    )}
                    {seen ? (
                      <Badge className="text-[10px]">Seen</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">
                        New
                      </Badge>
                    )}
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    onClick={() => setOpenId(n.id)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> Details
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <NotificationDetailDialog
        notificationId={openId}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
        onAcknowledged={() => {
          if (openId) setSeenIds((s) => new Set([...s, openId]));
        }}
      />
    </div>
  );
}

export default ModuleNotifications;