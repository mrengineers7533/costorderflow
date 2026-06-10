## Direct Requisition Upload — Requisitions Page

Add a new "Upload Requisition" action next to the existing "Add Requisition to Project" button. It opens a dialog where the user picks the source (Project CS # **or** OA + BOQ revision), enters minimal metadata, and uploads a file. The result is a real `requisitions` row that behaves identically to a generated one in every existing flow (view, edit, delete, send to purchase, plan, annexure, PO).

No changes to existing columns, filters, actions, status, generation from Cost Sheet / Manufacturing Model, or any other page.

### User flow

1. Click **Upload Requisition** on `/requisitions`.
2. Dialog with three steps stacked in one form:
   - **Link to project (required — pick one)**
     - Option A: Project Cost Sheet Number (typeahead over existing `cost_sheet_number` values on `orders`)
     - Option B: OA + BOQ revision (existing OA picker → approved BOQ revision dropdown, exactly as the existing "Add Requisition to Project" path resolves)
   - **Metadata**
     - Client name — free text (prefilled if a BOQ/OA was picked; editable)
     - Notes / remarks — free text (optional)
   - **File** — upload one file (PDF or .xlsx/.xls, max 20 MB)
3. Submit → upload file → create requisition row → toast → list refreshes; user can immediately View / Download / Copy Link / Send to Purchase / select & Plan, etc.

### Behavior rules

- **Project CS # path:** resolve the project's root order(s) → pick the latest approved BOQ under that project (same logic already in `AddRequisitionToProjectButton.onPicked`) and use that BOQ to satisfy the existing `order_root_id` + `boq_id` + `boq_revision` schema. Project CS # automatically appears in the new "Project CS #" column for the uploaded row.
- **OA/BOQ path:** uploaded requisition is linked to the exact chosen OA + BOQ revision; Project CS # column shows that order's `cost_sheet_number` if set, otherwise "—".
- **Requisition #** auto-generated via existing `next_requisition_number` RPC — same numbering scheme as system-generated requisitions.
- **Status** defaults to `issued` (same as generated requisitions) so Send-to-Purchase, Plan, Annexure all work unchanged.
- **No line items / no raw materials** are created from the upload — the file is the source of truth. Existing pages that read `requisition_items` / `requisition_raw_materials` already render empty tables gracefully; the uploaded PDF/Excel is shown/downloadable from the detail page via the new `pdf_path`.
- If neither Project CS # nor OA/BOQ is selected, the dialog blocks submission (validation), per the answered requirement.

### Technical scope

**Storage**
- New private bucket `requisition-uploads` (created via `supabase--storage_create_bucket`).
- RLS on `storage.objects`: authenticated users can `insert`/`select`/`delete` objects in this bucket whose path starts with their `auth.uid()`. Path convention: `{user_id}/{requisition_id}/{filename}`.

**Schema** (single migration)
- Add `requisitions.upload_file_path text null` (separate from existing `pdf_path` so generated PDFs and uploaded source files don't collide).
- Add `requisitions.upload_file_name text null` and `requisitions.upload_mime_type text null` for display.
- Add `requisitions.client_name_override text null` to capture the client name typed in the upload dialog when it differs from the linked BOQ; existing list code falls back to `boqs.client_name` exactly as today (no regression).
- Add `requisitions.source text not null default 'generated'` with check constraint `source in ('generated','uploaded')`. Existing rows default to `'generated'`.
- No changes to existing columns, RLS, or triggers.

**Frontend**
- `src/pages/requisitions/RequisitionsList.tsx`: add an `UploadRequisitionButton` component next to `AddRequisitionToProjectButton`. New dialog component handles both linking modes, metadata, and upload.
- Submission flow (client-side):
  1. Resolve `{ order_root_id, boq_id, boq_revision }` from the chosen Project CS # or OA/BOQ.
  2. Call `next_requisition_number` RPC to reserve a requisition number.
  3. `insert` requisition row with `source='uploaded'`, `status='issued'`, `client_name_override`, `notes`, `family_token` (reuse existing token for the root via the same query the edge function uses; create one if missing).
  4. Upload file to `requisition-uploads/{user_id}/{new_req_id}/{safe_filename}`.
  5. Update the row with `upload_file_path`, `upload_file_name`, `upload_mime_type`.
  6. Refresh list; navigate to detail (optional).
- `RequisitionsList.tsx` rendering:
  - "Client" column already falls back through `boqs[r.boq_id]?.client_name`; extend it to prefer `r.client_name_override` when present. No other column changes.
  - Existing badge/status/actions render unchanged.
- `RequisitionDetail.tsx`: when `upload_file_path` is set, show a small "Uploaded source file" card at the top with filename + Download button (signed URL via `storage.from('requisition-uploads').createSignedUrl`). All existing sections stay.

**Out of scope / unchanged**
- `CreateRequisitionDialog`, `create-requisition` edge function, manufacturing flow, BOQ/OA generation, Annexure/PO/Plan logic, requisition PDF generator, all other pages.

### Files to add / change

- Migration: add columns on `requisitions` + create bucket via storage tool + storage RLS policies.
- `src/pages/requisitions/RequisitionsList.tsx` — add Upload button + dialog; small client-name fallback tweak.
- `src/pages/requisitions/RequisitionDetail.tsx` — show uploaded file when present.
- `src/lib/requisition/types.ts` — extend `RequisitionRecord` with the new optional fields and `source`.
