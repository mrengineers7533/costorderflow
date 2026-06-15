## Goal

Add two new sidebar entries — **Design** and **Notification Dashboard** — without touching any existing BOQ / OA / PI / Purchase / Manufacturing logic. Access is enforced through the existing `user_module_access` system.

## Sidebar (UI only)

In `src/components/AppSidebar.tsx`, insert two items right after the BOQs entry, using existing styles (orange active pill, icon + label, collapse behavior). New icons: `PencilRuler` for Design, `Bell` for Notification Dashboard. Bell shows an unread count badge fed by a small `useUnreadNotifications(user.id)` hook.

## New permission modules

Add two keys to `src/lib/access/modules.ts`:

- `design` — "Design (BOQ View & Comments)"
- `notifications` — "Notification Dashboard"

Admins (`AdminAccess` page) can already toggle modules per user — no UI changes needed there, the two new rows show up automatically. No existing module key changes, so Costing / Manufacturing access stays exactly as-is.

Routes wrap each new page in `<RequireModule module="design">` / `<RequireModule module="notifications">`.

## Page 1 — Design (`/design`)

Read-only BOQ viewer with item/cell-level comments. **No editing of model, description, qty, unit, motor, rates, costing, or any BOQ field.**

Layout:

- Tabs at the top: **MR BOQs** | **GMS BOQs** — driven by the existing `boqs.format` column (`'MR' | 'GMS'`) which already classifies every BOQ (used by `next_oa_number`, etc.). No new field needed.
- List view: BOQ number, customer/client, project / OA reference, current status, last updated by, last updated at, comment count, "Open" button.
- Detail view (`/design/:boqId`): renders the BOQ line-item grid in **read-only** mode (re-using the same row renderer logic from `BoqEditor` but with inputs disabled), plus a comment thread under each row and a per-cell comment indicator on Model / Description / Qty / Unit / Motor / Remarks columns (re-uses the existing `column_comments` shape already used by Design Review).

Comments:

- New table `public.boq_design_comments` (item-wise + optional cell key). Created in a single migration with GRANTs + RLS.
- Stored with `user_id`, `user_name`, `department` (read from `notification_recipients.department` for the user, falling back to "Design"), `created_at`, `comment`, `boq_id`, `boq_item_id`, optional `column_key`.
- Read access: anyone with `boqs` OR `design` OR `notifications` module access; write access: users with `design` module access only.
- Adding a comment triggers a notification (see below) via a small DB trigger so it works regardless of which client added the comment.

Empty / loading / error states for the list and the detail view.

## Page 2 — Notification Dashboard (`/notifications`)

Cross-department notification feed and acknowledgement tracker.

New tables (all in one migration, with GRANTs + RLS + `updated_at` triggers):

1. `public.app_notifications`
   - `module` (`'boq' | 'order' | 'pi' | 'purchase' | 'grn' | 'requisition' | 'manufacturing' | 'design_comment'`)
   - `event_type` (`'created' | 'updated' | 'status_changed' | 'comment_added' | 'revision_created' | ...`)
   - `record_id`, `record_ref` (BOQ #, OA #, PI #, PO #, REQ #, etc.), `client_name`
   - `title`, `summary`, `old_value`, `new_value` (jsonb)
   - `actor_user_id`, `actor_user_name`, `actor_department`
   - `target_departments text[]` — which departments should see it
   - `created_at`

2. `public.app_notification_reads`
   - `notification_id`, `user_id`, `user_name`, `department`, `seen_at`
   - unique `(notification_id, user_id)`

Generation:

- One DB trigger per source table (`boqs`, `orders`, `proforma_invoices`, `purchase_orders`, `grn_receipts`, `requisitions`, `boq_design_comments`) that inserts an `app_notifications` row on `INSERT` / `UPDATE` of meaningful fields, capturing the diff into `old_value` / `new_value`. Triggers are additive — they do not modify existing rows or behavior.
- `actor_department` resolved from `notification_recipients.department` for `auth.uid()` (falls back to `'Other'`).
- `target_departments` defaults to every distinct `department` in `notification_recipients` minus the actor's department (so a change made by Costing notifies Design, Purchase, Manufacturing, etc.).

UI (`/notifications`):

- Filters: All / New / Acknowledged / Pending; by department (multi); by module (multi); date range; search by BOQ / OA / PI / PO / client.
- Sidebar badge = count of notifications visible to this user where there is no row in `app_notification_reads` for `(notification_id, user_id)`.
- Each row shows: title, module, record reference, actor + actor department, timestamp, old → new diff, status chip.
- **Seen / Acknowledge** button — only marks read when explicitly clicked (writes a row in `app_notification_reads`). Opening the dashboard does NOT auto-mark.
- Expandable "Tracking" panel for notifications where `actor_user_id = auth.uid()`: per target department shows received / seen / pending, with seen-by name + timestamp.

Empty / loading / error states throughout.

## Files added / changed

```text
src/lib/access/modules.ts                 (+ 'design', 'notifications')
src/components/AppSidebar.tsx             (+2 items, unread badge)
src/App.tsx                               (+3 routes)
src/hooks/useUnreadNotifications.ts       (new)
src/lib/notifications/api.ts              (new — fetch/ack helpers)
src/lib/design/comments.ts                (new — list/add comment)
src/pages/design/DesignBoqList.tsx        (new — MR/GMS tabs)
src/pages/design/DesignBoqView.tsx        (new — read-only + comments)
src/pages/notifications/NotificationDashboard.tsx  (new)
src/components/notifications/AckTrackingPanel.tsx  (new)
supabase/migrations/<ts>_design_and_notifications.sql  (new)
```

No existing component, page, table, RLS policy, RPC, or route is modified beyond adding the two sidebar items, two module keys, and three new routes.

## Out of scope

- No changes to existing BOQ editor, OA editor, PI editor, Purchase, Manufacturing, GRN, Requisitions, Annexure Folder, Raw Material Master.
- No email sending for the new notifications in v1 (in-app only). Existing `order_revision_notifications` email flow is untouched.
- No new permission for "acknowledge" — anyone with `notifications` module access can acknowledge their own department's notifications.
