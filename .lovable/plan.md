## Problem

For OA `2026-27/GMS/0001/R1`:
- List column and top-of-page badge show **Not Seen Notifications: 0**
- In-page Notifications panel shows **3 / 3 new**

Root cause: two different code paths compute "unseen" with different rules.

- Badge + list column → `src/hooks/useUnseenNotifCount.ts` (`useUnseenNotifCount` / `useUnseenNotifCountsMap`): reads `app_notifications` directly, **filters by current user's department** via `matchTargetDept(myDept, target_departments)` (broadcast = empty list), then subtracts rows in `app_notification_reads` for the current user.
- In-page panel → `src/components/notifications/ModuleNotifications.tsx`: calls RPC `get_related_notifications`, applies **no department filter**, then subtracts `app_notification_reads`. Every linked notification is counted regardless of whether it targets the viewer's department.

So a user in a department that isn't targeted (e.g. "Other") sees 0 in the badge but 3 in the panel.

## Fix (presentation only, no schema / RLS changes)

Make the in-page panel use the same department visibility rule as the badge, so a single notion of "visible to me" drives both counts.

### File: `src/components/notifications/ModuleNotifications.tsx`

1. Import `matchTargetDept` from `@/lib/notifications/dept`.
2. After the RPC returns and after the existing `event_type` content filter, additionally filter:
   ```ts
   const visible = filtered.filter((n) => {
     const targets = (n.target_departments || []) as string[];
     if (!targets.length) return true; // broadcast
     return !!matchTargetDept(myDept, targets);
   });
   ```
   Use `visible` for `setRows`, for the subsequent `app_notification_reads` lookup, and for rendering.
3. No other behavior changes: same RPC, same acknowledge flow, same dialog, same realtime-less load (panel already reloads on mount/links change).

### Type touch-up

`NotifFull` (in `NotificationDetailDialog.tsx`) is already used by the panel; if `target_departments` is not on it, widen the local read to `(n as unknown as { target_departments?: string[] | null }).target_departments` to avoid a type change. Prefer a small local interface in `ModuleNotifications.tsx` rather than editing the shared type.

### Out of scope

- No changes to `useUnseenNotifCount.ts`, list pages, dashboard, RPC, RLS, tables, migrations, or `NotificationDetailDialog`.
- "Broadcast = visible to all" rule is preserved (matches badge behavior).
- Acknowledge / Details / realtime behavior unchanged.

## Verification

After the change, open `/orders/<id>` for `2026-27/GMS/0001/R1` as the same user:
- If the 3 notifications target departments the viewer isn't in, the panel collapses to 0 visible rows (panel hides itself — matches badge `0`).
- If any do target the viewer, both badge and panel show the same unread count.
- Repeat sanity check on a BOQ and PI detail page using the same logic.
