## Goal
All department notification emails must be sent with `From: pc.2@mrengineers.com`. No other behavior changes.

## Change (single file)
`supabase/functions/send-notification-email/index.ts`

1. Add a constant `FIXED_SENDER = 'pc.2@mrengineers.com'`.
2. In `sendGmail(...)`, include an explicit `From: pc.2@mrengineers.com` header in the RFC-822 raw message (Gmail API honors the `From` header when the authenticated Gmail account has send-as permission for that address).
3. Replace the `getSenderEmail()` Gmail profile lookup usage: still call it for diagnostic fallback, but set `email_from: FIXED_SENDER` when writing to `email_notification_log` so the audit shows the true visible sender.
4. Deploy `send-notification-email` edge function.

## Preserved
- Recipient resolution, per-department grouping, actor exclusion, CC list.
- Idempotency (unique log row per notification/recipient/kind).
- Retry/reminder logic, failure isolation, status tracking.
- Notification creation, Seen/Acknowledge, RLS, workflows.

## Prerequisite (user action, outside code)
The connected Gmail mailbox must have `pc.2@mrengineers.com` configured as a verified "Send mail as" alias (Gmail Settings → Accounts). Otherwise Gmail will silently rewrite `From` back to the authenticated address. If not yet configured, I will flag this after deploy.

## Technical notes
- Gmail API `users.messages.send` uses the `From` header from the raw MIME when the address is a permitted send-as alias; no additional API parameter needed.
- No schema changes, no changes to `notification-email-reminders` (it calls this same function).
