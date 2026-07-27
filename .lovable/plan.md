## Goal
On the Manufacturing list, each BOQ card should show at a glance whether a Requisition already exists for that BOQ.

## What I'll change
Only `src/pages/modules/ApprovedBoqModule.tsx` (the shared list used by Manufacturing; Purchase uses the same component and will show the same indicator).

1. In `ApprovedBoqListPage`, after the BOQ/orders load, fetch requisitions once:
   `supabase.from("requisitions").select("id, boq_id, requisition_number, created_at")`.
2. Build a count map keyed by BOQ family. The list collapses each family to its latest revision, so requisitions created against an earlier revision must still count: map every requisition's `boq_id` to its family (via the existing `buildOrderRootMap` / BOQ-number family helper already used for grouping) and aggregate.
3. On the card header row, next to the existing Approved / Not Approved by Design badge, render:
   - `Requisition Created` (green outline badge, with count when > 1) if the family has one or more requisitions;
   - `No Requisition` (muted secondary badge) otherwise.
4. Keep card layout otherwise identical; the badge is display-only.

## Not changed
No changes to requisition creation, approval logic, revision/family grouping rules, permissions, RLS, numbering, or the BOQ detail page.

## Note
The badge reads existing `requisitions` rows under current RLS — a user who cannot read requisitions will see "No Requisition". If Manufacturing users should always see the status, tell me and I'll add a read policy in a follow-up.
