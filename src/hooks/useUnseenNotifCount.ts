import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeDept, matchTargetDept } from "@/lib/notifications/dept";

export type UnseenKind = "boq" | "oa" | "pi";

interface NotifRow {
  id: string;
  target_departments: string[] | null;
  related_boq_id: string | null;
  related_order_root_id: string | null;
  related_pi_id: string | null;
}

async function resolveMe(): Promise<{ id: string; department: string } | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("notification_recipients")
    .select("department")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();
  const dept = (data as { department?: string } | null)?.department || "Other";
  return { id: uid, department: dept };
}

function notifTargetsMe(n: NotifRow, myDept: string): boolean {
  const list = (n.target_departments || []) as string[];
  // If no targets specified, treat as broadcast (visible to all depts).
  if (!list.length) return true;
  return !!matchTargetDept(myDept, list);
}

/**
 * Returns the number of notifications linked to the given BOQ/OA root/PI that
 * are targeted at the current user's department and have NOT been
 * acknowledged by the current user. Live-updates via realtime.
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
    const me = await resolveMe();
    if (!me) {
      setCount(0);
      setLoading(false);
      return;
    }
    const filters: string[] = [];
    if (boqId) filters.push(`related_boq_id.eq.${boqId}`);
    if (orderRootId) filters.push(`related_order_root_id.eq.${orderRootId}`);
    if (piId) filters.push(`related_pi_id.eq.${piId}`);
    const { data, error } = await supabase
      .from("app_notifications" as never)
      .select("id,target_departments,related_boq_id,related_order_root_id,related_pi_id")
      .or(filters.join(","))
      .limit(500);
    if (error) {
      setCount(0);
      setLoading(false);
      return;
    }
    const notifs = ((data || []) as unknown) as NotifRow[];
    const targeted = notifs.filter((n) => notifTargetsMe(n, me.department));
    if (!targeted.length) {
      setCount(0);
      setLoading(false);
      return;
    }
    const ids = targeted.map((n) => n.id);
    const { data: r } = await supabase
      .from("app_notification_reads" as never)
      .select("notification_id")
      .eq("user_id", me.id)
      .in("notification_id", ids);
    const seen = new Set(((r || []) as { notification_id: string }[]).map((x) => x.notification_id));
    setCount(targeted.filter((n) => !seen.has(n.id)).length);
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

  return { count, loading };
}

/**
 * Bulk version: returns a Map<recordId, unseenCount> for a list of record ids
 * of a single kind. Uses one query per refresh and one shared realtime channel.
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
    const me = await resolveMe();
    if (!me) {
      setCounts({});
      setLoading(false);
      return;
    }
    const col =
      kind === "boq"
        ? "related_boq_id"
        : kind === "oa"
          ? "related_order_root_id"
          : "related_pi_id";
    const { data } = await supabase
      .from("app_notifications" as never)
      .select("id,target_departments,related_boq_id,related_order_root_id,related_pi_id")
      .in(col, ids)
      .limit(2000);
    const notifs = ((data || []) as unknown) as NotifRow[];
    const targeted = notifs.filter((n) => notifTargetsMe(n, me.department));
    if (!targeted.length) {
      setCounts({});
      setLoading(false);
      return;
    }
    const { data: r } = await supabase
      .from("app_notification_reads" as never)
      .select("notification_id")
      .eq("user_id", me.id)
      .in("notification_id", targeted.map((n) => n.id));
    const seen = new Set(((r || []) as { notification_id: string }[]).map((x) => x.notification_id));
    const map: Record<string, number> = {};
    for (const n of targeted) {
      if (seen.has(n.id)) continue;
      const k = (n as Record<string, string | null>)[col];
      if (!k) continue;
      map[k] = (map[k] || 0) + 1;
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

  return { counts, loading };
}

// Helper to silence unused-import warnings in some bundles
export const _normalizeDept = normalizeDept;