
# BOQ Design Review & Approval Workflow

Adds a complete "Send to Design → review via secure link → response back into app" loop on top of the existing BOQ system. **No existing BOQ field, calculation, RLS policy, or screen logic is changed** — everything lives in new tables, new components, and a new edge function.

---

## 1. Database (new tables only)

```text
boq_design_reviews              one row per review round
  id, boq_id, round_no, status,
  sent_by, sent_at, sent_message,
  recipients text[], expires_at,
  submitted_at, submitted_by_email,
  overall_outcome (approved | changes_required | partial),
  token uuid unique              -- secure link
  created_at, updated_at

boq_design_review_items         one row per BOQ line item per round
  id, review_id, boq_item_id,
  decision (pending | approved | change_required),
  comment, design_change_note,
  decided_at

boq_design_review_documents     attachments (both directions)
  id, review_id, boq_item_id NULL,
  source (sender | reviewer),
  file_name, file_path, uploaded_by_email,
  created_at

boq_design_review_email_log     outgoing email audit
  id, review_id, to_email, subject,
  gmail_message_id, status, error, created_at
```

New BOQ-level field added via migration:
- `boqs.design_review_status text` — one of: `draft`, `sent_to_design`, `under_review`, `review_received`, `approved_by_design`, `changes_required`, `re_sent`. Defaults to `draft`. **Does not affect existing `status` / `verification_status` columns.**

New storage bucket: `design-review-docs` (private), with RLS:
- Owner of the BOQ + admins: full access.
- Anonymous via valid `token` query (download only) handled through signed URLs generated server-side.

RLS on new tables:
- Owner of the parent BOQ + admins → full CRUD.
- Anonymous + authenticated → SELECT/INSERT only when matching an unexpired `token` (mirrors existing `boqs_select_by_token` pattern).
- A `submit_design_review_with_token(_token, _email, _items, _docs)` SECURITY DEFINER RPC writes the reviewer decisions and flips statuses, identical pattern to `verify_boq_items_with_token`.

---

## 2. Edge function: `send-design-review`

New function (separate from existing `send-boq-verification`, which is untouched).

- Input: `{ review_id }`.
- Loads review + BOQ + recipients + attachments.
- Sends email through the **Gmail connector** (`pc.2@mrengineers.com`) via `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send`.
  - From: `pc.2@mrengineers.com` (the connected account).
  - To: review recipients.
  - Cc: `pc.2@mrengineers.com` (so replies thread back).
  - Reply-To: `pc.2@mrengineers.com`.
  - Subject: `BOQ {boq_number} — Design Review (Round {n}) — {client_name}`.
  - Body: BOQ number, project number, client name, sender's optional message, secure link `https://<app>/design-review/{token}`, expiry date.
  - Attachments: signed-URL links to bucket files (kept lightweight; avoids 25 MB MIME limits).
- On submit (separate trigger from the read-only page), sends a "Review submitted" notification email to `pc.2@mrengineers.com` with summary + link back to the BOQ.
- Logs every send to `boq_design_review_email_log`.
- `verify_jwt = false` block added in `supabase/config.toml`.

If the Gmail connection is missing the `gmail.send` scope, the function returns a structured error and the UI surfaces a "Reconnect Gmail" message (no automatic reconnect inside the function).

---

## 3. Frontend

### a) BOQ editor — additive UI only
`src/pages/boqs/BoqEditor.tsx` gets:
- A new **"Send to Design"** button in the header (next to existing actions).
- A new **right-side collapsible "Design Review" panel** (new component `DesignReviewPanel.tsx`) showing rounds, statuses, item decisions, comments, attachments, timestamps, reviewer email — latest round highlighted. Older rounds are collapsible history.
- No edits to existing form fields, line items, calc, save/load logic.

### b) New components
- `src/components/boqs/SendToDesignDialog.tsx` — modal: multi-email input (chips with validation), optional message, document upload to `design-review-docs`, expiry days selector. On submit: insert `boq_design_reviews` row + items snapshot + docs, then invoke `send-design-review`, then update `boqs.design_review_status` to `sent_to_design` (or `re_sent` for round > 1).
- `src/components/boqs/DesignReviewPanel.tsx` — side panel described above, with badges (Approved / Change Required / Pending), per-item comment cards, document download links (signed URLs).

### c) New public page
- Route: `/design-review/:token` in `App.tsx` (outside `AuthGate`, like `/boq-verify/:token`).
- File: `src/pages/boqs/DesignReview.tsx`.
- Loads BOQ + review by token via the anon-readable RLS policy.
- Renders BOQ header + items strictly **read-only** (no inputs bound to BOQ fields).
- Per item: Approve / Design Change Required toggle, comment textarea, "what changed / what update is required" textarea, optional file upload.
- Reviewer email field (required) + "Submit Review" button → calls `submit_design_review_with_token` RPC.
- After submit: shows confirmation; link becomes inert (token nulled / status flipped to `review_received`); triggers the notification email to `pc.2@mrengineers.com`.

### d) Status badges
A small helper maps the seven design-review statuses to badge variants (color-coded) used in both the editor header and the BOQ list.

---

## 4. Security

- Token is `uuid` (gen_random_uuid), stored on the review row, included only in the email link.
- RLS on `boq_design_reviews` allows anonymous SELECT only when `token` matches and `expires_at > now()` and `status != 'submitted'`.
- All writes from the public page go through the SECURITY DEFINER RPC, which re-validates the token and expiry server-side.
- Documents served via short-lived signed URLs (no public bucket).
- Configurable expiry (default 7 days, set in the dialog).

---

## 5. What is explicitly NOT touched

- `proforma_invoices`, `orders`, `client_copies`, all PDF/Excel generators.
- Existing BOQ verification flow (`boqs.verification_*`, `verify_boq_items_with_token`, `BoqVerify.tsx`, `send-boq-verification`).
- Existing BOQ line-item shape, calc, terms, BOQ-number derivation.
- Existing RLS policies on `boqs`.

---

## 6. Order of operations on approval

1. Migration: new tables + RLS + RPC + storage bucket + `boqs.design_review_status` column.
2. Link Gmail connector (`pc.2@mrengineers.com`) with `gmail.send` scope.
3. Edge function `send-design-review` + config block.
4. Frontend: dialog, side panel, public review page, route, status badges, "Send to Design" button.
5. Smoke test: send → open link in incognito → submit → see panel update + notification email.

After approval I will run the migration first (single call), then implement everything else in the same loop.
