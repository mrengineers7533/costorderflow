## Problem

The "Not Seen Notifications" badge and the in-page Notifications banner use two different data sources, so their counts diverge:

- **Banner** (`ModuleNotifications.tsx`) — calls RPC `get_related_notifications` (returns every notification linked to the record, regardless of `target_departments`) and counts rows that have no entry in `app_notification_reads` for the current user.
- **Badge** (`useUnseenNotifCount` in `src/hooks/useUnseenNotifCount.ts`) — queries `app_notifications` directly and additionally filters by `target_departments` matching the current user's department. When a notification has targets that don't include the viewer's department (e.g. BOQ status change targeted at Design only, viewed by an Other/Sales user), the badge drops it to 0 while the banner still shows it as "New".

The badge on OA list rows (`useUnseenNotifCountsMap`) and on BOQ/PI list rows uses the same hook, so it has the same mismatch.

## Fix (presentation/data layer only — no business logic changes)

Rewrite `src/hooks/useUnseenNotifCount.ts` so both the single-record hook and the bulk map hook source notifications from the **same** RPC the banner uses (`get_related_notifications`), then subtract acknowledged ids from `app_notification_reads`. This guarantees badge = banner unread count, by construction.

### Changes

1. **`useUnseenNotifCount({ boqId, orderRootId, piId })`**
   - Replace the direct `app_notifications` query + `target_departments` filtering with a call to `supabase.rpc("get_related_notifications", { p_order_root, p_boq, p_pi, p_po: null, p_req: null, p_annex: null, p_record_id: null, p_modules: null, p_limit: 500 })`.
   - Apply the same content filter the banner uses (drop empty `*_line_items_changed` and empty `comment_added/comment_updated` rows) so counts match exactly.
   - Subtract ids present in `app_notification_reads` for the current user.
   - Keep the existing realtime subscription on `app_notifications` + `app_notification_reads` so Acknowledge updates both UIs immediately.

2. **`useUnseenNotifCountsMap(kind, ids)`** (used by OA/BOQ/PI list "Not Seen Notifications" column)
   - For each id, call the same RPC (batched via `Promise.all`) and apply the same filter + reads subtraction.
   - Keep the shared realtime channel.
   - Cap concurrency (e.g. 8 at a time) to avoid request storms on long lists.

3. **No other files change.** `ModuleNotifications`, `NotSeenNotifBadge`, dashboard, list pages, RPC, RLS, and acknowledge flow are untouched. Department targeting, OA/BOQ/PI/Purchase/etc. business logic, and existing calculations are not modified — the badge simply now mirrors the banner's data source.

### Coverage

Because every page (OA, BOQ, PI, Design, Purchase, Manufacturing, Requisition, and future Project) renders `NotSeenNotifBadge` via this single hook, fixing the hook fixes all pages at once. Future Project pages get the same behavior for free.

### Out of scope

- No DB migrations, RPC changes, RLS changes.
- No changes to acknowledge logic, banner UI, dashboard filters, or any module's domain logic.
- No change to the sidebar bell (`useUnreadNotifications`).
