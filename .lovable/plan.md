## Problem

`Reset Generated Data` clears OAs/BOQs/PIs/PRs/POs/cost sheets and activity events, but it does NOT clear the in-app notifications tables. After a reset, old notification rows remain visible in the bell/notifications page.

## Fix

Extend the existing `public.admin_reset_generated_data()` SECURITY DEFINER function to also truncate the two in-app notification tables. Nothing else changes — same admin gate, same RPC, same edge function, same UI button, same confirmation flow.

### Migration

Replace the function body so its `_tables` list also includes:

- `app_notification_reads` (delete first — FK to `app_notifications`)
- `app_notifications`

Order: read-tracking tables before their parents, consistent with how `activity_event_reads` is listed before `activity_events`.

No schema change, no new tables, no RLS changes, no GRANT changes, no policy changes. Master data, recipients config (`notification_recipients`), formulas, templates, users, roles, numbering config remain untouched.

### UI copy (optional, tiny)

Update the Danger Zone description and confirmation dialog in `src/pages/admin/AdminDashboard.tsx` to mention "notifications" alongside audit logs, so admins know notifications are wiped too. Button label and confirm phrase unchanged.

### Out of scope

- Edge function `admin-reset-cof-data` — unchanged.
- `notification_recipients` (master config) — preserved.
- `login_activity` — auth log, preserved.
- Storage buckets — already purged, unchanged.
