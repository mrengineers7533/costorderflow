import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeDept, matchTargetDept } from "@/lib/notifications/dept";
import {
  getPersonalSeen,
  onPersonalSeenChange,
} from "@/lib/notifications/personalSeen";

export type UnseenKind = "boq" | "oa" | "pi";

/**
 * Shape of rows returned by the get_related_notifications RPC — kept loose so
 * we can apply the same content filter the in-page banner uses.
 */
interface RelatedNotif {
  id: string;
  event_type?: string | null;
  line_item_changes?: unknown;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
}

/** Same content filter as ModuleNotifications banner, so badge == banner. */
function isMeaningful(n: RelatedNotif): boolean {
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

async function fetchRelated(opts: {
  boqId?: string | null;
  orderRootId?: string | null;
  piId?: string | null;
}): Promise<RelatedNotif[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_related_notifications", {
    p_order_root: opts.orderRootId ?? null,
    p_boq: opts.boqId ?? null,
    p_pi: opts.piId ?? null,
    p_po: null,
    p_req: null,
    p_annex: null,
    p_record_id: null,
    p_modules: null,
    p_limit: 500,
  });
  if (error) return [];
  return ((data || []) as RelatedNotif[]).filter(isMeaningful);
}

async function currentUserId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  return auth.user?.id ?? null;
}

async function readIdsFor(uid: string, notifIds: string[]): Promise<Set<string>> {
  if (!notifIds.length) return new Set();
  const { data } = await supabase
    .from("app_notification_reads" as never)
    .select("notification_id")
    .eq("user_id", uid)
    .in("notification_id", notifIds);
  return new Set(
    ((data || []) as { notification_id: string }[]).map((x) => x.notification_id),
  );
}

/**
 * Returns the number of notifications linked to the given BOQ/OA root/PI that
 * are NOT acknowledged by the current user. Uses the same RPC as the in-page
 * Notifications banner so the badge always matches the banner. Live-updates
 * via realtime.
 */
export function useUnseenNotifCount(opts: {
  boqId?: string | null;
  orderRootId?: string | null;
  piId?: string | null;
}): { count: number; loading: boolean } {
  const { boqId, orderRootId, piId } = opts;
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const hasAny = !!(boqId || orderRootId || piId);

  const load = useCallback(async () => {
    if (!hasAny) {
      setCount(0);
      setLoading(false);
      return;
    }
    const uid = await currentUserId();
    if (!uid) {
      setCount(0);
      setLoading(false);
      return;
    }
    const notifs = await fetchRelated({ boqId, orderRootId, piId });
    if (!notifs.length) {
      setCount(0);
      setLoading(false);
      return;
    }
    const seen = await readIdsFor(uid, notifs.map((n) => n.id));
    const personal = getPersonalSeen(uid);
    setCount(notifs.filter((n) => !seen.has(n.id) && !personal.has(n.id)).length);
    setLoading(false);
  }, [boqId, orderRootId, piId, hasAny]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!hasAny) return;
    const channel = supabase
      .channel(`unseen-${boqId || ""}-${orderRootId || ""}-${piId || ""}`)
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
  }, [boqId, orderRootId, piId, hasAny, load]);

  useEffect(() => onPersonalSeenChange(() => load()), [load]);

  return { count, loading };
}

/**
 * Bulk version: returns a Map<recordId, unseenCount> for a list of record ids
 * of a single kind. Calls the same RPC per id (capped concurrency) so counts
 * match the in-page banner exactly.
 */
export function useUnseenNotifCountsMap(
  kind: UnseenKind,
  ids: string[],
): { counts: Record<string, number>; loading: boolean } {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const idsKey = useMemo(() => ids.slice().sort().join(","), [ids]);

  const load = useCallback(async () => {
    if (!ids.length) {
      setCounts({});
      setLoading(false);
      return;
    }
    const uid = await currentUserId();
    if (!uid) {
      setCounts({});
      setLoading(false);
      return;
    }
    // Fetch per-id with capped concurrency to avoid request storms.
    const CONCURRENCY = 8;
    const perId: Record<string, RelatedNotif[]> = {};
    let cursor = 0;
    async function worker() {
      while (cursor < ids.length) {
        const i = cursor++;
        const id = ids[i];
        const opts =
          kind === "boq"
            ? { boqId: id }
            : kind === "oa"
              ? { orderRootId: id }
              : { piId: id };
        perId[id] = await fetchRelated(opts);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker()),
    );
    const allNotifIds = Array.from(
      new Set(Object.values(perId).flat().map((n) => n.id)),
    );
    const seen = await readIdsFor(uid, allNotifIds);
    const personal = getPersonalSeen(uid);
    const map: Record<string, number> = {};
    for (const id of ids) {
      const unread = (perId[id] || []).filter(
        (n) => !seen.has(n.id) && !personal.has(n.id),
      ).length;
      if (unread > 0) map[id] = unread;
    }
    setCounts(map);
    setLoading(false);
  }, [idsKey, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!ids.length) return;
    const channel = supabase
      .channel(`unseen-map-${kind}`)
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
  }, [kind, idsKey, load]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => onPersonalSeenChange(() => load()), [load]);

  return { counts, loading };
}

// Helper to silence unused-import warnings in some bundles
export const _normalizeDept = normalizeDept;
// Re-export to keep prior named-import compatibility if any callers reference it.
export const _matchTargetDept = matchTargetDept;