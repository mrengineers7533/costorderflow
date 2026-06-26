## Goal
Make Design comments, Design approval, and OA approval permanently stick to the exact OA revision they were made on — so MROA/2026-27/0001 R0 keeps its "Approved + comment" forever even after R1, R2 … are created, and every screen (OA view, OA history, BOQ, BOQ history, Design BOQ, Manufacturing, Purchase) reads the same per-revision snapshot.

## What already exists (from prior turn)
- Table `public.boq_revision_approval_snapshots` (created in migration `20260626105836_...sql`).
- Trigger + RPC `refresh_boq_revision_approval_snapshot` (migration `20260626105907_...sql`).
- Helper `src/lib/boq/approvalSnapshots.ts` with `fetchRevisionApprovalSnapshots`, `evaluateSnapshotApproval`, `mapSnapshotItems`.
- Regenerated `src/integrations/supabase/types.ts`.

The pipe is in place; nothing reads from it yet. This plan wires reads + guarantees writes on every approval event and every revision carry-forward.

## Scope of code changes

### 1. Snapshot write triggers (verify + extend)
File: `supabase/migrations/<new>.sql`
- Confirm `refresh_boq_revision_approval_snapshot(boq_id, revision)` is invoked from:
  - `boqs` AFTER UPDATE of `verification_status`, `line_items`, `design_review_status`
  - `boq_item_design_status` AFTER INSERT/UPDATE/DELETE
  - `boq_design_comments` AFTER INSERT/UPDATE/DELETE
  - `boq_design_review_items` AFTER UPDATE of `decision`, `comment`
- Add missing triggers if any source above is not yet covered.
- Backfill: one-time `INSERT … SELECT` into `boq_revision_approval_snapshots` for every existing `(boq_id, revision)` so historical OAs (incl. MROA/2026-27/0001 R0) materialize their current verdict.

### 2. Revision carry-forward
File: `src/lib/revisions/index.ts` (and OA-revise paths that build the new BOQ row)
- After the new revision row is inserted, call `supabase.rpc('refresh_boq_revision_approval_snapshot', { … })` for **both** the previous revision (freeze it) and the new revision (seed it as pending).
- Do NOT copy approval status forward — the new revision starts pending; the old revision's snapshot is the source of truth for its own history row.

### 3. Read path — make every screen read snapshots first

Update these modules to call `fetchRevisionApprovalSnapshots(boqId, revision)` and use `evaluateSnapshotApproval` / `mapSnapshotItems` as the primary source, falling back to existing live lookups only when no snapshot row exists (pre-backfill safety):

- `src/lib/boq/designApprovalStatus.ts` — `fetchDesignApprovalStates` and inherited-state resolver.
- `src/lib/boq/itemApprovalSync.ts` — `fetchItemApprovalVerdicts`.
- `src/lib/boq/designReview.ts` — comment/status accessors used by OA view.

Components that render badges/comments — change only the data source, not the UI:
- `src/pages/orders/OrderEditor.tsx` (OA detail view)
- `src/pages/design/DesignBoqView.tsx`
- `src/pages/modules/ApprovedBoqModule.tsx` (Manufacturing/Purchase shared module)
- `src/components/revisions/OaRevisionHistory.tsx`
- `src/components/revisions/BoqRevisionHistory.tsx`

History components must pass the specific revision's `boq_id` to the snapshot fetch — not the current/latest one — so old rows keep their own verdict.

### 4. Tests
Extend `src/test/approvalBadgesE2E.test.ts` with:
- "Approving R0 then creating R1 leaves R0 snapshot = approved with original comment, R1 snapshot = pending."
- "Refresh after R1/R2 creation: OA history row for R0 still shows Approved + Design comment."
- "Snapshot read is identical across OA / Design BOQ / Manufacturing / Purchase / history for the same `(boq_id, revision)`."

## Non-goals (untouched per the recurring instruction)
Cost-sheet parsing, OA creation, BOQ generation, revision numbering, formulas/calculations, validations, UI layout, workflow, notifications, OA→BOQ logic, approval flow. Only the persistence layer (snapshots) and the read source for status/comment displays change.

## Technical details

Snapshot row shape (already created): `(boq_id, revision, order_id, order_root_id, oa_number, verification_status, design_review_status, design_comment, approved_by, approved_at, applied_to_oa_at, items jsonb, …)`.

`items` jsonb is `[{ boq_item_id, approval_status, approval_comment, design_decision, design_comment, column_comments }]` — keyed by `boq_item_id` so per-item rendering in BOQ/Design/Manufacturing reads from one place.

Fallback order inside `fetchDesignApprovalStates` / `fetchItemApprovalVerdicts` becomes:
1. `boq_revision_approval_snapshots` row for that exact `(boq_id, revision)`.
2. Existing inheritance walk (`revised_from_id` chain + sibling BOQs in same OA family) — only if no snapshot row exists.
3. Live `line_items[].approval_status` / `boq_item_design_status` — final fallback.

Trigger guard: snapshot refresh is a no-op when the row hash hasn't changed, so re-approving doesn't churn history.

## Deliverables
1. One migration: missing triggers + one-time backfill.
2. Code edits in the 8 files listed above.
3. Extended e2e test file.
4. Manual verification on MROA/2026-27/0001: R0 history row shows Approved + Design comment after creating a new revision.
