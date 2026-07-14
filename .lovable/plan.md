## Goal

Whenever a new row is inserted into `app_notifications`, send **one general email per target department** using a common template, without changing any existing notification, permission, or workflow logic.

## Scope

- Only the edge function `supabase/functions/send-notification-email/index.ts` is modified.
- No changes to triggers, notification creation, permissions, Seen/Acknowledge, RLS, business rules, or UI.
- The existing DB trigger already invokes this function asynchronously via `pg_net`, so email failures cannot block save/approval/revision (already true, preserved).

## Behavior changes

1. **Group by target department** (currently one email per user)
   - For each department listed in `app_notifications.target_departments`:
     - Collect all active users in `notification_recipients` matching that department (and module scope, if set).
     - Exclude the actor by `user_id` and by email.
     - Dedupe recipients by email.
     - Send **one email** with all department recipients in the `To:` field (comma-joined RFC 2822).
     - Skip the department entirely if no recipients remain after actor exclusion.
   - Result: one document-level notification = one email per target department, regardless of how many fields/rows changed.

2. **Common general template** (used for all modules)
   - Subject: `Action Required: Update in <Document No.>`
   - Body (HTML + plain-text alt, brand-styled but content matches spec):
     ```
     A change has been made in <Module/Page> for document <Document No.>.

     Changed by: <Department> / <User>
     Date/Time: <formatted created_at>
     Total Changes: <count>

     Please log in to GMS to review the notification and take the required action.

     [Open Notification] button → deep link
     ```
   - Total Changes = `COALESCE(total_changed_cells, total_changed_rows, 1)` from `app_notifications`.
   - Deep link = existing `buildDeepLink(n)` (unchanged).

3. **Logging** (`email_notification_log`)
   - Insert one row per department email sent, using the first recipient email as `recipient_email` (satisfies existing unique key `(notification_id, recipient_email, kind)`).
   - Store the full comma-joined recipient list in `cc_emails` for audit visibility, plus `target_department` and `recipient_department` set to the department name.
   - Status transitions (`pending` → `sent` / `failed`) and reminder-count bump for `kind='reminder'` remain identical.

4. **Failure isolation**
   - Each department send is wrapped in try/catch; a failure logs `status='failed'` and continues to the next department.
   - The function always returns 200 with per-department results so the DB trigger never surfaces an error to the calling transaction (already the case with `pg_net`, preserved).

## Non-changes

- Trigger `notify_send_notification_email`, cron reminders function, and `email_notification_config` table stay as-is.
- `notification_recipients`, department mapping, and Seen/Acknowledge flow stay as-is.
- Existing admin email audit page (`AdminEmailAudit.tsx`) continues to read from `email_notification_log`; department-level rows show up naturally with the same schema.

## Technical notes

- Gmail API accepts a comma-separated `To:` header; still one API call per department.
- `total_changed_cells`/`total_changed_rows` already exist on `app_notifications` — no schema change.
- Reminder path (`kind='reminder'`) uses the same department-grouping so a department gets one reminder too.
