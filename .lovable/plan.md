# Plan — Before vs After change tracking for BOQ updates

Most of the workflow you described is already wired:

- Design comments already show item-wise under each BOQ row (`DesignSuggestionInlineRow` in `BoqEditor.tsx`).
- Creator can already edit Model / Description / Qty / Unit / Remarks once Design comments are received (`canEditFull`).
- Approval link, final approval, locking, and revision history (R1/R2/R3 via `snapshotRevision` + `RevisionsTable`) are in place.
- OA sync, BOQ calculations, and permissions are untouched.

The real gap is **change tracking visibility**: today, when the creator edits the BOQ after comments, neither the creator nor Design clearly sees "previous value → updated value". This plan closes that gap without changing existing data flow.

## What gets added

### 1. Capture a "baseline" snapshot at the moment Design submits a Comment round

When a Comment round is submitted by Design (via the comment link), persist the BOQ line items as they were at that moment into the existing `boq_design_reviews.boq_snapshot` JSON (extend the snapshot with a `line_items` array). This becomes the "Previous Data" against which creator edits are compared.

If a Comment round was submitted before this change ships, fall back to the per-item values stored in `boq_design_review_items` (already present) — so old rounds still produce a valid baseline.

### 2. Show "Pending Changes" panel on the BOQ page (creator side)

On `BoqEditor.tsx`, render a new collapsible "Pending Changes vs Last Design Comment" card above the `DesignReviewPanel`, visible only when:
- status is `review_received` / `changes_required` / `boq_updated`, and
- at least one of (Model, Description, Qty, Unit, Remarks) differs from the baseline.

Each row shows:

```text
Item 3 · Aspiration Filter
  Qty       11  →  12
  Remarks   —   →  "Updated as per design note"
  Changed by: <name>   at: <timestamp>
```

`Changed by` / timestamp come from the existing `boq_remarks_audit` log for Remarks; for the other four fields we add a lightweight in-memory diff sourced from `originalItems` vs `items` plus the current user/time at the moment Save is clicked (persisted into the revision snapshot — see step 4).

### 3. Show the same comparison to Design on the Approval link

In `src/pages/boqs/DesignReview.tsx`, when `meta.kind === "approval"`, fetch the previous Comment round's baseline (from step 1) and render a "Previous → Updated" column next to each item showing only the changed fields. Unchanged items render normally. Design still only Approves / Requests Changes — no edit access added.

### 4. Persist the diff into the revision snapshot

Extend `snapshotRevision` (in `src/lib/boq/designReview.ts`) to also accept and store a `changes` array: `{ item_id, field, old_value, new_value, changed_by, changed_at }`. This is already invoked from `save()` in `BoqEditor.tsx` when the creator saves an update after comments; we just pass the computed diff in.

`RevisionsTable` then gains a small "Changes" cell ("3 fields across 2 items") with the existing View dialog expanded to render the before/after rows.

## Files touched

- `src/lib/boq/designReview.ts` — extend `snapshotRevision`, add `fetchPreviousCommentBaseline(boqId)`, extend submit flow to write `line_items` into `boq_snapshot`.
- `src/pages/boqs/BoqEditor.tsx` — compute diff from `originalItems` vs `items`; render Pending Changes card; pass diff into `snapshotRevision`.
- `src/pages/boqs/DesignReview.tsx` — for approval kind, fetch baseline and render before/after column.
- `src/components/boqs/RevisionsTable.tsx` — show changes summary + render diff in the view dialog.
- New migration: none required if we only extend the JSON shape of `boq_snapshot` and the existing `revision_snapshot` column. (No schema change.)

## Technical notes

- "Previous Data" baseline source priority:
  1. `boq_design_reviews.boq_snapshot.line_items` (preferred, set going forward).
  2. Fallback to `boq_design_review_items` rows for the latest submitted Comment round (legacy data).
- Diff comparison fields: `model_number`, `description`, `quantity`, `unit`, `remarks`. Other fields untouched.
- Permissions, OA sync, BOQ calculations, PDF output, and existing revision rules are not modified. Manual revisions after final approval continue to use the existing flow.
- No new tables. No changes to RLS. No edit access for Design.

## Out of scope (intentionally)

- No automatic OA/PI revision creation — manual revision only, as you specified.
- No changes to the existing Approve / Request Changes UI for Design beyond adding the read-only Previous → Updated column.
- No change to BOQ number derivation or version numbering rules.
