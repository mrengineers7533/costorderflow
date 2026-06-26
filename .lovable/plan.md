## Goal

Permanently fix the recurring OA/BOQ approval-status issue with **revision-wise approval snapshots** saved at the data level, so old OA/BOQ history never flips to Pending because of a later/current revision.

## Already completed in this turn

Two Supabase migrations were applied successfully:

1. Created `public.boq_revision_approval_snapshots`.
   - Stores one fixed row per BOQ revision item.
   - Captures the exact BOQ/OA revision, BOQ item id, item signature, Design comments, approval status, approved by/name/department, approved date/time, and OA-apply audit fields.
   - Backfilled existing BOQ revisions from current saved BOQ line items, `boq_item_design_status`, `boq_design_comments`, and BOQ design/verification status.
2. Added database functions/triggers to keep snapshots fresh.
   - Refreshes snapshots after Design item approval rows change.
   - Refreshes snapshots after Design comments are added/applied/updated.
   - Refreshes snapshots after BOQ line items or BOQ design/verification status changes.
   - Added a callable RPC `refresh_boq_revision_approval_snapshot(_boq_id uuid)` for immediate app-side healing.
3. Tightened execute grants for the new security-definer refresh functions.
   - Internal functions are not directly executable by anonymous/authenticated users.
   - The app-facing RPC requires authentication and performs ownership/module checks.

Security linter warnings shown after migration are pre-existing/project-wide warnings, not specific unhandled findings for this task.

## Remaining build-mode implementation

The app is currently in plan mode, so code files could not be edited. Switch to build mode to apply the following focused code changes.

### 1. Add snapshot read helper

Create `src/lib/boq/approvalSnapshots.ts` with helpers:

- `fetchRevisionApprovalSnapshots(boqs)`
  - Reads `boq_revision_approval_snapshots` by `boq_id` and filters by that BOQ’s own `revision`.
  - Returns `Map<boqId, snapshotRows[]>`.
- `evaluateSnapshotApproval(items, rows)`
  - Returns `approved` only if every current item has a snapshot row with `approval_status='approved'`.
  - Otherwise returns `not_approved`; returns `null` only when no snapshot exists so existing fallback can still heal old/incomplete data.
- `mapSnapshotItems(items, rows)`
  - Returns item-wise approval from the fixed snapshot by item id or description/model signature.
- `refreshRevisionApprovalSnapshot(boqId)`
  - Calls RPC `refresh_boq_revision_approval_snapshot` best-effort.

### 2. Make all status consumers read the snapshot first

Update:

- `src/lib/boq/designApprovalStatus.ts`
  - Before fallback/inheritance logic, read snapshots for the exact BOQ revision.
  - If snapshot rows exist, return their verdict.
  - Keep existing fallback only for records not yet snapshot-backed or if permissions fail.
- `src/lib/boq/itemApprovalSync.ts`
  - Read snapshot rows first for item-wise Manufacturing/Purchase detail badges.
  - Fall back to existing line-items/status/inheritance logic only if no snapshot exists.
- `src/pages/orders/OrderEditor.tsx`
  - For the “Approved by Design” column, read the exact linked BOQ revision snapshot/item map first.
  - If snapshot is missing, keep existing `line_items[].approval_status` mirror fallback.
  - Fix the current query typo: it selects `revision` from `boq_item_design_status`, but the column is `boq_revision`.
- `src/components/orders/OaRevisionHistory.tsx`
  - Load BOQs for every OA revision and call the same snapshot-backed status helper.
  - Add explicit badge per revision: `Approved` or `Not Approved by Design`, while keeping Current/Superseded/Viewing badges.
- `src/components/boqs/BoqRevisionHistory.tsx`
  - Add explicit per-revision Design approval badge using snapshot-backed `fetchDesignApprovalStates`.

### 3. Refresh snapshot immediately at write points

Update write paths without changing workflow/calculation/revision logic:

- `src/lib/design/itemApprovals.ts`
  - After `setItemApproval`, `bulkSetItemApprovals`, and `syncApprovalToBoqSnapshot`, call `refreshRevisionApprovalSnapshot(boqId)` best-effort.
- `src/lib/design/comments.ts`
  - After `upsertDesignComment`, `submitDesignComments`, and `approveRevisedBoq`, call `refreshRevisionApprovalSnapshot(boqId)` best-effort.
- `src/pages/orders/OrderEditor.tsx`
  - After `apply_design_comment_to_oa` succeeds, call `refreshRevisionApprovalSnapshot(currentBoq.id)`.
- `src/lib/revisions/index.ts`
  - After a revised BOQ is created and approvals/comments are carried forward, call the RPC for the new BOQ and previous BOQ.
  - Do not change revision numbering, BOQ generation, cost sheet parsing, formulas, validations, notifications, or workflow.

### 4. Ensure revised BOQs persist snapshots, not just inherited display

In `src/lib/revisions/index.ts`, keep the existing carry-forward logic but ensure:

- Carried statuses are inserted into `boq_item_design_status` for the new BOQ revision.
- Carried status is mirrored into `boqs.line_items[].approval_status`.
- Snapshot refresh runs after both comment and status carry-forward.

This makes the revised BOQ data-level approved/not-approved state fixed for that revision instead of relying only on frontend inheritance.

### 5. Tests to update/add

Update existing Vitest mocks to include the new table/RPC:

- `src/test/oaRevisionE2E.test.ts`
  - Verify R6 old snapshot remains approved and R7 new snapshot is created/approved after revision.
- `src/test/inheritedDesignApprovalConsistency.test.ts`
  - Verify snapshot rows are preferred over inherited/latest status.
  - Verify negative snapshot returns `not_approved`, never blank.
- `src/test/approvalBadgesE2E.test.ts`
  - Verify OA history and BOQ history read each revision’s own snapshot.

## Files to touch in build mode

- Add: `src/lib/boq/approvalSnapshots.ts`
- Edit: `src/lib/boq/designApprovalStatus.ts`
- Edit: `src/lib/boq/itemApprovalSync.ts`
- Edit: `src/lib/design/itemApprovals.ts`
- Edit: `src/lib/design/comments.ts`
- Edit: `src/lib/revisions/index.ts`
- Edit: `src/pages/orders/OrderEditor.tsx`
- Edit: `src/components/orders/OaRevisionHistory.tsx`
- Edit: `src/components/boqs/BoqRevisionHistory.tsx`
- Edit tests listed above

## Guardrails

Do not change:

- Cost sheet parsing
- OA creation logic
- BOQ generation logic beyond refreshing approval snapshots after existing carry-forward
- Revision numbering
- Formulas/calculations
- Validations
- UI layout/workflow/notifications
- Approval flow

Only approval/comment/status save, inheritance, and revision-wise history consistency are in scope.