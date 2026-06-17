## Goals
1. Make the new bulk button able to "Remove All Approvals" even after the BOQ is already Design-approved.
2. Guarantee that Design comments on Motor, Motor Qty, Remarks (and Model) always show on the OA editor — never hidden behind the "Show Model, Motor, Remarks & Approval" toggle.

## Issue 1 — Cannot Remove All Approvals after design-approved

Current logic in `src/pages/design/DesignBoqView.tsx`:

```
disabled={items.length === 0 || bulking || approvalsDisabled || designApproved}
```

`approvalsDisabled` (= `alreadySubmitted`) and `designApproved` block the button entirely — so once the BOQ has been Design-approved or comments have been submitted, the user has no way to clear per-item approvals in one click.

### Fix
Split the disabled rule by direction:

- When the button label is **"Approve All"** (i.e. `!allApproved`) → keep `disabled` as today: `items.length === 0 || bulking || approvalsDisabled || designApproved`. We don't want bulk-approving while the BOQ is locked / already approved at the BOQ level.
- When the button label is **"Remove All Approvals"** (i.e. `allApproved`) → only `disabled` on `items.length === 0 || bulking`. Per-item approvals are write-able regardless of the BOQ-level `design_review_status`, so removing them is always safe.

No change to the BOQ-level `design_review_status`. We do not call `Unapprove` — that flow stays exactly as-is on its own button. Only per-row `boq_item_design_status` + the `boqs.line_items[].approval_status` mirror are toggled to `pending`, identical to the existing per-row checkbox path.

## Issue 2 — Motor / Motor Qty / Remarks Design comments not visible on OA

In `src/pages/orders/OrderEditor.tsx`, the inputs for Model, Motor, Motor Qty, Remarks (and their `<OaCellDesignComment>` children) render only when `showItemExtras === true`. There is a one-shot auto-reveal:

```
useEffect(() => {
  if (showItemExtras) return;                // ← bug: latches off after user toggle
  if (hasExtrasComment) setShowItemExtras(true);
}, [designCellComments, showItemExtras]);
```

Problem: once the user manually clicks "Hide Model, Motor, Remarks & Approval", `showItemExtras` becomes `false` but the effect's early `return` prevents it from re-opening — so the Motor / Motor Qty / Remarks comments disappear from the editable cells. The DB query, mapping, and `column_key` values are all correct (verified — Motor comments exist with `column_key='motor'` for the current BOQ), so the visibility toggle is the only thing in the way.

### Fix
Force-open the extras section whenever any extras-field Design comment exists, regardless of past user toggling. Two small edits inside `OrderEditor.tsx`:

1. Remove the `if (showItemExtras) return;` early return in the auto-reveal effect. Always evaluate `hasExtrasComment` and call `setShowItemExtras(true)` when true. (If already true, the set is a no-op.)
2. Disable the manual Hide button (the toggle around lines 1112-1116) while extras-comments exist, with a tooltip-style title attribute "Hidden while Design has comments on Motor, Motor Qty, Remarks, or Model". Allow toggling off only when no extras comments are present. Keep the Show side fully clickable.

These two together ensure:
- Comments on Motor, Motor Qty, Remarks, Model are always rendered next to their actual editable input on OA.
- The existing Apply button on each `<OaCellDesignComment>` continues to work (already wired for all 7 columns).
- The red-bold cell highlight on changed/commented cells continues to work (already wired).

No change to the existing fallback block under the Description column (lines 1171-1185) — it remains as a safety net and never causes harm when extras is open (it's gated by `!showItemExtras`).

## Strictly out of scope
- No change to the Design page comment write path, per-row checkbox, badges, comment auto-save, auto-clear-approval-on-edit, auto-unapprove-on-edit, Post Submit, Approve Revised BOQ, the existing BOQ-level Unapprove button, or `bulkSetItemApprovals` / `syncApprovalToBoqSnapshot` internals.
- No DB migration, no RLS change, no `boq_design_comments` schema change, no edit to `OaCellDesignComment`, no edit to `itemApprovals.ts`, no edit to `comments.ts`.
- No change to OA totals, charges, saved payload, PDF/print/Excel, notifications, acknowledgement, revised logic, auto-BOQ, Manufacturing, Purchase, Cost Sheet, or any other department screen.
- No new column rendered on OA. Description, HSN, Qty, Model, Motor, Motor Qty, Remarks, Rate, Amount already exist and already read `cellComment(it.id, <key>)` for the seven keys the Design page writes.

## Files
- `src/pages/design/DesignBoqView.tsx` — split the bulk-toggle button's `disabled` rule by direction.
- `src/pages/orders/OrderEditor.tsx` — drop the early return in the extras auto-reveal effect; disable the Hide toggle while extras-comments exist.
