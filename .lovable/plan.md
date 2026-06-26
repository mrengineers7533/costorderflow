## Goal

Make Design-approval / OA-approval / BOQ-approval visibility behave identically for **MR** and **GMS** OA/BOQ documents across every consumer view, with clear **revision-wise** status (never blank). No changes to revision, generation, calc, numbering, validation, or workflow logic — display + carry-forward only.

## What's wrong today

1. `fetchDesignApprovalStates` (the single source of truth for the "Approved" badge in Manufacturing / Purchase / BOQ Folder / Approved-BOQ detail) is **format-agnostic in code but data-dependent in practice**: GMS revisions consistently have both `line_items[].approval_status='approved'` AND `boq_item_design_status` rows; MR revisions (especially older or revised ones like `MROA/2026-27/0007/R7`) often have one but not the other, so they fall back to "Not Approved" even when Design has approved. Earlier MR cases were fixed with one-off backfills — there is no general rule.
2. The OA page's per-item "Approved by Design" column reads from a different mirror than the folder badges, so the same item can read "Approved" on the OA and "Not Approved" on the linked Manufacturing card.
3. `fetchLatestSubmittedRound` / `fetchLatestApprovalRound` already fall back through `revised_from_id` for the Design BOQ panel, but the **folder/list views do not** apply the same inheritance — a revised BOQ with no own design-status rows reads as blank/not-approved even when its parent revision was fully approved.
4. When approval is genuinely missing, several views render blank instead of an explicit "Not Approved by Design" label. The user wants the negative state always visible per revision.

## Plan

### 1. Make `fetchDesignApprovalStates` format-agnostic and inheritance-aware (`src/lib/boq/designApprovalStatus.ts`)

For each BOQ id, compute the state from **whichever signal is present**, in this priority:

1. If `boq_item_design_status` has rows for this boq+revision → use them (current rule).
2. Else walk `revised_from_id` chain (and sibling BOQs in the same OA family, same as `findLatestRoundBoqId`) to find the nearest ancestor with design-status rows; remap by description+model to current `line_items`; treat as **inherited approval**.
3. Independently, require the OA-mirror condition: every `line_items[].approval_status === 'approved'`. If `line_items` has no `approval_status` field at all on any row but the inherited design rows are fully approved → treat as approved (mirrors the resilient carry-forward already in `src/lib/revisions/index.ts`).
4. Otherwise → `not_approved`.

Return value stays the same `Map<boqId, "approved" | "not_approved">` so no caller changes.

This is the one rule that fixes GMS and MR identically.

### 2. Always render an explicit badge — never blank

Update the three consumers to render `"Approved"` (emerald) OR `"Not Approved by Design"` (neutral) and never an empty cell:

- `src/pages/purchase/BoqFolder.tsx` — folder list rows.
- `src/pages/modules/ApprovedBoqModule.tsx` — Manufacturing & Purchase list cards + detail header.
- `src/pages/boqs/BoqList.tsx` — top-level BOQ list (currently doesn't show the gated badge consistently).

Each row already carries its revision number; the badge sits next to it so **every revision shows its own status** and history stays visible.

### 3. Unify the OA-page "Approved by Design" column with the folder rule

In `src/pages/orders/OrderEditor.tsx`, the per-item "Approved by Design" cell currently reads only the linked BOQ's `line_items[].approval_status` + `boq_item_design_status`. Add the same inheritance fallback (call a shared helper exported from `designApprovalStatus.ts`) so a revised OA whose BOQ inherits approval from a prior revision shows the column as Approved — matching what the folder badge now shows. No change to how the column is displayed, only to how the source value is computed.

### 4. Surface inherited Design comments on revised BOQs in every comment consumer

`fetchLatestSubmittedRound` / `fetchLatestApprovalRound` already inherit. Audit the remaining comment readers and route them through the same helpers:

- `src/components/boqs/DesignCommentsInline.tsx` — already uses `fetchLatestSubmittedRound`. ✅
- `src/components/orders/OaCellDesignComment.tsx` — verify it uses the inheriting fetcher; if it queries `boq_design_review_items` directly, switch it to the helper.
- `src/components/boqs/PendingChangesPanel.tsx` — `fetchLatestCommentBaseline` needs the same `revised_from_id` walk so the "Previous → Updated" panel works on revised BOQs too.

### 5. Tests

Extend `src/test/inheritedDesignApprovalConsistency.test.ts`:

- Add an MR-format fixture (no `boq_item_design_status` rows on the new revision, ancestor fully approved) and assert `fetchDesignApprovalStates` returns `approved` via inheritance.
- Add a fixture where the ancestor has a rejection → assert `not_approved` (negative state surfaces, never blank).
- Add a GMS-format fixture identical to today's passing case → asserts no regression.
- Assert the OA-page helper returns the same value as the folder helper for the same BOQ id (parity guarantee between OA and folder views).

## Files touched

- `src/lib/boq/designApprovalStatus.ts` — inheritance + OA-page helper export.
- `src/lib/boq/designReview.ts` — add `fetchLatestCommentBaseline` inheritance (small).
- `src/pages/orders/OrderEditor.tsx` — route "Approved by Design" column through shared helper.
- `src/pages/purchase/BoqFolder.tsx`, `src/pages/modules/ApprovedBoqModule.tsx`, `src/pages/boqs/BoqList.tsx` — always render explicit badge.
- `src/components/orders/OaCellDesignComment.tsx`, `src/components/boqs/PendingChangesPanel.tsx` — use inheriting fetchers if not already.
- `src/test/inheritedDesignApprovalConsistency.test.ts` — new cases for MR + negative state + OA/folder parity.

## What is NOT touched

- `src/lib/revisions/index.ts` revision logic, numbering, BOQ generation, OA generation, calculations, formulas, validations, workflow steps, OA/BOQ schemas, RLS. No backfill migrations — fix is purely in read-side display so it works for every existing and future MR/GMS revision without per-record patches.
