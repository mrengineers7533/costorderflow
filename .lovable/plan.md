## Root cause

In-app notifications are being created (22 rows in the last 3 days on `app_notifications`), and the trigger `trg_app_notifications_email` is installed. But `email_notification_log` has zero rows for the same window and the `send-notification-email` edge function has zero invocation logs — the function is never being called.

Reason: the trigger function `public.notify_send_notification_email` (and the reminders cron job) call `extensions.http_post(...)`. Only the `pg_net` extension is installed on this project (not `pg_net` exposes `net.http_post`, and the `http` extension is not present). The call raises an "function does not exist" error, which is swallowed by the trigger's `EXCEPTION WHEN OTHERS THEN NULL` block, so notification creation succeeds silently and no email is ever queued.

The Gmail sender / template / recipient logic in `supabase/functions/send-notification-email/index.ts` is already correct; it just never receives the HTTP call.

## Fix (DB-only, additive)

Single new migration that rewrites the trigger function and reminders cron job to use `net.http_post` from `pg_net`. No app code, no edge function code, no UI, no RLS, no schema changes.

1. Replace `public.notify_send_notification_email()` body:
   - Read `send_fn_url` and `cron_secret` from `email_notification_config` (unchanged).
   - Call `net.http_post(url, body, headers)` with the same JSON payload (`{ notification_id, kind: 'initial' }`) and the same `x-cron-secret` header.
   - Keep `SECURITY DEFINER`, keep `search_path`, keep `EXCEPTION WHEN OTHERS THEN NULL` so email failure never blocks notification insert.
2. Re-schedule the `notification-email-reminders` pg_cron job so its SQL uses `net.http_post` instead of `extensions.http_post`, same headers/body, same `*/15 * * * *` cadence.
3. No new columns, no policy changes, no changes to `app_notifications`, `email_notification_log`, or the edge functions.

## Verification after apply

- Create any test in-app notification; within a few seconds a row appears in `email_notification_log` with `status = 'sent'` (or `failed` with a real Gmail error), and the `send-notification-email` edge function shows an invocation in its logs.
- No change to Seen/Acknowledge, actor exclusion, department targeting, BOQ grouping, revisions, permissions, or any other workflow — the trigger fires on the exact same event with the exact same payload as before.

## Not changed

Notification creation, assignment, target-department logic, actor exclusion, Seen/Acknowledge, counts, BOQ grouping/revision, permissions, workflows, calculations, module logic, UI, and the existing sender address `pc.2@mrengineers.com` all remain exactly as they are today.
