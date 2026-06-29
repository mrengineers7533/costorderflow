## Goal

Add integration tests that lock in the approval sync contract end-to-end, without touching any existing feature code, helpers, migrations, or UI.

## Scope guard

- Test-only additions under `src/test/`.
- No edits to `src/lib/**`, `src/pages/**`, `src/components/**`, `supabase/**`, or any config beyond what's needed to register new test files (none expected — `vitest.config.ts` already globs `src/**/*.test.ts`).
- Reuse the existing in-memory Supabase fake pattern from `src/test/oaRevisionE2E.test.ts` and the snapshot/approval helpers already exercised in `src/test/approvalBadgesE2E.test.ts` and `src/test/inheritedDesignApprovalConsistency.test.ts`.

## New test files

### 1. `src/test/initialOaBoqApprovalSync.test.ts`
Covers: **Initial OA → auto BOQ approval sync.**

Flow:
1. Seed a fresh OA (R0, no parent) with 2 line items, no BOQ yet.
2. Call `createInitialBoqForOrder` from `src/lib/revisions/index.ts` to auto-create the BOQ.
3. Simulate Design approving one item via `setItemApproval` + `syncApprovalToBoqSnapshot` from `src/lib/design/itemApprovals.ts`.
4. Simulate bulk approve via `bulkSetItemApprovals` for the second item.

Assertions:
- Auto-created BOQ exists with `revision = 0`, `is_current = true`, correct `order_id`.
- After per-item approval, `boqs.line_items[itemId].approval_status === "approved"` (mirror written by `syncApprovalToBoqSnapshot`).
- `boq_item_design_status` has matching rows with `status="approved"` and correct `boq_revision`.
- `fetchItemApprovalVerdicts` (from `src/lib/boq/itemApprovalSync.ts`) returns `"approved"` for both items.
- `fetchDesignApprovalStates` (from `src/lib/boq/designApprovalStatus.ts`) reports BOQ-level approved when all items approved.

### 2. `src/test/revisedOaBoqApprovalInheritance.test.ts`
Covers: **Revised OA → revised BOQ inheritance** with simulated refresh/navigation.

Flow:
1. Seed R6 OA + R6 BOQ with one approved item (Pump) and one pending item (Motor), plus an applied Design comment — reusing the fixture shape from `oaRevisionE2E.test.ts`.
2. Call `reviseOrder(..., { autoReviseBoq: true })` to create R7.
3. Simulate a "refresh" by clearing all in-memory caches/maps held by the test (re-instantiate any module-level state) and re-querying through the same public helpers a fresh page load would call:
   - `fetchRevisionApprovalSnapshots([r7BoqId])`
   - `fetchItemApprovalVerdicts(r7BoqId, 7, r7Items)`
   - `fetchDesignApprovalStates([r7BoqId])`
   - `fetchLatestSubmittedRound` (used by Design view)
4. Simulate "navigation" by running the same three helper calls a second time in a different order (mimicking Manufacturing → Purchase → BOQ Folder → OA Editor traversal) and asserting identical results.

Assertions:
- R7 OA created with `revision=7`, `revised_from_id=r6Id`, `is_current=true`.
- R7 BOQ created with `revision=7`, inherits Pump approved (via snapshot or carried `line_items.approval_status`).
- Applied Design comment carried to R7 BOQ and remapped to the new Pump item id; draft comment dropped.
- Per-item verdicts identical across all four helper call sites (snapshot is the single source of truth).
- Running the helper batch twice returns deeply-equal results (no stateful drift).
- No writes occur during read path: spy on the fake `from(...).update/insert` and assert zero calls during the refresh/navigation phase.

### 3. `src/test/approvalSyncCrossModuleConsistency.test.ts`
Covers: **Same revision viewed from OA, BOQ, Design, Manufacturing, Purchase, BOQ Folder.**

Flow:
1. Seed R7 state from test 2 (or reseed equivalently).
2. For each "view", call exactly the helper(s) that page uses today:
   - OA editor → `fetchRevisionApprovalSnapshots` + line-item match (mirrors `OrderEditor.tsx`).
   - Design BOQ list → `fetchDesignApprovalStates` (mirrors `DesignBoqList.tsx`).
   - Manufacturing → `fetchDesignApprovalStates` + `fetchItemApprovalVerdicts` (mirrors `ApprovedBoqModule.tsx`).
   - Purchase BOQ Folder → `fetchDesignApprovalStates` (mirrors `BoqFolder.tsx`).
3. Assert every view reports the same per-item verdict map and the same BOQ-level badge string.

## Test infrastructure

- Reuse the in-memory `tables` + `buildQuery` fake from `oaRevisionE2E.test.ts`. Extract it into `src/test/helpers/fakeSupabase.ts` **only if needed**; preferred path is copy-local per file to avoid creating a new shared module that future tests might couple to. Decision: copy-local — keeps zero impact on existing files.
- Mock `@/lib/boq/pdf` the same way as `oaRevisionE2E.test.ts` to avoid jspdf in jsdom.
- No new dependencies.

## Verification

- Run `bunx vitest run src/test/initialOaBoqApprovalSync.test.ts src/test/revisedOaBoqApprovalInheritance.test.ts src/test/approvalSyncCrossModuleConsistency.test.ts`.
- Run full suite to confirm no regressions: `bunx vitest run`.
- Confirm zero diffs in `src/lib`, `src/pages`, `src/components`, `supabase/`.

## Out of scope

- No production code changes.
- No new migrations or backfills.
- No UI changes.
- No edits to existing tests (they already pass and document current behavior).
