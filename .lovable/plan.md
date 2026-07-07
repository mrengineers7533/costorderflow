
## Goal
Every row inserted into `app_notifications` also sends one email per target department recipient, from your connected Gmail account. Existing app logic, formulas, PDFs, RLS, and Seen/Ack flows stay untouched.

## What you need to do once
Connect your company Gmail via the Gmail app connector (one-click OAuth). The whole app then sends from that inbox.

## Architecture

```text
INSERT app_notifications
        │
        ▼
DB trigger (AFTER INSERT) ──► pg_net POST ──► Edge Function: send-notification-email
                                                       │
                                                       ├─► resolve recipients (notification_recipients + target_departments, exclude actor)
                                                       ├─► Gmail API (via connector gateway) — one send per recipient
                                                       └─► write email_notification_log rows

pg_cron every 15 min ──► Edge Function: notification-email-reminders
                                    └─► for notifications created >24h ago,
                                        still not seen/ack, no reminder yet → send once
```

Only NEW notifications are emailed. No backfill.

## Database changes (one migration)

1. New table `email_notification_log`
   - notification_id (fk, indexed), recipient_email, recipient_department, recipient_user_id
   - kind: 'initial' | 'reminder'
   - status: 'pending' | 'sent' | 'failed'
   - email_from, subject, gmail_message_id, error, sent_at, created_at
   - Unique (notification_id, recipient_email, kind) → prevents duplicates
   - GRANTs + RLS: admin read-all; users read rows for notifications they can see
2. Trigger `on_app_notification_insert` → calls `pg_net.http_post` to the edge function with the notification id. Failures are swallowed so the app workflow never breaks.
3. `pg_cron` job `notification-email-reminders` every 15 minutes.

## Edge functions (new, non-JWT)

- `send-notification-email`
  - Input: `{ notification_id, kind: 'initial' | 'reminder' }`
  - Loads notification, resolves target recipients:
    - For each target department in `target_departments`, pull active `notification_recipients` rows (dept match + optional module match).
    - Exclude the actor (`actor_user_id` / actor email).
    - Deduplicate by email.
  - For each recipient: check `email_notification_log` uniqueness, insert `pending` row, call Gmail API (`/users/me/messages/send`) through the `google_mail` connector gateway using base64url RFC-2822 MIME, then update row to `sent` (store `gmail_message_id`) or `failed` (store error). Never throws to caller.
  - Subject: `[<Module>] <DocNumber> — <Title>`
  - HTML body includes: notification type, module/page, document number, created-by dept, target dept, change summary, required action, deep link built from `VITE_APP_URL` env + notification's route.

- `notification-email-reminders` (cron-invoked)
  - Selects notifications older than 24h where no ack/seen for target dept and no `reminder` row exists yet in log; invokes `send-notification-email` with `kind: 'reminder'`.

## Admin visibility

Extend `NotificationTrackingDialog` with an "Emails" section listing per-recipient rows from `email_notification_log`: recipient, kind, status badge (Sent / Failed / Pending), timestamp, error tooltip. Admin-only view uses existing admin check.

## What is explicitly NOT changed
- No changes to notification creation call sites — trigger handles it.
- No changes to Seen/Ack RPCs, notification bell, module permissions, RLS on existing tables, PDFs, costing, numbering, or workflow.
- No emails to the actor. No duplicate emails (enforced by unique index).
- Marking Seen/Ack does not send or cancel any email; it only stops the 24h reminder from firing.

## Setup steps (I'll drive)
1. Connect Gmail via `standard_connectors--connect` (`google_mail`).
2. Add `APP_PUBLIC_URL` secret so email deep links work on published site.
3. Run the migration (table + trigger + cron).
4. Create the two edge functions.
5. Extend the admin tracking dialog.

## Assumptions
- Gmail sending quota (~500/day per account) is sufficient for your volume. If you later exceed it we can switch to a Google Workspace service account or Lovable Emails.
- Recipients are resolved from `notification_recipients` (already used elsewhere). Users listed there receive email; users with only module access do not.
