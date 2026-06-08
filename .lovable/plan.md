# Per-Item BOQ Attachments (Instructions for Design Team)

## Goal
Every BOQ line item gets its own file upload slot. The BOQ creator attaches instruction files (Excel / PDF / Word / images / common docs) per row. The Design team opens the BOQ review link and can view/download those files inline against each item. Existing per-item comments (already supported by the Design Review screen) remain unchanged.

No change to BOQ auto-create, calculations, approval workflow, verification, or any other existing feature.

## What the user will see

**BoqEditor (creator side):**
- Each item row in the items table gets a small "Attach" button (paperclip icon) plus a count badge of attached files.
- Clicking opens a popover listing existing files (with download link + remove button) and an "Upload file" input.
- Accepts: `.pdf .doc .docx .xls .xlsx .ppt .pptx .csv .txt .png .jpg .jpeg`.
- Uploads happen immediately on file pick; files persist even before the BOQ is re-saved.

**Design Review page (`/boqs/review/:token`):**
- The existing item row gets a new "Instructions" cell (or thin section under the row) listing the creator's attachments as clickable links that open via short-lived signed URLs (same pattern as the existing `DocLink` component used for reviewer uploads).
- No upload control on this side — view/download only. The existing per-column comment textareas and per-item Approved/Change buttons stay exactly as they are.

## Technical details

### Storage
- New private bucket **`boq-item-docs`** (created via storage tool).
- Path convention: `{boq_id}/{boq_item_id}/{uuid}.{ext}`.
- RLS on `storage.objects`:
  - `authenticated` can `INSERT`/`SELECT`/`DELETE` for this bucket (BOQ creators).
  - `anon` + `authenticated` get `SELECT` only when the parent BOQ has an open design-review token (enforced via the RPC returning signed URLs, not via direct anon storage access — anon never touches storage directly, links are signed server-side).

### Database (single migration)
New table `public.boq_item_attachments`:
- `id uuid pk`, `boq_id uuid → boqs(id) on delete cascade`, `boq_item_id text not null`, `file_name text`, `file_path text`, `mime_type text`, `size_bytes int`, `uploaded_by uuid → auth.users`, `created_at timestamptz`.
- Index on `(boq_id, boq_item_id)`.
- GRANTs: `SELECT, INSERT, DELETE` to `authenticated`; `ALL` to `service_role`.
- RLS:
  - authenticated users: full CRUD on rows where they can see the parent BOQ (mirror existing BOQ select policy — owner or admin).
  - no anon policy (anon access goes through SECURITY DEFINER RPC).

New RPC `public.get_boq_item_attachments_by_token(_token uuid)`:
- SECURITY DEFINER, returns rows joined via `boq_design_reviews.boq_id` where the review is still open (`status='sent' and expires_at > now()`).
- Mirrors existing `get_design_review_*_by_token` pattern.

New RPC `public.sign_boq_item_doc_by_token(_token uuid, _path text) returns text`:
- SECURITY DEFINER, validates that `_path` belongs to a row reachable from `_token`, then calls `storage.create_signed_url('boq-item-docs', _path, 600)` and returns the URL. (Alternative: have the client call `supabase.storage.from(...).createSignedUrl` directly — but reviewers are anonymous and won't have storage permission, so the RPC route is required.)

### Frontend

`src/components/boqs/BoqItemAttachments.tsx` (new):
- Popover with file list + upload input. Used in `BoqEditor` item rows.
- Uses `supabase.storage.from('boq-item-docs').upload(...)` then inserts a row into `boq_item_attachments`.
- Loads existing attachments per item on open.

`src/pages/boqs/BoqEditor.tsx`:
- Add a new compact column (or trailing cell) per item that renders `<BoqItemAttachments boqId={boqId} itemId={it.id} />`. No other column / layout / save logic touched.

`src/pages/boqs/DesignReview.tsx`:
- After `fetchReviewItemsByToken`, also call new helper `fetchCreatorAttachmentsByToken(token)` → `Record<boq_item_id, Attachment[]>`.
- Render a small "Instructions from Sales" line above the existing Comment row when attachments exist, using anchors that resolve via `sign_boq_item_doc_by_token`.

`src/lib/boq/designReview.ts`:
- Add `fetchCreatorAttachmentsByToken` and `signCreatorDocByToken` helpers wrapping the two new RPCs.

### Out of scope (explicit)
- BOQ PDF / Excel exports — unchanged.
- Distribution PDF — unchanged.
- Approval workflow, verification, revisions, design_review_status transitions — unchanged.
- Comments storage — already handled by existing per-column comment system; no change.
- Editing/removing attachments from the reviewer side — view-only by design.

## Verification
1. Create / open a BOQ → each item row shows the new Attach button.
2. Upload a PDF + an XLSX against item 1 → both appear in the popover with download + remove.
3. Send a Design Comment/Approval link → open the public review page → item 1 shows both files as clickable links that download via signed URL; other items show no attachments section.
4. Existing flows (save BOQ, send for verification, finalize, generate PDF, design approval) all behave exactly as before.
