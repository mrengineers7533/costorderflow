## Issue
The "Approve All / Remove All Approvals" bulk button on the Design BOQ page is sometimes disabled when the user expects to click it. Specifically: once the BOQ has been Design-approved or comments are in the "changes_requested" state, the **Approve All** side of the toggle is disabled, so after a user clicks "Remove All Approvals" they cannot re-approve everything in one click without going back row-by-row.

## Fix
Relax the bulk button's `disabled` rule in `src/pages/design/DesignBoqView.tsx` to only block while truly impossible:

```
disabled={items.length === 0 || bulking}
```

That removes the `approvalsDisabled` (= `alreadySubmitted` / `changes_requested`) and `designApproved` gates from the button entirely, in both directions. Per-row writes through `bulkSetItemApprovals` and `syncApprovalToBoqSnapshot` already succeed regardless of the BOQ-level `design_review_status` (verified — most recent per-row pending writes succeeded on a `changes_requested` BOQ at 13:41 UTC), so the gate was UI-only and was the cause of the unresponsive button.

This does not change any other behavior:
- Per-row Approve checkbox keeps its existing `disabled={approvalsDisabled || savingApprovalId === it.id}` rule (unchanged).
- The BOQ-level **Approve Revised BOQ** and **Unapprove** buttons keep their existing rules (unchanged).
- The auto-clear-approval-on-comment and auto-unapprove-on-edit flows are untouched.

## Out of scope
No change to per-row approval logic, comment write path, OA editor, OA snapshot mirror, RLS, schema, notifications, PDFs, Manufacturing, Purchase, or any other screen. No change to `Badge` / `DesignStatusCell` / `itemApprovals.ts`. The "Function components cannot be given refs" console warning from `Badge` inside `TooltipTrigger asChild` is cosmetic only, does not break the click, and is not addressed here.

## Files
- `src/pages/design/DesignBoqView.tsx` — one line: the bulk button's `disabled` prop.
