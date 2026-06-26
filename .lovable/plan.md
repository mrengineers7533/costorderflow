
## Problem

When an OA is revised, the auto-created new BOQ revision:
- correctly carries forward `line_items[].approval_status`, `boq_item_design_status` rows, and applied `boq_design_comments` (already implemented in `src/lib/revisions/index.ts`),
- **but does not carry the `boq_design_reviews` "round"** that the BOQ UI uses to render the Design comment panel and the "Approved by Design" badge.

The BOQ editor renders the Design comment via `fetchLatestSubmittedRound(newBoqId)` and the approval column via `fetchLatestApprovalRound(newBoqId)` (`src/components/boqs/DesignCommentsInline.tsx`, `src/pages/boqs/BoqEditor.tsx` line 126). The new BOQ revision has no rows in `boq_design_reviews`, so both return `null` and the Design comment/approval disappear on the BOQ — even though the OA continues to show them correctly (OA reads from `line_items[].approval_status` + `boq_item_design_status`, which are already carried).

## Fix (display-only, no changes to OA/BOQ generation, numbering, formulas, workflow)

Add a **previous-revision fallback** to the two design-review fetchers so that when the current BOQ has no review round, they walk back through `boqs.revised_from_id` (and as a secondary fallback the OA family's highest-revision sibling BOQ that does have a round) and return that round's items + docs, remapped to the current BOQ's item ids by description+model.

### Files to change

1. `src/lib/boq/designReview.ts`
   - Extract a small helper `findLatestRoundBoqId(boqId, kind: "submitted"|"approval")` that:
     - checks the given `boqId` for a matching round (current behavior);
     - if none, loads `boqs.revised_from_id` and recurses up the chain;
     - if still none, queries sibling BOQs in the same OA family (`order_id ∈ family`) ordered by `revision desc` and returns the first that has a round.
   - Update `fetchLatestSubmittedRound` and `fetchLatestApprovalRound` to use it. When the round is found on a different BOQ:
     - fetch that round's items + docs as today,
     - load the **current** BOQ's `line_items` and build a `desc|model → currentItemId` map,
     - return items with `boq_item_id` rewritten to the current BOQ's item ids so the UI keys match (items that don't map are dropped),
     - flag the returned `round` object with `inherited_from_boq_id` for debugging only.
   - No DB writes, no schema changes.

2. `src/components/boqs/DesignCommentsInline.tsx` — no code change required; it already consumes the fetcher result. The inherited round will render with its original `round_no` and reviewer info.

3. `src/pages/boqs/BoqEditor.tsx` (lines 119–194) — keep as-is. With the fallback in place, `fetchLatestApprovalRound` now returns the inherited round and the existing sync code mirrors `approval_status` onto the new BOQ's `line_items`, matching the working GMS R9 case. The carried `boq_item_design_status` rows inserted by `reviseBoqFromOrder` continue to seed the snapshot before the fetcher resolves.

4. Test: extend `src/test/oaRevisionE2E.test.ts` (or add a focused unit test on `fetchLatestSubmittedRound`) to assert that after revising R6→R7 with a submitted review on R6's BOQ, calling the fetcher with R7's `boqId` returns R6's round with item ids remapped to R7's items.

### What is intentionally NOT changed

- `reviseOrder` / `reviseBoqFromOrder` carry-forward logic.
- BOQ numbering, revision derivation, calculations, validations, PDF/Excel generators.
- OA editor's "Approved by Design" column logic.
- `boq_design_reviews` rows on the previous BOQ (kept exactly as-is so revision history is preserved).
- Approval workflow (no auto-creation of new rounds; new approvals still go through Design as before).

### Outcome

- MROA/2026-27/0007/R7's BOQ will show the same Design comment and "Approved by Design" badge that R6 had, matching the working `2026-27/GMS/0002/R9` reference.
- BOQ Folder, Manufacturing, and Purchase already read `line_items[].approval_status` + `boq_item_design_status` (which are carried forward), so they keep displaying correctly once the BOQ snapshot is in sync.
