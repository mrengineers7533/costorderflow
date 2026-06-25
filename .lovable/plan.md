## Goal
Fix notification duplication, separate **Seen** vs **Acknowledged**, and add an actor/admin **Tracking** view. Keep existing UI, triggers, and emit call sites unchanged.

## Root causes of the duplicates in screenshot
1. **`emit_notification` merge is too narrow.** It only merges rows where `record_id`, `event_type`, AND `target_departments = ARRAY[_dept]` all match. Notifications created before `revision_key` was added (or with slightly different event labels / extra target depts) never merge → 4 identical "OA…R9 line items updated" rows persist.
2. **`design_comment` notifications** use the comment row's id as `record_id`, so every new comment is a new `record_id` and merge cannot find the prior row even when `revision_key` (`boq:id:rN`) is identical.
3. **No backfill** of `revision_key` / merge for the rows that already exist.
4. **Seen == Acknowledged today.** The list only writes `app_notification_reads` on Acknowledge; merely opening Details / Open in page does not mark the row seen, and there are no `seen_*` columns.
5. **No tracking surface** for the actor/creator dept or admin.

## Plan

### 1. Database migration — stronger per-document merge
- Rewrite `emit_notification` merge lookup to key on **`(target_department, revision_key)`** only (drop the `record_id` + `event_type` predicate inside the merge SELECT, but keep the new INSERT writing both). This makes one row per (document-revision, target dept) regardless of how many edit events fire.
- For `design_comment`, set `_record_id` used in merge lookup to the BOQ id so all comments on the same BOQ revision collapse into the single row.
- Switch `target_departments = ARRAY[_dept]` comparison to `_dept = ANY(target_departments)` so legacy multi-dept rows are reused.
- Title becomes `"<DocRef> — N change(s)"` using `record_ref`.

### 2. Database migration — backfill existing dupes
- For every `(module, COALESCE(related_boq_id, related_order_root_id, record_id), target_department)` group with un-acknowledged rows, keep the oldest row, merge all `line_item_changes` into it, recompute `total_changed_rows` / `total_changed_cells` / `title`, and delete the rest (cascade `app_notification_reads`).

### 3. Database migration — Seen vs Acknowledged split
- Add columns to `app_notifications`: none. Add columns to `app_notification_reads`: `kind text not null default 'ack' check (kind in ('seen','ack'))`, `department text`, plus drop the implicit uniqueness so a (notification, user) can have one `seen` and one `ack` row. Replace the unique index with `unique (notification_id, user_id, kind)`.
- Add RPC `mark_notification_seen(_id uuid)` (SECURITY DEFINER) that inserts a `seen` row only when the caller's dept matches a target dept and the caller is not the actor.
- Update RLS: `seen` rows readable by actor + admin + target-dept users; `ack` rows unchanged.

### 4. Frontend — fire `seen` on view, keep `ack` separate
- `NotificationDetailDialog` and the "Open in page" button call `mark_notification_seen(id)` on open. Acknowledge button keeps writing the `ack` row via the existing path.
- `ModuleNotifications` row pill renders **New → Seen → Acknowledged** based on which read kinds exist for the current user.
- No layout / styling changes; only the badge text + an `onClick` side-effect.

### 5. Frontend — Tracking view for actor & admin
- Add `<NotificationTrackingDialog/>` (new file `src/components/notifications/NotificationTrackingDialog.tsx`) showing, per target department:
  - Sent ✓ · Seen by `<user>` at `<ts>` (or Not Seen) · Acknowledged by `<user>` at `<ts>` (or Not Acknowledged).
- Powered by a new SECURITY DEFINER RPC `get_notification_tracking(_id uuid)` that returns one row per target dept by joining `app_notification_reads`. Visible only to the actor or admins (`has_role(uid,'admin')`).
- Surface a small "Tracking" button in `ModuleNotifications` and `NotificationDashboard` rows when the current user is the actor or admin.

### 6. Tests
- Extend `notificationDocLevelMergeAndDeepLink.test.ts` to cover:
  - Two consecutive `order` `line_items_changed` emits with overlapping + new rows → one notification per dept, merged change list, correct totals.
  - Three `design_comment` emits on same BOQ revision → one notification per dept.
  - Backfill collapses pre-existing dupes.
  - `mark_notification_seen` only succeeds for target-dept user; actor cannot.
  - `get_notification_tracking` returns per-dept Sent/Seen/Ack rows; non-actor non-admin call is rejected.

## Files

**Created**
- `supabase/migrations/<ts>_notif_merge_seen_tracking.sql`
- `src/components/notifications/NotificationTrackingDialog.tsx`
- additions to `src/test/notificationDocLevelMergeAndDeepLink.test.ts`

**Edited (frontend, no layout change)**
- `src/components/notifications/ModuleNotifications.tsx` — call seen RPC, render Seen/Ack badges, add Tracking button.
- `src/components/notifications/NotificationDetailDialog.tsx` — call seen RPC on open.
- `src/lib/notifications/dept.ts` — small helper `markSeen(id)`.
- `src/pages/notifications/NotificationDashboard.tsx` — Tracking button for actor/admin rows.

Existing emit call sites, triggers, RLS for other tables, badges, page layouts, and module UIs remain untouched.