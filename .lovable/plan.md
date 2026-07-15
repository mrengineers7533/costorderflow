## Goal

Make the existing **Admin → Danger Zone → Reset Generated Data** action a safe, dependency-ordered, transactional wipe of all Cost-Sheet-linked generated data. Preserve every user, role, permission, domain, master data row, template, setting, formula, numbering config, notification/email system, and UI/workflow.

The immediate 500 (`permission denied for function admin_reset_generated_data`) was already unblocked by granting `EXECUTE` on the function to `authenticated`. This plan builds the requested robustness on top of that so the feature is production-safe.

## What changes

### 1. Database: rewrite `public.admin_reset_generated_data()` (SECURITY DEFINER)

Single transaction, admin-only, advisory-locked, dependency-ordered delete over the full generated-data graph. No `TRUNCATE`, no RLS disable, no config/master tables touched.

Delete order (children → parents):

```text
app_notification_reads
app_notifications                (only rows referencing deleted docs — see below)
activity_event_reads
activity_events                  (only rows referencing deleted docs)
email_notification_log           (rows with notification_id in deleted set OR NULL test rows kept)
order_revision_notifications
grn_receipts
purchase_order_sends
purchase_order_audit
purchase_order_rows
purchase_orders
requisition_annexure_rows
requisition_annexures
requisition_distribution_log
requisition_raw_materials
requisition_items
requisition_lots
requisitions
boq_design_review_documents
boq_design_review_items
boq_design_review_email_log
boq_design_reviews
boq_design_comments
boq_item_design_status
boq_item_attachments
boq_distribution_log
boq_family_share_tokens
boq_remarks_audit_log
boq_revision_approval_snapshots
boq_revisions
boqs
client_copies
proforma_invoice_documents
proforma_invoices
orders
cost_sheets
document_access                  (rows for deleted doc ids)
```

Notification/email cleanup rule: delete `app_notifications` (and their `app_notification_reads` + `email_notification_log` rows) where the notification references any deleted document id (`entity_id` in the deleted set, or `entity_type` in the transactional set). Never delete `notification_recipients`, `email_notification_config`, `email_sender_audit`, `email_domain*`, cron rows, or edge functions.

Counter reset stays as-is (`oa_counters`, `pi_counters`, `po_counters`, `requisition_counters`, `general_requisition_counters` → `last_number = 0`).

Preserved (untouched): `profiles`, `user_roles`, `user_module_access`, `allowed_domains`, `app_settings`, `purchase_settings`, `vendors`, `fg_raw_material_map`, `rm_master_uploads`, `order_templates`, `notification_recipients`, `email_notification_config`, `email_sender_audit`, `email_notification_log` test rows (where `notification_id IS NULL`), all `*_counters` schemas, admin_audit_log historical rows, login_activity, credit_removal_attempts.

Safety wrappers inside the function:
- `PERFORM pg_advisory_xact_lock(hashtext('admin_reset_generated_data'))` to serialize concurrent resets.
- Explicit admin check: `has_role(auth.uid(),'admin')` else `RAISE EXCEPTION` with `42501`.
- All deletes run inside the implicit function transaction; any failure raises and rolls back the whole thing.
- Return `jsonb` counts per table.

### 2. Database: add `public.admin_reset_preview()` (SECURITY DEFINER, admin-only)

Read-only. Returns the same per-table row-count map the reset would delete, using the same WHERE clauses. Used by the confirmation dialog to show preview counts. No writes.

### 3. Database: reset audit table

New table `public.admin_reset_audit` (admin-visible only):

```text
id, execution_id (uuid), actor (uuid), status ('started'|'completed'|'failed'),
started_at, completed_at, counts (jsonb), error (text), files_removed (int)
```

Standard `GRANT SELECT` to `authenticated` gated by admin RLS; `service_role` full. Written by the edge function (start row on entry, update to completed/failed on exit). No secrets stored.

### 4. Edge function `admin-reset-cof-data`

Keep existing shape. Changes:
- Insert an `admin_reset_audit` row with `status='started'` before calling the RPC; update to `completed` with counts + `filesRemoved`, or `failed` with error, at the end.
- Continue to purge the seven storage buckets (`cost-sheets`, `oa-documents`, `boq-documents`, `pi-documents`, `design-review-docs`, `boq-item-docs`, `requisition-uploads`) after the SQL transaction commits. Bucket purge failures are logged into the audit row but do not roll back the SQL (files without DB rows are harmless orphans and can be re-purged).
- New action `preview` (same function, `{ mode: 'preview' }` body): calls `admin_reset_preview()` RPC and returns counts without deleting or touching storage.

### 5. Frontend `AdminDashboard.tsx`

- Add a two-step confirmation flow:
  1. Click **Reset Generated Data** → call edge function in `preview` mode, show counts table inside the dialog (Cost Sheets, OAs, BOQs, PIs, Requisitions, Annexures, POs, GRNs, Notifications, Attachments, etc.).
  2. Require typing `RESET GENERATED DATA` **and** a second explicit button labeled **Permanently Reset Generated Data** to actually run the destructive call.
- On success, show per-module deleted counts + files removed, and refresh the four dashboard stat queries.
- Errors surface the audit `execution_id` for traceability.

### 6. Not changed

No changes to: RLS policies on preserved tables, notification/email trigger `notify_send_notification_email`, cron jobs, edge functions other than `admin-reset-cof-data`, sender email config, formulas, calculations, PDF pipeline, numbering formats, UI outside the Danger Zone card, or module access logic.

## Technical notes

- All DDL and function rewrites ship in one migration; grants: `GRANT EXECUTE ON FUNCTION public.admin_reset_generated_data(), public.admin_reset_preview() TO authenticated` (function still self-checks `has_role`).
- `admin_reset_audit` gets the required 4-step block: CREATE TABLE → GRANT (`SELECT` to `authenticated`, `ALL` to `service_role`) → `ENABLE ROW LEVEL SECURITY` → policy `has_role(auth.uid(),'admin')` for SELECT; INSERT/UPDATE only via `service_role` (edge function).
- Advisory lock ensures two admins clicking simultaneously don't race.
- Post-reset the client re-runs the same stat queries already in `AdminDashboard`; module lists rely on realtime + normal refetch and need no special hook.

## Out of scope

- Rebuilding master data / test fixtures.
- Any change to the working notification/email pipeline behavior.
- Adding a UI to view the reset audit history (data is captured; a viewer can be added later if requested).
