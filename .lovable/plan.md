## Root cause

`design@mrengineers.com` (user id `cdde26d7-…`) has **no row** in `public.notification_recipients`, and the single `department = 'design'` row has `user_id = NULL`. Because of that:

- `current_user_department()` returns `'Other'` for this user.
- `get_related_notifications` filters by target-department match, so Design-targeted notifications are hidden → the BOQ badge shows 0 and the Notification Dashboard is empty.
- `can_ack_notification` also fails → the Seen button is a no-op for this user (silent RPC `false`), so the count never decreases and no realtime event fires.

Admin works because admins bypass both checks.

## Fix (data + minimal code, no feature/logic changes)

### 1. Data repair (migration)
- Link the existing `department = 'design'` recipient row (or insert one) to the actual auth user for `design@mrengineers.com`, keeping `is_active = true`.
- Do the same idempotently for any other `mrengineers.com` role mailbox whose `notification_recipients.user_id` is NULL but whose email prefix maps to a known department (design, purchase, pc, project, office, ea, it). Use a one-shot `UPDATE … WHERE user_id IS NULL AND department = …` guarded by an `auth.users` lookup — no schema changes.
- Backfill only; do not touch active mappings.

### 2. Safety net so this can't silently recur
- In `resolveUserDepartment` (`src/lib/notifications/dept.ts`), when the lookup returns nothing, `upsert` a `notification_recipients` row with department derived from `user_module_access` (Design module holder → `Design`, etc.), falling back to `Other`. Runs once per session at login through `AuthGate`. Non-blocking, no UI change.

### 3. Cache / realtime refresh on Seen
`useUnseenNotifCountsMap` already listens to `postgres_changes` on `app_notification_reads` and to `onPersonalSeenChange`. The reason the badge didn't drop for Design was that the RPC returned `false`, so no row was inserted. After (1)+(2) the insert succeeds and the existing realtime path already invalidates the count.

Add one small guarantee: in `markNotificationSeen` (`dept.ts`), after a successful RPC also fire `emitPersonalSeenChange(notifId)` so every mounted `useUnseenNotifCount(sMap)` on the current tab refreshes immediately without waiting for the realtime round-trip. This is additive and reuses the existing personal-seen event bus.

### 4. RLS sanity check (read-only verification, no policy widening)
Confirm `app_notification_reads` SELECT policy allows `auth.uid() = user_id` so the user receives their own realtime INSERT events (it does today). No change needed unless verification shows otherwise.

## Out of scope (explicitly unchanged)
Admin behavior, notification creation, BOQ family grouping, approvals, comments, UI layout, module access rules, and every other workflow.

## Files touched
- `supabase/migrations/<new>.sql` — backfill `notification_recipients.user_id` for Design (and sibling role mailboxes) where NULL.
- `src/lib/notifications/dept.ts` — self-heal recipient row in `resolveUserDepartment`; emit personal-seen event after successful `mark_notification_seen`.

No changes to `DesignBoqList.tsx`, `useUnseenNotifCount.ts`, RPCs, or RLS policies.