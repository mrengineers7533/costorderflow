# BOQ Design Review & Approval Workflow — Email via Lovable Emails

Switching email transport from the Gmail connector to **Lovable Emails** (built-in, uses the default Lovable sender domain — no DNS or external account needed). Everything else in the previously approved plan stays the same.

---

## What changes vs. the prior plan

Only the email transport. No changes to DB schema, RLS, RPC, frontend, or the public review page design.

### Edge function `send-design-review`
- Sends through Lovable Emails infrastructure (default Lovable sender domain, e.g. `notifications@<lovable-default-domain>`).
- **From name:** `MR Engineers BOQ`
- **Reply-To:** `pc.2@mrengineers.com` (so any reply from the design team lands in that inbox)
- **To:** the recipient emails entered in the "Send to Design" dialog
- **Cc:** `pc.2@mrengineers.com`
- **Subject:** `BOQ {boq_number} — Design Review (Round {n}) — {client_name}`
- **Body (HTML):** BOQ number, project number, client name, sender's optional message, secure review link `https://<app>/design-review/{token}`, expiry date, and signed-URL links for any uploaded documents.
- A second email (review-submitted notification) goes to `pc.2@mrengineers.com` after the design team submits.
- Every send logged to `boq_design_review_email_log` (status, provider message id, error).
- `verify_jwt = false` block added to `supabase/config.toml` for this function.

### Setup steps before sending
1. Run the migration from the previously approved plan (new tables, RLS, RPC, `boqs.design_review_status` column, `design-review-docs` bucket).
2. Provision Lovable Emails infrastructure (queue tables, send log, suppression list, process-queue function, cron) using the built-in email setup — no custom domain required, the default Lovable sender domain is used.
3. Scaffold the transactional email function for design-review sends.
4. Build the frontend pieces (Send to Design dialog, Design Review side panel, public `/design-review/:token` page, status badges, header button) — exactly as in the previously approved plan.

### Trade-offs of using the default Lovable domain
- Emails will be **From** a Lovable-owned domain, not `mrengineers.com`. Replies still go to `pc.2@mrengineers.com` via Reply-To.
- Some recipients' spam filters may be stricter for an unfamiliar sender domain. If that becomes an issue, a custom domain can be verified later in Lovable Cloud → Email and the function will pick it up automatically with no code change.

---

## What stays exactly as previously approved
- New tables: `boq_design_reviews`, `boq_design_review_items`, `boq_design_review_documents`, `boq_design_review_email_log`.
- New column `boqs.design_review_status` (additive, does not touch existing `status` / `verification_status`).
- Storage bucket `design-review-docs` (private, signed URLs).
- RLS + SECURITY DEFINER `submit_design_review_with_token` RPC.
- Frontend: `SendToDesignDialog`, `DesignReviewPanel`, `DesignReview` public page, route in `App.tsx`, "Send to Design" header button.
- No edits to existing BOQ form, calc, line items, verification flow, PDF/Excel, or any other module.

---

## Order of operations on approval
1. Run migration (single call).
2. Provision Lovable Emails infra + scaffold the design-review transactional function.
3. Build frontend (dialog, panel, public page, route, badges, button).
4. Smoke test: create review → email arrives from Lovable default domain → open link in incognito → submit decisions → notification email lands in `pc.2@mrengineers.com` → side panel shows the round.
