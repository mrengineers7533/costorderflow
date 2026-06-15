## Goal

Rework the internal Design BOQ review (`/design/:id`) so comments auto-save, a single Post Submit at the bottom transitions the BOQ to "changes requested", OA creator revises, and Design can only Approve the revised BOQ. Purchase and Manufacturing only see design-approved BOQs.

## Flow

```text
Design opens BOQ
  → types comment in any cell (1, 2, or N items — not mandatory on all)
  → auto-save on blur / debounce 600ms (per item+column)
  → comment count badge updates
[ Post Submit ]  ← only button, bottom of page
  → sets boqs.design_review_status = 'changes_requested'
  → emits notification to OA creator (existing emit_notification path)
OA Creator updates OA + creates revised BOQ (existing BoqEditor revision flow)
Design opens revised BOQ
  → Approve button is enabled ONLY when:
      boq.revision > revision at which last comment-submit happened
      AND design_review_status != 'design_approved'
  → Approve sets design_review_status = 'design_approved'
Purchase / Manufacturing lists filter: design_review_status = 'design_approved'
```

## Changes

### 1. `src/pages/design/DesignBoqView.tsx` — rewrite review UX
- Replace per-cell "Post comment" button with auto-save:
  - `Textarea` per cell stays inline; on `onChange` set local draft, on `onBlur` or 600ms debounce call `upsertDesignComment({ boqId, itemId, columnKey, text })`.
  - New helper `upsertDesignComment` in `src/lib/design/comments.ts`: if a comment by the current user for the same `(boq_id, boq_item_id, column_key)` exists and is not yet submitted, UPDATE it; else INSERT. Empty text → DELETE the draft row.
  - Show small "Saved • hh:mm" indicator next to the textarea.
- Remove per-row "Post comment" action. Comments list under each row still renders existing comments.
- Remove `Approve All / Mark All Pending / Mark Selected Not Approved` bulk bar in this view (status is implicit via comments + Post Submit).
- Add sticky bottom bar with single primary button: **Post Submit (N comments)**. Disabled when there are zero unsubmitted comments OR `design_review_status === 'changes_requested'` (already submitted, waiting for revision) OR `design_approved`.
- Add **Approve revised BOQ** button next to Post Submit. Enabled only when:
  - latest comment submission's `boq_revision` < `boq.revision`, AND
  - `design_review_status !== 'design_approved'`.
  - Disabled with tooltip "Waiting for OA Creator to publish revised BOQ" otherwise.

### 2. `src/lib/design/comments.ts`
- Add `upsertDesignComment(input)` — uses `(boq_id, boq_item_id, coalesce(column_key,'__row__'), user_id)` to dedupe; uses existing table, no schema change.
- Add `deleteDesignComment(id)` for empty-string blur.
- Add `submitDesignComments(boqId, boqRevision)`:
  - Marks the BOQ: `update boqs set design_review_status = 'changes_requested' where id = boqId`.
  - Records snapshot revision via existing `boq_design_comments.oa_revision_id` is reused — instead, write a row into `boq_design_review_email_log` is overkill. Simpler: track on `app_notifications` payload + read `max(created_at)` of comments vs `boq.updated_at` of revisions. To keep it deterministic, add a tiny client check: store the submit revision in `localStorage` AND rely on `design_review_status` flag for the primary gate. (No new table.)
- Add `approveRevisedBoq(boqId)`:
  - `update boqs set design_review_status = 'design_approved', verification_status = 'approved', is_current = true, status = 'finalized' where id = boqId`.
  - Triggers existing `notif_on_boqs` which notifies Purchase & Manufacturing.

### 3. Gating Purchase / Manufacturing
- `src/pages/purchase/BoqFolder.tsx`: tighten filter to `(verification_status ?? 'approved') === 'approved' AND design_review_status === 'design_approved'`.
- `src/pages/manufacturing/ManufacturingList.tsx` and `CreateRequisitionDialog.tsx`: add the same `design_review_status === 'design_approved'` filter when listing/selecting BOQs. (Edit only the list/picker queries; do NOT touch calculations.)

### 4. `src/pages/design/DesignBoqList.tsx`
- Existing `design_review_status` column shown. Add badge mapping:
  - `draft` → "Open for review"
  - `changes_requested` → "Awaiting OA revision"
  - `design_approved` → "Approved"
- No behavior change beyond labels.

### 5. Notification
- "Post Submit" already triggers `notif_on_boqs` via `design_review_status` change → emits to OA creator audience. No new code needed.

## Out of scope

- No DB migration (reuses existing `boq_design_comments` + `boqs.design_review_status`).
- No changes to BOQ/OA calculation logic, PDF, currency, or `verify_boq_*` RPC paths.
- No changes to the external token-based reviewer flow (`src/pages/boqs/DesignReview.tsx`, `boq_design_reviews`).
- No new tables, no schema changes, no edge function changes.

## Key files touched

- `src/pages/design/DesignBoqView.tsx` (rewrite review UI + sticky action bar)
- `src/lib/design/comments.ts` (add upsert/delete/submit/approve helpers)
- `src/pages/purchase/BoqFolder.tsx` (add design-approved filter)
- `src/pages/manufacturing/ManufacturingList.tsx` + `src/components/manufacturing/CreateRequisitionDialog.tsx` (add design-approved filter on BOQ pickers/lists)
- `src/pages/design/DesignBoqList.tsx` (status badge labels only)
