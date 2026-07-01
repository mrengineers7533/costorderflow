/**
 * Per-user local "seen"/"acknowledged" tracker.
 *
 * Backend RLS only permits target-department (non-actor) users to write to
 * app_notification_reads. So actors or non-target users who click Seen/
 * Acknowledge in their own view would otherwise get no feedback and their
 * notification counts would never drop. This helper mirrors those clicks
 * locally in the browser so every signed-in user can clear their own
 * personal notification badge without touching backend logic.
 */
const KEY = "lov.notif.personalSeen.v1";

type Store = Record<string, { seen: string[]; ack: string[] }>;

function readStore(): Store {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function writeStore(s: Store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("lov-personal-seen-changed"));
  } catch {
    /* ignore */
  }
}

export function getPersonalSeen(userId: string | null | undefined): Set<string> {
  if (!userId || typeof window === "undefined") return new Set();
  const store = readStore();
  return new Set(store[userId]?.seen || []);
}

export function getPersonalAck(userId: string | null | undefined): Set<string> {
  if (!userId || typeof window === "undefined") return new Set();
  const store = readStore();
  return new Set(store[userId]?.ack || []);
}

export function markPersonalSeen(userId: string, id: string) {
  if (!userId || typeof window === "undefined") return;
  const store = readStore();
  const entry = store[userId] || { seen: [], ack: [] };
  if (!entry.seen.includes(id)) entry.seen.push(id);
  store[userId] = entry;
  writeStore(store);
}

export function markPersonalAck(userId: string, id: string) {
  if (!userId || typeof window === "undefined") return;
  const store = readStore();
  const entry = store[userId] || { seen: [], ack: [] };
  if (!entry.seen.includes(id)) entry.seen.push(id);
  if (!entry.ack.includes(id)) entry.ack.push(id);
  store[userId] = entry;
  writeStore(store);
}

export function onPersonalSeenChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("lov-personal-seen-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("lov-personal-seen-changed", handler);
    window.removeEventListener("storage", handler);
  };
}