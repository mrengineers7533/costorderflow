import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Check, ChevronDown, ChevronUp, ExternalLink, Eye, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { NotificationDetailDialog, type NotifFull } from "./NotificationDetailDialog";
import { canAckClient, canSeeOrAck, markNotificationSeen } from "@/lib/notifications/dept";
import { useUserAccess } from "@/hooks/useUserAccess";
import type { ModuleKey } from "@/lib/access/modules";
import { notifDeepLink } from "@/lib/notifications/highlight";
import { useNavigate } from "react-router-dom";
import { NotificationTrackingDialog } from "./NotificationTrackingDialog";
import {
  getPersonalAck,
  getPersonalSeen,
  markPersonalAck,
  markPersonalSeen,
  onPersonalSeenChange,
} from "@/lib/notifications/personalSeen";

function OpenInPageButton({ n, onClick }: { n: NotifFull; onClick?: () => void }) {
  const navigate = useNavigate();
  const href = notifDeepLink(n);
  if (!href) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 text-[11px]"
      onClick={() => {
        onClick?.();
        navigate(href);
      }}
    >
      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open in page
    </Button>
  );
}

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
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set());
  const [personalSeen, setPersonalSeen] = useState<Set<string>>(new Set());
  const [personalAck, setPersonalAck] = useState<Set<string>>(new Set());
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [me, setMe] = useState<{ id: string; name: string; department: string } | null>(null);
  const { canAccess, isAdmin: userIsAdmin } = useUserAccess(me?.id);
  const storageKey = `notif-open:${modsKey}:${linksKey}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  // Re-hydrate when the page's link/module signature changes
  useEffect(() => {
    try {
      setOpen(window.sessionStorage.getItem(storageKey) === "1");
    } catch {
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const toggleOpen = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      try {
        window.sessionStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);
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
    const currentMe = uid ? { id: uid, name: myName, department: myDept } : null;
    setMe(currentMe);
    if (uid) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: roleData } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!roleData);
    } else {
      setIsAdmin(false);
    }

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
    const filtered = list.filter((n) => {
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
    });
    const grouped = Array.from(
      filtered
        .reduce((m, n) => {
          const key =
            n.record_ref
              ? [n.module, n.record_ref].join("|")
              : (n as NotifFull & { revision_key?: string | null }).revision_key ||
                [n.module, n.record_id || n.id].join("|");
          const existing = m.get(key);
          if (!existing) {
            m.set(key, n);
            return m;
          }
          const mergedTargets = Array.from(
            new Set([...(existing.target_departments || []), ...(n.target_departments || [])]),
          );
          const mergedChanges = [
            ...(Array.isArray(existing.line_item_changes) ? existing.line_item_changes : []),
            ...(Array.isArray(n.line_item_changes) ? n.line_item_changes : []),
          ];
    const preferN =
            (currentMe && canAckClient(n, currentMe) && !canAckClient(existing, currentMe)) ||
            (!currentMe && new Date(n.created_at) > new Date(existing.created_at));
          const base = preferN ? n : existing;
          m.set(key, {
            ...base,
            target_departments: mergedTargets,
            line_item_changes: mergedChanges,
          });
          return m;
        }, new Map<string, NotifFull>())
        .values(),
    );
    setRows(grouped);

    if (uid && grouped.length) {
      const { data: r } = await supabase
        .from("app_notification_reads" as never)
        .select("notification_id,kind")
        .in("notification_id", grouped.map((n) => n.id));
      const seenSet = new Set<string>();
      const ackSet = new Set<string>();
      ((r || []) as { notification_id: string; kind: string }[]).forEach((x) => {
        seenSet.add(x.notification_id);
        if (x.kind === "ack") ackSet.add(x.notification_id);
      });
      setSeenIds(seenSet);
      setAckedIds(ackSet);
    } else {
      setSeenIds(new Set());
      setAckedIds(new Set());
    }
    setLoading(false);
  }, [modsKey, linksKey, limit, hasAnyLink, mergedLinks]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh personal (localStorage) seen/ack when user or store changes.
  useEffect(() => {
    const refresh = () => {
      setPersonalSeen(getPersonalSeen(me?.id));
      setPersonalAck(getPersonalAck(me?.id));
    };
    refresh();
    return onPersonalSeenChange(refresh);
  }, [me?.id]);

  async function ack(n: NotifFull) {
    if (!me) return;
    // Always record locally so the badge/count clears for this user, even if
    // backend RLS rejects (e.g. actor or non-target-dept viewers).
    markPersonalAck(me.id, n.id);
    setPersonalSeen((s) => new Set([...s, n.id]));
    setPersonalAck((s) => new Set([...s, n.id]));
    if (canSeeOrAck(n, me, { isAdmin: userIsAdmin || isAdmin, hasModuleAccess: (pm) => canAccess(pm as ModuleKey) })) {
      const { error } = await supabase.from("app_notification_reads" as never).insert({
        notification_id: n.id,
        user_id: me.id,
        user_name: me.name,
        department: me.department,
        kind: "ack",
      } as never);
      if (!error) {
        setSeenIds((s) => new Set([...s, n.id]));
        setAckedIds((s) => new Set([...s, n.id]));
      }
    }
    toast({ title: "Acknowledged" });
  }

  async function markSeenLocal(n: NotifFull) {
    if (!me) return;
    // Personal local mark for every user so their own count reduces.
    markPersonalSeen(me.id, n.id);
    setPersonalSeen((s) => new Set([...s, n.id]));
    // Also try the backend RPC when eligible (target dept, non-actor).
    if (
      canSeeOrAck(n, me, {
        isAdmin: userIsAdmin || isAdmin,
        hasModuleAccess: (pm) => canAccess(pm as ModuleKey),
      }) &&
      !seenIds.has(n.id)
    ) {
      const ok = await markNotificationSeen(n.id);
      if (ok) setSeenIds((s) => new Set([...s, n.id]));
    }
  }

  if (loading || rows.length === 0) return null;
  const isSeen = (id: string) => seenIds.has(id) || personalSeen.has(id);
  const isAcked = (id: string) => ackedIds.has(id) || personalAck.has(id);
  const unread = rows.filter((n) => !isSeen(n.id)).length;

  return (
    <div
      className={`rounded-md border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 print:hidden ${
        className || ""
      }`}
    >
      <button
        type="button"
        onClick={toggleOpen}
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
            const seen = isSeen(n.id);
            const acked = isAcked(n.id);
            const canAct = !!me;
            const canTrack = isAdmin || (me && n.actor_user_id === me.id);
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
                    {acked ? (
                      <Badge className="text-[10px]">Acknowledged</Badge>
                    ) : seen ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Seen
                      </Badge>
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
                  {seen ? (
                    <Button size="sm" variant="secondary" className="h-7 text-[11px]" disabled>
                      <Check className="h-3.5 w-3.5 mr-1" /> Seen
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={canAct ? "default" : "outline"}
                      className={`h-7 text-[11px] shadow-sm ${canAct ? "ring-2 ring-primary/20 animate-pulse" : ""}`}
                      disabled={!canAct}
                      title={canAct ? "Mark this notification as seen" : "Seen is available only to the target department/user"}
                      onClick={() => markSeenLocal(n)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> Mark as Seen
                    </Button>
                  )}
                  {acked ? (
                    <Button size="sm" variant="secondary" className="h-7 text-[11px]" disabled>
                      <Check className="h-3.5 w-3.5 mr-1" /> Acknowledged
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={canAct ? "default" : "outline"}
                      className="h-7 text-[11px]"
                      disabled={!canAct}
                      title={canAct ? "Acknowledge this notification" : "Acknowledge is available only to the target department/user"}
                      onClick={() => ack(n)}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Acknowledge
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    onClick={() => {
                      markSeenLocal(n);
                      setOpenId(n.id);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> Details
                  </Button>
                  <OpenInPageButton n={n} onClick={() => markSeenLocal(n)} />
                  {canTrack && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[11px]"
                      onClick={() => setTrackingId(n.id)}
                    >
                      <Activity className="h-3.5 w-3.5 mr-1" /> Tracking
                    </Button>
                  )}
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
        onAcknowledged={() => load()}
      />
      <NotificationTrackingDialog
        notificationId={trackingId}
        onOpenChange={(o) => {
          if (!o) setTrackingId(null);
        }}
      />
    </div>
  );
}

export default ModuleNotifications;