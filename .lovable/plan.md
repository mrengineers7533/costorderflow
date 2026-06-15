# Notification accuracy: real changes only, per-cell detail, single auto-BOQ event

Scope: notification creation triggers + Notification Dashboard / detail dialog UI. No changes to OA/BOQ/PI calculation, approval, or revision logic. No schema changes (reuse `app_notifications.line_item_changes`, `old_value`, `new_value`, `record_id`, `event_type`).

## 1. Suppress empty / no-op notifications (DB triggers)

New migration `…_notifications_real_changes_only.sql` that replaces the existing trigger functions:

- `notif_on_boqs` — on `INSERT`, suppress the `boq:created` event when the row is an auto-create from OA. Detect via `NEW.revision = 0 AND COALESCE(jsonb_array_length(NEW.line_items),0) > 0 AND` the parent OA already exists. Instead emit a single `boq:auto_created_from_oa` notification with summary `BOQ Created from OA` and `line_item_changes = NULL`. Manual user-driven creates (no parent OA context, or explicit flag) keep the existing single event.
- For BOQ revisions (`INSERT` where `revision > 0` and `parent_boq_id IS NOT NULL` / `revised_from_id IS NOT NULL`): emit exactly one `boq:revision_created` notification with title `Revised BOQ Created` / `New BOQ Auto Generated`. Do **not** also fire `line_items_changed` against the new row's own insert (today `notif_on_boqs` only fires `line_items_changed` on UPDATE, so this is already safe — confirm and document).
- On `UPDATE`: only fire `status_changed` / `design_status_changed` / `verification_changed` when the value actually differs (`IS DISTINCT FROM` — already true). Fire `line_items_changed` only when `_line_items_diff` returns a non-empty array (already true). Add an extra guard: if `OLD.* = NEW.*` for every tracked field and diff is empty, skip the insert entirely.
- `notif_on_orders`, `notif_on_pi`, `notif_on_annexure`, `notif_on_annexure_row`: same guard — wrap each `PERFORM emit_notification(...)` so a row is only written when the underlying change set is non-empty. For line-item changes, require `jsonb_array_length(_diff) > 0` (already in place).
- `notif_on_design_comment` (fires on `boq_design_comments` INSERT today): change to fire on `INSERT OR UPDATE` and skip when `NEW.comment IS NOT DISTINCT FROM OLD.comment`. Payload stays `{boq_id, boq_item_id, column_key, old_comment, new_comment, user_name, created_at}` so the detail dialog can render per-cell rows. No notification on DELETE (clearing a draft is not a comment event).
- `emit_notification` itself: add a short-circuit at the top — if `event_type LIKE '%line_items_changed%'` and `p_line_item_changes IS NULL OR jsonb_array_length(p_line_item_changes) = 0`, `RETURN NULL` without inserting.

GRANTs and RLS unchanged (triggers run as `SECURITY DEFINER`).

## 2. Notification detail dialog — only changed cells

`src/components/notifications/NotificationDetailDialog.tsx`:

- Replace `LineItemDetailsTable` with a `ChangedCellsTable` that, for each `LineChange` of `kind === 'modified'`:
  - Iterates `changed_fields` and skips any field where `JSON.stringify(before[f]) === JSON.stringify(after[f])` (defense in depth against stale diffs).
  - Renders one row per changed cell: `Line Item N · Field · Old Value · New Value`.
  - If a line has zero surviving changed fields, the whole line is omitted.
  - `kind === 'added'` / `'removed'` render as a single row with field = `—`, label `Added` / `Removed`.
- If the resulting row count is 0, hide the section entirely and show the existing `summary` only.
- Keep `HeaderCard` unchanged.

For `design_comment` notifications, render a dedicated `CommentChangesTable` driven by `notif.new_value` / `notif.old_value` (`Line Item · Field · Old Comment · New Comment · By · At`).

## 3. "View History" per changed line item

In the same dialog, beside each line item's heading add a `View History` button. On click, open a nested popover/sheet that filters the already-loaded `history: NotifFull[]` (and current `notif`) by line number, flattening every changed cell across time into:

```
Field | Old Value | New Value | Changed By | Dept | At | Ref (OA/BOQ/PI no.)
```

Source data is `history` (already fetched via `record_id`) plus `notif`; reuse the existing dedupe + sort in `ChangedLineItemsHistory`. No new network calls.

## 4. Dashboard list — hide empty notifications

`src/pages/notifications/NotificationDashboard.tsx`:

- After the existing fetch, filter out rows where:
  - `event_type` ends with `line_items_changed` AND `line_item_changes` is null/empty, OR
  - `event_type === 'comment_added'` (design_comment) AND both `new_value.new_comment` is empty and equals `old_value.old_comment`.
- Same filter applied to `ModuleNotifications.tsx`'s rendering.
- Counts/badges use the filtered list.

This is a UI safety net; with triggers fixed in §1 the filter should rarely match, but it protects historical rows.

## 5. Auto-BOQ flow confirmation

`src/lib/revisions/index.ts` (`Auto-create the initial BOQ…`) and `src/pages/orders/OrderEditor.tsx` line ~592: keep using one `INSERT INTO boqs` per BOQ; the trigger in §1 collapses that to a single `boq:auto_created_from_oa` notification. No code change here unless inspection shows multiple inserts — in that case wrap in a single insert or set a session-local flag `SET LOCAL app.suppress_line_item_notif = 'on'` honoured by `emit_notification`.

## Out of scope

- Schema changes to `app_notifications` / `boq_design_comments`.
- Approval, calculation, revision, or PDF/Excel logic.
- New notification channels.

## Files touched

- New: `supabase/migrations/<ts>_notifications_real_changes_only.sql`
- Edited: `src/components/notifications/NotificationDetailDialog.tsx`
- Edited: `src/pages/notifications/NotificationDashboard.tsx`
- Edited: `src/components/notifications/ModuleNotifications.tsx`
