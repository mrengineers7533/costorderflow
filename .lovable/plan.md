## Goal

Show only the latest BOQ per OA family in the Design list, and add a Revision History panel inside the Design BOQ view so old versions are reachable from there. Other module BOQ landing pages already collapse to latest per family.

No DB changes, no edits to OA/BOQ revise logic, calc, PI, purchase, manufacturing, requisition, or annexure workflow.

## Current state (verified)

- **`BoqList`** (BOQs page) already shows only `is_current=true` + has a "Show superseded revisions" toggle and a per-row revisions accordion. No change needed.
- **`ApprovedBoqModule`** (Purchase / Manufacturing / Requisition / Annexure landings) already groups by OA family and shows only the highest-revision BOQ. No change needed.
- **`purchase/BoqFolder`** already collapses to latest revision per family. No change needed.
- **`DesignBoqList`** currently fetches every BOQ row and lists each revision separately — needs collapsing.
- **`DesignBoqView`** has no Revision History panel — needs one.

## Frontend changes

### 1. `src/pages/design/DesignBoqList.tsx`
- Also fetch `order_id`, `created_at`, `parent_order_id` (via orders join) so we can build OA-family groups.
- Add a small helper (mirror `pickLatestApprovedPerFamily` from `ApprovedBoqModule`): group by OA root (`orders.parent_order_id || orders.id`), keep the row with the highest `revision`. Fallback to grouping by `order_id` when the order lookup is unavailable.
- Render only the latest BOQ per family. Show `R{revision}` badge next to `boq_number`.
- Add a "History" button on each row that opens an inline accordion (or links to the latest BOQ's design view with `?tab=history`) listing all sibling revisions with: Rev, BOQ number, date, status, View link → `/design/{revisionId}`.

### 2. `src/pages/design/DesignBoqView.tsx`
- Add a "Revision History" panel near the top (reuse the existing `BoqRevisionHistory` component — it already groups by OA family and lists every revision with View links).
- For each listed revision show: Rev number, BOQ number, date, prepared_by/department (from `boqs.prepared_by` / `boqs.updated_by_department` if present, else from latest `boq_revisions` row), status badge, related OA revision number (look up `orders.revision` by `boqs.source_order_id`), and a View button that navigates to `/design/{revisionId}`.
- Below the list, add an expandable "Changes" sub-row per revision that reads `boq_revisions.diff` (already populated by existing auto-revise) and shows: line item, field, old value → new value. No new schema; just render existing data.
- The currently viewed revision is highlighted; clicking another revision opens it in read-only mode (existing route already supports this).

### 3. (Optional, tiny) `BoqRevisionHistory` enhancement
Extend the existing component to optionally include the inline change-diff rows (reads `boq_revisions` for each BOQ id). Used by `DesignBoqView`. No behavior change for existing callers.

## Out of scope

- No changes to `BoqList`, `ApprovedBoqModule`, `purchase/BoqFolder`, requisitions, annexures, PI, purchase, manufacturing flows.
- No DB migration, no new tables, no changes to `is_current` / `revision` semantics or to auto-revise triggers.
- No edits to BOQ calc, PDF, verification, or notifications.

## Risk notes

- Collapsing in Design list is a pure UI filter — old revisions remain accessible only from the Revision History panel inside the latest BOQ view, exactly like the OA revision history.
- Family grouping reuses the proven logic from `ApprovedBoqModule.pickLatestApprovedPerFamily` so behavior matches the other modules.
