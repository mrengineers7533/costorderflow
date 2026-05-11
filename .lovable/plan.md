## Goal

Add an admin-only "Reset Cost Order Flow Data" action that wipes all generated transactional data (OAs, BOQs, PIs, client copies, cost sheets, revisions, and their linked storage files) while leaving app settings, templates, master data, formulas, numbering counters logic, users, and UI completely untouched.

## Where it lives

New section in **Admin Dashboard** (`src/pages/admin/AdminDashboard.tsx`) called **"Danger Zone — Reset Generated Data"**, gated by `RequireAdmin`. Single red button → `AlertDialog` confirmation with the exact message the user specified, plus a typed confirmation ("DELETE") to prevent accidental clicks.

## What gets deleted

Database tables (data only, schema preserved):
- `client_copies`
- `proforma_invoice_documents`
- `proforma_invoices`
- `boqs`
- `orders`
- `cost_sheets`

Storage buckets (all objects):
- `cost-sheets`
- `oa-documents`
- `boq-documents`
- `pi-documents`

## What is preserved (explicitly untouched)

- `app_settings`, `order_templates`, `allowed_domains`
- `profiles`, `user_roles`, `auth.users`
- `oa_counters`, `pi_counters` (numbering settings stay; if user wants counters reset too, that's a follow-up — confirming below)
- `order-templates` storage bucket
- All calculation code in `src/lib/**` (clientCopy, calc, pdf, excel, etc.)
- All UI, routes, and workflow

## Implementation

1. **New edge function** `supabase/functions/admin-reset-cof-data/index.ts`:
   - Verifies caller via JWT → looks up `user_roles` with service-role key → requires `admin`.
   - Lists and removes all objects in the four buckets (`storage.from(bucket).list()` recursively, then `.remove(paths)`).
   - Deletes rows from the six tables in FK-safe order (children first).
   - Returns counts: `{ orders: N, boqs: N, pis: N, clientCopies: N, costSheets: N, piDocs: N, filesRemoved: N }`.
   - `verify_jwt = true` (default).

2. **Admin UI** (`AdminDashboard.tsx`):
   - New `Card` "Danger Zone" with destructive border.
   - Button "Reset Generated Data" → opens `AlertDialog`.
   - Dialog body shows the exact required message.
   - Input field requiring user to type `DELETE` before the confirm button enables.
   - On confirm: `supabase.functions.invoke('admin-reset-cof-data')`, show toast with returned counts, then no navigation change.

3. **No DB migration needed** — pure data delete via edge function with service role.

## Technical notes

- Storage purge loops through `list({ limit: 1000 })` until empty (Supabase storage paginates).
- Table deletes use `delete().neq('id', '00000000-0000-0000-0000-000000000000')` to satisfy PostgREST's "no filter" guard.
- Function returns 403 if the caller isn't admin.
- No changes to `src/lib/**`, `src/integrations/supabase/**`, or any editor pages.

## One open question

The OA/PI numbering counters (`oa_counters`, `pi_counters`) determine whether the next new OA after cleanup is `…/0001` or continues from where you left off (e.g. `…/0042`). The user said "numbering settings must remain unchanged" — I'll interpret that as **keep counters as-is** (next OA continues incrementing) unless they say otherwise. If they want truly "fresh from 0001", we can add a checkbox in the dialog later.
