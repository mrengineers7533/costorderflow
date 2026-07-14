import { supabase } from "@/integrations/supabase/client";
import { markPersonalSeen } from "@/lib/notifications/personalSeen";

/**
 * Normalize a department label for case/whitespace-insensitive matching.
 * Examples that all collapse to the same key:
 *   "Design", "design", "Design Team", "  design  "
 */
export function normalizeDept(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s+team$/, "");
}

/**
 * Resolve the acknowledging user's department.
 * Prefers an active `notification_recipients` row, falls back to "Other".
 */
export async function resolveUserDepartment(
  userId: string,
): Promise<{ department: string; name: string | null }> {
  const { data } = await supabase
    .from("notification_recipients")
    .select("department,name,is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const rec = data as { department?: string; name?: string } | null;
  return {
    department: rec?.department || "Other",
    name: rec?.name || null,
  };
}

/**
 * Returns the target department whose normalized form matches the read row's
 * department, or null if none.
 */
export function matchTargetDept(
  readDept: string | null | undefined,
  targets: string[],
): string | null {
  const key = normalizeDept(readDept);
  if (!key) return null;
  for (const t of targets) {
    if (normalizeDept(t) === key) return t;
  }
  return null;
}

/**
 * Client-side mirror of the DB `can_ack_notification` rule:
 * a user can acknowledge a notification only when they are NOT the actor
 * AND their normalized department matches one of the notification's
 * target departments.
 */
export function canAckClient(
  notif: {
    actor_user_id?: string | null;
    target_departments?: string[] | null;
  } | null | undefined,
  me: { id: string; department: string } | null | undefined,
): boolean {
  if (!notif || !me) return false;
  if (notif.actor_user_id && notif.actor_user_id === me.id) return false;
  const targets = Array.isArray(notif.target_departments)
    ? notif.target_departments
    : [];
  return !!matchTargetDept(me.department, targets);
}

/**
 * Maps an app_notifications.module value to the ModuleKey used by
 * user_module_access. Mirrors public.notif_module_to_perm_module in SQL.
 */
export function notifModuleToPermModule(m: string | null | undefined): string {
  const v = (m || "").toLowerCase();
  switch (v) {
    case "boq":
    case "oa":
    case "order":
    case "pi":
      return "costing";
    case "design":
    case "design_comment":
      return "design";
    case "purchase":
      return "purchase";
    case "grn":
      return "grn";
    case "requisition":
      return "requisitions";
    case "annexure":
      return "annexures";
    case "manufacturing":
      return "manufacturing";
    default:
      return v;
  }
}

/**
 * Extended eligibility: a non-actor user can Seen/Ack when any of:
 *  - admin, or
 *  - has module permission on the notification's mapped module, or
 *  - their department matches one of the target departments.
 */
export function canSeeOrAck(
  notif: {
    actor_user_id?: string | null;
    target_departments?: string[] | null;
    module?: string | null;
  } | null | undefined,
  me: { id: string; department: string } | null | undefined,
  ctx?: {
    isAdmin?: boolean;
    hasModuleAccess?: (permModule: string) => boolean;
  },
): boolean {
  if (!notif || !me) return false;
  if (notif.actor_user_id && notif.actor_user_id === me.id) return false;
  if (ctx?.isAdmin) return true;
  if (ctx?.hasModuleAccess) {
    const pm = notifModuleToPermModule(notif.module);
    if (pm && ctx.hasModuleAccess(pm)) return true;
  }
  const targets = Array.isArray(notif.target_departments)
    ? notif.target_departments
    : [];
  return !!matchTargetDept(me.department, targets);
}

/**
 * Mark a notification as Seen for the current user. Server-side RPC enforces
 * that the caller is in a target department and is not the actor.
 */
export async function markNotificationSeen(notifId: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("mark_notification_seen", { _notif_id: notifId });
    const ok = !error && data !== false;
    // Also mirror locally so every mounted unseen-count hook refreshes
    // immediately without waiting for the realtime round-trip.
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user?.id) markPersonalSeen(auth.user.id, notifId);
    } catch { /* non-fatal */ }
    return ok;
  } catch {
    /* non-fatal */
    return false;
  }
}

/**
 * Ensure the currently signed-in user has an active `notification_recipients`
 * row so department-scoped notifications (Design/Purchase/...) reach them.
 * Idempotent — safe to call on every session start.
 */
export async function ensureCurrentUserRecipient(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc("ensure_current_user_recipient");
  } catch {
    /* non-fatal */
  }
}