## Goal

Right now Design's per-field comments (Model / Description / Qty / Unit / Remarks) get joined into one string and dumped into a single "Review Comment" cell. Split them so each suggested value appears under its own column, directly beneath the matching BOQ item, on both the main BOQ page and the Design Review panel.

## 1. DB — store per-column comments

New migration that:

1. Adds `column_comments jsonb` (default `'{}'::jsonb`) to `boq_design_review_items`.
2. Replaces `submit_design_review_with_token` so it also writes `column_comments = _it->'column_comments'` when present (keeps existing `comment` write for backward compatibility with old data and the approval-link flow).

No changes to `boqs`, `boq_design_reviews`, `boq_revisions`, or RLS.

## 2. Design Comment link (`src/pages/boqs/DesignReview.tsx`)

- Keep the existing per-column textareas (Model / Description / Qty / Unit / Remarks) — they are already correct.
- Submit payload changes: send `column_comments: { model, description, quantity, unit, remarks }` per item alongside `comment` (still concatenated for legacy viewers / approval-kind change notes).
- No layout change.

## 3. Type — `src/lib/boq/designReview.ts`

- Extend `DesignReviewItemRow` with `column_comments: Partial<Record<"model"|"description"|"quantity"|"unit"|"remarks", string>> | null`.
- Add a tiny helper `parseColumnComments(row)` that returns the column map. If `column_comments` is populated use it; otherwise parse the legacy `comment` string of shape `"Model: X\nDescription: Y\n…"` into the same map (covers existing submitted rows).

## 4. Main BOQ page — `src/pages/boqs/BoqEditor.tsx` + new sub-component

- Replace the current `<DesignCommentRow>` block under each item (lines 562–571) with a new `<DesignSuggestionRow>` rendered inside `BoqItemsList` that uses the SAME 7-column grid template as the item row.
- For each column (Model, Description, Qty, Unit, Remarks) the suggestion row shows:
  - the suggested value from `parseColumnComments(reviewItem)` (or `—` if blank), styled as a dashed-bordered, accent-tinted cell labelled "Design Suggested Update (R{n})";
  - when `canEditFull`, an inline "Apply" button per cell that calls `onUpdate(it.id, { [field]: suggestedValue })`. Quantity is parsed to a number before apply.
- Item No. column shows the round badge + reviewer name/date; Approval column stays empty.
- Item-to-comment mapping uses `boq_item_id` (already correct) so item 1's comment can never show under item 2.
- `DesignCommentsInline.tsx`: `DesignCommentRow` continues to exist for any legacy use (none after this change in BoqEditor), but we add and export the new `DesignSuggestionRow` from the same file.

## 5. Design Review Panel — `src/components/boqs/DesignReviewPanel.tsx`

- Drop the "Review Comment" column from the table.
- For each item render two `<tr>`s: the existing item row, then a "Design Suggested Update" row that spans the same Model / Description / Qty / Unit / Remarks columns showing the per-field suggestions (using `parseColumnComments`), with reviewer name + round in the `#` cell. Status cell stays (approval-kind decision). Files cell stays on the suggestion row.
- No change to round tabs, link gating, or button logic.

## 6. Versioning (no functional change, just confirm)

- `snapshotRevision` already saves `line_items` + `review_items` per round in `boq_revisions`; the new `column_comments` field will flow through automatically because it's stored on `boq_design_review_items` and read via `fetchReviewItems`. `RevisionsTable` keeps its current row-wise read-only display.

## Out of scope

- BOQ calculations, OA sync, item-data logic, RLS, permission rules — all untouched.
- The Design Approval link UI (still one combined change-note per item, as required).
- Old already-submitted comment rounds: handled by the legacy-string parser in step 3, so they also render column-wise.

## Files touched

- `supabase/migrations/<new>.sql` (new)
- `src/lib/boq/designReview.ts`
- `src/components/boqs/DesignCommentsInline.tsx`
- `src/components/boqs/DesignReviewPanel.tsx`
- `src/pages/boqs/BoqEditor.tsx`
- `src/pages/boqs/DesignReview.tsx`
