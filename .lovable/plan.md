# BOQ Auto-Revision With Senior Verification

## Rule
When an OA is revised (e.g. R3 → R4), the linked BOQ is automatically revised to the same revision number, but the new BOQ row stays in **Pending Verification** state. The previous (R3) BOQ remains the current/active one until a senior opens a verification link and approves the new revision. Approval flips the new R4 BOQ to current and supersedes R3.

BOQ can never be revised manually anymore. BOQ revision number always equals the OA revision number. BOQ template/UI is unchanged.

## Data model

Add columns to `boqs`:
- `verification_status text` — `approved` (default for legacy & post-approval) or `pending_verification`
- `verification_token uuid` — random; used in email link
- `verification_requested_at timestamptz`
- `verified_at timestamptz`
- `verified_by_email text`

Add `app_settings` row `boq_verifier` with shape `{ email: string|null }` (admin-editable; email sending is wired later).

`is_current` semantics tightened:
- New pending BOQ row is inserted with `is_current = false`, `verification_status = 'pending_verification'`.
- Existing current BOQ stays `is_current = true` until approval.
- On approval the pending row is set `is_current = true`, `verification_status = 'approved'`; the previous one is auto-superseded by the existing `boqs_keep_single_current` trigger.

A `verify_boq_with_token(token uuid, verifier_email text)` SECURITY DEFINER RPC handles approval so the verification page works without auth (link recipients may not be logged in).

## OA → BOQ flow (`syncBoqsAndPisForOrder`)

When an OA save occurs:
1. Resolve the OA family root + all revisions as today.
2. Find the **current** BOQ for the family (only one).
3. If the current BOQ already matches `order.revision`, run the existing in-place sync (description/remarks preserved). No new revision.
4. Else (OA bumped to a higher revision than current BOQ): insert a **new** pending BOQ row from the latest OA data, carrying over user-edited Description/Remarks from the current BOQ. Set `revision = order.revision`, `is_current = false`, `verification_status = 'pending_verification'`, fresh `verification_token`. Trigger email send (no-op if not configured).

PI sync is unchanged.

## Verification

- New public route `/boq-verify/:token` (no auth gate) — page calls the RPC with the token and a verifier email pulled from `app_settings.boq_verifier` (read-only display) plus an optional name field. Shows pending BOQ summary (number, OA ref, items count) and an Approve button.
- RPC `verify_boq_with_token`:
  - Looks up boq by token + status `pending_verification`.
  - Marks it `approved`, `is_current = true`, sets `verified_at`, `verified_by_email`, clears token.
  - Trigger handles superseding the previous current BOQ.

## Email (configurable, stub now)

- New edge function `send-boq-verification` (verify_jwt = false) takes `{ boq_id, verification_url }`, reads `app_settings.boq_verifier.email`, and:
  - If empty → returns `{ skipped: true }` (no provider yet).
  - If set → currently logs the payload; clearly marked TODO for real sending. This keeps the recipient configurable from the admin UI without requiring a provider today.
- Sync code calls this function fire-and-forget after inserting the pending BOQ.

## UI changes

- **BoqList**: add a "Pending Verification" badge for rows with `verification_status = 'pending_verification'`. Show both rows when family has a pending revision.
- **BoqEditor**: if the open BOQ is `pending_verification`, show a banner ("Awaiting senior verification — link sent to <email>"), keep description editing locked.
- **RevisionsPanel**: render pending BOQ rows with the new badge and a "Copy verification link" button for admins.
- **Admin settings**: small card under existing admin pages letting admins set the verifier email (writes to `app_settings.boq_verifier`).
- **OrderEditor**: after save, surface a toast when a pending BOQ revision was created ("BOQ R4 prepared — awaiting senior verification").

## Files touched

- `supabase/migrations/<new>.sql` — new columns, RPC, settings seed.
- `supabase/functions/send-boq-verification/index.ts` — stub sender (configurable).
- `src/lib/revisions/index.ts` — branch in `syncBoqsAndPisForOrder` to insert pending revision; new helper `createPendingBoqRevision`.
- `src/lib/boq/types.ts` — extend `BoqRecord` with verification fields.
- `src/pages/boqs/BoqList.tsx`, `src/pages/boqs/BoqEditor.tsx`, `src/components/orders/RevisionsPanel.tsx` — surface pending state.
- `src/pages/boqs/BoqVerify.tsx` (new) + route in `src/App.tsx`.
- `src/pages/admin/AdminBoqSettings.tsx` (or extend existing admin tabs) — verifier email field.
- `src/pages/orders/OrderEditor.tsx` — toast when pending revision created.

## Out of scope (for now)
- Actual email provider wiring. Function is in place and recipient is configurable; switching to Lovable Email or another provider is a follow-up.
- Token expiry / single-use enforcement beyond status check (can add later).
