import { supabase } from "@/integrations/supabase/client";
import type { ActivityEvent, EntityPendingState } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tbl = () => (supabase as any).from("activity_events");
const reads = () => (supabase as any).from("activity_event_reads");

export async function listEvents(opts: { orderRootId?: string; limit?: number } = {}): Promise<ActivityEvent[]> {
  let q = tbl().select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.orderRootId) q = q.eq("order_root_id", opts.orderRootId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ActivityEvent[];
}

export async function listReadIds(): Promise<Set<string>> {
  const { data, error } = await reads().select("event_id");
  if (error) return new Set();
  return new Set((data || []).map((r: { event_id: string }) => r.event_id));
}

export async function markRead(eventIds: string[]): Promise<void> {
  if (!eventIds.length) return;
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) return;
  await reads().upsert(eventIds.map((id) => ({ event_id: id, user_id: uid })), { onConflict: "event_id,user_id" });
}

export async function getPendingState(orderRootId: string): Promise<EntityPendingState | null> {
  const { data, error } = await (supabase as any)
    .from("v_entity_pending_state")
    .select("*")
    .eq("order_root_id", orderRootId)
    .maybeSingle();
  if (error) return null;
  return (data as EntityPendingState) ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */