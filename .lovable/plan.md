## Goal
Run a live end-to-end verification of the Gmail notification + Email Audit pipeline without changing any business logic, then re-run the security scan. No CC work in this pass.

## Approach
All checks are read-only or use existing app flows. No schema, function, or UI changes.

## Steps

### 1. Pick a real target recipient
Query `notification_recipients` for one active row whose `department` matches a real target dept used by a module (e.g. `design` or `purchase`) and whose `email` is a mailbox you can actually open. Confirm the row's `user_id` maps to a real profile in `profiles`. Record: recipient email, department, user_id.

### 2. Create one test notification
Insert a single row into `app_notifications` via the existing RPC / insert path used by the app (same trigger the modules use), with:
- `module` = the module matching step 1
- `target_departments` = `[recipient.department]`
- `actor_user_id` = a different user than the recipient (so actor-exclusion is testable)
- `record_ref` = `TEST-EMAIL-AUDIT-<timestamp>`
- `title` / `summary` = "E2E email audit test"

No new tables, no schema changes.

### 3. Verify send
Within ~30s:
- Check `email_send_log` / `email_notification_log` rows for this `notification_id`:
  - Exactly one row per resolved recipient (dedupe check).
  - `status` transitions `pending` → `sent`.
  - `gmail_message_id` populated.
  - `email_from` = the connected Gmail address.
  - `recipient_email` = the target user only.
  - No row exists for the actor's email.
- Check the target inbox to confirm actual delivery.
- Check edge function logs for `send-notification-email` for any errors.

### 4. Verify Email Audit page
Open `/admin/email-audit` as an admin and confirm the new row shows:
Email To, Email From, Notification ID, Module/Page, Document No., Status (Sent), Sent date/time, Reminder (No, count 0), Seen (No), Ack (No). Try filters (module, status) and search by the `record_ref`.

### 5. Verify Seen sync
As the recipient user, open the notification (existing "mark as seen" flow / bell). Re-open Email Audit and confirm the row now shows Seen = Yes. This validates the `sync_email_log_reads` trigger on `app_notification_reads`.

### 6. Verify Ack sync
As the recipient user, click Acknowledge on the same notification. Re-open Email Audit and confirm Ack = Yes.

### 7. Verify reminder gating (without waiting 24h)
Two-part check, no code changes:
- Read `notification-email-reminders` source to confirm its query filters to notifications older than 24h AND not yet seen/acknowledged.
- Manually invoke the reminder function once with the test `notification_id`. Because it is already Seen+Ack from step 5–6, expect zero new `email_notification_log` rows of kind `reminder` and no bump in `reminder_count`.
- Then create a second short-lived test notification, leave it unseen, and manually invoke the reminder function with a temporary "ignore 24h" branch? — No, we will NOT modify code. Instead: verify the reminder path fires by directly inserting a second notification, then in a scratch check, call the reminder function; confirm it correctly skips the seen one and would target the unseen one only if the age filter passes. Document the 24h age filter as the only remaining gate.

### 8. Cleanup
Delete the two test `app_notifications` rows and their `email_notification_log` rows so audit stays clean.

### 9. Security re-scan
Run the security scanner once and report findings. Do not auto-fix; list them for your review.

## Reporting
After each step I will paste the concrete evidence: row counts, status values, screenshots/text of Email Audit, and edge function log snippets. If any step fails, I will stop and report before continuing.

## Explicitly not touched
Costing formulas, Cost Sheet Motor-with-Remarks, quotation layout, PDF exports, numbering, RLS, notification creation code, Seen/Ack RPCs, notification bell, module workflows, UI layout, CC recipients.
