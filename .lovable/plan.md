## Goal
Ensure every notification row exposes its own explicit **Seen** button, visible only to target-department users (never the actor). Backend rules and existing workflows are untouched.

## Scope
Only three UI surfaces are changed. No DB, no edge function, no workflow code.

### 1. `src/components/notifications/DeptNotificationsDialog.tsx`
- Accept `meId` and `meDepartment` (or fetch the current user once with `supabase.auth.getUser` + `notification_recipients`) so we can gate per-row.
- Add a new `Action` column with a **Seen** button on each row when:
  - row is not yet seen for this department, AND
  - `canAckClient(notif, me)` returns true (target dept + not actor).
- On click: call `markNotificationSeen(n.id)`. On success, optimistically add a synthesised read row into `readsByNotif[n.id]` so the badge flips to **Seen** and the button hides. No refetch of parent.
- Keep existing row-click → detail dialog behavior unchanged (stop propagation on button click).

### 2. `src/components/notifications/NotificationDetailDialog.tsx`
- Remove the auto `markNotificationSeen` effect (lines 254–265).
- In `NotificationDetailBody`, add an explicit **Seen** button next to/in place of the existing read-only "Seen" pill when `canAck && !mySeen && !myAck`. Clicking calls `markNotificationSeen(notif.id)` then `onAcknowledged?.()` + `load()`. The existing **Acknowledge** button stays as-is.
- Actor / non-target users continue to see nothing actionable (only the read-only chips), preserving the actor-hide rule.

### 3. `src/components/notifications/ModuleNotifications.tsx`
- The button already exists and is gated by `canAckClient`. The reported "missing" case usually means the page mounts the banner without enough `links` for the RPC to return the row. Audit and (read-only verify) the mounting points listed in earlier turns; no logic change unless a specific page is missing a link prop. If a page is missing, pass the appropriate `links` (e.g. `orderRootId`, `boqId`, `requisitionId`, `annexureId`) — no other behavior change.
- Keep the existing solid-blue, pulsing **Mark as Seen** button untouched.

## Non-goals (explicit guard)
- No changes to OA, BOQ, Design, Manufacturing, Purchase, Requisition, Annexure, Planning, Tracking, Dispatch, costing, numbering, approval, Save Draft, Finalize, or Convert to PI logic.
- No changes to notification creation, `mark_notification_seen` RPC, `app_notification_reads` schema, `canAckClient`, or actor-hide rule.
- No bulk "Mark all seen" added.

## Verification
- Lint/build via existing pipeline.
- Manual: open Dept Notifications dialog as a target-dept (non-actor) user → row shows **Seen** button → click → flips to **Seen** chip.
- As the actor → no Seen button anywhere.
- Detail dialog no longer marks Seen automatically; explicit button required.
