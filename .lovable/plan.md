## Goal

Make the notification sender email configurable (default `pc.2@mrengineers.com`), add an admin settings UI with test-send, and expose the delivery log with filters. No changes to notification creation, Seen/Ack, RLS beyond what's needed, or business logic.

## 1. Database (single migration)

- Add columns to `email_notification_config`:
  - `sender_email text not null default 'pc.2@mrengineers.com'`
  - `sender_updated_at timestamptz`
  - `sender_updated_by uuid` (references auth.users, nullable)
- Create `email_sender_audit` table: `id`, `previous_sender`, `new_sender`, `changed_by`, `changed_at`. RLS: admin-only read; inserts via trigger. GRANTs for authenticated + service_role.
- Trigger on `email_notification_config` update: if `sender_email` changes, insert audit row with `auth.uid()`.
- Existing policy already restricts config to admin — reuse it. No changes to other tables' RLS.

## 2. Edge function `send-notification-email`

- Replace `FIXED_SENDER` constant with a runtime lookup: `SELECT sender_email FROM email_notification_config LIMIT 1` at start of each invocation (cached per invocation).
- Validate format; if blank/invalid → log each recipient row as `failed` with `error = 'Sender email not configured or invalid'` and return without sending. Do not fall back silently.
- On Gmail 4xx that indicates unauthorized sender alias (e.g. "Delegation denied" / "not authorized"), record the real provider error in `email_notification_log.error` verbatim. No behavior change beyond message clarity.
- `email_notification_log`: add column `sender_email text` populated per send so audit shows exactly which sender was used per attempt.

## 3. New edge function `send-notification-test-email`

- Admin-only (verify JWT + `has_role('admin')` via service client).
- Body: `{ to: string }`. Validates email, reads configured sender, sends via Gmail gateway with a fixed test subject/body.
- Writes a row to `email_notification_log` with `kind = 'test_email'` and `notification_id = null`. Does NOT insert into `app_notifications`.
- Requires `email_notification_log.notification_id` to become nullable (migration) and `kind` accepts `test_email`.

## 4. Admin UI — new page `src/pages/admin/AdminEmailSettings.tsx`

Added to `AdminTabs`. Contains:

- **Sender Email card**: current value, last updated at/by, input + Save button. Client validation (`zod` email). Save writes to `email_notification_config`.
- **Send Test Email card**: recipient input + Send button; calls the new edge function; shows success/error inline.
- **Recent Sender Changes** table: reads `email_sender_audit` (last 20).

Admin-only route (existing `RequireAdmin` guard).

## 5. Enhance existing `AdminEmailAudit` page

Reuse existing page — add:
- New status filter option `skipped_duplicate` and `processing` (dropdown already has all/sent/pending/failed; extend).
- New filter: **Sender Email** (text input, ilike).
- New filter: **Date range** (from/to date pickers on `created_at`).
- New column: **Sender** (from new `sender_email` field).

No layout overhaul — additive.

## 6. Files touched

```text
supabase/migrations/<new>.sql              add sender_email + audit + log columns
supabase/functions/send-notification-email/index.ts     read sender at runtime
supabase/functions/send-notification-test-email/index.ts  new
src/pages/admin/AdminEmailSettings.tsx     new page
src/components/admin/AdminTabs.tsx         add tab entry
src/App.tsx                                add route
src/pages/admin/AdminEmailAudit.tsx        extra filters + Sender column
```

## Out of scope (unchanged)

Notification creation, trigger `notify_send_notification_email`, reminder cron, template contents, deep links, Seen/Ack, BOQ grouping, revision logic, RLS on any table other than the new audit table and the two new columns.
