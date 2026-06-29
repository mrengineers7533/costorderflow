## Production OA → BOQ approval synchronization fix plan

### Scope guard

Only approval/comment/status synchronization will be changed. I will not change UI layout, OA/BOQ numbering, costing formulas, quantities/rates/amounts, Save Draft, Finalize, Convert to PI, Manufacturing workflow, Purchase workflow, or access-control rules.

### Exact functions involved

- OA item approval is written from the Design BOQ page through `setItemApproval()` / `bulkSetItemApprovals()` in `src/lib/design/itemApprovals.ts`, and mirrored to BOQ JSON by `syncApprovalToBoqSnapshot()`.
- Initial auto-created BOQ comes from `createInitialBoqForOrder()` in `src/lib/revisions/index.ts`.
- Revised OA comes from `reviseOrder()` in `src/lib/revisions/index.ts`.
- Revised BOQ comes from `reviseBoqFromOrder()` and `createPendingBoqRevision()` in `src/lib/revisions/index.ts`.
- The broken/missing persisted fields are approval-only fields in `boqs.line_items[].approval_status/approval_comment`, `boq_item_design_status`, `boq_design_comments`, and `boq_revision_approval_snapshots`.

### Root cause being fixed

The real flow can still lose item-wise approval because approval is written in one table first and the mirror/snapshot is only best-effort from the UI. Separately, `syncBoqsAndPisForOrder()` rebuilds BOQ `line_items` during OA save and currently resets open BOQ item approvals to `pending`, which can overwrite inherited/approved item snapshots after OA approval or revision.

### Files to change

1. `src/lib/design/itemApprovals.ts`
   - Make `setItemApproval()` call the mirror/snapshot sync immediately after every insert/update.
   - Make `syncApprovalToBoqSnapshot()` also refresh revision-wise snapshot rows and preserve approval comments when available.

2. `src/lib/revisions/index.ts`
   - In `syncBoqsAndPisForOrder()`, preserve existing/carried approved item status for open BOQs instead of blindly resetting to pending.
   - Refresh snapshots after sync updates.
   - Keep initial/revised BOQ creation behavior unchanged except approval metadata carry-forward.

3. `supabase/migrations/<new>_approval_sync_repair.sql`
   - Approval-only backfill/repair: restore approved item status/comments/status rows/snapshots from linked previous approved BOQ revisions where records are blank/pending.
   - No amounts, quantities, costing, numbering, item structure, or workflow data changed.

4. `src/test/oaBoqApprovalSyncFlow.test.ts`
   - Test 1: initial OA → auto BOQ → design approval sync persists to `boqs.line_items`, `boq_item_design_status`, snapshots, and shared module helpers.
   - Test 2: approved OA/BOQ revision carries approved item status/comments to revised OA/revised BOQ and shared helpers after refresh.
   - Test 3: old approved revision stays approved after new revision is created.

### Why unrelated logic is unaffected

All edits are limited to approval metadata fields (`approval_status`, `approval_comment`, `boq_item_design_status`, `boq_design_comments`, `boq_revision_approval_snapshots`, `verification_status`, `design_review_status`, `verified_at`, `verified_by_email`). No numbering functions, costing helpers, item amount math, PI conversion logic, UI layout components, requisition/manufacturing/purchase workflows, or draft/finalize flows are rewritten.