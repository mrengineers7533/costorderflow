## Goal

Expand the existing **Danger Zone — Reset Generated Data** action so it also wipes Purchase Requisition (PR) and Purchase Order (PO) transactional data, plus related logs, attachments, counters and activity, while leaving masters/settings untouched. Make the cleanup centralized so future modules (GRN, invoice, payment, etc.) can be added in one place.

## Scope

- **Edge function:** `supabase/functions/admin-reset-cof-data/index.ts` — extend table list, bucket list, and run deletes in a single SQL transaction via a new SECURITY DEFINER RPC.
- **New DB function (migration):** `public.admin_reset_generated_data()` — does all deletes in one transaction, resets counters, returns per-table counts. Admin-only.
- **Admin UI:** `src/pages/admin/AdminDashboard.tsx` — update copy, change confirm phrase to `RESET GENERATED DATA`, show new success message, list expanded scope.
- **Audit log:** insert a row into `purchase_order_audit` is PO-scoped, so add a tiny `admin_audit_log` table (or reuse `activity_events`) — see Technical notes.

## What gets deleted (children → parents)

Transactional (deleted):
- Activity / notifications: `activity_event_reads`, `activity_events`, `order_revision_notifications`
- Purchase Orders: `purchase_order_sends`, `purchase_order_audit`, `purchase_order_rows`, `purchase_orders`
- Requisitions: `requisition_annexure_rows`, `requisition_annexures`, `requisition_distribution_log`, `requisition_raw_materials`, `requisition_items`, `requisition_lots`, `requisitions`
- BOQ ecosystem: `boq_design_review_documents`, `boq_design_review_items`, `boq_design_review_email_log`, `boq_design_reviews`, `boq_distribution_log`, `boq_family_share_tokens`, `boq_item_attachments`, `boq_remarks_audit_log`, `boq_revisions`, `boqs`
- Orders & PI: `client_copies`, `proforma_invoice_documents`, `proforma_invoices`, `orders`
- Cost sheets: `cost_sheets`
- Counters reset to 0: `oa_counters`, `pi_counters`, `po_counters`, `requisition_counters`

Storage buckets purged: `cost-sheets`, `oa-documents`, `boq-documents`, `pi-documents`, `design-review-docs`, `boq-item-docs`, `requisition-uploads`.

Preserved (untouched):
- Masters: `vendors`, `fg_raw_material_map`, `rm_master_uploads`, `order_templates`
- Settings: `app_settings`, `purchase_settings`, `notification_recipients`, `allowed_domains`
- Identity: `profiles`, `user_roles`, `user_module_access`, `login_activity`, `credit_removal_attempts`

## Technical notes

1. **New migration** creates `public.admin_reset_generated_data()` SECURITY DEFINER, restricted via `has_role(auth.uid(),'admin')`. It performs all `DELETE`s in order inside one implicit transaction (function body = transactional), then `UPDATE` on counter tables to set `last_number = 0`. Returns `jsonb` with per-table counts.
2. The single RPC is the **central reset list** — adding a future module (GRN/invoice/payment) means adding a `DELETE` line here, nothing in the edge function changes.
3. Edge function: replace the inline `TABLES_IN_ORDER` loop with one call to the RPC, then purge the (now expanded) bucket list. Bucket list stays in the edge function because RPC can't touch Storage.
4. **Audit log:** add an `admin_audit_log` table in the same migration (`actor uuid`, `action text`, `details jsonb`, `created_at`). RLS: insert via the function (security definer); select restricted to admins. Function writes one row with the counts.
5. **UI changes** in `AdminDashboard.tsx`:
   - Update card description text to the expanded scope above.
   - Confirmation input must equal `RESET GENERATED DATA` (case-sensitive) to enable the destructive button.
   - On success, toast: `Generated data reset successfully. Master data and settings were not changed.` plus the counts summary.
6. **No client-side refetch breakage:** dashboard stat cards already re-render on mount; tell users to refresh; no extra cache to invalidate (no react-query global cache for these counts).

## Out of scope

- No changes to masters, settings, formulas, templates, users, roles, permissions, or numbering configuration tables.
- No changes to PO/PR creation flows or other modules.
- No new modules added; just the centralized hook to plug them in later.

## Verification

- Run reset on a populated project → all listed tables empty, counters back to 0, buckets empty, masters/settings intact.
- Create a fresh OA/BOQ/PI/PR/PO afterward — numbering restarts cleanly, no FK errors, dashboard stats reload, no console errors.
- Non-admin call to the RPC or edge function → `Forbidden`.
- Cancel dialog without typing the exact phrase → action button stays disabled.
