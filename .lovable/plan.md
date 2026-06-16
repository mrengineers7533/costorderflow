# Not Seen Notifications for BOQ, OA, PI

## 1. Shared hook: `useUnseenNotifCount`
New file `src/hooks/useUnseenNotifCount.ts`.

- Inputs: `{ orderRootId?, boqId?, piId? }` (extensible to po/req).
- Resolves current user id + department.
- Loads notifications via existing `get_related_notifications` RPC (limit 200), then loads matching rows from `app_notification_reads` for the current user, and returns `unseen` = notifications targeting the user's department (via `matchTargetDept` against `target_departments`) that have no read row for this user.
- Subscribes to realtime `postgres_changes` on `app_notifications` and `app_notification_reads` and refetches (channel cleaned up on unmount). Reuses the realtime publication already enabled in the prior migration — no DB changes.
- Returns `{ count, loading, refresh }`.

## 2. Reusable UI: `NotSeenNotifBadge`
New file `src/components/notifications/NotSeenNotifBadge.tsx`.

- Props: `{ orderRootId?, boqId?, piId?, variant?: "inline" | "cell" }`.
- Uses the hook. Renders a clickable pill: `Not Seen Notifications: N` (inline) or just `N` (cell).
- `onClick` navigates with `useNavigate` to:
  `/notifications?unseen=1&boq=<id>` (or `oa=<rootId>`, `pi=<id>`).
- View-only: no acknowledge/edit action. Hidden when count is 0 in `cell` mode, dimmed `0` shown in detail header for clarity.

## 3. Detail pages (top-left badge)
Insert `<NotSeenNotifBadge variant="inline" … />` near the existing header/breadcrumb area in:

- `src/pages/orders/OrderEditor.tsx` — pass `orderRootId = parent_order_id ?? id`.
- `src/pages/boqs/BoqEditor.tsx` — pass `boqId`.
- `src/pages/pi/PiEditor.tsx` — pass `piId`.

Placed above the existing `ModuleNotifications` banner; the banner is unchanged.

## 4. List pages (new column)
Add a "Not Seen Notifications" column to:

- `src/pages/boqs/BoqList.tsx`
- `src/pages/orders/OrdersList.tsx`
- `src/pages/pi/PiList.tsx`

Each row renders `<NotSeenNotifBadge variant="cell" boqId={row.id} />` (or `orderRootId`/`piId`). Click navigates to the filtered notifications view. Existing columns/actions untouched.

To avoid N hook subscriptions per row, the cell hook will reuse a single shared realtime channel keyed per list page (small ref-counted manager inside the hook module). Acceptable for current list sizes; no DB change needed.

## 5. Notification Dashboard: filtered drill-in
Update `src/pages/notifications/NotificationDashboard.tsx` to read new query params and apply filters on top of the existing fetched `rows`:

- `?boq=<uuid>` → keep rows where `related_boq_id` matches.
- `?oa=<uuid>` → keep rows where `related_order_root_id` matches.
- `?pi=<uuid>` → keep rows where `related_pi_id` matches.
- `?unseen=1` → keep rows the current user has NOT acknowledged (no row in `reads` for `me.id`).
- Default sort already `created_at DESC` (latest first).
- Show a small "Filtered by <BOQ/OA/PI> · Unseen only" chip with a Clear button that calls `setSearchParams({})`.

No change to delete/acknowledge logic.

## 6. Notification detail content
`src/components/notifications/NotificationDetailDialog.tsx` already renders Title, Record No (BOQ/OA/PI), Client, Changed By (department/user), When, Line Item table, and a Line-Item History grouped by line/field/old/new/by/when. To match the requested format exactly:

- In `LineItemDetailsTable`, add a "Field / Cell" column rendered per `changed_fields` (one row per field for modified items) showing field label, Old, New. For added/removed keep current single status row.
- In `HeaderCard` ensure the document number (BOQ/OA/PI) and the actor "Edited By" + "Edited On" are always visible (currently conditional on values existing — keep that, just relabel "Changed By" → "Edited By" and "When" → "Edited On").

No changes to triggers / DB / RLS — `_line_items_diff` already captures `changed_fields`, `before`, `after`.

## Out of scope
- No schema changes, no new RPC, no policy changes.
- No edits to existing approval/OA/BOQ/PI/notification creation logic.
- Acknowledge flow remains only inside the user's own notification area / detail dialog.

## Technical notes
- Filtering uses existing `app_notifications` columns already in `<NotifFull>` — `related_boq_id`, `related_order_root_id`, `related_pi_id`.
- "Seen" semantics match the rest of the app: a notification is seen for the current user once `app_notification_reads` contains `(notification_id, user_id)`. Count drops automatically via the realtime subscription.
- Department gating: count only includes notifications whose `target_departments` matches the user's department (via `matchTargetDept`), matching the dashboard's own behavior, so users don't see counts for notifications not aimed at them.
