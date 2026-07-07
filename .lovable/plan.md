## Goal
Extend the existing Gmail notification pipeline with a complete, admin-visible email audit trail. Keep all costing/PDF/RLS/workflow logic untouched.

## What already exists (keep as-is)
- `email_notification_log` table (basic fields), unique per (notification, recipient, kind).
- `send-notification-email` edge function (writes pending → sent/failed).
- `notification-email-reminders` cron (24h reminder).
- `NotificationTrackingDialog` shows a small Emails list.

## What changes

### 1. DB migration — extend `email_notification_log`
Add columns (nullable, backfilled from `app_notifications` via trigger on insert):
- `source_module` text, `source_page` text, `source_doc_no` text
- `notification_type` text
- `created_by_user` text, `created_by_department` text
- `target_department` text (already have `recipient_department`, keep both; new one = notification's target dept, existing = recipient's dept)
- `cc_emails` text[]
- `reminder_sent` boolean default false
- `reminder_sent_at` timestamptz
- `reminder_count` int default 0
- `seen_status` boolean default false
- `ack_status` boolean default false
- Keep existing: `email_from`, `recipient_email` (Email To), `subject`, `status`, `sent_at`, `gmail_message_id`, `error`, `kind`.

Add view `v_email_notification_log` that joins latest seen/ack from `app_notification_reads` per recipient so the UI shows live Seen/Ack without extra queries.

RLS:
- Admin: read all (existing).
- Recipient user: read only rows where `recipient_user_id = auth.uid()` OR `recipient_email = auth.email()`.
- Actor/creator: no access to email logs (they don't receive them anyway).

### 2. Edge function updates
`send-notification-email`:
- On insert of the log row, populate all new denormalized fields from the loaded notification.
- On successful reminder send, in addition to inserting a `kind=reminder` row, update the matching `kind=initial` row: `reminder_sent=true`, `reminder_sent_at=now()`, `reminder_count = reminder_count + 1`.
- Preserve existing dedupe (unique index).

`notification-email-reminders`: unchanged except it now increments reminder_count on the initial row via the send function.

### 3. Seen/Ack sync
Add a trigger on `app_notification_reads` (AFTER INSERT) that updates `email_notification_log.seen_status` / `ack_status` for matching (notification_id, recipient_user_id) rows. No changes to the RPCs users call.

### 4. Admin UI — new "Mail Sent Details" section
New page `src/pages/admin/AdminEmailAudit.tsx` (linked from Admin tabs):
- Filters: date range, module, status (Sent/Pending/Failed), reminder sent Y/N, seen/ack status, search by doc no / recipient.
- Table columns exactly matching the requirement list: Email Log ID, Notification ID, Module, Doc No, Type, Created By (user · dept), Target Dept, To, CC, From, Subject, Status badge, Sent At, Gmail Msg ID, Error, Reminder (Y/N + when + count), Seen, Ack.
- One row per recipient (already the case).
- Paginated (50/page), sortable by Sent At default desc.
- CSV export button.

Extend existing `NotificationTrackingDialog` Emails table to show the new fields (Reminder, Seen, Ack, CC) in a compact form.

### 5. Non-admin visibility
No new page for end users. The existing `NotificationTrackingDialog` already gates by RLS; with the tightened policy above, non-admins only see their own rows.

## Explicitly NOT touched
Costing formulas, Cost Sheet Motor-with-Remarks, quotation layout, PDF exports, numbering counters, notification creation call sites, Seen/Ack RPC signatures, notification bell, module RLS.

## Files
- New migration: extend table + view + policies + reads trigger.
- Edit `supabase/functions/send-notification-email/index.ts`: populate new fields, bump reminder counters.
- New `src/pages/admin/AdminEmailAudit.tsx` + route wiring in `AdminTabs.tsx` / `App.tsx`.
- Edit `src/components/notifications/NotificationTrackingDialog.tsx`: show new fields.
- Regenerated `src/integrations/supabase/types.ts` after migration.
