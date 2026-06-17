## Goal
Add one toggle button on the Design BOQ page (`/design/:id`) that lets the user approve every line item in a single click, or remove approval from every line item in a single click.

## Placement
Inside the existing "Line items" `Card`, in the `CardHeader`, on the right side opposite the existing title/subtext. The table, sticky bottom bar (Post Submit / Approve Revised BOQ / Unapprove), and per-row Approve checkboxes stay exactly as they are.

## Button behavior (single toggle)
The label flips based on current state:

- If every item already has `approvals[id].status === "approved"` and there is at least one item → label is **"Remove All Approvals"**, clicking sets every item to `pending`.
- Otherwise → label is **"Approve All"**, clicking sets every item to `approved`.

Important data-model note: the existing per-row Design approval state for this page only supports `approved` / `pending` (see `ItemApprovalStatus` in `src/lib/design/itemApprovals.ts` and the per-row Checkbox in `DesignBoqView.tsx`). "Remove All Approvals" therefore resets each item back to `pending` — the same state a freshly opened, untouched item has, and the same state the per-row checkbox produces when unchecked. This matches the existing meaning of "unapproved" on this page; no schema or status enum changes.

## Disabled / hidden rules
- Disabled when `items.length === 0`.
- Disabled while the action is in flight (local `bulking` state).
- Disabled when `approvalsDisabled` is true (i.e. `alreadySubmitted` — same rule the per-row checkbox already uses) so we don't fight the "Changes Requested — awaiting OA revision" lock.
- Disabled while `designApproved` is true (the BOQ has already been Design-approved as a whole). Unapproving in that state must keep going through the existing "Unapprove" button so the BOQ-level `design_review_status` is reset properly — we do not duplicate that flow here.

## Click handler
New `async function bulkToggleAllApprovals()` inside `DesignBoqView`:

1. Guard on `!boq || items.length === 0`.
2. Compute `next: "approved" | "pending"` from the current "all approved?" check.
3. Confirm with `window.confirm(...)` — "Approve all N items?" or "Remove approval from all N items?".
4. `setBulking(true)`.
5. Optimistically update local `approvals` for every item id to `next` (preserving existing `decided_by_name` / `decided_at` for display).
6. `await bulkSetItemApprovals(boq.id, items.map(i => i.id), boq.revision ?? 0, next)` — already exists.
7. `await syncApprovalToBoqSnapshot(boq.id, items.map(i => i.id), next)` — already exists, keeps the OA "Approved by Design" column in sync (consistent with the per-row toggle and `handleApprove`).
8. Re-fetch with `fetchItemApprovals(boq.id, boq.revision ?? 0)` and `setApprovals(map)` so server-truth (decider name, timestamp) replaces the optimistic values.
9. On error: revert to the previous `approvals` snapshot and `toast` an error.
10. `setBulking(false)`.

## Strictly out of scope
- No change to per-row checkbox, badges, comment textareas, red/bold highlight, "auto-clear approval on comment edit" behavior, auto-unapprove-on-edit of a Design-approved BOQ, Post Submit, Approve Revised BOQ, Unapprove, comments fetch/save, BOQ revision history, OA editor, OA snapshot read path, Manufacturing/Purchase, notifications, PDFs, Excel exports, RLS, or any other department screen.
- No DB migration. No edit to `itemApprovals.ts` (the existing `bulkSetItemApprovals` and `syncApprovalToBoqSnapshot` already do exactly what we need).
- No change to `DesignStatusCell` (separate component, not used in this page's row UI).

## Files
- `src/pages/design/DesignBoqView.tsx` — add `bulking` state, the `bulkToggleAllApprovals` handler, and render the button in the `Line items` `CardHeader`.
