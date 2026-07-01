## Goal
Make item-wise BOQ attachments (already saved in `boq_item_attachments`) visible with their item everywhere the item appears — read-only outside the BOQ editor / Design review panel where upload already exists. No changes to any calculation, approval, notification, or workflow logic.

## Current state (verified)

- Table `public.boq_item_attachments` already stores files per `(boq_id, boq_item_id)` with `file_name`, `file_path`, `mime_type`, `size_bytes`, `uploaded_by`, `created_at`.
- Upload UI (`BoqItemAttachments` popover) is mounted only in `BoqEditor` and `DesignReviewPanel` — that stays as the single write surface.
- Line-item IDs change on each BOQ revision, but the existing revision layer already matches items by signature `description|model_number` (`boqSig` in `src/lib/revisions/index.ts`). Attachment lookup must use the same signature to follow the item across revisions.
- Line items are rendered item-wise in: Design BOQ view, Approved BOQ module, Manufacturing detail, Purchase detail, Requisition detail, Annexure folder (row detail), BOQ Folder (opens BoqEditor — already covered), Family/Final BOQ pages.

## What to build

1. **New helper** `src/lib/boq/itemAttachments.ts`
   - `fetchItemAttachments(boqId, items[])` → `Map<itemId, Attachment[]>`.
   - Loads all rows for `boqId`. For each current item, includes:
     - direct matches on `boq_item_id`, plus
     - inherited matches from earlier revisions in the same BOQ family (walking `revised_from_id`) where the ancestor item shares the same `description|model_number` signature.
   - Returns file metadata + a helper `getSignedUrl(path)` using existing `boq-item-docs` storage bucket (already used by the uploader).
   - Read-only; never writes.

2. **New read-only component** `src/components/boqs/BoqItemAttachmentsView.tsx`
   - Small paperclip button + count badge (matches existing look).
   - Popover lists files with name, type, size, uploaded-by (resolved from `profiles`), uploaded date/time.
   - "View / Download" opens a signed URL (10-min TTL) via existing `boq-item-docs` bucket.
   - No upload / delete controls.

3. **Mount the read-only view** (icon in the row, no new logic):
   - `src/pages/design/DesignBoqView.tsx` — items table row.
   - `src/pages/modules/ApprovedBoqModule.tsx` — items table row.
   - `src/pages/manufacturing/ManufacturingDetail.tsx` — items row.
   - `src/pages/purchase/PurchaseDetail.tsx` — items row.
   - `src/pages/requisitions/RequisitionDetail.tsx` — BOQ items row.
   - `src/pages/requisitions/AnnexureFolder.tsx` — row detail.
   - `src/pages/boqs/FamilyBoq.tsx` and `FinalBoq.tsx` — items row.
   - BOQ Folder card list unchanged (header-level list, no items on that screen); opening a BOQ from there already shows attachments via `BoqEditor`.

4. **Revision-safe resolution**
   - Reuse `boqSig` normalization from `src/lib/revisions/index.ts` (export it if not already exported).
   - Ancestor walk: query `boqs` for `id, revised_from_id, line_items` up the chain from current BOQ; collect ancestor `boq_item_id`s that share the signature; union attachments.

## Explicitly out of scope (unchanged)

- No changes to approval, Design review, Manufacturing, Purchase, Requisition, Annexure, OA, PI, notifications, costing, GST, totals, quantity/rate/amount, numbering, revision numbering, Save Draft, Finalize, Convert to PI, access rules, or any workflow.
- No changes to the upload path, storage bucket, or `boq_item_attachments` schema/RLS.
- No new columns in DB. No migration.

## Files to change / add

- Add: `src/lib/boq/itemAttachments.ts`
- Add: `src/components/boqs/BoqItemAttachmentsView.tsx`
- Edit (single new icon cell per row, no other changes):
  - `src/pages/design/DesignBoqView.tsx`
  - `src/pages/modules/ApprovedBoqModule.tsx`
  - `src/pages/manufacturing/ManufacturingDetail.tsx`
  - `src/pages/purchase/PurchaseDetail.tsx`
  - `src/pages/requisitions/RequisitionDetail.tsx`
  - `src/pages/requisitions/AnnexureFolder.tsx`
  - `src/pages/boqs/FamilyBoq.tsx`
  - `src/pages/boqs/FinalBoq.tsx`
- Add test: `src/test/itemAttachmentsVisibility.test.ts` — verifies signature-based resolution across a revision chain and that the helper never writes.

## Verification

- Upload PDF to item A and XLSX to item B in the BOQ editor, then open each linked module and confirm the paperclip badge + list appears on the correct row.
- Revise the BOQ; confirm the same attachments follow the same item (matched by description+model).
- Confirm quantity/rate/amount/GST/totals/numbering/approval badges are byte-identical before/after (screenshot diff of the items table).
- Vitest suite passes; no edits to approval, revision, notification, or workflow modules.