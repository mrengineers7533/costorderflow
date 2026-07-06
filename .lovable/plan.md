## Problem

In the published app, users who are granted access to a module/page (via module permissions only, without a matching `notification_recipients` department) see notifications on that page but:

- The "Seen" / "Acknowledge" buttons are hidden or disabled because the client rule `canAckClient` requires the user's normalized department to match one of the notification's `target_departments`. Users without a recipients row default to `"Other"` and never match.
- Even when Seen is recorded locally, several unseen counters read only the `app_notification_reads` table (or a server RPC) and ignore the local/personal seen fallback, so the badge stays at the old number.
- The database RPC `mark_notification_seen` / the insert into `app_notification_reads` is gated so module-permitted-but-not-department-matched users cannot persist their Seen state, meaning the count never drops for them across pages/reloads.

The admin/app-builder preview works because admin bypasses these checks.

## Fix (scope: notification visibility + count only)

### 1. Show Seen/Acknowledge for the right users everywhere

Extend the client eligibility rule so a user can Seen/Ack a notification when ALL of the following are true (any one grants eligibility):

- They are NOT the actor (`actor_user_id !== me.id`), AND
- Either
  - their normalized department is in `target_departments` (existing rule), OR
  - they have module permission for that notification's `module` (via `has_module_perm`/`useUserAccess`), OR
  - they are admin.

Apply this rule in every place a Seen/Ack button is rendered:

- `src/components/notifications/ModuleNotifications.tsx` (in-page banner)
- `src/components/notifications/DeptNotificationsDialog.tsx` (header bell dialog)
- `src/components/notifications/NotificationDetailDialog.tsx` (detail dialog)
- `src/pages/notifications/NotificationDashboard.tsx` (dashboard rows)

Keep the actor exclusion strictly enforced (requirement #7).

### 2. Persist Seen server-side for module-permitted users

Update the database so a Seen record can be written by any authenticated non-actor user who has module permission on the notification's module (not only target-department users):

- Update `public.mark_notification_seen(_notif_id)`: allow insert when `actor_user_id <> auth.uid()` AND (dept matches target OR `has_module_perm(auth.uid(), module)` OR `has_role(auth.uid(),'admin')`).
- Update RLS on `app_notification_reads` INSERT policy to mirror the same predicate so direct inserts from `ModuleNotifications.ack()` also succeed.
- Keep SELECT policy unchanged (users continue to see their own read rows).

This does not change notification generation or grouping — only who may record a Seen/Ack row for themselves.

### 3. Make unseen counts drop immediately after Seen

Every unseen counter must subtract, for the current user, both:

- server-side `app_notification_reads` rows where `user_id = auth.uid()`, AND
- the local `personalSeen` fallback (already used by `GlobalNotificationsBell`).

Update the following counters to include the current user's `personalSeen` set:

- `src/hooks/useUnseenNotifCount.ts` — `useUnseenNotifCount` and `useUnseenNotifCountsMap` must union `personalSeen` into the "seen" set before counting, and re-subscribe to `lov-personal-seen-changed` so the list badges refresh instantly.
- `src/hooks/useUnreadNotifications.ts` — after `mark_notification_seen` succeeds, decrement immediately in local state; also poll on `lov-personal-seen-changed`.
- `src/pages/notifications/NotificationDashboard.tsx` — the "Not Seen Notifications" chip must exclude notifications the current user has seen (server row OR personalSeen). Row-level Seen/Unseen status already uses `personalSeen` via the same helper.

Also, after a successful `markSeenLocal` / `ack` in `ModuleNotifications`, keep the existing local-state decrement so the in-page badge drops before the realtime round-trip.

### 4. Non-goals (explicitly not touched)

- Notification generation, target_departments computation, grouping/merging.
- Highlighting, old-vs-new display, revision key logic, tracking dialog.
- OA/BOQ/PI/PO/Costing/Requisition workflow, formulas, approvals, PDF/export.
- Admin-only tools.

## Technical details

- New DB migration:
  - `CREATE OR REPLACE FUNCTION public.mark_notification_seen(_notif_id uuid)` — extended eligibility predicate; unchanged return type.
  - `DROP POLICY ... ; CREATE POLICY app_notification_reads_insert ON public.app_notification_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.id = notification_id AND n.actor_user_id <> auth.uid() AND (has_role(auth.uid(),'admin') OR has_module_perm(auth.uid(), n.module) OR EXISTS (SELECT 1 FROM unnest(n.target_departments) d WHERE normalize_dept(d) = normalize_dept((SELECT department FROM notification_recipients WHERE user_id = auth.uid() LIMIT 1))))))`.
  - No table structure change.
- New shared helper `canSeeOrAck(notif, me, hasModuleAccess, isAdmin): boolean` in `src/lib/notifications/dept.ts` used by every render site so the rule stays consistent.
- Reuse `useUserAccess` (already resolves per-module access) inside the four render sites to know the module gate.
- Reuse existing `personalSeen` store; do not change its API.
- No visual layout change beyond enabling the existing buttons for more users.
