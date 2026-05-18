# BOQ Design Comment → Update → Approval Workflow

Builds on the already-shipped split (comment link vs approval link) and the existing inline `DesignCommentRow` under each item. Adds creator-side editing on the main BOQ page, gates the Approval link until the BOQ is re-saved, and locks Final BOQ.

## 1. Inline Design comments per item (main BOQ page)
- `BoqItemsList` in `src/pages/boqs/BoqEditor.tsx` already renders `<DesignCommentRow>` under each item via `useLatestDesignReview`. Keep this — confirm it shows for every item that has a `comment`, `design_change_note`, files, or non-pending decision (it does).
- Add a small header chip on the row when a comment exists ("Design comment — click to apply / edit") so the creator can spot rows needing action.
- No "global comments" panel — strictly item-wise (already the case).

## 2. Creator can edit every field row-wise (after comments received)
Today only `Remarks` is editable. Expand `BoqItemsList` so when `isCreator && designReviewStatus ∈ {review_received, changes_required, boq_updated, draft}` the following per-row cells become editable inputs:
- Model Number (Input)
- Description (Textarea)
- Quantity (number Input)
- Unit (Input)
- Remarks (already editable)

Item No. stays read-only (auto-sequenced). Editing flips a dirty flag.

Once `designReviewStatus = design_approved` or `final_sent`, the row becomes fully read-only (lock — see §6).

`updateItem` already supports arbitrary patches, so wiring new inputs is straightforward.

### Click-to-apply from comment
On each `DesignCommentRow` that has a `comment` or `design_change_note`, add a small "Apply to Description" / "Apply to Remarks" button that copies the text into the corresponding field via `updateItem`. Manual editing remains available regardless.

## 3. Save updated BOQ → unlocks Approval link
- The existing `save()` already flips `design_review_status` to `boq_updated` when saving while status is `review_received` or `changes_required`. Keep it.
- In `DesignReviewPanel`, **disable the "Generate Approval Link" button** unless:
  `designReviewStatus ∈ {boq_updated, design_approved}` **or** no comment round has been received yet (first-time approval is allowed).
  Tooltip: "Save the updated BOQ first (after Design comments) before generating an Approval link."
- "Generate Comment Link" remains always available (for fresh comment rounds).

## 4. Approval flow (already implemented, minor tightening)
- Approval link reviewer page (`DesignReview.tsx` with `kind=approval`) — no change.
- On approval submission: RPC already sets `design_review_status = design_approved`.
- On change_required: RPC sets `changes_required` → creator edits → saves → flips to `boq_updated` → can send new approval link. Loop supported.

## 5. Final BOQ save & lock
- "Send Final BOQ to Departments" button already appears when `design_approved`. After click, status becomes `final_sent`.
- When `designReviewStatus ∈ {design_approved, final_sent}`:
  - All item cells become read-only in `BoqItemsList`.
  - "Save Remarks" button hidden.
  - "Generate Comment Link" / "Generate Approval Link" buttons hidden (or disabled with tooltip "BOQ is locked").
- Admin override is out of scope (no admin lock-bypass exists today; leave existing behavior intact).

## 6. OA revision
- No change. OA revision remains manual via the OA editor. Existing OA→BOQ sync logic on reload is untouched.

## 7. Versioning / Revision History
- `snapshotRevision` is already called in `DesignReviewPanel.handleCreate` before generating a new round. Extend to also snapshot when the creator **saves an updated BOQ** following a comment round:
  - In `save()` (BoqEditor), if `shouldFlipStatus` is true (i.e., saving in response to comments), call `snapshotRevision` with `note: "Creator update R{n}"` and current `line_items` after the DB update succeeds.
- `RevisionsTable` already lists revisions row-wise, view-only with one-click open. Highlight current via existing `currentLabel` prop — already wired with `R{version}`.

## Out of scope
- BOQ calculations, OA sync rules, RLS, RPC signatures.
- No DB migration required — all changes are frontend.

## Technical details

**Files to edit:**
- `src/pages/boqs/BoqEditor.tsx`
  - `BoqItemsList`: convert Model/Description/Qty/Unit cells to controlled inputs gated by `canEditFull = isCreator && !locked`.
  - Compute `locked = designReviewStatus === "design_approved" || designReviewStatus === "final_sent"`.
  - Pass `locked` to `BoqItemsList`; reuse `onUpdate`.
  - In `DesignCommentRow` callsite, add "Apply to Description/Remarks" action buttons (small variant) calling `onUpdate`.
  - In `save()` after successful update + `shouldFlipStatus`, await `snapshotRevision({...note:"Creator update"})`.
  - Hide "Save Remarks" button when `locked`. Add a primary "Save BOQ Updates" button visible when any field (not just remarks) is dirty and `!locked` — calls existing `save(false)`.
- `src/components/boqs/DesignCommentsInline.tsx`
  - Extend `DesignCommentRow` props with optional `onApply?: (target: "description" | "remarks", text: string) => void`. Render small "Apply →" buttons when provided and comment text exists.
- `src/components/boqs/DesignReviewPanel.tsx`
  - Compute `approvalGated = rounds.some(r => r.kind === "comment" && r.status === "submitted") && designReviewStatus !== "boq_updated" && designReviewStatus !== "design_approved"`.
  - Disable "Generate Approval Link" with tooltip when `approvalGated`.
  - Hide both generate buttons when `designReviewStatus ∈ {design_approved, final_sent}` (keep Copy Final BOQ Link visible).

**No new state shape, no DB schema changes, no migration.**