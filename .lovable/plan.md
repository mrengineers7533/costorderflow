## Goal
Make notifications strictly per-department and per-change, so the actor (Design / OA Creator) never sees or acknowledges notifications for their own edits, and each linked department gets its own independent, acknowledgeable copy on the relevant page.

## Current behavior (kept intact)
- `emit_notification` already excludes the actor user (`user_id IS DISTINCT FROM _actor_uid`) and excludes the source module/department from `_targets`.
- Notification banner already mounts at the top of OA / BOQ / PI / PO / Requisition / Annexure / Manufacturing pages via `ModuleNotifications`.
- Module page list, badges, detail dialog, triggers, emit call sites, and email logic stay untouched.

## What changes
Two surgical changes — emit fan-out and ack scoping. Nothing else.

### 1. DB migration — fan-out + per-change rows (`emit_notification` v2)
- Replace the single-row insert (`target_departments = _targets`) with a loop that inserts **one `app_notifications` row per target department**, each with `target_departments = ARRAY[dept]`.
- Disable cross-call merging for line-item changes: drop the `dedupe_key` lookup / `UPDATE existing` branch so every emit call produces fresh rows. Each "change" therefore becomes its own ack-able notification per department.
- Keep all existing arguments, exclusion rules, source-module logic, suppression guard, and exception handler exactly as today (no caller changes, no signature change, no trigger edits).

### 2. DB migration — ack/visibility scoping
- Tighten `app_notification_reads` INSERT policy: require the inserting user's active `notification_recipients.department` to match the notification's single `target_departments[1]` (case-insensitive via existing `normalize_dept`), AND `user_id <> actor_user_id`.
- Add a SECURITY DEFINER helper `can_ack_notification(_notif_id, _user_id)` used by the policy and exposed to the client for button gating.
- Tighten `app_notifications` SELECT policy so non-admin / non-notifications-module users only see rows where they are the actor OR their department matches `target_departments[1]`. Admins and the dashboard module keep current full visibility.

### 3. Frontend (presentation only)
- `ModuleNotifications.tsx`: hide the "Acknowledge" button when the current user is the actor OR their normalized department does not match the notification's target department. Detail dialog button gated the same way. No layout / styling / data-fetch changes.
- `DeptNotificationsDialog.tsx`: unchanged — already filters by normalized dept.

## Out of scope (explicitly untouched)
- Notification dashboard charts, badges (`useUnseenNotifCount`), email/edge functions, all emit call sites, all triggers, sidebar, existing historical rows.
- No data backfill — historical multi-dept rows continue to render as today.

## Files touched
- New Supabase migration (functions + policies only).
- `src/components/notifications/ModuleNotifications.tsx` — add `canAck` gate around the Acknowledge button.
- `src/components/notifications/NotificationDetailDialog.tsx` — same `canAck` gate on its Acknowledge action.
- `src/lib/notifications/dept.ts` — add tiny `canAckClient(notif, me)` helper used by both components.

## Verification
- Existing vitest `notifications.test.ts` continues to pass (source-module exclusion contract unchanged).
- Add a new test asserting: (a) actor never appears in targets, (b) N changes ⇒ N rows per target dept, (c) `canAckClient` returns false for actor and for non-target dept.
