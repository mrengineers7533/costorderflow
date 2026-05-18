## What already works (no changes needed)

- **Design comments item-wise on BOQ page** — `DesignCommentsInline` renders Design suggestions row-wise under each BOQ item, per column.
- **Creator can edit Model / Description / Qty / Unit / Remarks** after comments arrive (`canEditFull` in `BoqEditor.tsx`).
- **Save flips status to `boq_updated`** and snapshots a revision (`save()` in `BoqEditor.tsx`).
- **Approval link is separate from Comment link** (`kind: "comment" | "approval"`), enforced server-side in `submit_design_review_with_token`. Design cannot edit BOQ data through either link.
- **Approval link already shows Previous → Updated** per item via `fetchLatestCommentBaseline` + the amber "Previous · R<n>" row in `DesignReview.tsx`.
- **Approve / Request Changes flow** — RPC sets BOQ to `design_approved` / `changes_required`; `changes_required` re-opens editing and a new round can be generated.
- **Final BOQ lock** — once `design_approved`, the editor goes read-only and the "Send Final BOQ" button appears; `final_sent` locks fully.
- **Revisions table** — `boq_revisions` rows are written on every new round and on each creator save after comments.

## Gaps this plan closes

### 1. Persist the field-level diff into the revision snapshot

`snapshotRevision` already accepts a generic `reviewItems` blob but the creator-save path doesn't pass a structured "what changed" payload. Add an optional `changes` field on the snapshot:

```ts
changes: { item_id, item_no, model_number, field, old_value, new_value, changed_by, changed_at }[]
```

Compute it in `BoqEditor.save()` by diffing `originalItems` vs `items` on Model / Description / Qty / Unit / Remarks, and store it in the existing `boq_revisions.review_items` jsonb (under a `__changes` key) so no migration is needed.

### 2. Capture a stable baseline at comment-link generation

Today the "Previous Data" baseline comes from `boq_design_review_items` of the latest Comment round (works, but is per-item and skips items removed since). When a Comment round is created in `createReviewRound`, also write `boq_snapshot.line_items = items` so the baseline survives item add/remove. `fetchLatestCommentBaseline` falls back to `boq_design_review_items` when `line_items` is absent (legacy rounds keep working).

### 3. Enrich the Revisions table to match your spec

Extend `RevisionsTable.tsx` columns to:

```text
Version | Date/Time | Created/Updated by | Link Type | Status | Reviewer outcome | Changes | View
```

- **Created/Updated by** — resolve `boq_revisions.created_by` → `profiles.full_name`.
- **Changes** — "3 fields across 2 items" summary built from the new `__changes` payload (step 1).
- **View dialog** — add a "Changes" section listing before → after per field, and a "Design comments" section already in `RevisionView` (already shows decision + comment).
- Keep `Current` row highlighted at top (already done).
- All historical rows remain read-only (already enforced — no edit UI exists).

### 4. Re-comment cycle after Design rejection

Today `changes_required` reopens editing and the creator can generate a new Approval link directly. Per your spec, the creator should also be able to send the BOQ back for a fresh **Comment** round at any iteration. The `Generate Comment Link` button already exists in `DesignReviewPanel` and is enabled whenever the BOQ isn't locked, so no UI change is required — just verify the gating doesn't hide it when `designReviewStatus === "changes_required"` (currently it doesn't; confirm in QA).

## Files touched

- `src/lib/boq/designReview.ts` — extend `snapshotRevision` with `changes`; write `boq_snapshot.line_items` in `createReviewRound`; add `summarizeChanges()` helper.
- `src/pages/boqs/BoqEditor.tsx` — compute diff in `save()` and pass `changes` into `snapshotRevision`.
- `src/components/boqs/RevisionsTable.tsx` — add Created-by + Changes columns; render before/after in `RevisionView`.
- (Optional) `src/components/boqs/PendingChangesPanel.tsx` — unchanged; already shows live pending diff above `DesignReviewPanel`.

## Explicitly out of scope

- No DB migration (uses existing `boq_revisions.review_items` jsonb and `boq_design_reviews.boq_snapshot` jsonb).
- No change to OA sync, BOQ number derivation, BOQ calculations, PDF output, RLS, or permissions.
- No edit capability added to Design on either link.
- No change to manual revision rules for the Final BOQ.
