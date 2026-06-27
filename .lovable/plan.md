Root cause found:
- `src/lib/revisions/index.ts` → `reviseOrder()` calls `reviseBoqFromOrder()` for the auto-created BOQ revision, but `reviseBoqFromOrder()` currently carries approval forward mainly from `prevBoq.line_items[].approval_status` and direct old-item-id matches in `boq_item_design_status`.
- Existing affected MR data shows approved design rows exist, but they are orphaned from the BOQ `line_items` item IDs. Example `MROA/2026-27/0001/R2`: the source BOQs have approved `boq_item_design_status` rows, but `line_items[].approval_status` is `0/78`, snapshots are `not_approved`, and the new R2 BOQ has `0` status rows.
- The database snapshot function currently evaluates approval by direct item-id only. It does not repair/inherit when legacy approved rows/comments exist but item IDs changed between revisions.
- Snapshot triggers are not visible on the production database for `boqs`, `boq_item_design_status`, or `boq_design_comments`, so snapshot rows can become stale instead of being refreshed when approval/comment writes happen.

Implementation plan:

1. Database migration: make revision snapshots reliable
- Update `public.refresh_boq_revision_approval_snapshot_internal(_boq_id)` so each `(boq_id, boq_revision, boq_item_id)` snapshot is built from:
  - direct `boq_item_design_status` rows for the exact BOQ revision,
  - `boqs.line_items[].approval_status`,
  - inherited `source_boq_id` / `revised_from_id` snapshot rows matched by item signature (`description + model_number`),
  - bulk-approved inference only when the source revision has approved rows/snapshot and no pending/rejected/blocking rows.
- Carry snapshot `design_comments`, `approval_comment`, `approved_by*`, `approved_at`, `applied_to_oa*`, and `oa_revision_id` forward by item signature when direct item-id rows are missing.
- Add/restore triggers:
  - `boqs` insert/update refreshes that BOQ revision snapshot.
  - `boq_item_design_status` insert/update/delete refreshes the affected BOQ snapshot.
  - `boq_design_comments` insert/update/delete refreshes the affected BOQ snapshot.
- Keep snapshots revision-scoped; a later R2 refresh must not mutate R1 rows except when R1’s own approval/comment rows are edited.

2. Safe repair/backfill migration for existing wrong revisions
- Repair only revisions where the child BOQ was created from an approved source revision and the child has no explicit blocking design decision.
- For each affected child BOQ:
  - map source items to child items by normalized `description + model_number`, with description fallback only where safe,
  - set child `line_items[].approval_status = 'approved'` and carry `approval_comment` where the source item/snapshot was approved,
  - insert missing `boq_item_design_status` rows for the child revision with inherited approved metadata,
  - clone applied `boq_design_comments` to the child BOQ revision when missing,
  - preserve approved metadata where applicable: `verification_status`, `design_review_status`, `verified_at`, `verified_by_email`, design comments, approval timestamps,
  - rebuild `boq_revision_approval_snapshots` for repaired source and child BOQs.
- The backfill will not overwrite child rows that already have pending/rejected/not-approved status rows or newer Design changes.

3. Code: revise flow uses snapshots as source of truth
- Update `src/lib/revisions/index.ts`:
  - add a shared carry-forward helper for revision approval snapshots,
  - use it in `reviseBoqFromOrder()` immediately after inserting the new BOQ,
  - use the same helper in `createPendingBoqRevision()` where BOQ revision rows are created from an OA save path,
  - ensure new BOQ `line_items` are created with inherited `approval_status` / `approval_comment` when the source snapshot or source status is approved,
  - insert/clone `boq_item_design_status` and applied `boq_design_comments` for the new exact BOQ revision,
  - call `refresh_boq_revision_approval_snapshot` after the carry-forward writes.
- Keep numbering, formulas, layouts, and existing OA/BOQ generation structure unchanged.

4. Code: approval reads use snapshots first everywhere
- Update `src/lib/boq/approvalSnapshots.ts` as the central API for item-level snapshot reads.
- Update `src/lib/design/itemApprovals.ts` so Design BOQ per-item status reads snapshots first, then falls back to `boq_item_design_status`.
- Update `src/pages/orders/OrderEditor.tsx` so the OA “Approved by Design” column reads the linked BOQ’s revision snapshot first, then falls back to `line_items` only when no snapshot exists.
- Keep existing `src/lib/boq/designApprovalStatus.ts` / `src/lib/boq/itemApprovalSync.ts` snapshot-first behavior and adjust only if needed for the new snapshot fields.

5. Tests and verification
- Extend `src/test/oaRevisionE2E.test.ts` to cover:
  - source revision approved through orphaned/legacy status rows,
  - `Revise OA` creates a new OA + BOQ revision that inherits approved item status and applied comments,
  - new BOQ has `line_items[].approval_status = 'approved'`, cloned `boq_item_design_status`, cloned applied `boq_design_comments`, and snapshot rows.
- Add/extend tests for `fetchItemApprovals`, `fetchDesignApprovalStates`, and `fetchItemApprovalVerdicts` to confirm snapshot-first reads for MR and GMS.
- After migration/backfill, run database checks for `MROA/2026-27/0001/R2` and other affected revisions:
  - source approved revision remains approved,
  - newly repaired child BOQ snapshot is approved,
  - linked BOQ, Design BOQ, BOQ Folder, Manufacturing, Purchase, and OA item status all read Approved after refresh/navigation.

Before marking complete I will report:
- root cause confirmed,
- files changed,
- database functions/triggers/tables touched,
- migration/backfill details,
- verification result for existing affected OA/BOQ records,
- verification result for a newly created revision after the fix.