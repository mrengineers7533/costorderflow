# Add Invoice Upload to GRN Screen

Scope: Only `src/pages/grn/GrnList.tsx`. No changes to Purchase/PO/GRN status logic, Gate Entry logic, calculations, approvals, notifications, or numbering.

## UI changes (GrnList.tsx)

- Add a new column header **"Invoice"** immediately after the **Gate Entry** column (before **Status**).
- Per row rendering:
  - If Gate Entry is **not** done → render a disabled hint ("Do Gate Entry first").
  - If Gate Entry done and no invoice exists → **Upload Invoice** button (opens hidden file picker; accepts `.pdf,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.doc,.docx`).
  - If invoice exists → show file name (truncated), uploaded by (email/name), uploaded date/time, and two buttons: **View** (opens signed URL in new tab) and **Download**. Also a small "Replace" link to re-upload.
- Uploading updates local state so it stays visible without reload; also reloaded via existing `load()` join on next mount.

## Storage

- New Supabase Storage bucket: `grn-invoices` (private).
- Path convention: `${po_id}/${po_row_id}/${timestamp}-${sanitized_filename}`.
- Read via short-lived signed URL (60s) for View/Download.
- RLS: authenticated users can `SELECT`, `INSERT` in this bucket; `UPDATE`/`DELETE` restricted to owner (`owner = auth.uid()`).

## Database

Extend the existing `grn_receipts` row for the same PO line (no new table, keeps GRN logic intact). Add nullable columns:

- `invoice_path text` — storage object path
- `invoice_file_name text`
- `invoice_mime text`
- `invoice_size bigint`
- `invoice_uploaded_by uuid` (references `auth.users` via profile lookup already used on this page)
- `invoice_uploaded_at timestamptz`

Migration also creates the storage bucket + policies. No changes to existing columns, triggers, or status logic. The `computeStatus`/`computeDelay` helpers are untouched — invoice fields are ignored by status.

## Data flow

- Upload: `supabase.storage.from('grn-invoices').upload(path, file)` → then `upsertInvoice(j, {...invoice fields})` which writes only the new invoice_* columns via a dedicated `updateInvoiceFields` helper (does NOT call the existing `upsertGrn` that recomputes status). If the GRN row doesn't exist yet (edge case: Gate Entry must exist so it will), we insert with only invoice fields + identifiers.
- View: create signed URL, `window.open(url, '_blank')`.
- Download: create signed URL, trigger anchor click with `download` attribute.
- Uploader display: reuse existing `profiles` map already loaded; extend the profile fetch to also include invoice uploader IDs.

## Files changed

- `src/pages/grn/GrnList.tsx` — new column, upload handler, view/download handlers, uploader profile fetch extension.
- New migration — adds 6 columns to `grn_receipts`, creates `grn-invoices` bucket + RLS policies.

## Verification

- Upload PDF on a Gate-Entry-done row → row shows file name, uploader, timestamp, View + Download buttons.
- Reload page → invoice still visible.
- Row without Gate Entry → shows hint, no upload button.
- Existing Status/Delay/Received Qty/Gate Entry unchanged before and after upload.
- Other modules (Purchase, PO, BOQ, Manufacturing) untouched — no imports added elsewhere.
