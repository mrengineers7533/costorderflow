
## Scope guard (confirmed)

This change is read-only and additive. Existing OA, BOQ, Design, Manufacturing, Purchase, costing, numbering, Save Draft, Finalize, Convert to PI, access, and UI flows are NOT modified. The previously-shipped carry-forward in `src/lib/revisions/index.ts` and the snapshot triggers/functions in migration `20260627071535_*.sql` stay exactly as they are — this task only adds a diagnostic view on top of them.

## What will be touched and why

Added (new files only):

- `src/pages/admin/RevisionRepairReport.tsx` — new admin page, read-only table + summary.
- `src/lib/boq/revisionRepairReport.ts` — new helper that runs SELECT-only queries against existing tables (`orders`, `boqs`, `boq_revision_approval_snapshots`, `boq_item_design_status`) and classifies each revision.
- `src/App.tsx` — add ONE new `<Route path="/admin/revision-repair" …>` line under the existing admin routes. No other route/logic changes.
- `src/pages/admin/AdminDashboard.tsx` — add ONE link/card pointing to the new page. No other UI changes.
- `src/test/revisionRepairReport.test.ts` — unit test for the classification helper.

Not touched: `src/lib/revisions/index.ts`, `src/lib/boq/approvalSnapshots.ts`, `src/lib/boq/designApprovalStatus.ts`, `src/lib/boq/itemApprovalSync.ts`, OrderEditor, BoqEditor, Design/Manufacturing/Purchase pages, numbering counters, calc helpers, PDF/Excel, access rules, RLS, triggers, edge functions.

No new migration. No DB writes. No new RPC. No schema change. Existing `boq_revision_approval_snapshots` rows are read as-is; opening the report does NOT call `repair_inherited_boq_approval_snapshots()` or any refresh function.

## Page behavior

Route: `/admin/revision-repair` (wrapped in existing `RequireAdmin`).

Filters (client-side only):
- Family: All / GMS / MR
- Status: All / Needs repair / Repaired-inherited / Native-approved / Genuinely not approved
- OA number search

For each OA revision (joined to its linked BOQ revision) the helper computes one of:

| Status | Definition |
| --- | --- |
| `native_approved` | Snapshot rows exist for this revision and all are `approved`, and at least one approval row was written directly against this revision (not inherited). |
| `repaired_inherited` | Snapshot rows exist, all are `approved`, but no direct `boq_item_design_status` rows for this revision — approval came from an ancestor via the repair/carry-forward. This is the "verified repaired" case. |
| `needs_repair` | An ancestor revision in the same OA family is approved (snapshot or direct rows), but this revision's snapshot is missing rows, partially populated, or all `not_approved`/blank. Surfaces the bug condition. |
| `not_approved_by_design` | No ancestor is approved either; this is a legitimately pending revision, not a repair candidate. |

Each row shows: OA no., revision, linked BOQ no./revision, item counts (approved/total), latest approval source (direct vs inherited), and a "View OA" / "View BOQ" link to the existing pages. Top of page shows totals per status.

The page is purely diagnostic. It does NOT call any repair RPC, mutation, or refresh — the existing automatic triggers and the carry-forward inside `reviseOrder` continue to be the only writers.

## Acceptance check

- Load `/admin/revision-repair` and confirm `MROA/2026-27/0001/R2`, `MROA/2026-27/0007/R6`, `MROA/2026-27/0007/R7`, and `GMS/2026-27/0002/R9` show as `repaired_inherited` or `native_approved` (not `needs_repair`).
- Confirm no DB writes during page load (verify via network tab — only `SELECT` queries).
- Existing OA/BOQ/Design/Manufacturing/Purchase pages render unchanged.
- New unit test passes; existing tests (`oaRevisionE2E`, `approvalBadgesE2E`, `inheritedDesignApprovalConsistency`) still pass.
